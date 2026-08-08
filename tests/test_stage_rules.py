from radar.intelligence.stage_rules import infer_stage


def test_operational_status_maps_to_cod_with_high_confidence():
    assessment = infer_stage("Operational")

    assert assessment.stage == "COD"
    assert assessment.confidence >= 0.9
    assert "operating" in assessment.rationale.lower()


def test_early_stage_stays_conservative():
    assessment = infer_stage("Early Stage")

    assert assessment.stage == "Concept"
    assert assessment.confidence == 0.60
    assert "not proof" in assessment.rationale.lower()


def test_unknown_status_does_not_overclaim():
    assessment = infer_stage("A vague announcement")

    assert assessment.stage == "Unknown"
    assert assessment.confidence < 0.5
