# Design system

Tokens live in code — `web/DESIGN.md` (Open Design convention) is the source of truth, mirrored as CSS custom properties in `web/app/globals.css` and consumed by Tailwind, the app, and Storybook. Figma sync is a post-demo step (tokens flow code → Figma, not the reverse, during the hackathon).

*This page is finalized after the direction bake-off — the chosen direction's palette, type system, and motion vocabulary land here.*

## Principles

1. **Data visualizer first, not a SaaS.** The map is the hero; chrome exists to frame signal.
2. **Color only where it means something** — stage ramp, severity, liveness. Everything else is ink.
3. **Numbers are monospaced and tabular.** Timestamps are relative and alive.
4. **Motion = information.** A pulse is a new filing; a wipe is a stage change. No decorative animation.

## Component inventory (Storybook)

Foundations (tokens) · StageBadge · SeverityTag · SourceChip · ConfidenceMeter · RelativeTime · KpiStat · EventCard (feed item) · StageLadder · AliasCluster · DossierTimeline · PulseMarker (map dot states).

Run locally: `cd web && bun run storybook`. Visual regression: Chromatic (`bunx chromatic`).
