# WU4B — positional pools + player opportunity-share allocation (S1–S4 research)

Research only. No production wiring, archive/schema change, or model-version
bump has been made. Nothing here is promoted.

## Pipeline

1. `build-dataset.ts` → `data/nfl/props/role-allocation-dataset-2022-2025.json`
   - Historical positional pools per team-game + per-player rushing/receiving
     share observations with point-in-time role evidence.
2. `walk-forward.ts` → `data/nfl/props/role-allocation-walk-forward.json`
   - Strict rolling-origin folds (train 2022–2023 → validate 2024; train
     2022–2024 → validate 2025). Reports share / volume / final-yards
     error, transition cohorts, per-cohort normalisation distortion,
     within-pool rank quality, and pool coherence for every candidate.

## Accounting (exact)

- **Rushing.** WU4A `projected_rush_attempts` = designed rushes (`rush_plays`,
  scrambles excluded). Split three ways — QB-designed / RB / WR-TE — from
  point-in-time team tendency shrunk toward the training-league split, then
  the three sub-pool shares are renormalised to sum to 1 so they add back to
  the WU4A pool exactly. QB pool = QB carries − team scrambles
  (`scrambles = dropbacks − team_pass_attempts − sacks_suffered`). Raw pool
  coverage of `rush_plays` is ~0.93 mean (kneels inflate box-score carries);
  every team-game carries an explicit `poolCoverageRatio` /
  `residualDesignedRushes` — nothing is silently forced.
- **Receiving.** WU4A `projected_pass_attempts` = dropbacks. Reduced to a
  targetable pass pool by one of two candidate reductions, compared in
  walk-forward (never combined, never tuned to Week 1):
  - `calibratedRatio` — `targetable = dropbacks × ratio`, ratio =
    point-in-time (team → league) mean of `attempts / dropbacks`, shrunk.
  - `sacksScrambles` — `targetable = dropbacks × (1 − E[sackRate] −
    E[scrambleRate])`, each rate shrunk team → league.

## S5 — calibration + live Week 1 candidate

3. `calibrate-rushing.ts` → `data/nfl/props/role-allocation-calibrate-rushing.json`
   - Fixes two demonstrated rushing biases (dominant-RB1 under-projection,
     rookie/no-history over-projection). Parameters chosen on the 2024
     selection fold (fit on 2022–2023), reported on the untouched 2025
     holdout. Chosen: dominant anchor `{minPriorGamesPlayed 4, minConcentration
     0.6, shareCap 0.95, usePriorShare}` + no-history prior
     `{shareMultiplier 0.55}`.
4. `week1-candidate.ts` → `data/nfl/props/role-allocation-week1-candidate-2026.json`
   - Side-by-side OLD-v1 vs NEW-candidate for the committed 2026 Week 1
     WU4A pool. Writes no production artifact.

**QB designed rushing is retained on production v1.** WU4A's
`projected_rush_attempts` excludes scrambles, which are ~40–50% of a mobile
QB's rush volume; the derived team-scramble count is also unreliable
(~2× true). The QB designed sub-pool is still carved out of the team pool
so it is never handed to RBs, but QB players keep their v1 projection.

## Known data limitations

- `weekly_rosters` coverage: 2023–2025 = 100%, **2022 = 0%**. For 2022 rows
  `currentTeam` / `rosterCompetitionCount` are null and `teamChanged` falls
  back to a weak "different team in the prior game" proxy. Transition
  cohorts are reported on 2024–2025 only.
- No ESPN depth charts before 2025 — `depthRankProxy` is derived from prior
  within-pool usage rank, not a published depth chart.
- 2,142 / 2,174 REG team-games resolve (98.5%); 16 games fail a residual
  box-score join.
