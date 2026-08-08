# AI + Energy Hackathon Project Build Plan: Power Plant Intelligence & Order Collector

**Target Deployment:** Houston Museum District AI + Energy Hackathon (4-Hour Dev Window)  
**Role:** Automated Web Data Ingestion & Earnings Intel Pipeline (Component of Large System)  
**Target Output:** Incremental structured project repository (JSONL / SQLite / Markdown summaries) for downstream LLM / OpenAI Agent consuming pipeline.

---

## 1. System Architecture & Objectives

### Goal
Build an automated, scheduled data collection engine that continuously monitors web sources (press releases, project finance announcements, utility/developer earnings call transcripts, OEM/EPC press releases) for power plant developments across Texas.

### Focus Areas
- **Primary:** Petroleum / Natural Gas Power Plants (Turbines, Peakers, Combined Cycle, Cogeneration, Carbon-Capture Integrated).
- **Secondary:** Solar + Battery Storage (BESS), Geothermal, Wind, and Hybrid Power Plants.
- **Key Data Extraction Targets:** Named project names, location/county, capacity (MW/GW), OEM equipment specs (GE Vernova, Siemens Energy, Mitsubishi Power), EPC contractors, CAPEX/financing figures, target commercial operation dates (COD), and ERCOT interconnection references.

---

## 2. Core Features & User Requirements

1. **User-Settable Timer / Scheduler:** Configurable periodic execution loop (e.g., run every 15 mins, 1 hour, 6 hours, or manual trigger) using `APScheduler` or native `cron`.
2. **Automated Continuous Ingestion:** Automatically fetches, cleans, and appends new incoming data without overwriting or duplicating existing records.
3. **Incremental Storage / Deduplication:** Hashes URLs / content IDs to prevent re-processing identical source articles across scheduled runs.
4. **OpenAI Agent Friendly Output Schema:** Outputs standardized, structured JSONL and clean Markdown summary files designed for direct ingestion into downstream OpenAI Assistants API / custom GPT / RAG vector stores.
5. **No Code Conflicts Guarantee:** Modular architecture separating Ingestion, Parsing, Storage, and Scheduling so team members working on OpenAI prompt pipelines or UI can integrate cleanly via JSONL schemas.
6. **Source Data Weblink:** Record source weblink or other source data, so user can view source in browser as desired or needed.

---

## 3. Data Sources & Target Websites

### A. OEM & EPC Press Release / Order Announcements
- **GE Vernova Press Room:** Gas power turbine orders, heavy-duty gas turbine contracts in ERCOT.
- **Siemens Energy Newsroom:** Gas turbine & grid technology announcements.
- **Mitsubishi Power Americas:** Hydrogen-ready gas turbines and project finance updates.
- **EPC Contractors:** Fluor, Bechtel, Burns & McDonnell, Kiewit, Zachry Group news feeds.

### B. Earnings Call Transcripts & Developer News
- **Utilities & Power Producers (Texas Focus):** NRG Energy (NRG), Vistra Corp (VST), Constellation Energy (CEG), CenterPoint Energy (CNP), Entergy Texas (ETR), Calpine, Competitive Power Ventures (CPV).
- **Renewable & Hybrid Developers:** NextEra Energy Resources (NEE), AES Corporation (AES), Ormat Technologies (ORA - Geothermal), Plus Power, Invenergy.
- **Financial & Regulatory Sources:** ERCOT Interconnection Queue announcements, Texas Military Department / PUCT press releases, PR Newswire / BusinessWire filtered feeds.

---

## 4. Technical Stack & Modular Architecture

- **Language:** Python 3.10+
- **Scheduling:** `APScheduler` / `schedule` library (supports interval loops or custom CRON strings)
- **Scraping / Fetching:** `requests`, `httpx` (async), `BeautifulSoup4`, `feedparser` (for RSS/Atom feeds)
- **Structured Data Extraction:** `pydantic` models for strict typing
- **Storage / Persistence:** SQLite database (for fast deduplication & state tracking) + JSONL append log (for OpenAI upload)
- **Formatting / Downstream AI Ready:** Export clean Markdown summaries and structured JSON.

---

## 5. Detailed Step-by-Step Build Plan (4-Hour Dev Schedule)

```
[ Hour 1: Core Setup & Schema ] -> [ Hour 2: Data Collectors & Parser ] -> [ Hour 3: Storage & Timer Loop ] -> [ Hour 4: Test & Team Handoff ]
```

### Hour 1: Schema Definition & Database Setup
- [ ] Initialize Python virtual environment and `requirements.txt`:
  ```text
  apscheduler==3.10.4
  requests==2.31.0
  beautifulsoup4==4.12.3
  feedparser==6.0.11
  pydantic==2.6.4
  pydantic-settings==2.2.1
  sqlite-utils==3.36
  rich==13.7.1
  ```
- [ ] Define SQLite database schema (`data/power_plants.db`) using two tables:
  1. `sources`: Logs raw ingested HTML/RSS articles, URL hash, timestamp, and scrape status.
  2. `extracted_projects`: Cleaned project records with project name, tech type, MW capacity, company, county, COD, status.
- [ ] Define standard Pydantic schema for project output (`schema.py`).

### Hour 2: Targeted Web Collectors & RSS Scrapers
- [ ] Build **RSS / Newsfeed Aggregator (`collectors/rss_collector.py`)**:
  - Pull from PR Newswire, BusinessWire, GlobeNewswire filtered by keywords (`"ERCOT"`, `"Texas power plant"`, `"gas turbine"`, `"solar storage Texas"`, `"GE Vernova Texas"`).
- [ ] Build **Earnings Call & Press Release Scraper (`collectors/earnings_collector.py`)**:
  - Targets major utility news feeds and earnings press release archives (NRG, Vistra, CenterPoint, Constellation).
- [ ] Implement robust text extraction logic (`utils/parser.py`) to clean HTML down to structured Markdown body text.

### Hour 3: Deduplication, Automated Appender & Timer Loop
- [ ] Implement Hash-based Deduplication in `storage/db.py` (SHA-256 of canonical URL or article title).
- [ ] Build the Configurable Scheduler (`scheduler.py`):
  - Support user CLI input / `.env` variable: `COLLECTION_INTERVAL_MINUTES=30` (or `COLLECTION_INTERVAL_HOURS=1`).
  - Set up background loop with visual logging (`rich` library) showing active runs, new items found, and skipped duplicates.
- [ ] Implement Auto-Exporter (`storage/exporter.py`):
  - Automatically appends newly extracted records to `output/latest_projects.jsonl` and `output/summary_feed.md`.

### Hour 4: Integration Test, OpenAI Prompt Prep & Handoff
- [ ] Test end-to-end execution loop with dynamic timer adjustment (e.g., test 1-minute loop, verify append behavior without duplicating rows).
- [ ] Package JSONL export path and OpenAI prompt template into team output directory.
- [ ] Verify clean compatibility with team member's OpenAI project pipeline.

---

## 6. Target JSON Schema & Output Format

### `output/latest_projects.jsonl` Sample Structure
```json
{
  "source_url": "https://www.businesswire.com/news/home/20260115005123/en/",
  "ingested_at": "2026-08-08T12:00:00Z",
  "source_type": "Press Release / OEM",
  "company_name": "Vistra Corp / GE Vernova",
  "project_name": "Permian Basin Gas Peaker Expansion",
  "power_source": "Petroleum / Natural Gas (Simple Cycle)",
  "capacity_mw": 850,
  "location_county": "Ward County, TX",
  "ercot_region": "West Texas",
  "equipment_oem": "GE Vernova 7F.05 Gas Turbines",
  "epc_contractor": "Burns & McDonnell",
  "estimated_capex_usd": "$650 Million",
  "target_cod": "Q2 2027",
  "raw_text_summary": "Vistra Corp announced order for three GE Vernova gas turbines to support industrial grid growth in West Texas..."
}
```

---

## 7. Direct Prompt Instructions for OpenAI Agent (To Code Implementation)

*Pass the following exact prompt block to your team member's OpenAI Project / Agent to generate the exact runnable code files when you are ready:*

```markdown
PROMPT FOR OPENAI AGENT / CODING ASSISTANT:

Please implement the Texas Power Plant Intelligence Data Collector tool in Python based on the following specifications:

1. ARCHITECTURE:
   - File Structure:
     ├── config.py             # User settable timer and environmental configs
     ├── main.py               # Application entry point with CLI arguments
     ├── scheduler.py          # APScheduler loop for background collection
     ├── storage.py            # SQLite deduplication database and JSONL appender
     ├── collectors/
     │   ├── base.py           # Base Scraper abstract class
     │   ├── press_releases.py # RSS & PR Newswire query fetcher
     │   └── earnings.py       # Developer earnings and release scraper
     └── utils/
         └── parser.py         # Text cleaning and keyword entity extractor

2. KEY REQUIREMENTS:
   - User-settable interval via command line `--interval-minutes N` or environment variable `INTERVAL_MINUTES`.
   - Continuous background running mode that executes collection on schedule.
   - Deduplication: Maintain an SQLite database (`data/collector.db`) tracking hashed article URLs. Never append duplicate records.
   - Outputs: Append newly collected data into `output/power_plants_feed.jsonl` and auto-generate an updated `output/digest.md`.
   - Keyword Filters: Focus on Texas power plant developments across Petroleum/Gas, Solar+BESS, Geothermal, Wind, and Peakers. Companies: Vistra, NRG, CenterPoint, Constellation, GE Vernova, Siemens Energy, Mitsubishi, Entergy.
   - Zero-conflict code: Ensure modular imports and clear exception handling so network failures do not break the continuous loop.

Provide clean, production-ready Python scripts with docstrings and typing.
```

---

## 8. Hackathon Presentation & Integration Tips

- **Showcase Automated Ingestion:** Demonstrate the timer loop running live on screen during demo pitches (e.g., set `--interval-minutes 1` during presentation).
- **Data Pipeline Story:** Highlight how real-time OEM press releases (GE Vernova, Siemens) combined with utility earnings commentary (NRG, Vistra) give early signals on ERCOT grid reliability and power plant construction timelines before standard news outlets cover them.
- **Modular Interface:** The JSONL auto-exporter allows the downstream OpenAI project to query updated power plant data via simple file uploads or vector store sync.
