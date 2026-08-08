"""Conservative, explainable candidate scoring for Project Radar entity resolution."""

from __future__ import annotations

import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from itertools import combinations
from typing import Iterable

from radar.data.models import Project


LEGAL_SUFFIXES = re.compile(r"\b(llc|l\.l\.c|inc|incorporated|ltd|limited|corp|corporation|lp|llp)\b", re.IGNORECASE)
NON_ALPHANUMERIC = re.compile(r"[^a-z0-9]+")


@dataclass(frozen=True)
class CandidateScore:
    left_project_id: str
    right_project_id: str
    total_score: float
    decision: str
    explanation: str
    feature_scores: dict[str, float]


def normalize_text(value: str | None) -> str:
    if not value:
        return ""
    lowered = LEGAL_SUFFIXES.sub(" ", value.lower())
    return " ".join(token for token in NON_ALPHANUMERIC.sub(" ", lowered).split() if token)


def text_similarity(left: str | None, right: str | None) -> float:
    left_normalized = normalize_text(left)
    right_normalized = normalize_text(right)
    if not left_normalized or not right_normalized:
        return 0.0
    return round(SequenceMatcher(None, left_normalized, right_normalized).ratio(), 3)


def capacity_similarity(left: float | None, right: float | None) -> float:
    if left is None or right is None or left <= 0 or right <= 0:
        return 0.0
    difference_ratio = abs(left - right) / max(left, right)
    if difference_ratio <= 0.10:
        return 1.0
    if difference_ratio <= 0.25:
        return 0.65
    return 0.0


def score_pair(left: Project, right: Project) -> CandidateScore:
    """Score a pair using independent features; never auto-merge fuzzy near-matches."""
    name_score = text_similarity(left.project_name, right.project_name)
    developer_score = 1.0 if normalize_text(left.developer) and normalize_text(left.developer) == normalize_text(right.developer) else 0.0
    county_score = 1.0 if normalize_text(left.county) and normalize_text(left.county) == normalize_text(right.county) else 0.0
    power_score = 1.0 if normalize_text(left.power_type) not in {"", "unknown"} and normalize_text(left.power_type) == normalize_text(right.power_type) else 0.0
    mw_score = capacity_similarity(left.estimated_mw, right.estimated_mw)

    feature_scores = {
        "name_similarity": name_score,
        "developer_match": developer_score,
        "county_match": county_score,
        "power_type_match": power_score,
        "mw_similarity": mw_score,
    }
    total = round(
        name_score * 0.50
        + developer_score * 0.20
        + county_score * 0.15
        + power_score * 0.05
        + mw_score * 0.10,
        3,
    )

    # Existing Cleanview data has no shared permit, queue, or facility identifier.
    # Therefore, a fuzzy name score can trigger review but never an auto-link.
    if total >= 0.65 and (developer_score or county_score):
        decision = "review"
        explanation = (
            "Potential relationship based on name similarity plus shared contextual features. "
            "No source-specific identifier is available, so Radar requires review before linking records."
        )
    else:
        decision = "separate"
        explanation = "Insufficient independent evidence to treat these records as the same project."

    return CandidateScore(
        left_project_id=left.id,
        right_project_id=right.id,
        total_score=total,
        decision=decision,
        explanation=explanation,
        feature_scores=feature_scores,
    )


def generate_candidates(projects: Iterable[Project]) -> list[CandidateScore]:
    """Generate only plausible review candidates to keep the dashboard signal-to-noise high."""
    results: list[CandidateScore] = []
    ordered_projects = sorted(projects, key=lambda project: project.id)
    for left, right in combinations(ordered_projects, 2):
        shared_county = normalize_text(left.county) == normalize_text(right.county) and bool(normalize_text(left.county))
        shared_developer = normalize_text(left.developer) == normalize_text(right.developer) and bool(normalize_text(left.developer))
        if not (shared_county or shared_developer):
            continue
        candidate = score_pair(left, right)
        if candidate.decision == "review":
            results.append(candidate)
    return results
