# DESIGN.md — Radar/TX design system (Open Design convention)

> Source of truth for tokens and visual law. Mirrored in `app/globals.css` (CSS custom properties),
> `lib/theme.ts` + `lib/heat.ts` (engine-side values), Storybook foundations. Figma sync: post-demo,
> code → Figma. Committed at the taste gate 2026-08-08 after the three-direction bake-off.

## The direction

**Textured typographic cartography with an investor lens.** Not a dashboard — a theater.
The map is the interface; chrome exists only to frame signal. Lineage: monitor-the-situation's
watchability, ashMeteo's data-as-matter and camera-as-narrator, wc26/FT's editorial restraint,
Geolava's austere domain credibility.

## Principles (enforced in review)

1. **Data is the interface.** Any box, border, or fill must justify itself against "would the map alone say this better?"
2. **Color = money temperature, nothing else.** The heat ramp (cold steel → petrol → ember → white-hot) encodes
   `0.5·stage-earliness + 0.28·recency + 0.22·MW` (`lib/heat.ts`). UI chrome stays ink; only signal wears color.
3. **Typography is cartography.** City names are editorial serif objects on the map itself; hot projects earn
   their names in mono. Numbers are display-serif heroes in the masthead, tabular mono in the data.
4. **Motion is information.** Pulse = new filing · arc = document flying from its agency to the site ·
   camera flight = attention shift · chyron = stage call. No decorative animation.
5. **Domain texture is the brand.** Docket numbers, queue IDs, county names, confidence values — shown raw.
   That specificity is what makes it credible (and un-SaaS).

## Tokens

### Color
| Token | Value | Role |
|---|---|---|
| `--bg` | `#0a0e13` | theater black (warm-shifted) |
| `--bg-raise` / `--bg-panel` | `#0e131a` / `#131a23` | overlay inks |
| `--line` / `--line-strong` | `rgba(224,210,187,.09/.18)` | warm hairlines — never solid borders |
| `--text` / `--text-dim` / `--text-faint` | `#e9e4da` / `#9a958a` / `#5f5c54` | warm paper text ramp |
| `--accent` / `--signal-notable` | `#ffb454` | ember — notable signal, brand accent |
| `--signal-major` | `#ff5d49` | stage calls, majors |
| `--live` | `#ffd8a8` | liveness indicator |
| heat ramp | `#38485c → #346c7a → #dea83e → #ff8954 → #ffd8a8 → #fff7ea` | `lib/heat.ts` RAMP — money temperature |
| stage ramp | `lib/theme.ts` STAGE_COLORS | dossier ladder + badges only |

### Type
| Token | Stack | Role |
|---|---|---|
| `--font-display` | Fraunces (600/700, italic) | masthead, KPI numerals, ranks, dossier titles, map cities |
| `--font-mono` | IBM Plex Mono → ui-monospace | all data: timestamps, IDs, chips, map project labels |
| `--font-ui` | SF Pro / system sans | body copy only |

Scale: masthead 22 · KPI 30 · dossier title 21 · body 13 · data 10–11 · microcaps 8.5–9.5 with `0.18–0.3em` tracking, uppercase.

### Map texture recipe
Carto dark-matter-nolabels, land re-inked `#10161e`, water `#060a10` · Terrarium DEM hillshade
(exaggeration 0.8, shadow `#04070b`) · TX county hairlines `rgba(214,196,161,.10)` · vignette
`radial 52%→rgba(3,5,8,.62)` · SVG grain overlay at 5% (blend: overlay) · camera pitch 44°, bearing −9°.

### Motion
| Move | Spec |
|---|---|
| feed-in | 1.2s cubic-bezier(.2,.8,.2,1), accent wash decays |
| pulse ring | 2.2s loop, radius 5→35km, alpha 210→0, heat-colored |
| filing arc | 8s TTL, ember source → heat target, width 1.6 |
| column rise | 900ms cubic ease-out on elevation |
| intro flight | 3.2s zoom 4.3/flat → 5.55/pitch 44 |
| select flight | zoom 8.0, pitch 52, bearing −18, speed .85 |
| stage chyron | slide-up 0.5s, major-red spine |

## Components (Storybook)
Foundations · StageBadge · SeverityTag · SourceChip · ConfidenceMeter · RelativeTime · KpiStat ·
EventCard · StageLadder · AliasCluster · DossierTimeline · TopOpportunities row · PulseMarker.

## Anti-patterns (hard no)
Card grids with drop shadows · gradients-as-decoration · blue-purple SaaS palette · icon soup ·
modal-first flows · loading spinners where a heartbeat should be · flat unlabeled minimalist maps.
