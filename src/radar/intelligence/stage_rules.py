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


def infer_ercot_stage(
    study_phase: str | None,
    ia_signed: str | None,
    synchronization_date: object | None,
) -> StageAssessment:
    """Translate ERCOT GIS milestones into an explainable development-stage assessment.

    The workbook directly evidences grid interconnection progress. It cannot by itself
    prove FID or construction, so this rule intentionally stops at the strongest
    defensible interconnection stage unless synchronization approval is published.
    """
    if synchronization_date:
        return StageAssessment(
            stage="COD",
            confidence=0.94,
            rationale="ERCOT GIS lists approval for synchronization, a strong grid-readiness signal consistent with commercial-operation progress.",
            rule_version="ercot-gis-rules-1.0",
        )

    phase = (study_phase or "").strip().lower()
    signed = (ia_signed or "").strip().lower()
    if "ia" in phase and "no ia" not in phase:
        return StageAssessment(
            stage="Interconnection Agreement",
            confidence=0.88,
            rationale="ERCOT GIS shows an interconnection-study phase with an agreement milestone; Radar classifies this as interconnection-agreement stage.",
            rule_version="ercot-gis-rules-1.0",
        )
    if signed == "yes":
        return StageAssessment(
            stage="Interconnection Agreement",
            confidence=0.84,
            rationale="ERCOT GIS indicates that the interconnection agreement is signed.",
            rule_version="ercot-gis-rules-1.0",
        )
    if "fis" in phase:
        return StageAssessment(
            stage="FEL-2 / Pre-FEED",
            confidence=0.72,
            rationale="ERCOT GIS shows full-interconnection-study activity, an advanced development signal but not proof of a signed interconnection agreement.",
            rule_version="ercot-gis-rules-1.0",
        )
    if "ss" in phase:
        return StageAssessment(
            stage="FEL-1",
            confidence=0.62,
            rationale="ERCOT GIS shows screening-study activity, an early interconnection-development signal.",
            rule_version="ercot-gis-rules-1.0",
        )
    return StageAssessment(
        stage="Concept",
        confidence=0.48,
        rationale="The ERCOT GIS record establishes project identity but does not expose enough milestone detail for a stronger stage assessment.",
        rule_version="ercot-gis-rules-1.0",
    )
