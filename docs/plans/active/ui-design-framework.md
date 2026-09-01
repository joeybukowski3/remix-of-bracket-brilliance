# Active plan: UI / Design Framework

Status: **Active** — approved.
Owner authority: this plan is tier 2 in [../../DECISIONS.md](../../DECISIONS.md)
KS-001 while active.

Backed by the completed UI / Design Framework Audit. The authority documents are
[../../BRAND.md](../../BRAND.md), [../../UI_FRAMEWORK.md](../../UI_FRAMEWORK.md),
and [../../TABLE_CONVENTIONS.md](../../TABLE_CONVENTIONS.md).

## Goal

Give future pages and features a consistent, professional JoeKnowsBall visual
language so surfaces stop defaulting to generic AI-dashboard patterns —
achieved through durable documentation first, then incremental, low-risk code
consolidation.

## Non-scope (hard limits)

- **No broad page redesign** — not in the documentation phase, and not as a side
  effect of any consolidation phase. Migrations are mechanical (swap in shared
  primitives / shared helpers), not visual overhauls.
- **No model or data methodology changes.** Presentation only (KS-007).
- **No arbitrary color changes.** Heat consolidation maps existing scales onto
  the documented JKB Heat bands; it does not re-pick colors.
- **No dark-mode implementation** during this plan unless dark mode is
  explicitly reopened as its own project (KS-012). Light-first only.
- Each phase after Phase 1 is its own change set with its own review; this plan
  does not authorize a single sweeping commit.

## Phases

### Phase 1 — Documentation authority — **done**

Create `docs/BRAND.md`, `docs/UI_FRAMEWORK.md`, `docs/TABLE_CONVENTIONS.md`,
this plan, and add the cross-cutting decisions to `docs/DECISIONS.md`. No code,
CSS, config, component, or test changes. **Complete when the five approved docs
are in place and internally consistent.**

### Phase 2 — Typography cleanup — **done**

- `src/index.css` loads and applies **DM Sans** as the global body/UI face per
  BRAND.md.
- Confirm Playfair Display stays scoped to PGA `.pga-*`.
- Scope: `src/index.css` font stack + the Google Fonts import line. No layout
  changes.

### Phase 3 — Tokenize `SiteHeader` and shared chrome — **done**

- Replace hard-coded hex in `src/components/layout/SiteHeader.tsx`
  (`#eeeeee`, `#333333`, `#111111`, `#f0f0f0`, `#1a1a1a`, `bg-white`) with token
  utilities (`border`, `foreground`, `muted`, `card`, …).
- Reconcile the `/college-football` (header) vs `/ncaa` (`SiteFooter`) route
  label divergence for the CFB section.
- Visual output must be unchanged or a deliberate, reviewed adjustment.

### Phase 4 — Remove obsolete Vite `App.css` scaffold — **done**

- `src/App.css` is unmodified Vite starter CSS (`#root { max-width:1280px;
  margin:0 auto; text-align:center }`, spinning-logo keyframes, `.read-the-docs`).
- Verify nothing depends on it, then remove the file and its import.

### Phase 5 — Shared dense-table primitive — **done**

- `src/components/ui/dense-table.tsx` now owns `DenseTableScroller`,
  `DENSE_TABLE_HEAD_ROW`, `DENSE_TABLE_ROW` — promoted verbatim from the NFL
  pattern (contained overflow, `role="region"`, `aria-label`, `tabIndex`,
  focus ring preserved).
- `src/components/nfl/ui/NflTable.tsx` is now a thin re-export/adapter under the
  historical `NflTableScroller` / `NFL_TABLE_HEAD_ROW` / `NFL_TABLE_ROW` names, so
  all existing NFL and Fantasy consumers keep working unchanged. Remaining
  per-sport migration is Phase 8.

### Phase 6 — Shared sticky-header / frozen-column helper — **done**

- `stickyDenseHeader()`, `frozenDenseColumn()` and the `TABLE_LAYER` z-index
  ladder (`frozen header cell z-30` / `sticky header z-20` / `frozen column
  z-10`, all below the `z-40` mobile strips and `SiteHeader` `z-[100]`) live in
  `src/components/ui/dense-table.tsx`, encoding the TABLE_CONVENTIONS.md ladder.
- `src/pages/FantasyPointsAllowed.tsx` is migrated onto them as the
  representative sticky-header + frozen-first-column consumer (class output
  unchanged). Other per-table re-implementations move over opportunistically in
  Phase 8.

### Phase 7 — Heat-scale consolidation — **done with recorded exceptions**

Progress (2026-08-31):

- **Shared entry point created:** `src/lib/shared/jkbHeat.ts` consolidates and
  re-exports the two source-of-truth modules (no new thresholds or math). It
  adds the explicit shared vocabulary — `HeatDirection`,
  `HeatNonScoringState` (`missing` / `small-sample` / `sample-unavailable` /
  `context-only`), the canonical `TIER_TO_WEEKLY_HEAT_TONE` bridge +
  `tierToWeeklyHeatTone` / `weeklyHeatToneToTierId` adapters, and
  `JKB_HEAT_LEGEND` (derived from `PERCENTILE_TIER_LEGEND`, cannot drift). The
  large-population divide-by-`n` helper and the fixed-small-pool `n − 1`
  helper (`computeTeamPercentiles`, `computePpgPercentiles`) are re-exported
  side by side with the denominator rule documented in the module header.
- **Representative migration (mechanical):** `src/lib/nfl/props/review/yardageHeat.ts`
  now imports the `WeeklyHeatTone` primitives from `@/lib/shared/jkbHeat`
  instead of reaching directly into `researchPresentation.ts`. Byte-identical
  output; all NFL yardage-review consumers unchanged.
- **CFB SOS (`src/lib/cfb/sosPresentation.ts`):** band→style mapping and the
  new `SOS_HEAT_LEGEND` are now driven from one `SOS_BAND_STYLES` table, so the
  legend can no longer drift from the cells. `getSosHeatClass` output is
  unchanged for every rank (test-verified). SOS stays a rank-band scale; full
  re-expression onto the shared JKB Heat tones is deferred — it is a visual
  change across four CFB components that needs browser sign-off, not a
  mechanical swap.
- **Tests:** `src/lib/shared/jkbHeat.test.ts` (band boundaries 98/95/80/60/40/
  25/10, higherBetter/lowerBetter, missing/non-finite, small-sample,
  sample-unavailable, context-only, legend parity, bridge round-trip,
  re-export identity) + `SOS_HEAT_LEGEND` parity in `sosPresentation.test.ts`.
- **Closure:** `MLBPercentileDemo.tsx` and Fantasy
  `rankingPresentation.ts` now consume shared JKB Heat presentation; CFB SOS
  has a single source for its established cells/legend. PGA's 4/5-band legacy
  palettes remain a temporary exception pending explicit visual sign-off
  ([BACKLOG.md](../../BACKLOG.md) BL-PGA-001). `MlbStatTone` hot/cold and
  Fantasy `parPresentation.ts` continuous gradients remain sanctioned
  exceptions. Thresholds, direction rules, and percentile math are unchanged.

### Phase 8 — Per-sport migration order — **done**

Apply Phases 5–7 primitives per sport, mechanically, in this order:

1. **NFL** (reference implementation — least work)

Progress (2026-08-31, Phase 8A — NFL):

- **Audit outcome:** the primary NFL data tables (`NFLStandings`,
  `NFLTeamSchedules`, `NflYardageReviewTable`, and the other `pages/NFL*`
  boards) already consume `NflTableScroller` / `NFL_TABLE_HEAD_ROW` /
  `NFL_TABLE_ROW`, which since Phase 5 are thin re-exports of the shared
  `@/components/ui/dense-table` primitives. No behavior duplication remains
  there, so their import paths were left on the `nfl/ui/NflTable` shim
  (changing them would be import aesthetics only, explicitly out of scope).
- **Migrated (mechanical, real behavior gap closed):** the two Yardage Props
  Review detail-panel history tables —
  `src/components/nfl/yardage-review/NflYardagePlayerLast10Table.tsx` and
  `NflYardageOpponentLast10Table.tsx` — were on a bare `overflow-x-auto` div
  (not keyboard-reachable, not announced, unpositioned ancestor). They now use
  `DenseTableScroller` (adds `role="region"`, `aria-label`, `tabIndex`,
  `relative`, focus ring). Column set, order, data, heat, footer, and the
  `rounded-md border-2 border-slate-300` shell are unchanged; tests added for
  the scroll-region contract.
- **Navigation reviewed, no change needed:** `NflSectionSidebar` /
  `NflMobileMenu` (single nav surface, Radix Sheet, `top-[73px]` below the
  header, auto-close on route change), `MatchupTabRow` and `MatchupJumpNav`
  (both `sticky` at `MATCHUP_STICKY_NAV_TOP`, `z-30` below `SiteHeader`
  `z-[100]`) already match UI_FRAMEWORK.md §E.
- **Deferred to and completed in Phase 8E:** `NflDfsAnalyzerTable` had a
  hand-rolled `sticky top-0 z-10` thead +
  bare `overflow-x-auto` on the `FANTASY_TABLE_SHELL` div) — its table shell is
  a shared Fantasy primitive, so its clean migration belonged with the Fantasy
  pass rather than the NFL pass.
2. **CFB**

Progress (2026-08-31, Phase 8B — CFB):

- **Audit outcome:** the CFB matchup surfaces (`CollegeFootballPowerComparison`,
  `CollegeFootballSeasonStatsComparison`, `CollegeFootballModelPanel`,
  the shared-bar rows) are low-density editorial comparison layouts, not dense
  data tables — deliberately left alone (KS: "do not convert editorial content
  into tables"). `CollegeFootballMobileStickyHeader` (`fixed top-[72px] z-40`)
  already matches the TABLE_CONVENTIONS.md z-index ladder; no hand-rolled
  in-table sticky/frozen logic exists anywhere in CFB, so `stickyDenseHeader` /
  `frozenDenseColumn` had nothing mechanical to replace and no frozen column was
  added just because the helper exists.
- **Migrated (mechanical, class output preserved):** the three genuine CFB dense
  data tables now consume the shared `@/components/ui/dense-table` primitives —
  `DenseTableScroller` + `DENSE_TABLE_HEAD_ROW` + `DENSE_TABLE_ROW`:
  - `CollegeFootballRankingsTable` — dropped the local `HEAD` constant and the
    hand-rolled `role="region"` scroll region (both were byte-identical to the
    shared versions).
  - `ConferenceStandingsCard` (desktop table) — same swap; scroller keeps its
    `hidden sm:block` responsive gate via `className`.
  - `CollegeFootballTeamPage` schedule table — same swap; this one also gains the
    load-bearing `relative` on the scroll container it was previously missing
    (the documented page-widening risk from an unpositioned `overflow-x-auto`
    ancestor). Row `<td>` padding left as-is (`py-2`) — normalizing it to the
    `py-1.5` rankings density was judged a visual change, not mechanical.
  - `DENSE_TABLE_ROW` adds only `transition-colors` over the previous row class
    (sanctioned "restrained hover", TABLE_CONVENTIONS.md §A).
- **Heat / tokens:** no change. `getSosHeatClass` / `SOS_HEAT_LEGEND`
  (`sosPresentation.ts`) already single-sourced in Phase 7; SOS thresholds
  untouched. `CollegeFootballRatingLegend` and `getCfbRatingHeatClass` left as-is
  — full SOS/rating re-expression onto shared JKB Heat tones stays deferred
  (visual change across four components, needs browser sign-off).
- **Navigation:** `CollegeFootballLayout` secondary nav (`CFB_SECTION_NAV`) sits
  below `SiteShell`'s `SiteHeader`, is not sticky, has no mobile duplicate, and
  its labels ("Top 25 & Conferences" / "FBS Rankings" / "Schedule") match the
  live `/college-football` routes. No change needed.
- **Tests:** added scroll-region + shared head/row assertions to
  `CollegeFootballRankingsTable.test.tsx`; new `ConferenceStandingsCard.test.tsx`
  (scroll-region contract + column labels + row-per-team). Existing CFB/TeamPage
  tests pass unchanged. Pre-existing unrelated failure
  `CollegeFootballTeamPage.test.tsx > "shows missing market spreads as em
  dashes"` (spread data, `-47.5` vs `—`) confirmed present before this pass.
- **Deferred:** matchup editorial comparison components (not tables);
  SOS/rating heat re-expression onto JKB Heat tones (Phase 7 visual follow-up).
3. **PGA** (keep `.pga-*` editorial identity; only heat cells + table shell
   consolidate)

Progress (2026-08-31, Phase 8C — PGA):

- **Migrated shared table infrastructure:** `PgaHistoryModelTable`, both views
  in `PgaModelTable`, `PgaHubShared`'s `PgaCompactTable`, and the live table in
  `PgaResearchDashboard` now use `DenseTableScroller`; their dense header/body
  rows use `DENSE_TABLE_HEAD_ROW` / `DENSE_TABLE_ROW` where existing styling
  maps mechanically. Existing labels, columns, row order, values, density,
  alternating surfaces, and responsive gates remain intact.
- **Mobile containment:** the `/pga/custom` content column now has `min-w-0`,
  allowing `PgaCompactTable`'s shared scroller to contain its 880px table at
  narrow widths instead of widening the document. The existing stacked mobile
  composition is otherwise unchanged.
- **Sticky / frozen behavior:** existing frozen identity columns in
  `PgaModelTable`, `PgaCompactTable`, and `PgaResearchDashboard` now use
  `frozenDenseColumn`; the dashboard's existing sticky header uses
  `stickyDenseHeader`. Opaque PGA row/header surfaces remain in place and the
  intersection/header/column layers now follow the shared z-30/z-20/z-10
  ladder. No new frozen columns were introduced.
- **Editorial identity deliberately preserved:** Playfair-backed
  `.pga-section-title` / `.pga-hero-title`, `.pga-picks-page` variables, warm
  accents, bespoke cards, gradients, schedule rail, mobile disclosure cards,
  and storytelling/flow components were not generalized. `src/index.css`
  required no Phase 8C edit; the existing in-progress DM Sans body change was
  left untouched.
- **Heat audit — deferred visual change:** `pgaScoreColorScale.ts` remains on
  the shared percentile core. `pgaHeatColors.ts` remains its current four-band
  treatment (75 / 50 / 25 boundaries), and `rankColors.ts` remains its current
  five-band 80 / 60 / 40 / 20 palette with `getPercentileFromRank`. Moving
  either to JKB Heat would introduce gold plus additional deep-green and
  red-strength bands and would recolor broad percentile ranges; that is not a
  mechanically equivalent migration. Compatibility tests now lock the current
  thresholds, hex/classes, legend labels, and rank endpoints pending explicit
  visual sign-off.
- **Tokens:** audited table neutrals were retained where semantic tokens are not
  color-identical, and the dashboard's pale green `#f8fbf7` sticky-header
  surface remains an intentional opaque PGA editorial tint. No warm or PGA
  accent was replaced by a generic token.
- **Tests:** PGA component coverage asserts accessible shared scroll regions,
  shared frozen/sticky layers, preserved labels/data, and retained
  `.pga-picks-page` / `.pga-section-title` hooks. Heat compatibility coverage
  is in `src/lib/pga/pgaHeatCompatibility.test.ts`.
4. **MLB**

Progress (2026-08-31, Phase 8D — MLB):

- **Audit outcome:** MLB mixes four color languages — JKB Heat percentile cells
  (`MlbPercentileScoreCell` / `MlbBatterVsPitcher`, already correct), the
  sanctioned hot/cold `MlbStatTone` red/blue palette, directional trend palettes
  (pitcher regression green/blue; "lucky/unlucky" blue/orange), and identity
  colors (team tints, sportsbook amber pricing tint). Classification:
  - **Goodness (A):** `MlbLineupMiniStat` favorable AVG/OBP/SLG/K%,
    `MlbTeamMiniCard` `row.better` record — both were painting *favorable*
    values with the hot/cold red via `getStatToneClasses("positive")`. Corrected.
  - **Hot/cold (B) — retained:** `MlbPitcherRegressionTable` regression score
    (green = ERA likely to fall, blue = likely to rise) and lucky/unlucky stat
    tints; intent now stated explicitly in a header comment. `MlbStatTone`
    (`getStatToneClasses`) itself is unchanged — still the sanctioned
    positive=red / negative=blue palette for genuinely hot/cold views.
  - **Context / ambiguous (C) — deferred, reported:** `MlbParkContextPanel`
    run/HR park-factor tone (`getStatToneFromFactor` → factor > 1 = red). A high
    park factor is not "good" or "bad" without a perspective (favorable for
    overs, unfavorable for pitching); left unchanged pending a decision.
    `MlbSummaryCard` uses a constant `getStatToneClasses("positive")` as a
    static edge-badge tint — decorative, not a goodness/hot-cold signal; left
    unchanged. `MlbStatComparisonRow` bar coloring already uses the correct
    favorable direction (green high / red low).
- **Goodness-color correction (mechanical, thresholds unchanged):**
  `getGoodnessToneStyle` / `MlbGoodnessTone` in `mlbDisplayHelpers.ts` is a
  thin semantic adapter — it defines no colors, only a
  `MlbGoodnessTone → WeeklyHeatTone` map (`favorable → light-green`,
  `neutral → neutral`, `unfavorable → light-red`) and returns
  `jkbHeatStyle(...)` from `@/lib/shared/jkbHeat`, so "favorable green" /
  "unfavorable red" have one source of truth (the JKB Heat above-average /
  average / below-average bands). `MlbLineupMiniStat` and `MlbTeamMiniCard`
  apply it as an inline `style` (dropped their `border`+class treatment). No
  threshold, data, or analytical-interpretation change — only the color
  direction. `getStatToneClasses` / `getStatToneStyle` (sanctioned hot/cold)
  untouched.
- **Shared dense-table migration:** `MlbPitcherRegressionTable` now uses
  `DenseTableScroller` (adds `role="region"` + `aria-label` + `tabIndex` +
  focus ring + load-bearing `relative` — the bare `overflow-x-auto` div had
  none) and `frozenDenseColumn` for its already-frozen Player column (z-30
  header / z-10 body — byte-identical to the previous hand-rolled values). No
  sticky header added (would be new behavior); row/header density classes left
  as-is (shared `DENSE_TABLE_HEAD_ROW`/`DENSE_TABLE_ROW` would have been a
  visual change, not a mechanical swap). Removed an unused `getMlbTeamColors`
  import and the now-unused `cn` import.
- **Percentile demo consolidation:** `MLBPercentileDemo.tsx` drops its bespoke
  inline `percentileToClass` ramp (rose-high / blue-low / amber — not JKB Heat)
  and renders every metric through the shared `PercentileCell` +
  `PERCENTILE_TIER_LEGEND` legend. Direction preserved (K% lower-better, all
  others higher-better — matches the old `100 - pct` inversion). The static
  sample carries no sample sizes, so `bypassSampleGate` is passed with a code
  comment (same pattern `MlbBatterVsPitcher` already uses for model scores);
  colours intentionally change to the approved scale — exact parity with the
  old ad-hoc ramp is not a goal.
- **+EV tables deferred:** `HrPlusEvTable` / `KPlusEvTable` are bespoke
  `table-fixed` + `colgroup` + per-group semantic tint systems with
  KS-008-sensitive +EV emphasis; their scroller/sticky migration is not a
  mechanical swap and needs its own pass with browser sign-off. `+EV`
  terminology, labels, prices, ranks, model values, sorting, and filtering
  untouched.
- **performance-preview/*Table deferred:** `HrPerformanceTable`,
  `NumerologyPerformanceTable`, `SinCityPerformanceTable`, `Top*PerformanceTable`
  are a separate table family with their own shell (`tableColumns.ts`,
  `MobileAccordionRows`) and grading semantics — own audit required.
- **Tokens:** no token swaps. Team tints, sportsbook amber pricing tints, and
  the hot/cold/trend palettes are identity/semantic, not generic-brand
  candidates.
- **Tests:** `mlbDisplayHelpers.test.ts` proves `getGoodnessToneStyle` is
  `toEqual` the shared `jkbHeatStyle` bands (not a separate palette) and that
  the hot/cold API is unchanged; `MlbLineupMiniStat.test.tsx` +
  `MlbTeamMiniCard.test.tsx` (favorable renders the shared green fill, never
  red); `MLBPercentileDemo.test.tsx` (shared PercentileCell + legend + K%
  lower-better parity); shared scroll-region assertion added to
  `MlbPitcherRegressionTable.test.tsx`. All green (targeted MLB + jkbHeat +
  dense-table suites, 47 tests in the focused run).
- **Known pre-existing blocker (reported, not fixed):**
  `src/lib/mlb/mlbPitcherRegression.ts` has a committed syntax corruption (a
  duplicated `PitcherRegressionData` member block after the closing `};`, commit
  `14a05de9`) that makes `tsc -p tsconfig.app.json` bail at parse. `tsc -p
  tsconfig.app.json` also has dozens of other unrelated errors on this branch.
  `vite build` and `tsc -p tsconfig.node.json` are clean. Removing the dupe
  block additionally surfaces a latent `xera`-missing error in
  `buildPitcherRegressionData` — both are model-file issues outside this pass.

Progress (2026-08-31, Phase 8D-2 — JKB Heat authority reconciliation):

- **Mismatch resolved:** `src/lib/mlb/percentileColorScale.ts` `PERCENTILE_TIERS`
  rendered the unfavorable half (`belowAverage` / `weak` / `poor`) **blue**,
  while KS-010, TABLE_CONVENTIONS §D, and `WeeklyHeatTone` all say the
  unfavorable half is **red**. `PercentileCell` consumed the blue styles
  directly. The canonical goodness scale is now gold → emerald → neutral slate
  → **red** end to end.
- **Consumer audit — every consumer of `PERCENTILE_TIERS` styles /
  `getPercentileTier` / `resolvePercentileDisplay` / `PERCENTILE_TIER_LEGEND` is
  goodness/favorability**, none is hot/cold: `PercentileCell`
  (`MlbBatterVsPitcher`, `MlbHrProps`, `MlbStrikeoutProps`, `MLBPercentileDemo`),
  `BatterExpandedDetails` (explicit `direction`), `pgaScoreColorScale`
  (`getPgaScoreTier` → PGA model-score tier), `researchPresentation`
  `WeeklyHeatTone` favorable half, and the three legends. Nothing needed to be
  split off. `PgaHub`'s local `PercentileCell` / `getPercentileStyles` and
  `PgaHistoryModelTable`'s per-cell `percentileHeatClass` are `pgaHeatColors`
  and untouched (their "Score tiers" legend and `Score` cell go through
  `PERCENTILE_TIERS` and do pick up the red — see PGA impact).
- **Core change (styles only — zero threshold / math / gating change):**
  `PERCENTILE_TIERS[belowAverage|weak|poor].style` set to the exact red values
  that `WeeklyHeatTone` already used for `light-red` / `red` / `strong-red`.
  `researchPresentation.ts` now derives those three fills via
  `mlbTier("belowAverage"/"weak"/"poor")` instead of duplicate literals — so
  `weeklyHeatStyle` / `weeklyHeatTextClass` / `getGoodnessToneStyle` output is
  **byte-identical**, and `PERCENTILE_TIERS` is the single source for the whole
  ramp. `98/95/80/60/40/25/10/0` cutoffs, `computePercentileRanks`,
  `higherBetter`/`lowerBetter`, `SMALL_SAMPLE_STYLE`, `capTierForSampleUnavailable`,
  `muteTierStyle`, missing-handling all unchanged.
- **jkbHeat.ts:** no code change — `TIER_TO_WEEKLY_HEAT_TONE` and
  `JKB_HEAT_LEGEND` (derived from `PERCENTILE_TIER_LEGEND`) were already correct
  and now can't disagree with the cells. Header comment updated.
- **MLB hot/cold exception preserved:** `MlbStatTone` / `getStatToneClasses` /
  `getStatToneStyle` (positive = red, negative = blue/sky) untouched.
- **PGA impact:** `pgaScoreColorScale.getPgaScoreTier` feeds
  `PgaHistoryModelTable`'s `Score` cell (Score view) and the "Score tiers"
  legend. Model-score percentiles below the 40th now paint **red instead of
  blue** (below-average rose / weak red / poor `#dc2626`). This is a
  goodness display (a lower model score is genuinely worse), so it should
  follow JKB Heat — it is a correction, not a regression. Per-cell
  `pgaHeatColors` / `rankColors` NOT migrated (explicit out-of-scope).
- **Docs:** `TABLE_CONVENTIONS.md` §D source-of-truth bullets rewritten (the
  scale owns the full gold→red ramp; `WeeklyHeatTone` is a vocabulary over it);
  the stale incompatible-palette comment was removed from
  `researchPresentation.ts`.
- **Tests:** boundary + red-not-blue assertions added to
  `percentileColorScale.test.ts`, `jkbHeat.test.ts`,
  `MlbPercentileScoreCell.test.tsx`; `researchPresentation.test.ts` gains a
  full favorable+unfavorable derivation cross-check.

5. **Fantasy**, then any remaining surfaces (Bracket / World Cup / Home / SEO
   pages) as appropriate.

Progress (2026-08-31, Phase 8E — Fantasy):

- **Audit / shared table migration:** `FantasyParBoard` (Overall), both layouts
  in `PositionParBoard`, both layouts in the temporary `LegacyPositionBoard`,
  the Draft Preview board plus its Starting Roster / My Draft tables, and the
  desktop `NflDfsAnalyzerTable` now import `DenseTableScroller` directly rather
  than the historical NFL compatibility shim or a bare overflow wrapper.
  Weekly Rankings' custom compact grid now uses `DenseTableScroller` as its
  keyboard-reachable local overflow region. `FantasyPointsAllowed` was already
  the Phase 6 representative consumer and remains on the shared helpers.
  `DENSE_TABLE_HEAD_ROW` / `DENSE_TABLE_ROW` were adopted where the existing
  dense styling mapped cleanly; Fantasy's bordered cell grid and deliberate
  column hierarchy remain intact.
- **Sticky / frozen behavior:** in-container sticky headers on the Overall,
  position, legacy, DFS, Starting Roster, and My Draft tables now use
  `stickyDenseHeader` and the shared z-20 layer. Opaque header surfaces remain.
  No new frozen columns were introduced. Draft Preview's page-sticky
  `top-[73px]` header cells and its existing Rank + Player pins remain bespoke
  because `stickyDenseHeader` intentionally targets an in-table `top-0`
  scroller; Weekly's compact Rank/logo/name micro-columns likewise remain its
  existing specialized grid. `FantasyPointsAllowed` continues to use
  `frozenDenseColumn` for its single Team identity column.
- **Heat:** `rankingPresentation.ts` keeps its existing quartile and fixed SOS
  cutoffs but mechanically maps favorable / neutral / unfavorable to shared
  JKB Heat light-green / neutral / light-red styles; missing remains unpainted.
  `ppgPercentileStyle` keeps the existing per-position `n - 1` percentile math
  and now delegates styling to the full shared JKB Heat tier definitions, so
  below-average PPG is red rather than falsely neutral. `teamPercentiles.ts`
  math is unchanged and regression-tested. Weekly heat already used the shared
  authority. The sanctioned continuous PAR/rank gradient in
  `parPresentation.ts` is unchanged.
- **Hierarchy / tokens:** JKB rank, consensus/ADP, PAR/G, projected points,
  position badges, matchup heat, and read-only shadow Model Rank retain their
  distinct treatments. No hard-coded neutral or identity colors were changed;
  position colors, Draft Preview amber pick/target accents, and PAR treatments
  remain intentional.
- **Mobile containment:** Draft Preview's base grid now declares
  `grid-cols-1`, preventing its implicit grid track from expanding the page to
  422px at a 320px viewport while preserving the existing `lg` sidebar tracks.
  Weekly, ROS, Draft Preview, and Points Allowed have no page-level horizontal
  overflow at 320 / 768 / 1024 / 1440; wide tables scroll only inside their
  labelled regions.
- **Tests:** focused Fantasy component/presentation coverage verifies accessible
  scrollers, shared density/sticky classes, unchanged order/ranks/PAR values,
  JKB Heat direction, missing handling, and fixed-small-pool percentile
  endpoints. `tests/fantasy-ui-framework-phase8e.spec.ts` provides permanent
  analytics-safe browser coverage for Weekly, ROS, Draft Preview, and Points
  Allowed at 320 / 768 / 1024 / 1440.
- **Deferred:** Draft Preview's page-sticky two-column corner and Weekly's
  custom compact frozen identity triplet require a deliberate UX change rather
  than a mechanical helper swap. The temporary Legacy board retains its second
  pinned Player column for parity while it remains available for side-by-side
  review. No projection/model/PAR/ADP/ROS methodology work was performed.

### Phase 9 — Final cross-site visual audit — **audit complete; rollout remains active**

Progress (2026-08-31, user-directed final cross-site audit):

- **Coverage:** analytics-safe Playwright inspected 28 representative routes
  across Home, NFL, CFB, PGA, MLB, and Fantasy at 320 / 768 / 1024 / 1440.
  The matrix recorded document width, route resolution, heading size, body
  font, accessible table scrollers, tables, sticky/fixed elements, page height,
  and runtime/error-overlay state. Temporary screenshots stayed in Playwright
  output and were not committed.
- **Cross-site result:** DM Sans is the computed body face on every route; PGA's
  display treatment remains scoped; mobile page titles remain within the
  framework scale; global and sport navigation remain reachable with no
  observed sticky overlap. JKB Heat reads consistently gold/green/slate/red on
  the audited CFB, PGA model-score, MLB percentile, NFL, and Fantasy goodness
  surfaces. Brand blue remains structural rather than goodness heat.
- **Category A fix:** `/nfl` widened the document to 392px at a 320px viewport.
  The mobile weekly game board was a grid item retaining its intrinsic minimum
  width; `min-w-0` on `GameBoard` now lets it shrink to the available column.
  The existing analytics-safe NFL browser spec now runs the mobile case at
  320px and asserts document-level containment. The final 112 route/viewport
  matrix has no page-level horizontal overflow.
- **Category B findings (reported, not changed):** several MLB props pages use
  many equally rounded cards and highly varied tool-chip accents; CFB matchup
  and PGA Custom communicate their visual identity but do not expose a normal
  visible `h1`; the full-width Fantasy ROS identity freeze leaves only Rank and
  Player visible before local scrolling at 320px. These are visible judgment
  calls, not mechanical fixes.
- **Category C candidates:** NFL Weekly Matchups is a long repeated-card feed
  (especially on mobile), and the older MLB HR / K presentation families would
  benefit from their own hierarchy/card-composition review. No redesign was
  attempted in this audit.
- **Intentional exceptions retained:** PGA editorial typography and scoped dark
  Custom page; PGA legacy 4/5-band heat pending explicit visual sign-off; MLB
  hot/cold semantics; Fantasy PAR's continuous gradient; Draft Preview's
  page-sticky Rank + Player corner; Weekly Rankings' compact identity layout;
  and the NFL `NflTable` compatibility re-export.
- **Deferred / data-dependent:** `/mlb` rendered its honest `Failed to fetch`
  state in the restricted preview environment, so the live game-detail body
  could not be judged. The DFS analyzer had no uploaded slate/table. External
  logo/data requests rejected by the browser environment were recorded
  separately from application error overlays.
- **Remaining focused table debt:** `HrPlusEvTable` / `KPlusEvTable`, the MLB
  `performance-preview` table family, and additional live MLB prop-board bare
  overflow wrappers need a dedicated table-semantics/sticky audit; they were
  not treated as mechanical swaps in this cross-site pass. The ambiguous
  `MlbParkContextPanel` factor palette still needs an explicit batter/pitcher or
  over/under perspective before goodness heat is valid.
- **Documentation drift found and resolved in Phase 9A:** the audit found that
  BRAND.md / UI_FRAMEWORK.md still described the old typography fallback and that
  UI_FRAMEWORK.md / TABLE_CONVENTIONS.md described implemented shared
  primitives as pending work. The focused reconciliation below corrected the
  authority docs before closure.
- **Completion verdict:** the audit itself is complete, but the framework
  rollout is **not ready to move to `docs/plans/completed/`**. Phase 9A resolved
  the documentation drift; the focused MLB table-family work above remains.

### Phase 9A — Documentation reconciliation and closure decisions — **done**

- BRAND.md and UI_FRAMEWORK.md now describe implemented DM Sans typography,
  tokenized global chrome, removed `App.css`, light-first status, and proven
  mobile overflow containment.
- TABLE_CONVENTIONS.md now names `DenseTableScroller`, the shared density
  constants, sticky/frozen helpers, `TABLE_LAYER`, and the full
  gold→green→slate→red JKB Heat scale as current implementation.
- PGA legacy heat visual sign-off and context-dependent MLB park-factor tone
  are recorded as unresolved backlog items rather than accepted decisions:
  [BACKLOG.md](../../BACKLOG.md) BL-PGA-001 / BL-MLB-004.
- Final closure remains pending the focused MLB table-family migration/review.
  Do not move this plan to `docs/plans/completed/` until that work is resolved;
  perform the move in a separate final documentation pass.

### Phase 9B — MLB table-family migration — **done** (D group closed by Phase 9C)

Progress (2026-08-31):

- **Classification of the remaining MLB table infrastructure:**
  - **A (mechanically migratable now):** `HrPlusEvTable`, `KPlusEvTable`
    (bare `overflow-x-auto` + hand-rolled `sticky top-0 z-20` thead), and the
    desktop layer of the five `performance-preview` tables (`HrPerformanceTable`,
    `NumerologyPerformanceTable`, `SinCityPerformanceTable`,
    `TopHrPerformanceTable`, `TopKPerformanceTable` — bare `overflow-x-auto`
    shell). All migrated.
  - **B (shared infra via the column helper):** `performance-preview/tableColumns.ts`
    frozen Player column — kept its bespoke dark-shell/shadow treatment but its
    z-index now composes from the shared `TABLE_LAYER` ladder (byte-identical
    `z-20` header / `z-10` body).
  - **C (intentionally bespoke, retained):** `MobileAccordionRows` (the
    performance-preview mobile layout — a deliberate responsive abstraction that
    beats a generic table on mobile, per TABLE_CONVENTIONS.md §B); the HR/K +EV
    expanded detail panels (`PlusEvDetails` / `KPlusEvDetails` per-group tinted
    sections); the +EV `ValueBadge` / `labelTone` / `evTone` / pricing-column
    amber tint / group-boundary dividers (KS-008-sensitive emphasis, untouched).
  - **D (deferred — dedicated pass needed):** the inline prop-board tables inside
    `src/pages/MlbHrProps.tsx` and `src/pages/MlbStrikeoutProps*` (multiple
    hand-rolled `overflow-x-auto` + `sticky top-0 z-10/z-20` tables with bespoke
    lg-breakpoint mobile card fallbacks, in ~3.8k-line page files). Not a
    mechanical swap; each needs its own review with browser sign-off on live
    slate data. `MlbParkContextPanel` factor palette still blocked on BL-MLB-004.
- **Scroller adoption:** `HrPlusEvTable`, `KPlusEvTable`, and all five
  `performance-preview` desktop tables now use `DenseTableScroller`
  (`role="region"` + `aria-label` + `tabIndex={0}` + focus ring +
  load-bearing `relative`). Preserved unchanged: `table-fixed` + `<colgroup>`
  sizing, group headers, the pricing-column tint/weight treatment, the semantic
  column-group tints (K table), `ValueBadge` grading cells, `evTone` +EV
  emphasis, the mobile card / accordion fallbacks, `min-w-[...]` desktop widths,
  and the `hidden … sm:block` responsive gate (moved onto the scroller's
  `className`).
- **Sticky / frozen:** `HrPlusEvTable` / `KPlusEvTable` `sticky top-0 z-20`
  theads now call `stickyDenseHeader()` (identical output). No new sticky
  headers were added to the performance-preview family (their thead is
  intentionally non-sticky). The frozen Player column keeps its existing
  behavior, now expressed through `TABLE_LAYER`.
- **+EV / heat / colour:** no model, formula, threshold, probability, label, or
  emphasis change. No JKB Heat, sportsbook, grading, or price/edge colour
  change. KS-008 language untouched.
- **Tests:** shared-scroll-region + sticky-header + preserved-emphasis
  assertions added to `HrPlusEvTable.test.tsx`, `KPlusEvTable.test.tsx`, and
  `HrPerformanceTable.test.tsx` (representative for the family, also asserts the
  frozen column + retained mobile accordion). New analytics-safe
  `tests/mlb-ui-framework-phase9b.spec.ts` checks page-level overflow
  containment and keyboard-reachable scrollers at 320 / 768 / 1024 / 1440 on
  `/mlb/hr-props`, `/mlb/strikeout-props`, `/mlb/performance-preview`.
- **Validation:** targeted MLB + dense-table suites green (94 tests);
  `tsc -p tsconfig.node.json` clean; `vite build` clean; `git diff --check`
  clean; lint clean on changed files. `tsc -p tsconfig.app.json` still bails at
  the pre-existing committed `src/lib/mlb/mlbPitcherRegression.ts(28,1)` syntax
  corruption (unrelated, documented in Phase 8D). Browser: `/mlb/performance-preview`
  rendered the migrated "HR model prediction history" scroller with no page
  overflow at all four widths; `/mlb/hr-props` and `/mlb/strikeout-props`
  rendered their honest data-unavailable state in the restricted preview
  environment (no live slate), so the +EV scroller could not be judged live —
  unit coverage stands in.
- **Remaining before closure:** the **D** group above — completed in Phase 9C.

### Phase 9C — MLB inline prop-board table migration — **done**

Progress (2026-08-31):

- **Inventory (`src/pages/MlbHrProps.tsx`, `src/pages/MlbStrikeoutProps.tsx`):**
  - **A (mechanical, migrated):** HR detail-panel handedness-splits table
    (bare `overflow-x-auto rounded-lg border`, no sticky); HR "Overdue Batters"
    and "Biggest Mismatches" lens tables (bare `overflow-x-auto`, `isCompactLayout`
    stacked-card fallback); HR "Matchup Lenses" table and the unreachable
    (`activeTab === "pitchers"`) "Pitcher View" table (bare `overflow-x-auto` +
    hand-rolled `sticky top-0 z-10 bg-white` thead); K "excluded / low-confidence"
    table (bare `overflow-x-auto` + `sticky top-0 z-20` thead, no frozen column).
  - **B (shared helper composition, migrated):** the HR batter board and the K
    strikeout board — bare `overflow-x-auto` + hand-rolled `sticky top-0 z-20`
    thead + two frozen identity columns (`left-0` rank + `left-6 sm:left-8` /
    `left-8` name). Scroller → `DenseTableScroller`; thead → `stickyDenseHeader()`
    (byte-identical `sticky top-0 z-20`); first frozen column → `frozenDenseColumn`
    (byte-identical `sticky left-0 z-30` header / `z-10` body); the **second**
    frozen column keeps its bespoke non-`left-0` offset and now composes its
    z-index from the shared `TABLE_LAYER` ladder (`frozenHeaderCell` z-30 /
    `frozenColumn` z-10 — unchanged values).
  - **C (intentionally bespoke, retained):** the `isCompactLayout` mobile
    card / expandable-row fallbacks on every board (primary mobile UX, not
    converted to tables); the second frozen identity column's `left-6 sm:left-8`
    contract; the `+EV` view (`HrPlusEvTable` / `KPlusEvTable`) already covered
    in Phase 9B; all per-cell `+EV` / edge / heat / sportsbook / pricing tints.
  - **D (deferred):** none — this closes the Phase 9B **D** group.
- **Scroller adoption:** all eight tables above now render inside
  `DenseTableScroller` (`role="region"` + `aria-label` + `tabIndex={0}` +
  focus ring + load-bearing `relative`). Preserved exactly: `table-fixed` +
  `<colgroup>` sizing, `min-w-[…]` widths, `border-separate border-spacing-0`,
  grouped `colSpan` header rows + `border-l-2` group dividers, `WebkitOverflowScrolling`
  touch hint (passed through as `style`), sort controls, filters, badges,
  `PercentileCell` / heat classes, row tint helpers, row order, labels, values.
- **Sticky / frozen:** the two boards' `sticky top-0 z-20` theads call
  `stickyDenseHeader()`; the HR/K tables that had `sticky top-0 z-10 bg-white`
  are normalized onto `stickyDenseHeader()` + retained `bg-white` (z-10 → the
  documented z-20; no frozen column on those tables to conflict). Opaque
  `bg-slate-50` / `bg-slate-100/90` header-cell surfaces and row-tint sticky
  backgrounds unchanged.
- **Responsive contract:** the existing `isCompactLayout` (`lg`) split between
  desktop board table and mobile card / accordion fallback is unchanged. No
  duplicate content, no missing content, no page-level horizontal overflow at
  320 / 768 / 1024 / 1440 (browser-verified against the committed slate
  artifact — data was available, not an empty state).
- **Analytics safety:** zero change to HR Score, K Score, `+EV` math, fair
  value, market price, edge, sportsbook labels, selection logic, sort order,
  filters, model status, or recommendation language. KS-008 language untouched.
  No heat threshold or colour-semantic change.
- **Tests:** `src/pages/MlbHrProps.phase9c.test.tsx` and
  `src/pages/MlbStrikeoutProps.phase9c.test.tsx` (accessible scroll region,
  sticky-header + frozen-column `TABLE_LAYER` parity, preserved header labels
  and row order, HR mobile card fallback still replaces the board table below
  `lg`). New analytics-safe `tests/mlb-ui-framework-phase9c.spec.ts` (overflow
  containment + keyboard-reachable scrollers at 320/768/1024/1440; desktop
  board table absent at 320).
- **Validation:** new Phase 9C component tests green (6); shared
  `jkbHeat` + `dense-table` suites green (39); targeted HR/K prop suites show
  only the 4 pre-existing unrelated failures (verified identical with the
  files reverted): `MlbStrikeoutProps.sorting` "missing-line/odds messages",
  `MlbHrProps.freshness` #33 / #40 park-factor layout, `MlbStrikeoutProps.freshness`
  #7. `tsc -p tsconfig.node.json` clean; `vite build` clean; `git diff --check`
  clean; lint on the two pages shows only pre-existing warnings and 3
  pre-existing `no-explicit-any` errors at `MlbHrProps.tsx:2162-2164`
  (outside the changed regions). `tsc -p tsconfig.app.json` still bails at the
  pre-existing `src/lib/mlb/mlbPitcherRegression.ts` syntax corruption (Phase 8D).
- **Browser:** `/mlb/hr-props` and `/mlb/strikeout-props` rendered the migrated
  boards with populated committed-slate data at all four widths — frozen
  rank + name columns, sticky grouped headers, group dividers, edge pills, and
  JKB Heat all intact; document-level horizontal overflow ≤ 1px everywhere;
  the mobile card fallback is the only board UI at 320px.

## Remaining work before closure

1. Perform a separate documentation-only closure pass and move this plan to
   `docs/plans/completed/` (Phase 9B **D** / Phase 9C is now resolved).
2. Retain explicit exceptions/deferred items unless separately approved:
   PGA's editorial system and legacy 4/5-band heat (BL-PGA-001), contextual
   `MlbParkContextPanel` color (BL-MLB-004), CFB SOS visual re-expression,
   MLB hot/cold semantics, Fantasy PAR gradients, and specialized Fantasy
   sticky/frozen layouts.

Completed cleanup no longer carried as future work: DM Sans typography,
tokenized SiteHeader / reconciled CFB route, removed `App.css`, shared dense
table + sticky/frozen primitives, JKB Heat authority, sport migrations through
Fantasy Phase 8E, Phase 9 audit, and the NFL 320px overflow fix.

## Validation checklist (per code phase)

- Markdown links resolve; every code/helper path named in the docs exists.
- Heat thresholds in code still match TABLE_CONVENTIONS.md section D.
- Only intended files changed; `git diff --check` clean.
- Consistency re-check against `AGENTS.md` and `docs/DECISIONS.md`.
- Playwright checks at ~320 / 768 / 1024 / 1440 via the analytics-safe setup.
- Do not commit without explicit authorization.
