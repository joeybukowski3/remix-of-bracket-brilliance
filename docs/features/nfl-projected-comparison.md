# NFL Team Comparison: Projection, Blended and Observed

Status: framework implemented. The canonical JKB Power Rating plus twelve EPA and success-rate metrics are available; every other metric stays N/A. See "First real projected metrics" below for the model, its backtest and its limits. Existing observed artifacts and sample policies remain unchanged.

The additive Blended implementation below extends this framework. Power Rating and the twelve EPA/success-rate metrics are projection-ready; other generic blended statistics stay N/A until their required inputs exist. No changes to Power Rating methodology or production workflows are included.

## Source inventory and reuse decisions

Inventory taken on `audit/nfl-power-rating-vs-matchup-comparison`, 2026-09-06. Paths below are repository-relative. A predictor used to forecast a target is not itself a forecast of that predictor.

| Source | Producer / source modules | Fields, season and unit | Forward-looking / team-level / opponent treatment | Reuse and circularity |
| --- | --- | --- | --- | --- |
| `public/data/nfl/2026/projected-power-ratings-v04.json` | `scripts/import-nfl-power-v04-projection.mjs`; `src/lib/nfl/v04Projection.ts`, `publicProjection2026.ts` | `rating2026`, `rating2025Adjusted`, `projectionAdjustment2026`; `components.{jkbV03Rating,guideRating,guideCalibrationAdjustment,luckAverageRank,luckAdjustment,personnelAdjustment,coachAdjustment,returningInjuryAdjustment}` | 2026 preseason team strength. Base uses full-2025 opponent-adjusted EPA and margin; curated offseason changes. Snapshot verified through June 23, beta, eight-team luck coverage. Future SOS is context only. | READY through the canonical current board, not another computation. Showing the rating itself is not independent validation. No conversion to EPA/success/other statistics. |
| `public/data/nfl/2026/preseason-power-ratings.json` | `scripts/generate-nfl-v03-artifacts.mjs`; `scripts/lib/nfl-v03-artifacts.mjs::{buildFullSeason,buildPreseason}`; `nfl-power-v03-metrics.mjs` | `publicRating`, `offenseRating`, `defenseRating`, historical composites and manual adjustments | 2026-labelled anchors from 2025 full-season adjusted performance. Final-eight trajectory weight is zero. OFF/DEF do not receive v0.4 personnel/coaching/injury adjustments. | Retain in existing observed/model views. OFF/DEF alone are historical anchors, not independently modeled 2026 unit-stat forecasts; leave unavailable in this lens. No inverse-rating projection. |
| `public/data/nfl/2026/team-performance-analytics.json` | `scripts/generate-nfl-team-performance-analytics.mts`; `src/lib/nfl/performanceComposite2026.ts` | `gamesPlayed`, `windows.{fullSeason,last4,last8}`, `performance.{performanceRating,offenseRating,defenseRating}` | Observed 2026 team performance, currently zero games. Full-season composite uses opponent adjustment; short windows are diagnostic. | Not projected statistics. Only its existing contribution through `currentRating2026.ts::buildCurrentRatingBoard` remains visible as canonical Power Rating. |
| `public/data/nfl/matchup-projections.json` | `scripts/generate-nfl-matchup-projections.mts`; `src/lib/nfl/jkbPowerNumber2026.ts` | 272 game projections: current OVRs, power numbers, HFA, `projectedHomeMargin` | Forward-looking team/game margin; derives directly from canonical Power Rating; matchup/venue dependent. | Not a points/game or season-efficiency forecast. Using its output as independent support for Power Rating would be circular. |
| `public/data/nfl/team-totals.json`; `data/nfl/predictions/2026/<week>/nfl-total-ridge.jsonl` | `scripts/generate-nfl-totals.ts`, `generate-nfl-team-totals-view.mts`; `src/lib/nfl/props/totals/{totalsGenerator,totalsModel,totalsFeatures,totalsModelContract}.ts` | `homeExpectedPoints`, `awayExpectedPoints`, archive `projected_team_points`; currently 16 Week 1 games | True team-game forecasts. Ridge uses historical EWMA offense EPA/success, opposing defense EPA/success and home indicator; no market or Power Rating input. Opponent-conditioned, not a neutral league-adjusted statistic. | READY for existing game-score surface, not this season lens. Season points/game and points allowed/game are DERIVABLE as means over all 17 scheduled game forecasts at one fixed cutoff, with each opponent's projected score used for allowed points. Requires complete schedule coverage and an approved materialization; do not average the current-week feed and call it a season forecast. No Power Rating circularity. |
| `public/data/nfl/2026/team-opportunity.json` | `scripts/generate-nfl-team-opportunity.ts`; `src/lib/nfl/props/{teamOpportunityGenerator,teamOpportunityModel,teamOpportunityFeatures}.ts` | 32 Week 1 team-game rows: `projectedTeamPlays`, `projectedDropbackRate`, `projectedPassAttempts`, `projectedRushAttempts` | True team-game forecasts using historical team/opponent features and market context. `projectedPassAttempts` means dropbacks including sacks/scrambles; rush attempts means designed rushes. | Not the catalogue's official pass attempts / carries or conventional play mix. A full-season aggregation still needs coverage, semantic conversion and validation. No direct JKB Power Rating input; market-dependent and not independent market-free corroboration. Do not map fields by name. |
| `public/data/nfl/2026/yardage-projections.json` | `scripts/generate-nfl-current-week-yardage-projections.ts`; `src/lib/nfl/props/currentWeekGenerator.ts` and passing/rushing/receiving models | Week 1 player/game/market `projectedYards`, role/volume/efficiency diagnostics and feature snapshots | Forward-looking player forecasts; not team-season forecasts. Passing has opponent/market features; receiving uses team opportunity and allocation. Other encoded features are not necessarily load-bearing. | Do not sum QB candidates or incomplete RB/WR/TE populations into team passing/rushing yards. Player receiving and QB passing yards overlap. Team reconciliation and full-season coverage would need new methodology. No direct rating inversion; shared historical inputs/market context limit independence. |
| `public/data/fantasy/projections/2026/week-01.json` | `scripts/generate-fantasy-weekly-projections.ts`; `src/lib/fantasy/weekly/projections/production/{generator,methodology,context}.ts` | Player weekly fantasy points, baseline, scoring-environment/opponent adjustments | Player-level forecast, with historical/ROS priors and market/opponent fantasy context; not team EPA, scoring or yardage. | Fantasy points cannot be inverted into team football statistics. No direct Power Rating inversion; not independent team-strength evidence. |
| DFS adapters under `src/lib/nfl/dfs/` | Existing yardage/fantasy projection consumers and slate compatibility checks | Player/slate projections and salary/scoring context | Consumer of player forecasts, no independent team-season statistic forecast | No additional eligible season-level source. |
| `public/data/nfl/matchup-{metrics,epa,success-rates,trench-metrics}.json`; PBP, play-volume and pregame feature caches | Existing matchup generators; `scripts/generate-nfl-team-pregame-features.ts` and cache refreshers | Observed conventional, EPA, RBSDM success, ESPN win rates and historical feature windows | Historical or current observed team performance. A pregame feature is still historical evidence, not a forecast of EPA/success/pace. | Do not copy into projection columns. ESPN publishes cumulative observed rates, not roster-adjusted trench forecasts. |

No defensible ready **season-stat** projection was found. Curated guide/luck/personnel adjustments are rating points, not statistical-unit adjustments. The totals model is a useful next source but does not make its EPA/success predictors projected EPA/success outputs.

## Complete catalogue classification

Classification is for the **2026 regular-season lens**, not whether a different game/player product can use the source. A = READY; B = DERIVABLE with the documented transformation and complete inputs; C = REQUIRES NEW MODELING; D = HISTORICAL ONLY at present. B is not permission to publish incomplete or unvalidated aggregates. Every non-A row remains N/A in this release.

| Metric key | Categories | Class | Reason |
| --- | --- | --- | --- |
| `team.overallRating` | Overall | A | Canonical current 2026 model rating; explicit user-authorized model context |
| `team.offenseRating` | Offense | D | Existing preseason unit anchor is 2025 performance, without v0.4 unit projection |
| `team.defenseRating` | Defense | D | Same |
| `off.epaPerPlay` | Overall, Offense | C | No EPA forecast model |
| `def.epaPerPlayAllowed` | Overall, Defense | C | No defensive EPA forecast model |
| `off.successRate` | Overall, Offense | C | No success-rate forecast model |
| `def.successRateAllowed` | Overall, Defense | C | Same |
| `off.timeOfPossession` | Overall, Offense | D | Unavailable even in current observed catalogue; context only |
| `off.yardsPerPlay` | Offense | C | No coherent team yards/play forecast |
| `off.firstDownsPerPlay` | Offense | C | No forecast or populated source |
| `off.thirdDownConversion` | Offense | C | No forecast or populated source |
| `off.pointsPerGame` | Offense | B | Mean of 17 same-cutoff team-point forecasts; only Week 1 materialized today |
| `off.turnoversPerGame` | Offense | C | No turnover count forecast |
| `def.yardsPerPlayAllowed` | Defense | C | No coherent opponent yardage/play forecast |
| `def.firstDownsPerPlayAllowed` | Defense | C | No forecast or populated source |
| `def.thirdDownConversionAllowed` | Defense | C | No forecast or populated source |
| `def.pointsAllowedPerGame` | Defense | B | Mean of each scheduled opponent's projected points against this team; same coverage/cutoff requirement |
| `def.takeawaysPerGame` | Defense | C | No takeaway forecast |
| `off.epaPerPass` | Passing | C | No pass EPA forecast |
| `off.passSuccessRate` | Passing | C | No pass success forecast |
| `off.passPlayRate` | Passing | C | Opportunity dropback share has different play accounting and only game coverage |
| `off.passAttemptsPerGame` | Passing | C | Dropbacks are not official pass attempts |
| `off.yardsPerPassAttempt` | Passing | C | No team-season numerator/denominator forecast |
| `off.passYardsPerGame` | Passing | C | Player projections lack season coverage and coherent team aggregation |
| `off.passBlockWinRate` | Passing, Trenches | D | ESPN observed PBWR only |
| `off.sacksAllowedPerGame` | Passing | C | No sacks forecast |
| `def.epaPerPassAllowed` | Passing | C | No defensive pass EPA forecast |
| `def.passSuccessRateAllowed` | Passing | C | No defensive pass success forecast |
| `def.opponentPasserRating` | Passing | C | No coherent projected completions/attempts/TD/INT bundle |
| `def.opponentYardsPerPassAttempt` | Passing | C | No team-season numerator/denominator forecast |
| `def.opponentPassYardsPerGame` | Passing | C | No reconciled season opponent-production forecast |
| `def.passRushWinRate` | Passing, Trenches | D | ESPN observed PRWR only |
| `def.sacksPerGame` | Passing | C | No sacks forecast |
| `off.epaPerRush` | Rushing | C | No rush EPA forecast |
| `off.rushSuccessRate` | Rushing | C | No rush success forecast |
| `off.rushPlayRate` | Rushing | C | Designed rush accounting differs from catalogue carries |
| `off.rushAttemptsPerGame` | Rushing | C | Designed rushes exclude scrambles; no comparable season forecast |
| `off.yardsPerRushAttempt` | Rushing | C | No coherent team-season numerator/denominator forecast |
| `off.rushYardsPerGame` | Rushing | C | No validated reconciliation of player volume and efficiency |
| `off.runBlockWinRate` | Rushing, Trenches | D | ESPN observed RBWR only |
| `def.epaPerRushAllowed` | Rushing | C | No defensive rush EPA forecast |
| `def.rushSuccessRateAllowed` | Rushing | C | No defensive rush success forecast |
| `def.opponentYardsPerRushAttempt` | Rushing | C | No coherent team-season numerator/denominator forecast |
| `def.opponentRushAttemptsPerGame` | Rushing | C | No comparable official opponent-carries forecast |
| `def.opponentRushYardsPerGame` | Rushing | C | No reconciled season opponent-production forecast |
| `def.runStopWinRate` | Rushing, Trenches | D | ESPN observed RSWR only |

## Artifact contract

Reserved browser path: `public/data/nfl/2026/projected-matchup-metrics.json`. No file is generated until an approved season-stat producer exists; a 404 is a supported empty state. An empty placeholder with a fabricated generation timestamp would not add evidence.

Executable schema/type: `src/lib/nfl/projectedMatchupMetrics.ts::{ProjectedMatchupMetricsArtifact,validateProjectedMatchupMetrics}`.

- `schemaVersion = nfl-projected-matchup-metrics-v1`, `season = 2026`, `horizon = regular-season`.
- `generatedAt`: artifact production timestamp, ISO with timezone. `asOf`: common forecast information cutoff, no later than generation. `projectionVersion`: version of the statistical projection bundle, separate from schema and Power Rating versions.
- `teams`: exactly 32 slots matching `public/data/nfl/teams.json` IDs and lowercase abbreviations. Missing team slots, duplicates, aliases or conflicting IDs reject the file. Missing statistical coverage is represented by an omitted metric or explicit `null`, never zero. Team names remain sourced from the canonical registry.
- `metrics`: shared per-key provenance: source path/identifier, producer, model version, statistical definition/units/denominator, opponent-adjustment flag and `dependsOnPowerRating: false`. All teams in a column must have the same definition and cutoff. A future producer must document its approved methodology and immutable source references; the schema cannot prove a scientific claim solely from metadata.
- `teams[].metrics[key] = { value, rank } | null`: value is finite, unrounded, in existing catalogue units (percentages are 0–100). Unknown/non-comparison keys reject. Negative non-EPA values and percentages outside 0–100 reject.
- Rank within the **available** team population using catalogue direction and exact unrounded equality: competition ranks `1,2,2,4`. Missing values have no rank. Context-only columns use `rank: null`. `rankProjectedMetric` is reusable by a future producer; the reader independently verifies every supplied rank and rejects disagreement rather than silently fixing it. No borrowed historical/provider ranks.
- The catalogue's `team.overallRating` remains a supported **resolver** key, supplied exclusively by the canonical current rating board. It is deliberately forbidden in this statistical artifact to prevent stale copied model values. `team.offenseRating`/`team.defenseRating` are unavailable in this release, not copied from historical anchors. Adding a legitimate independent unit forecast requires an explicit contract/methodology revision.
- Schema v1 contains season per-game averages or season rate expectations with their definitions, not a next-game prediction or a latest-week average. A game-specific lens would require explicit game IDs, opponent, venue and population semantics in a separate version.

## UI and execution boundary

`MatchupDataControls` offers `2026 Projection`, `2026 Blended`, `2026 Season`, `Last 5`, `2025 Season`, and the retained legacy `Season` control. The historical-blend state is preserved but hidden in explicit lenses; selecting legacy Season or Last 5 restores it. The default remains Season + historical blend ON. Explicit season choices do not mutate those retained settings.

`NFLMatchupDetail` owns `comparisonLens`. `useNflProjectedMatchupMetrics` loads the reserved path only when selected, with `cache: no-store`, canonical identity validation, cancellation and an unavailable error state. Missing/malformed data never invokes an observed resolver. It does not write files or regenerate models.

`matchupDisplayMetrics.ts::resolveCategoryMetrics` checks the dedicated projected resolver before all historical conventional/EPA/success/trench paths. The only exception is canonical `team.overallRating`. Both Overview and Team Comparison receive the same projected category rows/counts. The Overview explicitly labels this active lens too.

The comparison heading, provenance notice and loading/error/empty copy identify projections. Projected statistical rank badges and accessible rail labels say "among available teams" instead of assuming 32 populated values; canonical Power Rating retains its existing league-rank labeling. Historical period tables, unit battles, standalone trenches and market supplementary panels are not rendered inside the projection comparison; they return unchanged with the observed lens. Other page tabs remain available. Unsupported rows retain N/A and are excluded by the existing category logic. Ties remain eligible without awarding a win. Category scoring is unchanged.

The rating is a model-context row, not an independent statistical endorsement. Until a season-stat model is published, only Overall has one comparable row; the other five categories report no comparable metrics. This limited coverage is intentional and disclosed.

## Verification and next modeling work

Focused contract tests cover ranks/precision/directions, missing coverage, identity/season/schema failures, provenance, disallowed rating duplication and circular-source declarations. BAL/IND tests use committed artifacts to retain historical counts 4/5, 4/6, 6/6, 10/13, 9/10, 3/4 and ratings 54.9/60.1, while projected mode calls none of the historical statistic resolvers. UI tests cover selection and retained observed settings.

Validation on 2026-09-06:

- Focused Vitest: `projectedMatchupMetrics.test.ts`, `MatchupProjectionControls.test.tsx`, `MatchupRedesign.test.tsx`, `matchupSampleWindow.test.ts`, `matchupCategoryAdvantage.test.ts`: 110 tests passed.
- Playwright: `tests/nfl-projection-lens.spec.ts` plus `tests/playwright-analytics-blocking.spec.ts`: five tests passed using the repository analytics-blocking fixture. Verified BAL/IND at 390px and 1440px, unavailable state, observed restoration, shared Overview lens, and a synthetic projected dataset with matching ranks/counts. Screenshots inspected; no horizontal overflow or page errors in those flows.
- Focused ESLint and `npm run build` passed. Existing duplicate-key, Browserslist and bundle-size build warnings remain.
- Full app TypeScript check is blocked by the pre-existing parse error at `src/lib/mlb/mlbPitcherRegression.ts:28`. A separate NFL dependency check found diagnostics only in unchanged files; this does not constitute a clean repository typecheck. The full repository test suite was not run.

Next candidate: approve a same-cutoff, complete-schedule season scoring materialization using the existing independent total model. Specify information availability, 17-game coverage, aggregation, schedule-conditioned interpretation and ranks before publishing it. EPA/success, official-volume conversion, team yardage reconciliation and roster-sensitive trench forecasts are separate modeling work. No workflow, archive writer, model weight or historical artifact is modified here.

## Blended runtime contract (v1)

`projectionBlendPolicy.ts` owns the versioned configuration and `getProjectionBlendWeights(completedGames, family?, policy?)`. It rejects negative, fractional and nonfinite counts. Its default projection weights are:

| Completed games | Projection | Observed |
| ---: | ---: | ---: |
| 0 | 100% | 0% |
| 1 | 80% | 20% |
| 2 | 60% | 40% |
| 3 | 40% | 60% |
| 4 | 20% | 80% |
| 5+ | 0% | 100% |

The policy accepts future family overrides (`epa`, `successRate`, `turnovers`, `trenches`, `conventional`); none are enabled. Curves must start at 100% projection, descend monotonically, and end at zero. This comparison policy is an initial candidate, not an optimized or scientifically validated conclusion. It is independent of `CURRENT_RATING_WEIGHTS_BY_GAMES`.

`blendedMatchupMetrics.ts::createBlendedMatchupMetrics` is a pure runtime composition over the validated projected artifact, a dedicated observed resolver, canonical results and the canonical Current Rating board. No blended artifact, additional fetch pipeline or persisted duplicate of the three values is needed: the page already has the sources, and a 32-team catalogue pass is small. One immutable resolver closure computes values and ranks from the same loaded source set. Projection loading remains lazy and no-store, enabled by either Projection or Blended. Independent source-generation times are retained rather than represented as one atomic upstream snapshot.

For each generic metric and team, compute `projectionWeight * projectedValue + observedWeight * observedValue`. Each team gets its own count and weights: BAL with two games uses 60/40 while IND with one uses 80/20. All valid raw results are then competition-ranked (`1,2,2,4`) using catalogue direction and exact numeric ties, with canonical abbreviation as deterministic secondary sort. Direction changes ranking and comparison advantage, never the weighted-average formula. No input ranks or display strings enter the calculation. Provenance includes available-team count and the exact excluded-team list. UI rank copy says "among available teams"; missing values are not assumed to be bottom-ranked or zero. Existing category eligibility/count rules consume these resolved rows unchanged.

### Canonical completed-game path

1. `scripts/generate-nfl-schedules-results.mjs` reads nflverse **nfldata** `games.csv` (source URL recorded in `scripts/lib/nfl-schedules-results-core.mjs`, cache under `data/nfl/nflverse/schedules/`). It supports an offline input and normally refreshes through the existing schedules/results workflow.
2. `nfl-schedules-results-core.mjs::transformSeasonRows` joins provider team codes through the canonical `teams.json` registry (`nflverseAbbr` to lowercase `abbr`). Unknown teams, duplicate game IDs and malformed/one-sided scores reject generation. Under this provider's contract, both scores present means final; scoreless scheduled games produce no results row. A 0–0 final is still a completed game.
3. Output `public/data/nfl/2026/results.json`, `_meta` plus `results[]`, is loaded by the existing `useNflSeasonData(2026)` alongside canonical teams and schedule. Existing trench presentation already counts `REG && final === true` from this feed.
4. `comparisonCompletedGames.ts` additionally requires metadata season 2026 and a valid generation timestamp, exact canonical abbreviations, finite final scores and unique game IDs. It selects `season === 2026 && seasonType === REG && final === true`, building a sorted ID set for every registered team. Missing/malformed input returns unknown, never an invented zero. Preseason, postseason, prior-season and non-final rows cannot advance weights. No result for a bye/postponed/cancelled game means no evidence increment; nominal week and UI selection are irrelevant.

Audit distinction: `generate-nfl-team-performance-analytics.mts` sets its own `gamesPlayed` from the number of compact PBP team rows; `results.json` separately supplies final-score margins and opponents. Thus the Power Rating count is not a direct final-results count and can lag or disagree if those producers refresh separately. Blended statistical weights use results directly. The model-managed rating remains unchanged and its count mismatch is disclosed in provenance. This work does not silently repair the model producer.

### Observed adapter and precision

`observedComparisonMetrics.ts` selects only `season-current` conventional/EPA windows and `2026-season` success/trench data for the blend. It does not call any historical or Last 5 fallback resolver.

| Source | Observed value | Sample / freshness check |
| --- | --- | --- |
| `matchup-metrics.json` | New optional `rawMetrics[key]` from the existing aggregate producer; legacy artifacts use published numeric tuple precision, explicitly recorded | Current-season metadata, full-season mode without prior season, only 2026 in `seasons`/`through`, matching `gamesIncluded`/IDs; exact final-results ID set |
| `matchup-epa.json` | Unrounded stored EPA sum divided by eligible plays, offense or defense/pass/rush as appropriate | Same season/window/ID checks; missing totals do not fall back to rounded EPA |
| `matchup-success-rates.json` | RBSDM `raw * 100`, retaining catalogue percent units | Explicit 2026 period; exact game IDs required for blending. Missing IDs fail closed, even if an aggregate count exists |
| `matchup-trench-metrics.json` | ESPN published percentage (no finer precision available) | Explicit 2026 season is readable for the observed-only lens, but the current contract has no exact game IDs. Generic blending fails closed until a defensible sample contract exists; throughWeek is never a substitute for team game count |

`scripts/generate-nfl-matchup-metrics.mjs` now preserves unrounded `rawMetrics` alongside its unchanged `[roundedValue, rank]` tuples. This is an additive optional v1 field; legacy consumers and outputs keep their meaning. No committed generated artifact was edited or refreshed. The existing generation command will supply raw values on its next authorized run. This is a storage-precision addition, not a new statistic or formula.

Future projection producers must supply the same metric definition, units, denominator and opponent treatment as the observed counterpart. Merely matching a key does not validate a new scientific method. All currently allowed catalogue statistics use the generic mode; `team.overallRating` is `modelManaged`, and other `team.*` rating keys remain unsupported. Adding valid season-stat keys to the projected contract requires no component wiring. A valid required observed sample is still mandatory.

When both sides contribute, the resolver rejects projections marked `opponentAdjusted: true`: the existing comparison adapters provide unadjusted observations, so there is no matching adjusted counterpart yet. A zero-weight side does not impose this compatibility requirement.

### Missing inputs and Power Rating exception

| Condition | Result |
| --- | --- |
| Zero completed games, projected present | Exact projection; observed may be absent |
| Positive observed weight, observed missing/invalid/sample mismatch | N/A, explicit reason; no weight renormalization |
| Positive projection weight, projection absent | N/A, even if observations exist |
| Both absent | N/A |
| Projection weight zero | Exact observed value if its 2026 final-results sample is verified; projection may be absent |
| Completed results unknown | Generic rows N/A |

Neither side uses 2025 observations as a hidden substitute. Zero-weight inputs are not required and do not contribute even if nonfinite. Finite zero is a legitimate value.

`team.overallRating` bypasses generic blending completely. Value and rank are passed through from `useNflCurrentRating2026`; its preseason anchor, live performance value, own completed-game count and actual model weights are retained in provenance. Its 4/5/6+ game projection weights remain **25/10/0%**, versus the generic policy's **20/0/0%**. Reblending the already blended rating would count the prior transition twice. The existing Projection lens also retains its previously approved canonical-current model-context exception; it never acquires generic blended statistics. Other rating rows are not inferred from historical anchors.

Explicit `2026 Season` is observed current regular-season statistics only. Explicit `2025 Season` uses the existing `prior-season-full` artifact windows and full-season provider periods, not Last 8. Model ratings are N/A in these newly explicit observed-only lenses because the canonical current board is not an observed-season statistic. Legacy `Season`, its historical switch and Last 5 retain their original behavior, including their independent success/trench period policies. This extra retained Season control avoids silently redefining the old default.

Observed-only season lenses retain the source-window ranks, especially ESPN's official ranks based on finer precision than its published percentages. Only the generic blended dataset receives newly computed blended ranks.

### Provenance and operational limits

Each generic record retains projected/observed/blended raw values, projected source/bundle/model version/generation/cutoff, observed source/schema version/generation/cutoff/game IDs/precision, final-results source/schema/generation, completed count, policy version, both weights, rank population and unavailability reason. `provenance(abbr, key)` exposes the record for inspection and future consumers. The Blended UI has concise per-team generic weights plus expandable source/sample diagnostics.

Power Rating provenance exposes the v0.4 verified-through cutoff and performance artifact timestamp from the existing hook's already-loaded inputs. The composed board still has no aggregate model version or atomic information cutoff. The v0.4 public board does not expose its generation timestamp, and the performance board does not preserve exact game IDs; those fields remain explicitly unknown. No artificial model version or cutoff is invented.

Sources can be generated at different times. Exact observed/result game-ID matching catches lagging or extra-game samples, but does not prove provider publication timing or detect every corrected-stat revision. Current artifacts are mutable, not immutable research snapshots. Success/trench sampling gaps, missing 2026 caches and comparison refresh-automation gaps remain operational risks. No broad workflow redesign is included. A missing projected artifact blocks only the side that still requires a prior; observations can render at 5+ games when verified. The current local 2026 results feed and observed windows are empty.

## Future fade-curve validation

Pre-register these candidates before inspecting outcomes; do not tune this implementation:

| Candidate | Projection percentages by completed games, starting at zero (last entry repeats) |
| --- | --- |
| A (v1) | 100, 80, 60, 40, 20, 0 |
| B | 100, 75, 50, 25, 10, 0 |
| C | 100, 85, 70, 55, 40, 25, 10, 0 |

Observed weight is the complement. Evaluate each metric family separately against projection-only and observed-only baselines on identical eligible populations. Primary targets: next-game EPA/success and future multi-game efficiency; scoring is a separate family. Spread/total accuracy is a downstream experiment requiring an explicit integration and validation gate, not a claim made by this display lens. Do not retune Current Rating as part of generic fade research.

Available local inputs: EPA team-game caches and canonical results 2020–2025; conventional `stats_team_week` and play-volume team-game caches 2022–2025. The performance-team-game directory currently has a manifest but no CSVs. There are no approved historical projected-comparison season-stat bundles, no historical RBSDM/ESPN point-in-time sample archive, and no archive of every provider revision. Current OVR backtest tooling covers 2023–2025 reconstruction and 2024–2025 evaluation, but those rating priors are not EPA/success forecasts.

Before backtesting, implement and version an approved comparable prior, rebuild each target-season preseason prior using only earlier seasons/information, and freeze source hashes, cutoff, code version and definitions. Replay each team's completed games chronologically (by kickoff/finality, handling byes independently); build observed aggregates only through that cutoff, then grade strictly later games. A possible development split is priors trained through 2022 -> 2023 validation, then through 2023 -> 2024 validation; freeze the choice before an untouched future holdout. Prior work has already examined 2025 in several models, so do not automatically label 2025 untouched. Reserve forward 2026+ evidence when necessary.

Report MAE/RMSE, bias/calibration, correlation where meaningful, n and missingness by family/team-game count/season; paired uncertainty intervals and fold consistency; no cherry-picked best curve or betting claim. Archive synthetic replays as backtests, never production predictions, and follow `EVALUATION_STANDARDS.md`. No candidate optimization or backtest was run here.

## Blended implementation validation (2026-09-06)

Focused Vitest: **197 tests passed, eight files**. The new resolver suite covers all seven weight rows, invalid counts, future family overrides, independent team weights, raw arithmetic, competition ties/direction, missing/zero-weight sides, stale samples, malformed source metadata, adjusted/unadjusted incompatibility, no 2025 fallback, source precision, official observed trench ranks, and no second Power Rating blend. Control tests cover distinct lens selection and retained settings; existing BAL/IND tests preserve Projection and historical counts/values.

```sh
npx vitest run src/lib/nfl/blendedMatchupMetrics.test.ts src/lib/nfl/projectedMatchupMetrics.test.ts src/components/nfl/matchups/MatchupProjectionControls.test.tsx src/components/nfl/matchups/MatchupRedesign.test.tsx src/lib/nfl/matchupSampleWindow.test.ts src/lib/nfl/currentRating2026.test.ts src/lib/nfl/matchupCategoryAdvantage.test.ts src/lib/nfl/matchupMetricsPipeline.test.ts --maxWorkers=2
npx playwright test tests/nfl-blended-lens.spec.ts tests/nfl-projection-lens.spec.ts tests/playwright-analytics-blocking.spec.ts --workers=2
node scripts/generate-nfl-matchup-metrics.mjs --dry-run
npm run build
```

Playwright: **eight passed**, served by `npm run dev -- --host 127.0.0.1 --port 8097 --strictPort` at `http://127.0.0.1:8097`. All specs use `playwright-fixture.ts`; GA/GTM blocking was verified. Desktop 1440px and mobile 390px screenshots were inspected; no horizontal overflow or page errors in the checked flows. Synthetic live data proves BAL 60/40 versus IND 80/20, raw blended values/ranks, separate projection and observed values, and source isolation. Initial responsive test locators were corrected to target the stable category control; a multi-step control test received a local 15-second timeout after concurrent build/browser load exceeded the default five seconds. The final two-worker Vitest run passed.

Producer dry-run passed without writes. A separate `--out=<OS temporary directory>/jkb-blend-conventional-preview.json` run preserved **2,112 raw values**; a Node assertion compared every legacy tuple/rank to the committed artifact and found them identical. Public artifacts were not overwritten.

Focused ESLint covers every changed JS/TS/TSX source and test file and passed. Production build passed with pre-existing duplicate `outsidePocket`, outdated Browserslist and large-bundle warnings. Full app `npx tsc --noEmit -p tsconfig.app.json` remains blocked by the pre-existing `src/lib/mlb/mlbPitcherRegression.ts:28` parse error. A TypeScript compiler-API diagnostic pass scoped to changed application/test files found no errors; this is not a clean full-repository typecheck. Existing React act/router warnings remain in the regression suite. The entire repository suite, live generators, workflows, publishing and deployment were not run.

## First real projected metrics: EPA and success rate (2026-09-06)

Twelve metrics now carry published 2026 projections. Nothing else changed: Power Rating stays model-managed, blend weights, historical filters and the observed 2026/2025 lenses are untouched, and no conventional, trench or market metric gained a projection.

### Inputs

| Input | Seasons | Role |
| --- | --- | --- |
| `data/nfl/nflverse/epa-team-game/` | 2020–2025 | The observed EPA lens's own source. Verified byte-for-byte against `matchup-epa.json`'s `prior-season-full` window, so a projected EPA value and an observed EPA value are the same quantity. |
| `data/nfl/nflverse/success-team-game/` | 2019–2025 | New sibling cache added by this work unit (`scripts/refresh-nfl-success-source-cache.mjs`). Same approved eligible-play filter as the EPA cache plus a present `success` flag. Agrees with RBSDM's published 2025 team success rates — the observed lens's source — to within 0.13 percentage points on every team and metric. |
| `public/data/nfl/teams.json` | — | Canonical 32-team identity. |
| `public/data/nfl/2025/games.json` | 2025 | `asOf` cutoff: the last completed 2025 regular-season kickoff. |

Rejected as inputs: `projected-power-ratings-v04.json` and its personnel/coach/luck components (converting a 0–99 rating into EPA units is exactly the circularity this lens exists to avoid, and the offseason adjustments exist only for 2026, so no season pair can validate them); `full-season-team-metrics.json` opponent-adjusted values (tested as predictors, see below); `manual-adjustments.json` and `context-flags.json` (no historical counterpart to backtest against).

### Candidate methods

All predict season *Y* from full seasons that finished before *Y*, then regress to the prior season's league mean: `p = mu(Y-1) + k * (x - mean(x))`.

- **A** prior full season, raw.
- **A2** prior full season, opponent-adjusted (one-pass opponent-mean, the method `full-season-team-metrics.json` documents).
- **B** two-season recency blend, `w * (Y-1) + (1-w) * (Y-2)`, raw, `w` in 0.5–0.9.
- **B2** the same blend on opponent-adjusted values.
- **C** final-eight blend, `w * full(Y-1) + (1-w) * last8(Y-1)`.
- **D** historical prior plus 2026 offseason adjustments — **not built**. Every available adjustment source exists only for 2026, so there is no season pair on which its mapping to EPA or success-rate units could be estimated or validated. Adding it would be unbacktestable methodology.

Baselines: the prior-season league mean (`k = 0`) and the unshrunk prior season (`k = 1`).

### Backtest

`scripts/research/nfl-projected-metrics-backtest.mjs`. Target seasons 2022–2025 for EPA and 2021–2025 for success rate (each cache's history minus the two seasons a prediction consumes). Hyper-parameters are chosen by leave-one-season-out cross-validation over the other target seasons, so no target season contributes to its own fit and no same-season information reaches a prediction. Targets are the full next season and each team's first five games of it.

Findings, on the full-season target:

- The unshrunk prior season is worse than the league mean for **every** one of the twelve metrics. Regression to the mean is the single largest effect.
- Opponent adjustment (A2, B2) never beat its raw counterpart by more than noise, and lost on rushing. It was dropped: it also cannot be blended, because the runtime refuses to mix an opponent-adjusted projection with an unadjusted observed value.
- The two-season blend beat the single prior season on ten of twelve metrics; `w` between 0.5 and 0.7 was flat, so 0.6 was fixed.
- Shrinkage is strongly family-dependent: offensive passing ~0.55, offensive rushing ~0.45, defensive passing ~0.30, defensive rushing ~0.20.
- The fixed shipped configuration matched or beat the per-fold CV-selected configuration on almost every metric, which is the evidence that the simple fixed choice is not overfit.

Out-of-sample skill versus the league-mean baseline (RMSE reduction, full-season target): offensive EPA/play 9.7%, EPA/pass 10.2%, success rate 10.3%, pass success 11.4%, rush EPA 4.2%, rush success 6.0%; defensive success 3.2%, pass success 3.8%, EPA/play 0.9%, rush success 1.0%, rush EPA 0.7%, EPA/pass −0.3%.

### Shipped method

For every metric, with raw full-season rates defined exactly as the observed lens defines them:

```
x_t = 0.6 * v_t(2025) + 0.4 * v_t(2024)
p_t = mean_t v_t(2025) + k_family * (x_t - mean_t x_t)

k = 0.55  off.epaPerPlay, off.epaPerPass, off.successRate, off.passSuccessRate
    0.45  off.epaPerRush, off.rushSuccessRate
    0.30  def.epaPerPlayAllowed, def.epaPerPassAllowed, def.successRateAllowed, def.passSuccessRateAllowed
    0.20  def.epaPerRushAllowed, def.rushSuccessRateAllowed
```

EPA is `sum(EPA) / sum(eligible plays)`; success rate is `100 * successful eligible plays / eligible plays`. Defensive values are the opponents' offensive production in the same games. Rates are computed once from season sums, never averaged per game. Ranks are competition ranks over unrounded projected values using each metric's existing direction.

Producer: `scripts/generate-nfl-projected-matchup-metrics.mjs`. Output: `public/data/nfl/2026/projected-matchup-metrics.json`, projection version `nfl-projected-comparison-v1.0`.

### Limitations

- Defensive projections carry little out-of-sample skill, and `def.epaPerPassAllowed` carries none at the full-season horizon. Their heavy shrinkage keeps values close to the league mean, but their **ranks are close to noise** and should not be read as confident orderings.
- Shrinkage was fitted to the full-season horizon, matching the artifact's declared `regular-season` horizon. The early-season optimum is materially higher (offensive passing ~0.7), so the projection is deliberately conservative over the first weeks, which is exactly where the Blended lens weights it most.
- Four EPA folds and five success folds is a small sample; family-level rather than per-metric coefficients are the guard against reading noise.
- No personnel, coaching, scheme or injury information is used. A team that changed quarterbacks is projected from what its previous roster did.
- The success cache and RBSDM differ by up to 0.13 percentage points; a projected success rate and an observed success rate are therefore the same quantity to that tolerance, not exactly.

## Roster/coaching-aware simulation (2026-09-06, research only)

`scripts/research/nfl-roster-aware-projection-study.mjs` (+ `nfl-roster-study-diagnostics.mjs`). No production logic or artifact changed.

Question: across 2021->2022, 2022->2023, 2023->2024 and 2024->2025 (128 team-seasons), would a model that adjusts prior-season strength for offseason roster and coaching change beat the shipped `0.6*(Y-1) + 0.4*(Y-2)` + family shrinkage baseline, especially over Weeks 1-4 and 1-6?

**Answer: no.** Mean out-of-sample RMSE versus the shipped baseline across all twelve metrics and three horizons: continuity-tilted Y-2 weight -0.04%, final-eight blend -2.2%, baseline plus learned offseason correction -3.0%, ridge on history only -4.0%, ridge on history plus offseason -5.2%. Not one roster-aware variant wins on average at any horizon. Even a free, unpenalised in-sample fit of the offseason block to the baseline's residual on all 128 rows explains only 1.4-9.2% of residual variance, with negative adjusted R-squared in 22 of 36 metric/horizon cells - an upper bound that no honest out-of-sample model can exceed.

Reconstructed features (all four transitions, no missingness unless noted): head-coach change and Week 1 starting quarterback change from the nflverse schedules file; prior-season passing EPA per dropback for both quarterbacks (109/128 rows have both, the rest are rookies or career backups and carry a neutral delta plus an unknown flag); returning prior-season snap share, overall and by unit (offensive line, skill, defensive line, linebacker, secondary), from snap counts joined to the Week 1 roster through the players table. Coordinator changes, draft capital, free-agent valuation and returning-injury status could not be reconstructed for these seasons from any local or nflverse source and were not modelled.

Signals worth remembering, none of them large enough to ship:

- Defensive continuity is the only offseason block with consistent sign. Head-coach change correlates +0.12 to +0.18 with worse-than-predicted defence and returning defensive snap share -0.13 to -0.16 with better-than-predicted defence, across both horizons. Adjusted R-squared is positive in 8 of 12 defensive cells and negative in most offensive ones.
- Quarterback change moves offensive persistence only slightly (r(Y-1) 0.32 same quarterback versus 0.26 new, Weeks 1-4) and the direction reverses at the full-season horizon.
- Whether Y-2 deserves more weight when continuity is high is **not** supported: the fitted tilt hit the +/-0.25 grid boundary in both directions and flipped sign across folds within the same metric.
- The final-eight blend beats the shipped baseline on defensive EPA allowed at early horizons (+3.9% Weeks 1-4, +3.0% Weeks 1-6 for EPA/play allowed; +1.9% and +2.5% for EPA/pass allowed). This replicates the same finding in the shipping backtest and is the only non-baseline result that has now appeared twice independently.

Recommendation: keep the shipped baseline. The one change worth a scoped follow-up is a defence-only, early-horizon final-eight term, tested on its own. Collecting coordinator history and draft capital is not worth doing first - the ceiling analysis says the features already reconstructed cannot carry a roster-aware model, and four transitions cannot support more parameters regardless of feature quality.

## Market benchmark: do JKB signals beat the closing spread? (2026-09-06, research only)

`scripts/research/nfl-market-vs-jkb-study.mjs` (+ `nfl-market-study-diagnostics.mjs`). No production logic or artifact changed.

Market source: nfldata `games.csv` `spread_line` via the untrimmed nflverse schedules release - the same source `public/data/nfl/matchup-market.json` already documents. 100% coverage of 2015-2025 regular seasons; `spread_line` is the projected home margin (positive means home favoured); a single settled line per game with **no timestamp, no opening line and no movement history**, so it cannot be proven pre-kickoff from the data itself and is not an independently verified closing consensus. Over 2019-2025 the mean market error is -0.06 points on 1,871 games, so the market is treated as unbiased.

Design: 1,871 games, 2019-2025. Pregame JKB strength reconstructed with the shipped 0.6/0.4 prior, family shrinkage, and the shipped fade curve into season-to-date observed form, where "completed" means kickoff-ordered, not nominal week. Rolling origin, testing 2023, 2024 and 2025 (816 games) on models fitted only on earlier seasons. Primary target is market error; no margin is ever derived by subtracting ratings.

**Answer: no.** MARKET+JKB versus the closing spread alone, out of sample: Weeks 1-2 +0.87%, Weeks 1-4 +0.13%, Weeks 1-6 -0.13%, Weeks 1-8 -0.07%, full season -0.22%. Season by season the combined model is worse than the market in 2023 (-0.43%) and 2025 (-0.47%) and marginally better in 2024 (+0.25%).

Why: every JKB feature correlates with the actual margin (r 0.09 to 0.37) but correlates far more strongly with the spread (up to 0.81) and essentially not at all with the market's error (|r| <= 0.055). The market has already priced them. The largest residual correlations - rush success 0.055, rush EPA 0.053, offensive success 0.048 - are the features ridge leans on, but they are within multiple-comparison noise across seventeen features and 1,871 games.

- Edge calibration: predicted-edge sd is 0.63 points and the regression slope of realised market error on predicted edge is 0.38, so a nominal 1-point edge is worth about 0.4 points. No game in the test window produced a 3-point edge.
- ATS by pre-specified bucket, full season: `<1` 49.3% (690 games), `1-2` 51.7% (118), `2-3` 62.5% on 8 games. No monotonicity, and every interval spans 50%.
- Defensive final-eight, isolated after controlling for Vegas: -0.01% at Weeks 1-4, +0.08% at Weeks 1-6, -0.03% full season; r(feature, market error) 0.039 and 0.020 for Weeks 1-6. The football-prediction signal does not survive the market.
- Roster/coaching variables against market error: all |r| <= 0.068. Discarded.
- The one apparent positive is JKB-only beating the market by 3.3% at Weeks 1-2 (r(edge, market error) 0.245). That is 96 games, roughly 1.6 standard errors, and it disappears by Week 4. It is not treated as a finding.

Conclusion: **no genuine early-season ATS edge was found**, and no ATS architecture is recommended. The projection lens should stay what it is - a descriptive team-strength display - and should not be turned into a betting signal on this evidence. Further data collection (a real multi-book closing consensus with timestamps, opening lines and movement) would be a prerequisite for revisiting the question, not an optimisation of this one.

## Line movement and CLV: can JKB beat an EARLY line? (2026-09-06, research only)

`scripts/research/nfl-clv-line-movement-study.mjs` (+ `nfl-clv-study-diagnostics.mjs`). No production logic or artifact changed.

The previous study's stated limitation was market data - one settled line, no opener, no timestamps. This tests the follow-up hypothesis: JKB may find value against an early or stale line even when the closing market prices the same information.

### Market data inventory

Nothing in this repository supports the test. `data/market/betting-lines/` holds nine books with real capture timestamps, but only 16 games, all 2026 Week 1, first captured 2026-08-31 - one week of live collection, no historical depth. `data/nfl/props/historical-market-context-2022-2025.json` and `data/nfl/benchmark/market_lines_2025.csv` are both the same single settled `spread_line` already rejected. The yardage market archive is player props.

The best reproducible external source is nfldata, which publishes three line files beyond `games.csv`:

| File | Content | Seasons | Games | Timing semantics |
| --- | --- | --- | --- | --- |
| `sc_lines.csv` | Westgate SuperContest board | 2013-2020 | 2,043 | Posted Wednesday of game week - uniform, documented, ~3-4 days to kickoff |
| `closing_lines.csv` | Closing spread/total/moneyline | 2006-2018 | 3,415 | Close |
| `initial_lines.csv` | Westgate, SPREAD and TOTAL | **2021 only** | 272 | None recorded |

**None covers 2022-2025**, and no file carries a per-row timestamp, so the requested checkpoint ladder (7d / 72h / 48h / 24h / 12h / 6h / 3h / 1h) cannot be built. Nothing was interpolated to fake one. Two early/late pairs do exist: SuperContest (Wednesday) to close for 2013-2018, and the 2021 `initial_lines` to the settled line.

`initial_lines` is **not a weekly opener**. Absolute movement to close grows monotonically with week - 2.0 points in Week 1 to 4.7 by Week 18 - which is the signature of season-long lookahead lines posted once before the season. Treating it as an opener would have been the "earliest local row" mistake.

### Result

**Classification: D (source insufficient) for 2022-2025, with a weak B-grade signal in the one dataset that has clean timing.**

SuperContest 2013-2018, 952 out-of-sample games (rolling origin, test 2015-2018), JKB fair spread fitted by ridge on earlier seasons only:

- r(edge, CLV) = 0.119; line-move direction correct 56.3% [52.6%, 59.9%]; mean CLV in the JKB direction 0.121 points [0.040, 0.203].
- The naive baselines are 47.6% (always home) and 52.4% (always away). The 95% lower bound of 52.6% only just clears the better naive rule, so the edge over a coin-flip heuristic is marginal.
- Early+JKB does not improve margin prediction (-0.44% RMSE vs the Wednesday line alone). There is little to capture: the Wednesday line is already within 0.36% of the close.
- Fixed buckets are not monotone in direction (55.1 / 54.8 / 55.8 / 54.4 / 58.8%), and ATS at the early line is 373-339-23 = 52.4% at |edge| >= 1 - exactly the -110 break-even.
- Season stability is poor: r = 0.139, 0.035, 0.136, 0.029 for 2015-2018.
- Weeks 1-2 is the strongest band (r 0.193, direction 63.4%, ATS 51-37-3) on 121 games, consistent with the stale-line hypothesis but far short of evidence.
- The CLV/ATS link behaves correctly as a sanity check: plays that earned positive CLV covered 56.3%, plays that did not covered 49.6%.

The 2021 lookahead dataset is the cautionary result. Scored with JKB's blended strength at kickoff it looks spectacular - r(edge, CLV) = 0.633, direction 70.6%, mean CLV 2.07 points, with a clean monotone bucket ladder up to 85.3% direction at 4+. Restricted to what was actually knowable when a preseason lookahead line was on the board (`preseasonOnly`: prior net EPA and prior net success), it collapses to r = 0.033 and direction 52.2% [46.0%, 58.2%]. The entire apparent signal is the information mismatch between when the line was bettable and when JKB was measured, not skill.

Strongest components against future CLV after projecting out the early line (SuperContest): net EPA 0.125, success rate 0.091, rush success 0.081, offensive EPA 0.081. The final-eight defensive signal is absent again (0.002 and 0.013), now failing its third independent test.

### Recommendation

No production change, and no betting logic. Acquiring genuine timestamped multi-book history for 2022-2025 is the only way to answer the question that was actually asked; the strongest available proxy is 7-12 years stale, is a contest board rather than a bettable market, and still shows nothing economically usable. The live `data/market/betting-lines/` collector is already capturing timestamped multi-book snapshots and will become the right dataset for this test after a season or two of accumulation - that is the cheapest path forward, and it requires only patience rather than a purchase.

## Systematic search for conditional market mispricing (2026-09-06, research only)

`scripts/research/nfl-market-mispricing-search.mjs` (+ `nfl-mispricing-state.mjs`, `nfl-mispricing-hypotheses.mjs`, `nfl-mispricing-stats.mjs`, `nfl-mispricing-report.mjs`). No production logic or artifact changed.

Prior work ruled out a universal JKB-beats-Vegas formula, so this stops looking for one and tests **63 specific football hypotheses** - matchup mismatches, results-vs-efficiency disagreement, regression candidates, early-season prior disagreement, situational spots, market structure and a small set of theory-driven interactions. Every candidate has to predict **market error after the spread is projected out**; predicting the game is not enough, because the spread already does that.

Dataset: 3,407 regular-season games, 2013-2025, from committed EPA/success caches plus a per-team-game extras table (turnovers, explosive plays, third down, red zone, return TDs) extracted from nflverse play-by-play. Market error mean 0.042, sd 12.87. Discovery 2013-2021 (2,320 games); confirmation 2022-2025 (1,087 games, never touched during discovery, and the era we care about).

**Result: zero of 63 hypotheses survive Benjamini-Hochberg at q = 0.10.** The best discovery p-value is 0.0034 against a BH critical value of 0.0016. Classification of the full ledger: 44 D (no signal), 10 C (predicts football but already priced), 9 E (condition too rare to test), **0 A, 0 B**.

Every strong-looking cell collapses out of sample. The clearest example is short home underdogs in Weeks 1-6, which is exactly the kind of angle this search was built to find:

| Cell | Discovery 2013-2021 | Holdout 2022-2025 |
| --- | --- | --- |
| back short dog (\|spread\| <= 3), weeks 1-6 | +2.86 pts, 178-135-9, 56.9% | +0.71 pts, 74-80-6, 48.1% |
| back team whose prior rating beats current form, weeks 1-6 | +2.08 pts, 146-104-2, 58.4% | **-1.57 pts**, 48-52-3, 48.0% |
| rush success mismatch | r = +0.062, p = 0.004 | r = -0.005, p = 0.884 |

Of the top ten discovery hypotheses, nine flip sign or collapse to zero on the holdout. Consensus among independent signals does not help and is not monotone (1 signal 58.8%, 2 signals 49.8%, 3 signals 59.0%, 4 signals 46.9%, with the extreme buckets holding 34 and 78 games).

Answers to the specific questions, full sample, partial r against market error after the spread:

- **Does Vegas overreact to W-L over EPA?** No. `recordMinusEpa` partial r = 0.025 (p = 0.16). The strict archetype ("good EPA, bad record") fires on 26 of 3,407 games - too rare to test, not a missed edge.
- **Does Vegas mis-weight recent or final-eight efficiency?** No. Last-5-minus-season r = 0.010; prior final-eight minus prior full r = 0.014. The final-eight defensive signal now fails a fourth independent test.
- **Are pass mismatches priced differently from rush?** Both are priced. Pass EPA mismatch r(margin) 0.108, r(spread) 0.205, partial r(error) 0.020. Rush is the same story. Success-rate versions are marginally larger (0.045, 0.042) but do not replicate.
- **Do regression indicators predict market error?** No. Turnover margin has the strongest football signal in the whole library (r(margin) 0.161) and the strongest spread correlation (0.347), leaving partial r = 0.007. The market prices turnover luck.
- **Is there a favourite/underdog bias after conditioning on quality?** Short dogs look like +0.82 pts full sample (p = 0.027), but that is entirely discovery; the holdout is +0.16 (p = 0.79).
- **Is anything concentrated in Weeks 1-6?** Only in discovery. Nothing survives the split.

Key numbers behave as expected and are the one durable descriptive finding: margins land on exactly 3 in 14.4% of games and exactly 7 in 8.5%, so a modelled point near those numbers is not worth the same as a point elsewhere. That is a pricing consideration, not an edge.

**Recommendation: no production change and no ATS architecture.** No current historical feature set provides credible incremental information beyond the spread. The honest summary of four phases of work is that JKB projections are a good descriptive team-strength product and not a betting model, and the projection lens should stay exactly that. The single most valuable next data acquisition remains genuine timestamped multi-book line history, which the live `data/market/betting-lines/` collector is already accumulating.

## Fair-spread audit and candidate models (2026-09-06, research only)

`scripts/research/nfl-fair-spread-study.mjs` (+ `nfl-fair-spread-report.mjs`). No production logic or artifact changed.

### Current architecture, traced through execution

The shipped projected spread is **not a trained margin model**. It is a two-constant linear conversion of the Power Rating:

```
projectedHomeMargin = 0.24 * (currentOVR_home - currentOVR_away) + 2.0   (0.0 at neutral sites)
```

`src/lib/nfl/jkbPowerNumber2026.ts` -> `scripts/generate-nfl-matchup-projections.mts` -> `public/data/nfl/matchup-projections.json` -> `MatchupModelDetails.tsx`. Model version `jkb-power-number-v1.0.0`, no intercept, no fitted parameters in the artifact (`fittedParameters: []`), no matchup, pass/rush, success-rate or situational term. Current OVR is itself the v0.4 preseason anchor faded into live performance analytics on a 0/1/2/3/4/5+ game curve.

### Circularity audit

Structurally clean, with one bounded flag.

- `0.24` was fitted against **actual home margins** (`res.homeScore - res.awayScore` in `scripts/analysis/nfl-current-ovr-spread-calibration/calibrate.mts`), not against the spread. `spread_line` appears in that script only as a comparison column. No circularity.
- `jkbPowerNumber2026.ts`, `currentRating2026.ts`, `performanceComposite2026.ts` and `performanceMetricsCore2026.ts` contain no market, odds or spread input.
- **Flag:** the v0.4 preseason anchor includes `components.guideRating`, a transcribed external guide rating, which correlates **0.77** with published market win totals across the 32 teams. That correlation is what two independent estimates of team strength would produce anyway, so it is not proof of market derivation - but it cannot be ruled out from the artifact either. Its influence is bounded: weight 0.15, cap +/-3 rating points, which at 0.24 points per OVR point is at most **+/-0.72 points of spread**. Worth resolving before the fair spread is ever described as fully market-independent.

### Candidates and results

3,407 games 2013-2025, leakage-free kickoff-ordered pregame state, rolling origin, out-of-sample test seasons 2023-2025 (816 games). Target is always the actual home margin; no market value is a feature of any candidate.

| Model | MAE | RMSE | r | calib slope |
| --- | --- | --- | --- | --- |
| B single composite strength + home field (structural analogue of production) | 10.391 | 13.325 | 0.369 | 1.014 |
| **C core EPA + success differentials** | **10.343** | **13.257** | **0.381** | **1.027** |
| D core + symmetric matchup terms (nested on C) | 10.371 | 13.285 | 0.376 | 0.993 |
| E regularised combined | 10.351 | 13.266 | 0.379 | 1.023 |
| F separate home/away scoring, then subtract | 10.387 | 13.363 | 0.370 | 1.254 |
| *[reference] settled market spread* | *9.744* | *12.653* | *0.477* | *1.166* |

C wins in every week band, but by 0.5-1.3% RMSE. Matchup terms (D) add nothing once nested on C, which is now the fourth independent confirmation of that result.

**Home field:** fitted as the model intercept at **1.86 points** and strikingly season-stable (1.80 / 1.89 / 1.88). Raw mean home margin over 3,351 non-neutral games is 1.93. Production's fixed 2.0 is well inside this - no change warranted, and no support for a team-specific or season-specific term.

**Calibration:** full-season slope 1.027, i.e. correctly scaled with no correction needed. Residual sd 13.25 points against the market's 12.65 - single NFL games are simply that noisy, so a per-game confidence band would be fake precision and should not be shown.

### Post-model market comparison

Correlation(JKB fair, market) **0.802**, MAE between them **2.75 points**. The independent football model lands in the same neighbourhood as the market, which is the intended result. Edge distribution: 25.0% under 1 point, 19.7% 1-2, 16.7% 2-3, 15.3% 3-4, 23.3% at 4+.

**The critical finding for the disagreement feature:** when JKB and the market differ by 6 or more points, the model is closer to the actual margin only **29.2%** of the time. In Weeks 17-18 that falls to **13.3%** (those weeks are 11.8% of games but 20.8% of large disagreements - the market prices resting starters and the model cannot see them). Even in Weeks 1-16 it is 33.3%. A large disagreement is therefore roughly 2:1 evidence that **the model is wrong, not the market**. That does not make the feature useless, but it must be framed as "investigate why JKB is off here", not "JKB has found value", and Weeks 17-18 should be excluded or flagged.

### 2026 slate and the reason not to ship the candidate

Across 272 matched 2026 games the candidate differs from production by a mean of 3.07 points (max 9.7). The cause is dispersion, not disagreement about who is better:

| | sd | range |
| --- | --- | --- |
| candidate C, Week-1 state | **2.32** | -4.6 to 7.5 |
| production | 5.19 | -11.8 to 13.9 |
| settled market spreads, 2023-2025 | 5.86 | -16.5 to 19.5 |

The candidate's widest 2026 spread is 7.5 points; real NFL Week 1 boards routinely price 13-point favourites. The shipped preseason prior's family shrinkage (k = 0.20-0.55) is correct for projecting a season-long rate and far too aggressive for projecting one game's margin. Candidate C's Weeks 1-4 calibration slope of 1.284 confirms the compression.

Both B and C inherit that shrunk prior, so **this harness never tested a well-dispersed preseason model**, and production's own Week-1 behaviour cannot be replayed historically because the v0.4 anchor exists only for 2026. The 0.5% RMSE gain is therefore not a basis for replacing a model that is better dispersed where it matters most.

**Recommendation: do not replace the production fair spread.** It is structurally sound, market-independent, calibrated to actual margins, and correctly dispersed. The defensible work items are (1) resolve the `guideRating` provenance question, (2) if a disagreement feature is built, frame and filter it per the finding above, and (3) if the preseason spread is ever revisited, fit the shrinkage against single-game margins rather than reusing the season-rate prior.
