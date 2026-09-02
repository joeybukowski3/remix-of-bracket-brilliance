# Football Model Evaluation Standards

## Required evaluation record

Every report must name model/version, fitted-model hash or reproducible manifest, target population, feature schema, train seasons, validation folds, untouched holdout/benchmark status, prediction cutoff, market selection rule, exclusions, sample sizes, metrics and known data gaps. Backtests and real production forecasts must be reported separately.

Evaluation materialization from `jkb-football-prediction-outcome-v1` must select the highest valid `outcome_revision` for each prediction ID as of the evaluation cutoff. A later correction supersedes, but never deletes, the prior event. Only `resolution_status: resolved` events enter numerical error metrics; inactive, not-applicable, pending, identity-unresolved, and source-missing counts remain visible as coverage/exclusion diagnostics. This rule defines later WU3 selection semantics only; it does not implement an evaluation dataset.

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
