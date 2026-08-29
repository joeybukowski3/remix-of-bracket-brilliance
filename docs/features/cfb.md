# College Football product area

Durable router for the JoeKnowsBall College Football surfaces. Methodology is
intentionally elsewhere:

- [../models/cfb-preseason-power.md](../models/cfb-preseason-power.md) owns the
  production **JKB Preseason Power** rating (`cfb-preseason-v1.1-market-anchor`)
  and the MIC/IPR boundary.
- [../plans/active/cfb-model-v2.md](../plans/active/cfb-model-v2.md) owns the
  shadow **CFB Model V2** independent rating (`cfb-ipr-v2.0`).
- External-source ownership and refresh paths:
  [../DATA_SOURCES.md](../DATA_SOURCES.md) ("CFB — CollegeFootballData (CFBD) API
  v2", "CFB — preseason market-anchor baseline (VSiN guide)").

Subject to the authority hierarchy and `KS-007` / `KS-008` / `KS-009` in
[../DECISIONS.md](../DECISIONS.md). This college-football section is distinct from
the separate NCAA basketball / bracket tools.

## Current surface map (verified in `src/App.tsx`)

All routes are children of `CollegeFootballLayout`
(`src/components/cfb/CollegeFootballLayout.tsx`). Route constants:
`src/lib/cfb/routes.ts`. The stack is a **build-time static SPA** — every artifact
is imported at build time via `src/data/cfb/index.ts`; there is no runtime fetch
and no server for CFB.

| Surface | Route | What it shows |
| --- | --- | --- |
| Landing | `/college-football` | Conference standings/SOS view; preseason sorts teams by JKB Preseason Power within each conference. `CollegeFootballLanding.tsx`. |
| Rankings | `/college-football/rankings` | All 138 FBS teams ordered by JKB Preseason Power v1.1, sortable columns, with the independent AP column. `CollegeFootballRankings.tsx`. |
| Schedule | `/college-football/schedule` | Week-addressable schedule with records, JKB ratings, and market odds (`—` when unavailable). `CollegeFootballSchedule.tsx`. |
| Team | `/college-football/team/:teamSlug` | Team page: Power + rank, AP Rank (independent, "NR" when unranked), offense/defense ratings, schedule with opponent Power and market spreads. `CollegeFootballTeamPage.tsx`. |
| Matchup detail | `/college-football/matchup/:gameId` | Multi-section comparison (see below). `CollegeFootballMatchup.tsx`. |
| Conference | `/college-football/conference/:conferenceSlug` | Conference roster + standings context. `CollegeFootballConference.tsx`. |

### Matchup detail sections

| Section | Component | Nature |
| --- | --- | --- |
| Market | `CollegeFootballMarketStrip` | Presentation of `game.odds` (spread, opening/current total). Descriptive only. |
| Power Comparison | `CollegeFootballPowerComparison` | Side-by-side JKB Preseason Power / offense / defense from the production ratings. |
| Season Stat Comparison | `CollegeFootballSeasonStatsComparison` (Offense / Defense / Matchup tabs) | CFBD-derived season stats; `selectMatchupSeasonStatsContext` (`src/lib/cfb/seasonStatsPresentation.ts`). Preseason values are honestly null (`gamesPlayed: 0`); 2025 is a separately labelled dataset, never merged into 2026. |
| Power Rating Line | within `CollegeFootballMatchup.tsx` | Consumer-side line derived from the two teams' JKB Power. |

The game-level `CfbGameModelProjections` fields
(`jkbProjectedSpread`, `jkbProjectedTotal`, `homeWinProbability`, …) exist in the
type but are **all null in production** — the placeholder Model V2 was designed to
fill, not yet promoted.

## Ratings on these surfaces — production vs shadow vs research vs presentation

**Production (rendered):**

- JKB Preseason Power `jkbPowerRating` (**market-informed composite / MIC**),
  `offensiveRating` / `defensiveRating` (statistical), `jkbRank`,
  `sosRemainingRating/Rank`. Methodology:
  [../models/cfb-preseason-power.md](../models/cfb-preseason-power.md).
- Season stat comparison (CFBD box-score stats).
- Market odds strip and schedule odds columns.

**Independent comparison (rendered, non-model):**

- `apRank` / `cfpRank` — official-poll fields, copied in the consumer layer,
  never an input to any rating (`src/data/cfb/season2026/officialRankings.ts`).

**Shadow (not rendered):**

- CFB Model V2 IPR (`cfb-ipr-v2.0`). Browser artifact
  `public/data/cfb/v2/shadow-projections.json` is published but no `.tsx` imports
  it; `CFB_V2_ROLLOUT_STATE = "stage-2-infrastructure-ready"`
  (`src/data/cfb/v2/shadowProjections.ts`). Current committed artifact is
  `asOfWeek: 0`, `healthState: "DEGRADED"`, every record
  `projectionStatus: "unavailable"`. See
  [../plans/active/cfb-model-v2.md](../plans/active/cfb-model-v2.md).

**Research (not a product surface):**

- `src/lib/cfb/research/**` and `data/cfb/research/**` (gitignored corpus) — the
  Phase 2–9 V2 research. No production page or script imports research.
- Statistical/calibration intermediates: `cfb-preseason-v1`,
  `cfb-preseason-v0.2-candidate`, `model-calibration-report.json`.

**Presentation-only helpers:** `format.ts`, `comparison.ts`,
`ratingPresentation.ts`, `schedulePresentation.ts`, `standings.ts`, `rankings.ts`,
`sosPresentation.ts`, `seasonStatsPresentation.ts`, `sectionNav.ts`. These sort,
format, tier, and join published values; they do not recompute any model
(`KS-007`).

## Major artifacts and producers

| Artifact | Producer / command | Consumed by |
| --- | --- | --- |
| `data/generated/cfb/2026-preseason-ratings-v1.1.json` (+ `.csv`, shrinkage audit) | `cfb:build-market-anchor` (`scripts/cfb-build-market-anchor-production.ts`) over `cfb:fetch-data` → `cfb:build-ratings` → `cfb:calibrate` | `src/data/cfb/season2026/ratings.ts` → all CFB pages |
| `data/generated/cfb/2026-schedule-v1.json` | `scripts/cfb-build-ratings.ts` / schedule + odds merge | `src/data/cfb/season2026/schedule.ts` |
| `data/generated/cfb/{2026,2025}-season-stats-v1.json` | `cfb:build-season-stats` (`scripts/cfb-build-season-stats.ts`) | `src/data/cfb/season2026/stats.ts` → Matchup Season Stats |
| `data/generated/cfb/2026-rankings.json` | `cfb:refresh-rankings` (`cfb:fetch-rankings` + `cfb:update-rankings`), workflow `cfb-official-rankings-refresh.yml` | `officialRankings.ts` (AP/CFP) |
| schedule market odds | `cfb:refresh-market-odds` (`cfb:fetch-market-odds` + `cfb:update-market-odds`), workflow `cfb-market-odds-refresh.yml` | schedule + matchup market strip |
| `public/data/cfb/v2/shadow-projections.json` | `cfb:v2:build-shadow` (`scripts/cfb-v2-build-shadow.ts`), workflow `cfb-v2-shadow-refresh.yml` | nothing (shadow) |
| `data/cfb/cfbd/raw/` (gitignored) | `cfb:fetch-data`, `cfb:fetch-transition-teams` | build steps only; React never calls CFBD |

Only odds, official rankings, and the V2 shadow have refresh workflows. The
production power ratings and season stats are regenerated locally and the JSON
committed (`npm run cfb:refresh`, etc.).

## Relevant tests

- `src/pages/cfb/CollegeFootball{Landing,Rankings,Schedule,TeamPage,Matchup}.test.tsx`
  — route wiring, Top-25 uniqueness, AP independence, `—` for missing odds,
  Season Stats tabs.
- `src/data/cfb/season2026/officialRankings.test.ts`, `stats.test.ts`,
  `src/data/cfb/index.test.ts`, `integrity.test.ts` — data-layer contracts.
- `src/lib/cfb/marketAnchor.test.ts` — the MIC blend.
- `src/lib/cfb/production/v2/architectureGuard.test.ts`,
  `scoringSupportMarketFreeGuard.test.ts`,
  `src/data/cfb/v2/shadowProjections.architectureGuard.test.ts` — the IPR/MIC and
  shadow-not-rendered boundaries.
- `src/lib/cfb/{marketOddsRefreshWorkflow,officialRankingsRefreshWorkflow,shadowRefreshWorkflow}.test.ts`
  — workflow-order guards.

## Known limitations / deferred areas

- 2026 is unplayed: season stats and SOS-played are null; there is no in-season
  update path for JKB Preseason Power (only the 75/25 band is active).
- No calibration/validation gate for any CFB rating (`KS-008`); game-level
  projection fields are null placeholders.
- The historical `docs/cfb-model-v2-production-integration-plan.md` states "design
  only — nothing implemented"; the repository now contains a full
  `src/lib/cfb/production/v2/**` implementation, shadow build scripts, a workflow,
  and a published (unrendered) artifact. That plan is superseded as a status
  document by [../plans/active/cfb-model-v2.md](../plans/active/cfb-model-v2.md).
- `docs/cfb-phase-2b-data-pipeline.md` and
  `docs/cfb-preseason-market-anchor-v1.1.md` remain accurate as pipeline / blend
  references but predate this router.
