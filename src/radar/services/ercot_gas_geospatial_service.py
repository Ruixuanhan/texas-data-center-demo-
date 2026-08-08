"""Supplemental geospatial evidence for the ERCOT July 2026 gas-project subset.

The committed CSV is a 130-record gas subset of the ERCOT GIS workbook with
coordinates and projected COD values.  Rows are joined only on an exact normalized
``project_name + county + capacity`` signature.  This avoids fuzzy automatic merges
and enriches the already canonical ERCOT GIS project rather than rendering a second
marker for the same generator-interconnection record.
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from radar.data.models import IngestionRun, Project, ProjectEvent, Signal, SourceDocument
from radar.intelligence.stage_rules import infer_ercot_stage
from radar.services.ercot_gis_service import ERCOT_PRODUCT_URL, WORKBOOK_AS_OF

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_ERCOT_GAS_CSV = PROJECT_ROOT / "data" / "real" / "ercot_gis_gas_projects_july_2026.csv"
ERCOT_GAS_SOURCE = "ERCOT GIS Gas Projects"
PARSER_VERSION = "ercot-gis-gas-geospatial-csv-1.0"


def _text(value: object) -> str | None:
    if value is None or pd.isna(value):
        return None
    text = str(value).strip()
    return text or None


def _float(value: object) -> float | None:
    if value is None or pd.isna(value):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _identity_text(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())


def _identity_capacity(value: object) -> float | None:
    parsed = _float(value)
    return round(parsed, 1) if parsed is not None else None


def _signature(project_name: object, county: object, capacity: object) -> tuple[str, str, float | None]:
    return (
        _identity_text(project_name),
        _identity_text(county).replace("county", ""),
        _identity_capacity(capacity),
    )


def _row_hash(payload: dict[str, Any]) -> str:
    normalized = {key: (None if pd.isna(value) else value) for key, value in payload.items()}
    return hashlib.sha256(json.dumps(normalized, sort_keys=True, default=str).encode("utf-8")).hexdigest()


def load_ercot_gas_geospatial_records(csv_path: Path = DEFAULT_ERCOT_GAS_CSV) -> list[dict[str, Any]]:
    """Load the versioned gas subset while validating its deterministic-join fields."""
    if not csv_path.exists():
        raise FileNotFoundError(f"ERCOT gas geospatial snapshot not found: {csv_path}")
    frame = pd.read_csv(csv_path)
    required = {
        "project_name",
        "county",
        "Fuel",
        "Capacity (MW)",
        "latitude",
        "longitude",
        "GIM Study Phase",
        "Interconnecting Entity",
        "Projected COD",
    }
    missing = required - set(frame.columns)
    if missing:
        raise ValueError(f"ERCOT gas geospatial snapshot missing required columns: {sorted(missing)}")
    return frame.to_dict(orient="records")


def ingest_ercot_gas_geospatial(
    session: Session,
    csv_path: Path = DEFAULT_ERCOT_GAS_CSV,
) -> IngestionRun:
    """Attach gas-subset coordinates and evidence to exact ERCOT GIS project matches.

    The input cannot create a canonical match by name similarity.  A row with zero or
    multiple exact candidates is counted in the health run but receives no project
    evidence, making any data-quality gap observable rather than silently guessed.
    """
    snapshot_bytes = csv_path.read_bytes()
    run = IngestionRun(
        source=ERCOT_GAS_SOURCE,
        status="running",
        artifact_hash=hashlib.sha256(snapshot_bytes).hexdigest(),
        message=f"Importing exact-match gas geospatial evidence from {csv_path.name}",
    )
    session.add(run)
    session.flush()

    records = load_ercot_gas_geospatial_records(csv_path)
    gis_projects = list(session.scalars(select(Project).where(Project.source == "ERCOT GIS")).all())
    index: dict[tuple[str, str, float | None], list[Project]] = {}
    for project in gis_projects:
        index.setdefault(_signature(project.project_name, project.county, project.estimated_mw), []).append(project)

    changed = 0
    unmatched = 0
    ambiguous = 0
    retrieved_at = datetime.now(UTC)
    for raw_row in records:
        candidates = index.get(_signature(raw_row.get("project_name"), raw_row.get("county"), raw_row.get("Capacity (MW)")), [])
        if len(candidates) == 0:
            unmatched += 1
            continue
        if len(candidates) > 1:
            ambiguous += 1
            continue

        project = candidates[0]
        study_phase = _text(raw_row.get("GIM Study Phase"))
        assessment = infer_ercot_stage(study_phase=study_phase, ia_signed=None, synchronization_date=None)
        content_hash = _row_hash(raw_row)
        document = session.scalar(
            select(SourceDocument).where(
                SourceDocument.source == ERCOT_GAS_SOURCE,
                SourceDocument.content_hash == content_hash,
            )
        )
        if document is not None:
            continue

        latitude = _float(raw_row.get("latitude"))
        longitude = _float(raw_row.get("longitude"))
        if project.latitude is None and latitude is not None:
            project.latitude = latitude
        if project.longitude is None and longitude is not None:
            project.longitude = longitude
        projected_cod = _text(raw_row.get("Projected COD"))
        project.latest_signal = (
            f"ERCOT GIS gas supplement: {project.estimated_mw or _float(raw_row.get('Capacity (MW)')) or 'Unknown'} MW"
            + (f" · projected COD {projected_cod}" if projected_cod else "")
            + f" · {assessment.stage} evidence"
        )
        session.flush()

        document = SourceDocument(
            project_id=project.id,
            source=ERCOT_GAS_SOURCE,
            source_url=ERCOT_PRODUCT_URL,
            published_at=WORKBOOK_AS_OF,
            retrieved_at=retrieved_at,
            content_hash=content_hash,
            parser_version=PARSER_VERSION,
            raw_payload={
                **{key: (None if pd.isna(value) else value) for key, value in raw_row.items()},
                "matched_source_project_key": project.source_project_key,
                "match_method": "exact_normalized_name_county_capacity",
            },
        )
        session.add(document)
        session.flush()
        session.add(
            Signal(
                project_id=project.id,
                source_document_id=document.id,
                signal_type="ercot_gis_gas_geospatial_enrichment",
                signal_text=project.latest_signal,
                occurred_at=WORKBOOK_AS_OF,
                confidence=assessment.confidence,
                metadata_json={
                    "radar_stage": assessment.stage,
                    "rationale": assessment.rationale,
                    "study_phase": study_phase,
                    "projected_cod": projected_cod,
                    "match_method": "exact_normalized_name_county_capacity",
                },
            )
        )
        session.add(
            ProjectEvent(
                project_id=project.id,
                event_type="evidence_added",
                title=f"ERCOT gas mapping evidence: {project.project_name}",
                detail=(
                    "Exact name, county, and capacity match attached ERCOT gas-subset coordinates and projected-COD evidence. "
                    f"{assessment.rationale}"
                ),
                before_value=project.radar_stage,
                after_value=project.radar_stage,
                confidence_delta=0.0,
                occurred_at=WORKBOOK_AS_OF,
                source_document_id=document.id,
            )
        )
        changed += 1

    run.status = "success" if unmatched == 0 and ambiguous == 0 else "partial_success"
    run.completed_at = datetime.now(UTC)
    run.records_seen = len(records)
    run.records_changed = changed
    run.message = (
        f"Processed {len(records)} ERCOT gas rows; attached {changed} exact-match evidence records; "
        f"unmatched={unmatched}; ambiguous={ambiguous}."
    )
    return run
