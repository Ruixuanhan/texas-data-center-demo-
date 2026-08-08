-- ============================================================
-- TCEQ Permit Query Schema — Stage 1: Core Results
--
-- Minimal tables to store API requests and their results.
-- No lookup tables, no FK constraints on series/media/doc type IDs.
-- Apply this first;
-- ============================================================

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tceq_permit_query_search_requests (
    request_id      TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    submitted_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    client_ip       TEXT,
    access_id       TEXT,

    -- Classification filter (raw IDs — no FK until stage 2)
    series_id       INTEGER,
    doc_type_id     INTEGER,
    media_id        INTEGER,

    -- Field-based search combinator
    field_operator  TEXT    CHECK (field_operator IN ('AND', 'OR')) DEFAULT 'AND',

    -- Full-text quick search
    ftx             TEXT,

    -- Result metadata
    result_count    INTEGER,
    response_at     TEXT
);

CREATE TABLE IF NOT EXISTS tceq_permit_query_search_results (
    result_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id      TEXT    NOT NULL
                        REFERENCES tceq_permit_query_search_requests(request_id)
                        ON DELETE CASCADE,
    rank            INTEGER,
    doc_name        TEXT,
    doc_title       TEXT,
    primary_id      TEXT,
    secondary_id    TEXT,
    reg_entity_name TEXT,
    central_rn      TEXT,
    address         TEXT,
    series_id       INTEGER,
    doc_type_id     INTEGER,
    media_id        INTEGER,
    in_date         TEXT,
    content_url     TEXT
);

CREATE INDEX IF NOT EXISTS idx_requests_submitted ON tceq_permit_query_search_requests(submitted_at);
CREATE INDEX IF NOT EXISTS idx_results_request    ON tceq_permit_query_search_results(request_id);
CREATE INDEX IF NOT EXISTS idx_results_primary_id ON tceq_permit_query_search_results(primary_id);
CREATE INDEX IF NOT EXISTS idx_results_reg_entity ON tceq_permit_query_search_results(reg_entity_name);
