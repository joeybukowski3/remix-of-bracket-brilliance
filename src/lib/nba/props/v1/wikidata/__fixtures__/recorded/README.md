# Recorded Wikidata responses

Real, unmodified responses from the public Wikidata Query Service, recorded on 2026-10-23 with
`scripts/nba-wikidata-position-probe.ts --items=... --save-raw` (8 serial requests, no retry) for 19
hand-picked items. They cover: single and multi-position labels, three-position sets, a "forward"-only item,
a football "center" (Q25075), items with no position, a preferred-rank statement, a deprecated-rank statement,
an item with two ESPN ids, season-qualified statements for non-NBA seasons, references with retrieved dates,
and 2026 entrants with and without a position.

- `raw/*.json` are the eight SPARQL result sets; `snapshot.json` is the snapshot built from them.
- License: Wikidata structured data is CC0 (https://www.wikidata.org/wiki/Wikidata:Licensing).
- These are 19 items and prove mechanics only. They are not a sample for coverage estimates.
- They are frozen: re-running the probe later will return different edit dates and may return different statements.
