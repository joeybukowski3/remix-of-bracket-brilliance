---
name: "Joe Knows Ball"
description: "A credible, compact sports-research workspace built for fast comparison across dense data."
colors:
  research-blue: "hsl(214 50% 43%)"
  background: "hsl(210 33% 98%)"
  surface: "hsl(0 0% 100%)"
  ink: "hsl(215 25% 22%)"
  muted-ink: "hsl(215 14% 46%)"
  line: "hsl(214 24% 90%)"
  positive: "hsl(154 45% 39%)"
  negative: "hsl(0 66% 52%)"
  highlight-blue: "hsl(214 76% 62%)"
  scoreboard-navy: "#031635"
  jkb-coral: "#ef6655"
  course-green: "#1a3a2a"
  warm-signal: "#f4a261"
typography:
  display:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "clamp(1.875rem, 4vw, 3rem)"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0.14em"
  data:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.25
  pga-display:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "clamp(2.6rem, 6vw, 4.9rem)"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.02em"
rounded:
  control-sm: "4px"
  control: "6px"
  base: "8px"
  panel: "12px"
  soft: "20px"
  section: "24px"
  feature: "30px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.research-blue}"
    textColor: "hsl(210 40% 98%)"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "40px"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "40px"
  card-standard:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.base}"
    padding: "16px"
  card-soft:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.section}"
    padding: "20px"
  input-standard:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "40px"
  chip-selected:
    backgroundColor: "{colors.scoreboard-navy}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.control-sm}"
    padding: "4px 10px"
---

# Design System: Joe Knows Ball

## Overview

**Creative North Star: "The Independent Scouting Desk"**

Joe Knows Ball is an evidence-first sports research workspace: credible, compact, calm, and analytical. Its strongest incumbent pattern resembles a serious scouting desk assembled from clean paper-like surfaces, dark scoreboard anchors, compact labels, and data views designed for comparison rather than spectacle. The interface should feel premium through precision, hierarchy, and legibility—not through casino gloss, generic SaaS decoration, or excessive visual effects.

The system is one shared analytical chassis with controlled sport accents and specialized data views. Global navigation, neutral surfaces, typography, interaction states, and semantic data colors provide continuity. Each sport may then introduce a restrained local dialect when the subject matter warrants it: MLB uses cool navy and pale-blue research panels, PGA adds course green and an editorial serif, and tournament experiences may use a dedicated accent. These dialects must remain subordinate to the shared information architecture.

**Status language used in this document:**

- **Established** means repeated across shared tokens, layouts, or multiple public surfaces and should generally be preserved.
- **Competing** means two or more live approaches currently solve the same problem; future work should choose deliberately rather than treating all variants as canon.
- **Incidental** means legacy residue, a private/internal treatment, a one-page visual experiment, or an implementation detail that should not become a permanent rule.

**Key Characteristics:**

- Light slate workspaces with white analytical surfaces and dark navy anchors.
- Compact hierarchy, tabular numerals, and semantic color used to speed comparison.
- Borders provide structure; soft shadows reserve emphasis.
- Shared chrome with sport-aware navigation and data views.
- Mobile behavior preserves meaning, not necessarily desktop geometry.

## Colors

The established palette is a cool neutral research field led by Research Blue and Scoreboard Navy, with semantic green/red signals and controlled sport accents.

### Primary

- **Research Blue** (`research-blue`): the global action, focus, link, slider, and selected-state accent. It should remain recognizable but not flood dense screens.
- **Scoreboard Navy** (`scoreboard-navy`): high-authority anchors such as sport headers, table heads, model callouts, and dark promotional bands.
- **JKB Coral** (`jkb-coral`): the identity color carried by the Joe Knows Ball logo. Preserve it as a brand signature; do not automatically convert every action or metric to coral.

### Secondary

- **Course Green** (`course-green`): the established PGA-specific anchor for golf identity, top-rank emphasis, and course-model context.
- **Warm Signal** (`warm-signal`): a supporting caution/value accent used in PGA and selected analytical states.
- **Highlight Blue** (`highlight-blue`): the brighter end of blue gradients, progress marks, and selected analytical emphasis.

### Neutral

- **Research Background** (`background`): the page field behind analytical surfaces.
- **Paper Surface** (`surface`): cards, panels, tables, menus, and input fields.
- **Analyst Ink** (`ink`): primary text and dense-value copy.
- **Muted Annotation** (`muted-ink`): metadata, explanations, secondary labels, and unavailable values.
- **Hairline Divider** (`line`): table rules, card boundaries, navigation separators, and input strokes.

### Semantic

- **Positive Signal** (`positive`): favorable edges, improving trends, strong ranks, and successful states.
- **Negative Signal** (`negative`): unfavorable movement, errors, destructive actions, and weak outcomes.
- Amber/yellow remains the established caution family for provisional, warning, or mid-tier states; it is not a brand accent.

**The Evidence Color Rule.** Color must encode identity, state, or analytical meaning. Never add sportsbook-style gradients, neon odds glows, or competing accents merely to make a dense screen feel exciting.

**The Sport Accent Rule.** A sport-specific hue may lead its local module, but global chrome, core interaction states, and semantic positive/negative meanings remain stable.

**Competing patterns:** several pages hard-code close but non-identical navies (`#031635`, `#0f172a`, `#0f2748`, `#10243f`) and pale-blue backgrounds. Treat Scoreboard Navy plus the global HSL tokens as the intended family; do not multiply near-duplicate colors without a defined role. World Cup orange and the cyan 16-0 treatment are surface-specific dialects, not global tokens.

## Typography

**Display Font:** Inter with system UI fallbacks
**Body Font:** Inter with system UI fallbacks
**Label/Mono Font:** the system monospace stack for numeric model values
**PGA Editorial Display:** Playfair Display with Georgia fallback

**Character:** The dominant system is compact neo-grotesque typography with restrained negative tracking and weight-driven hierarchy. It reads like analysis software, not marketing copy. Monospace is reserved for figures where digit alignment or model precision matters. PGA's Playfair/DM Sans pairing is an established sport-specific editorial exception.

### Hierarchy

- **Display** (600, responsive 30–48px, 1.08 line-height): rare page or feature titles; never a substitute for basic data hierarchy.
- **Headline** (700, 20–24px, 1.2 line-height): page headers and major analytical results.
- **Title** (600–700, 14–18px): section, card, and table titles.
- **Body** (400–500, 13–16px, approximately 1.5–1.7 line-height): explanations, model context, and supporting copy; long prose stays near 65–75 characters per line.
- **Label** (600–700, 9–11px, 0.12–0.20em tracking, usually uppercase): eyebrows, table heads, metadata, and compact grouping labels.
- **Data** (600–900, 11–14px, tabular or monospace where needed): ranks, probabilities, scores, records, odds, and model metrics.

**The Hierarchy Before Size Rule.** Use grouping, weight, alignment, and muted text before adding more type sizes. Dense screens should rely on a small repeatable scale.

**The Numbers Stay Still Rule.** Comparative columns, ranks, percentages, and scores use tabular numerals; monospace is appropriate when precision matters, not as a decorative tech signal.

**Competing patterns:** `src/index.css` declares Inter but does not import it, while the home page forces a native system stack and PGA imports DM Sans and Playfair Display. Until font loading is consolidated, system sans is the reliable baseline and the PGA pairing is the only established alternate family. Extra-black weights and one-off oversized heroes are local emphasis, not global defaults.

## Layout

The established spatial model is a centered responsive workspace with 16px mobile gutters, 24px tablet gutters, and 32px desktop gutters. Shared public containers commonly cap between 1280px and 1440px; dense sport platforms expand deliberately to roughly 1680–1720px. Vertical rhythm is compact: 8–12px within controls and table rows, 16–24px within cards, and 20–32px between major sections.

Public pages use a sticky 72px global header. MLB and NFL establish desktop side navigation around 224–228px and collapse it into a full-width menu/sheet below the `xl` breakpoint. College Football uses a contained horizontal section header and wrapping sub-navigation. PGA dashboards may use a three-column research layout with left controls, main analysis, and a right context panel; the main analysis appears first on smaller screens.

Responsive behavior is task-specific:

- Comparison-heavy tables remain tables when cross-row scanning is essential; they live in labelled, keyboard-focusable horizontal scrollers.
- Some ranking tables become stacked mobile rows/cards when preserving the most important identity and summary metrics is more valuable than retaining every column.
- Secondary columns may hide at `sm` or `md`, while core rank, identity, and score remain visible.
- Dense MLB cards use container queries and `auto-fit` grids so the component responds to its actual width after side rails consume space.
- Desktop sidebars become mobile sheets or compact section menus; they do not squeeze beside content on narrow screens.
- Full desktop bracket or spatial diagrams may receive a purpose-built mobile representation rather than a scaled-down copy.

**The Comparison Test.** Preserve tables on mobile when users need to compare rows or columns; use stacked summaries when the task is item inspection. Never choose cards merely because the viewport is narrow.

**The One Outer Container Rule.** A platform layout owns its gutters and maximum width. Child pages must not add a second centered container that wastes analytical space.

**Competing patterns:** container ceilings range from 1280px to 1800px, and some routes own their shell while others use `site-container`. These differences are valid only when tied to data density. The 1440px shared container, 1680–1720px dense platform container, and 1280px reading/marketing container are the stable tiers; arbitrary new widths are not.

## Elevation & Depth

The confirmed philosophy is layered but restrained: borders establish structure; soft shadows reserve emphasis. Most analytical panels are white against a pale slate field with a 1px hairline border or ring. Small cards use a subtle shadow; larger feature surfaces use broader, low-opacity ambient shadows. Dark bands and tonal background shifts create more depth than dramatic elevation.

### Shadow Vocabulary

- **Hairline lift** (`0 1px 2px rgba(0,0,0,0.05)`): compact cards, fields, and selected tabs.
- **Analytical panel** (`0 2px 8px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04)`): structured MLB section cards.
- **Ambient surface** (`0 18px 40px hsl(var(--foreground) / 0.05)`): large soft cards and important panels on pale backgrounds.
- **Interactive lift** (`0 10px 26px rgba(0,0,0,0.12)`): hover feedback for prominent selectable cards, often paired with no more than a 2–4px rise.

**The Border First Rule.** At rest, use a tonal boundary or hairline before adding elevation. A shadow must clarify grouping, hierarchy, or interaction.

**The One Lift Rule.** Nested panels do not each receive a full shadow. Use tonal layering inside an elevated parent.

**Competing patterns:** the global soft-card language uses 24–30px radii and ambient shadows, while newer NFL/CFB primitives use flat 8px bordered panels. Both are live. Use compact bordered panels for dense operational surfaces and soft elevated cards for summaries, promotional modules, and touch-oriented mobile compositions; do not blend both treatments inside one component family.

## Shapes

The form language has two established densities. Compact operational controls and tables use 4–8px corners. Summary cards, mobile analytical cards, and feature surfaces use 12–30px corners. Pills are reserved for compact status, rank, odds, and filter states whose contents read as a single token.

Borders are generally cool gray hairlines. A colored top border or ring may identify a sport/module or top-ranked state. Team and league marks retain their native silhouettes; circular frames are used for rank numbers, logos, and concise score markers rather than as universal decoration.

**The Radius Has a Job Rule.** Use 4–8px for precise controls and tabular infrastructure, 12px for ordinary panels, and 20–30px for touch-oriented summaries or intentionally soft feature surfaces. Do not select a radius per page by taste alone.

**The Pill Is a Token Rule.** Pills carry short state, rank, odds, or filter labels. Paragraphs, multi-line actions, and ordinary navigation do not become pills.

**Competing patterns:** large 20–30px shells coexist with Shadcn's 4–8px defaults and newer NFL/CFB square-ish panels. This is a known system split, not permission to introduce more radii. Future extraction should converge each component family on one tier.

## Components

The component philosophy is **compact, confident, and evidence-first**. Controls should make state obvious, preserve keyboard focus, and spend visual emphasis in proportion to analytical importance.

### Buttons

- **Shape:** square-ish controls use 6–8px corners; compact local actions may use pills only when part of a filter or token-like control.
- **Primary:** Research Blue or Scoreboard Navy fill with high-contrast text; 40px is the standard general-purpose height.
- **Hover / Focus:** modest tonal darkening and a visible 2px focus ring; movement is reserved for feature cards, not ordinary buttons.
- **Secondary / Ghost:** white or transparent with a hairline border, dark ink, and a pale-slate hover.
- **Destructive:** semantic red, never repurposed as a promotional accent.

### Tabs and Segmented Controls

- Established controls use a pale neutral track with the active option on a white or dark filled surface.
- Labels remain short and usually 11–13px semibold.
- Tabs should expose state through fill, text, or a border—not color alone—and retain a visible focus ring.
- **Competing:** underline tabs, white-on-muted segmented controls, dark square filter chips, and rounded-full PGA toggles all exist. Choose the form by function: underline tabs for page-level views, segmented controls for mutually exclusive local modes, chips for filters.

### Badges, Pills, and Status

- Use 9–12px semibold text, concise wording, and semantic color.
- Positive green, negative red, warning amber, and neutral slate remain consistent across sports.
- Rank and score markers may increase weight to 700–900 and use tabular numerals.
- Sportsbook colors are isolated to clearly identified partner links and never establish application state.

### Cards / Data Panels

- **Compact panel:** white, 8–12px corners, hairline border, 12–16px padding, little or no shadow.
- **Soft analytical card:** white, 20–30px corners, 16–24px padding, faint ring or ambient shadow.
- **Muted inset:** pale slate fill, 8–14px corners, no independent elevation.
- Collapsible panels use a real button with `aria-expanded`, a clear title row, and a chevron; collapsed content remains discoverable and structurally labelled.

### Tables

- Header rows use pale slate or Scoreboard Navy, 9–11px uppercase labels, and restrained tracking.
- Body rows use 11–13px values, tabular numerals, hairline separators, and a subtle hover tone.
- Identity columns stay left-aligned; metrics align consistently, usually centered or right-aligned by type.
- Sticky identity columns are appropriate in wide PGA/MLB tables. Scroll regions must be labelled and keyboard focusable.
- Heatmaps and rank fills use controlled semantic ramps with readable foreground contrast. A number always remains visible; color is supporting evidence.

### Inputs / Fields

- White or pale-slate background, 6–12px corners, 1px cool-gray border, 40px standard height, 13–16px text.
- Focus shifts the border to Research Blue or sky blue and adds a visible ring.
- Search inputs may include a leading icon; selects and numeric model inputs remain compact and retain explicit labels, including visually hidden labels where appropriate.
- Error, warning, disabled, and unapplied states use text plus semantic styling, never color alone.

### Navigation

- The global header is sticky, white, 72px tall, and carries the JKB logo/name plus restrained text links.
- Desktop global navigation marks the active area with a quiet filled state. Mobile uses a menu button and a stacked panel.
- Sport navigation may be a desktop sidebar plus mobile sheet (MLB/NFL) or a contained wrapping tab row (College Football).
- Side navigation groups related tools under compact uppercase labels and keeps the active route visually persistent.

### Sports-Specific Patterns

- **MLB:** cool pale-blue workspace, Scoreboard Navy anchors, fixed desktop sidebar, responsive matchup grids, regression/edge pills, and dense explanatory glossaries. Current MLB pages contain both soft 20–30px dashboards and newer compact 12px cards; treat that as competing density, not two simultaneous styles.
- **PGA:** Course Green, warm value accents, optional Playfair Display headings, DM Sans body copy, rank heat cells, weight controls, sticky identity columns, and purpose-built mobile model cards. The editorial serif belongs to golf storytelling and tournament presentation, not all analytical tables.
- **NFL / Fantasy:** compact 8px bordered panels, neutral slate section headers, square filter chips, heatmap tables, and a shared left navigation. Fantasy may reuse these data primitives without inheriting NFL routing or section identity.
- **College Football:** shares the compact NFL-like analytical grammar, with a dark section masthead, wrapping local navigation, rating cells, and desktop-table/mobile-list transformations.
- **World Cup and 16-0:** currently operate as distinct campaign/experience surfaces with orange or cyan accents and bespoke dark heroes. Preserve their local identity when working inside those experiences, but do not promote their effects into the global analytical system.

## Do's and Don'ts

### Do:

- **Do** preserve the JKB logo, its coral signature, and the clear white global header.
- **Do** begin new analytical surfaces with the shared neutral tokens, compact type scale, and established semantic colors.
- **Do** use Scoreboard Navy for authority and Research Blue for interaction; keep their roles distinct.
- **Do** keep data dense when density improves comparison, using hierarchy, alignment, sticky columns, progressive disclosure, and explicit legends to maintain readability.
- **Do** choose the mobile transformation from the task: scroll a comparison table, stack an inspection list, collapse secondary panels, or build a dedicated spatial view.
- **Do** distinguish JKB models from source/market data through labels, grouping, provenance copy, and stable visual hierarchy.
- **Do** preserve keyboard focus, semantic landmarks, accessible names, and non-color status cues.
- **Do** let sport identity enter through controlled accents, logos, terminology, and specialized visualizations.

### Don't:

- **Don't** treat unused `src/App.css`, `.bak` files, internal review screens, export canvases, or one-off inline styles as design-system authority.
- **Don't** turn the product into a generic SaaS dashboard, AI-template composition, sportsbook, or casino interface.
- **Don't** invent additional near-black navies, pale-blue page fills, corner radii, or shadow recipes when an established tier already fits.
- **Don't** combine the 30px soft-card language and the 8px compact-panel language indiscriminately inside one surface.
- **Don't** use sport-team colors or sportsbook partner colors as persistent application state.
- **Don't** replace useful tables with cards on mobile when cross-row comparison is the user's job.
- **Don't** use decorative gradients, glow, glass, or motion unless a specific experience already owns that vocabulary and the effect clarifies hierarchy or interaction.
- **Don't** assume every current difference deserves preservation; classify it as established, competing, or incidental before extending it.
