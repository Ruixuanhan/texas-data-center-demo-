"""Database setup for the Python-first Project Radar data layer."""

from __future__ import annotations

import os
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from radar.data.models import Base


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DB_PATH = PROJECT_ROOT / "data" / "project_radar.sqlite3"


def database_url() -> str:
    """Return the configured DB URL, defaulting to a local portable MVP database."""
    return os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_DB_PATH}")


def build_engine(url: str | None = None) -> Engine:
    resolved_url = url or database_url()
    connect_args = {"check_same_thread": False} if resolved_url.startswith("sqlite") else {}
    return create_engine(resolved_url, future=True, connect_args=connect_args)


ENGINE = build_engine()
SessionLocal = sessionmaker(bind=ENGINE, expire_on_commit=False, future=True)


def initialize_database() -> None:
    """Create relational tables when a local demo starts for the first time."""
    DEFAULT_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=ENGINE)


@contextmanager
def session_scope() -> Iterator[Session]:
    """Provide a transactional session with explicit commit/rollback behavior."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
