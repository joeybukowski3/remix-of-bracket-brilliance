# Fantasy PAR (Points Above Replacement)

CURRENT methodology authority for the JoeKnowsBall fantasy **PAR / PAR-G** research
board. Subject to the authority hierarchy in [../DECISIONS.md](../DECISIONS.md)
(`KS-007`), this file — not chat history, older research, or code comments — owns
what the approved PAR methodology is. Historical audits, READMEs, and the
implementation remain evidence and provenance.

## Purpose

PAR expresses how much projected fantasy value a player provides **above a
positional replacement-level baseline**, on a per-game and full-season basis. It
exists to order the Rest-of-Season research board and assign draft-pool position
tiers. It is a research/draft-preparation lens, not a weekly matchup ranking and
not a betting output.

## Status / version

- **Status:** current, in production on the Rest-of-Season research board
  (`/fantasy-football`, default `?view=ros`).
- **Source artifact:** `data/fantasy/2026-par-consensus.json`
  (`sourceVersion` string `2026-par-consensus`; `PAR_INPUT_AS_OF`
  `2026-08-16T16:13:26.000Z`).
- There is **no numeric methodology version** string beyond the source-artifact
  name. The approved tier boundaries, universe limits, and replacement baselines
  below are the versioned contract; changing any of them is a new methodology
  (see "What requires a new methodology / reopening").
- Season scope: **2026 only**.

## Player universe / positional limits

PAR covers four positions. Kickers and defense/special-teams are **excluded from
PAR logic entirely** — not tiered, not ranked, not assigned a replacement
baseline.

The universe at each position is exactly the top-N players by **Consensus
Position Rank** in the source artifact (`PAR_POSITION_LIMITS` in
`src/lib/fantasy/parRankings.ts`):

| Position | Universe size |
| --- | --- |
| QB | 18 |
| RB | 66 |
| WR | 78 |
| TE | 18 |

Total: **180 PAR rows**. `buildFantasyParRankings` throws if any position does not
resolve to exactly its limit, or if the consensus position ranks in that slice
are not the distinct integers `1..limit`.

## PAR / PAR-G definition actually used

The application **does not compute PAR arithmetic**. Every analytical value is
copied verbatim from `data/fantasy/2026-par-consensus.json`
(`parRankings.test.ts` asserts exact equality, including full float precision):

- `PAR/G` (`parPerGame`) — projected points above replacement **per game**.
- `Projected Season PAR` (`projectedSeasonPar`) — projected full-season PAR.
- Supporting supplied fields: `Projected Games`, `2026 Projected Fantasy Points`,
  `2026 Projected PPG`, `Historical Replacement PPG`, `Projection Status`,
  `Source ID`, `Consensus Position Rank`.

Conceptually the supplied source defines `PAR/G = 2026 Projected PPG − Historical
Replacement PPG` and `Projected Season PAR = PAR/G × Projected Games`, but those
identities are properties of the source file, not a calculation the repo
performs or re-derives.

`assertFiniteSourceMetrics` rejects a row whose supplied metrics are not all
finite.

## Replacement-level basis

Three layers, kept explicitly separate:

**A. What the source artifact supplies.** `data/fantasy/2026-par-consensus.json`
provides one field literally named `Historical Replacement PPG` per row.
Verified: exactly **one distinct value per position** across the whole board
(e.g. QB = `17.566666666666666`), so it functions as a single per-position
constant. The artifact does **not** contain any replacement-rank field, any
formula, or any statement of how the value was produced — its only provenance is
the per-row `Projection Status` string. Its verified keys are: `Player`, `Team`,
`Position`, `Projected Games`, `2026 Projected Fantasy Points`,
`2026 Projected PPG`, `Historical Replacement PPG`, `PAR/G`,
`Projected Season PAR`, `Projection Status`, `Source ID`,
`Consensus Position Rank`.

**B. What current application/config associates with the baselines.** The
current application/config associates the replacement baselines with
**QB13 / RB25 / WR37 / TE13**. This association lives only in UI/config —
`baselineLabel` in `src/lib/fantasy/positionBoardConfig.ts` (commented "Approved
replacement-baseline label"), duplicated as `BASELINE_LABELS` in
`src/components/fantasy/LegacyPositionBoard.tsx`, and rendered as
"PAR baseline: `<label>` = `<value>` PPG" by
`src/components/fantasy/PositionParBoard.tsx`. It is a display label, not a
value the artifact carries.

**C. What cannot be verified in-repo.** The repository does not contain the
upstream producer needed to independently verify how the supplied replacement
PPG constants were derived — whether they are the prior-season realized PPG of
the QB13 / RB25 / WR37 / TE13 finisher, a multi-year average, or another
construction. The field name (`Historical Replacement PPG`) and the config
labels are the only evidence; treat the QB13/RB25/WR37/TE13 basis as a
**config-level association, not a verified derivation**.

Other verified facts about the baseline:

- It is applied as a static per-position constant; it is not projected forward
  or recomputed during the season.
- The QB baseline is retained even when every eligible QB has positive PAR
  (`parRankings.test.ts` — "retains the historical QB baseline"): no
  floor-to-zero or rebasing.
- 2025 actuals (`data/fantasy/2025-par-actual.json`,
  `src/lib/fantasy/parActual2025.ts`) carry their **own** supplied
  `2025 Replacement PPG` and are display-only evidence; they never feed a 2026
  PAR value.

## Sorting / ranking authority

Within each position (`buildFantasyParRankings`):

1. **`parRank`** is assigned by **descending `PAR/G`**, ties broken by source
   file order. `parRank` runs `1..limit`.
2. Because replacement PPG is one constant per position, ordering by `PAR/G` and
   ordering by `2026 Projected PPG` are the **same order within a position** — by
   construction, not coincidence.
3. `parRank` is **not** `Consensus Position Rank`. They routinely disagree
   (`parRankings.test.ts` — "does not substitute consensus position rank for PAR
   rank").

Row order actually displayed inside a tier is **JKB position rank**
(`jkbPositionRank` from `FANTASY_RANKINGS`), then `parRank` as the tie-breaker;
PAR rows with no JKB join sort last within the tier.

## Approved tier boundaries (current — locked)

Tiers are assigned from `parRank` using fixed per-position boundaries
(`PAR_TIER_BOUNDARIES` in `src/lib/fantasy/parRankings.ts`;
`parRankings.test.ts` asserts every boundary exactly). `getTier` throws if a
`parRank` falls outside all boundaries.

**QB** (`parRank` → tier): 1→1 · 2→2 · 3–6→3 · 7–12→4 · 13–16→5 · 17–18→6

**RB**: 1–3→1 · 4–5→2 · 6–11→3 · 12–17→4 · 18–24→5 · 25–26→6 · 27–32→7 ·
33–43→8 · 44–55→9 · 56–66→10

**WR**: 1→1 · 2→2 · 3–4→3 · 5–9→4 · 10–15→5 · 16–24→6 · 25–32→7 · 33–44→8 ·
45–52→9 · 53–59→10 · 60–71→11 · 72–78→12

**TE**: 1→1 · 2→2 · 3–4→3 · 5–8→4 · 9–11→5 · 12–13→6 · 14–18→7

## Relationship between PAR, consensus rank, ADP, and draft rankings

These are **four distinct things** (`KS-007`; `docs/DATA_SOURCES.md`). Each is
joined to the others only in the read/consumer layer for side-by-side display —
none is recomputed from another:

| Concept | Source | Role |
| --- | --- | --- |
| **JKB PAR / PAR-G** | `data/fantasy/2026-par-consensus.json` → `parRankings.ts` | Position order + draft-pool tiers on the ROS board |
| **Consensus Position Rank** | field inside the PAR source artifact | Defines the universe cut only; **never** assigns a tier or a display order |
| **FantasyPros ADP** | `data/fantasy/2026-fantasypros-adp.{csv,json}` → `adpPlayerIdentity.ts` | Independent market-consensus context column |
| **Season-long draft rankings** | `src/data/fantasyRankings2026.ts` → `FANTASY_RANKINGS` (`rankings.ts`) | The published JKB draft board / workbook list; supplies `jkbPositionRank` / `jkbOverallRank` for in-tier ordering and the Overall board |

`src/lib/fantasy/overallRowContext.ts` joins `parPerGame`, ADP, 2025 actuals, and
last-8 ranks onto the Overall (workbook) board by rank/`Source ID` for display;
missing joins render N/A and are never name-matched as a fallback.

## Identity requirements

- Join key: normalized `position:player` (NFKD, diacritics stripped, lowercased,
  non-alphanumerics removed) via `playerKey`.
- Source-to-workbook name differences are resolved **only** through the explicit,
  reviewable `JKB_PLAYER_ALIASES` map in `parRankings.ts`. **Never fuzzy-match
  player identity.**
- Duplicate JKB ranking keys throw (`Duplicate JKB ranking key`).
- In `buildFantasyPositionResearchBoards`, a JKB player joining more than one PAR
  row throws (`joined more than one approved PAR row`).

## Validation / error behavior

`buildFantasyParRankings` / `buildFantasyPositionResearchBoards` **fail closed
(throw)** on:

- universe size ≠ position limit;
- duplicate consensus position ranks in a universe;
- non-finite supplied metric;
- a `parRank` with no approved tier boundary;
- duplicate JKB ranking key;
- one JKB player joined to multiple PAR rows.

These run at module load, so a malformed source artifact breaks the build rather
than shipping a silently-wrong board.

## Presentation boundaries

- `src/lib/fantasy/parPresentation.ts` decides **colour only**. Its cutoffs are
  quantiles of the values on the active position board
  (`ELITE_QUANTILE = 0.75`, `NEAR_REPLACEMENT_BAND = 1`) — no league-wide
  constant, no PAR arithmetic, no re-derivation of replacement baselines.
- Board components (`FantasyParBoard.tsx`, `PositionParBoard.tsx`,
  `ParBoardCells.tsx`) render the published values and the derived tiers; they do
  not recompute PAR, rank, or tiers.
- The "outside draft pool" list (JKB-ranked players beyond the PAR universe)
  renders with **no tier and no PAR row** and keeps JKB position-rank order.
- Rounding / formatting is presentation only.

## Inputs and upstream authorities

| Input | Authority |
| --- | --- |
| PAR metrics, replacement PPG, projected games/points/PPG, consensus rank | `data/fantasy/2026-par-consensus.json` (externally supplied workbook artifact; **no in-repo producer script**) |
| JKB position/overall rank, per-position evidence metrics | `src/data/fantasyRankings2026.ts` → `FANTASY_RANKINGS` |
| FantasyPros ADP context | `data/fantasy/2026-fantasypros-adp.json` |
| 2025 actual PAR evidence | `data/fantasy/2025-par-actual.json` |

Registry: [../DATA_SOURCES.md](../DATA_SOURCES.md) — "Fantasy — FantasyPros ADP"
and "Fantasy — season-long draft rankings workbook".

## Relevant implementation paths

- `src/lib/fantasy/parRankings.ts` — universe, limits, tier boundaries, PAR-rank
  ordering, research-board assembly (authority module).
- `src/lib/fantasy/parPresentation.ts` — colour/tone only.
- `src/lib/fantasy/positionBoardConfig.ts` — baseline labels, board headings,
  evidence-metric labels.
- `src/lib/fantasy/parActual2025.ts` — 2025 actual PAR (display evidence).
- `src/lib/fantasy/overallRowContext.ts` — PAR/G, ADP, actuals join for the
  Overall board.
- `src/components/fantasy/FantasyParBoard.tsx`,
  `src/components/fantasy/PositionParBoard.tsx`,
  `src/components/fantasy/ParBoardCells.tsx` — presentation.
- `src/pages/FantasyFootball.tsx` — page shell / ROS view copy.

## Relevant tests

- `src/lib/fantasy/parRankings.test.ts` — exact metric checkpoints, 180-row
  universe, no K/DST, verbatim value copy, PAR-rank-from-descending-PAR/G,
  every exact tier boundary, `parRank ≠ consensusPositionRank`, in-tier JKB
  ordering, QB baseline retention.
- `src/lib/fantasy/parPresentation.test.ts` — quantile tone/colour helpers.
- `src/components/fantasy/PositionParBoard.test.tsx`,
  `src/components/fantasy/ParBoardCells.test.tsx`,
  `src/components/fantasy/FantasyParBoard.modelRank.test.tsx`.

## Not this

- PAR is **not consensus ADP** and not FantasyPros consensus rank.
- **Consensus Position Rank does not assign PAR tiers.** It only cuts the
  universe. Tiers come from `parRank` (descending `PAR/G`) and the fixed
  boundaries above.
- PAR is **not** the season-long draft board (`FANTASY_RANKINGS`), not weekly
  fantasy rankings, not the weekly point projection, and not the ROS shadow
  model rank. See [fantasy-weekly-projections.md](fantasy-weekly-projections.md).
- PAR is **not** an edge, +EV claim, best bet, pick, or calibrated probability
  (`KS-008`).
- The app does **not** compute or re-derive PAR/G, season PAR, replacement PPG,
  or `parRank` — all come from the supplied artifact.
- No dynamic / projected replacement level; no floor-to-zero; no rebasing.
- No fuzzy name matching; no name-matched actuals fallback.
- Kickers and DST are not in scope at all.

## Known limitations

- The PAR source artifact is **externally supplied with no in-repo producer**;
  its internal projection methodology (how `2026 Projected PPG` and
  `Historical Replacement PPG` were derived) is not reproducible from this repo.
  `Projection Status` on each row is the only provenance carried.
- Replacement level is a static historical constant per position; it does not
  update during the season.
- Tier boundaries are hand-set per position, not derived from a distribution
  rule.
- Identity coverage depends on the hand-maintained alias map; a new
  source/workbook naming difference must be added there or the universe-count
  assertion fails the build.
- 2026 has not been played; `2025-par-actual.json` is the only realized-outcome
  cross-check and is display-only.

## What requires a new methodology / version or explicit reopening

Any of the following is a **new methodology**, not an in-place edit:

- changing a positional universe limit (QB18 / RB66 / WR78 / TE18);
- changing any tier boundary in `PAR_TIER_BOUNDARIES`;
- changing the replacement-level basis (rank, historical vs projected,
  per-position constant vs dynamic);
- computing, adjusting, or re-deriving PAR/G, season PAR, or `parRank` inside the
  application instead of consuming supplied values;
- adding K or DST to PAR;
- changing the ranking authority (e.g. sorting tiers by something other than
  descending `PAR/G` / JKB position rank);
- letting Consensus Position Rank, ADP, or a market input drive a tier or a
  display order;
- swapping to a new source artifact with a different schema or replacement
  definition.

Record the change in [../DECISIONS.md](../DECISIONS.md) and update this file
before implementing.
