# NFL data freshness: how it works and how to triage it

Introduced with the fix for issue #454 (2026-11-12): every NFL page served Week 9
data during Week 10.

## What went wrong (root causes, verified)

| # | Cause | Evidence |
|---|---|---|
| 1 | `nfl-schedules-results.yml` generated fresh results every day but **could not push them**. `data/nfl/prediction-evaluations/.../receiving/2026.jsonl` grew ~7.6 MB per week to 101.9 MB, over GitHub's 100 MB hard limit (`GH001`). All data was bundled in one commit, so `games.json`/`results.json` were rejected with it. | Runs on Nov 9, 10, 11: `Commit and push refreshed data` failed 5/5 pushes with `File ... is 101.93 MB; this exceeds GitHub's file size limit`. The generator step in the same runs reported `season 2026: 272 games, 136 results`. |
| 2 | `resolve-nfl-current-week.mjs` picked the earliest week with a `scheduled` game. With results stuck, 14 finished Week 9 games stayed `scheduled`, pinning every downstream job to Week 9. | `yardage-projections`, `team-opportunity`, `fantasy-points-allowed`, `tds-allowed`, TD preview all `week: 9` on Nov 12. |
| 3 | Two workflows write the same FPA/TDs artifacts with different week rules (`nfl-allowed-by-position.yml` is calendar-based; `nfl-yardage-projections.yml` used the pinned week). The pinned one ran later and overwrote the correct Week 10 output. | `yards-vs-average-by-position.json` (only the first workflow) was Week 10; FPA/TDs (both) were Week 9. |
| 4 | Fail-closed validators downstream of stale results correctly refused to publish, so more artifacts went stale. | `matchup-metrics`, `performance-analytics`: `unexpected team-games: 2026_09_*`; `matchup-projections`: `missing team-games`. All pass once results are current. |
| 5 | Nothing alerted. Each failing step was either `continue-on-error` or in a workflow nobody watched, and deploys stayed green. | `yardage-projections` red for 9 straight days. |

**Upstream was not the problem.** nflverse `games.csv` had all 15 Week 9 games scored
(136 results, W1-W9); every score matches ESPN's scoreboard. The "source lag or
parsing" hypothesis in the issue did not apply to this failure. (A genuine, separate
upstream lag did hit Nov 3-4: nflverse had not yet published Week 9 weekly rosters.)

## What changed

- **Storage**: WU3 evaluation datasets are now week-sharded
  (`<dataset>/<season>/<WW>.jsonl`; `scripts/lib/nfl-evaluation-shards.ts`). The largest
  shard is 23 MB. Existing data was split losslessly (`scripts/migrate-nfl-evaluation-shards.ts`
  verifies the row multiset before deleting the monolith). Readers fall back to the legacy file.
- **Commit isolation**: `nfl-schedules-results.yml` pushes in two stages. Stage 1
  (games, results, source caches, outcomes) can no longer be blocked by stage 2 (evaluations,
  coaching, performance). `scripts/ci/commit-and-push.sh` refuses oversized files *before* committing and
  does not retry a `GH001` rejection.
- **Current week**: `scripts/lib/nfl-current-week.mjs`. A `scheduled` game more than 12 h past
  kickoff is *overdue* and cannot hold the week. The resolver reports provenance
  (`week_source=status|calendar-fallback`) and emits a `::warning::` when it falls back.
  `resolveCurrentWeek(games, { now })` is the same logic for the market fetchers.
- **Visibility**: `Report refresh outcome` always runs and fails the job if any
  `continue-on-error` step failed; the page shows opponent week, data-through week and a
  warning if the data is partial or old.
- **Watchdog**: `.github/workflows/nfl-freshness-watchdog.yml` (every 3 h in season),
  independent of builds and deploys.

## The freshness check

```
npm run nfl:freshness -- --upstream                 # local files + nflverse parity
npm run nfl:freshness -- --upstream --github --production=https://www.joeknowsball.com
```

Every non-passing check carries a **cause**, so the response is obvious:

| Cause | Meaning | Typical action |
|---|---|---|
| `upstream_lag` | nflverse has not published the finals yet | Wait; the check escalates to a failure 36 h past the completion window |
| `workflow_failure` | a refresh workflow is failing / has not succeeded recently | Read that workflow's log |
| `stale_artifact` | source is current but a committed artifact is behind (wrong week, too old, missing) | Re-run the producing workflow |
| `deploy_drift` | the repo is current but production serves older data | Check the deploy |
| `inconsistent_data` | committed files disagree with each other or with the source | Investigate; do not publish |
| `storage_risk` | a tracked file is within 5 MB of GitHub's 100 MB push limit | Shard or prune it now |
| `check_unavailable` | a check could not run; never reported as success | Fix the check's input |

Verdict precedence: `fail` > `unknown` > `degraded` > `ok`. An empty or partly-unavailable
check set can never report `ok`.

## Known, intentional exceptions

- `nfl-betting-splits-refresh.yml` is owner-gated by `NFL_DK_SPLITS_LIVE_VERIFIED`; red is expected until it is set.
- `nfl-ai-handicap-v2.yml` skips by design behind its enable gate.
- Archive-writing steps (`nfl:totals`, `nfl:starter-cohort`, the paid market fetches) are
  owned by CI so prediction archives are frozen pregame by the scheduled run, not by a local checkout.
