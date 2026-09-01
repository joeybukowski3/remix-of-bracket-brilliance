# JoeKnowsBall UI framework

Primary UI and layout authority. Read [BRAND.md](BRAND.md) for visual identity
and intent; read [TABLE_CONVENTIONS.md](TABLE_CONVENTIONS.md) for data tables and
the analytical heat scale.

Authority level: project / architecture / brand documentation (tier 6 in
[DECISIONS.md](DECISIONS.md) KS-001). Where this file and current implementation
disagree, apply KS-003 — investigate and report, do not silently pick one.

This document describes the implemented framework backed by the completed UI /
Design Framework Audit and the sport migrations through Phase 9C. It is the
ongoing current authority for JoeKnowsBall UI work; the completed rollout record
lives at
[plans/completed/ui-design-framework.md](plans/completed/ui-design-framework.md)
for historical context only.

---

## A. Page-density principles

JoeKnowsBall pages are information-dense sports analytics, not marketing pages.

- Reduce blank and wasted space. A screen of mostly padding is a bug.
- Compact but readable — density never overrides legibility or touch usability.
- Avoid oversized cards and large vertical padding stacks. Prefer tighter
  section rhythm.
- Whitespace **separates hierarchy**; it does not create emptiness. If a gap is
  not dividing two distinct things, it is probably too large.
- Above the fold on a content page should already show real information (a
  ranking, a matchup, a table), not just a title and a call to action.

Shared building blocks (in `src/index.css`, `@layer components`):

- `.site-container` — centered page column, `max-w-[1440px]`, responsive
  horizontal padding.
- `.site-stack` — vertical section rhythm (`space-y-6 md:space-y-8`).
- `.page-title`, `.page-copy`, `.eyebrow-label` — the standard title / intro /
  kicker set.

---

## B. Hierarchy

Every page resolves to this order of emphasis:

1. **Page title + one-line summary** — what this page is and what the reader is
   looking at.
2. **Primary content** — the ranking, table, matchup, or model output the page
   exists for. Visually dominant.
3. **Secondary context** — filters, supporting splits, comparisons, related
   links.
4. **Methodology / help / provenance** — lowest emphasis, and collapsible
   (accordion, disclosure, or a dedicated panel) when longer than a short
   paragraph.

Within a data view:

- **Labels are smaller than the values they describe.** A metric name is
  supporting text; its number is the content.
- Primary metrics are larger, heavier, or heat-colored; derived and contextual
  metrics are quieter.
- Group related sections with headings, tonal background, or a hairline border —
  not with a large gap alone.

Existing helpers: `.eyebrow-label` (kicker), `.surface-card` /
`.surface-card-muted` (grouping surfaces), `MethodologyPanel`-style collapsibles
already used on Fantasy and PGA surfaces.

---

## C. Responsive typography

Practical scale. Values are intent, not literal class names; prefer `clamp()` or
a small set of responsive utilities over per-breakpoint overrides.

| Role | Mobile (~320–480) | Tablet (~768) | Desktop (≥1024) |
| --- | --- | --- | --- |
| Page title | ~1.6–1.8rem | ~2rem | ~2.25–2.5rem |
| Section heading | ~1.15rem | ~1.25rem | ~1.35rem |
| Body / copy | ~0.9–1rem | ~1rem | ~1rem |
| Table body | ~0.7rem (≈`text-[11px]`) | ~0.7rem | ~0.75rem |
| Table header | ~0.62rem (≈`text-[10px]`, uppercase, tracked) | same | same |
| Label / eyebrow | ~0.68rem, uppercase, letter-spaced | same | same |

Rules:

- **No giant mobile headings.** A page title that eats a third of a phone
  viewport is wrong. Cap mobile display sizes aggressively.
- Headings are semibold with slight negative tracking (`.page-title` already
  applies `tracking-[-0.04em]`); do not solve hierarchy with size alone.
- Numeric columns use `tabular-nums`.
- `.page-title` and `.page-copy` are the canonical responsive title/intro
  utilities; extend that pattern rather than inventing per-page scales.

---

## D. Surfaces and cards

Cards are a grouping tool, not the default container.

**Use a card when:**

- A block is a genuinely distinct, self-contained unit (a single matchup, one
  player's detail, a callout).
- Content needs visual separation from a busy surrounding layout.
- The block is independently scrollable or interactive.

**Do not:**

- Wrap every section of a page in its own card. A page that is a vertical stack
  of identical rounded cards reads as an AI dashboard.
- Use a card where a heading + hairline border, a tonal background band, or
  plain typographic separation would group the content just as clearly.
- Give every card the same radius, shadow, and padding regardless of importance.

**Standard intent:**

- Radius: a small, consistent scale. `--radius` (`0.5rem`) and its `sm/md/lg`
  derivations are the base; large decorative radii (`.surface-card` currently
  `rounded-[30px]`) are a known inconsistency to reconcile in the plan, not a
  pattern to copy.
- Shadow: soft and low. Elevation signals "this floats above the page", not
  "this is important" — use hierarchy for importance.
- Prefer `.surface-card` / `.surface-card-muted` over ad hoc card styling so
  surfaces stay consistent.

---

## E. Navigation

- **`SiteHeader` (`src/components/layout/SiteHeader.tsx`) is the global
  navigation authority.** Its `navItems` array is the single source of truth for
  top-level destinations. `SiteShell` (`src/components/layout/SiteShell.tsx`)
  composes header + content + `SiteFooter`.
- Desktop horizontal nav appears at the `lg` breakpoint; below `lg` a hamburger
  toggles a dropdown panel.
- The mobile menu **auto-closes on route change** (effect on
  `location.pathname`). Preserve this.
- Active state is a pill on the current section; `isActive()` holds the
  per-section matching rules (legacy slugs, Fantasy vs NFL separation, CFB
  prefix). Update that function, not scattered checks.
- Home / section navigation must always be one obvious click away. The logo
  links to `/`.
- **Sport-specific secondary navigation** (e.g. `NflSectionSidebar`, MLB matchup
  tab rows, PGA hub links) is layered *below* the global header and owned by
  that sport's components. Keep it visually subordinate to `SiteHeader`.
- **Sticky context navigation only when it materially helps** — i.e. when a user
  scrolling a long comparison would otherwise lose track of which teams/players
  they are looking at. `SiteHeader` is sticky (`z-[100]`); the CFB mobile
  context strip (`CollegeFootballMobileStickyHeader`, `z-40`) is the reference
  pattern. See TABLE_CONVENTIONS.md for the z-index ladder.
- `SiteHeader` and `SiteFooter` both route the CFB section through
  `/college-football`; header chrome uses the shared semantic tokens.

---

## F. Mobile behavior

Mobile is a **content reprioritization**, not a scaled-down desktop.

- Lead with the primary content; push filters, methodology, and secondary
  splits into collapsibles, accordions, or tabs.
- Long supporting content becomes an accordion or tab set rather than an endless
  scroll.
- Reduce avoidable vertical scrolling: tighten section spacing, collapse what is
  not essential, avoid stacking full-width cards with large padding.
- Mobile sticky headers only where scrolling would otherwise lose essential
  context (which side is home/away, which player). Otherwise let it scroll.
- Touch targets stay comfortably tappable (≈44px effective) even in dense
  layouts. The hamburger button and nav links already meet this; keep new
  controls consistent.
- **Never let the page scroll horizontally.** Horizontal overflow is contained
  to the element that needs it (see TABLE_CONVENTIONS.md). The shared
  `DenseTableScroller` contract has been browser-verified across the NFL, CFB,
  PGA, MLB, and Fantasy migrations, including 320px viewports.
- Existing helpers: `src/hooks/use-mobile.tsx`, `src/hooks/useIsCompactLayout.ts`
  for layout-mode decisions; `@tailwindcss/container-queries` for
  width-sensitive components (the MLB matchup grid is the worked example, in
  `src/index.css`).
- Tables have their own mobile rules in
  [TABLE_CONVENTIONS.md](TABLE_CONVENTIONS.md).
- Dense-table stickiness uses the shared `stickyDenseHeader()` and
  `frozenDenseColumn()` helpers and their `TABLE_LAYER` z-index ladder; new
  tables do not recreate those layer values locally.

---

## G. Tokens

Design tokens are CSS custom properties on `:root` in `src/index.css`, mapped to
utilities in `tailwind.config.ts`. **Use the token utilities, not hard-coded hex
values.**

| Token | Utility examples | Use for |
| --- | --- | --- |
| `--background` / `--foreground` | `bg-background`, `text-foreground` | Page ground and default text |
| `--card` / `--card-foreground` | `bg-card`, `text-card-foreground` | Card surfaces |
| `--primary` / `--primary-foreground` | `bg-primary`, `text-primary` | JKB blue: links, active nav, primary actions |
| `--secondary` / `--muted` / `--accent` (+ `-foreground`) | `bg-muted`, `text-muted-foreground` | Supporting surfaces and quiet text |
| `--border` / `--input` / `--ring` | `border-border`, `ring-ring` | Hairlines, field borders, focus rings |
| `--success` (+ `-foreground`) | `text-success`, `bg-success` | Positive status / confirmation |
| `--destructive` (+ `-foreground`) | `text-destructive` | Errors, destructive actions |
| `--highlight` | `bg-highlight` (via config) | Secondary emphasis accent |
| `--chart-positive` / `--chart-negative` | chart series | Chart up/down |
| `--sidebar-*` | `bg-sidebar`, … | Sidebar chrome |
| `--radius` | `rounded-sm/md/lg` | Corner radius scale |

Rules:

- New components reference tokens for neutral chrome and surfaces. Raw color
  values remain only where a centralized analytical scale, team/position
  identity, or scoped section identity requires an exact palette.
- `SiteHeader.tsx` uses `border`, `card`, `muted`, and foreground token
  utilities; its former hard-coded neutral palette has been removed.
- The obsolete Vite `src/App.css` scaffold has been removed; global framework
  styles live in `src/index.css`.
- Breakpoints: standard Tailwind plus custom `3xl` (1600px) and `4xl` (1800px)
  for ultrawide dashboard expansion; container `2xl` is 1400px.

---

## H. Typography status

- `src/index.css` loads and applies **DM Sans** as the global UI/body face, with
  system fonts only as runtime fallbacks. Inter is not loaded or declared.
- Playfair Display remains a scoped editorial accent on PGA
  `.pga-section-title` / `.pga-hero-title` surfaces; it is not a global heading
  face.

---

## I. Dark mode

- **Current state: incomplete / vestigial.** `tailwind.config.ts` sets
  `darkMode: ["class"]` and a full `--sidebar-*` token vocabulary exists, but
  `src/index.css` has **no `:root`-level `.dark {}` block**. The only dark
  overrides are `.dark .pga-picks-page`. Roughly six component files use `dark:`
  variants. Dark mode does not function outside PGA.
- **Framework default: light-first.** New pages and components are designed and
  built for the light palette only.
- New UI is **not required** to implement dark mode until dark mode is
  explicitly reopened as a dedicated project (see [DECISIONS.md](DECISIONS.md)
  KS-012).
- The PGA-scoped dark treatment (`.dark .pga-picks-page` in `src/index.css`) may
  remain as a section-specific exception.

---

## J. Quality bar

A new surface should be able to answer "yes" to: *does this look like a
deliberate JoeKnowsBall analysis page, and would it be believable in a real
professional sports-data product screenshot?*

**Explicitly discouraged (treat as review blockers):**

- Excessive empty whitespace / padding that separates nothing.
- Repetitive grids of equal-size rounded cards.
- Monochrome gray-on-white pages carried by a single accent dot.
- Random or inconsistent accent colors.
- Large hero sections with no information value.
- Decorative gradients, glow, or motion with no analytical meaning.
- Oversized mobile typography.
- Desktop layouts merely squeezed onto mobile with no reprioritization.
- Unnecessary horizontal page scrolling.
- Generic "AI-generated dashboard" composition — sidebar + KPI row + chart grid
  with no point of view.

**Expected instead:** clear scale contrast, intentional spacing rhythm, grouping
by heading/border/tone, typography with tabular numerics, and the analytical
heat scale used as a signal where a value earns emphasis.

Leading sports-reference, financial-data, and editorial-analytics products are
the aspirational standard for *how dense tables stay readable and how color
carries meaning* — reference the conventions, do not clone any site.
