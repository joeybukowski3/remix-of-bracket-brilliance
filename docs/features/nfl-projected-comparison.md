# NFL Team Comparison: 2026 Projection

Status: framework implemented; only the canonical JKB Power Rating is currently available. No new statistical model or generated statistical values are published by this work unit. Existing observed artifacts and sample policies remain unchanged.

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

`MatchupDataControls` adds `2026 Projection` alongside unchanged `Season` and `Last 5`. The historical-blend state is preserved but hidden while projecting; selecting an observed window restores it. The default remains Season + historical blend ON. No new full-2025 filter or relabeling of existing controls is introduced.

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
