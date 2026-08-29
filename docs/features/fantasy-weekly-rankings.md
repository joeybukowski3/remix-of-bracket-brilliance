# Fantasy Weekly Rankings (surface)

The user-facing weekly fantasy rankings surface and its production behavior.
Methodology (the projection formula, scoring, context adjustments, fallback
rules) is owned by
[../models/fantasy-weekly-projections.md](../models/fantasy-weekly-projections.md)
and is **not** duplicated here. Feature-area context:
[fantasy-football.md](fantasy-football.md).

Subject to the authority hierarchy in [../DECISIONS.md](../DECISIONS.md)
(`KS-007`, `KS-008`, `KS-009`).

---

## Route & component

- **Routes:** `/fantasy-football/weekly-rankings` (canonical) and
  `/fantasy-football` with `?view=weekly` (the default landing mode), both in
  `src/App.tsx`.
- **Page/component:** `src/pages/FantasyWeeklyRankings.tsx`. The landing page
  `src/pages/FantasyFootball.tsx` renders this same component in-place for the
  default `weekly` mode.
- **Table / panels:** `src/components/fantasy/WeeklyFantasyRankingsTable.tsx`,
  `ProjectionMethodologyPanel.tsx` ("How JKB Projections Work"),
  `WeeklyStatsGlossary.tsx`, `FantasyRankingModeNav.tsx`.

## Artifact consumed & producer

- **Consumes:** the production weekly **projection** artifact
  `weekly-fantasy-projection-production-artifact-v2` at
  `public/data/fantasy/projections/<season>/week-<NN>.json`, via
  `useWeeklyFantasyProjectionArtifact` →
  `src/lib/fantasy/weekly/projections/production/artifactLoader.ts`
  (`loadWeeklyFantasyProjectionState`).
- **Producer:** `scripts/generate-fantasy-weekly-projections.ts`
  (`fantasy:projections:generate`, alias `fantasy:weekly:publish`); validator
  `scripts/validate-fantasy-weekly-projections.ts`.
- The artifact's `rows` are **already the ranking authority** — pre-sorted
  descending by `projectedFantasyPoints` with `positionRank` written on each row.
  The hook docstring and loader both state they never calculate or re-sort
  ranks.

## Season / week resolution

- Season is the constant `WEEKLY_RANKINGS_SEASON = 2026`
  (`src/lib/fantasy/weeklyRankings.ts`).
- Week comes from `resolveNflWeekSelection(games, { search: searchParams })`
  against the loaded NFL schedule (`useNflSeasonData`), i.e. the shared
  query-addressable `?week=` selection. The week `<select>` writes `?week=` back
  to the URL.
- If no regular-season schedule is available, `week === null` and the page shows
  "No regular-season schedule is available yet." (no table).
- If schedule data errors but a week is still selected, a non-blocking amber
  notice is shown and the requested week is kept.

## Missing / unavailable behavior

`useWeeklyFantasyProjectionArtifact` returns one of `loading | ready | missing | error`:

- **`missing`** → heading "Week _N_ rankings are not available yet" plus
  "This page will not substitute Rest-of-Season or another week's rankings." No
  table renders.
- **`error`** → "Week _N_ rankings could not be loaded" (artifact failed
  validation or could not be read).
- **`loading`** → "Loading Week _N_ rankings…".

Guarantees (verified in code and
`src/pages/FantasyWeeklyRankings.test.tsx` / the projection loader):

- **No stale-week relabeling.** A failed generation run never overwrites or
  re-stamps the previous week's artifact; the loader does not alter
  `generatedAt` / `inputAsOf`.
- **No cross-week substitution.** `loadWeeklyFantasyProjectionState` returns
  `missing` when `artifact.season`/`artifact.week` ≠ requested — it never renders
  another week's file. Test: "fails safely when the selected weekly artifact is
  missing, and never substitutes another week".
- **No ROS fallback.** The page never falls back to the Rest-of-Season board or
  to PAR when the weekly artifact is missing.
- **No consumer-side re-ranking / recomputation.** This remains current: the
  table renders the artifact's `positionRank` order; user column sorting is a
  view-only re-sort of the displayed rows and does not change the stored
  ranking authority or the projected-points values (test: "sorts research by
  view semantics… keeps … authority" and "defaults to Rank View while projected
  points remain raw in both views"). Both this page and the NFL Weekly Command
  Center read the identical artifact through the same hook.

## Research / context joins shown alongside ranking output

- Weekly research/context (`weekly-fantasy-research-artifact-v1`,
  `public/data/fantasy/weekly-research/<season>/week-<NN>.json`) is joined via
  `useWeeklyFantasyResearchRows` → `joinWeeklyFantasyResearchRows` by **exact
  `playerId`** only.
- Missing/mismatched research degrades the affected display fields to `N/A` and
  raises a non-blocking amber notice ("Some weekly research context is
  unavailable; affected display fields show N/A. Projections and rankings remain
  available.").
- Displayed beside the ranking: opponent, season PPG, last-5 trend, opponent FPA
  (season / last-5), position-specific edge/evidence columns, a composite
  matchup grade + 0–100 score (`calculateWeeklyMatchupComposite`), and an
  expandable per-player details drawer.
- Copy repeatedly states matchup/research context "does not independently change
  the displayed JKB projection". Research is **never** an input to the projection
  or the rank.

## Relationship to the weekly projection model doc

The displayed rank order, the projected-points values, the Full PPR scoring, the
bounded market/FPA context adjustments, the Week-1 baseline-only behavior, and
the "not an edge / +EV / pick" framing (`KS-008`) are all defined by
[../models/fantasy-weekly-projections.md](../models/fantasy-weekly-projections.md).
This surface only renders that artifact and its joined context. The
"How JKB Projections Work" panel may source copy **only** from
`src/lib/fantasy/weekly/projections/production/methodology.ts`.

## Historical / superseded: `weekly-fantasy-ranking-artifact-v1`

- Path `public/data/fantasy/weekly/<season>/week-<NN>.json`; producer
  `scripts/generate-fantasy-weekly-rankings.ts` (`fantasy:weekly-rankings`);
  authority module `src/lib/fantasy/weekly/productionAuthority.ts`
  (`weekly-fantasy-authority-v1.0.0`); loader hook
  `src/hooks/useWeeklyFantasyRankingArtifact.ts`.
- It is an earlier Phase 2 baseline ranking artifact (ranks by preseason-ROS /
  current-season PPG plus descriptive context).
- **Verified current status:** its artifact, producer, schema, and tests are
  still present and maintained (`public/data/fantasy/weekly/2026/week-01.json`
  is committed and schema-validated). Its loader hook
  `useWeeklyFantasyRankingArtifact` is imported **only by its own test** —
  **no page or component consumes it.** So: **currently no live consumer**, and
  it is **superseded for public weekly-ranking consumption** by the production
  projection artifact.
- It is **not formally retired.** There is no `docs/DECISIONS.md` entry recording
  its removal and its pipeline remains wired. Do not describe it as deleted or
  decommissioned.

## Operational-doc conflict (not resolved here)

[../fantasy-weekly-production-operations.md](../fantasy-weekly-production-operations.md)
describes `fantasy:weekly-rankings` / `public/data/fantasy/weekly/<season>/`
(the `weekly-fantasy-ranking-artifact-v1` path) as the canonical static artifact
the public consumers read. Current code does **not** match that — this page
consumes the production **projection** artifact
(`public/data/fantasy/projections/<season>/`). Per the authority hierarchy in
[../DECISIONS.md](../DECISIONS.md) (current implementation + tests +
[../DATA_SOURCES.md](../DATA_SOURCES.md), whose consumer list names
`FantasyWeeklyRankings.tsx` and the projection artifact), the projection
artifact is treated as current. The operations doc was **not modified** in this
pass and should be reconciled in a later operations-doc update. This mirrors the
"Open conflict" note in the weekly projection model doc.

## Relevant tests

- `src/pages/FantasyWeeklyRankings.test.tsx` — canonical projection hook usage
  and preserved artifact order; missing → no substitution; distinct Weekly/ROS
  modes; projection labelled a "projection" not a bare ROS PPG; view-only sort
  keeps the ranking authority and projected values stable; research-context
  degradation to `N/A`; methodology panel present; query-addressable week.
- `src/lib/fantasy/weekly/projections/production/*.test.ts` — artifact
  generation, methodology derivation, context layer.
- `src/lib/fantasy/weekly/consumerBoundaries.test.ts` — ROS board isolation.
- `src/hooks/useWeeklyFantasyRankingArtifact.test.tsx` — the superseded v1
  artifact's only importer.
- `src/lib/nfl/dfs/*` compatibility tests — season/week mismatch is blocking;
  artifact age is a warning only.

## Not this

- Not the ROS PAR board, not the season-long draft board, not the ROS shadow
  rank, not the superseded `weekly-fantasy-ranking-artifact-v1`.
- No projection-formula, scoring-coefficient, or context-coefficient detail —
  those live in the model doc.
- A projection or a projection-vs-market gap is not an edge, +EV claim, best
  bet, pick, or calibrated probability (`KS-008`).
