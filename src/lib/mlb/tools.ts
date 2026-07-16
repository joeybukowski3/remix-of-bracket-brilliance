import type { SeoPage } from "@/lib/seo";

/**
 * Canonical MLB tool registry.
 *
 * WHY THIS FILE EXISTS (not an evolution of `sectionNav.ts`):
 * MLB tool metadata is currently duplicated across `sectionNav.ts`,
 * `MlbNavHero.tsx`, `MlbLayout.tsx`'s wide-content set, `SiteFooter.tsx`,
 * `SeoFooterBlock.tsx`, `lib/seo.ts`, and several inline "More MLB tools" /
 * sibling-link arrays. That duplication has already produced live
 * terminology drift ("K Props" still appears in `SiteFooter.tsx` today
 * even though the canonical label is "Strikeout Props"). This file defines
 * the canonical *product/presentation* metadata contract those consumers
 * migrate onto incrementally, one focused PR at a time. As of this PR, only
 * the shared `RelatedTools` component (`components/mlb/RelatedTools.tsx`)
 * reads from it, for exactly 3 pages (HR Props, Strikeout Props, Batter vs
 * Pitcher). `sectionNav.ts`, `MlbNavHero`, `SiteFooter`, `SeoFooterBlock`,
 * `lib/seo.ts`, and `MlbPropsHub` still carry their own independent copies
 * of this metadata and remain operationally unchanged until each is
 * migrated in its own dedicated PR.
 *
 * `sectionNav.ts` was deliberately left untouched rather than evolved into
 * this registry:
 *   1. Its `MlbNavItem.icon` is a live `ComponentType<LucideProps>` --
 *      exactly the data/rendering coupling a low-level registry should
 *      avoid. Changing that shape would either break `MlbSectionSidebar`'s
 *      `<Icon className=.../>` usage (a visible-UI change, forbidden here)
 *      or force two different icon representations to coexist there.
 *   2. `sectionNav.ts` intentionally mixes real standalone tool pages with
 *      non-tool items: in-page hash anchors on other tools ("Moneyline
 *      Edges", "Pitcher Regression", "Overdue Batters", "Biggest
 *      Mismatches") and hash-based active-matching logic
 *      (`activeHashPrefixes`). None of that belongs in a page-agnostic
 *      product registry, and forcing a one-to-one mapping would either drop
 *      real sidebar entries or pollute the tool registry with non-tools.
 *   3. `sectionNav.ts` has 11 passing tests and 2 live consumers
 *      (`MlbSectionSidebar`, `MlbMobileMenu` via `MlbLayout`). Leaving it
 *      byte-for-byte unchanged means zero risk to existing behavior while
 *      this registry is introduced additively.
 *
 * SOURCING METHODOLOGY (used for every tool below unless a per-tool note
 * says otherwise):
 * - `route`            -- the child `<Route path="...">` under `/mlb` in `App.tsx`.
 * - `shortName`         -- the exact label used for this tool in `sectionNav.ts`
 *                          (`MLB_NAV_SECTIONS`), which is also the approved
 *                          canonical public label list for this PR.
 * - `displayName`       -- the literal text of the page's own rendered `<h1>`
 *                          (directly, or via `ModelSummaryHeader`'s `title`
 *                          prop, which renders into an `<h1>`).
 * - `description`       -- the description string actually passed to the page's
 *                          live `usePageSeo(...)` call. Two pages
 *                          (`MlbHrProps`, `MlbBatterVsPitcher`) call
 *                          `usePageSeo` twice; the second call's effect runs
 *                          after the first and overwrites the same DOM meta
 *                          tags, so its description is what a user or
 *                          crawler actually sees -- that is what's used
 *                          here, not the (superseded) `lib/seo.ts` entry.
 * - `seoKey`            -- only set when `lib/seo.ts` reserves a `SeoPage`
 *                          entry for that exact route.
 * - `showInNav`         -- true for every tool below; all 8 appear somewhere
 *                          in `MLB_NAV_SECTIONS` today (either the "Main" or
 *                          "Models & Specials" section).
 * - `showInFooter`      -- true only for the 4 tools actually listed in
 *                          `SiteFooter.tsx`'s `SECTIONS[0].links` ("MLB")
 *                          today: Game Matchups, HR Props, Strikeout Props,
 *                          Batter vs Pitcher. Props Hub, Power Rankings, Sin
 *                          City, and Numerology are not in the footer
 *                          sitemap today.
 * - `wideContent`       -- true iff the route is a member of
 *                          `MLB_WIDE_CONTENT_PATHS` in `MlbLayout.tsx`.
 * - `indexable`         -- true for every tool below; no MLB page currently
 *                          passes `noindex: true` to `usePageSeo` (only
 *                          `/nfl`, `/nba`, `/ncaa` are noindexed today).
 * - `access` / `status` -- "public" / "live" for every tool below. No
 *                          premium-gating or coming-soon state exists for
 *                          any current public MLB tool; inventing one here
 *                          would not reflect production.
 * - `methodologyHref`   -- left undefined for every tool below. No MLB page
 *                          currently links to a dedicated methodology
 *                          route; each page's methodology lives inline
 *                          ("How to read this page" sections). This field
 *                          is reserved for a future dedicated surface.
 * - `relatedToolIds`    -- curated for exactly the 3 tools migrated onto the
 *                          shared `RelatedTools` component in this PR
 *                          (hr-props, strikeout-props, batter-vs-pitcher):
 *                          each relates to the other two, plus
 *                          game-matchups, props-hub, power-rankings, and
 *                          sin-city -- the approved "conventional MLB
 *                          analytics" ecosystem. `numerology` is
 *                          deliberately excluded from all three: it remains
 *                          a valid public MLB tool with its own navigation
 *                          entry, but it is a specialized product with a
 *                          different analytical premise and is not part of
 *                          the default related-tools recommendation. The
 *                          other 5 registry entries (game-matchups,
 *                          props-hub, power-rankings, sin-city, numerology)
 *                          remain `undefined` -- they are not migrated onto
 *                          `RelatedTools` in this PR, so inventing
 *                          relationships for them would be speculative.
 *
 * This registry intentionally excludes: scoring weights, thresholds,
 * rankings, model/API/workflow configuration, generated-data paths, odds
 * logic, filtering logic, and social-export configuration. It also
 * excludes X-export routes, debug-only wrappers (e.g. the `?workloadDebug=1`
 * panel on Strikeout Props), and the `/mlb` page's in-page hash sub-states
 * -- none of those are standalone public MLB tools.
 */

export type MlbToolId =
  | "game-matchups"
  | "hr-props"
  | "strikeout-props"
  | "batter-vs-pitcher"
  | "props-hub"
  | "power-rankings"
  | "sin-city"
  | "numerology";

export type MlbToolCategory = "core" | "props" | "rankings" | "specials";

export type MlbToolAccess = "public" | "premium";

export type MlbToolStatus = "live" | "beta" | "coming-soon";

/**
 * Typed icon identifiers rather than Lucide component references, so this
 * data module stays free of rendering concerns, stays trivially
 * serializable, and can't create a dependency from `lib/mlb` back toward
 * `lucide-react` render trees. Each id below corresponds 1:1 to the
 * `lucide-react` component `sectionNav.ts` already uses for that same tool
 * today (noted per id) -- this PR does not change any displayed icon.
 */
export type MlbToolIcon =
  | "calendar-days" // CalendarDays -- Game Matchups
  | "flame" // Flame -- HR Props
  | "radar" // Radar -- Strikeout Props
  | "swords" // Swords -- Batter vs Pitcher
  | "trending-up" // TrendingUp -- Props Hub
  | "bar-chart" // BarChart3 -- Power Rankings
  | "dice" // Dice5 -- Sin City
  | "sparkles"; // Sparkles -- Numerology

export interface MlbToolDefinition {
  id: MlbToolId;
  /** Full product name, sourced from the page's own rendered <h1>. */
  displayName: string;
  /** Canonical short label used in navigation and links. */
  shortName: string;
  route: string;
  /** Concise description, sourced from the page's live SEO description. */
  description: string;
  icon: MlbToolIcon;
  category: MlbToolCategory;
  access: MlbToolAccess;
  status: MlbToolStatus;
  indexable: boolean;
  showInNav: boolean;
  showInFooter: boolean;
  wideContent: boolean;
  /**
   * Curated related-tool ids, when curation has happened. `undefined`
   * means "relationships not yet curated" -- it is not shorthand for "no
   * relationships" or "related to everything." Curated so far only for the
   * 3 tools migrated onto the shared `RelatedTools` component in this PR
   * (hr-props, strikeout-props, batter-vs-pitcher); the other 5 registry
   * entries remain `undefined` pending their own migration. Use
   * `getRelatedMlbTools` rather than reading this field directly -- it
   * normalizes the undefined case to an empty, frozen array.
   */
  relatedToolIds?: readonly MlbToolId[];
  seoKey?: SeoPage;
  methodologyHref?: string;
}

// Order here is the registry's canonical order: `sectionNav.ts`'s "Main"
// section (Game Matchups, HR Props, Strikeout Props, Batter vs Pitcher,
// Props Hub, Power Rankings), followed by the standalone-tool subset of its
// "Models & Specials" section (Sin City, Numerology) -- the sub-anchor and
// utility items in that second section (Moneyline Edges, Pitcher
// Regression, Overdue Batters, Biggest Mismatches) are not standalone
// tools and have no registry entry.
//
// relatedToolIds is set only on hr-props, strikeout-props, and
// batter-vs-pitcher (the 3 tools migrated onto RelatedTools in this PR);
// it's intentionally omitted from the other 5 entries below (see the
// field's JSDoc on MlbToolDefinition) -- their curation is still deferred.
const MLB_TOOL_DEFINITIONS: readonly MlbToolDefinition[] = [
  {
    id: "game-matchups",
    // The /mlb index route's own <h1> (MlbGameDetail.tsx) -- it composites
    // several sectionNav destinations (Game Matchups, Moneyline Edges,
    // Pitcher Regression all live as hash anchors on this one route), so
    // its display name is broader than the "Game Matchups" nav label.
    displayName: "MLB Analytics Hub",
    shortName: "Game Matchups",
    route: "/mlb",
    description:
      "Daily MLB props, batter-vs-pitcher analysis, strikeout projections, home run models, and betting research from Joe Knows Ball.",
    icon: "calendar-days",
    category: "core",
    access: "public",
    status: "live",
    indexable: true,
    showInNav: true,
    showInFooter: true,
    wideContent: true,
    seoKey: "mlb",
  },
  {
    id: "hr-props",
    displayName: "MLB HR Prop Dashboard",
    shortName: "HR Props",
    route: "/mlb/hr-props",
    // Live-rendered description: MlbHrProps.tsx calls usePageSeo twice: once
    // with getSeoMeta("mlb-hr-props"), then again with this literal object.
    // The second call's effect runs later and overwrites the same DOM meta
    // tags, so this is what's actually shown -- not the lib/seo.ts entry.
    description:
      "Daily MLB home run prop rankings built from barrel rate, exit velocity, park factors, and pitcher HR vulnerability. Free HR prop model with Statcast power metrics updated every day.",
    icon: "flame",
    category: "props",
    access: "public",
    status: "live",
    indexable: true,
    showInNav: true,
    showInFooter: true,
    wideContent: true,
    relatedToolIds: [
      "game-matchups",
      "strikeout-props",
      "batter-vs-pitcher",
      "props-hub",
      "power-rankings",
      "sin-city",
    ],
    seoKey: "mlb-hr-props",
  },
  {
    id: "strikeout-props",
    displayName: "MLB Strikeout Prop Model",
    shortName: "Strikeout Props",
    route: "/mlb/strikeout-props",
    // MlbStrikeoutProps.tsx calls usePageSeo exactly once, directly with
    // getSeoMeta("mlb-strikeout-props") -- no override, so this is both the
    // registered seoKey's description and the live one.
    description:
      "Free MLB strikeout prop model ranking pitchers by K rate, whiff rate, K/9, and opponent strikeout tendency. Daily K prop picks with sportsbook odds and avg IP.",
    icon: "radar",
    category: "props",
    access: "public",
    status: "live",
    indexable: true,
    showInNav: true,
    showInFooter: true,
    wideContent: false,
    relatedToolIds: [
      "game-matchups",
      "hr-props",
      "batter-vs-pitcher",
      "props-hub",
      "power-rankings",
      "sin-city",
    ],
    seoKey: "mlb-strikeout-props",
  },
  {
    id: "batter-vs-pitcher",
    displayName: "MLB Batter vs Pitcher Model",
    shortName: "Batter vs Pitcher",
    route: "/mlb/batter-vs-pitcher",
    // Live-rendered description: MlbBatterVsPitcher.tsx also calls
    // usePageSeo twice (getSeoMeta("mlb-batter-vs-pitcher"), then this
    // literal object). Same last-write-wins situation as HR Props above.
    description:
      "Daily MLB batter vs pitcher matchup rankings using current-season contact quality, hard hit rate, barrel rate, and pitcher vulnerability. Free matchup model updated every day.",
    icon: "swords",
    category: "props",
    access: "public",
    status: "live",
    indexable: true,
    showInNav: true,
    showInFooter: true,
    wideContent: false,
    relatedToolIds: [
      "game-matchups",
      "hr-props",
      "strikeout-props",
      "props-hub",
      "power-rankings",
      "sin-city",
    ],
    seoKey: "mlb-batter-vs-pitcher",
  },
  {
    id: "props-hub",
    displayName: "Today's MLB Props",
    shortName: "Props Hub",
    route: "/mlb/props",
    // MlbPropsHub.tsx calls usePageSeo once with an inline literal, not
    // getSeoMeta("mlb-props-hub") -- lib/seo.ts reserves that key but the
    // page never actually uses it. seoKey is still set below since the key
    // is the intended integration point; wiring the page up to it is a
    // future migration PR, not a claim that it happens today.
    description:
      "MLB props today with home run props, pitcher strikeout props, batter props, and batter vs pitcher matchup context from the Joe Knows Ball prop betting model.",
    icon: "trending-up",
    category: "props",
    access: "public",
    status: "live",
    indexable: true,
    showInNav: true,
    showInFooter: false,
    wideContent: true,
    seoKey: "mlb-props-hub",
  },
  {
    id: "power-rankings",
    displayName: "MLB Power Rankings",
    shortName: "Power Rankings",
    route: "/mlb/power-rankings",
    description:
      "Transparent MLB team power rankings using xERA, xFIP, xBA, OPS, wRC+, run differential, and schedule-adjusted performance.",
    icon: "bar-chart",
    category: "rankings",
    access: "public",
    status: "live",
    indexable: true,
    showInNav: true,
    showInFooter: false,
    wideContent: false,
    // lib/seo.ts has no reserved SeoPage entry for this route today.
  },
  {
    id: "sin-city",
    // The page's own <h1> is the bare, stylized "Sin City" (its "Separate
    // HR Model" eyebrow supplies the MLB/HR context above the heading) --
    // used as-is rather than substituting the longer <title> tag text.
    displayName: "Sin City",
    shortName: "Sin City",
    route: "/mlb/sin-city",
    description:
      "A separate MLB home-run candidate model using four batter-power thresholds plus favorable wind.",
    icon: "dice",
    category: "specials",
    access: "public",
    status: "live",
    indexable: true,
    showInNav: true,
    showInFooter: false,
    wideContent: false,
    // lib/seo.ts has no reserved SeoPage entry for this route today.
  },
  {
    id: "numerology",
    displayName: "MLB Numerology",
    shortName: "Numerology",
    route: "/mlb/numerology",
    description: "Daily numerical alignment across today's MLB slate.",
    icon: "sparkles",
    category: "specials",
    access: "public",
    status: "live",
    indexable: true,
    showInNav: true,
    showInFooter: false,
    wideContent: true,
    // lib/seo.ts has no reserved SeoPage entry for this route today.
  },
];

function buildMlbToolRegistry(): readonly MlbToolDefinition[] {
  return Object.freeze(MLB_TOOL_DEFINITIONS.map((tool) => Object.freeze({ ...tool })));
}

/** Canonical, immutable MLB tool registry in canonical display order. */
export const MLB_TOOLS: readonly MlbToolDefinition[] = buildMlbToolRegistry();

const MLB_TOOLS_BY_ID: ReadonlyMap<MlbToolId, MlbToolDefinition> = new Map(
  MLB_TOOLS.map((tool) => [tool.id, tool]),
);

const MLB_TOOLS_BY_ROUTE: ReadonlyMap<string, MlbToolDefinition> = new Map(
  MLB_TOOLS.map((tool) => [tool.route, tool]),
);

/**
 * Looks up a tool by its typed id. `MlbToolId` is an exhaustive union and
 * every member has exactly one registry entry (enforced by tests), so this
 * should never actually throw for a valid id -- the guard exists only to
 * fail loudly, instead of silently returning the wrong tool, if a future
 * edit ever removes an entry without also removing it from the union.
 */
export function getMlbTool(id: MlbToolId): MlbToolDefinition {
  const tool = MLB_TOOLS_BY_ID.get(id);
  if (!tool) {
    throw new Error(`No MLB tool registered for id "${id}".`);
  }
  return tool;
}

/**
 * Looks up a tool by its exact route. Returns `undefined` for any route
 * that isn't a registered public tool (including hash fragments, X-export
 * routes, and other non-tool MLB paths) rather than throwing or falling
 * back to an unrelated tool.
 */
export function getMlbToolByRoute(route: string): MlbToolDefinition | undefined {
  return MLB_TOOLS_BY_ROUTE.get(route);
}

/** Shared, frozen empty result for tools with no curated relationships yet. */
const EMPTY_RELATED_TOOLS: readonly MlbToolDefinition[] = Object.freeze([]);

/**
 * Returns the full tool definitions for a tool's curated related-tool ids.
 * Safely resolves an `undefined` `relatedToolIds` (relationships not yet
 * curated -- true for every tool today) to an empty, frozen array rather
 * than throwing or fabricating relationships. The returned array is always
 * frozen, so callers cannot mutate it into registry state.
 */
export function getRelatedMlbTools(id: MlbToolId): readonly MlbToolDefinition[] {
  const relatedIds = getMlbTool(id).relatedToolIds;
  if (!relatedIds || relatedIds.length === 0) {
    return EMPTY_RELATED_TOOLS;
  }
  return Object.freeze(relatedIds.map((relatedId) => getMlbTool(relatedId)));
}

/** Returns every tool that should appear in MLB navigation surfaces, in canonical order. */
export function getVisibleMlbTools(): readonly MlbToolDefinition[] {
  return MLB_TOOLS.filter((tool) => tool.showInNav);
}
