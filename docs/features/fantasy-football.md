# Fantasy Football (feature area router)

Durable router for the JoeKnowsBall Fantasy Football product area. It explains
the surfaces, how they route, which artifacts and sources back them, and how the
several ranking/projection systems relate **without collapsing them into one
another**.

This is a feature/routing document. It does **not** restate methodology. The
approved methodology contracts live in:

- [../models/fantasy-par.md](../models/fantasy-par.md) — PAR / PAR-G (season-long research lens).
- [../models/fantasy-weekly-projections.md](../models/fantasy-weekly-projections.md) — weekly point projection, weekly ordinal rank, weekly research/context, ROS shadow.

Subject to the authority hierarchy in [../DECISIONS.md](../DECISIONS.md)
(`KS-007`, `KS-008`, `KS-009`).

---

## 1. Routes / surfaces (verified in `src/App.tsx`)

| Route | Page component | Surface |
| --- | --- | --- |
| `/fantasy-football` | `src/pages/FantasyFootball.tsx` | Fantasy landing. `?view=` selects the mode: `weekly` (default, via `getDefaultFantasyRankingMode()`) renders `FantasyWeeklyRankings`; `ros` renders the Rest-of-Season research board (PAR-tiered). Any other/absent value falls back to the default (`weekly`). |
| `/fantasy-football/weekly-rankings` | `src/pages/FantasyWeeklyRankings.tsx` | User-facing weekly rankings surface. Also rendered in-place by the landing page when `view=weekly`. See [fantasy-weekly-rankings.md](fantasy-weekly-rankings.md). |
| `/fantasy-football/draft-preview` | `src/pages/FantasyDraftPreview.tsx` | Sleeper draft board compared against JKB authorities, plus snake-draft / roster / my-draft tooling. See [fantasy-draft-preview.md](fantasy-draft-preview.md). |
| `/fantasy-football/points-allowed` | `src/pages/FantasyPointsAllowed.tsx` | 2025 fantasy points allowed by defense/position (reference table; 2025 actuals). |

In-app navigation between the two ranking modes is the `FantasyRankingModeNav`
component (`src/components/fantasy/FantasyRankingModeNav.tsx`): "Weekly Rankings"
→ `/fantasy-football/weekly-rankings`, "Rest of Season" → `/fantasy-football?view=ros`.
`rankingModes.ts` sets `HAS_CANONICAL_WEEKLY_FANTASY_RANKINGS = true` and the
default mode to `weekly`.

---

## 2. The systems, kept distinct

These are **separate** concepts. Each is joined to the others only in the
read/consumer layer for side-by-side display; none is recomputed from another
(`KS-007`; [../DATA_SOURCES.md](../DATA_SOURCES.md)).

| Concept | What it is | Authority / source | Surfaced on |
| --- | --- | --- | --- |
| **Season-long draft board** | The published JKB 2026 draft list + per-position metric ranks (`jkbOverallRank`, `jkbPositionRank`, projection rank, AVG rank, SOS, playoff weeks). | `src/data/fantasyRankings2026.ts` → `FANTASY_RANKINGS` (`src/lib/fantasy/rankings.ts`). Manual workbook extraction. | ROS board (in-tier order + outside-pool list), Draft Preview (join). |
| **PAR / PAR-G** | Projected fantasy value above a positional replacement baseline; per-game and full-season. Orders the ROS position boards and assigns draft-pool tiers. | Supplied artifact `data/fantasy/2026-par-consensus.json` → `src/lib/fantasy/parRankings.ts`. App copies values verbatim; it does **not** compute PAR. | ROS board (`FantasyParBoard`), Draft Preview (`JKB PAR/G` column). Methodology: [../models/fantasy-par.md](../models/fantasy-par.md). |
| **Consensus ADP** | FantasyPros market-consensus average draft position — an independent context column. | `data/fantasy/2026-fantasypros-adp.{csv,json}` → `src/lib/fantasy/adpPlayerIdentity.ts`, `fantasyProsAdpParser.ts`. | ROS Overall board `ADP` column (renders `N/A` when no trustworthy 2026 value). |
| **Consensus Position Rank** | A field **inside** the PAR source artifact. Cuts the PAR universe (top-N per position) only. | `data/fantasy/2026-par-consensus.json`. | Never assigns a tier or a display order — see [../models/fantasy-par.md](../models/fantasy-par.md). |
| **Weekly point projection** | `projectedFantasyPoints` per player per week (Full PPR). | `weekly-fantasy-projection-v1` frozen model + `weekly-fantasy-production-context-v1` policy layer → `weekly-fantasy-projection-production-artifact-v2` at `public/data/fantasy/projections/<season>/week-<NN>.json`. | Weekly Rankings page, NFL Weekly Command Center, NFL DFS Contest Analyzer. |
| **Weekly ordinal rank** | `positionRank` 1..N within QB/RB/WR/TE for a given week. | The production projection artifact itself — rows are pre-sorted by `projectedFantasyPoints` with `positionRank` written per row. Consumers never re-rank. | Weekly Rankings page. |
| **Weekly research / matchup context** | Per-player usage evidence, opponent FPA, NFL matchup edges, `matchupGrade`; plus the separate `calculateWeeklyMatchupComposite` 0–100 score + grade. | `weekly-fantasy-research-artifact-v1` at `public/data/fantasy/weekly-research/<season>/week-<NN>.json`; `src/lib/fantasy/weekly/matchupComposite.ts`. | Rendered **alongside** the weekly ranking output; never an input to the projection or rank. |
| **ROS shadow / research rank** | Multi-candidate rest-of-season shadow projections and a shadow "Model Rank". | `ros-shadow-projection-v1` (`src/lib/fantasy/rosResearch/*`, `data/fantasy/ros-research/2026/shadow-ros-projections.json`). | ROS board "Model Rank" column (read-only) and Draft Preview "Model Rk" column (display-only, position-relabeled). **Shadow only — never overwrites a live rank.** |
| **Weekly matchup/points-allowed baseline context** | Season-baseline matchup helper; docstring states it "does NOT provide true weekly rankings". | `src/lib/fantasy/weeklyRankings.ts` (`buildWeeklyRankingRows`); `pointsAllowed2025.ts`. | NFL Weekly Command Center schedule/opponent context; the `/fantasy-football/points-allowed` reference page draws on `pointsAllowed2025`. |

### Explicit distinctions

- **Season-long draft board ≠ PAR.** The draft board is the manual workbook list
  (`FANTASY_RANKINGS`); PAR is the supplied per-game value that sets ROS tiers.
  PAR uses `jkbPositionRank` only as an in-tier tie-breaker.
- **PAR ≠ consensus ADP.** ADP is FantasyPros market data in its own column; PAR
  is the projection-above-replacement lens. Neither is derived from the other.
- **Weekly point projection ≠ weekly ordinal rank.** The projection is the
  points number; the rank is its pre-sorted position order in the same artifact.
- **Weekly point projection ≠ PAR ≠ ROS shadow rank.** Different models,
  different artifacts, different pages.
- **ROS shadow/research rank ≠ any live rank.** It is displayed read-only and is
  never allowed to overwrite the weekly rank, the PAR order, or the draft board.

---

## 3. Key source / artifact paths

**Supplied / manual inputs**

- `data/fantasy/2026-par-consensus.json` — PAR metrics + Consensus Position Rank (externally supplied; **no in-repo producer**).
- `src/data/fantasyRankings2026.ts` — season-long draft rankings workbook.
- `data/fantasy/2026-fantasypros-adp.csv` / `.json` — FantasyPros ADP (`fantasy:adp`).
- `data/fantasy/source/PixBook-Sleeper-DraftBoard-2026.csv` — Sleeper draft board source.
- `data/fantasy/2025-par-actual.json`, `data/fantasy/points-allowed-2025.csv` — 2025 actuals (display evidence).

**Generated artifacts**

- `public/data/fantasy/projections/<season>/week-<NN>.json` — production weekly projection artifact (`fantasy:projections:generate`, alias `fantasy:weekly:publish`).
- `public/data/fantasy/weekly-research/<season>/week-<NN>.json` — weekly research/context artifact (`fantasy:weekly-research`).
- `public/data/fantasy/weekly/<season>/week-<NN>.json` — earlier `weekly-fantasy-ranking-artifact-v1` baseline artifact (`fantasy:weekly-rankings`); still produced/maintained but **has no live consumer** (see [fantasy-weekly-rankings.md](fantasy-weekly-rankings.md)).
- `data/fantasy/ros-research/2026/shadow-ros-projections.json` — ROS shadow projections (`fantasy:ros:*` / `scripts/generate-ros-shadow-projections.ts`).
- `data/fantasy/draft-preview/2026-sleeper-draft-board.json` — parsed Sleeper board (`fantasy:draft-preview`).
- `data/fantasy/draft-preview/2026-identity-corrections.json`, `data/fantasy/draft-preview/2026-presentation-suppression.json` — produced by `scripts/audit-fantasy-draft-preview-identity.ts`.

Registry: [../DATA_SOURCES.md](../DATA_SOURCES.md) — "Fantasy — weekly projection / research inputs",
"Fantasy — FantasyPros ADP", "Fantasy — Sleeper draft-board source",
"Fantasy — season-long draft rankings workbook".

---

## 4. Relevant feature & model docs

- [fantasy-weekly-rankings.md](fantasy-weekly-rankings.md) — weekly rankings surface behavior.
- [fantasy-draft-preview.md](fantasy-draft-preview.md) — Draft Preview surface behavior.
- [../models/fantasy-par.md](../models/fantasy-par.md) — PAR methodology contract.
- [../models/fantasy-weekly-projections.md](../models/fantasy-weekly-projections.md) — weekly projection / rank / research / ROS shadow methodology contract.
- [../fantasy-weekly-production-operations.md](../fantasy-weekly-production-operations.md) — weekly refresh operations (see conflict note in the weekly-rankings feature doc).
- [../fantasy-draft-preview-identity-audit-2026.md](../fantasy-draft-preview-identity-audit-2026.md) — point-in-time Sleeper identity audit evidence.

---

## 5. Current vs non-current boundaries

**Current (in production):**

- ROS PAR research board at `/fantasy-football?view=ros`.
- Weekly Rankings at `/fantasy-football` (default) and `/fantasy-football/weekly-rankings`, consuming the production **projection** artifact.
- Draft Preview at `/fantasy-football/draft-preview`.
- Points Allowed reference at `/fantasy-football/points-allowed`.
- ROS shadow "Model Rank" as a read-only column on the ROS board and Draft Preview.

**Not current / not promoted:**

- `weekly-fantasy-ranking-artifact-v1` (`public/data/fantasy/weekly/<season>/`,
  `fantasy:weekly-rankings`, `useWeeklyFantasyRankingArtifact`): pipeline and
  tests still maintained, but **no page or component consumes it**. Superseded
  for public weekly-ranking consumption; **not formally retired** (no
  `docs/DECISIONS.md` entry). See [fantasy-weekly-rankings.md](fantasy-weekly-rankings.md).
- `projections-v2` research (learned implied-total coefficients, learned
  opponent-defense, QB calibration): **rejected research**, never imported by any
  production or shadow path.
- ROS shadow projections: research/shadow only; never a promoted product rank.
- `src/lib/fantasy/weeklyRankings.ts` season-baseline helper: explicitly not a
  weekly ranking; retained for Command Center schedule context.

---

## 6. Relevant tests

- `src/pages/FantasyFootball.test.tsx` — landing/mode routing, ROS board, PAR baseline labels, distinct Weekly/ROS modes.
- `src/pages/FantasyWeeklyRankings.test.tsx` — weekly surface behavior (see feature doc).
- `src/pages/FantasyDraftPreview.test.tsx` — Draft Preview behavior (see feature doc).
- `src/lib/fantasy/parRankings.test.ts` — PAR universe, verbatim value copy, tiers, `parRank ≠ consensusPositionRank`.
- `src/lib/fantasy/rankingModes.test.ts` — default mode.
- `src/lib/fantasy/overallRowContext.test.ts` — ADP / actuals / last-8 joins onto the Overall board.
- `src/lib/fantasy/weekly/consumerBoundaries.test.ts` — ROS board does not import the weekly projection/ranking artifacts or hooks.

---

## 7. Known limitations / deferred areas

- 2026 is unplayed; realized-outcome cross-checks are limited to 2025 actuals
  (display-only), and no calibration/validation gate is published for any
  fantasy output (`KS-008`).
- The PAR source artifact is externally supplied with no in-repo producer; its
  internal projection methodology is not reproducible here.
- Kickers and DST are outside PAR and the weekly projection entirely; Draft
  Preview carries K/DST rows for roster tooling only.
- Weekly automation is limited to workflow `generate-fantasy-weekly-projections.yml`
  plus manual runs; [../fantasy-weekly-production-operations.md](../fantasy-weekly-production-operations.md)
  still describes the superseded artifact path and is unreconciled (see
  [fantasy-weekly-rankings.md](fantasy-weekly-rankings.md)).
- `weekly-fantasy-ranking-artifact-v1` is in an ambiguous state: maintained but
  unconsumed and not formally retired.
