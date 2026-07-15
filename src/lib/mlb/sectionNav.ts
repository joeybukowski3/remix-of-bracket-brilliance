import type { ComponentType } from "react";
import {
  BarChart3,
  CalendarDays,
  Dice5,
  Flame,
  Radar,
  Sparkles,
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
};

export type MlbNavSection = {
  id: string;
  label: string | null;
  items: MlbNavItem[];
};

// Single source of truth for MLB navigation -- consumed by the desktop
// sidebar, the mobile drawer, and active-route matching. Preserves the
// exact destinations used across the MLB hub.
//
// Dropped: a 10th "Schedule" entry duplicating "Game Matchups" (same
// `/mlb#schedule` target) existed in the old MLB_HUB_LINKS array but was
// never actually rendered (the old sidebar only sliced indices 0-8). Dead
// code, not a live destination -- not carried forward.
export const MLB_NAV_SECTIONS: MlbNavSection[] = [
  {
    id: "main",
    label: "Main",
    items: [
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
      { id: "hr-props", label: "HR Props", href: "/mlb/hr-props", icon: Flame },
      { id: "strikeout-props", label: "Strikeout Props", href: "/mlb/strikeout-props", icon: Radar },
      { id: "batter-vs-pitcher", label: "Batter vs Pitcher", href: "/mlb/batter-vs-pitcher", icon: Swords },
      { id: "props-hub", label: "Props Hub", href: "/mlb/props", icon: TrendingUp },
      { id: "power-rankings", label: "Power Rankings", href: "/mlb/power-rankings", icon: BarChart3 },
    ],
  },
  {
    id: "models-specials",
    label: "Models & Specials",
    items: [
      { id: "moneyline-edges", label: "Moneyline Edges", href: "/mlb#moneylines", icon: TrendingUp },
      { id: "pitcher-regression", label: "Pitcher Regression", href: "/mlb#pitcher-regression", icon: BarChart3 },
      { id: "overdue-batters", label: "Overdue Batters", href: "/mlb/hr-props#overdue", icon: Flame },
      { id: "biggest-mismatches", label: "Biggest Mismatches", href: "/mlb/hr-props#mismatches", icon: Swords },
      { id: "sin-city", label: "Sin City", href: "/mlb/sin-city", icon: Dice5 },
      { id: "numerology", label: "Numerology", href: "/mlb/numerology", icon: Sparkles },
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
