# Project Radar

A live situation screen for U.S. energy capital projects — Texas first. Interconnection queues, utility-commission dockets, environmental permits, county agendas, and press are stitched into one addictive, self-updating map.

## What it does

- **Live map + signal wire** — every new filing appears in the feed within seconds and pulses its project on the map. Realtime via Supabase; the UI degrades invisibly to 5-second polling if the channel drops.
- **Entity resolution, made visible** — a project's dossier shows its canonical name and every resolved alias (LLC, queue name, permit name) with per-alias confidence.
- **Stage inference, made visible** — the FEL ladder (concept → FEL-1 → FEL-2/pre-FEED → FEED → interconnection agreement → FID → construction → COD) with a confidence meter and the filings that justify each call.
- **One-screen story** — click any project and its entire cross-source history renders on a single screen with provenance links.

## Architecture

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (App Router), deployed on Vercel |
| Map | MapLibre GL + deck.gl overlays (no vendor token) |
| Data | Supabase Postgres + Realtime — see [Data contract](data-contract.md) |
| Tokens | `web/DESIGN.md` → CSS custom properties → Tailwind (see [Design system](design-system.md)) |
| Components | Storybook + Chromatic visual testing; Playwright smoke tests |
| Secrets | Doppler (`energy-hackathon`) |

## Running it

```bash
cd web
doppler run -- bun dev                          # app on :3000
doppler run -- bun scripts/simulate-feed.ts --seed   # one-time backfill
doppler run -- bun scripts/simulate-feed.ts --live   # demo heartbeat
bun run storybook                                # component library on :6006
```

## What we'd build with another week

National coverage beyond ERCOT; live scrapers on cron for every source; LLM stage-inference with eval harness; alerting (stage-change push/email); the Track-2 join — speakers ↔ projects in one graph.
