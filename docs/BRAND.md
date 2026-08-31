# JoeKnowsBall visual brand

Concise visual-brand authority for JoeKnowsBall. This file describes *identity and
intent*. It is not implementation documentation — tokens, class vocabulary, layout
rules, and table rules live in [UI_FRAMEWORK.md](UI_FRAMEWORK.md) and
[TABLE_CONVENTIONS.md](TABLE_CONVENTIONS.md).

Authority level: this is brand documentation (authority tier 6 in
[DECISIONS.md](DECISIONS.md) KS-001). A current explicit instruction, an approved
active plan, or a recorded decision outranks it.

## Visual personality

JoeKnowsBall is a **professional sports-research product with an editorial
sensibility** — closer to a data-driven analysis desk than to a generic web
dashboard. The reader is here to compare numbers, read rankings, and judge
matchups quickly.

Guiding traits:

- **Analytical, not flashy.** The data is the design. Ornament that carries no
  information is noise.
- **Editorial hierarchy.** Every screen has an obvious first thing to read, a
  clear second, and demoted supporting context. Pages are composed, not tiled.
- **Compact but readable.** Information-dense layouts are a feature, not a
  compromise — but density never wins over legibility. Whitespace exists to
  separate hierarchy, not to fill the viewport.
- **Deliberate color.** The palette is small and every color means something.
  The product is not monochrome gray-on-white, and it is not a confetti of
  accent colors either.
- **Trustworthy restraint.** Muted, confident tones over saturated or neon
  ones. The analytical heat family (below) is the loudest the product gets, and
  it is loud only where a value earns it.

Explicitly **not** the JoeKnowsBall look:

- Generic AI-dashboard aesthetics: a grid of identical rounded cards, a large
  empty hero, one lonely accent color, evenly padded everything.
- Decorative gradients, glow, or motion with no analytical meaning.
- Oversized mobile typography and desktop layouts merely shrunk to fit.

Leading sports-reference, financial-data, and editorial-analytics products are
the aspirational quality bar: dense comparison tables that stay readable,
typographic hierarchy doing the work, color used as a signal. Reference the
*conventions*, never copy a specific site.

## Logo and name treatment

- Product name in prose and titles: **Joe Knows Ball** (three words). The
  compact identifier **JKB** is acceptable in tight UI, internal labels, and
  artifact names.
- Current header lockup: icon + wordmark, linking to `/`.
- Asset paths (committed):
  - Icon: `public/images/jkb-icon-trimmed.png`
  - Favicons: `public/favicon.ico`, `public/favicon-32x32.png`,
    `public/favicon-16x16.png`
- The wordmark is set in the UI body face at a bold weight; it is not a
  separate display treatment.

## Color identity

Two color systems exist and must stay conceptually separate (see
[DECISIONS.md](DECISIONS.md) KS-010).

### Brand palette

The stable identity colors. Used for chrome, navigation, structure, links,
and non-analytical emphasis.

| Role | Identity | Notes |
| --- | --- | --- |
| Primary — **JKB blue** | a deep, slightly desaturated blue | Brand accent, links, active navigation, primary actions. |
| Success green | a muted forest green | Positive status and confirmation — distinct in intent from analytical "favorable" green. |
| Neutral / slate | a cool gray-blue family from near-white surface to dark slate text | The supporting palette that carries most of every page. |
| Destructive red | a controlled red | Errors and destructive actions only — not analytical "unfavorable". |

The product should read as **blue-and-slate with green confirmation**, never as
a monochrome gray page with a single blue dot.

### Analytical heat family

A separate, meaning-bearing scale used only inside data cells to encode *how
favorable* a value is relative to its comparison population:

- **Gold** — elite / rare / best-on-the-board.
- **Green** (deep → soft) — favorable, saturation proportional to strength.
- **Neutral slate** — genuinely middle of the pack (a real signal, not "no
  data").
- **Red** (soft → strong) — unfavorable, saturation proportional to weakness.

Heat colors are *not* brand colors. They are not used for chrome, buttons,
links, borders, or decoration. The full band definitions, thresholds, and
direction rules are in [TABLE_CONVENTIONS.md](TABLE_CONVENTIONS.md).

Sanctioned exception: MLB "hot / cold" views may use a red-hot / blue-cold
palette **only** when explicitly labeled as hot/cold rather than
favorable/unfavorable.

## Typography identity

- **Primary UI / body face: DM Sans.** DM Sans is already loaded by the app and
  is the recommended primary face for all body text, labels, table content, and
  navigation. (Current code declares an `Inter` body stack that is never loaded
  and silently falls back to `system-ui` — see
  [UI_FRAMEWORK.md](UI_FRAMEWORK.md) "Typography status". The target is DM Sans;
  code is not changed in the documentation pass.)
- **Editorial / display accent: Playfair Display.** Retained as an *intentional*
  serif display accent for specialized editorial contexts — currently the PGA
  surfaces (`.pga-*` classes). It is a scoped section identity, not a
  site-wide heading face, and should not be introduced elsewhere without a
  deliberate editorial reason.
- Headings are weight-and-tracking driven (semibold, slight negative letter
  spacing), not size-only. Numeric content uses tabular figures.

## Hierarchy-first principle

Design decisions are resolved by asking "does this clarify what matters
first?" before "does this look nice?". Scale contrast, spacing rhythm, weight,
and the analytical heat scale are the tools. A screen that is pretty but has no
obvious reading order has failed the brand.
