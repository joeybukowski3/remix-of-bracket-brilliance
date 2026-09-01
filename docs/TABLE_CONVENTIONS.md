# JoeKnowsBall table and data-display conventions

Durable authority for data tables, dense comparison displays, and the analytical
heat scale. Pairs with [UI_FRAMEWORK.md](UI_FRAMEWORK.md) (layout, hierarchy,
mobile) and [BRAND.md](BRAND.md) (color identity).

Authority level: tier 6 documentation in [DECISIONS.md](DECISIONS.md) KS-001.
Backed by the completed UI / Design Framework Audit and the sport migrations
through Phase 9C. This file is the ongoing current authority; the completed
rollout record lives at
[plans/completed/ui-design-framework.md](plans/completed/ui-design-framework.md)
for historical context. Retained exceptions are listed there and, where a future
action is intended, tracked in [BACKLOG.md](BACKLOG.md) (BL-PGA-001, BL-MLB-004,
BL-CFB-003).

---

## A. Canonical table density

JoeKnowsBall data tables are **dense comparison tables**. The current shared
implementation is `src/components/ui/dense-table.tsx`:

- `DenseTableScroller` — accessible, table-local horizontal overflow.
- `DENSE_TABLE_HEAD_ROW` — compact shared header-row styling.
- `DENSE_TABLE_ROW` — shared separators and restrained hover styling.

`src/components/nfl/ui/NflTable.tsx` is a compatibility adapter that re-exports
these primitives under the historical NFL names; it is not a separate standard.

Design intent (values are intent, not brittle contracts):

- **Compact headers:** small (~`text-[10px]`), uppercase, letter-spaced,
  semibold, on a light tonal row (`bg-slate-100`-class tone).
- **Compact body:** ~`text-[11px]` (mobile) to ~`text-[12px]` (desktop),
  approximately `py-1.5` row density.
- **`tabular-nums`** on every numeric column so digits align.
- Hairline row separation (`border-t` in a light border tone), restrained hover
  (subtle background shift, not a color flash).
- Right-align numbers, left-align identity/label columns, keep column padding
  tight and even.

The shadcn primitive `src/components/ui/table.tsx` is **roomy** (`h-12` header,
`p-4` cells) and is **not** the standard for data-dense tables. Use it only for
small, low-density tabular content (a short settings list, a 3-row summary).

New dense tables use the shared sport-neutral primitives directly when their
existing presentation maps cleanly. Specialized or low-density editorial
content is not forced into them.

---

## B. Mobile table rules

Data-dense tables **stay tables** on mobile — they are not auto-converted to
stacked cards, which costs far more vertical space and destroys column-to-column
comparison. Apply this priority order:

1. **Hide or deprioritize non-essential columns** on small viewports where the
   data supports it.
2. **Move secondary detail into expandable row content** (an expand affordance
   per row) where a row has more than the essential columns' worth of data.
3. **Preserve real table semantics** (`<table>`/`<th>`/`<td>`, scope, caption or
   `aria-label`) for genuinely tabular comparison data.
4. **Contain horizontal overflow to the table, never the page.** The scroll
   region is a positioned (`relative`) container with `overflow-x-auto`, a
   `role="region"`, an `aria-label`, `tabIndex={0}`, and a visible focus ring —
   exactly what `DenseTableScroller` does. A bare `overflow-x-auto` div is not
   sufficient (not keyboard reachable, not announced, and an unpositioned
   ancestor lets visually-hidden content escape and widen the page).
5. **Frozen first column / sticky header** when identity or column meaning would
   otherwise be lost while scrolling a wide or long table.
6. **Side scrolling is a last resort** — allowed only when the information cannot
   be represented clearly without it, and only inside the contained scroll
   region.

---

## C. Frozen column, sticky header, and z-index

The shared `stickyDenseHeader()` and `frozenDenseColumn()` helpers in
`src/components/ui/dense-table.tsx` implement this convention:

- Sticky header row: `position: sticky; top: 0` **within the table's own scroll
  container** (not the viewport), with an opaque background so body rows do not
  bleed through.
- Frozen first column: `position: sticky; left: 0` with an opaque background and
  a right-edge hairline or shadow to signal the freeze.
- **Implemented z-index ladder** (`TABLE_LAYER`, kept below page chrome):
  - `SiteHeader` — `z-[100]` (global, always on top).
  - Mobile context strips (e.g. `CollegeFootballMobileStickyHeader`) — `z-40`,
    positioned below the header (`top-[72px]`).
  - In-table sticky header — low local value (e.g. `z-20`), never above page
    chrome.
  - Frozen first column — below the sticky header (e.g. `z-10`); the
    header/column intersection cell takes the higher of the two.

---

## D. JKB Heat master scale

The single analytical color scale for encoding **how favorable a value is
relative to its comparison population**. Bands are keyed on *favorable
percentile* (0 = worst in pool, 100 = best in pool, after direction mapping).

| Band | Favorable percentile | Color intent |
| --- | --- | --- |
| Elite | ≥ 98 | Gold — scarce, best-on-the-board |
| Excellent | 95–97 | Deep emerald (white text) |
| Great | 80–94 | Emerald (white text) |
| Above average | 60–79 | Soft green wash |
| Average | 40–59 | Neutral slate wash |
| Below average | 25–39 | Soft red wash |
| Weak | 10–24 | Red |
| Poor | < 10 | Strong red (white text) |

These thresholds are exactly the `minFavorablePercentile` cutoffs in
`PERCENTILE_TIERS` in `src/lib/mlb/percentileColorScale.ts` (98 / 95 / 80 / 60 /
40 / 25 / 10 / 0).

### Source-of-truth implementations (preserve, do not fork)

- **`src/lib/mlb/percentileColorScale.ts`** — percentile computation, tier
  resolution (`getPercentileTier`), direction handling, sample-confidence
  gating (`resolvePercentileDisplay`), muted/capped fallbacks, and the legend
  array (`PERCENTILE_TIER_LEGEND`). This owns **the full goodness ramp** — gold
  (Elite) → deep/soft emerald → neutral slate → soft/strong **red** (Poor) —
  and the tier math. There is no blue in the goodness scale (KS-010); the
  red-hot / blue-cold palette is a separate sanctioned exception, section I.
- **`WeeklyHeatTone` in
  `src/lib/fantasy/weekly/researchPresentation.ts`** — the canonical
  ranking-table visual language. It is a tone vocabulary over the **same**
  `PERCENTILE_TIERS` fills (favorable *and* unfavorable — `light-red` / `red` /
  `strong-red` are `belowAverage` / `weak` / `poor`), plus rank→band mapping
  (`weeklyRankHeatTone`: explicit 1–32 bands for 32-team pools; 5 / 15 / 30 /
  45 / 60 / 75 / 90 percent share cut points otherwise).
  `src/lib/nfl/props/review/yardageHeat.ts` consumes it directly and is the
  model for adoption elsewhere.

New heat consumers build on these two modules. Do not introduce a third scale.

### Current adoption and retained exceptions

- `src/lib/shared/jkbHeat.ts` is the site-level entry point. It re-exports the
  approved tier, direction, missing/sample, small-pool percentile, rank-tone,
  and derived legend APIs without introducing new thresholds or math.
- `src/pages/MLBPercentileDemo.tsx` renders through the shared
  `PercentileCell` + `PERCENTILE_TIER_LEGEND`.
- `src/lib/fantasy/rankingPresentation.ts` delegates its existing quantile
  meanings to shared JKB Heat styles; its cutoffs are unchanged.
- `src/lib/cfb/sosPresentation.ts` keeps its established 133-team rank bands,
  with cells and legend driven by one shared local definition. Re-expressing
  those bands onto JKB Heat is a deferred visual change, not a current default
  ([BACKLOG.md](BACKLOG.md) BL-CFB-003).
- `src/lib/pga/pgaScoreColorScale.ts` builds on the shared percentile core.
- PGA's separate 4-band `pgaHeatColors.ts` and 5-band `rankColors.ts` palettes
  remain a temporary intentional exception. Migration requires explicit visual
  sign-off because an 8-band conversion would materially recolor PGA surfaces;
  never convert them silently. This sign-off is tracked in
  [BACKLOG.md](BACKLOG.md).

---

## E. Direction

All heat is based on **favorable / goodness percentile**, never on raw numeric
direction (see [DECISIONS.md](DECISIONS.md) KS-010).

- `higherBetter` — use the percentile directly (`direction: "higherBetter"`, the
  default in `percentileColorScale.ts`).
- `lowerBetter` — invert through the shared direction helper
  (`direction: "lowerBetter"`, which maps favorable = `100 − percentile`) or the
  shared rank inversion (`poolSize + 1 − rank`, as `historicalDefRankHeatTone`
  in `yardageHeat.ts` does).
- **Never hand-roll an inverse palette** (a second band table with the colors
  flipped). Pass direction into the shared helper.
- Perspective inversions (e.g. opponent-defense rank 1 = worst matchup for the
  offense) use the existing helper
  (`weeklyMatchupComponentHeatTone(rank, "opponent-defense")`), documented once.
- **Identity and context-only metrics get no heat** — see F.

---

## F. Percentile computation

- **Large comparison populations (~100+ rows):** use the existing divide-by-`n`
  behavior (`computePercentileRanks` in `src/lib/mlb/percentileColorScale.ts`).
  Its top band starts at 98 and is calibrated for populations of hundreds.
- **Fixed small pools** (32-team leagues; roughly 30–60-row position boards):
  use the `n − 1` endpoint convention (`computeTeamPercentiles` in
  `src/lib/fantasy/teamPercentiles.ts`; `computePpgPercentiles` in
  `src/lib/fantasy/ppgPercentile.ts`) so the best entry reads a true 100 and the
  worst a true 0. Divide-by-`n` caps the best of 32 at ~96.9, below the Elite
  band.
- **Direction must always be explicit** at the call site. A metric whose
  good/bad orientation is unknown or absent is `context-only` and resolves to no
  percentile and no heat (`computeTeamPercentiles` requires an explicit
  `NflMetricDirection` and returns empty for `"context-only"`).

The choice of denominator follows this rule; it is not left to each caller's
taste (see [DECISIONS.md](DECISIONS.md) KS-011).

---

## G. Missing data and sample behavior

Handled by `resolvePercentileDisplay` in
`src/lib/mlb/percentileColorScale.ts`; new consumers use it rather than
re-deriving.

- **Missing / non-finite value ≠ neutral average.** A missing value renders with
  no fill (a faint border only), never the Average slate wash. Painting missing
  as "average" fabricates a signal.
- **Known-insufficient sample** (`small-sample`): value stays visible, styling is
  a single muted neutral tint, and **no Elite / Excellent** paint
  (`SMALL_SAMPLE_STYLE`).
- **Sample size unavailable** (`sample-unavailable`): tier is muted
  (`muteTierStyle`) and **capped at Great** (`capTierForSampleUnavailable`,
  `SAMPLE_UNAVAILABLE_MAX_TIER_ID = "great"`) — never Elite gold.
- **Context-only metrics** (volume, tendency, no good/bad orientation) get no
  heat at all.
- Model scores with their own internal sample protection may set
  `bypassSampleGate` deliberately.

---

## H. Legends

Any heat-colored table **must** render a legend, and the legend is generated
from the **same tier definitions the cells use** — not a hand-copied list.

- Percentile/tier cells: build the legend from `PERCENTILE_TIER_LEGEND`
  (`src/lib/mlb/percentileColorScale.ts`).
- Rank-band cells: build it from the same band function / array the cells call
  (e.g. `RANK_COLOR_LEGEND`, `CollegeFootballRatingLegend`,
  `MatchupRankLegend`).

A legend that can drift from its cells is a defect.

---

## I. Sanctioned exceptions

- **MLB hot / cold semantic views** (`MlbStatTone` in
  `src/lib/mlb/mlbDisplayHelpers.ts`: positive = red, negative = blue/sky) may
  use a red-hot / blue-cold palette **only** when the view is explicitly labeled
  as hot/cold rather than favorable/unfavorable. This is a different question
  ("is this bat hot right now?") from the JKB Heat question ("is this value good
  relative to the pool?"). Not to be used as a general table scale.
- **Continuous gradients** (`getRankGradientColor` /
  `getPercentileGradientColor` in `src/lib/fantasy/parPresentation.ts`,
  emerald → slate → rose) may be used **only** where a smooth ramp genuinely
  reads better than the 8 discrete bands — i.e. a dense ordinal rank column
  where discrete banding would look stepped. Default to the discrete scale so a
  rank column and a percentile column on the same board read identically.
- **PGA `.pga-*` visual system** (`src/index.css`) is an intentional
  section-specific editorial identity, not a violation to flatten. Its
  typography and surface treatment stay. The temporary legacy heat exception
  above remains until explicit visual sign-off.
- **MLB park factors** in `MlbParkContextPanel` remain contextual until a
  consumer explicitly defines perspective: higher favors offense/overs but can
  disadvantage pitching/unders. Do not assign goodness heat while that
  direction is unresolved; see [BACKLOG.md](BACKLOG.md) BL-MLB-004.
