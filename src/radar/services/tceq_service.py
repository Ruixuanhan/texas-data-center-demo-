"""TCEQ Records Online environmental-source health adapter.

TCEQ's public Records Online endpoint is a searchable web application rather than a
published bulk API.  This adapter deliberately separates successful retrieval from
permit evidence: a failed or unparseable response creates an ingestion-run health
record only.  It never creates a Project, Signal, or ProjectEvent without a
verifiable TCEQ result row and source link.
"""

from __future__ import annotations

import hashlib
import re
import sys
from datetime import UTC, datetime
from typing import Iterable
from urllib.parse import urlencode
import urllib.request

import requests
from sqlalchemy.orm import Session

from radar.data.models import IngestionRun

TCEQ_SOURCE_NAME = "TCEQ Records Online"
TCEQ_SEARCH_URL = "https://records.tceq.texas.gov/cs/idcplg"
DEFAULT_TCEQ_TERMS = ("Google", "Meta", "Amazon")

# Optional dependency
try:
    from bs4 import BeautifulSoup
    _HAS_BS4 = True
except ImportError:
    _HAS_BS4 = False

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


def build_tceq_search_url(terms: Iterable[str]) -> str:
    """Build the public regulated-entity-name query documented in the fixture."""
    normalized = [term.strip() for term in terms if term and term.strip()]
    if not normalized:
        raise ValueError("At least one non-empty TCEQ search term is required")

    query: dict[str, str] = {
        "IdcService": "TCEQ_PERFORM_SEARCH",
        "clientIP": "",
        "xIdcProfile": "Record",
        "IsExternalSearch": "1",
        "sortSearch": "false",
        "newSearch": "true",
        "xRecordSeries": "0",
        "xInsightDocumentType": "0",
        "xMedia": "0",
        "operator": "OR",
        "ftx": "",
    }
    for index in range(4):
        if index < len(normalized):
            query[f"select{index}"] = "xRegEntName"
            query[f"input{index}"] = normalized[index]
        else:
            query[f"select{index}"] = ""
            query[f"input{index}"] = ""
    return f"{TCEQ_SEARCH_URL}?{urlencode(query)}"


def fetch_access_id() -> str:
    """
    Pre-fetch the TCEQ search page to obtain a session accessID.
    The accessID is embedded in the page HTML as a hidden form field or
    JavaScript variable.  Returns an empty string if not found.
    """
    url = TCEQ_SEARCH_URL + "?IdcService=TCEQ_SEARCH&xIdcProfile=Record&IsExternalSearch=1"
    try:
        req = urllib.request.Request(url, headers=_HEADERS)
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode("utf-8", errors="replace")
        for pat in (
            r'name=["\']accessID["\'][^>]*value=["\'](\d+)["\']',
            r'value=["\'](\d+)["\'][^>]*name=["\']accessID["\']',
            r'["\']accessID["\']\s*[,:]\s*["\']?(\d+)',
            r'accessID=(\d+)',
        ):
            m = re.search(pat, html, re.I)
            if m:
                return m.group(1)
    except Exception as exc:
        print(f"Warning: could not pre-fetch accessID: {exc}", file=sys.stderr)
    return ""


# ── HTML parsing ───────────────────────────────────────────────────────────────

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


# xMedia label text → media_id integer
_MEDIA_LABEL_TO_ID = {
    "all": 0, "electronic": 1, "fiche": 2,
    "microfilm": 3, "optical disc": 4, "paper": 5, "tape": 6,
}


def _media_label_to_id(label: str | None) -> int | None:
    if not label:
        return None
    return _MEDIA_LABEL_TO_ID.get(label.lower().strip())


def parse_results_bs4(html: str) -> list[dict]:
    """
    Parse TCEQ Records Online search results.

    The TCEQ Oracle UCM 11gR1 template renders results in a flat table
    (<table id="searchResultsTable">) where each document occupies one <tr>.
    Each row contains:
      - a <form action="dummy.exe"> with hidden inputs: dDocName, dDocTitle, dID
      - alternating <td class="xuiListContentCell_Odd|Even"> (data) and
        <td class="xuiListResizeDragCell_Item"> (resize spacers, skip these)
    Data cell positions follow the columnsString order:
      [0]=checkbox  [1]=dDocName  [2]=xRecordSeries  [3]=xPrimaryID
      [4]=xSecondaryID  [5]=xInsightDocumentType  [6]=dDocTitle
      [7]=xBeginDate  [8]=xEndDate  [9]=xLitigationHold  [10]=xRegEntName
      [11]=xMedia  [12]=xComments  [13]=dSecurityGroup  [14]=actions
    """
    soup = BeautifulSoup(html, "html.parser")
    results: list[dict] = []

    # ── Strategy 1: TCEQ xuiList result table (primary) ──────────────────────
    col_input = soup.find("input", attrs={"name": "columnsString"})
    columns = (
        col_input["value"].split(",")
        if col_input and col_input.get("value")
        else [
            "dDocName", "xRecordSeries", "xPrimaryID", "xSecondaryID",
            "xInsightDocumentType", "dDocTitle", "xBeginDate", "xEndDate",
            "xLitigationHold", "xRegEntName", "xMedia", "xComments",
            "dSecurityGroup",
        ]
    )
    col_idx = {col: i + 1 for i, col in enumerate(columns)}

    item_forms = soup.find_all(
        "form", attrs={"action": re.compile(r"dummy\.exe", re.I)}
    )

    for rank, form in enumerate(item_forms, 1):
        r = _make_result()
        r["rank"] = rank

        def hval(name: str) -> str | None:
            inp = form.find("input", attrs={"name": name})
            return inp["value"].strip() if inp and inp.get("value") else None

        r["doc_name"]  = hval("dDocName")
        r["doc_title"] = hval("dDocTitle")

        row = form.find_parent("tr")
        if not row:
            results.append(r)
            continue

        data_cells = row.find_all(
            "td", class_=re.compile(r"xuiListContentCell_(Odd|Even)", re.I)
        )

        def cell_text(col_name: str) -> str | None:
            idx = col_idx.get(col_name)
            if idx is None or idx >= len(data_cells):
                return None
            cell = data_cells[idx]
            for hidden in cell.find_all(
                "div", style=re.compile(r"display\s*:\s*none", re.I)
            ):
                hidden.decompose()
            for img in cell.find_all("img"):
                img.decompose()
            return cell.get_text(" ", strip=True) or None

        doc_cell_idx = col_idx.get("dDocName", 1)
        if doc_cell_idx < len(data_cells):
            a = data_cells[doc_cell_idx].find(
                "a", href=re.compile(r"EXTERNAL_SEARCH_GET_FILE", re.I)
            )
            if a:
                r["content_url"] = _abs_url(a["href"])
                if not r["doc_name"]:
                    r["doc_name"] = a.get_text(strip=True)

        r["primary_id"]      = cell_text("xPrimaryID")
        r["secondary_id"]    = cell_text("xSecondaryID")
        r["reg_entity_name"] = cell_text("xRegEntName")
        r["in_date"]         = cell_text("xBeginDate")
        r["media_id"]        = _media_label_to_id(cell_text("xMedia"))

        results.append(r)

    if results:
        return results

    # ── Strategy 2: bare link scrape (non-TCEQ UCM fallback) ─────────────────
    seen: set[str] = set()
    rank = 0
    for a in soup.find_all("a", href=re.compile(r"EXTERNAL_SEARCH_GET_FILE|dDocName", re.I)):
        href = a.get("href", "")
        if href.startswith("javascript") or href in seen:
            continue
        seen.add(href)
        rank += 1
        r = _make_result()
        r["rank"] = rank
        r["doc_name"] = a.get_text(strip=True) or None
        r["content_url"] = _abs_url(href)
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
    """
    Best-effort extraction of total result count from HTML.
    TCEQ paginates as 'Page N of <pages>' with 20 items/page, so we
    derive the total from the highest EndRow value in the pagination URLs.
    """
    for pat in (
        r'(\d[\d,]+)\s+(?:Results?|Documents?|Items?)\s+Found',
        r'of\s+(\d[\d,]+)\s+(?:results?|documents?|items?)',
        r'Total(?:\s+Results?)?\s*:\s*(\d[\d,]+)',
    ):
        m = re.search(pat, html, re.I)
        if m:
            return int(m.group(1).replace(",", ""))

    end_rows = [int(m) for m in re.findall(r"EndRow=(\d+)", html)]
    if end_rows:
        return max(end_rows)

    return None


# ── Source health check ────────────────────────────────────────────────────────

def run_tceq_source_health_check(
    session: Session,
    terms: Iterable[str] = DEFAULT_TCEQ_TERMS,
    timeout_seconds: int = 45,
) -> IngestionRun:
    """Query the official endpoint and record its availability without inventing permits.

    A future parser may attach successful result rows to canonical projects through
    ``SourceDocument`` records.  Until then, this function is intentionally a
    source-health collector because the currently validated endpoint response is
    HTTP 503 and does not provide trustworthy record rows.
    """
    normalized_terms = tuple(term.strip() for term in terms if term and term.strip())
    access_id = fetch_access_id()
    search_url = build_tceq_search_url(normalized_terms)
    if access_id:
        search_url += f"&accessID={access_id}"
    run = IngestionRun(
        source=TCEQ_SOURCE_NAME,
        status="running",
        artifact_hash=hashlib.sha256(search_url.encode("utf-8")).hexdigest(),
        message=f"Checking official TCEQ Records Online availability for {len(normalized_terms)} term(s).",
    )
    session.add(run)
    session.flush()

    try:
        response = requests.get(
            search_url,
            timeout=timeout_seconds,
            headers=_HEADERS,
        )
    except requests.RequestException as error:
        run.status = "unavailable"
        run.completed_at = datetime.now(UTC)
        run.message = f"TCEQ Records Online request failed: {error.__class__.__name__}. No environmental evidence was created."
        return run

    body_hash = hashlib.sha256(response.content).hexdigest()
    run.artifact_hash = body_hash
    run.completed_at = datetime.now(UTC)
    run.records_seen = 0
    run.records_changed = 0

    if response.status_code != 200:
        run.status = "unavailable"
        run.message = (
            f"TCEQ Records Online returned HTTP {response.status_code}. "
            "No environmental evidence was created; upstream unavailability is not a permit-status conclusion."
        )
        return run

    results = parse_results(response.text)
    result_count = extract_result_count(response.text)
    display_count = result_count if result_count is not None else len(results)
    run.records_seen = display_count

    # A 200 response proves availability, but raw HTML cannot be treated as permit
    # evidence until a documented result-table parser has extracted an attributable
    # record identifier, regulated entity, document title, and content URL.
    run.status = "success"
    run.message = (
        f"TCEQ Records Online returned HTTP 200; server reports {display_count} result(s), "
        f"parsed {len(results)} record(s). Result rows require a documented parser "
        "before they can be attached as environmental permit evidence."
    )
    return run
