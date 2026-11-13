# Site-wide data pipeline inventory (read-only audit, 2026-11-12)

Scope: MLB, NBA, CFB and PGA refresh pipelines, as seen from GitHub Actions run history
and the age of committed artifacts on `main`. **No system outside NFL was modified.** NFL is
covered in [nfl-data-freshness.md](nfl-data-freshness.md).

Method: last 8 completed runs per active workflow (API), plus `generatedAt` age of every
JSON artifact under `public/data/{mlb,nba,cfb,pga}`. These are *apparent* gaps from outside; each needs
confirmation by the owner of that pipeline before it is called a defect.

## Findings, most important first

| # | Sport | Finding | Evidence | Why it matters |
|---|---|---|---|---|
| 1 | PGA | `sync-pga-data.yml` has failed its last 4 runs (Nov 9-11); last success ~189 h ago. | `best-bets`, `current-tournament`, `next-tournament`, `power-rankings`, `jkb-trend-rankings` are all ~8 days old. | PGA pages are serving week-old tournament data. |
| 2 | MLB | `mlb-data-watchdog.yml` **last ran 2026-09-03**. | Its recent history is all green, but the newest run is ~70 days old. | The MLB freshness monitor is not running, so MLB staleness would be silent. (Schedule disabled, expired, or removed; needs checking.) |
| 3 | MLB | `public/data/mlb/hr-prediction-history.json` is **66.6 MB** and growing. | Same failure class as the NFL outage: GitHub rejects pushes of any file over 100 MB. | When it crosses the limit, every MLB workflow that commits it will fail to push. Estimate the growth rate and shard or archive it before then. |
| 4 | MLB | `grade-mlb-hr-results.yml`: all 8 most recent runs **cancelled**. | No successful HR grading run in the window. | HR outcomes may not be getting graded; confirm whether the cancellations are a concurrency-group interaction or a real stall. |
| 5 | MLB | `post-mlb-ml-edges-to-x.yml`: 8 consecutive failures, no success in window. | `✗✗✗✗✗✗✗✗`. | Social posting, not site data, but it is silently dead. |
| 6 | PGA | `public/data/pga/round-history-pga.json` is 50.5 MB. | Single growing file. | Same storage-risk class as #3; lower urgency. |
| 7 | Deploy | `deploy.yml` (GitHub Pages) failed at `actions/deploy-pages@v4` on 2026-11-09 (build step passed). | Latest push-triggered run. | Issue #454 states production deploys on Vercel, so this is probably legacy, but confirm it is not the live path. |
| 8 | NBA | No `public/data/nba` directory and no NBA workflows on `main`. | NBA work lives in unmerged branches/PRs. | Nothing to monitor yet; add a freshness check when it ships. |
| 9 | CFB | Only `v2/shadow-projections.json` is under `public/data/cfb` (65 h old); `cfb-v2-shadow-refresh` runs ~weekly. | Workflows `cfb-market-odds-refresh` (2 failures in last 8, now green) and `cfb-official-rankings-refresh` are healthy. | No gap apparent; revisit when CFB becomes the in-season focus. |

Healthy at the time of the audit: `generate-mlb-hr-props`, `generate-mlb-numerology`,
`generate-mlb-power-rankings`, `grade-mlb-ml-results`, `mlb-numerology-grade`, `mlb-x-canonical`,
`props-value-refresh`, `sync-pga-schedule`, `refresh-pga-player-history`,
`cfb-official-rankings-refresh`.

## Recommended follow-ups (not done here)

1. Triage PGA `sync-pga-data` (finding 1): the logs will say whether it is a source change or a push problem.
2. Re-enable or replace the MLB watchdog (2), then point it at the same cause taxonomy used for NFL
   (`upstream_lag`, `workflow_failure`, `stale_artifact`, `deploy_drift`, `storage_risk`).
3. Add `storage_risk` coverage for the two large files (3, 6) by listing them in
   `checkFileSizes` consumers for their sport, or shard them as the NFL evaluation data now is.
4. Reuse `scripts/ci/commit-and-push.sh` (oversized-file guard, no retry on `GH001`) in the other
   data workflows; they share the same `git push` pattern.
5. Generalise `scripts/lib/nfl-freshness.mjs` into a sport-neutral core once one more sport adopts it.
