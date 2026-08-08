from radar.data.models import Project
from radar.intelligence.entity_resolution import score_pair


def make_project(identifier: str, name: str, developer: str, county: str, mw: float) -> Project:
    return Project(
        id=identifier,
        source_project_key=identifier,
        project_name=name,
        developer=developer,
        county=county,
        estimated_mw=mw,
        power_type="Gas",
    )


def test_similar_names_with_shared_context_require_review_without_identifier():
    left = make_project("one", "Project Falcon", "Falcon Energy LLC", "Travis", 350)
    right = make_project("two", "TX Falcon CCGT", "Falcon Energy", "Travis", 360)

    score = score_pair(left, right)

    assert score.total_score >= 0.65
    assert score.decision == "review"
    assert "requires review" in score.explanation.lower()


def test_unrelated_projects_stay_separate():
    left = make_project("one", "Project Falcon", "Falcon Energy", "Travis", 350)
    right = make_project("two", "West Texas Compute", "Compute Grid", "Harris", 100)

    score = score_pair(left, right)

    assert score.decision == "separate"
    assert score.total_score < 0.65
