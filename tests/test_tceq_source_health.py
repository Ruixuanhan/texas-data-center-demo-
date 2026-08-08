from pathlib import Path

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from radar.data.models import Base, IngestionRun, Project, SourceDocument
from radar.services.tceq_service import TCEQ_SOURCE_NAME, build_tceq_search_url, run_tceq_source_health_check


class _UnavailableResponse:
    status_code = 503
    content = b"upstream service unavailable"


def test_tceq_query_uses_public_regulated_entity_name_parameters():
    url = build_tceq_search_url(["Google", "Meta"])

    assert "IdcService=TCEQ_PERFORM_SEARCH" in url
    assert "select0=xRegEntName" in url
    assert "input0=Google" in url
    assert "select1=xRegEntName" in url
    assert "input1=Meta" in url


def test_tceq_503_is_recorded_as_source_health_not_project_evidence(tmp_path: Path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'tceq.sqlite3'}", future=True)
    Base.metadata.create_all(engine)
    monkeypatch.setattr("radar.services.tceq_service.requests.get", lambda *args, **kwargs: _UnavailableResponse())

    with Session(engine) as session:
        run = run_tceq_source_health_check(session, terms=("Google",))
        session.commit()

        assert run.source == TCEQ_SOURCE_NAME
        assert run.status == "unavailable"
        assert run.records_seen == 0
        assert "HTTP 503" in (run.message or "")
        assert session.scalars(select(Project)).all() == []
        assert session.scalars(select(SourceDocument)).all() == []
        persisted = session.scalar(select(IngestionRun))
        assert persisted is not None
        assert persisted.status == "unavailable"
