from pathlib import Path

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from radar.data.models import Base, Project, ProjectEvent, SourceDocument
from radar.services.ercot_gas_geospatial_service import (
    DEFAULT_ERCOT_GAS_CSV,
    ERCOT_GAS_SOURCE,
    ingest_ercot_gas_geospatial,
    load_ercot_gas_geospatial_records,
)
from radar.services.ercot_gis_service import DEFAULT_ERCOT_WORKBOOK, ingest_ercot_gis


def test_ercot_gas_geospatial_snapshot_has_expected_source_rows():
    rows = load_ercot_gas_geospatial_records(DEFAULT_ERCOT_GAS_CSV)

    assert len(rows) == 130
    assert rows[0]["Fuel"] == "GAS"
    assert {row["GIM Study Phase"] for row in rows} >= {
        "SS Completed, FIS Started, No IA",
        "SS Completed, FIS Completed, IA",
    }


def test_ercot_gas_geospatial_evidence_enriches_existing_gis_projects(tmp_path: Path):
    engine = create_engine(f"sqlite:///{tmp_path / 'ercot-gas.sqlite3'}", future=True)
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        base_run = ingest_ercot_gis(session, DEFAULT_ERCOT_WORKBOOK)
        session.commit()
        before_projects = session.scalar(select(func.count(Project.id)))
        before_documents = session.scalar(select(func.count(SourceDocument.id)))
        before_events = session.scalar(select(func.count(ProjectEvent.id)))

        supplement_run = ingest_ercot_gas_geospatial(session, DEFAULT_ERCOT_GAS_CSV)
        session.commit()

        assert base_run.status == "success"
        assert supplement_run.status == "success"
        assert supplement_run.records_seen == 130
        assert supplement_run.records_changed == 130
        assert session.scalar(select(func.count(Project.id))) == before_projects
        assert session.scalar(select(func.count(SourceDocument.id))) == before_documents + 130
        assert session.scalar(select(func.count(ProjectEvent.id))) == before_events + 130

        eagle_pines = session.scalar(select(Project).where(Project.project_name == "Eagle Pines Gas"))
        assert eagle_pines is not None
        assert eagle_pines.source == "ERCOT GIS"
        assert eagle_pines.latitude == 31.8390826
        assert eagle_pines.longitude == -95.1791849

        geospatial_document = session.scalar(
            select(SourceDocument).where(
                SourceDocument.project_id == eagle_pines.id,
                SourceDocument.source == ERCOT_GAS_SOURCE,
            )
        )
        assert geospatial_document is not None
        assert geospatial_document.raw_payload["match_method"] == "exact_normalized_name_county_capacity"
        assert geospatial_document.raw_payload["Projected COD"] == "2028-10-30"
