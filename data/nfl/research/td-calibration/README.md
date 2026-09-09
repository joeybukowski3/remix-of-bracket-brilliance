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
