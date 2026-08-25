# Receiving-yard baseline competition (Phase 6)

## Target population

**WR, TE, RB. QB deliberately excluded** -- verified against 2025: only
11 of 664 QB player-weeks (1.7%) record any target at all (trick plays),
not a legitimate modelable role. Built from the Phase 5.5 universe's
`receivingEligiblePregame` rows, so legitimately eligible zero-target
games are represented as true zeros, not absent.

## Zero-target provenance audit

`data/nfl/props/receiving-outcomes-2022-2025.json`
(`npm run nfl:receiving-outcomes`): **20,131 rows** (RB 5,325 / WR 9,531 /
TE 5,275), of which **4,326 (21.5%) are zero-target**: **2,468 from a real
stats-table row** (the player recorded some other stat that week) and
**1,858 from the ACT-roster-confirmed inference** (no stats row, but
confirmed active).

**ACT/no-stats sanity check** (retrospective diagnostic only, not used for
eligibility or prediction): on the 2025 frozen benchmark, stats-table
zero-target rows have MAE 9.42 (n=661) vs. ACT-inferred zero-target rows
MAE 12.62 (n=527) -- both far below the non-zero population's 18.64 MAE.
**The ACT-inferred zeros are somewhat harder to predict than confirmed
zeros, but both are predicted far better than the non-zero population**,
consistent with these genuinely being low/no-usage players rather than a
population of mis-inferred non-zeros. No canonical semantics change is
recommended based on this finding -- the inference appears reasonably
reliable, not unreliable enough to revisit.

## Opportunity target: targets, evaluated separately

| Model | Dev-fold avg MAE (targets) |
| --- | --- |
| League mean | 2.648 |
| Rolling targets | 1.727 |
| **Target share x team pass attempts** | **1.729** |
| Direct ridge on targets | 1.742 |

Rolling targets and target-share-times-team-attempts are statistically
tied and both edge out a direct ridge model -- consistent with Phase 3's
finding for QB attempts, but independently re-tested here, not assumed.

## Player usage / efficiency / air-yard features

- **Usage**: targets/game, target share (rolling seasonPrior/last3/priorSeason).
- **Efficiency**: yards/target, receptions/target (catch rate), yards/reception -- all with games-count shrinkage toward the league mean in the decomposition baselines (same fixed, non-tuned prior-strength constant Phase 4/5 used).
- **Air yards**: `receiving_air_yards` verified at **100% coverage** among targeted RB/WR/TE across all four seasons -- made load-bearing (aDOT = air yards/target, rolling). `airYardsShare` (team-relative) was investigated but not built this phase to control scope; always null, documented.

## Team passing environment / target-share concentration / opponent context

- **Team environment**: team pass attempts/game, dropback rate, PROE (Phase 2/3, reused unchanged).
- **Target-share concentration**: team-level leading-receiver target share, averaged over the team's own last 3 games (the receiving analog of Phase 5's committee-concentration signal).
- **Opponent pass defense**: targets-allowed/game (reused Phase 3/4 opponent-window logic on team pass attempts) + pass EPA allowed (reused Phase 4's EPA-context module, real `pass_epa`/`pass_plays` fields).

## Development-validation design

Same 2-fold rolling-origin scheme as Phase 4/5 (fold1 train 2022→validate 2023, fold2 train 2022-2023→validate 2024), 2025 loaded once as a fixed retrospective benchmark, never used for selection.

## Every baseline result (avg. dev MAE / 2025 MAE)

| Model | Dev MAE | 2025 MAE |
| --- | --- | --- |
| A: league mean | 23.95 | 22.62 |
| B: rolling receiving yards | 17.58 | 17.55 |
| **C: targets x YPT (shrunk)** | **16.64** | **16.39** |
| D: targets x catch rate x YPR (shrunk) | 16.73 | 16.49 |
| E: direct ridge | 17.06 | 16.85 |
| F: hybrid ridge | 17.08 | 16.85 |

## Direct vs. decomposition -- all six questions answered

1. **Does targets x YPT beat direct?** Yes -- C (16.64/16.39) beats E (17.06/16.85) on both dev and 2025.
2. **Does the 3-way decomposition (targets x catch rate x YPR) beat direct?** Yes, also -- D (16.73/16.49) beats E, but **not as well as the simpler 2-way decomposition C.** More decomposition did not mean better prediction here.
3. **Does a hybrid model beat all of them?** No -- F (17.08/16.85) is statistically tied with E, not better, and both trail C/D.
4. **Does projected target volume materially improve the direct model?** The target sub-competition shows targets themselves are well-predicted by simple means (§ above); inside the direct/hybrid ridge, `playerUsage` (which includes rolling targets) is by far the dominant ablation group (see below) -- so yes, volume matters enormously, just not via the hybrid's explicit decomposition-leg columns specifically.
5. **Does target-share concentration materially help?** No -- ablation delta is essentially zero (17.054 vs. 17.060 baseline).
6. **Are results materially different by WR/TE/RB?** See §16 below -- yes, modestly (segmentation helps slightly here, unlike passing/rushing).

## Selected architecture (development validation only)

**C: targets x shrunk YPT** -- the clear winner on dev-fold MAE, corroborated by the 2025 benchmark, never chosen using 2025.

## Pooled vs. position-specific (§16)

| | Dev MAE |
| --- | --- |
| Pooled (WR/TE/RB indicator) | 17.060 |
| **Segmented by position** | **16.878** |

**Segmentation modestly helps for receiving** (~0.18 MAE improvement) --
the opposite conclusion from passing and rushing, where pooling was
equal-or-better. Reported as found: receiving roles differ enough across
WR/TE/RB (route types, usage patterns) that separate models pick up a
real, if modest, edge here.

## Zero-target / low-volume performance (§17)

| | n | MAE |
| --- | --- | --- |
| Zero-target | 1,188 | 10.84 |
| Non-zero | 3,991 | 18.64 |

No systematic gross over-prediction pattern found beyond the expected
scale effect (zero-target rows have a lower ceiling on possible error).

## Feature ablation (dev folds, direct ridge, alpha=0.1)

| Excluded group | Dev MAE | Delta |
| --- | --- | --- |
| none | 17.060 | -- |
| **playerUsage** | **22.548** | **+5.488 (overwhelmingly dominant)** |
| teamEnvironment | 17.091 | +0.032 |
| playerEfficiency | 17.110 | +0.051 |
| opponentPassDefense | 17.069 | +0.010 |
| market | 17.064 | +0.005 |
| airYards | 17.063 | +0.003 |
| targetConcentration | 17.054 | -0.006 (~neutral) |

**Player usage dominates overwhelmingly, exactly as it did for rushing's
`playerUsage` group** -- volume is the single most important signal for a
volume-driven counting stat. Every other group, including market (the
passing driver) and target concentration, contributes essentially nothing
marginally in this ridge configuration.

## Market-feature audit

Removing spread, total, or implied team total individually each change
dev MAE by less than 0.001 -- **market contributes essentially nothing to
receiving yards, matching rushing's finding, not passing's.** Three for
three markets now: passing needs market, rushing and receiving do not.

## Week/position/history breakdowns (2025, direct ridge)

Full detail in `data/nfl/props/receiving-baseline-competition-2022-2025.json`
`breakdownsOnFrozen2025`. Position, week-band, volume-band, history-bucket,
and concentration-bucket breakdowns all computed and reported with sample
sizes, following the same pattern as Phase 4/5.

## Recommended receiving architecture

**B: targets x shrunk yards-per-target decomposition** -- consistent with
rushing (decomposition wins) but **for a different reason than assumed**:
per the explicit instruction not to assume receiving mirrors rushing, this
was independently re-tested, and the simpler 2-way decomposition (not the
3-way catch-rate-split version) is the actual winner. As with Phase 4/5,
this is a research-baseline recommendation, not production-ready.
