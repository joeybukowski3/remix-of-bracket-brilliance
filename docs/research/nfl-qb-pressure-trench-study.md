# QB sack susceptibility × pass-rush matchup: research Phase 2

Research only, as of the repository's 2026 Week 2 results. This extends the [Phase 1 trench audit](nfl-trench-advantage-study.md) without changing it or any JKB model, pick, feature, UI, or production artifact. Rebuild with `python -B scripts/research/nfl-qb-pressure-trench-study.py`. The output contract is `data/nfl/research/qb-pressure-trench/`.

## Conclusion

**The proposed ATS interaction is not supported.** The available historical proxy detects some football mechanism: larger pregame QB-hit mismatch is associated descriptively with poorer team passing EPA and more sacks. It does not validate a claim that QBs classed as more sack susceptible suffer a *larger incremental* matchup effect. The held-out 2024–2025 interaction estimates include zero for ATS margin, team passing EPA/dropback and sack rate. Adding the interaction to a 2022–2023 fitted model made no material improvement in 2024–2025 error. This is an audit of **QB sack susceptibility in high-hit matchups**, not a test of actual pressured-versus-clean-pocket EPA decline, because that split is not retained locally.

## Phase A — source and field audit

| Source | Available seasons and actual retained fields | Pressure limitation |
| --- | --- | --- |
| `data/nfl/nflverse/stats-player-week/` | 2022–2026 QB player ID, name, team, attempts, completions, yards, TD, INT, rushing; 2022 has no `game_id`, resolved by season/week/team against results. **2026 is Week 1 only.** | No QB pressures, sacks taken, hits taken, hurries, pocket time or pressure splits. |
| `data/nfl/nflverse/stats-team-week/` and `stats-team-week-current/` | 2022–2025 and 2026 Weeks 1–2: team sacks suffered, defensive QB hits, CPOE, passing yards, attempts, INT, sack fumbles and completion/explosive counts. | Team hits are an event count, not total pressures; sacks and hits are not assigned to a QB in this cache. |
| `data/nfl/nflverse/epa-team-game/` | 2020–2026: team pass EPA and pass plays/dropbacks. Used here for 2022–2026 denominators and team passing outcomes. | No QB-specific EPA or pressured/clean splits. |
| `data/nfl/nflverse/success-team-game/` | 2019–2025: team pass success and plays. The 2026 performance cache supplies team-game success numerators/denominators, but is not silently treated as identical to this historical source. | No QB or pressure split. |
| `data/nfl/nflverse/play-volume-team-game/` | 2022–2026: team pass plays, eligible plays and PROE. | No pressure tags; used only from previous completed games for pass-volume interaction. |
| `data/nfl/research/situational-trend-team-games-v1.jsonl` | 2011–2025 scores, team spreads, ATS/SU outcomes and kickoff. This study joins 2022–2025. | Market is one unnamed, untimestamped settled-line proxy. |
| Phase 1 research outputs | 2026 Weeks 1–2 scores/ATS and 2026 Week 2 ESPN PRWR/PBWR pregame edges. | ESPN has only 2025 final and 2026 through-Week-1 snapshots; no historical weekly PRWR/PBWR. |
| `data/nfl/predictions/2026/02/nfl-passing-direct-ridge.jsonl` | Three archived pregame Week 2 production QB snapshots per team; latest valid snapshot was before kickoff. | Identifies the **projected** QB, not actual Week 2 participation. |

The raw nflverse play-by-play used by existing JKB producers is streamed and discarded, as documented in `docs/nfl-play-by-play-audit.md`; it is not retained in this worktree. The [official nflfastR field descriptions](https://nflfastr.com/articles/field_descriptions) list a `qb_hit` indicator and QB IDs in the broader raw feed, but a hit is not a complete pressure tag and the local compact caches do not retain QB-hit play splits. A read-only attempt to reach the existing nflverse release endpoint was blocked by this environment's network restrictions (`WinError 10013`), so no raw feed or external PFR/NGS table was substituted. No PFR advanced passing cache or historical NGS pressure/pocket-time table is present. **Pressured dropbacks, clean-pocket dropbacks, pressure rate, hurries, blitzes, pocket time, pressure-to-sack rate, true pressured/clean EPA and success splits, QB-specific EPA/dropback and QB scramble rate are unavailable.** QB passing yards/attempt, completion percentage, interceptions and standard passer rating are available from player-week statistics; the latter is calculated from its official five input counts.

2021 cannot enter this QB interaction dataset: the retained weekly QB identity and team QB-hit caches begin in 2022. The target 2021–2025 window is therefore unavailable. The full valid historical window is **2022–2025**, with **2023–2025** reported separately.

## Phase B — QB vulnerability definition

The pregame expected QB is the prior game’s primary passer for the same team and season. Week 1 has no incumbent assignment. For 2026 Week 2, a later, immutable **pregame** passing-prediction snapshot supplies the QB ID and name; the latest valid timestamp precedes kickoff. The current game’s primary passer is an *outcome check only*. In the 1,773 eligible historical observations, the expected and actual primary passer matched in **1,586** and differed in **187**. The mismatches remain in ATS evaluation to avoid selecting games on postgame information.

QB history uses only **previous single-passer team games**: when exactly one QB recorded a pass attempt, that game’s team sacks and dropbacks are attributed approximately to that QB. Multi-QB games are excluded from training history. This is a defensible sack-susceptibility proxy, but sacks still depend on blockers, scheme, opponent and time to throw.

For each kickoff, a league regression is fitted using only preceding single-QB games:

`game sack rate = intercept + slope × game QB-hit rate allowed`

For an expected QB’s prior career-to-date single-QB history, the primary score is:

`QB vulnerability z = (prior QB sack rate − expected sack rate at his prior team-hit exposure) / prior league game-residual SD`

Higher is **more excess sack susceptibility after accounting for observed team-hit exposure**. It does **not** measure clean-pocket EPA minus pressured EPA or a causal QB trait. The primary gate is **100 prior dropbacks**. A 50-dropback gate is noisy, while 200 drops more newer QBs; 50/100/200 fixed-z sensitivity rows remain in `bucket_summaries.csv`. Career-to-date is selected before looking at ATS because it has more history than trailing 8 or 16. Both trailing alternatives are retained and modeled. Each score and its league fit uses only completed games before kickoff; simultaneous kickoffs are processed together.

League-relative percentile uses the currently known season incumbents with at least 100 prior dropbacks. Tiers are mutually exclusive: resilient <=25th percentile, average >25th to <75th, vulnerable 75th to <90th, highly vulnerable >=90th. Continuous z remains in every row.

An exploratory secondary measure compares **prior single-QB team-game pass EPA/dropback** in high-hit versus low-hit games, using the league hit-rate median known before kickoff and at least three games/50 dropbacks per side. It is a game-environment split, **not** a pressured-versus-clean-pocket play split. Its historical ATS interaction interval also includes zero (n=1,352; coefficient −2.82, 95% CI −8.19 to +2.55).

### QB-level audit and stability

`qb_audit.csv` lists 66 QBs with >=200 dropbacks at their last qualifying **pregame** observation through 2025, sorted without hand selection. Examples from each end:

| Higher excess sack susceptibility | Prior DB | z | Lower excess sack susceptibility | Prior DB | z |
| --- | ---: | ---: | --- | ---: | ---: |
| Bailey Zappe | 238 | +0.629 | Joshua Dobbs | 480 | −0.906 |
| Jayden Daniels | 784 | +0.550 | Taylor Heinicke | 355 | −0.570 |
| Justin Fields | 1,245 | +0.460 | Kirk Cousins | 1,601 | −0.552 |
| Dillon Gabriel | 211 | +0.427 | Patrick Mahomes | 2,646 | −0.516 |
| Jalen Hurts | 2,007 | +0.427 | Jared Goff | 2,414 | −0.500 |

First-half versus second-half **excess sack-rate** correlation is **0.423** over 122 QB-seasons with >=50 dropbacks in both halves. Full Year N versus Year N+1 is **0.335** over 103 pairs. These use a common retrospective regression solely for the stability diagnostic, never as a pregame feature. Raw sack-rate correlations are 0.441 and 0.269. Career vs trailing-8 vulnerability correlation is 0.883; trailing-8 vs trailing-16 is 0.917, partly mechanically high because the windows overlap. The year-to-year result shows only modest persistence, so QB tiers should not be treated as fixed traits.

## Phase C — pregame trench proxy and ESPN comparison

The defensive component is **QB hits generated / opponent dropbacks** over the defense’s previous eight games. The offensive component is **QB hits allowed / own dropbacks** over the offense’s previous eight. Each needs at least four prior games. At kickoff, each rate is standardized against the league’s then-known distribution of team trailing-eight rates:

`edge z = (defense generated-hit-rate z + offense allowed-hit-rate z) / sqrt(2)`

Higher means a more adverse hit environment for the named **offense**. The offense/defense histories and league reference never include the target game or games at the same kickoff. The offensive component is closer to protection than sack rate but still reflects QB behavior and scheme. The defensive component is a hit rate, not ESPN PRWR. This formula was fixed for interpretation, not tuned for ATS. Prior-edge percentiles used for top quartile/20%/10% reference **only earlier games**, avoiding a week-end distribution look-ahead.

Across 32 Week 2 2026 team-side observations, **Week-1-only** hit-edge versus ESPN rank-edge Pearson is **0.474**, Spearman **0.447**. That is some overlap, with only one game of hit data. The actual trailing-eight research proxy versus ESPN edge is much weaker: Pearson **0.162**, Spearman **0.220**. It disagrees sharply on NYJ rush vs GB protection (ESPN +29, proxy −0.52), ARI vs SEA (ESPN +11, proxy −1.58), and LAR vs NYG (ESPN −24, proxy +1.39). The [machine-readable validation](../../data/nfl/research/qb-pressure-trench/espn_proxy_validation_2026.csv) contains every team-side pair. **This proxy is not a calibrated historical replacement for ESPN PRWR/PBWR.** No 10+/15+/20+ ESPN rank-gap equivalents are asserted.

## Phase D — historical interaction groups

The primary historical sample has **1,773 eligible offense team-games / 967 distinct games** in 2022–2025; 2023–2025 has **1,434 / 766**. Explore/train is 2022–2023 (**804 observations**); held-out validation is 2024–2025 (**969**). A game can contribute one or two offense rows, so game-cluster uncertainty is used in regression. Scores and ATS use the repository’s team-relative settled-line proxy. QB passing EPA and sack rates below are **team dropback outcomes**, not verified individual QB outcomes.

| Historical 2022–2025 coverage step | Team-game rows |
| --- | ---: |
| Completed games with market/outcome/team source join | 2,174 |
| Pregame incumbent QB identified | 2,046 |
| At least 50 / 100 / 200 prior dropbacks | 1,914 / 1,802 / 1,591 |
| Pregame team hit edge available | 2,046 |
| Pregame league-relative QB percentile available | 1,892 |
| Primary joint 100-dropback + percentile + hit-edge sample | 1,773 |

| Group, 2022–2025 | N | ATS W-L-P | Cover | Mean ATS margin | SU W-L | Mean team pass EPA/DB | Sack rate |
| --- | ---: | --- | ---: | ---: | --- | ---: | ---: |
| All eligible | 1,773 | 867-862-44 | 50.1% | +0.06 | 903-866 | +0.067 | 6.2% |
| Hit-edge z >=1, any QB | 258 | 123-128-7 | 49.0% | −0.70 | 107-149 | −0.013 | 8.0% |
| Vulnerable/highly vulnerable + edge >=1 | 50 | 26-22-2 | 54.2% | +0.50 | 20-30 | −0.035 | 8.7% |
| Resilient + same edge | 80 | 33-43-4 | 43.4% | −1.24 | 36-43 | +0.017 | 8.4% |
| Vulnerable/highly vulnerable + neutral/favorable edge | 338 | 166-165-7 | 50.2% | +0.39 | 179-159 | +0.089 | 6.4% |

Four full-sample games ended tied SU; SU win percentages in the machine-readable summaries exclude ties.

The vulnerable-QB group has poorer SU and team passing outcomes under a strong hit mismatch, consistent with a plausible mechanism. Its ATS record is slightly favorable and average ATS margin nearly flat. The market may partly price the conditions, but this study cannot establish why. The 50-game subgroup also spans several definitions and seasons; its cover interval is in `bucket_summaries.csv`.

### Nonlinear held-out matrix: 2024–2025

Rows are QB pregame tiers; columns are offense-side hit-edge bins: favorable <=−0.5 z, neutral (−0.5,+0.5], moderate (+0.5,+1], large (+1,+1.5], extreme >+1.5. Cells with **N<25 are small**. EPA/DB and sack rate are team outcomes.

| QB tier | Matchup | N | ATS | Cover | Avg ATS | SU % | Pass EPA/DB | Sack % |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| Resilient | Favorable | 60 | 33-26-1 | 55.9% | +1.44 | 68.3% | +0.161 | 4.4% |
| Resilient | Neutral | 88 | 42-43-3 | 49.4% | +0.79 | 54.5% | +0.159 | 5.8% |
| Resilient | Moderate | 57 | 27-30-0 | 47.4% | −0.66 | 55.4% | +0.054 | 6.0% |
| Resilient | Large | 23 | 9-14-0 | 39.1% | −1.96 | 47.8% | +0.054 | 8.5% |
| Resilient | Extreme | 20 | 9-11-0 | 45.0% | −0.70 | 45.0% | −0.055 | 7.5% |
| Average | Favorable | 150 | 72-77-1 | 48.3% | −0.23 | 54.0% | +0.091 | 5.2% |
| Average | Neutral | 180 | 96-84-0 | 53.3% | +0.04 | 48.0% | +0.092 | 5.8% |
| Average | Moderate | 65 | 28-36-1 | 43.8% | −0.03 | 43.1% | +0.063 | 5.7% |
| Average | Large | 36 | 16-20-0 | 44.4% | −0.60 | 38.9% | −0.011 | 8.1% |
| Average | Extreme | 39 | 20-19-0 | 51.3% | −1.97 | 38.5% | −0.028 | 7.3% |
| Vulnerable | Favorable | 77 | 39-38-0 | 50.6% | +1.07 | 59.7% | +0.177 | 5.7% |
| Vulnerable | Neutral | 51 | 27-23-1 | 54.0% | +1.80 | 51.0% | +0.165 | 6.9% |
| Vulnerable | Moderate | 15 | 9-6-0 | 60.0% | −3.90 | 33.3% | −0.110 | 7.0% |
| Vulnerable | Large | 9 | 5-4-0 | 55.6% | +1.89 | 55.6% | +0.057 | 6.5% |
| Vulnerable | Extreme | 6 | 5-1-0 | 83.3% | +5.58 | 66.7% | −0.159 | 14.0% |
| Highly vulnerable | Favorable | 27 | 18-9-0 | 66.7% | +4.91 | 74.1% | +0.131 | 6.1% |
| Highly vulnerable | Neutral | 39 | 18-21-0 | 46.2% | −3.33 | 38.5% | +0.008 | 7.6% |
| Highly vulnerable | Moderate | 17 | 11-5-1 | 68.8% | +4.76 | 47.1% | +0.047 | 6.4% |
| Highly vulnerable | Large | 4 | 1-2-1 | 33.3% | −0.62 | 25.0% | −0.065 | 9.1% |
| Highly vulnerable | Extreme | 6 | 3-3-0 | 50.0% | −3.08 | 33.3% | −0.106 | 8.8% |

The dramatic 5–1 ATS cell has **six** games, poor passing EPA and a 14% sack rate. It is evidence of multiple-testing risk, not an ATS rule. The complete matrix, Wilson cover intervals, means for CPOE/success/yards/attempt/passer rating/interceptions/fumbles/hits, and all window variants are in `interaction_matrix.csv`.

### Season stability, market and pass volume

Vulnerable-QB plus edge z>=1 ATS by season: **2022 6-5**, **2023 6-7-1**, **2024 6-3-1**, **2025 8-7**; each season has only 10–15 observations. The effect is not monotonic or convincingly persistent. In held-out 2024–2025, the 25 vulnerable-plus-edge observations went **14-10-1**, +1.18 average ATS points; 43 resilient-plus-edge went **18-25**, −1.37. Despite that descriptive contrast, the continuous interaction estimate is uncertain and held-out predictive error does not improve.

Across 2022–2025, vulnerable-plus-edge **underdogs** went 17-17-2 ATS (n=36, −0.46 mean ATS margin); **favorites** 9-5 (n=14, +2.96). In 2024–2025 validation, underdogs were 9-7-1 (n=17) and favorites 5-3 (n=8). Venue and 0–3/3.5–6.5/7+ line bins are in `bucket_summaries.csv`; many have single-digit counts. Among vulnerable-plus-edge teams with above-median pregame *previous-game* pass rate, the validation group was **6-6 ATS (n=12)**. One game of pass rate/PROE is a weak expected-volume proxy; same-game volume is not used as a qualifier.

## Phase E — explicit interaction models and out-of-sample comparison

OLS uses continuous edge z, continuous QB vulnerability z and their product. ATS adds team spread and home indicator. Uncertainty uses game-cluster sandwich SE; p-values are two-sided normal approximations, exploratory and unadjusted for multiple testing. The primary coefficient is the product term. For an adverse offense matchup, the hypothesized direction would be **negative** for QB/team passing EPA and ATS margin, **positive** for sack rate.

| Sample / outcome | N | Interaction coefficient | 95% CI | p |
| --- | ---: | ---: | --- | ---: |
| 2022–2025 ATS margin | 1,773 | +0.565 points | −0.828 to +1.957 | 0.427 |
| 2024–2025 ATS margin | 969 | +1.364 points | −0.929 to +3.658 | 0.244 |
| 2024–2025 team pass EPA/DB | 969 | −0.0038 EPA | −0.0624 to +0.0548 | 0.898 |
| 2024–2025 team sack rate | 969 | −0.0015 | −0.0117 to +0.0088 | 0.781 |

None supports an interaction claim. Trailing-8 and trailing-16 ATS interaction intervals also include zero in both explore and validation windows; the high-hit EPA-drop alternative does too. Coefficients, all controls and uncertainty are in `analysis.json`.

Frozen 2022–2023 fits evaluated on 2024–2025 (969 team observations):

| Inputs | ATS margin MAE (points) | Team pass EPA/DB MAE | Team sack-rate MAE |
| --- | ---: | ---: | ---: |
| A: hit mismatch only | 9.678 | 0.23895 | 0.03542 |
| B: QB susceptibility only | 9.676 | 0.24304 | 0.03618 |
| A+B additive | 9.679 | 0.23883 | 0.03530 |
| C: A+B+interaction | 9.676 | 0.23889 | 0.03532 |

The interaction's tiny ATS MAE change is much smaller than a meaningful betting effect and its other errors are no better than the additive model. These are simple research regressions, not calibrated JKB predictions or sportsbook profitability tests.

## 2026 live overlay: the seven Phase 1 ESPN edges >=10

The QB below is the **latest archived pregame projected QB**, not a verified actual Week 2 QB; the retained player-week outcome cache has only Week 1. QB EPA/DB and sacks are the offense **team-game** outcomes. ESPN edge and ATS are from unchanged Phase 1 outputs.

| Defense vs offense | Pregame projected QB | QB tier | ESPN edge | Hit proxy z | Defense ATS | Offense pass EPA/DB | Offense sacks |
| --- | --- | --- | ---: | ---: | --- | ---: | ---: |
| NYJ vs GB | Jordan Love | Resilient | +29 | −0.52 | W (+0.5) | +0.055 | 3 |
| IND vs KC | Patrick Mahomes | Resilient | +19 | +0.07 | W (+3.0) | +0.251 | 2 |
| MIN vs CHI | Caleb Williams | Average | +17 | +0.83 | W (+10.5) | −0.025 | 4 |
| SEA vs ARI | Jacoby Brissett | Resilient | +14 | +0.76 | W (+20.5) | −0.224 | 2 |
| LV vs LAC | Justin Herbert | Resilient | +13 | +1.53 | W (+18.5) | −0.069 | 3 |
| PHI vs TEN | Cam Ward | Vulnerable | +12 | +0.08 | L (−3.0) | +0.037 | 2 |
| ARI vs SEA | Sam Darnold | Average | +11 | −1.58 | L (−20.5) | +0.598 | 1 |

The Sam Darnold pregame archive entry differs from Seattle's Week 1 incumbent, illustrating why carrying forward the previous passer alone can mislabel a live matchup. In the seven games, only one projected QB is in the vulnerable tier, and that defense **did not cover**. Several defenses covered against resilient QBs. This is a qualitative overlay, with no inference from seven games. The full CSV includes rank inputs, spreads, SU results, snapshot timestamp, interceptions when available, and missing actual-QB fields.

## Limitations and next research gate

The primary hypothesis requires a genuine QB pressured-dropback and clean-pocket sample to measure **decline beyond normal league pressure effects**. The retained data cannot establish that. The primary vulnerability score is an adjusted sack-rate proxy; the trench score is a hit-rate proxy with weak-to-moderate agreement against one available ESPN week. Team outcome EPA and sacks cannot be called QB-specific when multiple passers play. 187 historical eligible games used a different actual primary passer than the pregame incumbent; they are retained under the prospective assignment rule. 2026 actual passer identity is unavailable in the retained Week 2 player cache. Market lines have no named book, price or per-row close timestamp. Small nonlinear cells and many related thresholds make optimized subgroup claims unreliable.

**Candidate signal classification:** the adverse-hit matchup alone has a plausible football mechanism and deserves improved measurement. The QB-vulnerability interaction shows **no clear incremental ATS or predictive relationship**. Do not implement a JKB signal. The next credible test needs timestamped pregame QB availability, retained play-level QB hit/pressure flags and EPA with clean-pocket denominators, and archived weekly trench/market snapshots; any new data acquisition or methodology should be separately reviewed before promotion.

## Top findings

| Research definition | Sample | ATS | Cover | Avg ATS margin | SU % | Historical consistency / caveat |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| QB-hit edge z>=1, any QB, 2022–2025 | 258 | 123-128-7 | 49.0% | −0.70 | 41.8% | Plausible sack/EPA mechanism, no ATS edge |
| Vulnerable QB + edge z>=1, 2022–2025 | 50 | 26-22-2 | 54.2% | +0.50 | 40.0% | ATS direction/size not stable; QB tier is a proxy |
| Vulnerable QB + edge z>=1, 2024–2025 validation | 25 | 14-10-1 | 58.3% | +1.18 | 48.0% | Small; continuous interaction CI crosses zero |
| Vulnerable QB + neutral/favorable edge, 2022–2025 | 338 | 166-165-7 | 50.2% | +0.39 | 53.0% | Control: vulnerability alone is not an ATS rule |
