# Data Planner — live energy capex intelligence

**Track 1 · Project Radar · Candid Intelligence Hackathon, Houston, 2026-08-08**

Data Planner is an evidence-backed situation screen for Texas data-center demand and power-supply opportunities. It brings source snapshots, deterministic stage assessment, retained project evidence, and a cinematic map into one origination workflow: **which projects are real, which are early, and what evidence supports the call?**

> **Evidence boundary:** A marker, stage, confidence score, or event is always traceable to a retained source record. Ambiguous records are review candidates, not automatic entity merges.

## What it does

| Capability | Implementation |
| --- | --- |
| **Live map theater** | Next.js, MapLibre, deck.gl, and GSAP render source-backed projects, county activity, stage progress, pairing tethers, filing arcs, and a live signal wire. |
| **Evidence graph** | Python 3.12, SQLAlchemy, and FastAPI retain projects, documents, normalized signals, events, ingestion runs, and match candidates in SQLite by default; the model is portable to PostgreSQL/PostGIS. |
| **Hybrid web transport** | Set `NEXT_PUBLIC_RADAR_API_URL` to poll the Python FastAPI evidence snapshot. When that variable is absent, the design branch’s Supabase Realtime transport and polling fallback remain available for the standalone design demo. |
| **Stage solution** | Deterministic rules assign canonical Radar stages and confidence. Planned capacity is `Concept`, not construction or FID; ERCOT study and agreement milestones produce their own bounded stage calls. |
| **Entity-resolution safety** | Name, developer, county, capacity, and technology identify review candidates. Similarity never silently merges data-center, generation, or gas-unit records. |
| **TCEQ readiness** | The public TCEQ query pattern and schema are versioned. The adapter reports upstream health, but it does not create unsupported permit evidence when the official endpoint is unavailable. |

## Active source coverage

| Source snapshot | Role in the product | Join and confidence boundary |
| --- | --- | --- |
| `texas_datacenter_projects.csv` | Cleanview-derived Texas data-center pipeline | Own source URL/key; source status maps to evidence-bounded stages. |
| `data/fixtures/ercot_gis_july_2026.xlsx` | ERCOT July 2026 generation/interconnection baseline | ERCOT INR is the canonical queue key; study milestones drive the ERCOT stage rules. |
| `data/real/cleanview_gas_plants.csv` | Cleanview-derived planned natural-gas capacity | Source URL/key preserves distinct units; `Planned` remains `Concept` at 0.60 confidence. |
| `data/real/ercot_gis_gas_projects_july_2026.csv` | 130 geocoded ERCOT gas projects with projected-COD evidence | Attaches only to a uniquely exact normalized `project name + county + capacity` match; adds evidence and coordinates without duplicating projects. |

The ERCOT gas supplement is not a fuzzy merge. Each matching row creates an immutable source document, a normalized enrichment signal, and an `evidence_added` event on the existing canonical ERCOT project. Unmatched or ambiguous rows remain visible in ingestion health rather than being guessed.

## Architecture

```text
Committed source snapshots
  ├── Cleanview data-center and gas capacity records
  ├── ERCOT GIS workbook
  └── ERCOT geocoded gas-project supplement
                 │
                 ▼
Python source adapters → SQLite / PostgreSQL evidence graph
                 │                         │
                 ▼                         └── FastAPI /api/v1/radar/*
Next.js + MapLibre/deck.gl map theater ◄────── NEXT_PUBLIC_RADAR_API_URL
                 │
                 └── Optional Supabase Realtime transport for standalone design demo
```

## Run with the Python evidence API

Create the local database and run the API from the repository root:

```bash
uv sync
PYTHONPATH=src uv run uvicorn radar.api:app --host 0.0.0.0 --port 8000 --reload
```

In a second terminal, run the web application against that API:

```bash
cd web
bun install
NEXT_PUBLIC_RADAR_API_URL=http://127.0.0.1:8000 bun run dev -- --port 3000
```

Open [http://localhost:3000](http://localhost:3000). The first API request imports active source snapshots into `data/project_radar.sqlite3` and exposes the evidence graph at `/api/v1/radar/snapshot`.

For the optional standalone Supabase demo transport, omit `NEXT_PUBLIC_RADAR_API_URL` and use the environment and scripts documented in `web/README.md`.

## Validate

```bash
PYTHONPATH=src uv run pytest -q
cd web && bun run build
```

The Python suite covers deterministic stage rules, conservative match review, Cleanview ingestion, ERCOT GIS ingestion, planned-gas unit preservation, exact-match ERCOT gas geospatial enrichment, TCEQ source health, and the FastAPI contract.

## Documentation

| Resource | Purpose |
| --- | --- |
| `docs/LOCAL_SETUP.md` | Local FastAPI and frontend operating guide. |
| `docs/TCEQ_SOURCE_STATUS.md` | Environmental-source access and availability boundary. |
| `docs/docs/data-contract.md` | Frontend data-contract reference. |
| `docs/docs/design-system.md` | Data Planner visual-system reference. |
| `DEMO.md` | Hackathon demonstration narrative. |

The primary implementation branch is **`feature/project-radar-mvp`**.
