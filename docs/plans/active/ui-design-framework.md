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

### Phase 2 — Typography cleanup

- Resolve the Inter-declared-but-not-loaded gap: set the body face to **DM Sans**
  (already loaded) per BRAND.md, or load the intended face explicitly.
- Confirm Playfair Display stays scoped to PGA `.pga-*`.
- Scope: `src/index.css` font stack + the Google Fonts import line. No layout
  changes.

### Phase 3 — Tokenize `SiteHeader` and shared chrome

- Replace hard-coded hex in `src/components/layout/SiteHeader.tsx`
  (`#eeeeee`, `#333333`, `#111111`, `#f0f0f0`, `#1a1a1a`, `bg-white`) with token
  utilities (`border`, `foreground`, `muted`, `card`, …).
- Reconcile the `/college-football` (header) vs `/ncaa` (`SiteFooter`) route
  label divergence for the CFB section.
- Visual output must be unchanged or a deliberate, reviewed adjustment.

### Phase 4 — Remove obsolete Vite `App.css` scaffold

- `src/App.css` is unmodified Vite starter CSS (`#root { max-width:1280px;
  margin:0 auto; text-align:center }`, spinning-logo keyframes, `.read-the-docs`).
- Verify nothing depends on it, then remove the file and its import.

### Phase 5 — Shared dense-table primitive

- Promote `NflTableScroller` + `NFL_TABLE_HEAD_ROW` / `NFL_TABLE_ROW` from
  `src/components/nfl/ui/NflTable.tsx` into a sport-neutral shared module,
  preserving behavior (contained overflow, `role="region"`, `aria-label`,
  `tabIndex`, focus ring).
- Re-point NFL usages; leave other sports for Phase 8.

### Phase 6 — Shared sticky-header / frozen-column helper

- Extract one helper for in-table sticky header + frozen first column, encoding
  the TABLE_CONVENTIONS.md z-index ladder.
- Replace per-table re-implementations opportunistically during Phase 8.

### Phase 7 — Heat-scale consolidation

- Keep `src/lib/mlb/percentileColorScale.ts` and `WeeklyHeatTone`
  (`src/lib/fantasy/weekly/researchPresentation.ts`) as the two source-of-truth
  modules.
- Migrate onto them: `src/lib/pga/pgaHeatColors.ts`,
  `src/lib/pga/rankColors.ts` (retain `getPercentileFromRank`),
  `src/lib/cfb/sosPresentation.ts`,
  `src/pages/MLBPercentileDemo.tsx` (use `PercentileCell`), and align
  `src/lib/fantasy/rankingPresentation.ts` band language.
- Thresholds and direction rules stay exactly as documented (98/95/80/60/40/25/10
  favorable-percentile cutoffs; explicit direction; documented denominator
  rule).
- Sanctioned exceptions untouched: `MlbStatTone` hot/cold,
  `parPresentation.ts` continuous gradients.

### Phase 8 — Per-sport migration order

Apply Phases 5–7 primitives per sport, mechanically, in this order:

1. **NFL** (reference implementation — least work)
2. **CFB**
3. **PGA** (keep `.pga-*` editorial identity; only heat cells + table shell
   consolidate)
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
| `Inter` declared in body stack but never loaded | `src/index.css` | 2 |
| Hard-coded hex values | `src/components/layout/SiteHeader.tsx` | 3 |
| Header `/college-football` vs footer `/ncaa` route label | `SiteHeader.tsx` / `SiteFooter.tsx` | 3 |
| Dead Vite starter CSS | `src/App.css` | 4 |
| Roomy shadcn `ui/table` vs hand-rolled dense tables | `src/components/ui/table.tsx` + per-sport tables | 5, 8 |
| Duplicated sticky/frozen logic | multiple table components | 6, 8 |
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
