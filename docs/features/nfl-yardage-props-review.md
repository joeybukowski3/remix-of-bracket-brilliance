# NFL Yardage Props Review

The current read-only surface for reviewing passing, rushing, and receiving
yardage projections beside optional market and opponent context. This document
describes the UI and artifact flow; it does not promote the underlying research
models or duplicate their formulas.

## Route and implementation

- **Route:** `/nfl/yardage-props-review`, registered in
  [`src/App.tsx`](../../src/App.tsx).
- **Page:**
  [`NFLYardagePropsReview.tsx`](../../src/pages/nfl/NFLYardagePropsReview.tsx).
- **Presentation:**
  [`src/components/nfl/yardage-review/`](../../src/components/nfl/yardage-review/).
- **Read-only adapters:**
  [`src/lib/nfl/props/review/`](../../src/lib/nfl/props/review/).
- **Research/generation namespace:**
  [`src/lib/nfl/props/`](../../src/lib/nfl/props/) and its durable phase
  architecture note [`README.md`](../../src/lib/nfl/props/README.md).

The committed page is currently fixed to season 2026 and exposes Week 1 as its
only week option. Passing, rushing, and receiving are separate market tabs.
Filters cover game, position where applicable, Matchup Score band, and line
availability; sorting is presentation-only. Desktop uses a table and compact
layouts use cards.

Rows expand into independently collapsible “Show the Work,” “Player Last 10,”
and “Opponent Last 10” sections. The detail view shows the artifact's
market-specific projection components, role/fallback provenance, estimated
range, optional sportsbook difference, Matchup Score components, opponent
EPA/success/production-allowed context, and historical result/line context. It
does not refit a model or rebuild a score.

## Current artifacts and consumers

| Role | Artifact | Loader/consumer | Producer |
| --- | --- | --- | --- |
| Current-week projection rows | [`public/data/nfl/2026/yardage-projections.json`](../../public/data/nfl/2026/yardage-projections.json) | [`useNflYardageProjections.ts`](../../src/hooks/useNflYardageProjections.ts) | [`generate-nfl-current-week-yardage-projections.ts`](../../scripts/generate-nfl-current-week-yardage-projections.ts), validated by [`validate-nfl-current-week-yardage-projections.mjs`](../../scripts/validate-nfl-current-week-yardage-projections.mjs) |
| Current player-prop market | [`public/data/nfl/nfl-yardage-market.json`](../../public/data/nfl/nfl-yardage-market.json) | [`useNflYardageMarket.ts`](../../src/hooks/useNflYardageMarket.ts), exact join in [`yardageMarketJoin.ts`](../../src/lib/nfl/props/review/yardageMarketJoin.ts) | [`fetch-nfl-yardage-market.mjs`](../../scripts/fetch-nfl-yardage-market.mjs) |
| Detail history | [`public/data/nfl/2026/yardage-history.json`](../../public/data/nfl/2026/yardage-history.json) | [`useNflYardageHistory.ts`](../../src/hooks/useNflYardageHistory.ts), views in [`yardageHistoryView.ts`](../../src/lib/nfl/props/review/yardageHistoryView.ts) | [`generate-nfl-yardage-history.mjs`](../../scripts/generate-nfl-yardage-history.mjs) |
| Opponent context | `public/data/nfl/matchup-{epa,success-rates,production-allowed}.json` plus [`teams.json`](../../public/data/nfl/teams.json) | [`useNflYardageOpponentContext.ts`](../../src/hooks/useNflYardageOpponentContext.ts), adapter [`opponentContext.ts`](../../src/lib/nfl/props/review/opponentContext.ts) | the shared NFL matchup EPA, RBSDM success-rate, and production-allowed producers registered in [Data sources](../DATA_SOURCES.md) |

The projection artifact is the only blocking data dependency for the base
page. Market and each opponent-context artifact fail independently: projections
remain visible while affected fields report unavailable/N/A. Market lines join
only on exact canonical `playerId` within the same market. No name, team, fuzzy,
cross-market, or synthetic-line fallback is allowed.

The scheduled producers are
[`nfl-yardage-projections.yml`](../../.github/workflows/nfl-yardage-projections.yml)
and [`nfl-yardage-market.yml`](../../.github/workflows/nfl-yardage-market.yml).
They are production-writing workflows; ordinary feature verification must not
trigger them.

## Freshness and current-week behavior

[`freshness.ts`](../../src/lib/nfl/props/review/freshness.ts) classifies
projection, depth-chart, sportsbook, and opponent-context timestamps on their
separate expected cadences. The compact status uses the oldest available
opponent-context timestamp as that group's signal. Freshness is diagnostic
presentation only; it does not change a projection or Matchup Score.

The current-week generator consumes committed schedule, roster/depth-chart,
historical feature/outcome/reference, team environment, and current game-market
inputs, then writes the versioned projection rows. At a high level, passing
starter resolution prefers a unique sourced rank-1 active QB. An absent or
ambiguous source falls back deterministically to prior rolling passing evidence
and then a roster-only candidate, with uncertainty/provenance flags preserved.
It never silently picks among ambiguous sourced rank-1 entries.

## Projection, Matchup Score, and market comparison

- **Projection** is the player's expected yardage point estimate (and interval)
  for one market. It is the primary numeric output on the page.
- **Matchup Score** is a structurally separate 0–100 football-environment
  research/presentation value stored in the row's own `matchupScore` block.
  The UI reads that block verbatim. It is not calculated from projected yards,
  and neither value is a fallback for the other.
- **Projection minus sportsbook line** is shown as a literal raw difference
  only when an exact canonical line exists. The UI labels it research context,
  not a recommendation.
- **Prop Edge** remains unavailable as a promoted/calibrated product concept.
  The repository does not construct the historical audit's formal prop-edge
  artifact or license Over/Under, +EV, confidence, or best-bet language. A raw
  difference on the review surface does not satisfy or bypass that gate.
- The opponent “Team Edge” is a separate rank-difference display from the shared
  matchup context adapter. It is explicitly distinct from both Matchup Score
  and prop edge.

No review helper recomputes projection methodology or Matchup Score weights.
Historical/research documents remain the location for those details.

## Status conflict: current UI, non-promoted model stack

The current committed product behavior and historical promotion evidence do not
say the same thing, and this document does not silently reconcile them:

- The route, a current-week `yardage-projections.json` artifact, weekly
  generator/validator, market ingestion, history artifact, freshness UI, and
  review tests now exist and are current product behavior.
- [`nfl-cross-market-projection-review.md`](../nfl-cross-market-projection-review.md)
  classified passing, rushing, and receiving as research baselines and said
  none was production-ready. It identified remaining calibration, role/history,
  and interval gates. No later authoritative model doc or decision registry
  entry found in this pass formally promotes those yardage models.
- [`nfl-matchup-score-research.md`](../nfl-matchup-score-research.md) calls the
  Matchup Score research-only and not a calibrated probability. The score is
  now present in the current-week artifact/UI, but that is presentation/product
  existence, not evidence of model promotion.

Accordingly, describe the **surface and artifacts as current**, and the
**underlying yardage projection and Matchup Score methodologies as
research/non-promoted** until an authoritative promotion decision or model doc
supersedes those reviews.

## Unresolved source-policy conflict

[Data sources](../DATA_SOURCES.md) records an unresolved conflict. The current
yardage-market producer uses Parlay API and a diagnostic The Odds API
cross-check through keyed/paid access, and the public market artifact is
consumed by this page. The older NFL free-first mandate in
[`nfl-data-inventory.md`](../nfl-data-inventory.md) forbids paid vendors, paid
The Odds API use, and player-props products for the NFL pipeline. The current
implementation proves use; it does not prove the mandate was superseded.

This feature doc records the conflict without approving the paid source,
removing the UI, or declaring the free-first rule resolved. Missing or
policy-blocked market data must leave the market/difference unavailable while
the projection and Matchup Score remain separate.

## Relevant tests

- [`NFLYardagePropsReview.test.tsx`](../../src/pages/nfl/NFLYardagePropsReview.test.tsx):
  markets, filters, sorting, exact no-line behavior, expandable detail/history,
  and freshness states.
- [`yardageMarketJoin.test.ts`](../../src/lib/nfl/props/review/yardageMarketJoin.test.ts),
  [`reviewFilters.test.ts`](../../src/lib/nfl/props/review/reviewFilters.test.ts),
  [`playerDetailView.test.ts`](../../src/lib/nfl/props/review/playerDetailView.test.ts),
  [`freshness.test.ts`](../../src/lib/nfl/props/review/freshness.test.ts), and
  [`opponentContext.test.ts`](../../src/lib/nfl/props/review/opponentContext.test.ts):
  read-only joins, details, diagnostics, and independent context.
- [`yardageHistoryView.test.ts`](../../src/lib/nfl/props/review/yardageHistoryView.test.ts),
  [`NflYardagePlayerLast10Table.test.tsx`](../../src/components/nfl/yardage-review/NflYardagePlayerLast10Table.test.tsx),
  and [`NflYardageOpponentLast10Table.test.tsx`](../../src/components/nfl/yardage-review/NflYardageOpponentLast10Table.test.tsx):
  player/opponent history presentation.
- [`currentWeekGenerator.test.ts`](../../src/lib/nfl/props/currentWeekGenerator.test.ts),
  [`matchupScore.test.ts`](../../src/lib/nfl/props/matchupScore.test.ts), and
  [`validate-nfl-current-week-yardage-projections.test.mjs`](../../scripts/validate-nfl-current-week-yardage-projections.test.mjs):
  current-week artifact construction, projection/score separation, and schema
  validation.
