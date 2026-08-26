# NFL yardage prop system -- architecture, Phases 1-8

## Purpose

A production-quality projection system for three NFL player-prop yardage
markets, structurally isolated from the fantasy system:

1. Passing yards
2. Rushing yards
3. Receiving yards

Each market is modeled independently (different opportunity and efficiency
drivers), sharing common NFL source data, player identity, and
infrastructure patterns. See `docs/nfl-yardage-props-audit.md` for the full
audit and architecture review this namespace implements.

## Canonical data flow

```
player/opportunity/opponent data -> statistical yard projection   (production goal)
                                  -> 0-100 matchup score           (separate, presentation-only output)
projection - sportsbook line     -> edgeYards                     (future, blocked -- see below)
```

The three outputs are structurally separate types (`NflYardageProjection`,
`NflYardageMatchupScore`, `NflYardagePropEdge` in `types/projection.ts`).
None is derived from another.

## Phase 1 artifacts (this phase)

- `types/identity.ts` -- re-exports player-identity resolution and
  team-code normalization from the canonical shared module
  `src/lib/nfl/identity/identity.ts` (see Phase 2 below for why this is no
  longer a fantasy-namespace dependency).
- `types/playerGameContext.ts` -- `NflPropPlayerGameContext`: per-player-game
  identity and environment (season/week/game/team/opponent/position, market
  context reserved for later).
- `types/yardageOutcomes.ts` -- `NflYardageOutcomes`: the seven observed
  stats this system models (pass attempts, passing yards, carries, rushing
  yards, targets, receptions, receiving yards). Every field is independently
  nullable.
- `types/features.ts` -- empty, versioned per-market feature-category
  schemas (`opportunity`, `playerEfficiency`, `opponentEfficiency`,
  `gameEnvironment`, `availability`). No feature is populated.
- `types/projection.ts` -- the canonical output schemas: projection,
  matchup score, and a wholly separate future prop-edge type.
- `historicalOutcomes.ts` -- row-level normalization: `stats_player_week`
  source row + schedule join -> one canonical `NflYardageOutcomeRow`.
- `historicalOutcomesQa.ts` -- pure integrity/QA summaries (duplicates,
  coverage, team-change counts, schedule-join resolution).
- `scripts/generate-nfl-yardage-outcomes.ts` (repo-root `scripts/`) --
  generator CLI, writes `data/nfl/props/yardage-outcomes-<first>-<last>.json`.
  Run with `npm run nfl:yardage-outcomes`.

## Phase 2 artifacts (shared team play-volume + pass-tendency foundation)

Full audit: `docs/nfl-play-by-play-audit.md`. No player-level model exists
after this phase -- these are team-level pregame features only.

- `identity.ts` extraction note: `types/identity.ts` now imports the
  canonical identity module directly from `src/lib/nfl/identity/identity.ts`
  (not through fantasy). The fantasy module (`src/lib/fantasy/weekly/identity.ts`)
  is now itself a re-export shim over the same canonical module, so fantasy
  behavior is unchanged and both systems share one implementation.
- `scripts/lib/nfl-play-volume-core.mjs` -- play-by-play classification
  (reuses `classifyPlay` from the approved `nfl-epa-core.mjs` verbatim),
  the neutral-situation predicate, and compact team-game aggregation
  (eligible/pass/rush plays, neutral-situation plays, `pass_oe` sum/count).
- `scripts/refresh-nfl-play-volume-source-cache.mjs` -- network refresh,
  mirrors `refresh-nfl-epa-source-cache.mjs` exactly. Streams play-by-play,
  aggregates, discards the raw file. `npm run nfl:play-volume-cache`.
- `data/nfl/nflverse/play-volume-team-game/` -- committed compact cache
  (~36 KB/season), same byte-verified manifest + `.gitattributes` (`-text`)
  pattern as every other nflverse cache directory.
- `types/teamPregameFeatures.ts` -- `NflTeamPregameFeatures`: one team's
  play-volume and pass-tendency features entering one game, as three
  separate raw windows (`seasonPrior`, `last3`, `priorSeason` -- never
  blended).
- `teamPlayVolume.ts` -- leakage-safe window selection and aggregation
  (`buildTeamGameLog`, `selectPriorGamesInSeason`, `selectLastNGames`,
  `selectPriorSeasonGames`, `buildTeamPregameFeatures`). Ordering and cutoffs
  are by kickoff date, never week number, reusing the same `buildGameJoinIndex`
  the Phase 1 outcome pipeline already uses.
- `teamPregameFeaturesQa.ts` -- pure QA summaries (duplicates, coverage by
  week, low-sample flags, distribution stats).
- `scripts/generate-nfl-team-pregame-features.ts` -- generator CLI, writes
  `data/nfl/props/team-pregame-features-<first>-<last>.json`. Run with
  `npm run nfl:team-pregame-features`.

### Play-volume and pass-tendency features

Per team, per window (`seasonPrior` / `last3` / `priorSeason`):
`offensivePlaysPerGame`, `passAttemptsPerGame`, `rushAttemptsPerGame`,
`overallDropbackRate`, `earlyDownNeutralPassRate` (+ its raw play-count
sample), `passRateOverExpected` (+ its raw play-count sample). No `seconds/
play` pace metric exists -- deferred, see "Intentionally not implemented yet".

### Neutral-situation definition

`down IN (1,2) AND wp BETWEEN 0.20 AND 0.80 AND half_seconds_remaining > 120`.
Full justification in `docs/nfl-play-by-play-audit.md`.

### PROE: implemented, not deferred

`passRateOverExpected` is the mean of nflfastR's own play-level `pass_oe`
(verified 99.96-99.98% coverage on eligible plays across all four seasons)
-- genuine PROE, not `team rate - league average`. Provenance and the
averaging-population decision (all eligible plays, not just neutral ones,
because `xpass` already conditions per-play) are documented in the audit
doc. Named `passRateOverExpected` rather than a bare "PROE" field for
clarity about what it measures.

### Early-season handling

No blend formula exists between `seasonPrior`, `last3`, and `priorSeason` --
choosing a blend weight is model-fitting, out of scope for this phase. A
team's Week 1 row has `seasonPrior.gamesIncluded === 0` and
`last3.gamesIncluded === 0` always; `priorSeason` is populated whenever a
cached prior season exists (2023-2025 Week 1; not 2022, since no 2021 cache
exists) and is a full-season aggregate, never itself windowed. Concretely,
for one real team (PHI, 2025): Week 1 has 0 season-to-date games and a
17-game prior-season aggregate (`priorSeasonDropbackRate: 0.502`); Week 2
has exactly the Week 1 game in both `seasonPrior` and `last3`; Week 3 has
exactly Weeks 1-2 in both.

### Leakage contract (Phase 2 addition)

- `seasonPrior` / `last3`: only games for the same team and season with a
  kickoff date strictly before the target game's own kickoff date --
  verified by two adversarial tests in `teamPlayVolume.test.ts` (mutating
  the target game's own plays never changes its feature row; mutating a
  future game's plays never changes an earlier week's feature row).
- `priorSeason`: only the entirely-prior NFL season, which by construction
  ends before the target season begins.
- The compact play-volume cache itself never contains a play from a game
  the target row's own generation could see in advance -- it is built once,
  upfront, from completed historical seasons only.

## Phase 3 (QB passing-opportunity baseline competition)

Full report: `docs/nfl-qb-opportunity-baseline-competition.md`. **No
passing-yard, matchup-score, or efficiency model exists after this phase.**
This phase only established and evaluated four candidate models for one
intermediate quantity: expected QB pass attempts.

- `qbOpportunityOutcomes.ts` -- builds `primaryQbAttempts` (target) and
  `instabilityCategory`/`primaryQbAttemptShare` (diagnostics only, never
  features) per team-game from Phase 1 outcomes + Phase 2 team dropbacks.
- `qbOpportunityFeatures.ts` -- leakage-safe feature row builder: own
  team-volume/pass-tendency (Phase 2, reused), opponent defensive-allowed
  windows (new, mirrors Phase 2's window logic from the opponent side),
  market context (new artifact), QB-role windows (new, per-QB game log).
- `ridge.ts` -- self-contained closed-form ridge regression. Deliberately
  NOT imported from the fantasy pipeline's own ridge implementation
  (`src/lib/fantasy/weekly/projections/model/linear.ts`), keeping this
  namespace's only fantasy dependency the one approved identity boundary.
- `qbOpportunityBaselines.ts` / `qbOpportunityEncoding.ts` /
  `qbOpportunityEvaluation.ts` -- Baselines A/B/C, the ridge design-matrix
  encoder (with the shared coalesce imputation policy and feature-group
  ablation support), and MAE/RMSE/bias/correlation/R²/median-AE metrics.
- `scripts/generate-nfl-qb-opportunity-outcomes.ts` -- writes
  `data/nfl/props/qb-opportunity-outcomes-<seasons>.json`
  (`npm run nfl:qb-opportunity-outcomes`).
- `scripts/generate-nfl-historical-market-context.mjs` -- writes
  `data/nfl/props/historical-market-context-<seasons>.json`
  (`npm run nfl:historical-market-context`), reusing `parseMarketRow` from
  the approved Phase 5 matchup-market pipeline verbatim.
- `scripts/run-nfl-qb-opportunity-baseline-competition.ts` -- fits/evaluates
  all four baselines on the frozen train(2022-2023)/select(2024)/
  holdout(2025) split, runs feature-group ablation, writes
  `data/nfl/props/qb-opportunity-baseline-competition-<seasons>.json`
  (`npm run nfl:qb-opportunity-baseline-competition`).

**Target is `primaryQbAttempts`, not a dropback figure** -- see the report
doc's "Target definition" for why. **Result: none of the four baselines is
recommended for production yet** -- ridge modestly beats the naive league
mean (holdout MAE 6.58 vs 6.81) but the improvement is small and feature
ablation shows most feature groups are not clearly earning their place.
Multi-QB games are far harder for every model (holdout MAE 8.22 vs 6.28,
bias +6.77 attempts) -- a genuine, expected finding, not a defect.

## Phase 4 (QB passing-yard baseline competition)

Full report: `docs/nfl-qb-passing-baseline-competition.md`. **Methodology
change starting this phase: 2025 is no longer a model-development holdout.**
It was inspected during Phase 3, so from Phase 4 onward it is loaded and
reported only as a fixed retrospective benchmark; every feature, model,
hyperparameter, and threshold decision uses rolling-origin temporal folds
confined to 2022-2024 (`temporalValidation.ts`: fold1 train=2022/validate=
2023, fold2 train=2022-2023/validate=2024).

- `qbPassingOutcomes.ts` / `types/qbPassing.ts` -- target
  (`primaryQbPassingYards`) + diagnostics, extending Phase 3's primary-QB
  selection with yards/completions/TD/INT. No row is dropped for multi-QB
  status, injury, benching, or a poor performance.
- `qbPassingEpaContext.ts` -- NEW small, standalone window-selection layer
  over the already-committed `epa-team-game` cache (own + opponent-allowed
  pass EPA/play), deliberately not a generalization of Phase 2's typed
  window functions.
- `qbPassingFeatures.ts` / `types/qbPassingFeatures.ts` -- 5 ablatable
  feature groups (opportunity, qbEfficiency, opponentPassDefense,
  proePassTendency, market) plus QB efficiency (YPA, completion%) built
  from a new per-QB stat game log.
- `qbPassingEncoding.ts` -- flat encoder with a `allowPriorSeasonFallback`
  toggle (used for the prior-season-information ablation) and
  decomposition-leg appending (Baseline E).
- `qbPassingBaselines.ts` -- Baselines A/B/C, plus `shrinkTowardLeagueMean`
  (a fixed, pre-registered games-count shrinkage constant, never tuned
  against any holdout) for the YPA sub-estimator.
- `temporalValidation.ts` -- the fold definitions and split helper shared
  by every model/hyperparameter selection decision in this phase.
- `scripts/generate-nfl-qb-passing-outcomes.ts` -- writes
  `data/nfl/props/qb-passing-outcomes-<seasons>.json`
  (`npm run nfl:qb-passing-outcomes`).
- `scripts/run-nfl-qb-passing-baseline-competition.ts` -- fits/evaluates
  Baselines A-E across both dev folds, refits on 2022-2024 and evaluates
  once on the 2025 frozen benchmark, runs feature-group and prior-season-
  information ablations (dev folds only), multi-QB analysis, a pregame
  instability-signal correlation, and residual/uncertainty groundwork.
  Writes `data/nfl/props/qb-passing-baseline-competition-<seasons>.json`
  (`npm run nfl:qb-passing-baseline-competition`).

**Result: direct ridge (D) and hybrid ridge (E) are statistically
indistinguishable from each other and both clearly beat the decomposition
(C) and naive baselines (A/B) on both dev folds and the 2025 benchmark.**
Forcing `projectedAttempts x projectedYPA` did NOT improve on predicting
yards directly. Multi-QB games remain far harder for every model (2025
benchmark MAE 71.5 vs 53.0 for single-QB games); a team's recent multi-QB
history was found to carry essentially no predictive signal for this
week's multi-QB risk (point-biserial correlation 0.04) -- documented as
irreducible pregame uncertainty, not solved.

## Phase 5 (rushing-yard baseline competition)

Full report: `docs/nfl-rushing-baseline-competition.md`. Includes a brief
Phase 4 passing-bias diagnostic (2025's lower actual passing yards traced
to a modest attempts decline, not YPA/QB-population/data defect; Phase 4's
winner unchanged).

- `rushingOutcomes.ts` / `types/rushingOutcome.ts` -- target
  (`rushingYards`) for QB/RB/WR/TE player-games with carries > 0, plus
  pregame eligibility computed from strictly-prior usage only. Kneels
  included per official convention. Documented scope limitation: only
  weeks where the player actually recorded a carry are represented (see
  README below and the report doc "Known scope limitation").
- `rushingFeatures.ts` / `types/rushingFeatures.ts` -- 5 ablatable groups
  (playerUsage, playerEfficiency, teamEnvironment, opponentRushDefense,
  market) plus a position indicator; a new committee-concentration
  diagnostic (leading-RB carry share, team-level, strictly pregame).
- `rushingEncoding.ts` / `rushingBaselines.ts` -- mirror the Phase 4
  passing pattern; `qbPassingEpaContext.ts` is reused directly (not
  duplicated) for opponent rush-EPA-allowed by mapping `rush_epa`/
  `rush_plays` into its generic fields.
- `scripts/generate-nfl-rushing-outcomes.ts` /
  `scripts/run-nfl-rushing-baseline-competition.ts` -- same temporal-fold
  discipline as Phase 4 (`npm run nfl:rushing-outcomes`,
  `npm run nfl:rushing-baseline-competition`), plus a pooled-vs-QB/non-QB
  segmentation comparison, a market-subgroup audit, and committee-role
  breakdowns.

**Result: decomposition (attempts x YPC) wins for rushing on MAE/median-AE
across dev folds and the 2025 benchmark -- the opposite ranking from
Phase 4's passing result.** Per the explicit instruction not to force one
architecture across markets, this is reported as found, not reconciled
with Phase 4. Player usage (this player's own rolling carries/share)
dominates the ablation (+6.11 MAE if removed, dwarfing every other group);
market context -- the #1 driver for passing -- contributes essentially
nothing to rushing (~0.00 MAE change removing spread, total, or implied
total individually). Pooled vs. QB/non-QB segmentation showed no
meaningful difference. A real, usable committee-instability signal was
found (recent team carry-share concentration correlates with prediction
difficulty), unlike Phase 4's null result for QB-instability signal.

## Phase 5.5 (canonical player-game universe + rushing rerun)

Full reports: `docs/nfl-player-game-universe.md`,
`docs/nfl-rushing-baseline-competition-v2.md`. Corrects the Phase 5 gap
where the rushing outcome population only ever contained `carries > 0`
rows -- a legitimately eligible player's true zero-carry game was
invisible to modeling.

- `playerGameUniverse.ts` / `types/playerGameUniverse.ts` -- canonical
  `(season, week, gameId, playerId)` universe with two membership tiers
  (`statsTable`, `activeRosterConfirmed`) and three independent
  market-specific eligibility flags (`rushingEligiblePregame`,
  `receivingEligiblePregame`, `passingEligiblePregame`).
- `scripts/generate-nfl-player-game-universe.ts` -- writes
  `data/nfl/props/player-game-universe-2022-2025.json`
  (`npm run nfl:player-game-universe`). 28,327 rows.
- `rushingOutcomes.ts`'s new `buildRushingOutcomesFromUniverse` +
  `scripts/generate-nfl-rushing-outcomes-v2.ts` /
  `scripts/run-nfl-rushing-baseline-competition-v2.ts` -- corrected
  rushing outcome/competition rerun, preserving Phase 5's methodology
  exactly (`npm run nfl:rushing-outcomes-v2`,
  `npm run nfl:rushing-baseline-competition-v2`).

**Result: decomposition (C) remains the rushing winner under the
corrected population (13,138 rows, +5,171 true zero-carry games vs.
Phase 5's 7,967) -- the Phase 5 conclusion did not change, but it was
genuinely re-tested, not assumed.** Every model's absolute MAE dropped
substantially (driven by the added easy zero-carry rows now being 43% of
the 2025 sample), but the *ranking* between models held. Pooled-vs-
segmented also held (pooled still fine). Eligibility threshold sensitivity
checked and found robust (±2-3% population size across a 4x threshold
range). Receiving eligibility groundwork built (population sizes reported)
but no receiving model -- that stays blocked for Phase 6.

## Phase 6 (receiving-yard baseline competition)

Full report: `docs/nfl-receiving-baseline-competition.md`. Built on the
Phase 5.5 canonical universe's `receivingEligiblePregame` rows. QB
excluded (1.7% target rate, not a real role). 20,131 rows, 4,326 (21.5%)
zero-target (2,468 stats-table, 1,858 ACT-inferred; ACT-inferred zeros
predict somewhat worse but still far better than the non-zero population
-- inference judged reasonably reliable, not revised).

- `receivingOutcomes.ts` / `types/receivingOutcome.ts`,
  `receivingFeatures.ts` / `types/receivingFeatures.ts`,
  `receivingEncoding.ts`, `receivingBaselines.ts` -- mirror the
  rushing/passing pattern (7 ablatable feature groups: playerUsage,
  playerEfficiency, airYards, teamEnvironment, targetConcentration,
  opponentPassDefense, market). Air yards (`receiving_air_yards`) verified
  100% covered among targeted players across all 4 seasons and made
  load-bearing (aDOT); `airYardsShare` deferred, always null.
- `scripts/generate-nfl-receiving-outcomes.ts` /
  `scripts/run-nfl-receiving-baseline-competition.ts`
  (`npm run nfl:receiving-outcomes`,
  `npm run nfl:receiving-baseline-competition`) -- same temporal-fold
  discipline as Phase 4/5, plus a separate targets-only opportunity
  sub-competition and a pooled-vs-position-specific (WR/TE/RB) comparison.

**Result: decomposition wins again (targets x shrunk yards-per-target,
Baseline C) -- but the SIMPLER 2-way split beats the more granular 3-way
split (targets x catch-rate x YPR), a genuine "more decomposition ≠
better" finding.** Player usage dominates the ablation exactly as it did
for rushing (+5.49 MAE if removed, dwarfing every other group); market
again contributes essentially nothing (matching rushing, not passing --
now 2 of 3 markets don't need it). Unlike passing and rushing, **position
segmentation modestly helps here** (pooled 17.06 vs. segmented 16.88) --
the one architecture question where receiving's answer differs from the
other two markets.

## Phase 7 (cross-market projection review)

Full report: `docs/nfl-cross-market-projection-review.md`. The approved
research architectures remain passing direct ridge, rushing projected
carries x shrunk YPC, and receiving projected targets x shrunk YPT. Phase 7
added the canonical cross-market projection-output contract, empirical
prediction-interval groundwork, calibration review, hard-case analysis, and
readiness gates. None of the models was promoted to production-ready.

## Phase 8 (Matchup Score research + implementation)

Full report: `docs/nfl-matchup-score-research.md`. Matchup Scores are
presentation-only 0-100 assessments of opportunity and football environment;
they are not projections, sportsbook edges, confidence scores, or uncertainty.

- `matchupScore.ts` -- deterministic empirical-percentile normalization,
  dimension scoring, transparent constrained-weight enumeration, and
  correlation helpers. References are built from development-only pregame
  features; missing history maps to neutral 50.
- `types/matchupScore.ts` -- canonical discriminated score schema with
  `matchupScore`, `opportunityScore`, `environmentScore`, market-specific
  component detail, score/reference versions, and no sportsbook fields.
- `scripts/run-nfl-matchup-score-research.ts` -- candidate competition on the
  two rolling 2022-2024 folds and fixed-reference retrospective reporting for
  2025. Writes `data/nfl/props/matchup-score-research.json`.

Selected score architectures (projection winners are unchanged):

- Passing P3: 20% opportunity, 30% opponent, 40% passing quality, 10% game
  environment.
- Rushing R3: 50% workload (capped), 10% role quality, 20% team rushing
  environment, 20% opponent.
- Receiving C3 position-normalized: 50% opportunity (capped), 10% role
  stability, 10% opponent, 30% efficiency profile. Indicator percentiles are
  position-relative so the presentation scale has comparable meaning for
  RB/WR/TE.

All weights were selected from a non-negative 0.1-step development grid;
2025 never participates in reference construction, candidate selection, or
weight selection. Matchup Score correlations with projected yards on the
frozen retrospective are 0.58 passing / 0.81 rushing / 0.59 receiving, so no
market is a disguised rescaling of projected yards. All three projection
models remain research baselines.

## Data coverage found (Phase 1 audit)

The committed `data/nfl/nflverse/stats-player-week/` cache (a projected
subset of the upstream nflverse `player_stats` weekly release) covers
**2022-2025**, and for every one of those seasons:

- Positions present: **QB, RB, WR, TE only**.
- `season_type`: **`REG` only** -- no postseason rows exist in this cache.
- Week range: **1-18** for every season.
- Zero blank cells across all four seasons in the seven outcome fields this
  system reads (`attempts`, `passing_yards`, `carries`, `rushing_yards`,
  `targets`, `receptions`, `receiving_yards`). Null-preserving parsing is
  still implemented (never assumed away), because the schema must not
  silently start coercing blanks to zero if a future season's cache ever has
  one.
- No duplicate `player_id + week` rows, no blank `player_id`, no blank
  `recent_team`, in any of the four seasons.
- 32 distinct team codes per season, matching `normalizeNflPropTeamAbbr`'s
  alias table (JAC/JAX, LA/LAR, WAS/WSH, ARI/AZ).

`public/data/nfl/<season>/games.json` (already committed, generated by the
existing schedules pipeline) exists for 2022-2025 and supplies the
`gameId` / `homeAway` / `gameDateUtc` schedule join, keyed by
`season|week|team`.

## Leakage contract

For a row describing player *P* in season *S*, week *W*:

- Every outcome field (`NflYardageOutcomes`) is *P*'s own observed stat from
  that exact game. No other week's stats ever enter the row.
- The schedule join (`gameId`, `homeAway`, `gameDateUtc`) is looked up by
  `(S, W, team)` only -- verified by test (`historicalOutcomes.test.ts`,
  "never lets one week's game satisfy a different week's lookup").
- `team` / `opponent` come from the source row's own `recent_team` /
  `opponent_team` columns for that week, not from any later-week roster
  assignment.
- No rolling, season-to-date, or opponent-strength feature exists anywhere
  in this artifact -- that is out of scope for Phase 1 by design. When
  Phase 2+ introduces such features, every one of them must be computed
  using only games strictly before week *W* (the same N-1-only discipline
  already established and tested in `src/lib/fantasy/weekly/backtest/`).
- No injury, snap, or market snapshot from any week is read by this phase.
- An unresolved team/opponent code is a hard failure (`throw`), never a
  guess -- consistent with the repository-wide NFL ingest mandate.

## Intentionally not implemented yet

This phase produces **ground-truth historical outcomes only**. Explicitly
out of scope, and asserted empty/null by test (`schemaInvariants.test.ts`)
where the schema allows it:

- No passing/rushing/receiving model has been fit. `projectedYards` does
  not exist anywhere as a computed value.
- No matchup score (0-100) is computed anywhere.
- No feature category (`opportunity`, `playerEfficiency`,
  `opponentEfficiency`, `gameEnvironment`, `availability`) is populated.
- No sportsbook player-prop data is integrated. `NflYardagePropEdge` is a
  schema only; nothing in this codebase constructs one. Per the architecture
  review, Phase 7 (prop-line integration) stays explicitly blocked until a
  compliant, free-first-mandate-respecting line source is identified and
  separately approved.
- `spread`, `total`, and `impliedTeamTotal` on `NflPropPlayerGameContext`
  are always `null` in this phase's artifact: no offline, per-game
  historical market cache (spread/total keyed by `gameId`) exists anywhere
  in this repository today. `matchup-market.json` publishes team-level
  ATS/O-U summaries and the *current* matchup's line, not an archived
  per-historical-game table, so it cannot backfill this field without a new
  network-fetch pipeline -- deliberately not built in this phase to avoid
  scope creep beyond what was requested.
- `availabilityStatus` is always `null`: no historical per-week injury/
  availability join exists in this namespace yet (the existing
  `matchup-injuries.json` artifact is a current-week snapshot, not a
  historical archive).
- Red-zone/goal-line usage and route participation remain unavailable
  repository-wide (see `docs/nfl-yardage-props-audit.md` §2); not pulled
  forward into Phase 1 per the architecture review.
- Fantasy UI, fantasy pages, and the fantasy fitted projection model are
  untouched and unused. This namespace imports only generic identity
  infrastructure from `src/lib/nfl/identity/identity.ts` (see
  `types/identity.ts`), nothing else.

Phase 2 additions, also intentionally deferred:

- `seconds/play` pace is not implemented. Reconstructing clock-stoppage-
  adjusted time per play from play-by-play requires classifying timeouts,
  injuries, replay reviews and the two-minute warning, none of which is a
  simple field read -- deferred rather than shipped unreliable.
- No blend weight exists between `seasonPrior`, `last3`, and `priorSeason`
  -- that is model-fitting, explicitly out of scope for Phase 2.
- The neutral-situation definition is not conditioned on distance
  (`ydstogo`); considered and deferred, see the audit doc.
- No player-level opportunity or efficiency feature exists yet -- Phase 2
  is team-level only.
- Weather (`temp`/`wind`) was not audited beyond confirming the columns
  exist.

## Phase 9 (current-week production-candidate pipeline)

Takes the approved historical research stack (Phases 1-8) and generates a
deterministic, leakage-safe current-week projection artifact for a live
`(season, week)` -- e.g. 2026 Week 1, which has a full schedule but zero
played games. Full input-readiness audit, decisions, and results are in the
Phase 9 handoff report (chat history); this section documents the durable
architecture.

- `currentWeekRosterUniverse.ts` -- live candidate pool. Unlike
  `playerGameUniverse.ts` (built FROM already-played `stats_player_week`
  rows), a future week has no outcome rows yet, so membership comes
  entirely from the `weekly_rosters` "ACT" snapshot for the target week,
  joined to that week's schedule. Eligibility reuses
  `isMarketPregameEligible` verbatim against an activity log built from the
  existing 2022-2025 canonical universe -- no new eligibility rule.
- `qbStarterResolution.ts` -- resolves one passing-projection candidate per
  team from the roster pool. No depth-chart-order, beat-writer, or
  injury-report starter designation exists anywhere in this repository's
  committed data (`weekly_rosters`' `depth_chart_position` was confirmed,
  by direct inspection, to equal the player's position group, not an
  ordinal depth -- e.g. three ACT QBs on one roster can all read
  `depth_chart_position: "QB"`). The heuristic: the ACT QB with the highest
  rolling attempts (seasonPrior -> priorSeason coalesce) is the candidate;
  ties/no-history rosters and multi-QB competition are flagged
  (`starterUncertain`/`multiQbRoleUncertain`), never silently resolved.
- `buildQbPassingFeatureRowForTarget` / `buildRushingFeatureRowForTarget` /
  `buildReceivingFeatureRowForTarget` (added to the existing Phase 4/5/6
  feature-builder files) -- live variants of the historical builders, driven
  by an explicit identity descriptor instead of an outcome row. Every
  private rolling-window helper is reused verbatim; only the outcome-derived
  fields (target yards, `instabilityCategory`, `primaryQbAttemptShare`,
  zero-target flag) are omitted, since they describe what already happened
  in a game that has not been played.
- `matchupScoreDimensions.ts` -- the Phase 8 research script's dimension/
  indicator definitions, extracted verbatim into a shared module so the
  frozen research design and this production scorer can never drift apart.
- `currentWeekMatchupScore.ts` -- builds the Matchup Score reference from
  the same frozen `FINAL_TRAIN_SEASONS` (2022-2024) rows every Phase 8
  consumer uses (2025 and the live week never enter a reference), and
  scores a live row using the already-selected weights read from the
  committed `matchup-score-research.json` (`selectedDefinition`) -- no
  weight, dimension, or normalization decision is re-derived.
- `currentWeekYardageModel.ts` -- model-fit strategy: this repository has no
  serialized coefficient artifact for any market (every prior phase refits
  its closed-form ridge/shrinkage model from raw rows at run time; Phase 9
  keeps that pattern). `PRODUCTION_TRAIN_SEASONS = [2022, 2023, 2024, 2025]`
  -- architecture/hyperparameter selection stays frozen from Phase 4/5.5/6
  (never re-derived from 2025), but the final coefficient fit for a 2026
  production candidate legitimately includes 2025, since 2025 was already a
  fixed, inspected retrospective benchmark, not a newly-mined holdout.
  Prediction intervals reuse the exact Phase 7 fold2 methodology (train
  2022-2023, validate 2024) so the already-reported 87-89% realized 2025
  coverage stays the number this interval traces back to.
- `currentWeekGenerator.ts` -- orchestrator. Takes a fully-parsed
  `NflCurrentWeekSources` bundle (no disk I/O in this module, so it stays
  unit-testable) and returns `NflCurrentWeekYardageProjectionArtifact`
  (`types/currentWeekProjection.ts`). Contains a hard leakage guard: every
  historical training/reference/interval row matching the exact target
  `(season, week)` is stripped before any model fit or reference build,
  regardless of `generationMode` -- a no-op for a genuine future week (that
  data cannot exist yet) and the load-bearing guard for
  `generationMode: "historicalReplay"`, where the replay season is
  otherwise a legitimate member of `PRODUCTION_TRAIN_SEASONS`.
- `scripts/generate-nfl-current-week-yardage-projections.ts` -- CLI
  (`npx tsx scripts/generate-nfl-current-week-yardage-projections.ts
  --season=2026 --week=1 [--dry-run]`). Reuses every committed Phase 1-8
  historical artifact for training/reference (never regenerates them), and
  reads the live `weekly_rosters` snapshot plus the live
  `public/data/nfl/matchup-market.json` `currentMarket` feed (confirmed to
  already publish real 2026 spread/total/moneyline per game) for the target
  week's own candidate pool and market context. Fails closed (throws) if the
  target season's schedule or `weekly_rosters` cache is missing. Writes to
  `public/data/nfl/<season>/yardage-projections.json`.

### Temporal contract

Weekly-snapshot contract: every input (schedule, rosters, market context,
historical usage) is treated as frozen strictly before the target week's
first kickoff; no target-week outcome, snap, or later injury information
enters any row for that week. Chosen over a game-by-game kickoff contract
for simplicity and reproducibility -- the phase brief explicitly allows
this. Enforced structurally (the roster/eligibility/feature pipeline never
reads a target-week outcome at all -- there is nothing to leak) plus the
explicit target-week strip in `currentWeekGenerator.ts` described above,
which is the only thing that makes `generationMode: "historicalReplay"`
leakage-safe.

### Known 2026 data gaps (as of this phase)

- **Injury/availability**: `public/data/nfl/matchup-injuries.json` is a
  single live snapshot with no per-week archive (its own `_meta` showed a
  stale 2025 Week 12 snapshot as of this phase, not yet refreshed for
  2026), so `availabilityStatus` stays `null` in this artifact too, exactly
  as it has since Phase 1 -- not a new gap, just not yet closed.
- No depth-chart-order/starter source exists (see `qbStarterResolution.ts`
  above) -- passing-starter resolution is a documented heuristic, not a
  certainty.

## Phase 9.1 (eligibility closure -- separating role evidence from historical volume)

Phase 9's first cut gated every market's live candidacy on the Phase 5.5
historical-volume threshold alone, which silently omitted legitimate
rookies/new starters (31/32 passing teams, a real starter missing entirely
in the 2026 Week 1 dry run). Phase 9.1 separates **pregame eligibility /
roster-role evidence** from **availability of historical performance data**:

- **Passing**: candidacy no longer depends on `passingEligiblePregame`.
  Every team with at least one ACT QB gets exactly one row (the
  `qbStarterResolution.ts` heuristic's pick), regardless of that QB's own
  history. A true no-history starter still gets a real projection (via the
  ridge model's own train-mean feature imputation), flagged
  `historyStatus: "noHistory"` / `status: "eligibleInsufficientHistory"` /
  `hardCaseFlags.roleUncertain: true` -- never silently omitted, never
  fabricated. Result on the real 2026 Week 1 artifact: 32/32 teams covered
  (was 31/32).
- **Rushing/receiving**: `currentWeekRosterUniverse.ts`'s
  `applyRoleScarcityFallback` adds a strictly ADDITIVE, per-team,
  per-position floor (`RB_ELIGIBLE_FLOOR = 2`, `RECEIVER_ELIGIBLE_FLOOR = 3`
  combined WR+TE) on top of the untouched Phase 5.5 historical rule: if a
  team has fewer than the floor's worth of historically-eligible players at
  a position, additional ACT candidates are admitted up to the floor,
  flagged `hardCaseFlags.roleUncertain: true` /
  `fallbackProvenance: "rosterScarcityFloor"`. This deliberately does NOT
  admit every ACT player -- the live `weekly_rosters` snapshot observed
  this phase carries ~90 ACT players per team (a pre-cutdown camp roster,
  not a final 53; verified via total ACT-player counts per team), so
  unconditional inclusion would flood the artifact with players who will
  never make the eventual roster. Because no depth-chart-order or
  snap-share source exists anywhere in this repository, WHICH specific
  no-history player fills the floor is a deterministic (`playerId`-sorted)
  tie-break, not a depth-chart-informed pick -- disclosed via
  `roleUncertain`, never presented as a confident individual selection.
  **Known limitation**: on the real 2026 Week 1 data, this floor rarely
  triggers (every team already retains at least 2 historically-productive
  RBs and 3 historically-productive WR/TE), so it does not yet solve the
  harder case of "a true rookie who has clearly won a starting job the
  roster snapshot cannot reveal" (e.g. a rookie RB1 on a team that also
  retains veteran committee backs) -- that requires a depth-chart/snap-share
  data source this repository does not have, and remains open for a future
  phase.
- Every row now carries `fallbackProvenance`
  (`"historicalVolume" | "rosterScarcityFloor" | "starterHeuristic"`) so a
  consumer can always see why a row exists.
- The browser-facing artifact (`public/data/nfl/<season>/yardage-projections.json`)
  is now written as compact (non-pretty-printed) JSON -- schema content is
  unchanged, only whitespace was removed.
