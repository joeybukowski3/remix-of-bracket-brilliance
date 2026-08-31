# NFL Matchup Analyzer

The current user-facing weekly matchup surface. NFL team-strength methodology
is owned by [NFL power rating](../models/nfl-power-rating.md); Power Number and
spread methodology are owned by
[NFL projected spread](../models/nfl-projected-spread.md). This feature document
owns routes, composition, consumed artifacts, degradation behavior, and
presentation boundaries only. Source provenance is registered in
[Data sources](../DATA_SOURCES.md).

## Routes and implementation

- `/nfl/matchups` — weekly matchup cards in
  [`NFLMatchups.tsx`](../../src/pages/NFLMatchups.tsx).
- `/nfl/matchups/:gameSlug` — the analyzer in
  [`NFLMatchupDetail.tsx`](../../src/pages/NFLMatchupDetail.tsx). Slugs are
  deterministic canonical-team `away-at-home` (or neutral-site `away-vs-home`)
  values resolved by [`matchups.ts`](../../src/lib/nfl/matchups.ts). Unknown
  slugs redirect safely to the list.
- Matchup presentation components live under
  [`src/components/nfl/matchups/`](../../src/components/nfl/matchups/).

The current detail navigation is four hash-addressable tabs, defined in
[`matchupNavigation.ts`](../../src/components/nfl/matchups/matchupNavigation.ts):
Overview, Team Comparison, Availability & Snaps, and Model Details. Category
fragments such as `#comparison-defense` open the corresponding comparison
group. This four-tab implementation supersedes the giant redesign spec's
stacked-section shape as the current feature contract.

There is no current tab literally labelled “Model Analysis.” The live page
splits that user-facing concept between the Overview projection card and the
Model Details tab. A retained
[`MatchupModelAnalysis.tsx`](../../src/components/nfl/matchups/MatchupModelAnalysis.tsx)
component and its tests still exist, but `NFLMatchupDetail.tsx` does not import
it. They are implementation/history evidence, not a fifth live tab.

## Surface behavior

### Overview

[`MatchupOverviewPanel.tsx`](../../src/components/nfl/matchups/MatchupOverviewPanel.tsx)
shows matchup identity, current market context, category summaries, descriptive
advantages/angles, and a distinct model projection card. The projection card
shows:

- the **JKB Projected Spread**, read from the projection artifact;
- the independently sourced **Vegas/current market spread**; and
- **Model vs Market**, calculated only after both values are loaded.

The comparison describes the point gap. It is not labelled or interpreted as
an edge, +EV, best bet, recommendation, cover probability, confidence, or stake
size. If no projection exists, the UI says it is unavailable and does not
estimate one.

### Current OVR and team comparison

Current OVR/OFF/DEF comes only from the shared canonical board loaded by
[`useNflCurrentRating2026.ts`](../../src/hooks/useNflCurrentRating2026.ts) and
resolved for the page by
[`heroModelRatings.ts`](../../src/lib/nfl/heroModelRatings.ts). It is the same
rating shown by the weekly dashboard and other current-rating consumers.

The Team Comparison tab uses
[`MatchupComparisonPanel.tsx`](../../src/components/nfl/matchups/MatchupComparisonPanel.tsx)
and the catalogue/adapter in
[`matchupDisplayMetrics.ts`](../../src/components/nfl/matchups/matchupDisplayMetrics.ts)
to present:

- overall, offense, defense, passing, and rushing comparisons;
- conventional production/efficiency metrics and EPA;
- pass/rush success-rate context;
- offensive-line/defensive-front trench win rates;
- offense-versus-defense unit battles;
- completed-opponent schedule-strength context; and
- descriptive category advantages.

Unavailable metrics remain `N/A`; first downs, third-down rate, and time of
possession are not estimated. Schedule context is descriptive and adjusts no
rating, metric, or projection.

### Samples and periods

Conventional metrics and matchup-display EPA respond to the Season/Last 5 and
historical-blend controls. With the default blend, “Season” is a rolling-eight
matchup-display sample that may cross the prior/current-season boundary. This
sampling contract lives in
[`matchupSampleWindow.ts`](../../src/lib/nfl/matchupSampleWindow.ts).

That rolling-eight display sample is **not Current OVR recency**. Current OVR's
game-count blend is owned by the power-rating model doc and is never recomputed
by the matchup controls.

Success rates and trench metrics do not obey the conventional sample controls:

- RBSDM success rates publish finished rates without denominators, so eligible
  periods are shown side by side by
  [`MatchupPeriodComparison.tsx`](../../src/components/nfl/matchups/MatchupPeriodComparison.tsx).
  They are not blended into an invented combined rate.
- ESPN trench figures are cumulative season values and use their own visible
  period policy in
  [`MatchupTrenches.tsx`](../../src/components/nfl/matchups/MatchupTrenches.tsx).
  They are not wired to Season/Last 5 or blended across incompatible periods.

The inline comparison rows may select the newest already-published visible
period for presentation, while the dedicated period views preserve the
side-by-side source periods. Presentation adapters do not aggregate or refit
these metrics.

### Availability, market, and Model Details

[`MatchupAvailabilityPanel.tsx`](../../src/components/nfl/matchups/MatchupAvailabilityPanel.tsx)
shows official game designation, practice status, generic reserve status, and
offensive/defensive unit snap shares. A historical injury artifact is not
presented as current. Availability is separate context and does not adjust the
projected spread.

[`MatchupMarketProfile.tsx`](../../src/components/nfl/matchups/MatchupMarketProfile.tsx)
keeps the current line/moneyline/total separate from historical ATS/O-U team
profiles and from full-season win-total context. Vegas data does not produce or
alter Current OVR, Power Number, or the projected spread.

[`MatchupModelDetails.tsx`](../../src/components/nfl/matchups/MatchupModelDetails.tsx)
renders the artifact's projection breakdown, team Current OVR/Power Number
components, version/timestamp provenance, methodology explanation, and known
limitations. It is a details/presentation surface over published values. The
authoritative formulas, transforms, calibration, and model meaning remain in
the linked model docs and must not be copied or independently recomputed here.

## Artifacts, loaders, and producers

| Concern | Browser artifact and loader | Producer |
| --- | --- | --- |
| Teams, schedule, results | `public/data/nfl/teams.json`; `public/data/nfl/2026/{games,results}.json` via [`useNflSeasonData.ts`](../../src/hooks/useNflSeasonData.ts) | [`generate-nfl-schedules-results.mjs`](../../scripts/generate-nfl-schedules-results.mjs) |
| Current OVR | `public/data/nfl/2026/{preseason-power-ratings,projected-power-ratings-v04,team-performance-analytics}.json` via [`useNflCurrentRating2026.ts`](../../src/hooks/useNflCurrentRating2026.ts) | v0.4 import, v0.3 artifacts, and [`generate-nfl-team-performance-analytics.mts`](../../scripts/generate-nfl-team-performance-analytics.mts); see the model doc |
| Projected spread | [`public/data/nfl/matchup-projections.json`](../../public/data/nfl/matchup-projections.json) via [`useNflMatchupProjections.ts`](../../src/hooks/useNflMatchupProjections.ts) and [`projectionData.ts`](../../src/lib/nfl/projectionData.ts) | [`generate-nfl-matchup-projections.mts`](../../scripts/generate-nfl-matchup-projections.mts) |
| Conventional metrics | [`public/data/nfl/matchup-metrics.json`](../../public/data/nfl/matchup-metrics.json) via [`useNflMatchupMetrics.ts`](../../src/hooks/useNflMatchupMetrics.ts) | [`generate-nfl-matchup-metrics.mjs`](../../scripts/generate-nfl-matchup-metrics.mjs) |
| EPA | [`public/data/nfl/matchup-epa.json`](../../public/data/nfl/matchup-epa.json) via [`useNflMatchupEpa.ts`](../../src/hooks/useNflMatchupEpa.ts) | [`generate-nfl-matchup-epa.mjs`](../../scripts/generate-nfl-matchup-epa.mjs) |
| Success rate | [`public/data/nfl/matchup-success-rates.json`](../../public/data/nfl/matchup-success-rates.json) via [`useNflSuccessRates.ts`](../../src/hooks/useNflSuccessRates.ts) | [`generate-nfl-rbsdm-success-rates.mjs`](../../scripts/generate-nfl-rbsdm-success-rates.mjs) |
| Trenches | [`public/data/nfl/matchup-trench-metrics.json`](../../public/data/nfl/matchup-trench-metrics.json) via [`useNflTrenchMetrics.ts`](../../src/hooks/useNflTrenchMetrics.ts) | [`generate-nfl-espn-trench-metrics.mjs`](../../scripts/generate-nfl-espn-trench-metrics.mjs) |
| Injuries/snaps | [`public/data/nfl/matchup-injuries.json`](../../public/data/nfl/matchup-injuries.json) via [`useNflMatchupInjuries.ts`](../../src/hooks/useNflMatchupInjuries.ts) | [`generate-nfl-matchup-injuries.mjs`](../../scripts/generate-nfl-matchup-injuries.mjs) |
| Market | [`public/data/nfl/matchup-market.json`](../../public/data/nfl/matchup-market.json) via [`useNflMatchupMarket.ts`](../../src/hooks/useNflMatchupMarket.ts) | [`generate-nfl-matchup-market.mjs`](../../scripts/generate-nfl-matchup-market.mjs) |

Except for the schedule needed to identify the matchup, enrichment artifacts
are independent failure domains. A missing/malformed enrichment leaves only its
own rows or panels unavailable; no fallback recomputes it from another source.

## Boundaries

- Power rating is not projected spread; projected spread is not market
  comparison; market comparison is downstream presentation.
- Model vs Market is not an edge, +EV claim, best bet, or recommendation.
- The rolling-eight matchup display does not define Current OVR recency.
- Success/trench source periods stay distinct where a blend would be invalid.
- Presentation helpers resolve, compare, rank, and format already-published
  values. They do not own or recompute model methodology.
- The historical giant redesign specification remains valuable implementation
  evidence, but its old section inventory and future intentions are not merged
  silently into this current four-tab contract.

## Relevant tests

- [`NFLMatchups.test.tsx`](../../src/pages/NFLMatchups.test.tsx) and
  [`matchups.test.ts`](../../src/lib/nfl/matchups.test.ts): weekly list, route
  identities, and cards.
- [`MatchupAnalyzer.test.tsx`](../../src/components/nfl/matchups/MatchupAnalyzer.test.tsx),
  [`MatchupAnalyzerPhase2.test.tsx`](../../src/components/nfl/matchups/MatchupAnalyzerPhase2.test.tsx),
  [`MatchupRedesign.test.tsx`](../../src/components/nfl/matchups/MatchupRedesign.test.tsx),
  and [`MatchupPolish.test.tsx`](../../src/components/nfl/matchups/MatchupPolish.test.tsx): current detail composition and navigation.
- The retained [`MatchupModelAnalysis.test.tsx`](../../src/components/nfl/matchups/MatchupModelAnalysis.test.tsx),
  [`projectionData.test.ts`](../../src/lib/nfl/projectionData.test.ts), and
  [`matchupHeroMigration.test.ts`](../../src/lib/nfl/matchupHeroMigration.test.ts):
  model terminology, market boundary, and canonical Current OVR use; the first
  does not by itself prove that component is mounted on the live page.
- [`matchupSampleWindow.test.ts`](../../src/lib/nfl/matchupSampleWindow.test.ts),
  [`MatchupSuccessRate.test.tsx`](../../src/components/nfl/matchups/MatchupSuccessRate.test.tsx),
  [`MatchupTrench.test.tsx`](../../src/components/nfl/matchups/MatchupTrench.test.tsx),
  [`MatchupInjuries.test.tsx`](../../src/components/nfl/matchups/MatchupInjuries.test.tsx),
  [`MatchupMarket.test.tsx`](../../src/components/nfl/matchups/MatchupMarket.test.tsx),
  and [`MatchupEpa.test.tsx`](../../src/components/nfl/matchups/MatchupEpa.test.tsx):
  sampling, period, availability, market, and EPA degradation contracts.
