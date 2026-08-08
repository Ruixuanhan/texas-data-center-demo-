"""Relational evidence model for the Project Radar MVP.

The demo uses SQLite by default so it is immediately runnable. Every model is kept
portable to PostgreSQL/PostGIS for deployment; latitude/longitude can be replaced
by a PostGIS point without changing the application service layer.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Base class for all persistent Project Radar records."""


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    source_project_key: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    project_name: Mapped[str] = mapped_column(String(500), index=True)
    developer: Mapped[str | None] = mapped_column(String(500), nullable=True, index=True)
    city: Mapped[str | None] = mapped_column(String(255), nullable=True)
    county: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    estimated_mw: Mapped[float | None] = mapped_column(Float, nullable=True)
    power_type: Mapped[str] = mapped_column(String(100), default="Unknown", index=True)
    source_stage: Mapped[str] = mapped_column(String(100), default="Unknown")
    radar_stage: Mapped[str] = mapped_column(String(100), default="Unknown", index=True)
    stage_confidence: Mapped[float] = mapped_column(Float, default=0.0)
    ercot_status: Mapped[str | None] = mapped_column(Text, nullable=True)
    permit_status: Mapped[str | None] = mapped_column(Text, nullable=True)
    latest_signal: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(100), default="Unknown")
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ingested_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))

    documents: Mapped[list["SourceDocument"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    signals: Mapped[list["Signal"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    events: Mapped[list["ProjectEvent"]] = relationship(back_populates="project", cascade="all, delete-orphan")


class SourceDocument(Base):
    __tablename__ = "source_documents"
    __table_args__ = (UniqueConstraint("source", "content_hash", name="uq_source_document_hash"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    source: Mapped[str] = mapped_column(String(100), index=True)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    content_hash: Mapped[str] = mapped_column(String(64), index=True)
    parser_version: Mapped[str] = mapped_column(String(50), default="1.0")
    raw_payload: Mapped[dict] = mapped_column(JSON, default=dict)

    project: Mapped[Project] = relationship(back_populates="documents")
    signals: Mapped[list["Signal"]] = relationship(back_populates="source_document", cascade="all, delete-orphan")


class Signal(Base):
    __tablename__ = "signals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    source_document_id: Mapped[str] = mapped_column(ForeignKey("source_documents.id"), index=True)
    signal_type: Mapped[str] = mapped_column(String(100), index=True)
    signal_text: Mapped[str] = mapped_column(Text)
    occurred_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)

    project: Mapped[Project] = relationship(back_populates="signals")
    source_document: Mapped[SourceDocument] = relationship(back_populates="signals")


class ProjectEvent(Base):
    __tablename__ = "project_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(100), index=True)
    title: Mapped[str] = mapped_column(String(500))
    detail: Mapped[str] = mapped_column(Text)
    before_value: Mapped[str | None] = mapped_column(String(100), nullable=True)
    after_value: Mapped[str | None] = mapped_column(String(100), nullable=True)
    confidence_delta: Mapped[float | None] = mapped_column(Float, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    source_document_id: Mapped[str | None] = mapped_column(ForeignKey("source_documents.id"), nullable=True)

    project: Mapped[Project] = relationship(back_populates="events")


class IngestionRun(Base):
    __tablename__ = "ingestion_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    source: Mapped[str] = mapped_column(String(100), index=True)
    status: Mapped[str] = mapped_column(String(50), index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    records_seen: Mapped[int] = mapped_column(Integer, default=0)
    records_changed: Mapped[int] = mapped_column(Integer, default=0)
    artifact_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)


class MatchCandidate(Base):
    __tablename__ = "match_candidates"
    __table_args__ = (UniqueConstraint("left_project_id", "right_project_id", name="uq_match_candidate_pair"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    left_project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    right_project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    total_score: Mapped[float] = mapped_column(Float)
    decision: Mapped[str] = mapped_column(String(50), default="review")
    explanation: Mapped[str] = mapped_column(Text)
    feature_scores: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
