# Data contract

Frozen at kickoff (`supabase/migrations/0001_init.sql`). Columns are **add-nullable-only**; never rename. Writers use the service role; the frontend reads with the anon key (RLS `SELECT` policies).

## Tables

### `projects` — one row per resolved entity
Upsert key: `slug`. Carries denormalized `current_stage` + `stage_confidence` for map styling, plus `headline` and `last_activity` for tooltips and sorting.

### `project_aliases` — entity-resolution evidence
`alias`, `alias_type` (`llc | permit_name | queue_name | docket_name | press_name`), `confidence`. Renders as the dossier's alias cluster.

### `source_events` — the live feed and dossier timeline
`project_id` is **nullable** — unattributed signals are a feature (the "resolution pending" lane). `source` enum covers `ercot_gis, ercot_rioo, ercot_mora, puct, ferc, tceq, rrc, county, municipal, press, earnings, oem_epc, cleanview, simulator, manual`. `severity ∈ low | notable | major` drives feed treatment. Every event should carry a `url` (provenance).

### `stage_history` — stage inference with provenance
`stage`, `confidence` (0–1), `rationale`, `evidence_event_ids[]`, `inferred_by ∈ rules | llm | human`.

## Realtime channels

The frontend subscribes to `postgres_changes`:

- `source_events` INSERT → feed item + map pulse
- `stage_history` INSERT → stage-change chyron
- `projects` UPDATE → marker restyle + KPI tick

RLS must allow anon `SELECT` on all four tables or realtime delivers nothing — this is enabled in the migration.

## Rules of engagement

1. Ingestion **INSERTs** `source_events` / `stage_history` / `project_aliases`; **UPSERTs** `projects` on `slug`.
2. Add columns as nullable; never rename or repurpose.
3. Every event carries a source `url`.
4. Stage values come from the shared enum: `concept, fel1, fel2, feed, ia, fid, construction, cod, operational, canceled, unknown`.
