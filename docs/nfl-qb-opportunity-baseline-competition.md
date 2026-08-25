# QB passing-opportunity baseline competition (Phase 3)

## Target definition

**Chosen target: `primaryQbAttempts`** -- the official pass-attempt total of
a team's leading passer that week (the QB with the most attempts among
players at QB with `attempts > 0` that team-week).

This is deliberately **not** a sack/scramble-inclusive "dropback" figure,
despite the preferred conceptual structure in the brief suggesting
`team plays x dropback rate x QB share -> QB dropbacks`. Investigated and
rejected for the primary target, with reasoning:

- Sacks produce zero passing yards; scrambles produce rushing yards, not
  passing yards. A "dropback" target conflates opportunity that becomes
  passing yards with opportunity that structurally cannot. **Attempts is
  the correct opportunity unit for a passing-YARDS prop** (`passing yards =
  attempts x YPA`), which is this system's actual downstream use case.
- `attempts` is already player-attributed cleanly in the Phase 1 outcome
  data (official stat, zero ambiguity, no PBP re-processing needed).
- Full dropback attribution (attempts + sacks + scrambles, per QB) was
  investigated via play-by-play `passer_player_id`/`rusher_player_id`:
  sacks attribute at 100%, scrambles at ~94% (`rusher_player_id`, since
  `qb_dropback != pass` and scrambles carry a blank `passer_player_id`),
  but ~11% of pass attempts on `play_type == "no_play"` (penalty-nullified)
  rows have a blank `passer_player_id` in the source -- a known nflverse
  gap. Closing it would require name-matching, which the repository's
  established policy explicitly forbids ("player-name matching is never
  used in production, in any direction, as any fallback" --
  `nfl-matchup-analyzer-redesign-spec.md` §23.2). Per the brief's own
  permission ("do not force that decomposition if the historical data
  cannot support it cleanly"), this was not forced.

Team-level dropbacks (Phase 2's `passPlays`, 100% reliable, no attribution
gap) is retained as `teamDropbacksContext` -- a diagnostic/context field on
every outcome row, never the modeling target.

### Sacks / scrambles / kneels / spikes / multiple QBs / partial games

- Sacks and scrambles: excluded from the target (they are not attempts);
  retained only in `teamDropbacksContext`.
- Kneels/spikes: already excluded upstream (Phase 2's eligible-play filter;
  `pass=0,rush=0` for kneels, and spikes are `pass=0,rush=0` too).
- Multiple QBs in a game: **not silently deleted**. Every QB with
  `attempts > 0` that team-week is counted; the primary is the one with the
  most attempts (ties broken by `playerId` string order, deterministic);
  every other QB's attempts sum into `backupQbAttempts`; the row is flagged
  `instabilityCategory: "multiQbGame"`.
- A QB who starts but leaves early: without a leakage-safe historical
  target-game snap-share source, this cannot be reliably distinguished from
  a healthy starter simply throwing fewer passes than usual in a given
  game. **Explicitly not claimed as solved.** The only load-bearing,
  data-grounded signal used is whether a second QB recorded any attempts
  that same week (see "QB instability" below); a partial game that produced
  no backup attempts (e.g. a bad loss where the starter played all 60 but
  team dropbacks were simply low) is indistinguishable from normal variance
  in this phase and is not specially flagged.

## Historical opportunity outcome coverage

`data/nfl/props/qb-opportunity-outcomes-2022-2025.json`
(`npm run nfl:qb-opportunity-outcomes`): **2,174 team-game rows**, one per
team-game across all four seasons (100% of the 2,174 team-games from
Phase 2's compact play-volume cache have at least one QB with attempts).
**333 rows (15.3%) are `multiQbGame`.** Zero rows have an unresolved
`teamDropbacksContext` join failure to report beyond what Phase 1/2 already
established at 100% resolution.

## Model-development split

Adopted exactly as proposed, frozen before any result was viewed:

- **Train:** 2022-2023 (1,086 rows)
- **Select:** 2024 (544 rows)
- **Holdout:** 2025 (544 rows)

2022 has no prior-season data (no 2021 cache), which is a known,
documented, already-accepted gap from Phase 2 -- it affects Week 1-3 rows
in the train split's earliest season only, not the split's validity.

## Features evaluated

Five leakage-safe groups, all built from data already established in
Phase 1/2 or the new (Phase 3) historical market artifact -- no new PBP
processing required for any of them:

- **teamVolume** (own team): `offensivePlaysPerGame`, `passAttemptsPerGame`,
  `rushAttemptsPerGame` -- Phase 2's `seasonPrior`/`priorSeason` windows,
  coalesced (see below).
- **passTendency** (own team): `overallDropbackRate`,
  `earlyDownNeutralPassRate`, `passRateOverExpected` -- Phase 2, unchanged.
- **opponent** (defensive-allowed context): `offensivePlaysPerGameAllowed`,
  `passAttemptsPerGameAllowed`, `overallDropbackRateAllowed` -- a NEW
  extension of Phase 2's window-selection primitives
  (`selectPriorGamesAsOpponent`), built by reading the SAME compact
  play-volume cache from the opponent side, no new source. Opponent EPA and
  pressure/sack environment were investigated and explicitly NOT included
  this phase (would require joining the separate EPA cache / ESPN trench
  data respectively; deferred as real engineering scope, not included
  merely because they exist -- per the brief's own instruction).
- **market**: `spread` (team-relative), `total`, `impliedTeamTotal`,
  `homeAway` -- a NEW artifact (`data/nfl/props/historical-market-context-
  2022-2025.json`, `npm run nfl:historical-market-context`), built by
  reusing `parseMarketRow` from the already-approved Phase 5 matchup-market
  pipeline verbatim. 100% line coverage across all 2,174 rows.
- **qbRole**: this specific QB's own `attemptsPerGame` (coalesced
  seasonPrior/priorSeason), `gamesStartedPriorThisSeason`,
  `isFirstStartForTeamThisSeason` -- NEW, built from a per-QB chronological
  game log over the QB-opportunity outcomes themselves.

**Coalesce policy** (shared by Baseline B, Baseline C, and the ridge design
matrix): `seasonPrior` if available, else `priorSeason`, else a train-only
column mean. A transparent, single documented rule -- never a fitted or
hand-tuned blend.

## Results (see `data/nfl/props/qb-opportunity-baseline-competition-2022-2025.json` for full detail)

Actual `primaryQbAttempts` distribution: train mean 32.5 (median 32),
select mean 31.7 (median 31), holdout mean 31.2 (median 30.5) -- stable
across seasons, range roughly 7-68.

| Model | Train MAE | Select MAE | Holdout MAE | Holdout RMSE | Holdout bias | Holdout R² |
|---|---|---|---|---|---|---|
| A: league mean | 6.733 | 6.468 | 6.805 | 8.433 | +1.29 | -0.024 |
| B: rolling mean (this QB) | 6.851 | 7.105 | 6.937 | 8.709 | +0.39 | -0.092 |
| C: plays x tendency x share | 7.030 | 7.193 | 7.123 | 8.973 | +0.54 | -0.159 |
| D: ridge (all 16 features, alpha=100) | 6.291 | 6.320 | 6.577 | 8.121 | +1.18 | 0.050 |

**Baselines B and C underperform the naive league mean on both select and
holdout.** This is reported exactly as found, not smoothed over: QB pass
attempts in a single game carry enough game-to-game noise that a QB's own
recent-attempts average is a WORSE predictor than simply guessing the
league average, in this dataset. Baseline C's transparent multiplication
compounds two noisy estimates and does worst of all non-ridge models.

**Ridge (D) is the best model on both select and holdout**, though the
margin over the naive mean is modest (holdout MAE 6.577 vs 6.805, a ~3.3%
improvement; holdout R² 0.050, meaning the model explains about 5% of
variance beyond the mean). Alpha=100 (the largest value in the pre-
registered grid) was selected on select-only MAE -- heavy regularization
is preferred, consistent with individually weak/noisy features.

### Week-band results (ridge, holdout)

| Band | n | MAE | R² |
|---|---|---|---|
| Week 1 | 32 | 6.31 | 0.036 |
| Weeks 2-3 | 64 | 7.01 | -0.051 |
| Weeks 4-8 | 146 | 6.64 | -0.002 |
| Weeks 9+ | 302 | 6.48 | 0.088 |

Weeks 2-3 is the **hardest** band, not Week 1 -- likely because a 1-2-game
current-season window is noisier than either a full prior-season prior
(Week 1) or a matured multi-game window (Weeks 9+).

### Favorite/underdog, home/away, total band (ridge, holdout)

Favorite MAE 6.53 vs underdog 6.62 (small difference; underdog R² notably
higher, 0.109 vs -0.034). Away MAE 6.37 vs home 6.78. Total band MAE is
roughly flat (6.38-6.79 across low/mid/high) -- no strong total-driven
effect on attempts-prediction accuracy was found.

### Stable vs. full-sample (holdout)

| | n | MAE | Bias | R² |
|---|---|---|---|---|
| Full sample | 544 | 6.577 | +1.18 | 0.050 |
| Single-QB games only | 460 | 6.276 | +0.16 | 0.055 |
| Multi-QB games only | 84 | 8.222 | **+6.77** | -0.567 |

Multi-QB games are dramatically harder for every model, with a large
**positive** bias (models systematically over-project the primary QB,
since none of them can see a backup relief coming pregame). This is
expected and confirms the diagnostic split is meaningful, not decorative.

### Feature-group ablation (ridge, alpha=100, refit on train, evaluated on select)

| Excluded group | Select MAE | Delta vs. all-features (6.320) |
|---|---|---|
| none (all features) | 6.320 | -- |
| passTendency | 6.371 | **+0.051 (helps most when included)** |
| opponent | 6.362 | +0.042 (helps) |
| market | 6.318 | -0.002 (~neutral) |
| qbRole | 6.309 | -0.011 (slightly hurts when included) |
| teamVolume | 6.307 | -0.013 (slightly hurts when included) |

Only **passTendency** and **opponent** show a real (if modest) positive
contribution. `market`, `qbRole`, and `teamVolume` are approximately
neutral-to-slightly-negative in this ridge configuration -- not retained
"because they sound football-relevant." This is a genuine, if humbling,
finding: at this target's noise level and with only ~1,086 training rows,
most individual feature groups are not earning their place.

### Early-season prior findings

| | n | MAE |
|---|---|---|
| Week 1, QB has prior-season history | 85 | 6.475 |
| Week 1, QB has no prior-season history (rookie/new starter) | 43 | 6.479 |
| Week 1, league mean only | 128 | **6.273** |
| Weeks 2-3 (rolling mean) | 256 | 8.194 |

**Prior-season QB history did not measurably improve Week 1 accuracy in
this sample** -- the three numbers are within noise of each other, and the
plain league mean was in fact numerically best. This is reported as a
genuine finding, not assumed away: a QB's attempts in his most recent full
season are a weak predictor of a specific new-season Week 1 game (new
scheme, new opponent, small sample). Do not build Phase 4 assuming
prior-season blending is a settled win.

## Recommended production opportunity model

**None yet.** Ridge (D) is the best of the four baselines tested, but its
improvement over the naive mean is modest (holdout MAE 6.577 vs 6.805) and
the ablation shows most feature groups are not clearly earning their
keep with this small a training set. This does not clear a bar for
"production" -- it clears a bar for "best of what was tried, worth
carrying into Phase 4 as the current best available opportunity signal,"
which is different. See "concerns before Phase 4" below.
