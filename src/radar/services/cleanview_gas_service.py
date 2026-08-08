"""Evidence-preserving ingestion for the Cleanview gas-plant project snapshot.

Each source URL remains the project key.  This intentionally preserves separate unit
records (for example, COYA1/COYA2/COYA3) instead of silently collapsing them into a
single plant merely because their names and locations match.
"""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from radar.data.models import IngestionRun, Project, ProjectEvent, Signal, SourceDocument
from radar.intelligence.stage_rules import infer_stage
from radar.services.ingestion_service import _content_hash, _nullable_float, _nullable_string, refresh_match_candidates

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_GAS_SOURCE_CSV = PROJECT_ROOT / "cleanview_gas_plants.csv"
PARSER_VERSION = "cleanview-gas-csv-1.0"
SOURCE_NAME = "Cleanview Gas Plants"


def _source_key(row: dict[str, object]) -> str:
    """Keep the Cleanview URL/INR key, falling back to a stable plant-and-location key."""
    source_url = _nullable_string(row.get("source_url"))
    if source_url:
        return source_url
    return "|".join(
        [
            _nullable_string(row.get("plant_name")) or "unnamed-gas-plant",
            _nullable_string(row.get("county")) or "unknown-county",
            str(_nullable_float(row.get("capacity_MW")) or "unknown-mw"),
        ]
    )


def _expected_online(value: object) -> str | None:
    text = _nullable_string(value)
    return text if text else None


def ingest_cleanview_gas_plants(
    session: Session,
    csv_path: Path = DEFAULT_GAS_SOURCE_CSV,
) -> IngestionRun:
    """Load gas-plant planning evidence and produce events without overstating maturity."""
    if not csv_path.exists():
        raise FileNotFoundError(f"Gas-plant snapshot not found: {csv_path}")

    snapshot_bytes = csv_path.read_bytes()
    run = IngestionRun(
        source=SOURCE_NAME,
        status="running",
        artifact_hash=hashlib.sha256(snapshot_bytes).hexdigest(),
        message=f"Importing repository snapshot {csv_path.name}",
    )
    session.add(run)
    session.flush()

    frame = pd.read_csv(csv_path)
    required_columns = {
        "plant_name", "county", "capacity_MW", "status", "technology_fuel",
        "expected_online", "latitude", "longitude", "source_url",
    }
    missing = required_columns - set(frame.columns)
    if missing:
        raise ValueError(f"Gas-plant snapshot missing required columns: {sorted(missing)}")

    changed = 0
    retrieved_at = datetime.now(UTC)
    for raw_row in frame.to_dict(orient="records"):
        plant_name = _nullable_string(raw_row.get("plant_name"))
        if not plant_name:
            continue

        source_key = _source_key(raw_row)
        source_stage = _nullable_string(raw_row.get("status")) or "Unknown"
        technology = _nullable_string(raw_row.get("technology_fuel")) or "Natural Gas"
        assessment = infer_stage(source_stage)
        content_hash = _content_hash(raw_row)
        expected_online = _expected_online(raw_row.get("expected_online"))
        source_url = _nullable_string(raw_row.get("source_url"))

        project = session.scalar(select(Project).where(Project.source_project_key == source_key))
        previous_stage = project.radar_stage if project else None
        previous_confidence = project.stage_confidence if project else 0.0
        if project is None:
            project = Project(source_project_key=source_key, project_name=plant_name)
            session.add(project)
            session.flush()

        project.project_name = plant_name
        project.developer = _nullable_string(raw_row.get("owner_developer"))
        project.city = _nullable_string(raw_row.get("city"))
        project.county = _nullable_string(raw_row.get("county"))
        project.latitude = _nullable_float(raw_row.get("latitude"))
        project.longitude = _nullable_float(raw_row.get("longitude"))
        project.estimated_mw = _nullable_float(raw_row.get("capacity_MW"))
        project.power_type = technology
        project.source_stage = source_stage
        project.radar_stage = assessment.stage
        project.stage_confidence = assessment.confidence
        project.ercot_status = None
        project.permit_status = None
        project.latest_signal = (
            f"{source_stage} gas capacity"
            + (f" · expected online {expected_online}" if expected_online else "")
        )
        project.source = SOURCE_NAME
        project.source_url = source_url
        # The source does not provide a source-publication date.  Retain the retrieval
        # moment here and the original expected-online date in the raw evidence payload.
        project.source_updated_at = retrieved_at
        session.flush()

        document = session.scalar(
            select(SourceDocument).where(
                SourceDocument.source == SOURCE_NAME,
                SourceDocument.content_hash == content_hash,
            )
        )
        if document is not None:
            continue

        document = SourceDocument(
            project_id=project.id,
            source=SOURCE_NAME,
            source_url=source_url,
            published_at=None,
            retrieved_at=retrieved_at,
            content_hash=content_hash,
            parser_version=PARSER_VERSION,
            raw_payload={key: (None if pd.isna(value) else value) for key, value in raw_row.items()},
        )
        session.add(document)
        session.flush()
        signal = Signal(
            project_id=project.id,
            source_document_id=document.id,
            signal_type="planned_gas_capacity_snapshot",
            signal_text=project.latest_signal or f"{SOURCE_NAME} status: {source_stage}",
            occurred_at=retrieved_at,
            confidence=assessment.confidence,
            metadata_json={
                "source_stage": source_stage,
                "radar_stage": assessment.stage,
                "rationale": assessment.rationale,
                "technology_fuel": technology,
                "expected_online": expected_online,
            },
        )
        session.add(signal)

        if previous_stage is None:
            event_type = "baseline_loaded"
            title = f"Baseline gas-capacity signal: {plant_name} is {assessment.stage}"
        elif previous_stage != assessment.stage:
            event_type = "stage_changed"
            title = f"Gas-capacity stage changed: {previous_stage} → {assessment.stage}"
        else:
            event_type = "evidence_added"
            title = f"New gas-capacity evidence: {plant_name}"

        session.add(
            ProjectEvent(
                project_id=project.id,
                event_type=event_type,
                title=title,
                detail=assessment.rationale,
                before_value=previous_stage,
                after_value=assessment.stage,
                confidence_delta=round(assessment.confidence - previous_confidence, 2),
                occurred_at=retrieved_at,
                source_document_id=document.id,
            )
        )
        changed += 1

    refresh_match_candidates(session)
    run.status = "success"
    run.completed_at = datetime.now(UTC)
    run.records_seen = len(frame)
    run.records_changed = changed
    run.message = f"Processed {len(frame)} gas-plant records; created {changed} new evidence events."
    return run
