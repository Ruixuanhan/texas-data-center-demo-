from pathlib import Path

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from radar.data.models import Base, IngestionRun, Project, ProjectEvent, Signal, SourceDocument
from radar.services.ingestion_service import ingest_cleanview_snapshot


def test_csv_ingestion_retains_evidence_and_creates_project_event(tmp_path: Path):
    csv_path = tmp_path / "snapshot.csv"
    csv_path.write_text(
        "project_name,developer,city,county,latitude,longitude,estimated_mw,stage,power_type,ercot_status,permit_status,latest_signal,source,source_url,last_updated\n"
        "Project Falcon,Falcon Energy,Austin,Travis,30.26,-97.74,350,Early Stage,Gas,Active,Submitted,Permit filed,Cleanview,https://example.com/falcon,2026-08-08\n",
        encoding="utf-8",
    )
    engine = create_engine(f"sqlite:///{tmp_path / 'radar.sqlite3'}", future=True)
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        run = ingest_cleanview_snapshot(session, csv_path)
        session.commit()

        assert run.status == "success"
        assert session.scalar(select(IngestionRun).where(IngestionRun.id == run.id)).records_seen == 1
        project = session.scalar(select(Project))
        assert project is not None
        assert project.radar_stage == "Concept"
        assert project.stage_confidence == 0.60
        assert session.scalar(select(SourceDocument)) is not None
        assert session.scalar(select(Signal)) is not None
        event = session.scalar(select(ProjectEvent))
        assert event is not None
        assert event.event_type == "baseline_loaded"
