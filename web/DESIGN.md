# DESIGN.md — Data Planner design system (Open Design convention)

> Source of truth for tokens and visual law. Mirrored in `app/globals.css` (CSS custom properties),
> `lib/theme.ts` + `lib/heat.ts` (engine-side values), Storybook foundations. Figma sync: post-demo,
> code → Figma. Committed at the taste gate 2026-08-08 after the three-direction bake-off.

## The direction

**Textured typographic cartography with an investor lens.** Not a dashboard — a theater. v2 (la-phase-5 baseline): dusk-chroma slate world, the tracked assets as the ONLY 3D matter (server halls, plant stacks — never generic buildings), hover-first information surface, GSAP as the motion system.
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

### Color — tiered token architecture (OKLCH · DTCG · Radix roles)

Source of truth: `tokens/dataplanner.tokens.json` (W3C DTCG Format Module 2025.10 — `$value`/`$type`,
`{alias}` refs), consumed as CSS custom properties in `app/globals.css` and mirrored to sRGB in
`lib/theme.ts` (`WORLD`) for MapLibre/GSAP. Three tiers: **primitive → semantic → component.**

**Primitives** — one petrol family stepped in OKLCH (constant hue ≈232 / chroma ≈0.04, stepped
lightness, per the Evil Martians OKLCH method), warm sand text, ember accent:

| Step | Value | Radix role |
|---|---|---|
| `deep-1 / deep-2` | `oklch(0.27/0.32 · 0.048/0.044 · 230/232)` | world: water / land (app background) |
| `deep-3` | `oklch(0.37 0.042 233)` | chrome surface — masthead, ticker, legend |
| `deep-4 / deep-5` | `oklch(0.42/0.47 …)` | overlay surface (hover card, dossier, chyron) / hovered |
| `deep-6 / deep-7` | `oklch(0.55/0.63 …)` | subtle / strong borders |
| `deep-8` | `oklch(0.72 0.026 230)` | muted foreground |
| `sand-11 / sand-12` | `oklch(0.87/0.955 · ~0.02 · 90)` | secondary / primary text |
| `ember-9/10/11` | `oklch(0.75/0.69/0.85 · 0.14/0.15/0.10 · ~60)` | solid accent / pressed / accent text & liveness |
| `red-9` | `oklch(0.63 0.21 32)` | stage calls, majors |
| heat ramp | `#5c6a79 → #93887e → #f2c49b → #ffa163 → #ffd8a8 → #fff7ea` | data marks only (`lib/heat.ts`, +0.08 BTM bonus) |

**The tonal law (learned the hard way):** UI never opposes the map — it is a *lighter tone of the
same world*. Map = steps 1–2, chrome = step 3, overlays = 4–5, borders 6–7, text = sand, accent =
ember. No paper-vs-slate contrast slams; hierarchy comes from stepped lightness, not hue warfare.

### Type
| Token | Stack | Role |
|---|---|---|
| `--font-display` | Fraunces (600/700, italic) | masthead, KPI numerals, ranks, dossier titles, map cities |
| `--font-mono` | IBM Plex Mono → ui-monospace | all data: timestamps, IDs, chips, map project labels |
| `--font-ui` | SF Pro / system sans | body copy only |

Scale: masthead 22 · KPI 30 · dossier title 21 · body 13 · data 10–11 · microcaps 8.5–9.5 with `0.18–0.3em` tracking, uppercase.

### Map texture recipe
Carto dark-matter-nolabels re-inked: water `#0f2230`, land `#26303a`, parks sage `#22332f`, white
street hairlines (majors `rgba(226,234,246,.34)`) · Terrarium hillshade tuned to slate · county
activity wash (peach fill-opacity by county MW) · dusk sky gradient + vignette + 5% grain · camera
pitch 44°, bearing −9° · assets as procedural campuses (`lib/campus.ts`): DC server-hall rows,
gas turbine-hall+stack+switchyard; zoom-scaled (sculptural far, true near); built=solid,
construction=warm, pre-FID=ghosted 55%.

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
| GSAP vocabulary | masthead/ops staggered entrances · KPI tick pulse · dossier beat stagger (power3/power2, back.out for hover card) · ticker slide+ember flash |

## Components (Storybook)
Foundations · StageBadge · SeverityTag · SourceChip · ConfidenceMeter · RelativeTime · KpiStat ·
EventCard · StageLadder · AliasCluster · DossierTimeline · TopOpportunities row · PulseMarker.

## Anti-patterns (hard no)
Card grids with drop shadows · gradients-as-decoration · blue-purple SaaS palette · icon soup ·
modal-first flows · loading spinners where a heartbeat should be · flat unlabeled minimalist maps.
