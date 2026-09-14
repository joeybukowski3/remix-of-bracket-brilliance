# Football Model Evaluation Standards

## Required evaluation record

Every report must name model/version, fitted-model hash or reproducible manifest, target population, feature schema, train seasons, validation folds, untouched holdout/benchmark status, prediction cutoff, market selection rule, exclusions, sample sizes, metrics and known data gaps. Backtests and real production forecasts must be reported separately.

Evaluation materialization from `jkb-football-prediction-outcome-v1` must select the highest valid `outcome_revision` for each prediction ID as of the evaluation cutoff. A later correction supersedes, but never deletes, the prior event. Only `resolution_status: resolved` events enter numerical error metrics; inactive, not-applicable, pending, identity-unresolved, and source-missing counts remain visible as coverage/exclusion diagnostics.

This selection rule is implemented in Work Unit 3 by the `jkb-football-evaluation-v1` materializer (`scripts/lib/nfl-evaluation-*.ts`, `npm run materialize:nfl-evaluation`), which joins each immutable production prediction to its latest valid resolved outcome and writes deterministic per-family row datasets plus a machine-readable summary under `data/nfl/prediction-evaluations/jkb-football-evaluation-v1/`. It preserves the full outcome-revision chronology on every row, keeps a `resolution-status` ledger for non-evaluable predictions, evaluates each point-in-time snapshot independently, and only materializes `mode: production` predictions (`evaluation_mode: production`). It changes no model, projection, prediction record, or outcome record. See [Evaluation Dataset Schema](EVALUATION_DATASET_SCHEMA.md) for the row contract, edge conventions, cohort definitions, and sample-size safeguards. Backtests and real production forecasts remain separately reported and separately namespaced; the WU3 datasets are forward-production only and are distinct from the Phase 11A historical / live-paper-trading research join.

The current player development standard is rolling origin: train 2022 -> validate 2023; train 2022-2023 -> validate 2024. From Phase 4 onward, 2025 is a fixed retrospective benchmark, not a pristine holdout, because it was inspected during earlier development. Current 2026 live outcomes should be preserved as the next genuine production/forward sample rather than repeatedly tuned. The Current-OVR spread calibration reconstructs 2023-2025 and evaluates 2024/2025 using strictly earlier fit information. Preserve these records; do not relabel inspected data as unseen.

## Spread

Report at minimum:

- MAE, RMSE, bias and Pearson correlation for projected home margin versus actual home margin.
- Winner/directional accuracy with ties/pushes stated.
- The same error metrics for a timestamp-valid market line on identical games, plus paired JKB-minus-market error.
- Model-vs-market difference/edge buckets with counts and uncertainty.
- ATS only when sportsbook/provider, price/line, observed time and pre-kickoff validity are known. Separate pushes.
- Home/road/neutral, favorite/underdog, week/season and magnitude splits.
- Calibration slope/intercept and drift by season.

Do not claim the model beats market from winner accuracy. The current calibration's market MAE was lower and ATS rate near 50%; that benchmark must remain visible.

### Offline single-week spread audit

`scripts/research/nfl-week-spread-ats-audit.mts` implements the additive
`jkb-week-spread-ats-audit-v1` research contract. Unlike the WU3 per-snapshot
materializer, it selects one final valid production/projected spread snapshot
per canonical REG game, strictly before kickoff and no later than explicit
UTC `--as-of`. Equal final timestamps with different IDs fail closed. Archive
schema, feature and prediction hashes, source-manifest hashes, canonical
identity/kickoff/neutral status, Week 1 zero-game blend and formula are checked.
This version is specifically for Week 1: later-week live-blend snapshots do
not satisfy its zero-game feature-integrity policy.

Latest outcome revision at cutoff must be resolved/final and agree with
canonical final scores and teams. Missing outcomes stay excluded and visible.
One fixed book (default DraftKings) is selected by latest valid archived
capture strictly before kickoff/cutoff, with semantic hash, identity, opposite
home/away spread lines and provider-update timing checked. This is explicitly
**last archived pre-kickoff**, not a proven closing line: mutable unchanged-state
observation metadata and incomplete capture cadence prevent closing claims.
Closing MAE/RMSE/closer percentage, actual qualifying-pick ATS and CLV remain
unavailable until the necessary evidence is supplied; model direction is never
substituted for an issued qualifying pick. No threshold is invented or changed.

Descriptive absolute prediction-time model/market gap buckets are fixed at
[0,1), [1,3), [3,5), [5,infinity), plus missing; absolute OVR-gap buckets at
[0,10), [10,20), [20,infinity). All report counts and error metrics; current
one-game cells are exploratory and calibration fitting is withheld. These
diagnostic bins do not change production qualification policy. Local input
SHA-256 hashes and selected IDs/features/market evidence are emitted with
deterministic JSON and Markdown only inside an explicit `docs/research/`
output directory. No production-writing or network mode exists. See the
[Week 1 report](../research/nfl-week1-spread-ats-audit-2026/REPORT.md).

Week 1 data completion uses the unchanged canonical nflverse score transform
and existing spread-only append-only outcome resolver. Selected prediction IDs,
model code, ratings and projections are preserved against the original audit's
hash ledger. Additional per-game errors, median error and directional ATS call
the existing production sides-performance grading functions (sign of the gap,
no minimum threshold); they do not establish issued qualifying recommendations.
The fixed snapshot/book/bucket/closing selection policies above are unchanged.
`complete-nfl-week1-result-data.mjs` merges a captured public Week 1 CSV subset
through that canonical transform without truncating other season games.

## Total

Once a total exists, report MAE, RMSE, bias, correlation, calibration, over/under directional accuracy, JKB versus the same-game timestamp-valid market, edge buckets, season/week, dome/outdoor/weather, pace and favorite/underdog environment splits. Evaluate projected home/away scoring components separately if the model produces them.

## Passing, rushing and receiving

For each market report overall MAE, RMSE, bias, median absolute error, R2/correlation where meaningful, season/week band, player and position cohort summaries, history/role status, and prediction interval coverage/width. Player-level tables require minimum samples and must not be used alone for promotion.

Always split true zero-volume from non-zero volume and distinguish recorded zeros from ACT-inferred zeros. Report projection-versus-line error, over/under/push and edge buckets only for a timestamp-valid two-sided sportsbook observation. Prices and break-even probability must accompany betting results; raw hit rate alone is insufficient.

Required decomposition where supported:

- Passing: yardage error is primary. If a version emits attempts/YPA legs, report attempts error, YPA error and their covariance contribution. Do not fabricate legs for the current direct ridge.
- Rushing: carries error, YPC error, final yards error, zero-carry/non-zero cohorts, QB/RB/other position and committee/role cohorts.
- Receiving: targets error and YPT error for the current model. If a future version emits receptions/catch rate/YPR, evaluate each; do not infer them from final yards. Report RB/WR/TE and zero-target/non-zero cohorts.

## Market benchmarking

Raw betting win percentage ignores price, vig, pushes, selection effects, line timing, multiple books and correlation among bets. Required market analysis includes exact line and odds, timestamp/designation, book/consensus rule, sample size, expected versus realized value where justified, confidence intervals, closing-line comparison only where closing is proven, and comparison against simple baselines. A high hit rate on a filtered small sample is hypothesis evidence, not promotion evidence.

## Sample-size discipline

- Pre-register primary metrics and buckets before reading the evaluation set.
- Report `n` for every split; suppress or label exploratory very small cells.
- Correct interpretation for multiple comparisons; do not cherry-pick the best player/week/edge bucket.
- Require directionally consistent improvement across temporal folds and material effect size, not a tiny pooled delta.
- Preserve one genuinely untouched future period after candidate freeze.
- Compare population definitions before comparing MAE; the rushing zero-carry correction demonstrates that easier added rows can lower aggregate MAE without improving hard cases.
- Track missingness, join rejection, market coverage and role-resolution coverage alongside accuracy.

## Promotion gates

A candidate may be promoted only when: temporal leakage tests pass; identity and population are explicit; baseline improvement is repeatable and material; calibration/bias is acceptable or explicitly bounded; uncertainty is measured; immutable prediction and fitted-state snapshots exist; market use is documented; outcome resolution and monitoring are operational; and limitations are approved. A changelog entry records the decision. No single metric is sufficient.
