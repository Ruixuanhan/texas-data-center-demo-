#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "httpx",
#   "rich",
# ]
# ///
"""
ferc-query.py — Query FERC eLibrary and store results in SQLite.

Default example query: "Texas Amazon Google Meta"
  Searches full-text + description for filings/issuances mentioning
  Texas data-center applicants (Amazon, Google, Meta) across all libraries.

Usage:
    uv run ferc-query.py
    uv run ferc-query.py --search "Texas data center" --db ferc.db
    uv run ferc-query.py --search "Amazon" --from-date 2024-01-01 --to-date 2024-12-31
    uv run ferc-query.py --docket "ER24-1234" --db ferc.db
    uv run ferc-query.py --list            # show stored documents
    uv run ferc-query.py --stats           # show DB stats

API base: https://elibrary.ferc.gov/eLibrarywebapi/api/
Endpoint: POST /Search/AdvancedSearch
"""

import argparse
import json
import sqlite3
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

import httpx
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn
from rich.table import Table

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
API_BASE = "https://elibrary.ferc.gov/eLibrarywebapi/api"
SEARCH_ENDPOINT = f"{API_BASE}/Search/AdvancedSearch"
SCHEMA_FILE = Path(__file__).parent / "ferc-elibrary-search-schema.sql"
DEFAULT_DB = "ferc.db"
DEFAULT_SEARCH = "Texas Amazon Google Meta"
RESULTS_PER_PAGE = 100

console = Console()


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
def init_db(db_path: str) -> sqlite3.Connection:
    """Open (or create) the SQLite DB and apply the schema."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")

    if SCHEMA_FILE.exists():
        conn.executescript(SCHEMA_FILE.read_text())
    else:
        # Inline schema fallback if .sql file is not alongside the script
        conn.executescript(_INLINE_SCHEMA)

    conn.commit()
    return conn


def upsert_docket(conn: sqlite3.Connection, docket_number: str) -> int:
    """Insert or fetch a docket row by its full number, return row id."""
    parts = docket_number.split("-")
    # Best-effort: last segment is sub-docket if all digits, else '000'
    if len(parts) >= 2 and parts[-1].isdigit() and len(parts[-1]) == 3:
        sub = parts[-1]
        short = "-".join(parts[:-1])
    else:
        sub = "000"
        short = docket_number

    cur = conn.execute(
        "SELECT id FROM ferc_dockets WHERE docket_full_number = ?", (docket_number,)
    )
    row = cur.fetchone()
    if row:
        return row["id"]

    cur = conn.execute(
        """
        INSERT INTO ferc_dockets
            (docket_short_number, sub_docket_number, docket_full_number)
        VALUES (?, ?, ?)
        """,
        (short, sub, docket_number),
    )
    return cur.lastrowid


def upsert_document(conn: sqlite3.Connection, hit: dict) -> int:
    """Insert or update a document from a search hit, return row id."""
    accession = hit.get("acesssionNumber") or hit.get("accessionNumber") or ""
    if not accession:
        return None

    cur = conn.execute(
        "SELECT id FROM ferc_documents WHERE accession_number = ?", (accession,)
    )
    row = cur.fetchone()

    category = hit.get("category", "Submittal")
    if category not in ("Issuance", "Submittal"):
        category = "Submittal"

    avail = hit.get("availCode", "p")
    if avail not in ("p", "c", "s", "n"):
        avail = "p"

    family = hit.get("familyValue", "None")
    if family not in ("None", "none", "child", "Parent"):
        family = "None"

    fields = dict(
        document_id=hit.get("documentId"),
        accession_number=accession,
        category=category,
        availability=avail,
        family_value=family,
        description=hit.get("description"),
        summary=hit.get("summary"),
        filed_date=_norm_date(hit.get("filedDate")),
        issued_date=_norm_date(hit.get("issuedDate")),
        posted_date=_norm_date(hit.get("postedDate")),
        relevance_score=hit.get("score"),
    )

    if row:
        doc_id = row["id"]
        conn.execute(
            """
            UPDATE ferc_documents SET
                document_id=:document_id, category=:category,
                availability=:availability, family_value=:family_value,
                description=:description, summary=:summary,
                filed_date=:filed_date, issued_date=:issued_date,
                posted_date=:posted_date, relevance_score=:relevance_score
            WHERE accession_number=:accession_number
            """,
            fields,
        )
    else:
        cur = conn.execute(
            """
            INSERT INTO ferc_documents
                (document_id, accession_number, category, availability, family_value,
                 description, summary, filed_date, issued_date, posted_date,
                 relevance_score)
            VALUES
                (:document_id, :accession_number, :category, :availability, :family_value,
                 :description, :summary, :filed_date, :issued_date, :posted_date,
                 :relevance_score)
            """,
            fields,
        )
        doc_id = cur.lastrowid

    # Dockets
    for dn in hit.get("docketNumbers", []):
        docket_row_id = upsert_docket(conn, dn)
        conn.execute(
            """
            INSERT OR IGNORE INTO ferc_document_dockets (document_id, docket_id, docket_text)
            VALUES (?, ?, ?)
            """,
            (doc_id, docket_row_id, dn),
        )

    # Class types
    conn.execute("DELETE FROM ferc_document_class_types WHERE document_id = ?", (doc_id,))
    for ct in hit.get("classTypes", []):
        dc = ct.get("documentClass", "")
        dt = ct.get("documentType", "")
        if dc or dt:
            conn.execute(
                "INSERT INTO ferc_document_class_types (document_id, document_class, document_type) VALUES (?,?,?)",
                (doc_id, dc, dt),
            )

    # Libraries
    conn.execute("DELETE FROM ferc_document_libraries WHERE document_id = ?", (doc_id,))
    valid_libs = {"General", "Electric", "Gas", "Oil", "Rulemaking", "Hydro"}
    for lib in hit.get("libraries", []):
        if lib in valid_libs:
            conn.execute(
                "INSERT INTO ferc_document_libraries (document_id, library) VALUES (?,?)",
                (doc_id, lib),
            )

    # Affiliations
    conn.execute("DELETE FROM ferc_affiliations WHERE document_id = ?", (doc_id,))
    valid_affil = {"author", "agent", "recipient"}
    for af in hit.get("affiliations", []):
        af_type = af.get("afType", "author")
        if af_type not in valid_affil:
            af_type = "author"
        conn.execute(
            """
            INSERT INTO ferc_affiliations
                (document_id, affil_type, organization, last_name, first_initial, middle_initial)
            VALUES (?,?,?,?,?,?)
            """,
            (
                doc_id,
                af_type,
                af.get("affiliation"),
                af.get("lastName"),
                af.get("firstInitial"),
                af.get("middleInitial"),
            ),
        )

    # Transmittals
    conn.execute("DELETE FROM ferc_transmittals WHERE document_id = ?", (doc_id,))
    for tx in hit.get("transmittals", []):
        fid = tx.get("fileId", "")
        if fid:
            conn.execute(
                """
                INSERT OR IGNORE INTO ferc_transmittals
                    (document_id, file_id, file_type, file_format, file_name,
                     file_description, file_size_bytes, transmittal_fk)
                VALUES (?,?,?,?,?,?,?,?)
                """,
                (
                    doc_id,
                    fid,
                    tx.get("fileType"),
                    tx.get("fileFormat"),
                    tx.get("fileName"),
                    tx.get("fileDesc"),
                    tx.get("fileSize"),
                    tx.get("transmittalFk"),
                ),
            )

    return doc_id


def log_search_request(
    conn: sqlite3.Connection,
    payload: dict,
    response: dict,
    date_filters: list[dict],
) -> int:
    """Insert a row into ferc_search_requests, return its id."""
    cur = conn.execute(
        """
        INSERT INTO ferc_search_requests
            (search_type, search_text, search_fulltext, search_desc,
             all_dates, efiling_only, sort_by, group_by,
             results_per_page, cur_page,
             total_hits, num_hits, success, error_message)
        VALUES
            ('general', :search_text, :search_fulltext, :search_desc,
             :all_dates, :efiling_only, :sort_by, :group_by,
             :results_per_page, :cur_page,
             :total_hits, :num_hits, :success, :error_message)
        """,
        dict(
            search_text=payload.get("searchText"),
            search_fulltext=int(payload.get("searchFullText", True)),
            search_desc=int(payload.get("searchDescription", True)),
            all_dates=int(payload.get("allDates", False)),
            efiling_only=int(payload.get("eFiling", False)),
            sort_by=payload.get("sortBy", ""),
            group_by=payload.get("groupBy", "NONE"),
            results_per_page=payload.get("resultsPerPage", RESULTS_PER_PAGE),
            cur_page=payload.get("curPage", 1),
            total_hits=response.get("totalHits"),
            num_hits=response.get("numHits"),
            success=int(response.get("success", False)),
            error_message=str(response.get("errorMessage")) if response.get("errorMessage") else None,
        ),
    )
    request_id = cur.lastrowid

    # Docket filters
    for df in payload.get("docketSearches", []):
        conn.execute(
            """
            INSERT INTO ferc_request_docket_filters (request_id, docket_number, sub_docket_numbers)
            VALUES (?, ?, ?)
            """,
            (request_id, df.get("docketNumber"), json.dumps(df.get("subDocketNumbers") or [])),
        )

    # Date filters
    for df in date_filters:
        conn.execute(
            """
            INSERT INTO ferc_request_date_filters (request_id, date_type, start_date, end_date)
            VALUES (?, ?, ?, ?)
            """,
            (request_id, df["dateType"], df["startDate"], df["endDate"]),
        )

    return request_id


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------
def build_payload(
    search_text: str,
    docket_number: str | None,
    from_date: str | None,
    to_date: str | None,
    page: int = 1,
    idol_result_id: str = "",
) -> tuple[dict, list[dict]]:
    """Build the AdvancedSearch POST body. Returns (payload, date_filters)."""
    docket_searches = []
    if docket_number:
        docket_searches.append({"docketNumber": docket_number, "subDocketNumbers": []})

    date_searches = []
    date_filters_meta = []
    if from_date and to_date:
        ds = {"dateType": "filed_date", "startDate": from_date, "endDate": to_date}
        date_searches.append(ds)
        date_filters_meta.append(ds)

    payload = {
        "searchText": search_text or "*",
        "searchFullText": True,
        "searchDescription": True,
        "docketSearches": docket_searches,
        "accessionNumber": None,
        "allDates": not bool(date_searches),
        "dateSearches": date_searches,
        "classTypes": [],
        "affiliations": [],
        "availability": None,
        "categories": [],
        "libraries": [],
        "eFiling": False,
        "sortBy": "",
        "groupBy": "NONE",
        "resultsPerPage": RESULTS_PER_PAGE,
        "curPage": page,
        "idolResultID": idol_result_id,
    }
    return payload, date_filters_meta


def search_page(client: httpx.Client, payload: dict) -> dict:
    """POST one page to /Search/AdvancedSearch and return parsed JSON."""
    resp = client.post(
        SEARCH_ENDPOINT,
        json=payload,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        timeout=60.0,
    )
    resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------
def cmd_search(args, conn: sqlite3.Connection) -> None:
    from_date = args.from_date
    to_date = args.to_date

    # Default date window: last 2 years (mirrors screenshot's ~2-month window but wider)
    if not from_date and not to_date and not args.all_dates:
        to_date = date.today().isoformat()
        from_date = (date.today() - timedelta(days=730)).isoformat()

    console.print(f"\n[bold cyan]FERC eLibrary Query[/bold cyan]")
    console.print(f"  Search text : [yellow]{args.search}[/yellow]")
    if args.docket:
        console.print(f"  Docket      : [yellow]{args.docket}[/yellow]")
    if from_date:
        console.print(f"  Filed date  : {from_date} → {to_date}")
    console.print(f"  Database    : {args.db}\n")

    all_hits = []
    idol_result_id = ""
    page = 1
    total_hits = None

    with httpx.Client() as client:
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TaskProgressColumn(),
            console=console,
        ) as progress:
            task = progress.add_task("Fetching page 1…", total=None)

            while True:
                payload, date_filters = build_payload(
                    search_text=args.search,
                    docket_number=args.docket,
                    from_date=from_date,
                    to_date=to_date,
                    page=page,
                    idol_result_id=idol_result_id,
                )

                try:
                    data = search_page(client, payload)
                except httpx.HTTPStatusError as e:
                    console.print(f"[red]HTTP error {e.response.status_code}[/red]: {e.response.text[:400]}")
                    sys.exit(1)
                except httpx.RequestError as e:
                    console.print(f"[red]Request error[/red]: {e}")
                    sys.exit(1)

                if not data.get("success"):
                    console.print(f"[red]API error[/red]: {data.get('errorMessage')}")
                    sys.exit(1)

                hits = data.get("searchHits", [])
                if total_hits is None:
                    total_hits = data.get("totalHits", 0)
                    progress.update(task, total=total_hits)

                idol_result_id = data.get("searchResultId") or ""

                # Persist page results
                with conn:
                    if page == 1:
                        request_id = log_search_request(conn, payload, data, date_filters)
                    for rank, hit in enumerate(hits, start=(page - 1) * RESULTS_PER_PAGE + 1):
                        doc_id = upsert_document(conn, hit)
                        if doc_id:
                            conn.execute(
                                """
                                INSERT OR IGNORE INTO ferc_search_results
                                    (request_id, document_id, rank, relevance_score, reference)
                                VALUES (?, ?, ?, ?, ?)
                                """,
                                (request_id, doc_id, rank, hit.get("score"), hit.get("reference")),
                            )
                    all_hits.extend(hits)

                progress.update(task, advance=len(hits), description=f"Page {page} — {len(all_hits)}/{total_hits} docs")

                fetched = len(all_hits)
                if fetched >= total_hits or not hits:
                    break
                if args.max_pages and page >= args.max_pages:
                    console.print(f"[dim]Stopping at --max-pages {args.max_pages}[/dim]")
                    break
                page += 1

    console.print(f"\n[green]Done.[/green] Fetched [bold]{len(all_hits)}[/bold] of {total_hits} documents → [bold]{args.db}[/bold]\n")
    _print_results_table(all_hits[:20])


def cmd_list(args, conn: sqlite3.Connection) -> None:
    cur = conn.execute(
        """
        SELECT d.accession_number, d.category, d.availability, d.filed_date,
               d.description, GROUP_CONCAT(dd.docket_text, ', ') AS dockets
        FROM ferc_documents d
        LEFT JOIN ferc_document_dockets dd ON dd.document_id = d.id
        GROUP BY d.id
        ORDER BY d.filed_date DESC
        LIMIT ?
        """,
        (args.limit,),
    )
    rows = cur.fetchall()
    if not rows:
        console.print("[yellow]No documents in database.[/yellow]")
        return

    t = Table(title=f"ferc_documents (last {len(rows)})", show_lines=False)
    t.add_column("Accession", style="cyan", no_wrap=True)
    t.add_column("Cat", width=9)
    t.add_column("Avail", width=5)
    t.add_column("Filed", width=12)
    t.add_column("Dockets", width=20)
    t.add_column("Description")

    for r in rows:
        avail_map = {"p": "Public", "c": "CEII", "s": "Protected", "n": "Privileged"}
        t.add_row(
            r["accession_number"] or "",
            r["category"] or "",
            avail_map.get(r["availability"], r["availability"] or ""),
            (r["filed_date"] or "")[:10],
            (r["dockets"] or "")[:30],
            (r["description"] or "")[:80],
        )
    console.print(t)


def cmd_stats(args, conn: sqlite3.Connection) -> None:
    stats = {
        "Documents":      conn.execute("SELECT COUNT(*) FROM ferc_documents").fetchone()[0],
        "Dockets":        conn.execute("SELECT COUNT(*) FROM ferc_dockets").fetchone()[0],
        "Transmittals":   conn.execute("SELECT COUNT(*) FROM ferc_transmittals").fetchone()[0],
        "Affiliations":   conn.execute("SELECT COUNT(*) FROM ferc_affiliations").fetchone()[0],
        "Search requests":conn.execute("SELECT COUNT(*) FROM ferc_search_requests").fetchone()[0],
        "Search results": conn.execute("SELECT COUNT(*) FROM ferc_search_results").fetchone()[0],
    }
    t = Table(title=f"DB stats — {args.db}")
    t.add_column("Table", style="cyan")
    t.add_column("Rows", justify="right")
    for k, v in stats.items():
        t.add_row(k, str(v))
    console.print(t)

    # Category breakdown
    rows = conn.execute(
        "SELECT category, COUNT(*) n FROM ferc_documents GROUP BY category"
    ).fetchall()
    if rows:
        t2 = Table(title="Category breakdown")
        t2.add_column("Category")
        t2.add_column("Count", justify="right")
        for r in rows:
            t2.add_row(r[0], str(r[1]))
        console.print(t2)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _norm_date(val: str | None) -> str | None:
    """Normalise various date strings to YYYY-MM-DD or None."""
    if not val:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%m/%d/%Y", "%m-%d-%Y"):
        try:
            return datetime.strptime(val[:19], fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return val[:10] if len(val) >= 10 else val


def _print_results_table(hits: list[dict]) -> None:
    if not hits:
        return
    t = Table(title=f"First {len(hits)} results", show_lines=False)
    t.add_column("#", width=4, justify="right")
    t.add_column("Accession", style="cyan", no_wrap=True)
    t.add_column("Cat", width=9)
    t.add_column("Filed", width=12)
    t.add_column("Docket(s)", width=22)
    t.add_column("Description")

    for i, h in enumerate(hits, 1):
        acc = h.get("acesssionNumber") or h.get("accessionNumber") or ""
        dockets = ", ".join(h.get("docketNumbers", []))[:30]
        desc = (h.get("description") or "")[:70]
        filed = _norm_date(h.get("filedDate")) or ""
        cat = h.get("category") or ""
        t.add_row(str(i), acc, cat, filed, dockets, desc)
    console.print(t)


# ---------------------------------------------------------------------------
# Inline schema fallback (mirrors ferc-elibrary-search-schema.sql)
# ---------------------------------------------------------------------------
_INLINE_SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS ferc_dockets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    docket_id INTEGER UNIQUE,
    docket_short_number TEXT NOT NULL,
    sub_docket_number TEXT NOT NULL DEFAULT '000',
    docket_full_number TEXT NOT NULL,
    docket_description TEXT,
    applicants TEXT,
    docket_creation_date TEXT,
    docket_filing_date TEXT,
    docket_sheet_link TEXT,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dockets_short ON ferc_dockets(docket_short_number);
CREATE INDEX IF NOT EXISTS idx_dockets_full  ON ferc_dockets(docket_full_number);

CREATE TABLE IF NOT EXISTS ferc_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER UNIQUE,
    accession_number TEXT NOT NULL UNIQUE,
    accession_date TEXT,
    accession_series TEXT,
    category TEXT NOT NULL CHECK(category IN ('Issuance','Submittal')),
    category_cd INTEGER,
    availability TEXT NOT NULL DEFAULT 'p' CHECK(availability IN ('p','c','s','n')),
    family_value TEXT DEFAULT 'None' CHECK(family_value IN ('None','none','child','Parent')),
    description TEXT,
    summary TEXT,
    source TEXT,
    filed_date TEXT,
    issued_date TEXT,
    posted_date TEXT,
    fed_reg_date TEXT,
    comments_due_date TEXT,
    fed_reg_number TEXT,
    ferc_cite TEXT,
    fed_court_case TEXT,
    fercite TEXT,
    opinion TEXT,
    order_number TEXT,
    fee_amount REAL DEFAULT 0,
    parent_accession_number TEXT,
    relevance_score REAL,
    is_efiling INTEGER NOT NULL DEFAULT 0 CHECK(is_efiling IN (0,1)),
    fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_docs_accession ON ferc_documents(accession_number);
CREATE INDEX IF NOT EXISTS idx_docs_filed     ON ferc_documents(filed_date);
CREATE INDEX IF NOT EXISTS idx_docs_issued    ON ferc_documents(issued_date);
CREATE INDEX IF NOT EXISTS idx_docs_category  ON ferc_documents(category);
CREATE INDEX IF NOT EXISTS idx_docs_avail     ON ferc_documents(availability);

CREATE TABLE IF NOT EXISTS ferc_document_dockets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES ferc_documents(id) ON DELETE CASCADE,
    docket_id   INTEGER NOT NULL REFERENCES ferc_dockets(id)   ON DELETE CASCADE,
    docket_text TEXT,
    sub_docket_text TEXT,
    docket_code TEXT,
    sub_docket_number INTEGER,
    docket_type TEXT,
    UNIQUE(document_id, docket_id)
);
CREATE INDEX IF NOT EXISTS idx_doc_dockets_doc    ON ferc_document_dockets(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_dockets_docket ON ferc_document_dockets(docket_id);

CREATE TABLE IF NOT EXISTS ferc_document_class_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id    INTEGER NOT NULL REFERENCES ferc_documents(id) ON DELETE CASCADE,
    document_class TEXT NOT NULL,
    document_type  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_class_types_doc ON ferc_document_class_types(document_id);
CREATE INDEX IF NOT EXISTS idx_class_types_cls ON ferc_document_class_types(document_class);

CREATE TABLE IF NOT EXISTS ferc_document_libraries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES ferc_documents(id) ON DELETE CASCADE,
    library TEXT NOT NULL CHECK(library IN ('General','Electric','Gas','Oil','Rulemaking','Hydro'))
);
CREATE INDEX IF NOT EXISTS idx_doc_libs_doc ON ferc_document_libraries(document_id);

CREATE TABLE IF NOT EXISTS ferc_affiliations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id    INTEGER NOT NULL REFERENCES ferc_documents(id) ON DELETE CASCADE,
    affil_type     TEXT NOT NULL CHECK(affil_type IN ('author','agent','recipient')),
    organization   TEXT,
    last_name      TEXT,
    first_initial  TEXT,
    middle_initial TEXT
);
CREATE INDEX IF NOT EXISTS idx_affiliations_doc  ON ferc_affiliations(document_id);
CREATE INDEX IF NOT EXISTS idx_affiliations_org  ON ferc_affiliations(organization);
CREATE INDEX IF NOT EXISTS idx_affiliations_type ON ferc_affiliations(affil_type);

CREATE TABLE IF NOT EXISTS ferc_transmittals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id     INTEGER NOT NULL REFERENCES ferc_documents(id) ON DELETE CASCADE,
    file_id         TEXT NOT NULL,
    file_type       TEXT,
    file_format     TEXT,
    file_name       TEXT,
    file_description TEXT,
    file_size_bytes INTEGER,
    transmittal_fk  TEXT,
    download_url    TEXT,
    is_legacy       INTEGER DEFAULT 0 CHECK(is_legacy IN (0,1)),
    UNIQUE(document_id, file_id)
);
CREATE INDEX IF NOT EXISTS idx_transmittals_doc    ON ferc_transmittals(document_id);
CREATE INDEX IF NOT EXISTS idx_transmittals_format ON ferc_transmittals(file_format);

CREATE TABLE IF NOT EXISTS ferc_search_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    search_type TEXT NOT NULL CHECK(search_type IN ('general','docket','new_docket','download')),
    search_text TEXT,
    search_fulltext INTEGER DEFAULT 1,
    search_desc INTEGER DEFAULT 1,
    all_dates INTEGER DEFAULT 0,
    efiling_only INTEGER DEFAULT 0,
    sort_by TEXT,
    group_by TEXT DEFAULT 'NONE',
    results_per_page INTEGER DEFAULT 100,
    cur_page INTEGER DEFAULT 1,
    idol_result_id TEXT,
    dockets TEXT,
    subdockets TEXT DEFAULT 'All',
    filed_date_beg TEXT,
    filed_date_end TEXT,
    complete_flag INTEGER DEFAULT 0,
    new_docket_by TEXT CHECK(new_docket_by IN ('rbFilingDate','rbCreateDate',NULL)),
    new_docket_start TEXT,
    new_docket_end TEXT,
    total_hits INTEGER,
    num_hits INTEGER,
    success INTEGER,
    error_message TEXT,
    requested_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ferc_request_docket_filters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL REFERENCES ferc_search_requests(id) ON DELETE CASCADE,
    docket_number TEXT,
    sub_docket_numbers TEXT
);

CREATE TABLE IF NOT EXISTS ferc_request_date_filters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL REFERENCES ferc_search_requests(id) ON DELETE CASCADE,
    date_type TEXT NOT NULL CHECK(date_type IN ('issued_date','filed_date','posted_date')),
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ferc_search_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id  INTEGER NOT NULL REFERENCES ferc_search_requests(id) ON DELETE CASCADE,
    document_id INTEGER NOT NULL REFERENCES ferc_documents(id)       ON DELETE CASCADE,
    rank INTEGER,
    relevance_score REAL,
    reference TEXT,
    UNIQUE(request_id, document_id)
);
CREATE INDEX IF NOT EXISTS idx_results_request  ON ferc_search_results(request_id);
CREATE INDEX IF NOT EXISTS idx_results_document ON ferc_search_results(document_id);
"""


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Query FERC eLibrary and store results in SQLite.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--search", "-s",
        default=DEFAULT_SEARCH,
        help=f'Keyword search text (default: "{DEFAULT_SEARCH}")',
    )
    parser.add_argument(
        "--docket", "-d",
        default=None,
        help="Filter by docket number (e.g. ER24-1234)",
    )
    parser.add_argument(
        "--from-date",
        default=None,
        metavar="YYYY-MM-DD",
        help="Filed-date range start (default: 2 years ago)",
    )
    parser.add_argument(
        "--to-date",
        default=None,
        metavar="YYYY-MM-DD",
        help="Filed-date range end (default: today)",
    )
    parser.add_argument(
        "--all-dates",
        action="store_true",
        help="Disable date filtering — search all available dates",
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=None,
        metavar="N",
        help="Stop after N pages (100 docs/page) — useful for testing",
    )
    parser.add_argument(
        "--db",
        default=DEFAULT_DB,
        help=f"SQLite database file (default: {DEFAULT_DB})",
    )
    parser.add_argument(
        "--list", "-l",
        action="store_true",
        help="List documents already stored in the database",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=50,
        help="Row limit for --list (default: 50)",
    )
    parser.add_argument(
        "--stats",
        action="store_true",
        help="Show database statistics",
    )

    args = parser.parse_args()
    conn = init_db(args.db)

    if args.list:
        cmd_list(args, conn)
    elif args.stats:
        cmd_stats(args, conn)
    else:
        cmd_search(args, conn)

    conn.close()


if __name__ == "__main__":
    main()
