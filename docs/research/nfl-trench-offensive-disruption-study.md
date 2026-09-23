# NFL pass-rush mismatch and offensive disruption: research Phase 3

Research only, using results available through 2026 Week 2. Rebuild offline with `python -B scripts/research/nfl-trench-offensive-disruption-study.py`. Outputs are in `data/nfl/research/trench-offensive-disruption/`. No JKB feature, model, pick, or UI is changed.

## Conclusion

The pregame **QB-hit mismatch** is associated with more sacks and worse passing efficiency in both the 2022–2023 exploratory period and the untouched 2024–2025 validation period. It is **not** associated with a reliable shortfall against market-implied points. The direct football mechanism has evidence; the proposed team-total or ATS betting signal does not. The historical proxy has only weak agreement with the 2026 ESPN PRWR/PBWR rank edge, so these results do not establish that an actual ESPN win-rate mismatch would have the same effect.

## Phase A: reused infrastructure and data audit

| Retained source | Seasons / exact usable fields | Use here |
| --- | --- | --- |
| Phase 2 `data/nfl/research/qb-pressure-trench/game_interactions.csv` | 2022–2025 regular-season offense team-games and 2026 Weeks 1–2; team/opponent/game/kickoff, prior-eight defense QB hits generated per opponent dropback, prior-eight offense hits allowed per own dropback, pregame normalized mismatch and prior-only percentile, scores, team spread, ATS, sacks/dropbacks, passing EPA, success, interceptions, explosive passes, last-game pass rate | Primary pregame mismatch, offense orientation, outcomes and script controls |
| Phase 1 `data/nfl/research/trench-advantage/team_games.csv` | 2026 Weeks 1–2; ESPN PRWR/PBWR ranks, rating-through-week, scores, implied points and Week 2 offensive passing success | Week 2 ESPN overlay and 2026 implied points |
| `data/nfl/research/situational-trend-team-games-v1.jsonl` | 2011–2025; 2022–2025 joined here; team spread, closing game total, settled score, ATS and kickoff | Historical market-implied points; exact game/team joins |
| `data/nfl/nflverse/epa-team-game/epa_team_game_2021.csv` through `_2026.csv` | 2021–2026 team pass EPA and pass plays | Independent denominator check and prior-eight passing EPA baseline |
| `data/nfl/nflverse/success-team-game/` | 2019–2025 team pass success and plays, already incorporated by Phase 2 | Historical passing success |
| `data/nfl/nflverse/performance-team-game/performance_team_game_2026.csv` | 2026 Weeks 1–2 team pass EPA, pass success, sacks/dropbacks and early-down aggregates | Week 2 passing success via Phase 1; no historical first-half split |
| `data/nfl/nflverse/stats-team-week/` | 2022–2025 QB hits, sacks suffered, interceptions and related counts, already incorporated by Phase 2 | Phase 2 hit proxy and outcome checks |

The retained compact files have no complete **pressure**, **hurry**, **pressured dropback**, **clean-pocket**, **QB-specific EPA**, or **neutral-game-state** split. Team QB hits are narrower than all pressures. Local historical compact files also do not retain first-quarter/first-half score or play split. The underlying raw nflverse play-by-play is streamed and discarded by the repository pipeline; a prior Phase 2 read-only attempt to retrieve it was network-blocked. No first-half market spread/total or direct sportsbook team-total line is retained. `public/data/nfl/team-totals.json` is a JKB model-prediction view with no Vegas reference, so it is not used as a sportsbook price. The team score includes any defensive and special-teams points; offensive-only scoring cannot be distinguished reliably here. Completion percentage, CPOE, yards/attempt, explosive passing and interceptions are retained in Phase 2; adjusted yards/attempt, air EPA, hurries, scrambles, fumbles by offensive play, and actual pressure rate are not sufficiently retained for this analysis.

2022–2025 contributes **2,174** completed offense team rows / **1,087** games before requiring a pregame hit rating; **2,046** rows / **1,023** games have the rating. The 128 unrated rows occur early in 2022 because the Phase 2 rolling-hit source begins in 2022 and requires four prior team games. All 2,174 historical rows have a matching closing total and spread. The 2026 overlay uses **32 Week 2 offense rows** / 16 games, each with the ESPN snapshot explicitly marked through Week 1. The full `game_level.csv` also preserves the 32 Week 1 rows, but the ESPN Week 1 prior-season rating is excluded from the live overlay.

## Method and leakage checks

One row is the **offense** in one game; the named `opponent` is its defense. The reused Phase 2 edge is

`(z(defense prior-eight QB hits generated / opponent dropbacks) + z(offense prior-eight QB hits allowed / own dropbacks)) / sqrt(2)`.

Higher means a worse projected hit matchup for that offense. Each component requires four prior games. League standardization and `edge_prior_percentile` use only earlier completed games. The raw component rates are retained, allowing comparison with defensive rush alone and offensive weakness alone. This hit-based proxy does **not** isolate blockers from QB behavior or equal ESPN PRWR/PBWR. Phase 2 found Pearson 0.162 and Spearman 0.220 between the actual historical rolling proxy and ESPN rank edge over 32 Week 2 2026 overlaps. No ESPN rank-equivalent thresholds are invented for history.

Historical pregame passing baseline is prior-eight team passing EPA divided by prior-eight pass plays, with at least four prior games, using the retained 2021–2026 EPA cache in chronological season/week order. The target game is excluded. `pass_epa_vs_prior8` is an **outcome-minus-pregame-baseline** diagnostic, not a pregame predictor. Last-game pass rate is a crude pregame pass-volume control. Actual dropbacks are used only as an outcome denominator, never a predictor.

The settled-line proxy uses team spread **negative for the favorite**. Thus `(closing total − team spread)/2` gives the team's implied points and `actual points − implied points` gives team-total margin. This is **below implied scoring expectation**, not a graded sportsbook team-total bet. For 2022 Week 5 IND at DEN, total 42 and DEN −3.5 imply DEN 22.75 and IND 19.25; actual 9–12 gives margins −13.75 and −7.25. For NYG at GB, total 42 and GB −8.5 imply GB 25.25 and NYG 16.75; actual 22–27 gives margins −3.25 and +10.25. These examples also validate score/spread orientation. Market source lines lack an immutable pre-kickoff capture timestamp, so they are treated as **untimestamped settled-line proxies**, with that point-in-time limitation made explicit.

Fixed, unoptimized thresholds: pregame prior-distribution top 50/25/20/10 percent and edge z >=0.5/1.0/1.5. The `edge z >=1` comparison is reported against all lower values, with a 1,000-draw **game-cluster bootstrap** 95% interval; opposite team rows remain grouped. Continuous models use game-cluster robust sandwich errors and normal-approximation intervals/p-values. They control for team spread/home and, where specified, last-game pass rate, prior-eight offensive pass EPA or closing total. Many related outcomes and cuts are tested; isolated significant cells should be treated as exploratory.

## 2022–2023 exploratory and 2024–2025 held-out results

| Window | N | Edge z >=1 N | Sack rate, edge vs all | Pass EPA/DB, edge vs all | Success, edge vs all | Team-total margin, edge vs all |
| --- | ---: | ---: | --- | --- | --- | --- |
| 2022–2023 exploratory | 958 | 143 | 7.82% vs 6.42% | −0.011 vs +0.032 | 43.6% vs 45.6% | +0.36 vs +0.16 pts |
| 2024–2025 held out | 1,088 | 161 | 7.86% vs 6.17% | −0.010 vs +0.078 | 43.6% vs 46.6% | +0.60 vs +0.66 pts |
| 2022–2025 full | 2,046 | 304 | 7.84% vs 6.29% | −0.010 vs +0.056 | 43.6% vs 46.1% | +0.48 vs +0.42 pts |

The table's “all” column includes the edge group, so the cleaner **edge >=1 versus edge <1** game-cluster difference is:

| Outcome | Exploratory difference, 95% CI | Held-out difference, 95% CI |
| --- | --- | --- |
| Sack rate | +1.65 percentage points [+0.74,+2.55] | +1.98 points [+1.06,+2.90] |
| Passing EPA/dropback | −0.050 [−0.099,+0.002] | −0.102 [−0.149,−0.055] |
| Passing success rate | −2.32 points [−3.94,−0.52] | −3.42 points [−5.12,−1.84] |
| Actual team points | −2.10 [−3.61,−0.41] | −2.15 [−3.93,−0.49] |
| Points vs implied | +0.23 [−1.20,+1.79] | −0.07 [−1.60,+1.48] |
| ATS margin, secondary | −0.28 [−2.62,+2.04] | −0.40 [−2.48,+1.81] |

The z threshold exhibits a generally higher sack rate and lower EPA/success as mismatch increases, but the disjoint bands are **not perfectly monotonic**. In the full sample, the z bands `<−0.5`, `−0.5–0`, `0–0.5`, `0.5–1`, `1–1.5`, `>=1.5` have sack rates **5.2%, 5.9%, 6.7%, 7.0%, 7.5%, 8.2%**. Passing EPA/DB is **+0.116, +0.087, +0.026, −0.004, +0.013, −0.035**. The `1–1.5` EPA reversal is a caution against a strict dose-response claim.

For interceptions, the held-out top prior-decile edge group averaged **0.84 per game** versus **0.70 overall**; the full-sample fixed z >=1 group averaged **0.74**, almost identical to **0.74 overall**. No robust turnover relationship is established. Actual points decline in high-edge groups, but implied points also fall. In held-out data, z >=1 offenses finished below implied points in **48.4%** of games versus **47.1% overall**; their average team-total margin was **+0.60**, not suppressed. Full-sample frequencies for z >=1 were **49.0% below implied**, **36.8% at least 3 points below**, and **19.4% at least 7 below**. These do not improve on the full-sample base rates **49.5%, 37.8%, 21.0%**. The market appears to absorb much of the raw scoring difference, though this observational audit cannot establish why.

### Continuous models and game-script controls

All coefficients below are for +1 edge z, with listed pregame controls; 95% intervals are clustered by game. In held-out 2024–2025:

| Outcome | Controls | Coefficient [95% CI] | Approx. p |
| --- | --- | --- | ---: |
| Sack rate | team spread, home, previous-game pass rate | +0.00754 [+0.00462,+0.01046] | <0.001 |
| Passing EPA/dropback | team spread, home, prior-eight pass EPA/DB | −0.0222 [−0.0394,−0.0050] | 0.011 |
| Passing success rate | same passing controls | −0.00502 [−0.01074,+0.00070] | 0.086 |
| Team-total margin | spread, closing total, home | −0.094 [−0.643,+0.455] points | 0.738 |

Exploratory 2022–2023 signs are the same: controlled sack-rate **+0.00896** [0.00574,0.01218], passing EPA/DB **−0.0235** [−0.0430,−0.0040], success **−0.00606** [−0.01261,+0.00049], and team-total margin **−0.326** [−0.979,+0.327]. This is evidence for disruption and reduced efficiency, with less certain controlled success, and no evidence of scoring below market expectation.

Held-out z >=1 subsets contain 61 favorites, 100 underdogs, 81 home, 80 away, 57 games with absolute spread <=3, 52 at 3.5–6.5 and 52 at >=7. Underdogs have more sacks than favorites (**8.24% vs 7.22%**), and >=7-point games have **9.84%** sack rate, consistent with possible game-script exposure. The edge-sack coefficient remains positive after spread, home and prior-game pass-rate controls. These strata are small and do not establish a game-state-independent causal effect. First-half, neutral-script, early-down and first-three-quarter history cannot be tested from the retained files. `game_script_analysis.csv` preserves all fixed strata.

## Does the matchup add beyond one component?

Models were fitted on **2022–2023 only** and scored unchanged on 2024–2025. All are simple unadjusted linear fits to permit a like-for-like component comparison. The A edge is the Phase 2 standardized combined score; B is defense prior hit rate; C is offense prior hits allowed; D fits both raw rates, with or without their product. Held-out RMSE:

| Outcome | A: edge | B: defense | C: offense weakness | D: both rates | D: rates + product |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sack rate | 0.04509 | 0.04565 | **0.04466** | 0.04470 | 0.04481 |
| Pass EPA/DB | 0.30417 | 0.30734 | 0.30330 | **0.30253** | 0.30257 |
| Pass success | 0.09766 | 0.09816 | 0.09771 | **0.09724** | 0.09724 |
| Team-total margin | **8.937** | 8.949 | 8.945 | 8.953 | 8.952 |

The matchup score is more informative than **defense hit rate alone** for the three direct outcomes, but offense hits allowed alone is as good or better for sacks and close for passing EPA. The two-component fit improves EPA/success RMSE only slightly; adding a multiplicative interaction does not help. For team-total margin all fits are almost indistinguishable from a constant prediction. This comparison does **not** demonstrate meaningful predictive superiority over the simpler offensive component.

## 2026 Week 2 ESPN overlay

The 32-row `overlay_2026.csv` includes every offense facing a Week 1 ESPN defense, with the Phase 2 historical proxy alongside the ESPN rank edge. Below are all **seven** defense-side ESPN PRWR versus opponent PBWR rank gaps >=10, shown from the *offense's* perspective. The ATS result is the offense's ATS result; the defense has the opposite result. This is qualitative live evidence from seven observations.

| Defense → offense | ESPN edge | Sacks / rate | Offense EPA/DB | Success | INT | Points / implied | Margin vs implied | Offense ATS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| NYJ → GB | +29 | 3 / 7.9% | +0.055 | 29.7% | 0 | 20 / 24.0 | −4.0 | L |
| IND → KC | +19 | 2 / 3.8% | +0.251 | 53.8% | 0 | 33 / 26.25 | +6.75 | L |
| MIN → CHI | +17 | 4 / 9.1% | −0.025 | 34.9% | 1 | 3 / 25.5 | −22.5 | L |
| SEA → ARI | +14 | 2 / 5.9% | −0.224 | 32.4% | 1 | 7 / 18.5 | −11.5 | L |
| LV → LAC | +13 | 3 / 8.8% | −0.069 | 35.3% | 2 | 14 / 25.0 | −11.0 | L |
| PHI → TEN | +12 | 2 / 8.0% | +0.037 | 36.0% | 0 | 20 / 16.25 | +3.75 | W |
| ARI → SEA | +11 | 1 / 3.4% | +0.598 | 53.6% | 0 | 31 / 22.0 | +9.0 | W |

Four offenses scored below implied points; three scored above. Five offenses failed ATS, but KC lost ATS while scoring well above implied. ARI → SEA is a clear counterexample to universal disruption. The sample is too small for inference or threshold selection.

## Limitations and candidate signals

This is association, not causal pass-rush attribution. Opposing team-game rows are dependent, and game-cluster uncertainty is used. The pregame proxy blends defense, blockers, QB, scheme and opponent quality; prior hits allowed are especially entangled with QB play. There is no pressure rate or QB-specific under-pressure split to trace the entire proposed causal chain. Market lines are untimestamped settled-line proxies. Actual team points can include non-offensive scores. Previous-game pass rate is a noisy expected-volume proxy. Multiple thresholds, outcomes and strata raise data-mining risk; the held-out split protects the primary specification but is not a prospective 2026 validation of the historical proxy. The 2026 ESPN overlay is one week.

| Candidate | Assessment |
| --- | --- |
| Pass Rush Disruption Risk | **Warrants forward tracking**: sacks increase in both windows, controlled estimates exclude zero, but offense hits allowed alone is similarly useful. |
| Passing Suppression | **Warrants forward tracking**: lower EPA/DB and success appear in both windows; additional predictive lift over simple components is small. |
| Team Total Suppression | **No clear relationship**: team-total margin and below-implied hit rates do not validate. |
| Early Disruption | **Untestable locally**: historical first-half/neutral-script fields are unavailable. |

**No Phase 3 signal is ready for JKB implementation.** A prospective snapshot with true pressure rate, offensive protection measures separated from QB behavior, and timestamped market lines would be needed to test a stronger mechanism and practical utility.
