export type NflSectionNavItem = {
  to: string;
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
  match?: "exact" | "prefix";
  teamRouteMatch?: boolean;
  status?: "live" | "planned" | "beta" | "new";
};

export type NflSectionNavCategory = {
  id: string;
  label: string;
  description: string;
  items: NflSectionNavItem[];
};

/**
 * The NFL platform sitemap.
 *
 * Categories used to each carry their own colour theme (blue / emerald /
 * violet / amber), which turned the sidebar into a four-colour card stack where
 * the colour carried no information — a division rival was not "more emerald"
 * than a futures market. Grouping is now expressed by position and heading
 * weight alone, and colour is reserved for state (active route) and for the
 * semantic accents used inside the pages.
 */
export const NFL_SECTION_NAV_CATEGORIES: NflSectionNavCategory[] = [
  {
    id: "overview",
    label: "NFL Overview",
    description: "Platform home and core team ratings.",
    items: [
      {
        to: "/nfl",
        label: "Power Ratings",
        shortLabel: "Power",
        description: "Overall, offense and defense ratings for all 32 teams.",
        icon: "📈",
      },
      {
        to: "/16-0",
        label: "16-0 Draft Game",
        shortLabel: "16-0 Draft",
        description: "Draft a 17-player fantasy roster and simulate the season. Can you go 16-0?",
        icon: "🎮",
        match: "prefix",
      },
    ],
  },
  {
    id: "season",
    label: "Season",
    description: "Standings and schedule intelligence.",
    items: [
      {
        to: "/nfl/standings",
        label: "Standings by Division",
        shortLabel: "Standings",
        description: "Division-by-division records with unit and power ranks.",
        icon: "🏆",
      },
      {
        to: "/nfl/schedule",
        label: "Schedule by Week",
        shortLabel: "Schedule",
        description: "Full season schedule with kickoff times, stadiums and final scores.",
        icon: "🗓️",
      },
      {
        to: "/nfl/matchups",
        label: "Weekly Matchups",
        shortLabel: "Matchups",
        description: "Week-by-week game comparisons, advantages and matchup angles.",
        icon: "⚔️",
        match: "prefix",
      },
    ],
  },
  {
    id: "markets",
    label: "Markets & Predictions",
    description: "Futures markets and awards research.",
    items: [
      {
        to: "/nfl/super-bowl",
        label: "Super Bowl Odds",
        shortLabel: "Super Bowl",
        description: "Live market prices compared with the Joe Knows Ball model.",
        icon: "🏈",
      },
      {
        to: "/nfl/coach-of-year",
        label: "Coach of the Year",
        shortLabel: "Coach of Year",
        description: "Historical winner profile and 2026 candidate elimination model.",
        icon: "🏅",
      },
    ],
  },
  {
    id: "team-intelligence",
    label: "Team Intelligence",
    description: "Guide hub, team dashboards and regression screens.",
    items: [
      {
        to: "/nfl/guide",
        label: "2026 Team Guide",
        shortLabel: "Team Guide",
        description: "Team previews, projections, playoff picks and all 32 dashboards.",
        icon: "📖",
        teamRouteMatch: true,
      },
      {
        to: "/nfl/guide/regression",
        label: "Fluke or Real",
        shortLabel: "Fluke or Real",
        description: "Bounce-back and regression candidates from the model.",
        icon: "🔎",
      },
    ],
  },
  {
    id: "fantasy",
    label: "Fantasy",
    description: "Fantasy football rankings and draft research.",
    items: [
      {
        to: "/fantasy-football",
        label: "Fantasy Football",
        shortLabel: "Fantasy",
        description: "Customized Joe Knows Ball rankings and draft tools.",
        icon: "🧮",
        match: "prefix",
      },
    ],
  },
];

export const NFL_SECTION_NAV_ITEMS: NflSectionNavItem[] = NFL_SECTION_NAV_CATEGORIES.flatMap((category) => category.items);

export function isNflSectionPathActive(pathname: string, to: string) {
  if (to === "/nfl/guide") {
    return pathname === to || pathname.startsWith("/nfl/guide/team/");
  }
  // Prefix-matched items (e.g. Weekly Matchups) stay active on their detail
  // routes. Guard with a trailing slash so "/nfl/matchups" never bleeds into a
  // sibling like "/nfl/schedule".
  const prefixItem = NFL_SECTION_NAV_ITEMS.find((item) => item.to === to && item.match === "prefix");
  if (prefixItem) {
    return pathname === to || pathname.startsWith(`${to}/`);
  }
  return pathname === to;
}

export function getActiveNflSectionCategoryId(pathname: string) {
  return NFL_SECTION_NAV_CATEGORIES.find((category) =>
    category.items.some((item) => isNflSectionPathActive(pathname, item.to))
  )?.id ?? NFL_SECTION_NAV_CATEGORIES[0]?.id;
}

export function getUniqueNflSectionNavPaths() {
  return [...new Set(NFL_SECTION_NAV_ITEMS.map((item) => item.to))];
}

/** Label of the current destination, for the mobile menu's "you are here" row. */
export function getActiveNflSectionLabel(pathname: string): string | null {
  return NFL_SECTION_NAV_ITEMS.find((item) => isNflSectionPathActive(pathname, item.to))?.label ?? null;
}
