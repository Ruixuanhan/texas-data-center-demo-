"""TCEQ Records Online environmental-source health adapter.

TCEQ's public Records Online endpoint is a searchable web application rather than a
published bulk API.  This adapter deliberately separates successful retrieval from
permit evidence: a failed or unparseable response creates an ingestion-run health
record only.  It never creates a Project, Signal, or ProjectEvent without a
verifiable TCEQ result row and source link.
"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from typing import Iterable
from urllib.parse import urlencode

import requests
from sqlalchemy.orm import Session

from radar.data.models import IngestionRun

TCEQ_SOURCE_NAME = "TCEQ Records Online"
TCEQ_SEARCH_URL = "https://records.tceq.texas.gov/cs/idcplg"
DEFAULT_TCEQ_TERMS = ("Google", "Meta", "Amazon")


def build_tceq_search_url(terms: Iterable[str]) -> str:
    """Build the public regulated-entity-name query documented in the fixture."""
    normalized = [term.strip() for term in terms if term and term.strip()]
    if not normalized:
        raise ValueError("At least one non-empty TCEQ search term is required")

    query: dict[str, str] = {
        "IdcService": "TCEQ_PERFORM_SEARCH",
        "xIdcProfile": "Record",
        "IsExternalSearch": "1",
        "newSearch": "true",
        "operator": "OR",
    }
    for index, term in enumerate(normalized):
        query[f"select{index}"] = "xRegEntName"
        query[f"input{index}"] = term
    return f"{TCEQ_SEARCH_URL}?{urlencode(query)}"


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
    search_url = build_tceq_search_url(normalized_terms)
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
            headers={"User-Agent": "Project-Radar-Research/0.1 (public-source-health-check)"},
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

    # A 200 response proves availability, but raw HTML cannot be treated as permit
    # evidence until a documented result-table parser has extracted an attributable
    # record identifier, regulated entity, document title, and content URL.
    run.status = "success"
    run.message = (
        "TCEQ Records Online returned HTTP 200. Result rows require a documented parser "
        "before they can be attached as environmental permit evidence."
    )
    return run

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
