from fastapi.testclient import TestClient

from radar.api import app


def test_radar_snapshot_api_exposes_projects_events_and_evidence_history():
    with TestClient(app) as client:
        health = client.get("/health")
        snapshot = client.get("/api/v1/radar/snapshot")

    assert health.status_code == 200
    assert health.json() == {"status": "ok"}
    assert snapshot.status_code == 200

    payload = snapshot.json()
    assert payload["projects"]
    assert payload["events"]
    assert payload["stage_history"]
    assert {project["source"] for project in payload["projects"]} >= {"cleanview", "ercot_gis"}
    gas_project = next(project for project in payload["projects"] if project["name"] == "Hale Thermal")
    assert gas_project["project_type"] == "gas_to_power"
    assert gas_project["current_stage"] == "concept"
    assert gas_project["stage_confidence"] == 0.60

    ercot_project = next(project for project in payload["projects"] if project["source"] == "ercot_gis")
    dossier = client.get(f"/api/v1/radar/projects/{ercot_project['id']}")
    assert dossier.status_code == 200
    assert dossier.json()["project"]["source"] == "ercot_gis"
