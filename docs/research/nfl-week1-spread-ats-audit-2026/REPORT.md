# JKB 2026 Week 1 spread + ATS audit

Audit only. Local evidence as of **2026-09-14T10:43:31.000Z**. Partial slate: **15/16** games have verified final outcomes. These are immutable forward-production predictions, not reconstructed postgame projections. No model or production projection artifact was changed; canonical scores and separate outcome events were completed.

## Week 1 Baseline — Do Not Recalibrate From This Sample

Frozen baseline as of **2026-09-14T10:43:31Z**: **15 finished games**. All forecast metrics below use **n=15** on the same completed games; later audits must preserve this baseline.

| Metric | JKB (n=15) | Last-observed pregame market (n=15) |
| --- | ---: | ---: |
| MAE | 12.16 | 10.83 |
| RMSE | 14.20 | 13.14 |
| Median absolute error | 13.20 | 11.00 |
| Mean signed error | +4.22 | +3.37 |

JKB closer: **5/15**; market closer: **10/15**. Mean JKB forecast improvement versus market: **−1.33 points/game (n=15)**. Directional ATS: **5-9-1 (n=15; decided n=14)**. Official/issued ATS record: **unavailable because issuance evidence does not exist**. Verified closing lines: **unavailable (0 canonical closes)**. Market snapshots were **2.85–10.45 hours before kickoff**; they are last-observed pregame observations, never verified closing lines.

JKB underperformed the available pregame market benchmark in Week 1. Large individual misses warrant monitoring of preseason priors and large OVR gaps. This sample is insufficient to change the **0.24 OVR coefficient, +2 HFA, Current OVR blending, preseason architecture or ATS logic**. Evaluate Weeks 2–4 using the same immutable-prekickoff methodology.

## Formula and architecture

Current model: `jkb-power-number-v1.0.0`; feature schema `nfl-current-rating-power-number-feature-v1`; archive pipeline `nfl-production-prediction-archive-v1`.

Exact unrounded formula: `home margin = 0.24 × (home Current OVR − away Current OVR) + HFA`. HFA is **2.0** at an ordinary home site and **0.0** at a neutral site. Power Number is `(Current OVR − mean of all 32 Current OVRs) × 0.24`; centering cancels in the matchup difference. Sportsbook presentation rounds to one decimal and assigns the negative line to the favored team. Error is `projection − (home score − away score)`; positive bias means overprojecting the home margin.

Production trace: [generator](../../../scripts/generate-nfl-matchup-projections.mts) reads preseason-power-ratings.json (v0.3.1 OFF/DEF anchors), projected-power-ratings-v04.json (preseason OVR anchor), team-performance-analytics.json (live performance) and games.json. [currentRating2026.ts](../../../src/lib/nfl/currentRating2026.ts) blends and clamps ratings to [1,99]; [jkbPowerNumber2026.ts](../../../src/lib/nfl/jkbPowerNumber2026.ts) builds the full 32-team Power Number board and game margin. The generator finalizes and validates the immutable archive before replacing matchup-projections.json. [projectionData.ts](../../../src/lib/nfl/projectionData.ts) consumes the public margin and compares it downstream to market; no market enters spread math. [outcome resolver](../../../scripts/lib/nfl-prediction-outcome-resolver.ts) appends separate outcomes; the existing evaluation materializer evaluates snapshots independently. This audit instead selects one final valid snapshot per game.

Current OVR = preseason weight × v0.4 preseason OVR + performance weight × live Performance Rating. Preseason/live weights by each team's own completed games: 0:100/0; 1:80/20; 2:60/40; 3:40/60; 4:25/75; 5:10/90; 6+:0/100 percent. Every included Week 1 snapshot has zero completed games and 100/0 weights. This audit therefore measures the preseason anchor plus fixed conversion/HFA, not the live blend.

The 0.24 coefficient and 2.0 HFA came from walk-forward Current-OVR calibration (reconstruction 2023–2025; out-of-sample 2024/2025, 544 games). The governing master spec reports historical production-HFA MAE 10.26/RMSE 13.14 versus market MAE 9.67 and model ATS 50.46% on 539 decided games. Historical research is a separate benchmark, never pooled with these forward rows. There is no new fitting, tuning, holdout claim or candidate promotion here.

## Population, selection and evidence

Source: [Week 1 prediction archive](../../../data/nfl/predictions/2026/01/jkb-power-number.jsonl). 185 snapshots; 185 eligible; 0 rejected. 16 selected games. Selection uses the latest valid production/projected timestamp **strictly before canonical kickoff**, bounded by audit cutoff; ambiguous equal final timestamps fail closed. Material-state idempotency means the final archived timestamp is not necessarily the final generator run. No regeneration occurs.

Outcomes use the highest available revision by prediction ID at cutoff, requiring a resolved/final event and matching canonical final schedule/result, teams and both scores. Source results generated at 2026-09-14T10:43:30.000Z contain 15 verified finals in this checkout. Missing finals remain excluded, regardless of real-world game completion. The free public-source data-completion step uses the canonical parser and append-only spread outcome resolver; this offline audit does not substitute current predictions or infer scores. All selected IDs, timestamps, revisions, feature/source-manifest hashes and whole-input SHA-256 hashes are in [audit.json](audit.json).

Market policy is one fixed book (**draftkings**), provider/game/team/kickoff matched, coherent home/away lines, verified semantic content hash, captured and provider update times strictly before kickoff/cutoff. Latest valid archived state is selected deterministically. Historical stores update observation metadata in place for unchanged prices; lastObservedAt/providerUpdatedAt do not prove immutable full capture history. True closing coverage is **not established**. No last-observed line is relabeled closing.

## Accuracy and market comparison

| Metric | JKB | Proven closing market | Last archived pre-kickoff market (not closing) |
| --- | --- | --- | --- |
| n | 15 | 0 | 15 |
| MAE | 12.161 | Unavailable | 10.833 |
| RMSE | 14.203 | Unavailable | 13.138 |
| Mean signed error | 4.217 | Unavailable | 3.367 |
| Median absolute error | 13.200 | Unavailable | 11.000 |

JKB-vs-closing-market closer %: **Unavailable**. Against last archived market on identical games: JKB closer 5/15 (33.333%); market closer 10; equal errors 0. This is a paired descriptive comparison on one partial week, not a persistent superiority conclusion.

## ATS qualifying picks and CLV

Issued qualifying recommendations ATS W-L-P: **Unavailable (0 established qualifying picks)**. Each game is **NO_PICK**, meaning no issued recommendation is established, not that a known threshold rejected it. Projection and comparison records do not establish issuance.

Verified production [nfl-sides-performance.ts](../../../scripts/lib/nfl-sides-performance.ts) uses `computeJkbAtsSide`: positive unrounded gap = home; negative = away; exactly zero = pick. **There is no minimum threshold, including no 2.5-point threshold.** `computeAtsResult` grades that directional side against the prediction-time line; NEUTRAL means no lean. The production [sides UI](../../../src/components/nfl/performance/NflPerformanceSidesTab.tsx) calls this **ATS Directional Hit Rate**. This audit calls those unchanged production functions and preserves the distinction from an issued recommendation.

Directional ATS **5-9-1 (n=15 completed games; decided n=14; no lean=0; missing=0)**, at the exact embedded draftkings prediction-time reference. Recommendation classification **NO_PICK 16/16**; 1 unfinished game has no outcome grade.

CLV: **Unavailable** because actual qualifying picks and proven closing observations are missing. Valid future CLV must compare the selected side's archived bet line against the same book's proven close: home CLV = bet home line − closing home line; away CLV uses away lines. Positive means a better number. No pseudo-CLV from stale last-observed lines is substituted. Prices and sample sizes must accompany any future ATS/ROI analysis.

## Edge buckets

Fixed descriptive absolute model-minus-prediction-market gap buckets, using only the immutable draftkings comparison reference available by prediction time. Buckets were not optimized. These are projection diagnostics; qualifying-pick ATS by bucket remains unavailable in every cell.

| Absolute gap (points) | n resolved | JKB MAE | Signed error | Directional ATS W-L-P |
| --- | --- | --- | --- | --- |
| missing | 0 | Unavailable | Unavailable | 0-0-0 |
| [0,1) | 4 | 8.953 | -5.983 | 3-0-1 |
| [1,3) | 6 | 17.055 | 12.655 | 1-5-0 |
| [3,5) | 3 | 6.077 | -1.571 | 0-3-0 |
| [5,infinity) | 2 | 13.024 | 7.984 | 1-1-0 |

## OVR-gap calibration

| Absolute OVR gap | n | Mean signed OVR gap | Mean projected margin | Mean actual margin | MAE |
| --- | --- | --- | --- | --- | --- |
| [0,10) | 8 | 2.137 | 2.513 | 1.625 | 10.328 |
| [10,20) | 3 | -2.983 | 1.284 | -5.000 | 10.967 |
| [20,infinity) | 4 | 26.350 | 7.824 | -1.500 | 16.724 |

Calibration slope/intercept and correlation remain withheld under the existing audit policy: one week cannot establish a stable OVR-to-score relationship. The large-gap neutral-site miss is a monitoring observation, not evidence to shrink 0.24. No full-slate calibration is claimed.

## Home-field diagnostics

| HFA | n | Mean projection | Mean actual home margin | Signed error | MAE |
| --- | --- | --- | --- | --- | --- |
| 0 | 1 | 6.216 | -20.000 | 26.216 | 26.216 |
| 2 | 14 | 3.503 | 0.857 | 2.645 | 11.157 |

The neutral-site classification is preserved from the archive and canonical schedule, including SF–LA. A designated home team at a neutral site does not receive HFA. Ordinary home has 14 resolved games and neutral has 1; no home-field estimate or per-team adjustment is defensible.

## Five largest projection misses

Only 5 verified finals exist; positions 3–5 are unavailable in this run.

| Game | Prediction UTC | Projected home margin | Actual home margin | Absolute miss | Last market margin | Market observation UTC | Hours before kickoff |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026_01_SF_LA | 2026-09-10T16:20:21.340Z | 6.216 | -20 | 26.216 | 3.500 | 2026-09-10T14:07:54.925Z | 10.451 |
| 2026_01_BAL_IND | 2026-09-13T16:11:31.542Z | 3.008 | -18 | 21.008 | -3.500 | 2026-09-13T14:09:02.629Z | 2.849 |
| 2026_01_CHI_CAR | 2026-09-13T16:11:31.542Z | -1.240 | -22 | 20.760 | -3.000 | 2026-09-13T14:09:02.629Z | 2.849 |
| 2026_01_ARI_LAC | 2026-09-13T16:11:31.542Z | 7.232 | -12 | 19.232 | 9.500 | 2026-09-13T14:09:02.629Z | 6.266 |
| 2026_01_NYJ_TEN | 2026-09-13T16:11:31.542Z | 3.272 | -13 | 16.272 | 1.500 | 2026-09-13T14:09:02.629Z | 2.849 |

SF–LA dominates the available error. Both JKB and market favored the designated home side, which lost by 20. Scores alone cannot identify injury, turnover, efficiency or coaching causes; this report does not manufacture a causal explanation.

## Data integrity and leakage

- Archive validator verifies schema, UTC timing, feature-payload hash and content-addressed prediction identity. Duplicate prediction IDs and ambiguous final timestamps are rejected. 0 rejected snapshots; 0 late market-reference diagnostics.

- Schedule joins use exact canonical game IDs, lowercase team identities, kickoff and neutral flag; no fuzzy matching. NFL raw ID aliases LA/WAS/JAX are retained in IDs while canonical teams use lar/wsh/jax.

- Every eligible Week 1 feature row has zero games played, zero live weight, unit preseason weight and rating equal to its preseason anchor; formula/HFA invariants pass. Target-game outcomes do not enter selection or projection.

- Source manifests are present and content-hash verified. They identify original source bytes; the mutable source bodies are not all stored under those hashes. This cannot prove original provider publication timing, v0.4 input independence or reconstruct every upstream preprocessing step. No current source is substituted for archived feature values.

- Outcomes remain separate; pending/missing games never become zero-score games. The 1 missing finals are visible below. Closing, ATS and CLV missingness remains explicit null/unavailable.

- Market hashes establish semantic state, not authentic capture timestamps. Metadata can be refreshed in place; closing history and timing completeness remain limitations.

- Master spec contains older gap-analysis/audit-answer prose saying archives/outcomes/evaluation do not exist, despite its newer WU1/WU2/WU3 sections, linked schemas and actual archives. This conflict is reported and historical prose is preserved. No production resolver logic was changed; only its existing spread-only data-resolution mode was run.

- Paired metrics use identical games; one final prediction per game prevents repeat-snapshot weighting. No hindsight pick filter, market-best-book cherry-pick, paid research, workflow, external write or model-projection generator was used.

## Selected-slate ledger

| Game | Selected prediction UTC | Home margin | Actual | Signed error | Absolute error | Squared error (RMSE contribution) | Last market signed error | Improvement points | Closer | Directional ATS | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026_01_NE_SEA | 2026-09-09T16:33:55.243Z | 3.824 | 3.000 | 0.824 | 0.824 | 0.679 | 0.000 | -0.824 | MARKET | PUSH | NO_PICK |
| 2026_01_SF_LA | 2026-09-10T16:20:21.340Z | 6.216 | -20.000 | 26.216 | 26.216 | 687.279 | 23.500 | -2.716 | MARKET | LOSS | NO_PICK |
| 2026_01_ATL_PIT | 2026-09-13T16:11:31.542Z | 2.552 | 7.000 | -4.448 | 4.448 | 19.785 | -0.500 | -3.948 | MARKET | LOSS | NO_PICK |
| 2026_01_BAL_IND | 2026-09-13T16:11:31.542Z | 3.008 | -18.000 | 21.008 | 21.008 | 441.336 | 14.500 | -6.508 | MARKET | LOSS | NO_PICK |
| 2026_01_BUF_HOU | 2026-09-13T16:11:31.542Z | 1.760 | -5.000 | 6.760 | 6.760 | 45.698 | 3.500 | -3.260 | MARKET | LOSS | NO_PICK |
| 2026_01_CHI_CAR | 2026-09-13T16:11:31.542Z | -1.240 | -22.000 | 20.760 | 20.760 | 430.978 | 19.000 | -1.760 | MARKET | LOSS | NO_PICK |
| 2026_01_CLE_JAX | 2026-09-13T16:11:31.542Z | 9.200 | 24.000 | -14.800 | 14.800 | 219.040 | -15.500 | 0.700 | JKB | WIN | NO_PICK |
| 2026_01_NO_DET | 2026-09-13T16:11:31.542Z | 6.116 | 1.000 | 5.116 | 5.116 | 26.173 | 6.000 | 0.884 | JKB | WIN | NO_PICK |
| 2026_01_NYJ_TEN | 2026-09-13T16:11:31.542Z | 3.272 | -13.000 | 16.272 | 16.272 | 264.778 | 14.500 | -1.772 | MARKET | LOSS | NO_PICK |
| 2026_01_TB_CIN | 2026-09-13T16:11:31.542Z | -1.024 | 6.000 | -7.024 | 7.024 | 49.337 | -2.500 | -4.524 | MARKET | LOSS | NO_PICK |
| 2026_01_ARI_LAC | 2026-09-13T16:11:31.542Z | 7.232 | -12.000 | 19.232 | 19.232 | 369.870 | 21.500 | 2.268 | JKB | WIN | NO_PICK |
| 2026_01_GB_MIN | 2026-09-13T16:11:31.542Z | 1.928 | 17.000 | -15.072 | 15.072 | 227.165 | -15.500 | 0.428 | JKB | WIN | NO_PICK |
| 2026_01_MIA_LV | 2026-09-13T16:11:31.542Z | 0.800 | 14.000 | -13.200 | 13.200 | 174.240 | -11.000 | -2.200 | MARKET | LOSS | NO_PICK |
| 2026_01_WAS_PHI | 2026-09-13T16:11:31.542Z | 8.648 | 2.000 | 6.648 | 6.648 | 44.196 | 4.000 | -2.648 | MARKET | LOSS | NO_PICK |
| 2026_01_DAL_NYG | 2026-09-13T16:11:31.542Z | 2.960 | 8.000 | -5.040 | 5.040 | 25.402 | -11.000 | 5.960 | JKB | WIN | NO_PICK |
| 2026_01_DEN_KC | 2026-09-13T16:11:31.542Z | 1.304 | Unavailable | Unavailable | Unavailable | Unavailable | Unavailable | Unavailable | Unavailable | Pending | NO_PICK |

Forecast improvement points = market absolute error minus JKB absolute error (positive favors JKB). RMSE contribution is squared error. These error fields are null for unverified outcomes. Mean paired improvement = **-1.328 points (n=15)**.

## Home/away and favorite/dog diagnostics

These splits describe the production directional side, not issued picks. Error remains home-margin oriented. Site diagnostics appear above.

| Directional side | n | MAE | Signed error | Directional ATS W-L-P |
| --- | --- | --- | --- | --- |
| home | 10 | 13.340 | 6.358 | 3-6-1 |
| away | 5 | 9.804 | -0.065 | 2-3-0 |
| pick | 0 | Unavailable | Unavailable | 0-0-0 |
| missing | 0 | Unavailable | Unavailable | 0-0-0 |

| Market role of directional side | n | MAE | Signed error | Directional ATS W-L-P |
| --- | --- | --- | --- | --- |
| favorite | 6 | 13.305 | 3.348 | 2-3-1 |
| underdog | 9 | 11.399 | 4.796 | 3-6-0 |
| pick | 0 | Unavailable | Unavailable | 0-0-0 |
| missing | 0 | Unavailable | Unavailable | 0-0-0 |

## Data completion and market-source trace

Root cause **A: stale refresh**. Previous canonical results.json was generated **2026-09-13T14:20:07.501Z**, before Sunday kickoffs. Canonical [generator](../../../scripts/generate-nfl-schedules-results.mjs), `npm run nfl:schedules`, reads [free nflverse nfldata games.csv](https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv). [Core transform](../../../scripts/lib/nfl-schedules-results-core.mjs) filters numeric season, preserves week/game_type and game_id, normalizes nflverse team codes via teams.json, converts Eastern kickoff to UTC, and emits finals only when both integer scores exist. The audit filters REG/Week 1 and joins exact IDs. No normalization failure was found.

Shell fetches were blocked by sandbox socket permissions. The same public source was retrieved through the web tool; original header and verbatim 16 Week 1 rows are in [evidence CSV](evidence/nfldata-week1-2026.csv). [Scoped completion producer](../../../scripts/research/complete-nfl-week1-result-data.mjs) uses the unchanged canonical transform, validates identity/kickoff/neutral status and no final regression, merges only those 16 games, and preserves other season rows. The generic generator was not run on this partial input because that would truncate the season. The existing **spread-only** resolver then appended outcomes. Original prediction bytes and selected IDs are checked against [completion provenance](evidence/completion-provenance.json). No projections or ratings were regenerated.

The separate fantasy schedules cache, data/nfl/nflverse/schedules/games.csv, retrieved 2026-08-21, contains identity fields but **no scores**: no hidden finals in schema B. All 15 public finals join: failure C not observed. DEN–KC has blank scores and a future kickoff 2026-09-15T00:15Z: genuinely unfinished D.

Market inventory: immutable prediction market_snapshot_refs establish **marketAtPrediction**. Data/market/betting-lines/history/nfl/2026 contains The Odds API game/book states with capture/update times. Public betting-lines-history and betting-lines-current are derived views of that same store, not independent close evidence. Public nfl matchup-market.json and nfldata CSV contain unnamed, untimestamped settled historical lines, explicitly not verified close. Betting-splits histories contain SportsDataIO timing/count context, not canonical same-book closing spreads. Player props/anytime TD/yardage-alt archives are different markets and cannot supply game spreads. No paid provider refresh occurred. None proves canonical closing coverage. The JSON keeps **marketAtPrediction**, **lastObservedPregameMarket**, and **verifiedClosingMarket=null** separately; older descriptive keys remain compatible.

Coverage: **expected finished=15; joined=15; missing finals=2026_01_DEN_KC; market at prediction=16/16; last observed pregame=16/16; verified close=0/16; established qualifying ATS picks=0/16**.

## What Week 1 can teach us

This archive can support an honest forward audit and identifies the operational evidence gaps: complete final-score attachment, immutable qualifying picks and closing-capture provenance. The completed-game sample has JKB closer 5/15, market closer 10/15, and ties 0/15; the largest individual miss is the neutral-site SF–LA game. Track these observations prospectively as the remaining finals become locally available. Preserve the same selection and comparison policies on every rerun.

## What is too early to act on

Do not change coefficients, ratings, preseason/live weights, HFA or ATS thresholds from this sample. Even a complete 16-game week is small and its edge/OVR/site cells smaller; current cells of one game are explicitly exploratory. The live blend has no Week 1 evidence here. No profitability, causal, calibration or persistent market advantage conclusion is supported. Any future model hypothesis needs prior declaration, temporal validation and an untouched future period; no candidate is proposed or promoted.

### Fix Now

The demonstrated stale-score/outcome coverage defect is fixed locally for all 15 finished games. No parser, ID join or model implementation defect was found. Closing and issued-recommendation evidence gaps stay explicit; production capture infrastructure is unchanged.

### Monitor Weeks 2–4

Track signed home-margin bias, large OVR-gap misses, directional home/away splits and market-relative errors prospectively under the unchanged policy. These are plausible monitoring signals from n=15, not proven calibration defects.

### Revisit After Larger Sample

Changes to 0.24, +2 HFA, Current OVR blending, preseason priors generally or ATS thresholds require a larger temporally valid sample and separate authorization. None is recommended or implemented.

## Reproduce and validate

Requires the repository TypeScript runner (tsx); runtime is offline. Existing dependencies were reused without an npm install.

Exact validation results and known pre-existing failures are in [VALIDATION.md](evidence/VALIDATION.md). Audit tests pass; Node-config TypeScript passes. Application TypeScript and focused dependency TypeScript have existing failures. Parser/market suites: 48/48 pass, including season filtering, final-game detection and the corrected current-season result assertions.

`node node_modules/tsx/dist/cli.mjs scripts/research/nfl-week-spread-ats-audit.mts --season=2026 --week=1 --as-of=2026-09-14T10:43:31.000Z --book=draftkings --output-dir=docs/research/nfl-week1-spread-ats-audit-2026 --replace-report=true`

`node node_modules/tsx/dist/cli.mjs --test scripts/research/nfl-week-spread-ats-audit.test.mts`

Outputs are only audit.json and REPORT.md under the explicitly named docs/research directory. Input SHA-256 manifest is embedded in audit.json; reruns with identical local inputs/cutoff are deterministic. Later source refreshes should use a new dated output directory; explicit --replace-report=true permits the user-authorized replacement performed in this completion task. Application build, UI/browser tests and full application suite were not run for this data-only task. Application and Node TypeScript checks and relevant parser/market tests were run separately; the existing spread-only outcome resolver was run after canonical score completion. No commit or push.

