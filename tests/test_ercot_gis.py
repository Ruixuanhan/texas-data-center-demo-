from pathlib import Path

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from radar.data.models import Base, Project, ProjectEvent, SourceDocument
from radar.intelligence.stage_rules import infer_ercot_stage
from radar.services.ercot_gis_service import DEFAULT_ERCOT_WORKBOOK, _as_float, ingest_ercot_gis, load_ercot_gis_records


def test_ercot_workbook_parses_project_records_from_both_detail_tabs():
    records = load_ercot_gis_records(DEFAULT_ERCOT_WORKBOOK)

    assert len(records) > 1_000
    assert {record["size_category"] for record in records} == {"Large", "Small"}
    assert any(record["INR"] == "15INR0064b" for record in records)
    assert any(record["Project Name"] == "Grizzly Ridge BESS SLF" for record in records)


def test_negative_ercot_capacity_adjustments_are_not_mapped_as_current_mw():
    assert _as_float(-53.3) is None
    assert _as_float(53.3) == 53.3


def test_ercot_milestones_do_not_overclaim_fid_or_construction():
    assessment = infer_ercot_stage(
        study_phase="SS Completed, FIS Completed, IA",
        ia_signed="Yes",
        synchronization_date=None,
    )

    assert assessment.stage == "Interconnection Agreement"
    assert assessment.confidence == 0.88
    assert "not" not in assessment.rationale.lower() or "agreement" in assessment.rationale.lower()


def test_ercot_ingestion_creates_projects_documents_and_events(tmp_path: Path):
    engine = create_engine(f"sqlite:///{tmp_path / 'ercot.sqlite3'}", future=True)
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        run = ingest_ercot_gis(session, DEFAULT_ERCOT_WORKBOOK)
        session.commit()

        assert run.status == "success"
        assert run.records_seen > 1_000
        assert run.records_changed == run.records_seen
        assert session.scalar(select(func.count(Project.id))) == run.records_seen
        assert session.scalar(select(func.count(SourceDocument.id))) == run.records_seen
        assert session.scalar(select(func.count(ProjectEvent.id))) == run.records_seen
        assert session.scalar(select(func.min(Project.estimated_mw))) >= 0
        example = session.scalar(select(Project).where(Project.source_project_key == "ercot-gis:15INR0064b"))
        assert example is not None
        assert example.source == "ERCOT GIS"
        assert example.radar_stage == "Interconnection Agreement"
        assert example.estimated_mw == 162.1
