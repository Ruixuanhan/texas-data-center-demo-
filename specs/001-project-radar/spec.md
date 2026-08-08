# Spec 001 — Project Radar (frontend/visualization unit)

**Status:** accepted · **Owner:** design/frontend unit · **Date:** 2026-08-08 (hackathon day)

## Problem

Capital projects in the U.S. energy pipeline are scattered across a dozen disconnected public systems under different names per stage. No live single source of truth exists. The winning build parses+aggregates (ingestion unit) AND presents it addictively (this unit).

## Acceptance criteria (mirrors judging criteria)

1. **Liveness** — the deployed screen visibly updates itself: new signals appear in the feed within seconds of insert, markers pulse, KPIs tick. Feed simulator guarantees motion independent of ingestion cadence; real ingestion rows interleave with zero code change.
2. **Addictive presentation** — a non-technical person understands the screen in <10s and wants to keep watching. Map is the hero. No generic SaaS dashboard patterns. Design direction chosen by taste judge from 3 divergent mockups.
3. **Entity resolution made visible** — project dossier shows canonical name + alias cluster (LLC / queue name / permit name) with per-alias confidence.
4. **Stage inference made visible** — 8-rung ladder (concept→FEL-1→FEL-2/pre-FEED→FEED→IA→FID→construction→COD) with confidence meter and provenance-linked stage history.
5. **One-screen story** — click any project → its entire stitched history across every source on a single screen.
6. **Extensibility** — typed data contract (supabase/migrations/0001_init.sql), tokens as code (DESIGN.md), component stories (Storybook), visual regression hook (Chromatic), smoke test (Playwright), docs (Zensical).

## Non-goals (today)

Auth, user accounts, mobile layout, national coverage (Texas-first), Figma sync (post-demo), WAF tuning.

## Architecture

Next.js 15 App Router (`web/`, bun) on Vercel · MapLibre GL + deck.gl overlays (no vendor token) · Supabase Postgres + Realtime (contract: `../../supabase/migrations/0001_init.sql`) · secrets via Doppler `energy-hackathon` · tokens: `web/DESIGN.md` → Tailwind theme.

## Data contract summary

`projects` (slug-upserted resolved entities, denormalized current_stage+confidence) · `project_aliases` (ER evidence) · `source_events` (feed + dossier timeline; nullable project_id = unattributed lane) · `stage_history` (stage+confidence+rationale+evidence). Realtime on all; RLS anon-SELECT; service-role writes only; columns add-nullable-only.
