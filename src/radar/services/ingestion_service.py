"""Idempotent ingestion from the repository's existing Cleanview-derived CSV snapshot."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from radar.data.models import IngestionRun, MatchCandidate, Project, ProjectEvent, Signal, SourceDocument
from radar.intelligence.entity_resolution import generate_candidates
from radar.intelligence.stage_rules import infer_stage


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_SOURCE_CSV = PROJECT_ROOT / "texas_datacenter_projects.csv"
PARSER_VERSION = "cleanview-csv-1.0"


def _nullable_string(value: object) -> str | None:
    if value is None or pd.isna(value):
        return None
    text = str(value).strip()
    return text or None


def _nullable_float(value: object) -> float | None:
    if value is None or pd.isna(value):
        return None
    return float(value)


def _parse_date(value: object) -> datetime:
    parsed = pd.to_datetime(value, errors="coerce")
    if pd.isna(parsed):
        return datetime.now(UTC)
    return parsed.to_pydatetime()


def _source_key(row: dict[str, object]) -> str:
    url = _nullable_string(row.get("source_url"))
    if url:
        return url
    return "|".join(
        [
            _nullable_string(row.get("project_name")) or "unnamed",
            _nullable_string(row.get("developer")) or "unknown-developer",
            _nullable_string(row.get("county")) or "unknown-county",
        ]
    )


def _content_hash(row: dict[str, object]) -> str:
    stable_payload = {key: (None if pd.isna(value) else value) for key, value in row.items()}
    encoded = json.dumps(stable_payload, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def ingest_cleanview_snapshot(session: Session, csv_path: Path = DEFAULT_SOURCE_CSV) -> IngestionRun:
    """Load a CSV snapshot, retain its evidence, and emit only material project events."""
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV snapshot not found: {csv_path}")

    snapshot_bytes = csv_path.read_bytes()
    run = IngestionRun(
        source="Cleanview",
        status="running",
        artifact_hash=hashlib.sha256(snapshot_bytes).hexdigest(),
        message=f"Importing repository snapshot {csv_path.name}",
    )
    session.add(run)
    session.flush()

    frame = pd.read_csv(csv_path)
    required_columns = {"project_name", "stage", "source_url", "last_updated"}
    missing_columns = required_columns - set(frame.columns)
    if missing_columns:
        raise ValueError(f"Source snapshot missing required columns: {sorted(missing_columns)}")

    changed = 0
    for raw_row in frame.to_dict(orient="records"):
        project_name = _nullable_string(raw_row.get("project_name"))
        if not project_name:
            continue

        source_key = _source_key(raw_row)
        source_stage = _nullable_string(raw_row.get("stage")) or "Unknown"
        assessment = infer_stage(source_stage)
        published_at = _parse_date(raw_row.get("last_updated"))
        content_hash = _content_hash(raw_row)

        project = session.scalar(select(Project).where(Project.source_project_key == source_key))
        previous_stage = project.radar_stage if project else None
        previous_confidence = project.stage_confidence if project else 0.0

        if project is None:
            project = Project(source_project_key=source_key, project_name=project_name)
            session.add(project)
            session.flush()

        project.project_name = project_name
        project.developer = _nullable_string(raw_row.get("developer"))
        project.city = _nullable_string(raw_row.get("city"))
        project.county = _nullable_string(raw_row.get("county"))
        project.latitude = _nullable_float(raw_row.get("latitude"))
        project.longitude = _nullable_float(raw_row.get("longitude"))
        project.estimated_mw = _nullable_float(raw_row.get("estimated_mw"))
        project.power_type = _nullable_string(raw_row.get("power_type")) or "Unknown"
        project.source_stage = source_stage
        project.radar_stage = assessment.stage
        project.stage_confidence = assessment.confidence
        project.ercot_status = _nullable_string(raw_row.get("ercot_status"))
        project.permit_status = _nullable_string(raw_row.get("permit_status"))
        project.latest_signal = _nullable_string(raw_row.get("latest_signal"))
        project.source = _nullable_string(raw_row.get("source")) or "Cleanview"
        project.source_url = _nullable_string(raw_row.get("source_url"))
        project.source_updated_at = published_at
        session.flush()

        document = session.scalar(
            select(SourceDocument).where(
                SourceDocument.source == project.source,
                SourceDocument.content_hash == content_hash,
            )
        )
        if document is None:
            document = SourceDocument(
                project_id=project.id,
                source=project.source,
                source_url=project.source_url,
                published_at=published_at,
                content_hash=content_hash,
                parser_version=PARSER_VERSION,
                raw_payload={key: (None if pd.isna(value) else value) for key, value in raw_row.items()},
            )
            session.add(document)
            session.flush()
            signal = Signal(
                project_id=project.id,
                source_document_id=document.id,
                signal_type="source_status_snapshot",
                signal_text=project.latest_signal or f"{project.source} status: {source_stage}",
                occurred_at=published_at,
                confidence=assessment.confidence,
                metadata_json={"source_stage": source_stage, "radar_stage": assessment.stage, "rationale": assessment.rationale},
            )
            session.add(signal)

            if previous_stage is None:
                title = f"Baseline signal: {project_name} is {assessment.stage}"
                detail = assessment.rationale
                event_type = "baseline_loaded"
            elif previous_stage != assessment.stage:
                title = f"Stage changed: {previous_stage} → {assessment.stage}"
                detail = assessment.rationale
                event_type = "stage_changed"
            else:
                title = f"New source evidence: {project_name}"
                detail = assessment.rationale
                event_type = "evidence_added"

            session.add(
                ProjectEvent(
                    project_id=project.id,
                    event_type=event_type,
                    title=title,
                    detail=detail,
                    before_value=previous_stage,
                    after_value=assessment.stage,
                    confidence_delta=round(assessment.confidence - previous_confidence, 2),
                    occurred_at=published_at,
                    source_document_id=document.id,
                )
            )
            changed += 1

    projects = list(session.scalars(select(Project)).all())
    session.execute(delete(MatchCandidate))
    for candidate in generate_candidates(projects):
        session.add(
            MatchCandidate(
                left_project_id=candidate.left_project_id,
                right_project_id=candidate.right_project_id,
                total_score=candidate.total_score,
                decision=candidate.decision,
                explanation=candidate.explanation,
                feature_scores=candidate.feature_scores,
            )
        )

    run.status = "success"
    run.completed_at = datetime.now(UTC)
    run.records_seen = len(frame)
    run.records_changed = changed
    run.message = f"Processed {len(frame)} records; created {changed} new evidence events."
    return run
