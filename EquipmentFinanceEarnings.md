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

1. **User-Settable Timer & Source Cadence Engine:** Configurable periodic execution loop that tracks and respects individual source update cadences (e.g., RSS every 15 mins, press releases hourly, quarterly earnings logs) using `APScheduler`.
2. **Configurable County Scope Flag:** CLI argument `--county-scope [top5|top10|all254]` to dynamically toggle county agenda scraping between key energy hubs (Fast mode for hackathon) and all 254 Texas counties (Full statewide mode).
3. **PDF Document Extraction Pipeline:** Integrated PDF parsing via `pdfplumber` and `pypdf` to process county commissioners' court agendas, RRC docket PDF filings, and municipal zoning attachments.
4. **Automated Continuous Ingestion:** Automatically fetches, cleans, and appends new incoming data without overwriting or duplicating existing records.
5. **Incremental Storage & Deduplication:** Hashes URLs / content IDs to prevent re-processing identical source articles across scheduled runs.
6. **Contact & Metadata Capture:** Extracts target contact person details including Name, Phone, Email, and source IP/Domain infrastructure metadata.
7. **Entity Resolution & Shell Company Deduction:** Pattern-matches registered LLCs, SPCs, land contact persons, and parent entities to deduce true ultimate parent companies funding behind secretive power plant projects.
8. **Source Data Weblink:** Record source weblink or other source data, so user can view source in browser as desired or needed.
9. **OpenAI Agent Friendly Output Schema:** Outputs standardized, structured JSONL and clean Markdown summary files designed for direct ingestion into downstream OpenAI Assistants API / custom GPT / RAG vector stores.
10. **No Code Conflicts Guarantee:** Modular architecture separating Ingestion, Parsing, Storage, and Scheduling so team members working on OpenAI prompt pipelines or UI can integrate cleanly via JSONL schemas.

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

### C. Ground-Level Early Signals (Local Filings & Permitting)
- **Railroad Commission of Texas (RRC):**
  - *Filings Focus:* Oil/Gas pipeline interconnects, casinghead gas/peaker wellhead filings, hydrogen/geothermal injection permits, surface mining reclamation dockets.
  - *Cadence:* Daily database refresh / Weekly hearings dockets.
  - *Contact Info:* RRC Main Line: (877) 228-5740 | Docket Services Email: `Hearingsdivision.efile@rrc.texas.gov` | Office: 1701 N. Congress Ave, Austin, TX.
- **County Commissioners' Court Agendas (Target Texas Energy Counties):**
  - *Focus Counties:* Harris, Fort Bend, Brazoria, Montgomery, Ector, Midland, Ward, Pecos, Nolan.
  - *Filings Focus:* Chapter 312 tax abatement agreements, county road access permits, land development variances for utility-scale battery/peaker installations.
  - *Cadence:* Published weekly on Thursdays by 5:00 PM CST (72-hour notice before Tuesday court sessions under TX Open Meetings Act).
  - *Contact Info:* County Clerk Offices / Public Notices Portal (e.g., Harris County Clerk: 713-755-6411; Fort Bend County Clerk: 281-341-8685).
- **Municipal & Authority Permitting (City Planning & Zoning):**
  - *Filings Focus:* Industrial building permits, electrical tie-in approvals, municipal utility district (MUD) annexation notices, wastewater treatment connection permits.
  - *Cadence:* Semi-monthly (1st and 3rd weeks) or monthly planning commission agenda releases.
  - *Contact Info:* Local City Development Services / Planning & Zoning Departments.

---



### D. Cadence & Dynamic Frequency Tracking Matrix
- **PR Newswire / BusinessWire RSS:** Update Cadence: Every 15-30 minutes.
- **OEM Press Rooms (GE Vernova, Siemens, Mitsubishi):** Update Cadence: Every 1-6 hours.
- **SEC / Earnings Call Transcripts:** Update Cadence: Daily sweep (peak earnings season: twice daily).
- **PUCT / ERCOT Interconnection Queue Filings:** Update Cadence: Weekly (every Friday afternoon).
- **Railroad Commission of Texas (RRC) Filings:** Update Cadence: Daily sweep (5:00 PM CST post-business marker).
- **County Commissioners' Agendas:** Update Cadence: Weekly (Thursday evening 5:00 PM CST sweep).
- **Municipal Development Permitting:** Update Cadence: Bi-weekly / Monthly (scheduled per city meeting calendar).
- **Scheduler Logic:** Dynamic cadence module polls each registered source according to its specific recorded update cadence rather than a single monolithic timer.

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
  pdfplumber==0.11.0
  pypdf==4.1.0
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
  "raw_text_summary": "Vistra Corp announced order for three GE Vernova gas turbines to support industrial grid growth in West Texas...",
  "source_data_weblink": "https://www.businesswire.com/news/home/20260115005123/en/",
  "source_ip_address": "192.0.2.45",
  "data_source_cadence": "weekly_thursday_5pm",
  "ground_level_signal": {
    "jurisdiction_type": "County Commissioners' Court / RRC",
    "governing_body": "Ward County Commissioners' Court",
    "filing_type": "Chapter 312 Tax Abatement & County Road Permit Application",
    "official_contact": {
      "office": "County Clerk / Docket Services",
      "phone": "+1-432-555-0144",
      "email": "docket@co.ward.tx.us"
    }
  },
  "contact_persons": [
    {
      "name": "Jane Doe",
      "title": "Media Relations / Project Finance",
      "phone": "+1-713-555-0199",
      "email": "j.doe@vistracorp.com"
    }
  ],
  "entity_deduction": {
    "disclosed_entity": "Lone Star Energy Ventures LLC",
    "deduced_ultimate_parent": "Vistra Corp",
    "deduction_confidence": "HIGH",
    "deduction_evidence": "Contact email domain matches parent corp; matched registered agent and turbine purchase agreement references."
  }
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
   - Dynamic County Scope: Add `--county-scope [top5|all254]` CLI argument. Defaults to `top5` (Harris, Midland, Ector, Ward, Brazoria) for rapid demo execution during hackathon; switches to `all254` for comprehensive statewide polling.
   - PDF Extraction: Integrate `pdfplumber` and `pypdf` in `utils/parser.py` to extract text from downloadable PDF agenda packets and RRC hearing dockets.
   - Source Cadence: Support per-source scheduled intervals (e.g., RSS 15m, RRC Filings 24h, County Agendas weekly Thursday 5pm) and record source update cadences dynamically.
   - Ground-Level Early Signals: Scrape and parse early regulatory indicators from Railroad Commission of Texas (RRC CASES), County Commissioners' Court agendas (Chapter 312 tax abatements), and municipal permitting.
   - Contact & Shell Company Deduction: Parse contact person details (Name, Phone, Email, IP address) and implement parent-entity deduction to link shell LLCs to ultimate funding companies.
   - Weblinks & Metadata: Include `source_data_weblink` and server/source IP metadata in all exported records.
   - Keyword Filters: Focus on Texas power plant developments across Petroleum/Gas, Solar+BESS, Geothermal, Wind, and Peakers. Companies: Vistra, NRG, CenterPoint, Constellation, GE Vernova, Siemens Energy, Mitsubishi, Entergy.
   - Zero-conflict code: Ensure modular imports and clear exception handling so network failures do not break the continuous loop.

Provide clean, production-ready Python scripts with docstrings and typing.
```

---

## 8. Hackathon Presentation & Integration Tips

- **Showcase Automated Ingestion:** Demonstrate the timer loop running live on screen during demo pitches (e.g., set `--interval-minutes 1` during presentation).
- **Data Pipeline Story:** Highlight how real-time OEM press releases (GE Vernova, Siemens) combined with utility earnings commentary (NRG, Vistra) give early signals on ERCOT grid reliability and power plant construction timelines before standard news outlets cover them.
- **Modular Interface:** The JSONL auto-exporter allows the downstream OpenAI project to query updated power plant data via simple file uploads or vector store sync.
