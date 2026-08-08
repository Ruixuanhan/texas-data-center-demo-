# Project RadarOrigination — Texas Energy Intelligence MVP

Project Radar is an **evidence-backed project-intelligence application** for Texas data-center demand and power-supply opportunities. The Python ingestion layer turns committed source snapshots into retained documents, normalized signals, deterministic stage assessments, and conservative entity-review candidates. A FastAPI read model exposes that evidence graph to a cinematic Next.js map experience.

> **MVP promise:** A project marker, stage, confidence score, and feed event always trace to retained source evidence. Similar names never prove identity; ambiguous records remain review candidates until a human confirms the relationship.

## What is implemented

| Capability | MVP implementation |
| --- | --- |
| Evidence data platform | Python 3.12 with SQLAlchemy 2.x stores projects, source documents, signals, events, ingestion runs, and match candidates in SQLite by default. The model is portable to PostgreSQL/PostGIS. |
| Active source adapters | Three committed source snapshots load end-to-end: Cleanview-derived data-center projects, ERCOT GIS July 2026 generation/interconnection records, and Cleanview-derived planned natural-gas plants. |
| Environmental-source readiness | The TCEQ permit-query template and schema are versioned under `data/fixtures/tceq/`. The public query endpoint returned a server-side failure during validation, so TCEQ is transparently configured but not represented as active. |
| Stage intelligence | Deterministic Python rules map source status and ERCOT milestones to evidence-bounded Radar stages and confidence. Planned gas capacity is explicitly classified as **Concept, 0.60 confidence** until stronger independent evidence appears. |
| Entity-resolution safety | Name, developer, county, capacity, and technology identify **review candidates**. Similarity never automatically merges Cleanview units, ERCOT records, or data-center and gas projects. |
| Primary application | A Next.js + MapLibre + deck.gl + GSAP map theater presents source-backed assets, an investor ranking, an evidence ticker, project dossiers, source lineage, stage confidence, and a Python API liveness indicator. |
| API bridge | FastAPI projects the Python evidence graph into a documented frontend contract. The browser polls a same-origin Next.js proxy every eight seconds; no Supabase dependency or synthetic client data is used. |

## Architecture

```text
Committed source snapshots
  ├── texas_datacenter_projects.csv      (Cleanview-derived data-center projects)
  ├── data/fixtures/ercot_gis_july_2026.xlsx
  └── cleanview_gas_plants.csv           (Cleanview-derived planned gas capacity)
                 │
                 ▼
Python ingestion adapters → SQLite / PostgreSQL evidence graph
                 │
                 ▼
FastAPI `/api/v1/radar/*` read model
                 │
                 ▼
Next.js + MapLibre/deck.gl investor map theater
```

## Technology stack

| Layer | Technology |
| --- | --- |
| Ingestion, API, and intelligence | Python 3.12, FastAPI, Uvicorn, SQLAlchemy 2.x, pandas |
| Primary UI | Next.js 16, React 19, TypeScript, MapLibre, deck.gl, GSAP, Tailwind 4 |
| Operational data layer | SQLite for the repository demo; PostgreSQL 16 + PostGIS through `DATABASE_URL` for deployment |
| Entity and stage logic | Deterministic Python rules with retained raw evidence and review-only fuzzy matching |
| Tests | pytest for data/API contracts; Next.js production build for frontend type and bundle validation |

## Repository layout

```text
.
├── cleanview_gas_plants.csv             # Active Cleanview-derived gas capacity snapshot
├── texas_datacenter_projects.csv        # Active Cleanview-derived data-center snapshot
├── data/fixtures/
│   ├── ercot_gis_july_2026.xlsx          # Active ERCOT GIS snapshot
│   └── tceq/                             # Configured environmental-permit query/schema
├── src/radar/
│   ├── api.py                            # FastAPI evidence read model
│   ├── data/                             # SQLAlchemy models and database setup
│   ├── intelligence/                     # Stage rules and conservative record matching
│   └── services/                         # Cleanview, gas, ERCOT, and dashboard services
├── web/                                  # Primary Next.js application
│   ├── app/                              # Map-theater page and visual tokens
│   ├── components/                       # Map, ticker, hover card, and dossier components
│   └── lib/                              # Python API client and frontend data contract
├── docs/
│   ├── BUSINESS_VALUE_RESEARCH.md
│   └── SMOKE_TEST.md
└── tests/                                # Ingestion, intelligence, and API-contract tests
```

## Run locally

Install Python dependencies and launch the evidence API in one terminal:

```bash
python -m venv .venv
source .venv/bin/activate  # Windows PowerShell: .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
PYTHONPATH=src uvicorn radar.api:app --host 0.0.0.0 --port 8000
```

In a second terminal, install and run the primary Next.js application:

```bash
cd web
bun install
RADAR_API_UPSTREAM=http://127.0.0.1:8000 bun run dev -- --hostname 0.0.0.0 --port 3000
```

Open [http://localhost:3000](http://localhost:3000). The first API request initializes `data/project_radar.sqlite3`, imports the active committed snapshots, retains their raw source records, and makes the derived evidence graph available to the map theater.

For a production build of the frontend, run:

```bash
cd web
bun run build
bun run start
```

## Validate

```bash
PYTHONPATH=src pytest -q
cd web && bun run build
```

The Python suite validates deterministic stage mapping, conservative match review, Cleanview data-center ingestion, ERCOT GIS ingestion, Cleanview gas-plant unit preservation, and the FastAPI contract. The frontend build validates the map theater and Python API client at TypeScript/bundle level.

## Data and provenance boundary

The active Cleanview gas dataset contains **18 planned natural-gas records**. Its source URLs are used as stable keys, intentionally preserving separate unit records where Cleanview publishes distinct identifiers. For example, similar `Coyanosa Gas` unit records are not collapsed automatically. The source status `Planned` is not a construction or interconnection claim; Radar presents it as a concept-stage capacity signal with explicit 0.60 confidence and an expected-online value retained in source evidence.

The application does not claim live TCEQ, PUCT, FERC, RRC, county, or press ingestion. Future adapters must archive their raw artifact, create a source document, extract normalized signals, apply evidence-bounded stage rules, generate review candidates, and record material project events.

## Deployment direction

For production, set `DATABASE_URL` to PostgreSQL/PostGIS, move raw artifacts to object storage, run the Python source adapters on a scheduler, deploy the FastAPI service, and set `RADAR_API_UPSTREAM` on the Next.js server. The frontend’s default `/api/v1/*` proxy then stays same-origin while the Python service remains the authoritative evidence layer.

## Development branch

The MVP implementation is on `feature/project-radar-mvp`, created from `origin/develop`.
