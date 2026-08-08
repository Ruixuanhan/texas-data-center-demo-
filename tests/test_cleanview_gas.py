from pathlib import Path

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from radar.data.models import Base, Project, ProjectEvent, SourceDocument
from radar.services.cleanview_gas_service import DEFAULT_GAS_SOURCE_CSV, SOURCE_NAME, ingest_cleanview_gas_plants


def test_cleanview_gas_ingestion_preserves_planned_unit_level_evidence(tmp_path: Path):
    engine = create_engine(f"sqlite:///{tmp_path / 'cleanview_gas.sqlite3'}", future=True)
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        run = ingest_cleanview_gas_plants(session, DEFAULT_GAS_SOURCE_CSV)
        session.commit()

        assert run.status == "success"
        assert run.records_seen == 18
        assert run.records_changed == 18
        assert session.scalar(select(func.count(Project.id))) == 18
        assert session.scalar(select(func.count(SourceDocument.id))) == 18
        assert session.scalar(select(func.count(ProjectEvent.id))) == 18

        units = list(
            session.scalars(
                select(Project).where(Project.project_name == "Coyanosa Gas").order_by(Project.source_project_key)
            ).all()
        )
        assert len(units) == 4
        assert len({project.source_project_key for project in units}) == 4

        basranch = session.scalar(select(Project).where(Project.project_name == "BasRanch (TEF - Due Diligence)"))
        assert basranch is not None
        assert basranch.source == SOURCE_NAME
        assert basranch.power_type == "Natural Gas"
        assert basranch.radar_stage == "Concept"
        assert basranch.stage_confidence == 0.60
        assert "expected online December 2028" in (basranch.latest_signal or "")
