#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "beautifulsoup4",
# ]
# ///
"""
tceq-query: Query the TCEQ Records Online search API and store results in SQLite.

Usage examples:
  # Replicate example-query.txt (Google, Meta, Amazon by entity name, OR)
  uv run tceq-query.py --field xRegEntName Google \
                       --field xRegEntName Meta \
                       --field xRegEntName Amazon \
                       --operator OR

  # Air permit series, stage-2 schema
  uv run tceq-query.py --series 1081 --field xRegEntName Tesla --stage 2

  # Full-text search with audit trail, different db
  uv run tceq-query.py --ftx "data center" --stage 3 --db custom.db

  # Inspect the raw HTML without writing to db
  uv run tceq-query.py --field xRegEntName Google --dump-html response.html --dry-run
"""

import argparse
import sqlite3
import sys
import re
import uuid
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

# ── Optional dependency ───────────────────────────────────────────────────────
try:
    from bs4 import BeautifulSoup
    _HAS_BS4 = True
except ImportError:
    _HAS_BS4 = False

# ── Constants ─────────────────────────────────────────────────────────────────
BASE_URL = "https://records.tceq.texas.gov/cs/idcplg"
SCRIPT_DIR = Path(__file__).parent

SCHEMA_FILES = {
    1: "tceq-schema-stage1.sql",
    2: "tceq-schema-stage2-lookups.sql",
    3: "tceq-schema-stage3-audit.sql",
}

VALID_FIELDS = {
    "xDelivText":   "Address",
    "xRefNumTxt":   "Central Registry RN",
    "xPrimaryID":   "Primary ID",
    "xRegEntName":  "Regulated Entity Name",
    "xSecondaryID": "Secondary ID",
}

# Label text as it appears in Oracle UCM dataSheet HTML → schema column
_LABEL_TO_FIELD = {
    "regulated entity name": "reg_entity_name",
    "primary id":            "primary_id",
    "secondary id":          "secondary_id",
    "central registry rn":   "central_rn",
    "rn":                    "central_rn",
    "address":               "address",
    "in date":               "in_date",
    "date in":               "in_date",
    "title":                 "doc_title",
    "document title":        "doc_title",
    "document name":         "doc_name",
    "name":                  "doc_name",
}

# ── Schema ────────────────────────────────────────────────────────────────────

def _schema_path(stage: int, schema_dir: Path) -> Path:
    return schema_dir / SCHEMA_FILES[stage]


def apply_schema(conn: sqlite3.Connection, stage: int, schema_dir: Path) -> None:
    """Execute schema SQL files for stages 1 … stage (cumulative)."""
    for s in range(1, stage + 1):
        path = _schema_path(s, schema_dir)
        if not path.exists():
            print(f"Warning: schema file not found: {path}", file=sys.stderr)
            continue
        sql = path.read_text(encoding="utf-8")
        conn.executescript(sql)
        if _verbose:
            print(f"Applied schema stage {s} from {path}", file=sys.stderr)

# ── HTTP ──────────────────────────────────────────────────────────────────────

# Browser-like headers required by the TCEQ server
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/126.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def fetch_access_id() -> str:
    """
    Pre-fetch the TCEQ search page to obtain a session accessID.
    The accessID is embedded in the page HTML as a hidden form field or
    JavaScript variable.  Returns an empty string if not found.
    """
    url = BASE_URL + "?IdcService=TCEQ_SEARCH&xIdcProfile=Record&IsExternalSearch=1"
    if _verbose:
        print(f"Pre-fetch accessID: GET {url}", file=sys.stderr)
    try:
        req = urllib.request.Request(url, headers=_HEADERS)
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode("utf-8", errors="replace")
        # Look for accessID in a hidden input or JS variable
        for pat in (
            r'name=["\']accessID["\'][^>]*value=["\'](\d+)["\']',
            r'value=["\'](\d+)["\'][^>]*name=["\']accessID["\']',
            r'["\']accessID["\']\s*[,:]\s*["\']?(\d+)',
            r'accessID=(\d+)',
        ):
            m = re.search(pat, html, re.I)
            if m:
                access_id = m.group(1)
                if _verbose:
                    print(f"Got accessID={access_id}", file=sys.stderr)
                return access_id
    except Exception as exc:
        print(f"Warning: could not pre-fetch accessID: {exc}", file=sys.stderr)
    return ""


def build_params(args, access_id: str = "") -> dict:
    # Mirror the exact parameter order seen in a successful TCEQ query.
    # All four select/input slots are always sent; unused slots are empty.
    fields = args.field or []
    params: dict = {}

    params["IdcService"]        = "TCEQ_PERFORM_SEARCH"
    params["clientIP"]          = ""
    params["xIdcProfile"]       = "Record"
    params["IsExternalSearch"]  = "1"
    params["sortSearch"]        = "false"
    params["newSearch"]         = "true"
    if access_id:
        params["accessID"]      = access_id
    params["xRecordSeries"]         = str(args.series) if args.series else "0"
    params["xInsightDocumentType"]  = str(args.doc_type) if args.doc_type else "0"
    params["xMedia"]                = str(args.media) if args.media is not None else "0"

    # Always emit all 4 field slots
    for i in range(4):
        if i < len(fields):
            params[f"select{i}"] = fields[i][0]
            params[f"input{i}"]  = fields[i][1]
        else:
            params[f"select{i}"] = ""
            params[f"input{i}"]  = ""

    params["operator"] = args.operator
    params["ftx"]      = args.ftx or ""

    return params


def fetch_html(params: dict) -> str:
    url = BASE_URL + "?" + urllib.parse.urlencode(params)
    if _verbose:
        print(f"GET {url}", file=sys.stderr)
    req = urllib.request.Request(url, headers=_HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")

# ── HTML parsing ──────────────────────────────────────────────────────────────

def _make_result() -> dict:
    return {
        "rank":            None,
        "doc_name":        None,
        "doc_title":       None,
        "primary_id":      None,
        "secondary_id":    None,
        "reg_entity_name": None,
        "central_rn":      None,
        "address":         None,
        "series_id":       None,
        "doc_type_id":     None,
        "media_id":        None,
        "in_date":         None,
        "content_url":     None,
    }


def _abs_url(href: str) -> str:
    if href.startswith("http"):
        return href
    if href.startswith("/"):
        return "https://records.tceq.texas.gov" + href
    return href


def parse_results_bs4(html: str) -> list[dict]:
    """
    Parse TCEQ dataSheet results.

    Oracle UCM 11gR1 / TCEQ custom template renders each result as a
    labeled two-column table.  Each block starts with the doc-name link
    followed by label→value rows.

    We try three increasingly permissive strategies:
      1. Rows with class rowEven / rowOdd / searchResult (flat table layout)
      2. Label-value table blocks (card layout)
      3. Any link whose href contains dDocName or GET_FILE (fallback)
    """
    soup = BeautifulSoup(html, "html.parser")
    results: list[dict] = []

    # ── Strategy 1: flat row-based table ─────────────────────────────────────
    rows = soup.find_all("tr", class_=re.compile(
        r"(row(Even|Odd|Alt)|searchResult|resultRow|dataSheetRow)", re.I
    ))
    if rows:
        for rank, row in enumerate(rows, 1):
            r = _make_result()
            r["rank"] = rank
            cells = row.find_all("td")
            # First cell with a link → doc_name + content_url
            for cell in cells:
                a = cell.find("a", href=True)
                if a and not a["href"].startswith("javascript"):
                    r["doc_name"] = a.get_text(strip=True)
                    r["content_url"] = _abs_url(a["href"])
                    break
            # Try to map remaining cells by position (TCEQ column order varies)
            texts = [c.get_text(" ", strip=True) for c in cells]
            if len(texts) > 1 and r["doc_title"] is None:
                r["doc_title"] = texts[1] or None
            if len(texts) > 2 and r["primary_id"] is None:
                r["primary_id"] = texts[2] or None
            if len(texts) > 3 and r["reg_entity_name"] is None:
                r["reg_entity_name"] = texts[3] or None
            results.append(r)
        return results

    # ── Strategy 2: label-value card blocks ───────────────────────────────────
    # Each document is a <table> (or <div>) containing rows of label/value pairs.
    # Heuristic: find all <a> tags with dDocName in their href as anchors.
    doc_links = soup.find_all("a", href=re.compile(r"(dDocName|GET_FILE)", re.I))
    if not doc_links:
        # Broader: any link inside the page content area
        doc_links = soup.find_all("a", href=re.compile(r"/cs/", re.I))

    seen_urls: set[str] = set()
    for rank, link in enumerate(doc_links, 1):
        href = link.get("href", "")
        if href.startswith("javascript"):
            continue
        abs_href = _abs_url(href)
        if abs_href in seen_urls:
            continue
        seen_urls.add(abs_href)

        r = _make_result()
        r["rank"] = rank
        r["doc_name"] = link.get_text(strip=True)
        r["content_url"] = abs_href

        # Walk up to find the enclosing result container (table or div)
        container = link.find_parent("table") or link.find_parent("div")
        if container:
            # Look for label/value rows within the container
            label_cells = container.find_all(
                "td", class_=re.compile(r"label|header|key", re.I)
            )
            if not label_cells:
                # Fallback: scan all <tr> rows for 2-cell label/value pattern
                for tr in container.find_all("tr"):
                    tds = tr.find_all("td")
                    if len(tds) == 2:
                        label = tds[0].get_text(strip=True).rstrip(":").lower()
                        value = tds[1].get_text(strip=True)
                        col = _LABEL_TO_FIELD.get(label)
                        if col and value:
                            r[col] = value
            else:
                for lc in label_cells:
                    label = lc.get_text(strip=True).rstrip(":").lower()
                    vc = lc.find_next_sibling("td")
                    value = vc.get_text(strip=True) if vc else ""
                    col = _LABEL_TO_FIELD.get(label)
                    if col and value:
                        r[col] = value

        results.append(r)

    if results:
        return results

    # ── Strategy 3: bare link scrape ─────────────────────────────────────────
    all_links = soup.find_all("a", href=re.compile(r"https?://", re.I))
    seen: set[str] = set()
    for rank, link in enumerate(all_links, 1):
        href = link["href"]
        if href in seen:
            continue
        seen.add(href)
        r = _make_result()
        r["rank"] = rank
        r["doc_name"] = link.get_text(strip=True) or href
        r["content_url"] = href
        results.append(r)

    return results


def parse_results_regex(html: str) -> list[dict]:
    """Fallback parser (no BeautifulSoup) using regex."""
    results: list[dict] = []
    pattern = re.compile(
        r'href="([^"]*(?:dDocName|GET_FILE|/cs/)[^"]*)"[^>]*>([^<]+)</a>',
        re.I,
    )
    seen: set[str] = set()
    rank = 0
    for m in pattern.finditer(html):
        href, name = m.group(1), m.group(2).strip()
        if href.startswith("javascript") or href in seen:
            continue
        seen.add(href)
        rank += 1
        r = _make_result()
        r["rank"] = rank
        r["doc_name"] = name
        r["content_url"] = _abs_url(href)
        results.append(r)
    return results


def parse_results(html: str) -> list[dict]:
    if _HAS_BS4:
        return parse_results_bs4(html)
    print(
        "Warning: beautifulsoup4 not installed; using regex fallback. "
        "Install with: pip install beautifulsoup4",
        file=sys.stderr,
    )
    return parse_results_regex(html)


def extract_result_count(html: str) -> int | None:
    """Best-effort extraction of total result count from HTML."""
    for pat in (
        r'(\d[\d,]+)\s+(?:Results?|Documents?|Items?)\s+Found',
        r'of\s+(\d[\d,]+)\s+(?:results?|documents?|items?)',
        r'Total(?:\s+Results?)?\s*:\s*(\d[\d,]+)',
    ):
        m = re.search(pat, html, re.I)
        if m:
            return int(m.group(1).replace(",", ""))
    return None

# ── Database ──────────────────────────────────────────────────────────────────

def insert_request(
    conn: sqlite3.Connection,
    stage: int,
    args,
    result_count: int | None,
) -> str:
    request_id = uuid.uuid4().hex
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    conn.execute(
        """
        INSERT INTO tceq_permit_query_search_requests
            (request_id, submitted_at, series_id, doc_type_id, media_id,
             field_operator, ftx, result_count, response_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            request_id, now,
            args.series, args.doc_type,
            args.media if args.media is not None else None,
            args.operator, args.ftx,
            result_count, now,
        ),
    )

    # Stage 3: record the exact field criteria for audit trail
    if stage >= 3:
        for pos, (field, value) in enumerate(args.field or []):
            conn.execute(
                """
                INSERT INTO tceq_permit_query_search_field_criteria
                    (request_id, position, field_name, value)
                VALUES (?, ?, ?, ?)
                """,
                (request_id, pos, field, value),
            )

    return request_id


def insert_results(
    conn: sqlite3.Connection,
    request_id: str,
    results: list[dict],
) -> None:
    conn.executemany(
        """
        INSERT INTO tceq_permit_query_search_results
            (request_id, rank, doc_name, doc_title, primary_id, secondary_id,
             reg_entity_name, central_rn, address, series_id, doc_type_id,
             media_id, in_date, content_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                request_id,
                r["rank"], r["doc_name"], r["doc_title"],
                r["primary_id"], r["secondary_id"],
                r["reg_entity_name"], r["central_rn"],
                r["address"], r["series_id"],
                r["doc_type_id"], r["media_id"],
                r["in_date"], r["content_url"],
            )
            for r in results
        ],
    )

# ── CLI ───────────────────────────────────────────────────────────────────────

_verbose = False  # module-level flag set before parsing starts


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="tceq-query",
        description="Query TCEQ Records Online and store results in SQLite.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )

    # Database / schema
    p.add_argument(
        "--db", default="tceq.db", metavar="PATH",
        help="SQLite database file (default: tceq.db)",
    )
    p.add_argument(
        "--stage", type=int, choices=[1, 2, 3], default=1,
        help="Schema stage: 1=core only, 2=+lookup tables, 3=+audit trail (default: 1)",
    )
    p.add_argument(
        "--schema-dir", metavar="PATH",
        help="Directory containing schema SQL files (default: same directory as this script)",
    )
    p.add_argument(
        "--no-init-schema", action="store_true",
        help="Skip schema initialization (tables must already exist)",
    )

    # Search parameters
    p.add_argument(
        "--field", nargs=2, metavar=("FIELD", "VALUE"), action="append",
        help=(
            "Field search criterion (repeatable, up to 4 times). "
            "FIELD must be one of: " + ", ".join(sorted(VALID_FIELDS))
        ),
    )
    p.add_argument(
        "--operator", choices=["AND", "OR"], default="AND",
        help="Boolean operator across field criteria (default: AND)",
    )
    p.add_argument(
        "--series", type=int, metavar="ID",
        help="Record series ID filter (e.g. 1081 for New Source Review Permit)",
    )
    p.add_argument(
        "--doc-type", type=int, metavar="ID",
        help="Document type ID filter",
    )
    p.add_argument(
        "--media", type=int, metavar="ID", choices=range(0, 7),
        help="Media type: 0=All 1=Electronic 2=Fiche 3=Microfilm 4=Optical Disc 5=Paper 6=Tape",
    )
    p.add_argument(
        "--ftx", metavar="TEXT",
        help="Full-text search query",
    )
    p.add_argument(
        "--access-id", metavar="ID",
        help=(
            "TCEQ session accessID token. "
            "If omitted the script pre-fetches the search page to obtain one automatically."
        ),
    )

    # Debug / output
    p.add_argument(
        "--dump-html", metavar="PATH",
        help="Save raw HTML response to PATH (useful for debugging the parser)",
    )
    p.add_argument(
        "--dry-run", action="store_true",
        help="Fetch and parse results but do not write to the database",
    )
    p.add_argument(
        "--verbose", "-v", action="store_true",
        help="Verbose output (prints the request URL and progress)",
    )

    return p


def main() -> None:
    global _verbose

    parser = build_arg_parser()
    args = parser.parse_args()
    _verbose = args.verbose

    # ── Validate inputs ───────────────────────────────────────────────────────
    if not args.field and args.ftx is None and args.series is None:
        parser.error(
            "Provide at least one of --field, --ftx, or --series to search."
        )

    if args.field:
        if len(args.field) > 4:
            parser.error("At most 4 --field criteria are allowed.")
        for field, _ in args.field:
            if field not in VALID_FIELDS:
                parser.error(
                    f"Unknown field '{field}'. "
                    f"Valid fields: {', '.join(sorted(VALID_FIELDS))}"
                )

    schema_dir = Path(args.schema_dir) if args.schema_dir else SCRIPT_DIR

    # ── Obtain accessID ───────────────────────────────────────────────────────
    access_id = args.access_id or fetch_access_id()

    # ── Fetch ─────────────────────────────────────────────────────────────────
    params = build_params(args, access_id)
    try:
        html = fetch_html(params)
    except Exception as exc:
        print(f"Error fetching results: {exc}", file=sys.stderr)
        sys.exit(1)

    if args.dump_html:
        Path(args.dump_html).write_text(html, encoding="utf-8")
        print(f"HTML saved to {args.dump_html}")

    # ── Parse ─────────────────────────────────────────────────────────────────
    results = parse_results(html)
    result_count = extract_result_count(html)

    display_count = result_count if result_count is not None else len(results)
    print(
        f"Server reports {display_count} result(s); "
        f"parsed {len(results)} record(s)."
    )

    if _verbose:
        for r in results:
            print(
                f"  [{r['rank']:>4}] {r['doc_name'] or '(no name)':<40} "
                f"{r['content_url'] or ''}"
            )

    if args.dry_run:
        print("Dry run — nothing written to database.")
        return

    # ── Database ──────────────────────────────────────────────────────────────
    conn = sqlite3.connect(args.db)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")

    try:
        if not args.no_init_schema:
            apply_schema(conn, args.stage, schema_dir)

        with conn:
            request_id = insert_request(conn, args.stage, args, result_count)
            insert_results(conn, request_id, results)

        print(
            f"Saved to {args.db}: "
            f"request_id={request_id}, "
            f"{len(results)} result row(s)."
        )
    finally:
        conn.close()


if __name__ == "__main__":
    main()
