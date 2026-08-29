# Fantasy Draft Preview (surface)

The `/fantasy-football/draft-preview` surface: the supplied Sleeper 2026 draft
board shown next to existing JoeKnowsBall authorities, with snake-draft, starting
roster, and personal target tooling. Feature-area context:
[fantasy-football.md](fantasy-football.md). PAR methodology is owned by
[../models/fantasy-par.md](../models/fantasy-par.md) and is not restated here.

Subject to the authority hierarchy in [../DECISIONS.md](../DECISIONS.md)
(`KS-007`).

---

## Route & paths

- **Route:** `/fantasy-football/draft-preview` (`src/App.tsx`).
- **Page:** `src/pages/FantasyDraftPreview.tsx`.
- **Lib (`src/lib/fantasy/draftPreview/`):**
  - `draftPreviewBoard.ts` — `buildDraftPreviewRows` / `DRAFT_PREVIEW_ROWS_2026`, `filterDraftPreviewRows` (the row builder / join).
  - `sleeperCsv.ts`, `sleeperDraftBoard.ts` — parsed Sleeper source rows (`SLEEPER_DRAFT_BOARD_2026`).
  - `identity.ts` — Sleeper→`FANTASY_RANKINGS` exact-name identity join (`SLEEPER_NAME_ALIASES`, `canonicalPositionForSource`).
  - `identityCorrections.ts` — typed loader for `data/fantasy/draft-preview/2026-identity-corrections.json`.
  - `presentationSuppression.ts` — typed loader for `data/fantasy/draft-preview/2026-presentation-suppression.json` (duplicate groups + malformed rows).
  - `rosterPosition.ts` — `computeDisplayTeam` / `computeRosterPosition` (display-only corrections; adds K/DST scope).
  - `snakeDraft.ts`, `startingRoster.ts`, `myDraft.ts`, `draftTargets.ts` — draft tooling.
- **Shared cells:** `src/components/fantasy/ParBoardCells.tsx`, `FantasyTable.tsx`; presentation helpers `src/lib/fantasy/parPresentation.ts`, `formatBoardValue.ts`.

## Sleeper draft-board source

- Source file: `data/fantasy/source/PixBook-Sleeper-DraftBoard-2026.csv` (committed; no fetch).
- Producer: `scripts/generate-fantasy-draft-preview.ts` (`npm run fantasy:draft-preview`) → `data/fantasy/draft-preview/2026-sleeper-draft-board.json` (schema `fantasy-draft-preview-sleeper-board-v1`, 267 rows, unique `RK`, source sha256 recorded, atomic `.tmp` rename).
- `Sleeper Rank`, `Sleeper Proj`, `Sleeper PPG` (and `team` / `sourcePosition` / `bye`) are copied **verbatim** from the CSV. Sleeper Rank is the fixed default board order and is **never recomputed or re-sorted** by the page.
- Registry: [../DATA_SOURCES.md](../DATA_SOURCES.md) — "Fantasy — Sleeper draft-board source".

## Identity audit / correction behavior

- Producer of the correction artifacts:
  `scripts/audit-fantasy-draft-preview-identity.ts`
  (`npx tsx scripts/audit-fantasy-draft-preview-identity.ts`; no npm alias). It is
  read-only against the canonical nflverse roster snapshot
  `data/nfl/nflverse/weekly-rosters/roster_weekly_2026.csv`, writes the markdown
  report [../fantasy-draft-preview-identity-audit-2026.md](../fantasy-draft-preview-identity-audit-2026.md)
  and the two JSON artifacts
  (`2026-identity-corrections.json`, `2026-presentation-suppression.json`).
- Matching is **deterministic exact normalized full-name only** — no fuzzy
  matching. Name differences are handled by the small reviewed
  `SLEEPER_NAME_ALIASES` list plus reviewed suffix corrections in the audit
  script.
- The audit classifies all 267 source rows: A exact match, B stale team, C stale
  position, D team+position conflict, E duplicate source row, F malformed, G
  unresolved, plus DEF rows out of individual-identity scope.
- **Corrections change DISPLAY team/position only.** `computeDisplayTeam` /
  `computeRosterPosition` apply, in priority order: an audited B/C/D correction
  for that exact rank → a retained duplicate group's canonical team/position →
  the raw source value. Priority for the JKB join position:
  `SOURCE_POSITION_TO_CANONICAL` via `canonicalPositionForSource`.

## Duplicate suppression

- `presentationSuppression.ts` exposes confirmed duplicate groups (2+ Sleeper
  rows resolving to the identical single canonical nflverse player) and
  confirmed-malformed rows.
- Board policy: **one rendered row per real player** — the **lowest** Sleeper
  Rank in a group is retained (with its own untouched Sleeper projections);
  higher ranks in the group are `isDuplicatePresentation` and dropped by
  `filterDraftPreviewRows`. Malformed rows (`isMalformedSourceRow`, e.g. a team
  name in the player column) are dropped outright.
- A group is only collapsed when every row resolves to the identical canonical
  identity — never when uncertain.

## Provenance rules

- Every raw Sleeper row stays in `DRAFT_PREVIEW_ROWS_2026` and in the Sleeper
  source artifact regardless of suppression — suppression only controls what the
  rendered/draftable board shows.
- `DraftPreviewRow.team` / `sourcePosition` always keep the original Sleeper
  values; corrected values live on the separate `displayTeam` / `rosterPosition`
  fields.
- The page never mutates or re-sorts `SLEEPER_DRAFT_BOARD_2026`,
  `FANTASY_RANKINGS`, `FANTASY_PAR_ROWS`, or the shadow model artifact (asserted
  by tests: "does not mutate the underlying data source", "never mutates the
  underlying Sleeper source array").
- The in-page glossary (`DraftPreviewGlossary`) states Sleeper Rank/projections
  are "not generated or modified by Joe Knows Ball" and that JKB Proj / PAR/G /
  Model Rk are separate existing authorities shown for comparison.

## Joins onto each retained row (`buildDraftPreviewRows`)

All joins are keyed off the identity match to a `FANTASY_RANKINGS` row
(`jkb.overallRank`); a missing join renders `N/A` and is never name-matched as a
fallback.

| Column | Source | Notes |
| --- | --- | --- |
| **Pos Rk** | `FantasyRankingRow.positionRank` | Canonical JKB rank within position. |
| **JKB Proj PPG** | approved PAR authority — `FANTASY_PAR_ROWS[...].projectedPpg` (`parRankings.ts`) | Not a Sleeper number. |
| **JKB PAR/G** | approved PAR authority — `getOverallRowContext(...).parPerGame` | Signed; from `data/fantasy/2026-par-consensus.json` via [../models/fantasy-par.md](../models/fantasy-par.md). Never recomputed here. |
| **JKB draft ranking joins** | `FANTASY_RANKINGS` row — Projection Rk, AVG Rk, SOS, W15–W17 opponents | Straight off the workbook row. |
| **ADP** | not shown on this board | ADP lives on the ROS Overall board. |
| **Model Rk** | ROS shadow authority — `getShadowModelRankRow(jkb.overallRank)` → `data/fantasy/ros-research/2026/shadow-ros-projections.json` | **Shadow / research** rank, present as a read-only column. Rendered as a **display-only** position-relative label (e.g. `RB4`) derived from — never overwriting — the cross-position `modelRank` authority. |
| **2025 Pts Rk / 2025 PPG Rk / L8 Pts Rk** | `overallRowContext.ts` (2025 actuals / last-8) | Display evidence. |

Shadow / model-rank joins **are** currently present on this surface, as a
read-only comparison column only (`KS-007`).

## Snake-draft / roster-position / my-draft support

- **Snake draft:** `snakeDraft.ts` — 12-team (`SNAKE_DRAFT_TEAM_COUNT`),
  selectable draft slot (default 10), `computeSnakeDraftSlotPicks` /
  `computeSnakeOverallPick`. "Your pick" separator rows are anchored to the exact
  overall Sleeper Rank and are **presentation-only markers** — they never affect
  row order or any value.
- **Starting roster:** `startingRoster.ts` — explicit 16-slot lineup (QB, RB1/2,
  WR1/2, FLEX1/2, K, DST, Bench 1–7); slots fill by best `jkbProjectedPpg`.
  Totals exclude missing JKB values rather than treating them as 0.
- **My Draft:** `myDraft.ts` — manual add/remove only, per round; `computeMyDraftTotals`.
- **Targets:** `draftTargets.ts` — a personal per-round watchlist saved to
  `localStorage` under a versioned key; not a calculated recommendation.
  Malformed/old-schema storage starts empty without crashing.
- **Position focus chips** are highlight-only: rows are dimmed, never removed or
  reordered. Only free-text search and "hide drafted" are real filters.

## What the page does NOT recompute

- Sleeper Rank / Sleeper Proj / Sleeper PPG — verbatim source.
- JKB Pos Rk, JKB Proj PPG, JKB PAR/G, Projection Rk, AVG Rk, SOS — read from
  existing authorities.
- The cross-position Model Rank authority — only a display label and a
  same-position heat pool are derived from it.
- PAR arithmetic, PAR tiers, replacement baselines — none of it; PAR/G is a
  looked-up value.
- Heat-map colours are position-scoped presentation only
  (`parPresentation.ts`).

## Relationship to `docs/models/fantasy-par.md`

The `JKB Proj PPG` and `JKB PAR/G` columns are the approved PAR authority
surfaced verbatim. All rules about how those values are produced, the positional
universe, replacement baselines, tiers, and the "PAR is not ADP / not the draft
board / not a bet" boundaries are in
[../models/fantasy-par.md](../models/fantasy-par.md). This page is a consumer.

## Identity audit document status

[../fantasy-draft-preview-identity-audit-2026.md](../fantasy-draft-preview-identity-audit-2026.md)
is **point-in-time evidence** — a deterministic classification of the 267 Sleeper
source rows against the 2026 Week 1 nflverse roster snapshot, generated by
`scripts/audit-fantasy-draft-preview-identity.ts`. It is **not permanent
methodology**: a new Sleeper source snapshot or roster snapshot requires
re-running the audit and re-reviewing the correction / suppression lists. The
committed correction and suppression JSON artifacts, and the hand-reviewed alias
lists, are the operative inputs.

## Relevant tests

- `src/pages/FantasyDraftPreview.test.tsx` — route/title, reachable via `App`,
  fixed Sleeper column order, JKB columns distinct from Sleeper, no resort on
  position focus, snake-draft separators anchored to overall picks, no source
  mutation, single retained duplicate row (Jalen Milroe), Model Rk position
  label derived without mutating the authority, heat-map position scoping,
  starting roster / my-draft / target persistence.
- `src/lib/fantasy/draftPreview/draftPreviewBoard.test.ts` — row builder / joins.
- `src/lib/fantasy/draftPreview/identity.test.ts` — exact-name identity join, aliases, duplicate-key failure.
- `src/lib/fantasy/draftPreview/rosterPosition.test.ts` — display corrections priority.
- `src/lib/fantasy/draftPreview/snakeDraft.test.ts`, `startingRoster.test.ts`, `myDraft.test.ts`, `draftTargets.test.ts`, `sleeperCsv.test.ts`.

## Not this

- Not the ROS PAR research board, not the weekly projection/ranking surface, not
  the season-long draft board page.
- Model Rk here is a **shadow/research** column, not a promoted product rank.
- Identity corrections are display-only; source rows are never rewritten.
