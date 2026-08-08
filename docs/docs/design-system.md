# Design system

Tokens live in code — `web/DESIGN.md` (Open Design convention) is the source of truth, mirrored as CSS custom properties in `web/app/globals.css` and consumed by Tailwind, the app, and Storybook. Figma sync is a post-demo step (tokens flow code → Figma, not the reverse, during the hackathon).

**Committed direction (ratified at the taste gate):** textured typographic cartography with an investor lens. Near-black warm theater (`#0a0e13`), hillshade + county hairlines + grain as texture, Fraunces as the editorial display voice, IBM Plex Mono for data, and a single heat ramp (cold steel → ember → white-hot) encoding `0.5·stage-earliness + 0.28·recency + 0.22·MW`. Chromatic baseline: build 1, 7 stories.

## Principles

1. **Data visualizer first, not a SaaS.** The map is the hero; chrome exists to frame signal.
2. **Color only where it means something** — stage ramp, severity, liveness. Everything else is ink.
3. **Numbers are monospaced and tabular.** Timestamps are relative and alive.
4. **Motion = information.** A pulse is a new filing; a wipe is a stage change. No decorative animation.

## Component inventory (Storybook)

Foundations (tokens) · StageBadge · SeverityTag · SourceChip · ConfidenceMeter · RelativeTime · KpiStat · EventCard (feed item) · StageLadder · AliasCluster · DossierTimeline · PulseMarker (map dot states).

Run locally: `cd web && bun run storybook`. Visual regression: Chromatic (`bunx chromatic`).
