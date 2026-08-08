"""Explainable source-status stage inference for the Project Radar MVP."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class StageAssessment:
    stage: str
    confidence: float
    rationale: str
    rule_version: str = "stage-rules-1.0"


SOURCE_STAGE_RULES: dict[str, StageAssessment] = {
    "operational": StageAssessment(
        stage="COD",
        confidence=0.95,
        rationale="The source labels the asset as operating; Radar maps this to commercial operation.",
    ),
    "operating": StageAssessment(
        stage="COD",
        confidence=0.95,
        rationale="The source labels the asset as operating; Radar maps this to commercial operation.",
    ),
    "under construction": StageAssessment(
        stage="Construction",
        confidence=0.84,
        rationale="The source labels the asset as under construction; Radar maps this to construction.",
    ),
    "construction": StageAssessment(
        stage="Construction",
        confidence=0.84,
        rationale="The source labels the asset as under construction; Radar maps this to construction.",
    ),
    "early stage": StageAssessment(
        stage="Concept",
        confidence=0.60,
        rationale="The source labels the asset as planned/early-stage. This is an early project signal, not proof of FEED or construction.",
    ),
    "planned": StageAssessment(
        stage="Concept",
        confidence=0.60,
        rationale="The source labels the asset as planned. Radar treats this as a concept-stage signal until independent evidence arrives.",
    ),
    "canceled": StageAssessment(
        stage="Withdrawn",
        confidence=0.95,
        rationale="The source labels the asset as canceled; Radar retains its history and marks the current status withdrawn.",
    ),
    "cancelled": StageAssessment(
        stage="Withdrawn",
        confidence=0.95,
        rationale="The source labels the asset as canceled; Radar retains its history and marks the current status withdrawn.",
    ),
}


DEFAULT_ASSESSMENT = StageAssessment(
    stage="Unknown",
    confidence=0.30,
    rationale="The current source record does not contain enough stage-specific evidence for a stronger assessment.",
)


def infer_stage(source_stage: str | None) -> StageAssessment:
    """Map a source-specific status to an evidence-bounded Project Radar stage."""
    if not source_stage:
        return DEFAULT_ASSESSMENT
    normalized = source_stage.strip().lower()
    return SOURCE_STAGE_RULES.get(normalized, DEFAULT_ASSESSMENT)
