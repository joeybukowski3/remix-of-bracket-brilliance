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

### Phase 1 — Documentation authority (this pass)

Create `docs/BRAND.md`, `docs/UI_FRAMEWORK.md`, `docs/TABLE_CONVENTIONS.md`,
this plan, and add the cross-cutting decisions to `docs/DECISIONS.md`. No code,
CSS, config, component, or test changes. **Complete when the five approved docs
are in place and internally consistent.**

### Phase 2 — Typography cleanup — **done**

- Resolve the Inter-declared-but-not-loaded gap: set the body face to **DM Sans**
  (already loaded) per BRAND.md, or load the intended face explicitly.
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

### Phase 7 — Heat-scale consolidation

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
- **Still to do:** `pgaHeatColors.ts` (4→8 band re-expression, visual),
  `pga/rankColors.ts` (retain `getPercentileFromRank`), `MLBPercentileDemo.tsx`
  (migrate to the shared `PercentileCell` in
  `src/components/mlb/MlbPercentileScoreCell.tsx`, or the shared JKB Heat API —
  no new component),
  `rankingPresentation.ts` band-language alignment. `MlbStatTone` hot/cold and
  `parPresentation.ts` gradients confirmed as sanctioned exceptions, untouched.

- Keep `src/lib/mlb/percentileColorScale.ts` and `WeeklyHeatTone`
  (`src/lib/fantasy/weekly/researchPresentation.ts`) as the two source-of-truth
  modules.
- Migrate onto them: `src/lib/pga/pgaHeatColors.ts`,
  `src/lib/pga/rankColors.ts` (retain `getPercentileFromRank`),
  `src/lib/cfb/sosPresentation.ts`,
  `src/pages/MLBPercentileDemo.tsx` (use the shared `PercentileCell` in
  `src/components/mlb/MlbPercentileScoreCell.tsx`, or the shared JKB Heat API),
  and align
  `src/lib/fantasy/rankingPresentation.ts` band language.
- Thresholds and direction rules stay exactly as documented (98/95/80/60/40/25/10
  favorable-percentile cutoffs; explicit direction; documented denominator
  rule).
- Sanctioned exceptions untouched: `MlbStatTone` hot/cold,
  `parPresentation.ts` continuous gradients.

### Phase 8 — Per-sport migration order

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
- **Deferred:** `NflDfsAnalyzerTable` (hand-rolled `sticky top-0 z-10` thead +
  bare `overflow-x-auto` on the `FANTASY_TABLE_SHELL` div) — its table shell is
  a shared Fantasy primitive, so a clean migration belongs with the Fantasy
  pass, not NFL. CFB/PGA/MLB/Fantasy per-sport work unstarted.
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
5. **Fantasy**, then any remaining surfaces (Bracket / World Cup / Home / SEO
   pages) as appropriate.

### Phase 9 — Responsive / mobile pattern rollout

- Apply UI_FRAMEWORK.md sections F and TABLE_CONVENTIONS.md section B to the
  migrated surfaces: column hide/deprioritize, expandable row detail,
  collapsible secondary content, no horizontal page scroll.
- Reuse `use-mobile`, `useIsCompactLayout`, and container queries; do not add new
  layout-mode mechanisms.

### Phase 10 — Visual-regression validation

- Representative screenshots / browser checks at **~320, 768, 1024, 1440** for
  each migrated surface, before and after.
- Use the repo's analytics-safe Playwright setup (KS-006 — no GA/GTM traffic).
- A phase is done when its diffs are either visually null or a reviewed,
  intentional improvement.

## Known cleanup targets (tracked)

| Target | Where | Phase |
| --- | --- | --- |
| ~~`Inter` declared in body stack but never loaded~~ (done: body now `DM Sans`) | `src/index.css` | 2 |
| ~~Hard-coded hex values~~ (done: `border`/`card`/`muted`/`foreground` tokens) | `src/components/layout/SiteHeader.tsx` | 3 |
| ~~Header `/college-football` vs footer `/ncaa` route~~ (done: footer now `/college-football`; label text "NCAA Football" left as-is) | `SiteHeader.tsx` / `SiteFooter.tsx` | 3 |
| ~~Dead Vite starter CSS~~ (done: file deleted, no import existed) | `src/App.css` | 4 |
| Roomy shadcn `ui/table` vs hand-rolled dense tables | `src/components/ui/table.tsx` + per-sport tables | 5 (shared primitive: `ui/dense-table.tsx` done), 8 |
| Duplicated sticky/frozen logic | multiple table components | 6 (shared helper done; `FantasyPointsAllowed` migrated), 8 |
| Duplicate percentile/heat implementations | `pga/pgaHeatColors.ts`, `pga/rankColors.ts`, `cfb/sosPresentation.ts`, `MLBPercentileDemo.tsx`, `fantasy/rankingPresentation.ts` | 7 |
| Percentile denominator convention undocumented at call sites | `percentileColorScale.ts` vs `teamPercentiles.ts` / `ppgPercentile.ts` | 7 (doc done in Phase 1; enforce in review) |
| Radius scale bypassed (`rounded-[30px]`, `[24px]`, `12px`, `20px`) | `src/index.css` + components | 3 / 8 (opportunistic) |
| Dark mode half-wired (`darkMode:["class"]`, no `:root` `.dark` block) | `tailwind.config.ts` / `src/index.css` | out of scope (KS-012) |

Explicitly **not** flattened: the PGA `.pga-*` system is an intentional
section-specific editorial identity and stays.

## Validation checklist (per code phase)

- Markdown links resolve; every code/helper path named in the docs exists.
- Heat thresholds in code still match TABLE_CONVENTIONS.md section D.
- Only intended files changed; `git diff --check` clean.
- Consistency re-check against `AGENTS.md` and `docs/DECISIONS.md`.
- Playwright checks at ~320 / 768 / 1024 / 1440 via the analytics-safe setup.
- Do not commit without explicit authorization.
