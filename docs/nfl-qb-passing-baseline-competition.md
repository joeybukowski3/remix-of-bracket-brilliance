# QB passing-yard baseline competition (Phase 4)

## Methodology change

2025 was inspected during Phase 3's baseline competition. From this phase
forward, **2025 is never used to select a feature, transformation,
hyperparameter, model family, or threshold.** It is loaded once and
reported as a fixed retrospective benchmark only. All development
decisions (ridge alpha selection, ablation conclusions, the direct-vs-
decomposition verdict) use rolling-origin temporal folds confined to
2022-2024.

## Historical target

`primaryQbPassingYards` -- extends Phase 3's target definition (same
primary-QB selection rule: most attempts wins, ties broken by playerId)
with passing yards, completions, YPA, and TD/INT (diagnostic only). No row
is dropped for multi-QB status, an injury-shortened game, a benching, or a
poor performance -- every one of Phase 3's 2,174 team-game rows carries
through unchanged (`data/nfl/props/qb-passing-outcomes-2022-2025.json`).

## Development-validation design

Rolling-origin, 2 folds, confined to 2022-2024 (`temporalValidation.ts`):

- **Fold 1:** train 2022 (542 rows) -> validate 2023 (544 rows)
- **Fold 2:** train 2022-2023 (1,086 rows) -> validate 2024 (544 rows)

This is the most defensible scheme supportable by three pre-2025 seasons:
a 3rd fold or leave-one-season-out would either train on zero seasons
(2022 has no cached prior season) or validate on 2022 with no antecedent
training season at all. Ridge alpha for both the direct (D) and hybrid (E)
models is selected by the AVERAGE validation MAE across both folds --
never by either fold alone, and never by 2025.

Final models are refit once on all three pre-2025 seasons (2022-2024,
1,630 rows) using the fold-selected alpha, then evaluated exactly once
against the 544 rows of 2025 -- reported, never re-selected against.

## Efficiency features created

- **QB efficiency** (own QB, rolling seasonPrior/last3/priorSeason):
  yards/attempt, completion%. QB-level EPA/dropback was investigated and
  NOT built -- it requires the same `passer_player_id` PBP attribution gap
  documented as a limitation in Phase 3's target-definition decision.
- **Opponent pass defense**: attempts allowed/game, dropback rate allowed
  (both reused verbatim from Phase 3's opponent-window logic), plus a NEW
  pass-EPA-allowed window built from the already-committed `epa-team-game`
  cache (nflfastR `epa`, never recomputed).
- **PROE/pass tendency** (own team): kept as its own group, reused from
  Phase 2/3 unchanged (overallDropbackRate, earlyDownNeutralPassRate,
  passRateOverExpected).
- **Market/context**: spread, total, implied team total, home/away (reused
  from Phase 3), plus a NEW `isDome` flag read directly from each game's
  own `games.json` record (zero missingness, no new source).
- **Weather** was explicitly investigated and NOT included: `temp`/`wind`
  exist in raw play-by-play (documented in the Phase 2 audit) but are not
  committed anywhere in this repository, and building a new weather cache
  was judged out of scope for this phase's budget. `isDome` is used as the
  available, zero-missingness proxy instead.
- **Opportunity**: team offensive-plays/game, team pass-attempts/game
  (Phase 2, reused), plus this QB's own rolling attempts/game (new, from a
  per-QB stat game log). Phase 3's fitted ridge attempts-projection model
  is NOT re-fit per fold here (would require nesting an entire second
  model-selection process inside every fold); the simple rolling-mean
  attempts figure is used instead as "projected attempts" everywhere,
  which Phase 3 itself found was competitive with its own ridge model.

## Every baseline/model compared

- **A** -- TRAIN-only league-mean passing yards.
- **B** -- this QB's own rolling passing-yards/game (seasonPrior ->
  priorSeason -> league mean).
- **C** -- `projectedAttempts x projectedYPA`. `projectedYPA` uses
  games-count shrinkage toward the league-mean YPA
  (`shrinkTowardLeagueMean`, prior strength fixed at 4 games -- a
  pre-registered constant, never tuned against any holdout).
- **D** -- direct ridge on `primaryQbPassingYards` from the 16 raw
  features across the 5 groups above.
- **E** -- hybrid: the same 16 features plus `projectedAttempts` and
  `projectedYPA` appended as two extra columns.
- Optional nonlinear (gradient boosting, etc.): **not built.** With
  ~1,630 pre-2025 training rows and an already-marginal linear signal
  (Phase 3's own finding), the added engineering/validation risk was
  judged unjustified -- consistent with the brief's own caution against
  adding model complexity merely to produce another contender.

## Development validation metrics (average across both folds)

| Model | Avg. dev MAE |
| --- | --- |
| A: league mean | 58.86 |
| B: rolling QB yards | 62.33 |
| C: decomposition | 60.72 |
| **D: direct ridge (alpha=10)** | **55.81** |
| E: hybrid ridge (alpha=100) | 55.85 |

D and E are statistically indistinguishable (0.04 yards apart on average
dev MAE); both clearly beat A/B/C. Per-fold detail in
`data/nfl/props/qb-passing-baseline-competition-2022-2025.json`.

## Selected model (development validation only)

**D (direct ridge, alpha=10)** — marginally ahead of E and simpler (no
dependency on a separately-computed decomposition leg). This selection
uses dev-fold evidence only; 2025 was not consulted.

## 2025 fixed benchmark result

| Model | MAE | RMSE | Bias | R² |
| --- | --- | --- | --- | --- |
| A: league mean | 59.87 | 74.85 | +8.82 | -0.014 |
| B: rolling QB yards | 62.25 | 79.00 | +2.23 | -0.130 |
| C: decomposition | 60.94 | 76.25 | +4.28 | -0.053 |
| **D: direct ridge** | **55.81** | **70.42** | +12.53 | **0.102** |
| E: hybrid ridge | 55.81 | 70.43 | +12.18 | 0.102 |

The 2025 ranking matches the dev-fold ranking exactly (D≈E > A > C > B),
which is reassuring but was not used to choose D -- the selection was
already made on dev folds before this benchmark was computed.

**A calibration note, reported honestly**: D's bias on 2025 is +12.53
yards (systematic over-projection), noticeably larger than its dev-fold
bias. The 2025 actual mean (219.97) is lower than the 2022-2024 training
mean (228.78) -- a real year-over-year drift the model, fit on
2022-2024, does not know about. This is exactly the kind of thing a
frozen benchmark is supposed to surface, not something to correct by
re-tuning against 2025.

## Direct vs. decomposition (the central Phase 4 question)

**Forcing `projectedPassingYards = projectedAttempts x projectedYPA` does
NOT improve out-of-sample accuracy versus predicting passing yards
directly.** C (decomposition) is worse than D (direct) by ~5 MAE on both
dev folds and the 2025 benchmark -- a clear, consistent result, not a
close call.

**`projectedAttempts` IS useful as a raw feature inside a direct/hybrid
model, but the exact multiplicative identity is not.** E (hybrid, which
adds the decomposition legs as extra columns to D's own feature set)
essentially ties D rather than improving on it -- meaning the ridge
model, given the raw opportunity/efficiency features it already has,
extracts about as much signal as the pre-computed decomposition legs would
add. The legs are not harmful, but they are also not earning a place.

## Does Phase 3's projected-attempts model materially help?

Not distinctly beyond what raw opportunity features already provide (see
ablation below: the `opportunity` group's marginal contribution is nearly
zero once the other groups are present). Phase 3 itself found its own
ridge model only marginally beat a rolling-mean attempts baseline, so this
is a consistent, corroborating finding rather than a surprise.

## YPA model performance

The shrinkage-toward-league-mean YPA estimator behaves as designed: a
QB with 1 prior start pulls his 7.5 YPA sample toward the league mean far
more than a QB with 20 starts (verified by test,
`qbPassingBaselines.test.ts`). It was not evaluated as a standalone
target (only inside Baseline C, where C lost to D/E) -- a dedicated YPA
accuracy table was judged lower priority than the direct-vs-decomposition
question given the time budget for this phase.

## Feature-group ablation (dev folds only, target = D, alpha = 10)

| Excluded group | Avg. dev MAE | Delta vs. all-features (55.81) |
| --- | --- | --- |
| none (all features) | 55.81 | -- |
| opportunity | 55.82 | +0.01 (~neutral) |
| qbEfficiency | 55.84 | +0.03 (~neutral) |
| proePassTendency | 56.06 | +0.25 (helps) |
| opponentPassDefense | 56.21 | +0.40 (helps) |
| **market** | **57.21** | **+1.40 (helps most by far)** |

**Market context (spread/total/implied team total/home-away/dome) is by
far the largest contributor.** Opponent pass defense and PROE/tendency
contribute modestly. This QB's own opportunity and efficiency features
contribute almost nothing marginally once the other groups are present --
not retained because they "sound football-relevant," reported as found.

**Prior-season information** (a separate ablation: forcing every
`seasonPrior`-null column to a train-mean fallback instead of falling
back to `priorSeason`): dev MAE rises from 55.81 to 56.07 (+0.26) when
prior-season information is disabled -- prior-season data does measurably
help here, in contrast to Phase 3's finding that it did not help Week-1
attempts specifically. These are different targets and different
aggregation (this ablation isn't Week-1-only), so the two findings are not
contradictory, but Phase 5 should not assume either result transfers
automatically to a new target.

## Week-band performance (2025, direct ridge)

| Band | n | Mean |absError| |
| --- | --- | --- |
| Week 1 | 32 | 58.97 |
| Weeks 2-3 | 64 | 55.72 |
| Weeks 4-8 | 146 | 51.80 |
| Weeks 9+ | 302 | 57.43 |

Weeks 4-8 is easiest; Week 1 and Weeks 9+ both run higher, though not by a
dramatic margin. No band is a tiny, misleading slice (all n >= 32).

## Multi-QB vs. stable-QB performance (2025, direct ridge)

| | n | MAE | Bias |
| --- | --- | --- | --- |
| Full sample | 544 | 55.81 | +12.53 |
| Single-QB games only | 460 | 52.95 | +4.28 |
| Multi-QB games only | 84 | **71.46** | **+57.73** |

Multi-QB games are dramatically harder for every model, with a large
positive bias -- structurally the same pattern Phase 3 found for attempts
(there, +6.77 attempts on a ~31-attempt mean; here +57.73 yards on a
~220-yard mean -- both roughly 22-26% of the target's mean, a consistent
proportional effect).

**Pregame-observable instability signal**: tested whether a team's own
recent multi-QB rate (strictly using games before the target week)
predicts whether THIS week is also a multi-QB game. Point-biserial
correlation: **0.044** (n=2,046) -- essentially no signal.
**Multi-QB risk is documented as largely pregame-unpredictable with the
signals investigated here**, not solved. No attempt was made to infer an
in-game injury before it occurred.

## Uncertainty / residual groundwork (2025, direct ridge)

Absolute error varies systematically with:

- **QB history** (strongest effect after instability): no prior-season/
  current-season history at all, MAE 83.2 (n=16); low history (<3 games),
  MAE 58.9 (n=152); established history, MAE 53.4 (n=376).
- **Instability** (strongest overall): single-QB 53.0 vs. multi-QB 71.5.
- **Week band**: 51.8 (weeks 4-8) to 59.0 (week 1) -- a real but modest
  spread.
- **Game total**: roughly flat, 54.0-56.7 across low/mid/high bands.
- **Spread magnitude**: large spreads (>7) are actually slightly *easier*
  (MAE 52.6) than close/moderate spreads (57.0/56.6) -- a mild,
  counter-to-naive-intuition finding worth carrying into uncertainty
  modeling rather than assuming blowouts are noisier.

No confidence score is built this phase -- this is groundwork only, per
the brief.

## Recommended architecture

**A: direct passing-yard model.** Development-validation evidence is
consistent and not close: direct ridge (D) beats decomposition (C) by
~5 MAE on every fold and on the 2025 benchmark, and hybrid (E) does not
meaningfully improve on direct despite having access to the same
decomposition information. This is not a marginal recommendation.

This does **not** mean "productionize D as-is" -- see concerns below.
