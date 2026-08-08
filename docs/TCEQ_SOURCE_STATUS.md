# TCEQ Environmental-Permit Source Status

## Official access paths

TCEQ identifies both **Status of Air Permits and Permit Applications** and **TCEQ Records Online** as public access paths for environmental records. The Records Online application supports search criteria including regulated-entity name, central registry number, primary identifier, secondary identifier, and address.[1] [2] [3]

Project Radar retains the merged `data/fixtures/tceq/example-query.txt` as a versioned query pattern and `data/fixtures/tceq/tceq-schema-stage1.sql` as a documented result-field reference. The Python adapter uses the public Records Online endpoint only with explicit query terms, archives raw returned rows as source evidence, and does not infer construction, FID, or COD from permit evidence alone.

## Availability validation — 2026-08-08

The versioned template query for `Google`, `Meta`, or `Amazon` returned **HTTP 503** from `records.tceq.texas.gov` during direct validation. Therefore, TCEQ is configured as an environmental source with an executable, health-reporting adapter, but is **not represented as active project evidence** until a successful official result is retrieved and parsed.

> A failed upstream request is an operational source-health result—not evidence that a project has no permit.

## References

[1]: https://www.tceq.texas.gov/agency/data/lookup-data "TCEQ — Look Up Data and Records Online"
[2]: https://www.tceq.texas.gov/permitting/permit_data.html "TCEQ — Status of Permits and Registrations"
[3]: https://records.tceq.texas.gov/ "TCEQ Records Online"
