# Project Radar Web

This directory contains the primary **Next.js map-theater frontend** for Project Radar. It does not query Supabase and does not own project data. The authoritative data path is the Python FastAPI service in `../src/radar/api.py`.

## Run in development

Start the Python evidence API from the repository root first:

```bash
PYTHONPATH=src uvicorn radar.api:app --host 0.0.0.0 --port 8000
```

Then install and run the web application:

```bash
bun install
RADAR_API_UPSTREAM=http://127.0.0.1:8000 bun run dev -- --hostname 0.0.0.0 --port 3000
```

Open [http://localhost:3000](http://localhost:3000). The browser calls `/api/v1/radar/snapshot`; `next.config.ts` proxies that same-origin path to `RADAR_API_UPSTREAM`.

## Data contract

`lib/useLiveData.ts` polls the FastAPI snapshot every eight seconds. The snapshot contains source-backed projects, evidence events, deterministic stage history, source-key aliases, match-review candidates, and ingestion-run health. The map, dossier, ticker, and investor-ranking UI render only this Python-generated contract.

## Build

```bash
bun run build
bun run start
```

For deployment, set `RADAR_API_UPSTREAM` to the reachable FastAPI service URL. Set `NEXT_PUBLIC_RADAR_API_URL` only when deliberately bypassing the same-origin proxy and configuring CORS accordingly.
