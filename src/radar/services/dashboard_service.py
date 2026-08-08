"""Read-side services for the Project Radar FastAPI evidence read model."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from radar.data.database import initialize_database, session_scope
from radar.data.models import IngestionRun, MatchCandidate, Project, ProjectEvent, Signal, SourceDocument
from radar.services.cleanview_gas_service import DEFAULT_GAS_SOURCE_CSV, SOURCE_NAME as CLEANVIEW_GAS_SOURCE, ingest_cleanview_gas_plants
from radar.services.ercot_gas_geospatial_service import DEFAULT_ERCOT_GAS_CSV, ERCOT_GAS_SOURCE, ingest_ercot_gas_geospatial
from radar.services.ercot_gis_service import DEFAULT_ERCOT_WORKBOOK, ingest_ercot_gis
from radar.services.ingestion_service import DEFAULT_SOURCE_CSV, ingest_cleanview_snapshot, refresh_match_candidates


PROJECT_ROOT = Path(__file__).resolve().parents[3]


def ensure_bootstrapped(
    csv_path: Path = DEFAULT_SOURCE_CSV,
    ercot_workbook_path: Path = DEFAULT_ERCOT_WORKBOOK,
    gas_csv_path: Path = DEFAULT_GAS_SOURCE_CSV,
    ercot_gas_geospatial_path: Path = DEFAULT_ERCOT_GAS_CSV,
) -> None:
    """Initialize the local database and load each committed source snapshot once."""
    initialize_database()
    with session_scope() as session:
        completed_sources = set(
            session.scalars(
                select(IngestionRun.source).where(IngestionRun.status == "success")
            ).all()
        )
        ingested_new_source = False
        if "Cleanview" not in completed_sources:
            ingest_cleanview_snapshot(session, csv_path)
            ingested_new_source = True
        if "ERCOT GIS" not in completed_sources:
            ingest_ercot_gis(session, ercot_workbook_path)
            ingested_new_source = True
        if CLEANVIEW_GAS_SOURCE not in completed_sources:
            ingest_cleanview_gas_plants(session, gas_csv_path)
            ingested_new_source = True
        if ERCOT_GAS_SOURCE not in completed_sources:
            ingest_ercot_gas_geospatial(session, ercot_gas_geospatial_path)
            ingested_new_source = True
        # Candidate rebuild is quadratic across project rows, so perform it only
        # after source bootstrap; explicit refreshes still rebuild it below.
        if ingested_new_source:
            refresh_match_candidates(session)


def refresh_snapshot(
    csv_path: Path = DEFAULT_SOURCE_CSV,
    ercot_workbook_path: Path = DEFAULT_ERCOT_WORKBOOK,
    gas_csv_path: Path = DEFAULT_GAS_SOURCE_CSV,
    ercot_gas_geospatial_path: Path = DEFAULT_ERCOT_GAS_CSV,
) -> dict[str, object]:
    """Run each committed source adapter and return combined user-facing health metadata."""
    initialize_database()
    with session_scope() as session:
        cleanview_run = ingest_cleanview_snapshot(session, csv_path)
        ercot_run = ingest_ercot_gis(session, ercot_workbook_path)
        gas_run = ingest_cleanview_gas_plants(session, gas_csv_path)
        ercot_gas_run = ingest_ercot_gas_geospatial(session, ercot_gas_geospatial_path)
        refresh_match_candidates(session)
        runs = [cleanview_run, ercot_run, gas_run, ercot_gas_run]
        return {
            "source": "Cleanview + ERCOT GIS + Cleanview Gas Plants + ERCOT Gas Geospatial",
            "status": "success" if all(run.status == "success" for run in runs) else "partial_failure",
            "records_seen": sum(run.records_seen for run in runs),
            "records_changed": sum(run.records_changed for run in runs),
            "completed_at": max(run.completed_at for run in runs if run.completed_at is not None),
            "message": " ".join(run.message or "" for run in runs),
        }


def _as_of_datetime(as_of: date | datetime | None) -> datetime | None:
    if as_of is None:
        return None
    if isinstance(as_of, datetime):
        return as_of
    return datetime.combine(as_of, datetime.max.time())


def projects_frame(
    selected_stages: list[str] | None = None,
    selected_power_types: list[str] | None = None,
    selected_sources: list[str] | None = None,
    min_mw: float | None = None,
    as_of: date | datetime | None = None,
) -> pd.DataFrame:
    """Return canonical project state filtered for the map at a chosen point in time."""
    cutoff = _as_of_datetime(as_of)
    with session_scope() as session:
        statement = select(Project)
        if cutoff:
            statement = statement.where(Project.source_updated_at <= cutoff)
        if selected_stages:
            statement = statement.where(Project.radar_stage.in_(selected_stages))
        if selected_power_types:
            statement = statement.where(Project.power_type.in_(selected_power_types))
        if selected_sources:
            statement = statement.where(Project.source.in_(selected_sources))
        if min_mw is not None:
            statement = statement.where(Project.estimated_mw >= min_mw)
        projects = list(session.scalars(statement.order_by(Project.project_name)).all())

    rows = [
        {
            "id": project.id,
            "project_name": project.project_name,
            "developer": project.developer or "Unknown developer",
            "city": project.city or "—",
            "county": project.county or "—",
            "latitude": project.latitude,
            "longitude": project.longitude,
            "estimated_mw": project.estimated_mw,
            "power_type": project.power_type,
            "source_stage": project.source_stage,
            "radar_stage": project.radar_stage,
            "stage_confidence": project.stage_confidence,
            "ercot_status": project.ercot_status or "Not checked",
            "permit_status": project.permit_status or "Not checked",
            "latest_signal": project.latest_signal or "No signal recorded",
            "source": project.source,
            "source_url": project.source_url or "",
            "last_updated": project.source_updated_at,
        }
        for project in projects
    ]
    return pd.DataFrame(rows)


def event_frame(as_of: date | datetime | None = None, limit: int = 12) -> pd.DataFrame:
    cutoff = _as_of_datetime(as_of)
    with session_scope() as session:
        statement = select(ProjectEvent, Project).join(Project, Project.id == ProjectEvent.project_id)
        if cutoff:
            statement = statement.where(ProjectEvent.occurred_at <= cutoff)
        statement = statement.order_by(ProjectEvent.occurred_at.desc()).limit(limit)
        rows = session.execute(statement).all()

    return pd.DataFrame(
        [
            {
                "event_id": event.id,
                "project_id": project.id,
                "project_name": project.project_name,
                "stage": project.radar_stage,
                "title": event.title,
                "detail": event.detail,
                "before_value": event.before_value,
                "after_value": event.after_value,
                "confidence_delta": event.confidence_delta,
                "occurred_at": event.occurred_at,
                "source_url": project.source_url or "",
            }
            for event, project in rows
        ]
    )


def project_story(project_id: str) -> dict[str, object] | None:
    with session_scope() as session:
        project = session.scalar(
            select(Project)
            .options(joinedload(Project.documents).joinedload(SourceDocument.signals), joinedload(Project.events))
            .where(Project.id == project_id)
        )
        if project is None:
            return None
        timeline = []
        for event in sorted(project.events, key=lambda item: item.occurred_at):
            timeline.append(
                {
                    "kind": "event",
                    "date": event.occurred_at,
                    "title": event.title,
                    "detail": event.detail,
                    "before_value": event.before_value,
                    "after_value": event.after_value,
                }
            )
        evidence = []
        for document in sorted(project.documents, key=lambda item: item.published_at or item.retrieved_at):
            evidence.append(
                {
                    "source": document.source,
                    "url": document.source_url,
                    "published_at": document.published_at or document.retrieved_at,
                    "parser_version": document.parser_version,
                    "signals": [signal.signal_text for signal in document.signals],
                    "raw_payload": document.raw_payload,
                }
            )
        return {
            "id": project.id,
            "name": project.project_name,
            "developer": project.developer or "Unknown developer",
            "county": project.county or "Unknown county",
            "estimated_mw": project.estimated_mw,
            "power_type": project.power_type,
            "source_stage": project.source_stage,
            "radar_stage": project.radar_stage,
            "confidence": project.stage_confidence,
            "ercot_status": project.ercot_status or "Not checked",
            "permit_status": project.permit_status or "Not checked",
            "latest_signal": project.latest_signal or "No signal recorded",
            "source_url": project.source_url,
            "timeline": timeline,
            "evidence": evidence,
        }


def health_summary() -> dict[str, object]:
    with session_scope() as session:
        run = session.scalar(select(IngestionRun).order_by(IngestionRun.completed_at.desc()).limit(1))
        project_count = session.scalar(select(func.count(Project.id))) or 0
        review_count = session.scalar(select(func.count(MatchCandidate.id)).where(MatchCandidate.decision == "review")) or 0
    if run is None:
        return {"status": "not_started", "project_count": project_count, "review_count": review_count}
    return {
        "status": run.status,
        "source": run.source,
        "last_checked": run.completed_at,
        "records_seen": run.records_seen,
        "records_changed": run.records_changed,
        "message": run.message,
        "project_count": project_count,
        "review_count": review_count,
    }


def review_candidates(limit: int = 8) -> pd.DataFrame:
    with session_scope() as session:
        left = Project.__table__.alias("left_project")
        right = Project.__table__.alias("right_project")
        statement = (
            select(
                MatchCandidate.total_score,
                MatchCandidate.decision,
                MatchCandidate.explanation,
                MatchCandidate.feature_scores,
                left.c.project_name.label("left_name"),
                right.c.project_name.label("right_name"),
            )
            .join(left, MatchCandidate.left_project_id == left.c.id)
            .join(right, MatchCandidate.right_project_id == right.c.id)
            .where(MatchCandidate.decision == "review")
            .order_by(MatchCandidate.total_score.desc())
            .limit(limit)
        )
        rows = session.execute(statement).all()
    return pd.DataFrame(
        [
            {
                "candidate": f"{row.left_name} ↔ {row.right_name}",
                "score": row.total_score,
                "decision": row.decision,
                "explanation": row.explanation,
                "features": row.feature_scores,
            }
            for row in rows
        ]
    )


def timeline_bounds() -> tuple[date, date]:
    with session_scope() as session:
        minimum = session.scalar(select(func.min(ProjectEvent.occurred_at)))
        maximum = session.scalar(select(func.max(ProjectEvent.occurred_at)))
    if minimum is None or maximum is None:
        today = date.today()
        return today - timedelta(days=1), today
    return minimum.date() - timedelta(days=1), maximum.date()
