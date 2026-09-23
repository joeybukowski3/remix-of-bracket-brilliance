# NFL trench advantage research audit (2026 Weeks 1–2)

Research only. No JKB rating, model, pick, feature, market integration, or UI was changed. Rebuild with `node scripts/research/nfl-trench-advantage-study.mjs`; validation is `node --test scripts/research/nfl-trench-advantage-study.test.mjs`. Machine-readable outputs are in `data/nfl/research/trench-advantage/`.

## Data audit

| Question | Repository evidence and decision |
| --- | --- |
| Trench source | `scripts/generate-nfl-espn-trench-metrics.mjs` ingests ESPN Analytics/NFL Next Gen Stats team tables; `public/data/nfl/matchup-trench-metrics.json` is the retained artifact. `docs/DATA_SOURCES.md` and `src/lib/nfl/trenchMetricsData.ts` describe the season-to-date contract. |
| Values and ranks | All four metrics (PBWR, RBWR, PRWR, RSWR) retain ESPN's published whole-number `valuePct` and official `espnRank` for all 32 teams. Ranks are not reconstructed from rounded percentages. Rank 1 is best. |
| Snapshots | The artifact has **one** 2025 final snapshot (through Week 18, last modified 2026-01-06) and **one** 2026 snapshot (through Week 1, last modified 2026-09-15). There is no weekly snapshot series in the repository. Its generated timestamp is 2026-09-19, after the first Week 2 game; the ESPN source's explicit through-week and last-modified markers are the point-in-time evidence, with residual source-metadata uncertainty. |
| Valid game windows | The 2025 final ratings are available before 2026 Week 1 and are used **only** as a prior-season signal. The 2026 through-Week-1 ratings are available before every 2026 Week 2 kickoff and are used **only** for Week 2. No 2026 rating is assigned to a Week 1 game. No 2025 game is assigned its 2025 final rating. |
| Scores and identity | `public/data/nfl/2026/results.json` has 16 final regular-season games in each of Weeks 1 and 2. `public/data/nfl/2026/games.json` supplies kickoff and venue. Game IDs and team abbreviations match all 32 results, schedule, market, and ESPN team records; no alias repair was needed. |
| Market | `public/data/nfl/matchup-market.json` has a line and total for all 32 completed games. It derives from nflverse/nfldata `games.csv`: one unnamed, untimestamped **settled historical market line** per game. Its home `spread` is conventional: negative for a home favorite. It is a closing-line **proxy**, not an independently verified closing price or timestamp-valid sportsbook quote. |
| Existing ATS | `data/nfl/research/situational-trend-team-games-v1.jsonl` computes team-relative ATS for 2011–2025. `matchup-market.json` computes team ATS summaries. Neither supplies a valid weekly trench history. This study grades 2026 team-games directly from final scores and the settled line. |
| Supporting outcomes | `data/nfl/nflverse/performance-team-game/performance_team_game_2026.csv` provides game-level pass/rush EPA, success numerators/denominators, explosive-play counts, sacks, and dropbacks; 64/64 team rows joined. `stats-team-week-current/stats_team_week_2026.csv` provides rushing yards/carries, interceptions and fumbles; yards/carry is defined for 60/64 rows. `play-volume-team-game/play_volume_team_game_2026.csv` supplies Week 1 pass rate/PROE for a Week 2 pregame interaction (32/32 Week 2 rows). Market spread and total yield implied team totals (64/64). A true pressure rate and a separately defined QB EPA/dropback series are not retained here. |

Historical result: **zero valid 2021–2025 game observations** for these ESPN trench metrics. The 2025 final table cannot be moved backward into 2025 games. The preferred 2021–2025, 2023–2025, and full historical windows therefore cannot be tested. Nor can seasons be pooled until comparable pregame snapshots and methodology provenance exist.

## Methodology

One row represents one team/game; both teams are retained. A positive rank gap favors the named team:

| Signal | Formula |
| --- | --- |
| Defensive pass rush | opponent PBWR rank − team PRWR rank |
| Offensive pass protection | opponent PRWR rank − team PBWR rank |
| Offensive run blocking | opponent RSWR rank − team RBWR rank |
| Defensive run stop | opponent RBWR rank − team RSWR rank |

ATS margin is `team points − opponent points + team spread`; positive is a cover. SU is based on points alone. Favorite has a negative team spread; underdog positive; pick'em zero. The 0–3, 3.5–6.5, and 7+ spread bands use absolute line size. Neutral games remain in overall results but are not labeled home or away. ATS cover percentage excludes pushes. Raw ESPN percentages are preserved; the script also compares within-metric empirical midrank percentiles of the published rounded values, with ties retained. A four-matchup count uses strictly positive edges; the magnitude-aware composite sums all four rank gaps. The pass composite sums pass-rush and pass-protection gaps.

The output includes all requested edge buckets (`<=0`, `1–4`, `5–9`, `10–14`, `15–19`, `20+`), nested 5+/10+/15+/20+ thresholds, elite-vs-poor 5/8/10/12 rank interactions, 0–4 trench wins, pass-composite definitions, and favorite/underdog, size, and venue splits. The 2025-to-2026 and 2026 in-season cohorts stay separate. The sole pass-volume interaction uses the disadvantaged offense's **Week 1** pass rate for its Week 2 game. Same-game pass rate is an outcome and never used as a pregame qualifier.

Pearson and tie-aware Spearman correlations cover ATS and scoring margins. OLS reports ATS points per one rank of edge, unadjusted and adjusted for the team spread plus home indicator. The intervals for OLS slopes and 10+ vs below-10 mean ATS differences are percentile intervals from 1,500 deterministic **game-cluster** bootstrap resamples; both team rows of each sampled game move together. Wilson 95% cover intervals exclude pushes but do not correct for opposite team rows in the full sample. These are exploratory descriptions, not validated predictive models. No p-value or significance claim is made from the tiny, dependent sample.

## 2026 findings

There are **32 completed games, 64 team observations, Weeks 1–2**. The primary same-season analysis is **Week 2: 16 games, 32 team observations**. Week 1 has 16 games/32 rows under an explicitly separate prior-season baseline. All completed games joined ratings, outcomes, and settled market lines. Week 3 had no final results in these source artifacts at research time. There are no missing Week 1 or Week 2 games. All findings are descriptive only.

### Week 2 major defensive pass-rush mismatches

`passRushEdge >= 10`, sorted by edge. The line is the team-relative settled-line proxy.

| Week | Team | Opp | PRWR rank | Opp PBWR rank | Edge | Line | Score | ATS | ATS margin | SU |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- | --- | ---: | --- |
| 2 | NYJ | GB | 3 | 32 | +29 | +3.5 | 17–20 | W | +0.5 | L |
| 2 | IND | KC | 5 | 24 | +19 | +6 | 30–33 | W | +3 | L |
| 2 | MIN | CHI | 1 | 18 | +17 | +4.5 | 9–3 | W | +10.5 | W |
| 2 | SEA | ARI | 17 | 31 | +14 | −3.5 | 31–7 | W | +20.5 | W |
| 2 | LV | LAC | 14 | 27 | +13 | +6.5 | 26–14 | W | +18.5 | W |
| 2 | PHI | TEN | 18 | 30 | +12 | −7 | 24–20 | L | −3 | W |
| 2 | ARI | SEA | 6 | 17 | +11 | +3.5 | 7–31 | L | −20.5 | L |

The full audit also appears in `major_pass_rush_2026.csv`. All 32 Week 2 team-games, including smaller and negative edges, are in `team_games.csv`.

## Pass rush vs pass blocking

| Window / group | N | ATS | Cover | Mean ATS margin | SU | Mean opponent pass EPA/play | Defense sack rate |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| Week 2, edge >=10 | 7 | 5–2–0 | 71.4% | +4.21 | 57.1% | +0.089 | 6.7% |
| Week 2, edge <=0 | 18 | 9–9–0 | 50.0% | +1.19 | 50.0% | +0.098 | 5.9% |
| Week 2, edge >=15 | 3 | 3–0–0 | 100% | +4.67 | 33.3% | +0.094 | 6.9% |
| Week 1, prior-season edge >=10 | 6 | 3–3–0 | 50.0% | −0.08 | 50.0% | +0.036 | 5.6% |

The Week 2 10+ cover interval is **35.9%–91.8%** (Wilson 95%). Its mean ATS margin exceeds the below-10 group by **5.39 points**, but the game-cluster bootstrap 95% interval is **−0.71 to +13.99**. It includes zero. Larger gaps do not show convincing monotonic behavior: the lone 20+ game covered by only half a point and lost outright. The top-5 PRWR vs bottom-5 PBWR interaction has only one Week 2 observation. The 10/10 interaction has two, both covers, with only +1.75 average ATS margin. In Week 1, the 12/12 interaction was 0–2; narrower definitions had zero observations.

The raw-percentage empirical-percentile counterpart to a 10-rank gap (at least 10/31 of the league distribution) selected the same seven Week 2 observations and went 5–2 ATS. This is a sensitivity check on rounded published percentages, not independent replication.

Across all Week 2 team observations, the pass-rush edge has Pearson **r=0.013** and Spearman **rho=0.018** with ATS margin; Pearson **r=0.018** and Spearman **rho=0.079** with scoring margin. The unadjusted ATS slope is **+0.015 points/rank** (game-cluster bootstrap 95% **−0.401 to +0.336**). With spread and home controls it is **+0.026 points/rank** (**−0.403 to +0.374**). A version using empirical percentiles of raw published percentages gives ATS Pearson **r=0.008**. None supports a stable continuous relationship. The earlier prior-season Week 1 cohort is similarly near zero (ATS Pearson 0.020; adjusted slope +0.020, interval −0.550 to +0.420).

The mechanism is weak in this sample: opponent passing EPA/play was only slightly lower and sack rate slightly higher in the 10+ group than in the no-advantage group. Opponent pass success, explosive pass rate, points, and turnover proxy are retained per game for further inspection. Pressure rate is unavailable.

## Other trench findings

| Week 2 definition | N | ATS | Cover | Mean ATS margin | SU |
| --- | ---: | --- | ---: | ---: | ---: |
| Pass protection edge >=10 | 7 | 3–4–0 | 42.9% | −3.79 | 42.9% |
| Run block edge >=10 | 10 | 4–6–0 | 40.0% | −1.05 | 50.0% |
| Run stop edge >=10 | 9 | 4–5–0 | 44.4% | +1.22 | 55.6% |
| Win 3+ of 4 trench matchups | 7 | 3–4–0 | 42.9% | −1.93 | 57.1% |
| Win all 4 | 2 | 1–1–0 | 50.0% | −1.25 | 50.0% |
| Both pass matchups positive | 4 | 2–2–0 | 50.0% | −5.38 | 50.0% |
| Top quartile pass-gap composite | 9 | 6–3–0 | 66.7% | +0.83 | 55.6% |

The pass-composite quartile result has a tiny average ATS margin and is sensitive to the definition. Both edges >=10 had **zero** Week 2 observations; one edge >=15 with the other positive had **two**, both covers. The run-block 20+ group went 2–0, but consists of only two games. All four continuous edge correlations and supporting offensive/rushing outcomes are in `analysis.json` and `team_games.csv`; no coherent, well-sampled relationship emerges.

## Market interaction findings

For the seven Week 2 pass-rush 10+ teams: underdogs were **4–1 ATS**, mean ATS margin **+2.4**; favorites **1–1**, mean **+8.75**. Road teams were **4–1**, mean **+9.9**; home teams **1–1**, mean **−10.0**. Every underdog was +3.5 to +6.5; the one favorite at −3.5 to −6.5 covered and the one at −7 or more did not. There were no short favorites, small underdogs, or 7+ underdogs in this group. These overlapping cells range from one to five observations and must not be optimized into a betting rule.

The Week 2 disadvantaged offense's Week 1 pass rate is available as a pregame proxy. Among pass-rush 10+ teams whose opponent's prior pass rate was at or above the Week 2 cohort median, **three** qualified and went **2–1 ATS**. One prior game is inadequate to estimate future pass volume, so this is only a feasibility check. Week 1 has no same-season prior pass-rate input.

## Statistical significance and uncertainty

No result meets a defensible statistical-significance or practical-betting-significance standard. Week 2 pass-rush 10+ looks favorable as a **descriptive threshold**, but its cover interval is wide, the ATS mean-difference interval includes zero, continuous correlations are effectively zero, and the adjusted slope's interval spans both signs. The earlier prior-season cohort does not reproduce the threshold result. The two rows per game are dependent and opposite ATS outcomes; 32 team rows represent only 16 games. Testing four matchup types, many thresholds, interactions and splits creates substantial data-mining risk. A 3–0 or 2–0 cell is not persuasive evidence. No price-adjusted ROI or validated predictive accuracy can be calculated from the untimestamped settled-line proxy.

## Limitations

1. No historical weekly ESPN snapshots exist in the repository. A 2021–2025 backtest, seasonal consistency test, and broader confidence estimate are unavailable without archived pregame source data; no historical values were fabricated.
2. The 2026 Week 2 ESPN data was fetched into the artifact after the first game, although ESPN labels it through Week 1 and last modified before every Week 2 kickoff. The analysis trusts those source freshness markers. If ESPN changes underlying tables without updating them, the repository cannot detect it.
3. The settled nflverse line has no book, row timestamp, price, opening line or independently verified close. ATS results are descriptive grades against that line; they do not establish executable betting performance.
4. Whole-number ESPN percentages create ties; official ranks use finer unpublished precision. Raw-percentile sensitivity is coarse.
5. Performance outcomes are same-game explanatory variables, not pregame inputs. Passing EPA/play is not identical to a verified QB EPA/dropback metric. The turnover proxy uses interceptions plus lost fumbles per offensive play, not pressure-attributable turnovers.
6. Week 1's prior-season rating is a different, stale feature from Week 2's one-game in-season rating. They are deliberately not pooled.

## Candidate JKB signals

- **Defensive PRWR vs opponent PBWR, edge >=10:** promising but small Week 2 descriptive subgroup; **warrants forward tracking**, not promotion. Track archived weekly snapshots before kickoff and timestamped lines.
- **Continuous pass-rush edge:** **no clear ATS or SU relationship** in the available sample.
- **Other individual trench gaps and four-matchup/pass composites:** **no clear relationship**; isolated positive cells are tiny and definition-sensitive.
- **Pass-volume interaction:** **warrants data collection**, but the current three-game high-pass-rate subgroup is not evidence of an edge.

## Top findings

| Signal | Sample | ATS | ATS % | Avg ATS margin | SU % | Historical consistency | Confidence / caveat |
| --- | ---: | --- | ---: | ---: | ---: | --- | --- |
| 2026 Week 2 pass rush >=10 | 7 | 5–2–0 | 71.4% | +4.21 | 57.1% | No valid historical weekly data; prior-season Week 1 was 3–3 | Small, wide interval; exploratory |
| 2026 Week 2 pass rush >=15 | 3 | 3–0–0 | 100% | +4.67 | 33.3% | Unavailable | Very small; all-team continuous trend near zero |
| 2026 Week 2 pass protection >=10 | 7 | 3–4–0 | 42.9% | −3.79 | 42.9% | Unavailable | No clear relationship |
| 2026 Week 2 run block >=10 | 10 | 4–6–0 | 40.0% | −1.05 | 50.0% | Unavailable | No clear relationship |
| 2026 Week 2 all four edges positive | 2 | 1–1–0 | 50.0% | −1.25 | 50.0% | Unavailable | Too small |
