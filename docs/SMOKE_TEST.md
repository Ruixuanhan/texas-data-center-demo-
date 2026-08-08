# Browser Smoke Test

The Project Radar Streamlit MVP was opened successfully on 2026-08-08 after initializing its Python SQLite data layer from the committed Cleanview-derived CSV snapshot.

The rendered interface showed the intended dark Texas map, source-health pill, timeline control, stage/power/capacity filters, project metrics, source-linked live intelligence feed, evidence-backed project story, and entity-review queue. The map rendered stage-coloured markers with a CARTO basemap, and the selected project story disclosed both the source status and the confidence-bounded Radar stage.

The interface also demonstrated the intended safety behavior: candidate records with similar names, shared developer, and shared county were presented as **review candidates**, not automatically merged. The visible source-health timestamp and “Refresh snapshot” action confirmed that ingestion status is exposed rather than implied.


## Combined-source verification — 2026-08-08

After deleting the local SQLite database and restarting the application, the dashboard initialized successfully from both committed source fixtures. The interface exposed `Cleanview` and `ERCOT GIS` in the evidence-source filter and reported 1,852 visible project records totaling 441,011 MW at the default time setting.

A selected ERCOT GIS record, **18-ALPHA BESS**, displayed INR `28INR0328`, a July 31, 2026 source date, the source study phase `SS Completed, FIS Started, No IA`, and an evidence-bounded `FEL-2 / Pre-FEED` assessment at 72% confidence. The project story linked back to the official ERCOT product page and exposed the retained raw source row. ERCOT records without published project coordinates remained available to search and inspect but were not represented as map markers.
