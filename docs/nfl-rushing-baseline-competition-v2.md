# Rushing-yard baseline competition rerun (Phase 5R, corrected population)

Full universe details: `docs/nfl-player-game-universe.md`. This rerun preserves
Phase 5's methodology exactly (same features, same baselines A-E, same
temporal-fold discipline) and changes only the outcome population, to
isolate the correction's effect.

## Corrected rushing population

| | Rows |
| --- | --- |
| Old Phase 5 (`carries > 0` only) | 8,919 total / 7,967 pregame-eligible |
| **Corrected (Phase 5.5 universe, `rushingEligiblePregame`)** | **13,138** |
| Added rows (true zero-carry games for already-eligible players) | **5,171** |

Actual-yards distribution barely moved (Phase 5 dev mean ~30.6, corrected
dev mean is lower because ~5,171 new rows are mostly 0-yard games --
exact distribution in the report JSON `actualDistribution`).

## Rerun results (2 dev folds, same temporal discipline as Phase 5)

| Model | Phase 5 avg dev MAE | **Corrected avg dev MAE** |
| --- | --- | --- |
| A: league mean | 25.29 | 22.03 |
| B: rolling | 18.45 | 14.49 |
| **C: decomposition** | **18.05** | **12.48** |
| D: direct ridge | 18.52 | 13.06 |
| E: hybrid ridge | 18.47 | 13.04 |

Every model's MAE dropped substantially -- expected, not a sign the
underlying prediction problem got easier: the corrected population now
includes ~5,171 easy, near-zero-error zero-carry games mixed in with the
same hard workhorse-back cases Phase 5 evaluated. Absolute MAE across the
two populations is **not directly comparable**; the ranking between
models is the number that matters, and it did not change.

## 2025 frozen benchmark (corrected)

| Model | MAE |
| --- | --- |
| A | 21.80 |
| B | 13.63 |
| **C (decomposition)** | **11.84** |
| D (direct) | 12.49 |
| E (hybrid) | 12.47 |

## Zero-carry subset performance (2025, direct ridge)

| | n | MAE |
| --- | --- | --- |
| Zero-carry games (actual = 0) | 1,480 | **5.42** |
| Non-zero games | 1,968 | 17.81 |

Confirms the mechanism directly: the newly-added zero-carry rows are easy
(MAE 5.4), and they now make up 43% of the 2025 evaluation sample (1,480
of 3,448), which is why every model's aggregate MAE fell. The **hard
part of the problem -- predicting a workhorse or committee back's actual
yardage -- is unchanged in difficulty** (non-zero-subset MAE of 17.81 is
close to Phase 5's original full-sample MAE of ~18).

## Pooled vs. segmented (corrected)

Pooled 13.06 vs. segmented 13.32 -- **same conclusion as Phase 5: no
meaningful benefit to QB/non-QB segmentation.**

## Direct vs. decomposition (re-decided, not defended out of inertia)

**Decomposition (C) remains the winner on dev folds (12.48 vs. D's 13.06)
and the 2025 benchmark (11.84 vs. D's 12.49).** The Phase 5 winner did
**not** change under the corrected population. This is reported as a
finding, not an assumption -- the rerun genuinely re-ran the full
competition rather than re-asserting the prior answer.

## What changed vs. what didn't

- **Changed**: absolute MAE for every model (much lower, driven by the
  larger easy-zero population); ablation/market-audit absolute numbers
  will also shift in scale (not rerun in full detail here to control
  scope, per the brief's instruction to keep the rerun focused on
  population correction rather than a second full feature redesign).
- **Unchanged**: the model ranking (C best), the pooled-vs-segmented
  conclusion (pooled fine), and therefore the recommended architecture.
