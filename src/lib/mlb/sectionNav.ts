import type { ComponentType } from "react";
import {
  BarChart3,
  CalendarDays,
  Flame,
  Radar,
  Rocket,
  Swords,
  TrendingUp,
  type LucideProps,
} from "lucide-react";

export type MlbNavItem = {
  /** Stable key, also used for the React list key. */
  id: string;
  label: string;
  /** May include a `#hash` (in-page anchor on the target route). */
  href: string;
  icon: ComponentType<LucideProps>;
  /**
   * Extra hash prefixes (beyond `href`'s own hash) that should also mark
   * this item active -- e.g. Game Matchups stays active for every
   * `#game-<id>` hash on /mlb, not just the literal `#schedule` anchor.
   */
  activeHashPrefixes?: string[];
  /** Renders as the dark CTA button instead of a plain nav link. */
  variant?: "link" | "cta";
};

export type MlbNavSection = {
  id: string;
  label: string | null;
  items: MlbNavItem[];
};

// Single source of truth for MLB navigation -- consumed by the desktop
// sidebar, the mobile drawer, and active-route matching. Preserves the
// exact destinations and grouping of the pre-existing MlbHubSidebar /
// MLB_HUB_LINKS in MlbGameDetail.tsx (main nav + "Tables" group), plus the
// Prop Optimizer CTA that previously lived outside that array.
//
// Dropped: a 10th "Schedule" entry duplicating "Game Matchups" (same
// `/mlb#schedule` target) existed in the old MLB_HUB_LINKS array but was
// never actually rendered (the old sidebar only sliced indices 0-8). Dead
// code, not a live destination -- not carried forward.
export const MLB_NAV_SECTIONS: MlbNavSection[] = [
  {
    id: "main",
    label: null,
    items: [
      { id: "hit-props", label: "Hit Props", href: "/mlb/batter-vs-pitcher", icon: Swords },
      { id: "hr-props", label: "HR Props", href: "/mlb/hr-props", icon: Flame },
      { id: "k-props", label: "K Props", href: "/mlb/strikeout-props", icon: Radar },
      {
        id: "game-matchups",
        label: "Game Matchups",
        href: "/mlb#schedule",
        icon: CalendarDays,
        // The /mlb page switches into its game-detail view via a
        // `#game-<gamePk>` hash (client-side, not a distinct router path --
        // see parseHash() in MlbGameDetail.tsx). Game Matchups stays the
        // active parent item for every game-detail hash.
        activeHashPrefixes: ["#game-"],
      },
      { id: "power-rankings", label: "Power Rankings", href: "/mlb/power-rankings", icon: BarChart3 },
    ],
  },
  {
    id: "tables",
    label: "Tables",
    items: [
      { id: "moneyline-edges", label: "Moneyline Edges", href: "/mlb#moneylines", icon: TrendingUp },
      { id: "pitcher-regression", label: "Pitcher Regression", href: "/mlb#pitcher-regression", icon: BarChart3 },
      { id: "overdue-batters", label: "Overdue Batters", href: "/mlb/hr-props#overdue", icon: Flame },
      { id: "biggest-mismatches", label: "Biggest Mismatches", href: "/mlb/hr-props#mismatches", icon: Swords },
    ],
  },
  {
    id: "utilities",
    label: "Utilities",
    items: [
      // Labeled "Prop Optimizer" but targets the existing Props Hub page --
      // there is no dedicated /mlb/prop-optimizer route. Preserved exactly
      // as the pre-existing CTA button behaved.
      { id: "prop-optimizer", label: "Prop Optimizer", href: "/mlb/props", icon: Rocket, variant: "cta" },
    ],
  },
];

export const MLB_NAV_ITEMS: MlbNavItem[] = MLB_NAV_SECTIONS.flatMap((section) => section.items);

/**
 * Router-aware active matching. Compares pathname (exact) and, when the
 * item targets a specific in-page hash, the current hash too. Items
 * without a hash stay active for any hash on their page (matches the
 * existing PgaSidebar convention in this codebase). `activeHashPrefixes`
 * additionally activates the item for any hash starting with one of the
 * given prefixes (used for Game Matchups' game-detail sub-state).
 */
export function isMlbNavItemActive(pathname: string, hash: string, item: MlbNavItem): boolean {
  const [base, anchor] = item.href.split("#");
  if (pathname !== base) return false;
  if (item.activeHashPrefixes?.some((prefix) => hash.startsWith(prefix))) return true;
  if (!anchor) return true;
  return hash === `#${anchor}`;
}
