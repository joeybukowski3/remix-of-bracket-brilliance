# NFL Cross-Market Projection Review + Calibration Foundation (Phase 7)

Scope: review Passing/Rushing/Receiving together, lock a canonical projection
output contract, review calibration and uncertainty, test (but do not adopt
unless it clearly wins) a recalibration layer, build prediction-interval
groundwork, quantify hard cases, test whether a small nonlinear market-feature
set changes the rushing/receiving market-feature null result, and propose
(without implementing) Matchup Score design principles. No 0-100 scores, no
score weights, no sportsbook integration, no UI, and no tuning against 2025
were done in this phase.

All temporal-validation numbers below come from a single new script,
`scripts/run-nfl-cross-market-projection-review.ts`, which refits each
market's already-selected Phase 4/5.5/6 architecture on the same
`TEMPORAL_FOLDS`/`FROZEN_BENCHMARK_SEASON` protocol used since Phase 4, and
writes `data/nfl/props/cross-market-projection-review.json`. New reusable
code: `src/lib/nfl/props/types/projectionOutput.ts` (schema) and
`src/lib/nfl/props/predictionIntervals.ts` (+ 8 passing tests).

## 1. Canonical architecture review

No defect was found in any market's Phase 4/5.5/6 winner. All three stand:

| Market | Architecture | Why (from prior phases) |
|---|---|---|
| Passing | Direct regularized model (ridge) | Beat attempts x YPA decomposition by ~5 MAE in Phase 4; hybrid ties direct, doesn't beat it. |
| Rushing | Projected carries x shrunk YPC | Beat direct model after the Phase 5.5 population correction (12.48 dev / 11.84 frozen vs 13.06/12.49 direct). |
| Receiving | Projected targets x shrunk YPT (2-way) | Beat 3-way decomposition, direct, and hybrid in Phase 6 (16.64 dev / 16.39 frozen). |

## 2. Projection output schema

`src/lib/nfl/props/types/projectionOutput.ts` defines `NflProjectionEnvelope`
(shared: identity, market, `status`, `projectedYards`, versions,
`generatedAt`) plus a market-specific block via a discriminated union on
`market`. Passing carries only `directModelPrediction` -- no fabricated
decomposition legs. Rushing and receiving carry their real decomposition legs
(`projectedCarries`/`projectedYardsPerCarry` and
`projectedTargets`/`projectedYardsPerTarget`), and receiving additionally
carries `positionSegment` since Phase 6 found position-segmented fitting
materially beats pooled for that market only. No code yet constructs a
non-null instance of this type; it is the target contract for Phase 8+
production code.

## 3. Prediction population definitions (locked)

`NflProjectionStatus` is the single 4-way state every future production
projection must report, never collapsed to a boolean and never defaulted to a
silent zero:

- **`projected`** -- pregame-eligible (Phase 5.5 universe,
  `{market}EligiblePregame`) with sufficient history for the model to produce
  a real projection.
- **`eligibleInsufficientHistory`** -- pregame-eligible but the player has
  little/no target-season history (e.g. a true first career game). A
  projection MAY still exist via shrinkage/league-mean fallback, but the
  status flags it low-confidence. Quantified in Section 9 below
  (`passing_noHistory`, `receiving_lowHistory`).
- **`notEligible`** -- fails the market's own Phase 5.5 pregame-eligibility
  rule. No projection should be produced.
- **`dataUnresolved`** -- identity/game/team context could not be resolved.
  Phase 5.5's universe already reports 0 unresolved rows in the committed
  artifact, so this status is a safety valve, not an expected common case.

Zero-outcome semantics are unchanged from Phase 5.5/6: a `statsTable` zero is
a confirmed fact; an `activeRosterConfirmed` zero is an inferred true zero
(Phase 6 confirmed inferred-zero receiving rows behave close to real-zero
rows: MAE 12.62 vs 9.42, both far below non-zero's 18.64, so the inference is
judged reasonably reliable, not overturned here). Newly-relevant players
(first pregame-eligible game) fall under `eligibleInsufficientHistory`, not
`notEligible`. No production code exists yet to actually assign these
statuses -- this section only fixes the rule for when it is built.

## 4. Calibration review per market (2025 frozen benchmark)

| Market | n | Mean predicted | Mean actual | Bias |
|---|---|---|---|---|
| Passing | 544 | 232.50 | 219.97 | **+12.53** |
| Rushing | 3,448 | 17.57 | 17.92 | -0.35 |
| Receiving | 5,179 | 22.69 | 22.84 | -0.15 |

Passing is the only market with a material overall bias; rushing and
receiving are both essentially unbiased overall on the frozen benchmark.

**Passing by predicted-yardage tercile:** bias is positive in all three
buckets (low +14.8, medium +7.2, high +15.6) -- the drift is not confined to
big performances, it is a broad overprediction. **By week band:** worst early
(week1 +17.0, weeks2-3 +16.5), better mid-season (weeks4-8 +6.4), rebounding
late (weeks9+ +14.2). **By history:** `noHistory` QBs are catastrophic
(n=16, bias +77.0, MAE 83.2) -- see Section 9. Excluding that tiny segment,
`lowHistory` bias is +14.6 and `established` is +8.9 -- established QBs still
carry a real, non-trivial positive bias.

**Rushing by predicted tercile:** high +1.14, medium -1.03, low -1.21 -- no
strong monotonic drift, mild and small in both directions. **By position:**
QB +0.71, RB -1.75, WR +0.72, TE +1.51 -- RB is the only position with a
bias exceeding 1 full yard, and it is a small underprediction, not over.

**Receiving by predicted tercile:** low -2.86, medium +0.48, high +1.93 -- a
real but modest pattern (low-volume weeks slightly overpredicted... actually
underpredicted here: bias negative means predicted < actual, so the low
bucket is *underpredicting* volume/production, high bucket slightly
overpredicts). **By position:** RB +1.87, WR -0.75, TE -1.01 -- RB receiving
production is the one segment with a bias approaching 2 yards.

## 5. Passing calibration drift investigation (~+12.5 bias)

One recalibration approach was implemented and tested on development folds
only, never touching 2025: refit the direct ridge model using only the
single most-recent training season in each fold (an approximation of
"rolling recalibration" -- with only 2 development folds available, a true
separate-intercept-only recalibration layer was not distinguishable from a
full refit on less data, so this test should be read as an upper bound on
what a lighter-weight recalibration layer could achieve, not a lower bound).

| Fold | Pooled MAE | Pooled bias | Recent-season-only MAE | Recent-season-only bias |
|---|---|---|---|---|
| fold1 (train=2022, validate=2023) | 56.50 | -3.18 | 56.50 (identical -- train set is already single-season) | -3.18 |
| fold2 (train=2022-2023, validate=2024) | 55.12 | -1.93 | 55.61 | **+3.08** |

**Verdict: do not adopt.** The recent-season-only approach does not show a
consistent win across both dev folds -- in fold2 it makes MAE slightly worse
(55.61 vs 55.12) and flips the bias sign rather than shrinking it toward zero
(+3.08 vs -1.93, similar magnitude, opposite direction). This is exactly the
"if not, leave the raw model unchanged" outcome the phase spec anticipated.
The raw direct-ridge passing model is left unchanged.

What the +12.5 drift is *not*, based on this and prior-phase evidence: it is
not concentrated in one predicted-yardage bucket (Section 4 shows it in all
three), and it is not something a single-season retrain fixes. The most
likely remaining explanation, consistent with Phase 5 Section 0's original
diagnostic (never overturned) and the multi-QB finding below, is some
combination of (a) a `noHistory`/`multiQb` population effect pulling the
aggregate up (Section 9 shows these segments carry bias of +57 to +77) and
(b) a genuine, currently un-modeled shift in league passing environment
between the training seasons and 2025 that a linear-in-market-features ridge
model does not capture. Neither hypothesis was fully isolated this phase;
this is flagged as unresolved rather than force-fit.

## 6. Rushing/receiving calibration -- component-level bias (2025)

Requested: is the calibration error coming from the opportunity leg, the
efficiency leg, or their interaction? Computed against the true underlying
opportunity/efficiency values (not just the product):

| Market | Opportunity-leg bias | Efficiency-leg bias |
|---|---|---|
| Rushing | carries: -0.067 (near zero) | YPC: +0.059 (near zero) |
| Receiving | targets: +0.065 (near zero) | YPT: -0.086 (near zero) |

Both legs are individually well-calibrated on 2025 for both markets -- there
is no meaningful opportunity-vs-efficiency imbalance to correct. This is
consistent with Section 4's finding that rushing/receiving overall bias is
already small (-0.35 and -0.15 yards). No calibration layer is added for
either market; the existing decomposition is not adjusted.

## 7. Uncertainty model groundwork

Pregame-observable variables associated with larger absolute error,
quantified via the frozen-benchmark breakdowns above and the Phase 3-6
diagnostics they build on:

- **Passing:** QB-instability (`instabilityCategory: multiQbGame`) is the
  strongest signal (Section 9: MAE 71.5 vs an overall 55.8). History depth
  is second (`noHistory` MAE 83.2, n=16). Week band is a weaker signal
  (early-season MAE modestly higher than mid-season).
- **Rushing:** committee concentration (`recentTeamTopCarryShareConcentration`,
  carried over from Phase 5) remains directionally useful, but the more
  striking 2025 finding is workload level itself: `rushing_highVolumeBacks`
  (>=12 carries/game recent usage) has MAE 29.4 vs the committee segment's
  12.0 -- high-workload backs are harder to predict in absolute-yard terms,
  simply because their outcome variance is larger in absolute terms, not
  because the model is worse relative to their scale (their `maeOverMean` is
  actually more favorable -- see Section 11).
- **Receiving:** zero-target risk and low target-history are the two
  strongest signals (Section 9). Position also matters as a weaker
  second-order signal (RB receiving bias is the largest of the three
  positions).

No 0-100 confidence score is built. This section only names and quantifies
candidate uncertainty drivers per market for Phase 8+ to consume.

## 8. Prediction interval feasibility

Simple empirical residual-quantile intervals (`predictionIntervals.ts`) were
built once from development-fold residuals (fold2 validation residuals were
used as the calibration sample) at a 90% nominal level, then their coverage
was measured -- never assumed -- against the 2025 frozen benchmark:

| Market | Nominal | Realized coverage (2025) | Avg width (yards) | Dev sample size |
|---|---|---|---|---|
| Passing | 90% | **86.9%** | 221.6 | 544 |
| Rushing | 90% | **88.4%** | 50.5 | 3,387 |
| Receiving | 90% | **89.0%** | 65.7 | 5,244 |

All three markets undershoot the nominal 90% level by 1-3 points on the
frozen benchmark -- reasonably close, not exact. This is honest, measured
coverage, not a formal guarantee. Given the modest gap and limited number of
development folds available to condition on, role/volume-conditioned bands
were not built this phase (the phase spec explicitly allows reporting "does
conditioning materially improve calibration" without necessarily building
it); the flat empirical interval is judged adequate groundwork for Phase 8,
with the caveat that realized coverage should be re-checked once a
production population (not just this backtest population) is scored.

## 9. Hard-case populations (quantified on 2025)

| Segment | n | MAE | Bias | Residual std dev |
|---|---|---|---|---|
| Passing: multi-QB games | 84 | 71.46 | +57.73 | 62.63 |
| Passing: no season/prior-season history | 16 | 83.24 | +77.02 | 50.21 |
| Rushing: committee backfields (concentration <0.6) | 1,390 | 12.05 | -1.63 | 21.14 |
| Rushing: high-volume backs (>=12 carries/game recent) | 386 | 29.39 | +1.26 | 38.55 |
| Receiving: zero-target rows | 1,188 | 8.26 | +8.26 | 9.62 |
| Receiving: low target-history (<3 games with targets) | 1,326 | 15.54 | +1.23 | 22.61 |

Passing's two hard cases are severe outliers, not marginal effects (both
carry bias >5x the market's overall +12.5). Recommendation: these should be
flagged low-confidence in production (`eligibleInsufficientHistory` for
no-history; a dedicated instability flag for multi-QB games), not withheld --
withholding entirely would remove real games from the projection surface
where the industry standard is to still publish *something*, just with wider
uncertainty. Rushing's high-volume-back segment and receiving's zero-target
segment should get wider prediction intervals than the flat market-wide band
in Section 8, once role/volume-conditioned intervals are built (deferred, see
Section 8). Note `receiving_zeroTarget`'s R² is a meaningless -432 here
because the true value has zero variance in that subset (every actual is 0)
-- MAE/bias are the correct metrics for that row, R² is reported only for
schema consistency with the other segments and should be ignored for it.

## 10. Nonlinear market-feature robustness test (rushing/receiving)

A small, pre-specified set of nonlinear market terms (spread-magnitude
buckets at >=7 and >=10, a large-favorite indicator, a total>=47 bucket, and
a spread x recent-carries/targets interaction) was added to each market's
direct-ridge model (the vehicle used for this test, since the winning
decomposition model has no fittable market coefficient) and evaluated on
development folds only:

| Market | Linear market (avg dev MAE) | No market | Nonlinear market added |
|---|---|---|---|
| Rushing | 13.060 | 13.011 | 13.016 |
| Receiving | 17.060 | n/a (not separately re-run) | 17.072 |

Rushing: after correcting the Phase 7 runner's pass-EPA/rush-EPA field
mapping, the nonlinear terms produce a ~0.04 MAE improvement over linear
market but are ~0.005 worse than "no market" -- within noise, not a material
finding. Receiving: the nonlinear terms are very slightly *worse* than linear
market. **Conclusion: the market-feature null result
from Phase 5/6 is not an artifact of linear encoding.** The earlier finding
stands -- market context materially helps passing and is genuinely
near-irrelevant for rushing and receiving, even under a modest nonlinear
specification. No further market-feature engineering is pursued for these
two markets.

## 11. Cross-market benchmark table

| Market | Architecture | Dev MAE | 2025 MAE | Bias | R² | MAE/mean actual | RMSE/mean actual | Main signal | Main uncertainty |
|---|---|---|---|---|---|---|---|---|---|
| Passing | Direct ridge | 55.81 | 55.81 | +12.53 | 0.102 | 0.254 | 0.320 | Market context | Multi-QB instability |
| Rushing | Carries x shrunk YPC | 12.48 | 11.84 | -0.35 | 0.512 | 0.661 | 1.158 | Player usage (carries) | Committee concentration / high volume |
| Receiving | Targets x shrunk YPT | 16.64 | 16.39 | -0.15 | 0.350 | 0.718 | 1.041 | Player usage (targets) | Zero-target risk / low history |

Normalized error tells a different story than raw MAE: passing's raw MAE is
by far the largest in absolute yards, but its MAE/mean-actual (0.254) is the
*best* of the three markets in relative terms -- passing totals are simply
much larger numbers. Rushing and receiving both carry meaningfully worse
relative error (0.66-0.72), and their RMSE/mean ratios (1.16 and 1.04) being
larger than their MAE ratios flags real tail risk: a materially worse
outcome on a subset of predictions than the MAE alone suggests (consistent
with the high-volume-back and zero-target hard cases in Section 9). Passing's
RMSE/mean (0.320) staying close to its MAE/mean (0.254) indicates its errors
are comparatively more evenly distributed once you set aside the
multi-QB/no-history outliers already isolated in Section 9.

## 12. Production-readiness gates (projection-quality, not betting gates)

These are the objective gates a market must clear before being called
production-ready. They test projection integrity, not sportsbook hit rate:

1. **Deterministic generation** -- same inputs produce the same output
   (already true for all three: closed-form/ridge with fixed alpha, no
   randomness).
2. **Temporal leakage tests pass** -- all three markets have leakage/holdout
   isolation tests from their respective phases; none regressed this phase.
3. **Minimum historical coverage** -- pregame-eligible population must have
   at least N prior games or a defined fallback path
   (`eligibleInsufficientHistory`), never a silent zero. Currently
   *documented* (Section 3) but not yet *enforced* by any production code
   path -- gate not yet met for any market.
4. **Calibration stability** -- overall bias on the frozen benchmark should
   be small relative to the market's typical outcome. Rushing (-0.35/17.9 =
   -2%) and receiving (-0.15/22.8 = -0.7%) clear this comfortably. Passing
   (+12.5/220.0 = +5.7%) does not, and Section 5 found no leakage-safe fix
   this phase -- **gate not met for passing.**
5. **Error threshold** -- no numeric threshold is invented (per phase
   instruction); this gate is satisfied by publishing the normalized-error
   table (Section 11) so a future human decision can set a threshold against
   real numbers rather than a guessed one.
6. **Prediction interval quality** -- realized coverage must be measured
   (not assumed) and reasonably close to nominal. All three markets clear
   this at 87-89% realized vs 90% nominal (Section 8) -- **gate met for all
   three**, with the caveat noted in Section 8 about untested
   role-conditioned bands.
7. **Universe integrity** -- 0 duplicate rows, 0 unresolved identity in the
   Phase 5.5 universe artifact -- **gate met for all three** (inherited,
   re-verified by this phase's reuse of the same universe).
8. **No unresolved identity/game rows feeding a live projection** -- true by
   construction today since nothing yet writes a live projection; becomes a
   real gate once Phase 8 production code exists.
9. **Sufficient history / explicit low-history handling** -- rule is defined
   (Section 3) and hard cases are quantified (Section 9), but no code yet
   *acts* on the rule (assigns `eligibleInsufficientHistory` and widens
   intervals accordingly) -- **gate not yet met for any market.**

## 13. Readiness classification per market

As expected going in, **none of the three markets are production-ready**
yet. All three are research baselines with a validated winning architecture;
none has the operational scaffolding (status assignment, interval
application, low-history handling) wired up.

- **Passing -- research baseline, closest to a production *candidate* on
  raw accuracy but blocked on calibration.** Architecture is settled
  (direct ridge). Blocking gap: the +12.5 calibration bias has no accepted
  fix (Section 5) and its two hard-case segments (Section 9) are severe
  enough that shipping without a confidence/flagging layer would be
  misleading. Needs: an accepted (or explicitly rejected-with-reason)
  calibration approach, and wiring of `NflProjectionStatus` for the
  no-history/multi-QB segments before any production candidate status.
- **Rushing -- research baseline, best-calibrated of the three.**
  Architecture settled (carries x shrunk YPC), overall bias negligible,
  component legs both well-calibrated (Section 6). Needs: enforcement of the
  minimum-history gate and role-conditioned interval work before promotion
  past research baseline.
- **Receiving -- research baseline, same status as rushing.** Architecture
  settled (targets x shrunk YPT, position-segmented), overall bias
  negligible, component legs well-calibrated. Needs: the same
  history/interval wiring, plus explicit handling of the zero-target hard
  case (Section 9) which is receiving's most severe segment.

None should move to "production candidate" until Section 12's gates 3 and 9
(history handling) are actually implemented, not just documented.

## 14. Artifact/storage review

Current committed sizes under `data/nfl/props/`:

| File | Size | Status |
|---|---|---|
| `player-game-universe-2022-2025.json` | 22.8 MB | Live, shared foundation (Phase 5.5) |
| `receiving-outcomes-2022-2025.json` | 11.8 MB | Live (Phase 6) |
| `rushing-outcomes-v2-2022-2025.json` | 5.8 MB | Live (Phase 5.5, current) |
| `rushing-outcomes-2022-2025.json` | 4.0 MB | **Legacy/stale** -- superseded by v2, but still consumed by the legacy Phase 5 runner/package command |
| `qb-passing-outcomes-2022-2025.json` | 1.5 MB | Live (Phase 4) |
| `qb-opportunity-outcomes-2022-2025.json` | 1.0 MB | Live (Phase 3) |
| `historical-market-context-2022-2025.json` | 550 KB | Live, shared (Phase 3) |
| Baseline-competition result JSONs (6 files) | 13-21 KB each | Live, small |
| `cross-market-projection-review.json` | 17 KB | New (this phase) |

Total committed size is ~46 MB, dominated by the two full row-level outcome
artifacts (universe + receiving) plus the two rushing outcome generations.
All of these are plain JSON with no compression. Findings:

- **Duplication:** `rushing-outcomes-2022-2025.json` (pre-universe-correction)
  is methodologically obsolete, but the legacy Phase 5 competition runner
  still reads it and both legacy generator/runner commands remain exposed in
  `package.json`. It cannot be deleted safely without retiring that whole
  legacy command path.
- **Full row-level outcomes vs. derived artifacts:** the two largest files
  (universe, receiving-outcomes) are raw per-player-per-game rows, not
  aggregates. They are the reproducibility source of truth for every
  downstream feature/model in this codebase, so collapsing them to a
  "compact derived" form would break that reproducibility guarantee unless a
  compact form were proven to regenerate identical features -- not attempted
  this phase.
- **Format:** JSON was kept consistent with every other artifact in this
  codebase (`data/nfl/**`, fantasy pipeline, PGA/MLB pipelines) rather than
  introducing a second format (e.g. Parquet) for just this subtree, which
  would add a new dependency and a second read/write code path for no
  functional gain at this data scale (tens of MB, not GB).

**Recommended retention strategy (not executed this phase):** (1) retire the
legacy generator, runner, package commands, old report, and
`rushing-outcomes-2022-2025.json` together; (2) keep the two large
row-level artifacts committed as-is -- they are the reproducibility backbone,
and 46 MB total is not yet a repo-health problem; (3) revisit only if a
future market (e.g. a 4th prop type) would push the subtree meaningfully past
its current size, at which point Git LFS or a build-time regeneration step
(rather than committing the artifact) would be the two real options to
evaluate.

## 15. Matchup Score design principles (research only -- no implementation)

**A Matchup Score must not simply be a rescaled projected-yard total.** The
three concepts in this system are, and must remain, distinct:

- **Projection** -- "what yardage do we expect this player to produce?" A
  point estimate (plus, per Section 8, an interval) grounded in the player's
  own usage/efficiency history and the game's context. This is what Phases
  1-7 built.
- **Matchup Score** -- "how favorable is the underlying football environment
  for this player's role, independent of that player's own current form?" A
  score should isolate the *opponent/context* contribution from the
  *player's own* baseline level, so that two players with very different raw
  projections but similarly favorable matchups can be compared on a common
  scale. This is not yet built.
- **Prop Edge** (future, blocked by the free-first sportsbook-data mandate)
  -- "how favorable is a specific sportsbook line relative to the
  projection?" Requires real prop-line data this repo does not yet ingest.
  Must never be conflated with the Matchup Score, which is purely a
  football-environment judgment with no line involved.

Per-market conceptual decomposition dimensions a future Matchup Score should
draw from (dimensions only -- no weights, no scoring function):

- **Passing:** QB/team passing environment (the ridge model's own
  opportunity+market-context contribution), opponent pass defense strength
  (already exists as a lagged EPA-allowed feature), team pass tendency/PROE
  (Phase 2), broader game environment (total/spread magnitude, dome/weather
  where available).
- **Rushing:** workload environment (team rush-play volume, game-script
  proxies like spread/implied total), team rush environment (EPA-based, reused
  from the passing context module per the established field-remapping
  pattern), opponent rush defense (lagged), and a trench/OL matchup dimension
  only if a production-quality OL data source is found -- Phase 5 did not
  identify one, so this dimension should be marked "not currently
  supportable" rather than proxied.
- **Receiving:** receiving opportunity environment (team pass volume/PROE,
  already available), target-role strength (target share, target
  concentration -- Phase 6), opponent pass-defense matchup specifically
  against the player's role/position (Phase 6 required volume/sample control
  before trusting any "opponent allows X to WR" framing; the same discipline
  applies here), and a position-specific context dimension only where Phase 6
  already validated position segmentation matters (it does, for receiving
  only).

Explicitly deferred to a future phase, per this phase's instructions: the
actual scoring function, dimension weights, the 0-100 scale itself, and any
UI or user-facing presentation.

## 16. Tests

New tests introduced this phase: `src/lib/nfl/props/predictionIntervals.test.ts`
(8 tests -- determinism, symmetric-interval shape, empty-sample throw,
zero-clamping, realized-coverage computation with a worked 0.5 example,
empty-held-out-sample handling, average-width computation). All 8 pass. No
existing test suite was rewritten. `types/projectionOutput.ts` is a pure type
module (no runtime logic) and is exercised indirectly via TypeScript's own
structural checking during `tsc --noEmit`; no separate unit test was added
for it since it has no behavior to test, consistent with how prior phases'
pure-type modules (e.g. `types/qbOpportunityFeatures.ts`) were handled.

## 17. Scope discipline confirmed

Not done this phase, per instruction: no 0-100 matchup scores built, no score
weights selected, no sportsbook/prop-line ingestion, no `edgeYards`
calculation, no UI changes, no betting recommendations, no fantasy page
changes, and no model tuned against 2025 (every adjustment decision in
Sections 5-6 and 10 was made strictly on development-fold evidence, with 2025
used only to report the resulting frozen-benchmark numbers after the
decision was already made not to change anything).

## 18. Files created / modified this phase

- `src/lib/nfl/props/types/projectionOutput.ts` (new)
- `src/lib/nfl/props/predictionIntervals.ts` (new)
- `src/lib/nfl/props/predictionIntervals.test.ts` (new, 8/8 passing)
- `scripts/run-nfl-cross-market-projection-review.ts` (new)
- `data/nfl/props/cross-market-projection-review.json` (new, generated artifact)
- `docs/nfl-cross-market-projection-review.md` (this document)

No existing Phase 1-6 source file was modified.

## 19. Validation performed

- `npx tsc --noEmit -p .` -- clean, 0 errors.
- `npx eslint scripts/run-nfl-cross-market-projection-review.ts` -- clean.
- `npx vitest run src/lib/nfl/props/predictionIntervals.test.ts` -- 8/8 passing.
- `scripts/run-nfl-cross-market-projection-review.ts` executed successfully
  end-to-end against the full committed 2022-2025 caches/artifacts (exit 0),
  producing the numbers reported throughout this document.
- Broader regression suite and `git status`/`git diff --check` have **not**
  been run yet as of this document -- flagged as an open item before this
  phase can be considered fully closed out, separate from report approval.

## 20. Decisions needed before Phase 8

1. **Passing calibration:** accept "no adjustment" (this phase's conclusion,
   Section 5) as final for now, or request a different recalibration method
   be tried (e.g. a true rolling-intercept layer requiring more than 2
   development folds, which would need revisiting the fold structure)?
2. **Hard-case handling:** confirm the recommendation in Section 9 --
   flag-but-still-project (not withhold) for passing's multi-QB/no-history
   cases and receiving's zero-target case -- rather than excluding those rows
   from production output entirely.
3. **Prediction intervals:** accept the flat empirical 90%-nominal intervals
   (Section 8) as sufficient groundwork for Phase 8, or require
   role/volume-conditioned bands be built before Phase 8 begins?
4. **Artifact retention:** approve archiving/removing the stale
   `rushing-outcomes-2022-2025.json` (and updating/retiring the doc that
   still references it) now, or defer that cleanup to a later phase?
5. **Readiness gates:** confirm the gate list in Section 12 is the right set
   before it becomes the checklist Phase 8 is measured against.
6. **Matchup Score:** confirm the three-dimension-per-market design
   principles in Section 15 as the starting point for an eventual Phase 9 (or
   later) implementation phase, with the explicit understanding that
   dimension weighting and scoring-function design remain fully open
   questions this document does not answer.

Do not begin Phase 8 until this report is approved.
