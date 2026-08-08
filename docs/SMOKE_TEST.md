# Browser Smoke Test

The Project Radar Streamlit MVP was opened successfully on 2026-08-08 after initializing its Python SQLite data layer from the committed Cleanview-derived CSV snapshot.

The rendered interface showed the intended dark Texas map, source-health pill, timeline control, stage/power/capacity filters, project metrics, source-linked live intelligence feed, evidence-backed project story, and entity-review queue. The map rendered stage-coloured markers with a CARTO basemap, and the selected project story disclosed both the source status and the confidence-bounded Radar stage.

The interface also demonstrated the intended safety behavior: candidate records with similar names, shared developer, and shared county were presented as **review candidates**, not automatically merged. The visible source-health timestamp and “Refresh snapshot” action confirmed that ingestion status is exposed rather than implied.


## Combined-source verification — 2026-08-08

After deleting the local SQLite database and restarting the application, the dashboard initialized successfully from both committed source fixtures. The interface exposed `Cleanview` and `ERCOT GIS` in the evidence-source filter and reported 1,852 visible project records totaling 441,011 MW at the default time setting.

A selected ERCOT GIS record, **18-ALPHA BESS**, displayed INR `28INR0328`, a July 31, 2026 source date, the source study phase `SS Completed, FIS Started, No IA`, and an evidence-bounded `FEL-2 / Pre-FEED` assessment at 72% confidence. The project story linked back to the official ERCOT product page and exposed the retained raw source row. ERCOT records without published project coordinates remained available to search and inspect but were not represented as map markers.

## FastAPI + Next.js migration check — 2026-08-08

The adopted Next.js map-theater frontend successfully rendered its visual shell through the same-origin proxy, but the first browser check remained at `Projects tracked 0` and `connecting`. The Python API process was running; further proxy/API response diagnostics are required before the migrated frontend can be accepted.

## FastAPI + Next.js multi-source migration — 2026-08-08

The migrated Next.js map theater successfully hydrated through the same-origin FastAPI bridge. It displayed 1,895 tracked records, 364,230 MW of data-center pipeline, 80 evidence events, and a live API status. The visible source ticker included the Cleanview gas event `Baseline gas-capacity signal: Hale Thermal is Concept`, with its 0.60 deterministic confidence. The external browser session became unavailable before a dossier click could be completed; API and automated contract tests remain the validation fallback.
