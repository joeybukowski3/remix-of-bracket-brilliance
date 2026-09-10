# JKB TD Score calibration study — RESEARCH ONLY

Leakage-safe historical reconstruction of the production **JKB TD Score** and
an evaluation of simple score → anytime-TD-probability calibrators, including a
targeted early-season prior study.

**Nothing here is wired into production.** No production model, artifact, UI,
Fair Odds, TD Probability, or TD Edge was created or changed.

## Producers

| Script | Output |
|---|---|
| `scripts/refresh-nfl-touchdown-context-cache.mjs --seasons=2021,2022,2023,2024,2025,2026` | backfilled `data/nfl/nflverse/touchdown-context/` (2021 support + 2022-2025) |
| `scripts/research/build-nfl-td-calibration-dataset.ts` | `player-game-dataset.jsonl` (full, git-ignored), `calibration-dataset.jsonl.gz` (compact, committed), `calibration-dataset.sample.jsonl`, `dataset-summary.json` |
| `scripts/research/run-nfl-td-calibration.ts [--strategy=…]` | `calibration-results.json`, `calibration-results-trailing8.json` |
| `scripts/research/run-nfl-td-early-season-study.ts` | `early-season-results.json`, `candidate-model.json` |
| `scripts/research/fetch-nfl-anytime-td-research-archive.mjs [--dry-run]` | appends `data/nfl/props/market-archive/nfl-anytime-td-research-archive.jsonl` |

## Files in this directory

- **`calibration-dataset.jsonl.gz`** (committed, ~1.7 MB) — the compact dataset
  the calibration scripts read: one row per regular-season player-game
  (2022-2025) × trailing-window strategy, with `jkbTdScore`, `scoreState`,
  `actualTd`, prior-history counts, and movement flags.
- **`player-game-dataset.jsonl`** (git-ignored, ~140 MB) — the full row with
  every component percentile + raw input. Regenerate from the builder.
- **`dataset-summary.json`** — QA: counts, base rates, score-bin TD rates,
  component missingness, the player-week-vs-PBP label cross-check.
- **`calibration-results*.json`** — rolling-origin folds, methods A-G,
  reliability curves, per-position curves, 20-quantile bins.
- **`early-season-results.json`** — per-strategy Weeks 2-4 / 5-18 / full
  metrics, the recommended strategy, held-out-2025 confirmation, movement-class
  strata, favorite-region audit, and the team-changed calibrator probe.
- **`candidate-model.json`** — the research candidate calibrator (global
  logistic on the recommended `trailing8` window, + optional team-changed
  dummy). **Not production. Not validated vs market. Favorite region thin.**

## Trailing-window strategies

| Strategy | Rule |
|---|---|
| `production` | Wk 1 → prior full season (S-1); Wk 2+ → season S to date. Mirrors the live site default. |
| `trailing8` | Latest 8 games before kickoff, crossing seasons. **= the live "last 8" toggle. Recommended.** |
| `trailing10` | Latest 10 games before kickoff. |
| `priorSeasonThruW4` | Wk 1-4 → prior full season; Wk 5+ → season S to date. |
| `blendThruW4` | Wk 1 → S-1 full; Wk 2-4 → (S-1 full) ∪ (S to date); Wk 5+ → S to date. |

## Leakage protections

1. Score math is the **unmodified** production `buildTouchdownScores`.
2. Each candidate's `playerGames` / `opponentGames` are pre-filtered to games
   with an earlier `(season, week)` than the target, then fed to the model via
   a season-relabel trick so its window filter is a no-op.
3. The empirical-Bayes league prior, position usage mean, and league
   positional-TD mean are computed inside `buildTouchdownScores` from those
   pre-filtered pool games only.
4. Percentile population = that week's reconstructed candidate pool; every
   percentile input is a trailing-window value.
5. Implied team points from closing spread/total (pregame proxy).
6. `actualTd` (`rushing_tds + receiving_tds >= 1`, REG) is the label only.
7. Strategy selection uses pre-2025 folds; 2025 is confirmation only.

## Key results

- Discrimination: OOS AUC ≈ 0.71-0.72, TD rate monotone ~6% → ~50% across the
  score range.
- A single global one-parameter logistic calibrates the score well OOS
  (held-out 2025, `trailing8`: ECE 0.008, calibration slope 1.08, Brier 0.136).
- **Early-season fix:** switching the default window from season-to-date to
  `trailing8` cuts Weeks 2-4 ECE from 0.062 to ~0.019 and removes the −5pp
  under-prediction, without hurting Weeks 5+.
- A `teamChanged` dummy in the calibrator (c ≈ −0.66) removes a ~5pp
  over-prediction for players in their first games with a new team.

## Known limitations

- 2022 Week 1 → null scores (player-week stats start 2022).
- Candidate pool membership is ex-post "appeared that week".
- No historical sportsbook odds → no market-edge baseline (archive starts
  2026-09-09; `fetch-nfl-anytime-td-research-archive.mjs` accumulates it).
- Predicted P > 0.5: < 20 observations/season — unvalidated.

## Prospective 2026 forward validation (RESEARCH ONLY)

The historical study cannot be confirmed against a real prospective sample or
against archived odds. The forward-validation infrastructure accumulates that
evidence during the 2026 season. **It changes nothing in production**: no TD
Score math, no `touchdown-preview.json`, no JKB TD Probability / Fair Odds /
TD Edge in any UI, no change to the production sportsbook selection path.

| Script | Output |
|---|---|
| `npm run nfl:td-forward-snapshot` (`scripts/research/snapshot-nfl-td-forward-validation.mjs`) | appends one pregame snapshot per `(playerId, gameId, observedAt)` to `forward-archive/nfl-td-forward-archive-2026.jsonl` (append-only; prior observations are never overwritten) |
| `npm run nfl:td-forward-grade` (`scripts/research/grade-nfl-td-forward-validation.mjs`) | appends one grade per `(playerId, gameId)` to `forward-archive/nfl-td-forward-grades-2026.jsonl` after games are final |
| `npm run nfl:td-forward-summary` (`scripts/research/run-nfl-td-forward-validation-summary.mjs`) | rebuilds `forward-validation-summary.json` |

Shared pure helpers (unit-tested): `scripts/research/lib/nfl-td-forward-core.mjs`
(calibrator resolution + grading + flags + append-only dedupe),
`nfl-td-forward-metrics.mjs` (Brier / Log Loss / ECE / AUC / calibration bins /
flat-stake ROI), `nfl-td-forward-summary.mjs` (weekly summary + reported
promotion gates).

### Archive row schema (`nfl-td-forward-archive-v1`)

`season, week, gameId, kickoff, playerId, playerName, position, team, opponent`,
`jkbTdScoreProductionWindow` + `jkbTdScoreProductionWindowKey`,
`jkbTdScoreTrailing8`, `candidateCalibratedProbability` (trailing8 window; the
candidate's own recommended window), `candidateCalibratedProbabilityProductionWindow`,
`candidateCalibratedProbabilityTrailing8`, `candidateCalibrationVersion`,
`teamChanged` (nullable), `earlySeasonFlag`, `bestSportsbookOdds`,
`bestSportsbookBook`, `rawMarketImpliedProbability`, `novigLine`,
`novigOverPrice`, `novigUnderPrice`, `novigOverImplied`, `novigUnderImplied`,
`novigNoVigProbability`, `observedAt`, `actualTd` (null pregame),
`gradedAt` (null pregame).

- **Calibrator**: the RESEARCH candidate global-logistic calibrator, resolved
  from `candidate-model.json` — coefficients are always **derived from the
  committed artifact**, never hardcoded from prose. The `teamChanged`
  adjustment (`optionalTeamChangedTerm`) is applied exactly as recorded when
  `teamChanged` is a known boolean.
- **teamChanged**: derived from the player's prior game history in
  `touchdown-preview.json` (most-recent prior game team ≠ this week's team).
  That history is roster-scoped, so this is under-populated / often `null` —
  the summary carries a `teamChangedUnknown` stratum and the promotion gate
  treats a thin team-changer sample as "insufficient to evaluate".
- **Novig**: two-sided `player_anytime_td` line 0.5 exchange market.
  `pNoVigOver = pOver / (pOver + pUnder)` computed **only** when both American
  prices are valid. Research-only — the production selection path still drops
  this market.
- **Grading**: `actualTd = 1` iff `rushing_tds + receiving_tds >= 1` in the
  nflverse player-week stats cache; passing / defensive / special-teams TDs and
  two-point conversions are excluded by construction. Grades live in a separate
  append-only file; pregame feature values are never mutated.

### `forward-validation-summary.json` (`nfl-td-forward-validation-summary-v1`)

Overall + per-stratum n / TD rate / Brier / Log Loss / ECE / AUC for
**A** production-window calibrated probability, **B** trailing8 calibrated
probability, **C** Novig no-vig probability, **D** sportsbook raw implied
probability; calibration-by-probability-bin tables; strata for Weeks 2–4,
Weeks 5+, team-changers / non / unknown, QB/RB/WR/TE, P > .40, P > .50;
`modelVsMarket` edge distributions (`candidate − Novig`, `candidate − book`)
with realized flat-stake ROI on the best book price by edge threshold
(`>0, ≥2pp, ≥5pp, ≥7.5pp, ≥10pp`, reported only at n ≥ 20 — **not** a
production "TD Edge"); and a `promotionGates` block.

### Promotion gates (REPORTED, never enforced)

`autoPromote` is always `false` and no script promotes a model. The gates:
≥ 4 completed 2026 weeks (6+ preferred); ≥ 50 graded observations with
candidate trailing8 probability > 0.40; forward trailing8 ECE stable vs the
historical study (± 0.02) and `|meanPred − tdRate| ≤ 0.02`; team-changer
trailing8 ECE not more than 0.03 above non-changers; Weeks 2–4 trailing8 ECE
not more than 0.03 above Weeks 5+.
