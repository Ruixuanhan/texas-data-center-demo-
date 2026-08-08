# Local Development Setup Guide

This guide explains how to run Project Radar locally in WSL with the FastAPI backend and Next.js frontend.

## Prerequisites

- **WSL 2** with Python 3.11+ and Node.js 22+
- **uv** for Python package management (installed: 0.11.21)
- **npm** for Node.js dependencies (installed: 10.9.8)

## Environment Cleanup

**Stop any existing Streamlit processes:**
```bash
pkill -f streamlit
```

The legacy Streamlit app is retired; the MVP uses FastAPI + Next.js instead.

## Backend Setup (Python FastAPI)

### 1. Sync Python Dependencies
```bash
cd /home/qinxuan/personal_proj/texas-data-center-demo-
uv sync
```

This installs:
- `fastapi>=0.115`
- `uvicorn[standard]>=0.30`
- `pandas>=2.2`
- `SQLAlchemy>=2.0`
- And other required packages

### 2. Run the API Server

```bash
PYTHONPATH=src uv run uvicorn radar.api:app --port 8000 --reload
```

**Explanation:**
- `PYTHONPATH=src` — Tells Python to import from the `src/` directory
- `--reload` — Enables hot-reload during development (optional, remove for production)
- API available at: **http://127.0.0.1:8000**
- API docs at: **http://127.0.0.1:8000/docs**

## Frontend Setup (Next.js + MapLibre)

### 1. Install Node.js Dependencies

```bash
cd web
npm install
```

This installs:
- Next.js 16
- React 19
- MapLibre GL
- deck.gl
- And build/dev tools

**Note:** The repo specifies `bun@1.3.14` as the package manager. If you install bun later, you can replace npm commands with `bun` commands.

### 2. Run the Development Server

```bash
cd web
RADAR_API_UPSTREAM=http://127.0.0.1:8000 npm run dev -- --port 3000
```

**Explanation:**
- `RADAR_API_UPSTREAM` — Points to your local backend API
- Frontend available at: **http://localhost:3000**
- Uses Next.js dev server with hot reload

**Alternative (if using bun):**
```bash
RADAR_API_UPSTREAM=http://127.0.0.1:8000 bun run dev -- --port 3000
```

## Running Both Services Locally

### Option A: Two Terminal Windows

**Terminal 1 (Backend):**
```bash
cd /home/qinxuan/personal_proj/texas-data-center-demo-
PYTHONPATH=src uv run uvicorn radar.api:app --port 8000 --reload
```

**Terminal 2 (Frontend):**
```bash
cd /home/qinxuan/personal_proj/texas-data-center-demo-/web
RADAR_API_UPSTREAM=http://127.0.0.1:8000 npm run dev -- --port 3000
```

### Option B: Using a Process Manager

You can use `nohup` to run both in the background:

```bash
# Start backend
nohup bash -c 'cd /home/qinxuan/personal_proj/texas-data-center-demo- && PYTHONPATH=src uv run uvicorn radar.api:app --port 8000' > backend.log 2>&1 &

# Start frontend
nohup bash -c 'cd /home/qinxuan/personal_proj/texas-data-center-demo-/web && RADAR_API_UPSTREAM=http://127.0.0.1:8000 npm run dev -- --port 3000' > frontend.log 2>&1 &
```

Check logs:
```bash
tail -f backend.log
tail -f frontend.log
```

## Testing & Validation

### 1. Check Python Tests

```bash
cd /home/qinxuan/personal_proj/texas-data-center-demo-
uv run pytest
```

Expected: **14 tests pass** ✓

### 2. Check Frontend Build

```bash
cd web
npm run build
```

This validates TypeScript and bundle size. Should succeed without errors.

### 3. Verify API

```bash
curl http://127.0.0.1:8000/docs
curl http://127.0.0.1:8000/api/v1/radar/projects
curl http://127.0.0.1:8000/api/v1/radar/source-status
```

### 4. Access the Web App

Navigate to **http://localhost:3000** in your browser.

## Data Sources

The MVP ingests three committed source snapshots:

1. **Cleanview Data Centers** — `texas_datacenter_projects.csv`
2. **ERCOT GIS July 2026** — `data/fixtures/ercot_gis_july_2026.xlsx`
3. **Cleanview Planned Gas** — `cleanview_gas_plants.csv`

Source status and evidence lineage:
- See [docs/TCEQ_SOURCE_STATUS.md](docs/TCEQ_SOURCE_STATUS.md)
- See [docs/BUSINESS_VALUE_RESEARCH.md](docs/BUSINESS_VALUE_RESEARCH.md)

## Environment Variables

| Variable | Purpose | Example |
| --- | --- | --- |
| `PYTHONPATH` | Python import path | `src` |
| `RADAR_API_UPSTREAM` | Frontend API endpoint | `http://127.0.0.1:8000` |
| `DATABASE_URL` | (Optional) PostgreSQL connection | `postgresql://user:pass@host:5432/radar` |

By default, the app uses **SQLite** (`data/project_radar.sqlite3`).

## Troubleshooting

### Python imports fail
```bash
# Ensure PYTHONPATH is set correctly
PYTHONPATH=src uv run python -c "from radar.api import app; print('OK')"
```

### Frontend can't connect to backend
- Verify backend is running: `curl http://127.0.0.1:8000/docs`
- Check `RADAR_API_UPSTREAM` environment variable is set
- Check browser console for CORS errors

### Port already in use
```bash
# Find process using port 8000
lsof -i :8000
# Find process using port 3000
lsof -i :3000
# Kill if needed
kill -9 <PID>
```

### Node modules issues
```bash
cd web
rm -rf node_modules
npm install --force
```

## Next Steps

- Review [DESIGN.md](web/DESIGN.md) for architecture and UI decisions
- Check [docs/SMOKE_TEST.md](docs/SMOKE_TEST.md) for validation scenarios
- Read source comments in `src/radar/services/` for entity resolution and staging logic

---

**Last updated:** 2026-08-08 | **MVP Branch:** `feature/project-radar-mvp`
