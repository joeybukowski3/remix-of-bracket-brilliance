# NFL product area

This document routes durable product context for the current NFL surfaces. Model
methodology is intentionally elsewhere: [NFL power rating](../models/nfl-power-rating.md)
owns Current OVR, and [NFL projected spread](../models/nfl-projected-spread.md)
owns Power Number and the JKB projected spread. External-source ownership and
refresh paths live in [Data sources](../DATA_SOURCES.md).

## Current surface map

All public NFL routes are children of `NflPlatformLayout` in
[`src/App.tsx`](../../src/App.tsx), with shared navigation in
[`NflSectionSidebar.tsx`](../../src/components/nfl/NflSectionSidebar.tsx).

| Surface | Routes | Current relationship |
| --- | --- | --- |
| Weekly Command Center | `/nfl` | Week-addressable schedule hub. It joins the canonical schedule to Current OVR, the JKB projected spread, the current game market, Model vs Market, and top weekly fantasy projections. |
| Schedule and standings | `/nfl/schedule`, `/nfl/standings` | Season schedule/results views derived from the canonical season artifacts. |
| Team schedules | `/nfl/team-schedules`, `/nfl/team-schedules/:teamSlug` | Team-by-team schedule with opponent Current OVR, current market line/total, and JKB projected spread. The route without a team redirects to a canonical team. |
| Power Ratings | `/nfl/power-ratings` | Public Current OVR/OFF/DEF board. See the power-rating model doc rather than inferring its method from presentation code. |
| Matchup Analyzer | `/nfl/matchups`, `/nfl/matchups/:gameSlug` | Weekly cards and a four-tab matchup detail surface. See [NFL Matchup Analyzer](nfl-matchup-analyzer.md). |
| Yardage Props Review | `/nfl/yardage-props-review` | Read-only passing, rushing, and receiving yardage projection review with optional market and opponent context. See [NFL Yardage Props Review](nfl-yardage-props-review.md). |
| DraftKings DFS Contest Analyzer | `/nfl/dfs` | User-supplied DK NFL Classic salary slate compared with canonical weekly fantasy projections and research. See [NFL DFS Contest Analyzer](nfl-dfs-contest-analyzer.md). |
| Other current NFL research | `/nfl/analytics`, `/nfl/super-bowl`, `/nfl/coach-of-year`, `/nfl/guide`, `/nfl/guide/regression`, `/nfl/guide/team/:teamSlug` | Analytics, futures, award, season-guide, regression, and team-guide views. `/nfl/2026-guide` redirects to `/nfl/guide`. |

The command center is assembled by
[`useNflWeeklyDashboard.ts`](../../src/hooks/useNflWeeklyDashboard.ts) and
[`weeklyDashboard.ts`](../../src/lib/nfl/weeklyDashboard.ts), then rendered by
[`WeeklyCommandCenter.tsx`](../../src/components/nfl/weekly-dashboard/WeeklyCommandCenter.tsx).
Its fantasy cards consume the same canonical weekly fantasy projection artifact
as the fantasy and DFS pages; they do not create an NFL-specific fantasy
projection. Fantasy authority is documented in
[Fantasy weekly projections](../models/fantasy-weekly-projections.md) and
[Fantasy Weekly Rankings](fantasy-weekly-rankings.md).

## Terms that must remain distinct

- **Current OVR / Power Rating / JKB Power** is the canonical current 1–99
  team-strength presentation. OFF and DEF are companion unit ratings. The board
  is composed from approved artifacts at load/generation time; it is not the
  matchup display's rolling sample.
- **Power Number** is the downstream, average-relative NFL-points representation
  of Current OVR used by the spread model. It is not another Current OVR and is
  not a sportsbook line.
- **JKB Projected Spread** is the completed model output for a game, derived
  downstream of the Current OVR board. It is distinct from both teams' Power
  Numbers and from the market.
- **Model vs Market** is a consumer-side, descriptive comparison between the
  already-produced JKB spread and the separately loaded market spread. It is
  presentation only, not a model input, edge, +EV claim, best bet, pick, or
  calibrated probability.
- **Yardage projection** is a player/market-specific expected-yard output in the
  current-week yardage artifact. It is not Current OVR, a game spread, Matchup
  Score, or a fantasy-points projection.
- **Matchup Score** on the yardage surface is a separate 0–100
  football-environment research/presentation value stored beside the yardage
  projection. It is not derived from projected yards and is not a prop edge.
- **DFS projection/ranking presentation** consumes canonical JKB Full PPR
  weekly fantasy projections, then ranks only the uploaded slate for display.
  It is not a DraftKings-scoring projection and does not recompute fantasy
  projections.

## Data and artifact families

- **Canonical identity and season data:**
  [`public/data/nfl/teams.json`](../../public/data/nfl/teams.json) plus
  `public/data/nfl/<season>/games.json` and `results.json`, loaded by
  [`useNflSeasonData.ts`](../../src/hooks/useNflSeasonData.ts). Team/name
  normalization is centralized under
  [`src/lib/nfl/identity/`](../../src/lib/nfl/identity/) and shared fantasy
  production identity helpers are reused where player identity crosses into
  fantasy/DFS.
- **Current OVR inputs:** season `preseason-power-ratings.json`,
  `projected-power-ratings-v04.json`, and `team-performance-analytics.json`.
  There is no standalone browser artifact containing the composed Current OVR
  board; every current consumer uses the shared current-rating path.
- **Projected spread:**
  [`public/data/nfl/matchup-projections.json`](../../public/data/nfl/matchup-projections.json).
- **Matchup context:** `public/data/nfl/matchup-{metrics,epa,success-rates,trench-metrics,injuries,market,production-allowed}.json`.
  These are independent failure domains; missing optional context stays N/A
  rather than being estimated.
- **Yardage review:** season `yardage-projections.json` and
  `yardage-history.json`, plus season-agnostic `nfl-yardage-market.json` and
  shared matchup/opponent artifacts. Historical research material remains
  under `data/nfl/props/`.
- **Fantasy-linked weekly data:**
  `public/data/fantasy/projections/<season>/week-<NN>.json` is the production
  projection/ranking authority; `public/data/fantasy/weekly-research/<season>/week-<NN>.json`
  is optional context. NFL consumers do not fall back to the superseded
  `public/data/fantasy/weekly/` family.
- **Source caches:** `data/nfl/nflverse/` contains manifest-verified schedule,
  roster, player, depth-chart, injury, snap, EPA, play-volume, and performance
  caches. Shared cache/provenance validation lives in
  [`nfl-source-cache.mjs`](../../scripts/lib/nfl-source-cache.mjs). Browser
  surfaces consume generated public artifacts, not raw caches.

## Current, research, presentation, and historical status

**Production/current:** the public routes above; the canonical Current OVR
consumer path; `jkb-power-number-v1.0.0` projected-spread artifact; schedule,
market, matchup-context, and fantasy weekly artifacts consumed by those routes.
“Current” describes committed product behavior, not a claim that every
underlying research model cleared a promotion gate.

**Research/non-promoted:** the yardage projection families and Matchup Score
retain their research classifications from the historical reviews even though
a current-week artifact and review UI now exist. The internal
`/internal/jkb-nfl-v03-review-7f3c9a` route and offline calibration/backtest
outputs are research surfaces, not promoted public methodology.

**Presentation-only:** Model vs Market; category/unit advantage summaries;
yardage heat, bands, raw projection-minus-line difference, and opponent “Team
Edge” context; DFS salary/JKB slate ranks, Rank Diff, points/$1K, filters, and
heat tones. These layers may sort, format, join, or compare published values;
they do not redefine the upstream models.

**Historical/superseded:** `nfl-spread-v0.1.0` has no live consumer and is
retained only under the legacy analysis path. `nfl-power-v0.3.1` still supplies
preseason anchors and maintains review/history artifacts, but its live overall
rating is superseded by canonical Current OVR. The earlier
`weekly-fantasy-ranking-artifact-v1` remains present but has no live weekly NFL
consumer.

## Shared guarantees

- Model formulas, weights, transforms, calibration, and interpretation belong
  to model docs, not this router or presentation helpers.
- Market data is joined only after independent model outputs exist.
- Missing optional artifacts degrade the affected context to unavailable/N/A;
  consumers do not fabricate model outputs or silently substitute another
  season/week.
- The historical Matchup Analyzer redesign specification, audits, and phase
  reports are implementation/history evidence. Current pages, tests, decisions,
  and current model docs define the committed product contract.
