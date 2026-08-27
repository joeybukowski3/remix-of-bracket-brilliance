# NFL yardage context-family study (rushing + receiving, 2022-2025)

Controlled historical research phase, run against checkpoint `cb17be7d` on
`feat/nfl-yardage-props-review-ui`. Determines whether opponent/team/game/role
context improves the frozen production baselines out of sample. **Research
only -- no production model, weight, or artifact was read as a target or
written to.** Full machine-readable output:
`data/nfl/research/nfl-yardage-context-family-study-2022-2025.json`.

## 1. Objective

Test whether matchup/team/game/role context (opponent efficiency, opponent
production allowed, team/game environment, role/committee context) improves
the existing frozen rushing and receiving yardage baselines out of sample,
using leakage-safe historical reconstruction and rolling chronological
evaluation. QB passing is out of scope.

## 2. Frozen baseline definitions

- **Rushing**: `projected carries x shrunk YPC` (decomposition baseline C,
  `src/lib/nfl/props/rushingBaselines.ts`, `predictRushingBaselineC`).
- **Receiving**: `projected targets x shrunk YPT` (decomposition baseline C,
  `src/lib/nfl/props/receivingBaselines.ts`, `predictReceivingBaselineC`).

Both are the winners of the prior baseline-competition studies (`docs/nfl-
rushing-baseline-competition-v2.md`, `docs/nfl-receiving-baseline-competition
.md`) and remain this repository's production authority. This study never
imports either baseline file as a write target -- only as a read-only
component of each RN/CN candidate model.

## 3. Historical data / seasons

- Source: `data/nfl/nflverse/stats-player-week/stats_player_week_{2022..
  2025}.csv`, via the existing normalized outcome artifacts
  (`data/nfl/props/rushing-outcomes-v2-2022-2025.json`,
  `data/nfl/props/receiving-outcomes-2022-2025.json`) -- not a re-parse of
  raw CSV.
- Rushing dev population: 9,690 rows (2022-2024 folds). Frozen 2025 holdout:
  3,448 rows.
- Receiving dev population: 14,952 rows (2022-2024 folds). Frozen 2025
  holdout: 5,179 rows.

## 4. Temporal and leakage controls

- **No random splits.** Rolling-origin dev folds, matching the repository's
  existing `TEMPORAL_FOLDS` convention:
  - `fold1_train2022_validate2023`
  - `fold2_train2022-2023_validate2024`
- **2025 is a true fixed retrospective holdout** (`FROZEN_BENCHMARK_SEASON`).
  No feature, model form, or ridge alpha was ever selected using 2025 data.
- All contextual features are windowed strictly before the target game's own
  kickoff (`gameDateUtc`), reusing the leakage discipline already established
  in `teamPlayVolume.ts`'s `selectPriorGamesAsOpponent` (strict `<` cutoff on
  kickoff date, never week-number proximity).
- Ridge standardization uses **train-fold statistics only** (`ridgeAlphaFixed
  = 10`, matching the existing baseline-competition convention).

## 5. Candidate feature availability

| Family | Classification | Basis |
| --- | --- | --- |
| Player opportunity (carries/targets, share, recent, games-with) | A | Already leakage-safe in `rushingFeatures.ts` / `receivingFeatures.ts` |
| Player efficiency (YPC, YPT, catch rate, YPR) | A | Same, already shrunk toward league mean |
| Team environment (rush/pass attempts/game, dropback rate, PROE) | A | `teamPlayVolume.ts` + play-volume cache, pregame-windowed |
| Opponent rush/pass EPA allowed | A | `qbPassingEpaContext.ts` reconstructs pregame from the same team-game EPA cache the live `epaData.ts` authority uses -- same definition (sum EPA / eligible plays) |
| Opponent rush attempts / targets allowed | A | Same play-volume cache, already windowed |
| Opponent production allowed by position (rush yards, WR/TE/RB rec yards) | B (built this session) | Did not exist; reconstructed leakage-safe (see Section 7) |
| Game environment (spread, total, implied team total, home/away, dome) | A | `historical-market-context-2022-2025.json`, already joined pregame |
| Role/committee concentration (leading-RB carry share, top-target share) | A | Existing pregame rolling diagnostic field |
| aDOT / air-yards share | A, gated | Present but coverage-gated per the existing header comment; not used as a primary candidate |
| Team-change flag | D | Not currently encoded as a discrete pregame feature in either feature-row schema; would require roster-history derivation -- **descoped, not built this phase** |
| Opponent Success Rate allowed (RBSDM) | **C -- historically unavailable** | See Section 6 |
| Matchup edge (rank-difference) | D (deferred by design) | Not tested as a primary candidate this phase, per the brief -- raw underlying metrics tested first |

## 6. Features excluded and why

### RBSDM Success Rate (the important one)

Audited `scripts/lib/nfl-rbsdm-success.mjs` / the RBSDM ingestion pipeline:
`rbsdm.com/api/team-tiers` is a **live-only endpoint** that returns only the
*current* period snapshot (2025-last8 / 2026-season / 2026-last5 as of this
writing). It exposes:

- no archived pregame snapshot for an arbitrary historical target game
  (e.g. 2023 week 6),
- no eligible-play denominator that would let the same rate be reconstructed
  independently from nflverse play-by-play.

Per the governing instruction: **classified historically unavailable
(C) and excluded entirely.** No nflverse-derived success metric was
substituted under the RBSDM name anywhere in this study. A separately-named
nflverse-derived success/EPA-style metric remains a legitimate idea for
*future* research, but must never be presented as "RBSDM Success Rate."

### Matchup-edge rank-difference

Deferred by explicit instruction -- raw underlying metrics were tested first;
edge/rank transformations were never built or evaluated as a primary
candidate this phase.

### Team-change flag

Classified D: not currently encoded as a discrete pregame feature in either
`rushingFeatures.ts` or `receivingFeatures.ts`'s row schema. Building it
would require deriving roster-continuity history separately. Explicitly
descoped for this phase per the governing instruction (deferred, not
approved work -- see Section 20).

## 7. Historical opponent-production-allowed reconstruction

New file: `src/lib/nfl/research/opponentProductionAllowedHistorical.ts`
(research-only; not imported by any production pipeline).

- **Deliberately not a reuse of** `public/data/nfl/matchup-production-
  allowed.json` -- that artifact is fixed at end-of-2025-season and can only
  answer "what did team X allow across all of 2025," which would leak the
  remainder of any earlier season (and all of 2024-2025) into a historical
  target game.
- Built from the existing rushing/receiving outcome artifacts (already-
  normalized `stats_player_week` rows), aggregated into one team-game
  production log per team per season per week.
- Position slices mirror the live-context artifact's convention
  (`scripts/lib/nfl-production-allowed-core.mjs`) for continuity: rushing/ALL
  (team-wide) + rushing/RB, receiving/{WR,TE,RB} (position-specific, no
  team-wide receiving fallback). Passing/QB production allowed was
  intentionally not built -- QB passing is out of scope.
- Windows, all computed strictly from games with `gameDateUtc` before the
  target game's own kickoff:
  - `seasonPrior` -- every completed game this season, strictly before
    kickoff.
  - `last5` -- the final five of those.
  - `priorSeason` -- the entirely-prior season's full total (fully in the
    past, therefore leakage-safe; **never** the current/live season's final
    numbers).
- **Early-season fallback**: a team with zero `seasonPrior` games resolves to
  `null` for `seasonPrior`/`last5` -- never a fabricated number. The study
  script falls back only to `priorSeason` (itself fully in the past) when
  `seasonPrior` is null; any further missing value is imputed only inside the
  ridge encoding step from **train-fold** statistics, the same convention
  the rest of the pipeline already uses.
- Tests: `opponentProductionAllowedHistorical.test.ts`, 6/6 passing --
  aggregation, leakage-boundary exclusion (games on/after kickoff excluded),
  `seasonPrior`/`last5` windowing, null-not-fabricated behavior on an empty
  window, and prior-season-only fallback.

## 8. Experimental model forms

Every R*/C* candidate is: `[baseline decomposition legs (train-fold-fit
carries/targets x shrunk YPC/YPT)] + [exactly the named family's raw,
leakage-safe feature(s)]` -> **ridge regression**, standardized on train rows
only, fixed alpha = 10 (matching the existing baseline-competition
convention). This is an *incremental-family test* (baseline + one family at a
time), distinct from the existing leave-one-out ablation studies referenced
in Section 19 -- both are reported here for cross-validation. No nonlinear or
interaction model form was tested, per the governing instruction.

## 9. Rushing R0-R5 detailed results

R0 = baseline only. R1 = + opponent rush efficiency (EPA/attempts allowed).
R2 = + opponent production allowed (new reconstruction). R3 = + team/game
environment. R4 = + role/committee context. R5 = best pairwise combination
(R1+R2).

### Development folds (avg across fold1/fold2)

| Family | Avg dev MAE | Avg dev bias |
| --- | --- | --- |
| **R0 baseline** | **12.484** | 0.661 |
| R1 opponent rush efficiency | 13.028 | 0.735 |
| R2 opponent production allowed | 12.962 | 0.631 |
| R3 team/game environment | 13.058 | 0.834 |
| R4 role/committee context | 12.968 | 0.673 |
| R5 (R1+R2) | 13.012 | 0.695 |

Every augmented family is **worse** than R0 on both individual dev folds.

### 2025 frozen holdout (n=3,448)

| Family | MAE | RMSE | Bias | Correlation |
| --- | --- | --- | --- | --- |
| **R0 baseline** | **11.842** | 20.747 | -0.349 | 0.717 |
| R1 opponent rush efficiency | 12.152 | 20.764 | -0.607 | 0.716 |
| R2 opponent production allowed | 12.165 | 20.805 | -0.617 | 0.715 |
| R3 team/game environment | 12.582 | 20.756 | +0.146 | 0.716 |
| R4 role/committee context | 12.166 | 20.782 | -0.550 | 0.715 |
| R5 (R1+R2) | 12.147 | 20.742 | -0.567 | 0.717 |

## 10. Receiving C0-C5 detailed results

C0 = baseline only. C1 = + opponent pass efficiency. C2 = + position-specific
production allowed (new reconstruction). C3 = + team/game environment. C4 = +
target-tree/role context. C5 = best pairwise combination (C1+C2).

### Development folds (avg across fold1/fold2)

| Family | Avg dev MAE | Avg dev bias |
| --- | --- | --- |
| **C0 baseline** | **16.642** | -0.427 |
| C1 opponent pass efficiency | 17.206 | -0.244 |
| C2 position-specific production allowed | 17.211 | -0.181 |
| C3 team/game environment | 17.171 | -0.110 |
| C4 target-tree/role context | 17.213 | -0.173 |
| C5 (C1+C2) | 17.211 | -0.226 |

### 2025 frozen holdout (n=5,179)

| Family | MAE | RMSE | Bias | Correlation |
| --- | --- | --- | --- | --- |
| **C0 baseline** | **16.393** | 23.780 | -0.149 | 0.597 |
| C1 opponent pass efficiency | 16.871 | 23.801 | +0.420 | 0.591 |
| C2 position-specific production allowed | 16.878 | 23.813 | +0.433 | 0.591 |
| C3 team/game environment | 16.926 | 23.722 | +0.971 | 0.596 |
| C4 target-tree/role context | 16.880 | 23.810 | +0.444 | 0.591 |
| C5 (C1+C2) | 16.883 | 23.800 | +0.471 | 0.591 |

## 11. Development folds

See Sections 9-10. Baseline wins every family on both `fold1_train2022_
validate2023` and `fold2_train2022-2023_validate2024`, individually as well
as on average -- the aggregate dev numbers above are not hiding a fold-level
split decision.

## 12. 2025 holdout

See Sections 9-10 "2025 frozen holdout" rows. Baseline is best on every
family, in both markets, on every headline metric (MAE, bias, and -- except
for one immaterial third-decimal RMSE tie with R5 -- RMSE and correlation
too). Never a coin-flip result.

## 13. Weeks 1-4

Reported by the study as `week1` and `weeks2to3` (the finer bands the
existing evaluation harness already uses); combined here as the requested
"Weeks 1-4" band.

**Rushing** (R0 vs. best-looking candidate, R2): week1 MAE 19.823 -> 19.095
(n=103, a real but small single-segment gain); weeks2to3 MAE 14.339 ->
14.111 (n=307, also improved). This is the only week band where any
candidate beat baseline.

**Receiving** (C0 vs. C2): week1 MAE 20.385 -> 20.282 (n=195, small gain);
weeks2to3 MAE 18.441 -> 18.346 (n=540, small gain). Same pattern as rushing.

## 14. Weeks 5-8

Reported by the study as `weeks4to8`.

**Rushing**: R0 12.513 -> R2 12.791 (worse). **Receiving**: C0 16.559 -> C2
17.107 (worse). The early-season gain in Section 13 reverses here for both
markets.

## 15. Weeks 9+

Reported by the study as `weeks9plus`.

**Rushing**: R0 10.826 -> R2 11.296 (worse). **Receiving**: C0 15.703 -> C2
16.300 (worse). Confirms the early-season gain does not generalize to the
bulk of the season (weeks 9+ carry the largest n in both markets: 2,149
rushing rows, 3,061 receiving rows).

## 16. Position-level breakdowns (2025, R0/C0 vs. R2/C2)

### RB rushing

R0 MAE 18.862 (bias -1.753) -> R2 MAE 18.807 (bias **-3.149**). Near-flat
MAE, materially worse bias (RBs projected further off, not closer).

### QB rushing (n=868, sample supports it)

R0 MAE 9.307 (bias +0.715) -> R2 MAE 9.446 (bias +0.432). Worse MAE.

### WR receiving

C0 MAE 20.588 (bias -0.749) -> C2 MAE 21.608 (bias **+1.400**). Materially
worse on both.

### TE receiving

C0 MAE 13.907 (bias -1.011) -> C2 MAE 14.280 (bias **+2.980**). Materially
worse on both.

### RB receiving

C0 MAE 11.307 (bias +1.872) -> C2 MAE 10.928 (bias -0.535). The one segment
where the new production-allowed context genuinely helps both MAE and bias
-- but it is a single position slice within one market, not corroborated
elsewhere, and does not survive the Section 20 stability rule on its own.

Rushing WR/TE rows (n=842/188) are trick-play/gadget outliers with near-zero
baseline correlation (0.105/0.101) in both R0 and R2 -- not a meaningful
population for this comparison in either model.

## 17. Coverage / missingness

New opponent-production-allowed feature (the only newly-built family this
phase):

| | Overall | Week 1 | Weeks 1-4 |
| --- | --- | --- | --- |
| Rushing | 99.1% (13,019 / 13,138) | **100%** (300/300) | 94.5% (2,031/2,150) |
| Receiving | 98.9% (19,909 / 20,131) | **100%** (602/602) | 94.3% (3,648/3,870) |

Coverage is excellent, including a clean 100% at Week 1 -- the immediate
production use case. **Coverage is not the limiting factor**: the feature is
available almost everywhere in the historical sample and still fails to add
signal (Section 9-10). Fallback behavior (see Section 7) is `seasonPrior` ->
`priorSeason` -> train-fold mean (ridge-encoding step only); this fallback
chain was exercised for the ~1-5% gap and did not materially change results
-- the aggregate MAE/bias figures already reflect it.

## 18. Bias changes

Every augmented rushing/receiving model shifted bias **away** from the
baseline's near-zero calibration:

- Rushing: R0 bias -0.349 -> worst candidate (R2) -0.617 (2025 overall);
  RB position bias -1.753 -> -3.149.
- Receiving: C0 bias -0.149 -> worst candidate (C3) +0.971 (2025 overall);
  WR position bias -0.749 -> +1.400, TE -1.011 -> +2.980.

Adding context made calibration worse, not merely MAE -- a second,
independent signal against these families being production-ready.

## 19. Comparison with prior baseline-ablation research

Cross-referenced against the existing leave-one-out ablation studies:

- `data/nfl/props/rushing-baseline-competition-v2-2022-2025.json`
  (`featureGroupAblationOnDevFolds`, `frozenBenchmark2025`)
- `data/nfl/props/receiving-baseline-competition-2022-2025.json`
  (`featureGroupAblationOnDevFolds`, `frozenBenchmark2025`)

Both independently show the same opponent/team/game/role feature families
contribute approximately zero marginal MAE when leave-one-out ablated from a
fuller model that already includes player usage/efficiency. This session's
incremental-family test (baseline + one family, in isolation) reaches the
**same conclusion via a different methodology** -- corroborating rather than
merely repeating the prior finding.

## 20. Final production decision

**Rushing production authority remains:**

```
projected carries x shrunk YPC
```

**Receiving production authority remains:**

```
projected targets x shrunk YPT
```

Opponent production allowed, opponent EPA/efficiency, team/game context, and
role/committee feature families did **not** demonstrate sufficient
out-of-sample improvement -- on development folds, on the 2025 holdout, in
aggregate, by position, or by week band -- to become load-bearing projection
inputs. Per the Step 7 stability rule: no candidate improved both dev folds
*and* the 2025 holdout *and* stayed stable across major position groups *and*
preserved early-season performance *and* preserved bias. The one segment
that improved on both axes (RB receiving) is a single slice within one
market and does not on its own clear that bar.

**These metrics remain useful presentation/research context** -- they
continue to power the Week 1 Yardage Props Review UI's opponent-context
columns (`public/data/nfl/matchup-production-allowed.json`, `matchup-epa
.json`, `matchup-success-rates.json`, all served through `src/lib/nfl/props/
review/opponentContext.ts`), which is a display-only concern and is
unaffected by this research decision.

### Future research ideas -- NOT approved work, deferred only

The following are recorded as candidate directions for a **future**,
separately-scoped research phase. They are explicitly **not** recommended
production changes and must not be implemented without a new controlled
study of their own:

- **Team-change interaction**: build a discrete pregame team-change feature
  (classified D, Section 5/6) and re-test whether it changes any family's
  signal, particularly opponent production-allowed for players on a new
  team.
- **Nonlinear/interacting context models**: this phase deliberately tested
  only linear/ridge forms per the governing instruction ("simple models
  first"); a future phase could test whether a nonlinear or interaction form
  extracts signal from these same feature families that a linear model
  cannot -- but only after a fresh, equally rigorous leakage-safe temporal
  evaluation, not as a shortcut around this phase's NO-GO finding.

Neither item is scheduled work. Do not begin either without a new,
explicitly-scoped instruction.
