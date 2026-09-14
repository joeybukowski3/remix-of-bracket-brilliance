# Data-completion validation

## Finalization checks

The stale preseason-zero-results test is replaced with exact final-game/result
correspondence, current-season identity/schema checks, and a mixed-season fixture
covering finished games, legitimate zero scores, missing scores, and exclusion of
the season-2025 Super Bowl despite its 2026 calendar date. Score integrity now
runs over every canonical season, including 2026. Parser production code is unchanged.

Finalization reran the audit-test, parser/market, audit-generation and TypeScript
commands recorded below, with the same temporary config and ES2022 settings:

- Audit tests: **4/4 PASS**.
- Parser/market tests: **48/48 PASS**, five suites: schedulesResultsPipeline
  16, bettingLineGameJoin 6, bettingLineFileStore 5, bettingLineContentHash 3,
  nfl-sides-performance 18. The earlier 46/47 result below is historical.
- Audit generation: **PASS**, 15 completed games, same immutable prediction IDs,
  same numerical dataset and unchanged snapshot/market/bucket methodology.
- Node TypeScript: **PASS**. Application TypeScript: unchanged TS1128 at
  mlbPitcherRegression.ts:28. Focused audit TypeScript: unchanged TS2739 at
  nfl-evaluation-cohorts.ts:61,67 and TS2322 at
  nfl-prediction-outcome-resolver.ts:513. These dependencies were not modified.
- Report links, whitespace and `git diff --check`: **PASS**.

The report generator now preserves the permanent, dated Week 1 baseline across
reruns. No model, data refresh, workflow, commit or push occurred in finalization.

No model, production projection, UI, workflow, market archive, or prediction
snapshot was changed. Existing dependencies were accessed through a temporary
local junction, without npm installation. Temporary test configuration directed
caches into the writable worktree and used Vite's runner config loader.

## Commands and results

- `node scripts/generate-nfl-schedules-results.mjs --season=2026 --dry-run`:
  blocked (`fetch failed`). PowerShell HTTP retrieval also reported socket access
  forbidden. The same public nflverse CSV was retrieved with the web tool,
  preserving its original header and verbatim 16 Week 1 rows in the evidence CSV.
- `node scripts/research/complete-nfl-week1-result-data.mjs --input=docs/research/nfl-week1-spread-ats-audit-2026/evidence/nfldata-week1-2026.csv --generated-at=2026-09-14T10:43:30.000Z`:
  PASS, 16 canonical game rows, 15 finals, DEN–KC unfinished. Only Week 1 rows
  were merged; all other season game rows are unchanged against HEAD.
- `node node_modules/tsx/dist/cli.mjs scripts/resolve-nfl-prediction-outcomes.ts --season=2026 --week=1 --prediction-types=spread --recorded-at=2026-09-14T10:43:31.000Z`:
  PASS after dry-run inspection. Appended 157 outcome events; all prior JSONL
  bytes preserved. This resolves snapshots independently: 173 resolved
  snapshots and 12 pending snapshots correspond to 15 final games and DEN–KC.
  No player outcome files or predictions were written.
- `node node_modules/tsx/dist/cli.mjs scripts/research/nfl-week-spread-ats-audit.mts --season=2026 --week=1 --as-of=2026-09-14T10:43:31.000Z --output-dir=docs/research/nfl-week1-spread-ats-audit-2026 --replace-report=true`:
  PASS, 15/15 expected completed games joined, 16 original selected IDs retained,
  zero rejected prediction rows. Four ineligible market observations are listed
  in the JSON rejection ledger.
- `node node_modules/tsx/dist/cli.mjs --test scripts/research/nfl-week-spread-ats-audit.test.mts`:
  PASS, 4 tests. Tests cover strict cutoff, ambiguous timestamp rejection,
  error/median handling, invalid market state/timing/identity, determinism,
  per-game squared error, original selected IDs and protected input hashes.
- `node node_modules/vitest/vitest.mjs run --config .audit-tools/vitest.config.mts --configLoader=runner`:
  46 PASS, 1 FAIL across 47 tests. Temporary config selects schedulesResultsPipeline,
  bettingLineGameJoin, bettingLineFileStore, bettingLineContentHash and
  nfl-sides-performance suites, with Node environment and the repository `@`
  alias. All 32 market and sides-performance tests pass; 14/15 schedules tests
  pass. The existing preseason assertion expects 2026 to have zero results and
  every game scheduled. It already contradicted the original two-final dataset;
  it now sees 15 finals. No parser failure or schema/identity inconsistency found.
- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json`:
  FAIL on unchanged `src/lib/mlb/mlbPitcherRegression.ts:28`, TS1128.
- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json`:
  PASS.
- Focused TypeScript project extending tsconfig.app.json with ES2022/Node types
  and only the audit tool/tests as entry points: FAIL in unchanged dependencies:
  nfl-evaluation-cohorts.ts:61,67 (team_opportunity/team_total missing from
  Record maps) and nfl-prediction-outcome-resolver.ts:513 (yardage-type union).
  No audit-source TypeScript errors remain under the Node-appropriate ES2022 lib.
- `git diff --check`, report-link validation, new-file whitespace checks,
  protected SHA-256 checks and unchanged-other-week checks: PASS.

Application build, full application tests and browser checks were not run for
this offline data-only task. No paid research/provider refresh, workflow,
publishing, deployment, commit or push occurred. Pre-existing audit work was
preserved and extended; unrelated files were preserved.
