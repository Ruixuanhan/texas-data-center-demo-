# Radar/TX — live energy capex intelligence

**Track 1 · Project Radar · Candid Intelligence Hackathon, Houston, 2026-08-08**

A live situation screen for Texas energy capital projects. Interconnection queues, utility-commission
dockets, environmental permits, county agendas, and press are stitched into one self-updating,
textured, typographic map — built for the origination question: *which projects are real, which are
early, and who is driving them.*

## What it does

- **Live theater** — every new filing slides into the wire, pulses its project on the map, and flies
  an arc from the agency it came from (PUCT/TCEQ/ERCOT → Austin, FERC → DC) to the site. Supabase
  Realtime with an invisible 5s-polling fallback.
- **Investor heat** — one score (`0.5·stage-earliness + 0.28·recency + 0.22·MW`) drives every visual
  channel: marker color/size, extruded MW columns, the "Where the money should look" live ranking.
  Early + big + moving = white-hot.
- **Entity resolution, visible** — each dossier shows the canonical project plus its aliases (LLC,
  queue name, permit name) with per-alias confidence. Unattributed signals get their own lane.
- **Stage inference, visible** — the FEL ladder (concept → FEL-1 → FEL-2/pre-FEED → FEED → IA → FID →
  construction → COD) with confidence and the filings that justify each call. Stage changes fire a
  live "stage call" chyron.
- **One-screen story** — click any project: its whole cross-source history, provenance-linked.

## Architecture

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (App Router, bun) · `web/` |
| Map | MapLibre GL + deck.gl — hillshade (open Terrarium DEM), county hairlines, typographic labels (Fraunces/Plex), heat columns, arcs. No vendor token. |
| Data | Supabase Postgres + Realtime · contract in `supabase/migrations/0001_init.sql` |
| Liveness insurance | `web/scripts/simulate-feed.ts` — seeds 60 days of history, streams events every 20–60s; real ingestion rows interleave with zero code change |
| Design system | `web/DESIGN.md` (tokens as code) → CSS vars → Tailwind/Storybook; Chromatic visual tests; Playwright smoke |
| Docs | `docs/` (Zensical) — data contract + design system |
| Secrets | Doppler `energy-hackathon` |

## Run it

```bash
cd web && bun install
doppler run -- bun scripts/migrate.ts             # apply schema (pooler auto-discovery)
doppler run -- bun scripts/simulate-feed.ts --seed
doppler run -- bun dev                            # app on :3000
doppler run -- bun scripts/simulate-feed.ts --live  # demo heartbeat
```

## Sources wired today / next

Seeded from a Cleanview-derived Texas data-center dataset (50 projects, real coordinates), enriched
with a simulated multi-source filing stream that exercises the full contract. The ingestion pipeline
(teammates) writes the same tables live: ERCOT GIS/RIOO, PUCT Interchange, TCEQ ePermit, FERC
eLibrary, RRC, county agendas, press.

**With another week:** real scrapers on cron for every source; LLM entity-resolution + stage
inference with eval harness; the time-machine scrub (replay 60 days of filings cinematically);
stage-change alerting; the Track-2 join — conference speakers ↔ these projects, one graph.
