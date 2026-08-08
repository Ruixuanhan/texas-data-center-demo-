-- FERC eLibrary Search Schema (SQLite)
-- API base: https://elibrary.ferc.gov/eLibrarywebapi/api/
-- Covers: General/Advanced Search, Docket Search, New Docket Search, File Downloads
--
-- Enumerated values (stored inline as TEXT with CHECK constraints):
--   library       : General | Electric | Gas | Oil | Rulemaking | Hydro
--   category      : Issuance | Submittal
--   availability  : p (Public) | c (CEII) | s (Protected) | n (Privileged)
--   date_type     : issued_date | filed_date | posted_date
--   affil_type    : author | agent | recipient
--   family_value  : None | child | Parent

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- DOCKETS
-- A docket represents a regulatory proceeding at FERC
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ferc_dockets (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    docket_id            INTEGER UNIQUE,                   -- server-assigned DocketID
    docket_short_number  TEXT NOT NULL,                    -- e.g. CP24-123
    sub_docket_number    TEXT NOT NULL DEFAULT '000',
    docket_full_number   TEXT NOT NULL,                    -- e.g. CP24-123-000
    docket_description   TEXT,
    applicants           TEXT,                             -- comma-delimited list
    docket_creation_date TEXT,                             -- ISO date string
    docket_filing_date   TEXT,
    docket_sheet_link    TEXT,
    fetched_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dockets_short ON ferc_dockets(docket_short_number);
CREATE INDEX IF NOT EXISTS idx_dockets_full  ON ferc_dockets(docket_full_number);

-- ---------------------------------------------------------------------------
-- DOCUMENTS
-- Core record for every filing or issuance retrieved from eLibrary
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ferc_documents (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Identifiers
    document_id      INTEGER UNIQUE,                       -- server document_id
    accession_number TEXT NOT NULL UNIQUE,                 -- e.g. 20240101-5000
    accession_date   TEXT,
    accession_series TEXT,

    -- Classification
    category         TEXT NOT NULL
                     CHECK(category IN ('Issuance', 'Submittal')),
    category_cd      INTEGER,
    availability     TEXT NOT NULL DEFAULT 'p'
                     CHECK(availability IN ('p','c','s','n')),
    family_value     TEXT DEFAULT 'None'
                     CHECK(family_value IN ('None','none','child','Parent')),

    -- Content
    description      TEXT,
    summary          TEXT,
    source           TEXT,

    -- Dates (stored as ISO TEXT for SQLite compatibility)
    filed_date       TEXT,
    issued_date      TEXT,
    posted_date      TEXT,
    fed_reg_date     TEXT,
    comments_due_date TEXT,

    -- Federal references
    fed_reg_number   TEXT,                                 -- Federal Register number
    ferc_cite        TEXT,                                 -- FERC Reports citation
    fed_court_case   TEXT,
    fercite          TEXT,
    opinion          TEXT,
    order_number     TEXT,

    -- Financial
    fee_amount       REAL DEFAULT 0,

    -- Hierarchy (parent/child documents)
    parent_accession_number TEXT,

    -- Scoring (populated from full-text search results)
    relevance_score  REAL,

    -- Metadata
    is_efiling       INTEGER NOT NULL DEFAULT 0 CHECK(is_efiling IN (0,1)),
    fetched_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_docs_accession  ON ferc_documents(accession_number);
CREATE INDEX IF NOT EXISTS idx_docs_filed      ON ferc_documents(filed_date);
CREATE INDEX IF NOT EXISTS idx_docs_issued     ON ferc_documents(issued_date);
CREATE INDEX IF NOT EXISTS idx_docs_category   ON ferc_documents(category);
CREATE INDEX IF NOT EXISTS idx_docs_avail      ON ferc_documents(availability);

-- ---------------------------------------------------------------------------
-- DOCUMENT <-> DOCKET  (many-to-many)
-- One document can appear in multiple dockets
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ferc_document_dockets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES ferc_documents(id) ON DELETE CASCADE,
    docket_id   INTEGER NOT NULL REFERENCES ferc_dockets(id)   ON DELETE CASCADE,
    docket_text TEXT,       -- raw DOCKET_TEXT from API
    sub_docket_text TEXT,
    docket_code TEXT,
    sub_docket_number INTEGER,
    docket_type TEXT,       -- e.g. 'PRIMARY', 'ASSOCIATED'
    UNIQUE(document_id, docket_id)
);

CREATE INDEX IF NOT EXISTS idx_doc_dockets_doc    ON ferc_document_dockets(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_dockets_docket ON ferc_document_dockets(docket_id);

-- ---------------------------------------------------------------------------
-- DOCUMENT CLASS TYPES
-- A document may have multiple class/type labels (e.g. Order - Approving)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ferc_document_class_types (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id     INTEGER NOT NULL REFERENCES ferc_documents(id) ON DELETE CASCADE,
    document_class  TEXT NOT NULL,    -- e.g. 'Order', 'Letter', 'Application'
    document_type   TEXT NOT NULL     -- e.g. 'Approving', 'Denying', 'Accepting'
);

CREATE INDEX IF NOT EXISTS idx_class_types_doc ON ferc_document_class_types(document_id);
CREATE INDEX IF NOT EXISTS idx_class_types_cls ON ferc_document_class_types(document_class);

-- ---------------------------------------------------------------------------
-- LIBRARIES
-- A document may belong to multiple FERC libraries
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ferc_document_libraries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES ferc_documents(id) ON DELETE CASCADE,
    library     TEXT NOT NULL
                CHECK(library IN ('General','Electric','Gas','Oil','Rulemaking','Hydro'))
);

CREATE INDEX IF NOT EXISTS idx_doc_libs_doc ON ferc_document_libraries(document_id);

-- ---------------------------------------------------------------------------
-- AFFILIATIONS
-- Authors, agents, and recipients associated with a document
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ferc_affiliations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id     INTEGER NOT NULL REFERENCES ferc_documents(id) ON DELETE CASCADE,
    affil_type      TEXT NOT NULL
                    CHECK(affil_type IN ('author','agent','recipient')),
    organization    TEXT,
    last_name       TEXT,
    first_initial   TEXT,
    middle_initial  TEXT
);

CREATE INDEX IF NOT EXISTS idx_affiliations_doc  ON ferc_affiliations(document_id);
CREATE INDEX IF NOT EXISTS idx_affiliations_org  ON ferc_affiliations(organization);
CREATE INDEX IF NOT EXISTS idx_affiliations_type ON ferc_affiliations(affil_type);

-- ---------------------------------------------------------------------------
-- TRANSMITTALS (attached files)
-- Each document can have multiple files attached
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ferc_transmittals (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id     INTEGER NOT NULL REFERENCES ferc_documents(id) ON DELETE CASCADE,
    file_id         TEXT NOT NULL,
    file_type       TEXT,           -- e.g. 'filing', 'attachment', 'exhibit'
    file_format     TEXT,           -- e.g. 'PDF', 'DOCX', 'XLSX'
    file_name       TEXT,
    file_description TEXT,
    file_size_bytes INTEGER,
    transmittal_fk  TEXT,           -- parent transmittal foreign key (nullable)
    download_url    TEXT,
    is_legacy       INTEGER DEFAULT 0 CHECK(is_legacy IN (0,1)),
    UNIQUE(document_id, file_id)
);

CREATE INDEX IF NOT EXISTS idx_transmittals_doc    ON ferc_transmittals(document_id);
CREATE INDEX IF NOT EXISTS idx_transmittals_format ON ferc_transmittals(file_format);

-- ---------------------------------------------------------------------------
-- SEARCH REQUESTS (audit log of queries issued)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ferc_search_requests (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    search_type     TEXT NOT NULL
                    CHECK(search_type IN ('general','docket','new_docket','download')),
    -- General search fields
    search_text     TEXT,
    search_fulltext INTEGER DEFAULT 1,
    search_desc     INTEGER DEFAULT 1,
    all_dates       INTEGER DEFAULT 0,
    efiling_only    INTEGER DEFAULT 0,
    sort_by         TEXT,
    group_by        TEXT DEFAULT 'NONE',
    results_per_page INTEGER DEFAULT 100,
    cur_page        INTEGER DEFAULT 1,
    idol_result_id  TEXT,
    -- Docket search fields
    dockets         TEXT,           -- docket number(s)
    subdockets      TEXT DEFAULT 'All',
    filed_date_beg  TEXT,
    filed_date_end  TEXT,
    complete_flag   INTEGER DEFAULT 0,
    -- New docket search fields
    new_docket_by   TEXT CHECK(new_docket_by IN ('rbFilingDate','rbCreateDate',NULL)),
    new_docket_start TEXT,
    new_docket_end   TEXT,
    -- Response metadata
    total_hits      INTEGER,
    num_hits        INTEGER,
    success         INTEGER,
    error_message   TEXT,
    requested_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- SEARCH REQUEST -> DOCKET FILTERS  (for general search with multiple dockets)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ferc_request_docket_filters (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id      INTEGER NOT NULL REFERENCES ferc_search_requests(id) ON DELETE CASCADE,
    docket_number   TEXT,
    sub_docket_numbers TEXT  -- JSON array stored as text: '["000","001"]'
);

-- ---------------------------------------------------------------------------
-- SEARCH REQUEST -> DATE FILTERS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ferc_request_date_filters (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id  INTEGER NOT NULL REFERENCES ferc_search_requests(id) ON DELETE CASCADE,
    date_type   TEXT NOT NULL CHECK(date_type IN ('issued_date','filed_date','posted_date')),
    start_date  TEXT NOT NULL,
    end_date    TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- SEARCH RESULTS  (links requests to documents with relevance info)
-- Note: renamed from ferc_search_result_hits for clarity; the FERC API calls
-- these "searchHits" (see: numHits, totalHits, searchHits[] in the response).
-- Pagination totals (totalHits, numHits) are stored on ferc_search_requests.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ferc_search_results (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id      INTEGER NOT NULL REFERENCES ferc_search_requests(id) ON DELETE CASCADE,
    document_id     INTEGER NOT NULL REFERENCES ferc_documents(id)       ON DELETE CASCADE,
    rank            INTEGER,            -- position in result set
    relevance_score REAL,
    reference       TEXT,               -- API 'reference' field
    UNIQUE(request_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_results_request  ON ferc_search_results(request_id);
CREATE INDEX IF NOT EXISTS idx_results_document ON ferc_search_results(document_id);
