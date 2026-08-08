"""Read-only API bridge between the Python Project Radar data layer and the web frontend.

The API deliberately projects existing evidence, events, and deterministic assessments into
frontend-friendly JSON. It does not invent a second source of truth or bypass the ingestion
and confidence rules in :mod:`radar.services`.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from radar.data.database import session_scope
from radar.data.models import IngestionRun, MatchCandidate, Project, ProjectEvent, SourceDocument
from radar.services.dashboard_service import ensure_bootstrapped
from radar.services.tceq_service import TCEQ_SOURCE_NAME, run_tceq_source_health_check

app = FastAPI(title="Project Radar API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

STAGE_KEYS = {
    "Concept": "concept",
    "FEL-1": "fel1",
    "FEL-2 / Pre-FEED": "fel2",
    "Interconnection Agreement": "ia",
    "FEED": "feed",
    "FID": "fid",
    "Construction": "construction",
    "COD": "cod",
    "Withdrawn": "canceled",
}
SOURCE_KEYS = {
    "Cleanview": "cleanview",
    "Cleanview Gas Plants": "cleanview",
    "ERCOT GIS": "ercot_gis",
    "ERCOT GIS Gas Projects": "ercot_gis",
    "TCEQ": "tceq",
    "PUCT": "puct",
    "FERC": "ferc",
}


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC).isoformat()
    return value.astimezone(UTC).isoformat()


def _stage_key(stage: str | None) -> str:
    return STAGE_KEYS.get(stage or "", "unknown")


def _source_key(source: str | None) -> str:
    return SOURCE_KEYS.get(source or "", "manual")


def _project_type(project: Project) -> str:
    if project.source == "Cleanview":
        return "data_center"
    if "gas" in (project.power_type or "").lower():
        return "gas_to_power"
    return "generation"


def _project_payload(project: Project) -> dict[str, Any]:
    return {
        "id": project.id,
        "slug": project.source_project_key,
        "name": project.project_name,
        "developer": project.developer,
        "city": project.city,
        "county": project.county,
        "lat": project.latitude,
        "lon": project.longitude,
        "capacity_mw": project.estimated_mw,
        "project_type": _project_type(project),
        "power_type": project.power_type,
        "current_stage": _stage_key(project.radar_stage),
        "stage_confidence": project.stage_confidence,
        "headline": project.latest_signal,
        "first_seen": _iso(project.ingested_at),
        "last_activity": _iso(project.source_updated_at or project.updated_at),
        "source": _source_key(project.source),
        "source_url": project.source_url,
        "source_project_key": project.source_project_key,
    }


def _event_payload(event: ProjectEvent, document: SourceDocument | None) -> dict[str, Any]:
    if event.event_type == "stage_changed":
        severity = "major"
    elif event.event_type == "baseline_loaded":
        severity = "notable"
    else:
        severity = "low"
    return {
        "id": event.id,
        "project_id": event.project_id,
        "source": _source_key(document.source if document else None),
        "event_type": event.event_type,
        "title": event.title,
        "summary": event.detail,
        "url": document.source_url if document else None,
        "severity": severity,
        "occurred_at": _iso(event.occurred_at),
        "ingested_at": _iso(event.occurred_at),
        "stage": _stage_key(event.after_value),
        "confidence_delta": event.confidence_delta,
    }


def _snapshot() -> dict[str, Any]:
    ensure_bootstrapped()
    with session_scope() as session:
        projects = list(session.scalars(select(Project).order_by(Project.project_name)).all())
        documents = {
            document.id: document
            for document in session.scalars(select(SourceDocument)).all()
        }
        events = list(
            session.scalars(
                select(ProjectEvent).order_by(ProjectEvent.occurred_at.desc()).limit(250)
            ).all()
        )
        candidates = list(
            session.scalars(
                select(MatchCandidate).order_by(MatchCandidate.total_score.desc()).limit(100)
            ).all()
        )
        runs = list(
            session.scalars(
                select(IngestionRun).order_by(IngestionRun.started_at.desc()).limit(20)
            ).all()
        )

        event_payloads = [_event_payload(event, documents.get(event.source_document_id)) for event in events]
        stage_history = [
            {
                "id": f"stage-{event.id}",
                "project_id": event.project_id,
                "stage": _stage_key(event.after_value),
                "confidence": next((project.stage_confidence for project in projects if project.id == event.project_id), 0.0),
                "rationale": event.detail,
                "evidence_event_ids": [event.id],
                "inferred_by": "rules",
                "inferred_at": _iso(event.occurred_at),
            }
            for event in events
            if event.after_value
        ]
        aliases = [
            {
                "id": f"source-key-{project.id}",
                "project_id": project.id,
                "alias": project.source_project_key,
                "alias_type": "queue_name" if project.source == "ERCOT GIS" else "other",
                "confidence": 1.0,
                "source": _source_key(project.source),
            }
            for project in projects
        ]
        return {
            "generated_at": _iso(datetime.now(UTC)),
            "projects": [_project_payload(project) for project in projects],
            "events": event_payloads,
            "stage_history": stage_history,
            "aliases": aliases,
            "match_candidates": [
                {
                    "id": candidate.id,
                    "left_project_id": candidate.left_project_id,
                    "right_project_id": candidate.right_project_id,
                    "score": candidate.total_score,
                    "decision": candidate.decision,
                    "explanation": candidate.explanation,
                    "features": candidate.feature_scores,
                }
                for candidate in candidates
            ],
            "ingestion_runs": [
                {
                    "id": run.id,
                    "source": _source_key(run.source),
                    "status": run.status,
                    "records_seen": run.records_seen,
                    "records_changed": run.records_changed,
                    "completed_at": _iso(run.completed_at),
                    "message": run.message,
                }
                for run in runs
            ],
        }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/v1/radar/snapshot")
def radar_snapshot() -> dict[str, Any]:
    return _snapshot()


@app.post("/api/v1/radar/sources/tceq/check")
def check_tceq_source() -> dict[str, Any]:
    """Run the explicit environmental-source availability check.

    This route records a source-health run. It intentionally does not create permit
    evidence until a documented result parser can attribute TCEQ rows to projects.
    """
    with session_scope() as session:
        run = run_tceq_source_health_check(session)
        return {
            "source": TCEQ_SOURCE_NAME,
            "status": run.status,
            "records_seen": run.records_seen,
            "records_changed": run.records_changed,
            "completed_at": _iso(run.completed_at),
            "message": run.message,
        }


@app.get("/api/v1/radar/projects/{project_id}")
def project_dossier(project_id: str) -> dict[str, Any]:
    snapshot = _snapshot()
    project = next((item for item in snapshot["projects"] if item["id"] == project_id), None)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return {
        "project": project,
        "events": [item for item in snapshot["events"] if item["project_id"] == project_id],
        "stage_history": [item for item in snapshot["stage_history"] if item["project_id"] == project_id],
        "aliases": [item for item in snapshot["aliases"] if item["project_id"] == project_id],
    }
