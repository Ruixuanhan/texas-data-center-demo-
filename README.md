# Project RadarOrigination — Texas Energy Intelligence MVP

Project Radar is a Python-first, evidence-backed monitoring experience for Texas data-center infrastructure and potential power opportunity. It turns the repository’s committed Cleanview-derived project snapshot into an inspectable intelligence product: every imported project receives retained source lineage, a confidence-bounded stage assessment, a historical event, and a conservative entity-resolution review check.

> **MVP promise:** A project marker, stage, feed event, and timeline entry always trace back to a retained source record. The application does not treat fuzzy name similarity as proof that two projects are the same asset.

## What is implemented

| Capability | MVP implementation |
| --- | --- |
| Python data platform | Python 3.12 with SQLAlchemy 2.x stores the operational project/evidence model in a local SQLite database by default. The models are portable to PostgreSQL/PostGIS for deployment. |
| Source provenance | The committed `texas_datacenter_projects.csv` snapshot is parsed into immutable `source_documents`, normalized `signals`, and `project_events`. The raw payload, source URL, content hash, published date, and parser version are retained. |
| Stage intelligence | Deterministic rules map source status to an explicit Radar stage and confidence: planned/early-stage → Concept, operating → COD, canceled → Withdrawn. The rationale is displayed in each project story. |
| Entity-resolution safety | Name, developer, county, capacity, and technology features identify **review candidates**. No fuzzy candidate is automatically merged because the current source snapshot has no shared queue, permit, or facility identifier. |
| Interactive experience | The Streamlit dashboard includes a dark Texas map, stage/power/capacity filters, time control, source-health status, event feed, project evidence story, and review queue. |
| Liveness contract | The **Refresh snapshot** action runs an idempotent ingestion job, records an `ingestion_run`, and avoids creating duplicate evidence if the source snapshot is unchanged. |

## Technology stack

| Layer | Technology |
| --- | --- |
| Application and data services | Python 3.12 |
| User interface | Streamlit + PyDeck |
| Operational data layer | SQLite for the repository demo; PostgreSQL 16 + PostGIS through `DATABASE_URL` for deployment |
| ORM and migrations path | SQLAlchemy 2.x; Alembic is the intended deployment migration tool |
| Transformations | pandas in the current committed-data adapter; Polars/PyArrow are planned for larger source feeds |
| Tests | pytest |

## Repository layout

```text
.
├── app.py                         # Streamlit dashboard entry point
├── texas_datacenter_projects.csv  # Existing committed source snapshot
├── requirements.txt
├── docs/
│   └── SMOKE_TEST.md               # Browser verification record
├── src/radar/
│   ├── data/                       # SQLAlchemy models and database setup
│   ├── intelligence/               # Stage rules and conservative record matching
│   └── services/                   # Ingestion and dashboard query services
└── tests/                          # Stage, matching, and ingestion-path tests
```

## Run locally

Create an isolated environment if desired, then install dependencies and start the application.

```bash
pip install -r requirements.txt
PYTHONPATH=src streamlit run app.py
```

The first page load initializes `data/project_radar.sqlite3` from the committed CSV. That local database and any unreleased source artifacts are ignored by Git.

## Test

```bash
PYTHONPATH=src pytest -q
```

The test suite verifies deterministic stage mapping, conservative match-review behavior, and the source-snapshot → document → signal → event ingestion path.

## Data and provenance boundary

The current user interface is backed by the committed Cleanview-derived Texas data-center snapshot already present in the repository. It does **not** claim to be a continuously fetched ERCOT, TCEQ, PUCT, or FERC feed. Those sources belong behind future source adapters that conform to the same pipeline contract: archive raw artifact, create a source document, extract signals, generate match candidates, apply evidence-bounded stage rules, and record material project events.

The default SQLite data layer is intended for hackathon speed. In deployment, set `DATABASE_URL` to PostgreSQL/PostGIS, move raw artifacts to object storage, and invoke `src/radar/services/ingestion_service.py` from a Python cron/worker. The domain model then supports a durable source-health panel and the same dashboard queries.

## Development branch

The MVP implementation is on `feature/project-radar-mvp`, created from `origin/develop`.
