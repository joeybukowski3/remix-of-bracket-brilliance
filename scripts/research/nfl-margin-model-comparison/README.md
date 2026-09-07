# NFL margin model comparison (research-only)

Audits the two NFL game-margin numbers currently surfaced on the matchup page:

- **Method A** — JKB Power Rating fair spread (`jkb-power-number-v1.0.0`):
  `0.24 * (homeCurrentOVR - awayCurrentOVR) + 2.0 HFA`.
- **Method B** — JKB projected score (`jkb-nfl-total-ridge-v1.0.0`) reduced to an
  implied margin: `homeExpectedPoints - awayExpectedPoints`.

Nothing here is wired into production. No script writes to `public/`, to any
prediction archive, or to any fitted-model manifest. The sportsbook line is used
**only** as a reported benchmark and never as an input to a candidate predictor.

## Reproducing

1. `node scripts/analysis/nfl-performance-backtest/fetch-pbp.mjs --seasons=2023,2024,2025`
   Populates the gitignored `data/nfl/backtest-2026/raw/` trimmed play-by-play
   cache that the Method A walk-forward Current OVR reconstruction needs.
   (The Method B scoring-support cache under
   `data/nfl/research/nfl-total-model/` is already committed.)
2. `npx tsx scripts/research/nfl-margin-model-comparison/evaluate.mts`
   Reconstructs both methods per game for 2023-2025 REG, joins them against
   final scores, and writes `out/results.json` + `out/joined-games.json`.
3. `npx tsx scripts/research/nfl-margin-model-comparison/significance.mts`
   Paired significance tests (paired t + 10,000-resample percentile bootstrap,
   fixed seed) over the joined sample, plus the situational-blend holdout test.
   Writes `out/significance.json`.
4. `npx tsx scripts/research/nfl-margin-model-comparison/bal-ind-decomposition.mts`
   Term-by-term decomposition of 2026 Week 1 BAL @ IND. Writes
   `out/bal-ind-decomposition.json`.

The three `diagnostic-*.mts` scripts print the supporting football context
(EWMA window weight shares, 2025 full-season EPA ranks, late-2025 form).

## Leakage controls

- Method A: Current OVR is rebuilt walk-forward at each game's kickoff using the
  same reconstruction as `scripts/analysis/nfl-current-ovr-spread-calibration/calibrate.mts`,
  including its assertion that the target game never appears in either team's own
  feature sample.
- Method B: refit per evaluation season on training seasons strictly before it
  (`[2022, evalSeason-1]`), with the scoring-support index for training capped at
  `max(trainingSeasons)`. For 2025 this reproduces the frozen production
  2022-2024 window exactly — `evaluate.mts` asserts the parity
  (`productionParity2025.maxAbsImpliedMarginDelta === 0`).
- Blend weights are chosen on 2023-2024 only and applied to an untouched 2025
  holdout.
