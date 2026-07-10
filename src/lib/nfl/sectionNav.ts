export type NflSectionThemeId = "blue" | "emerald" | "violet" | "amber";

export type NflSectionTheme = {
  border: string;
  background: string;
  heading: string;
  activeBorder: string;
  activeBackground: string;
  iconBackground: string;
  linkActiveBorder: string;
  linkActiveBackground: string;
  linkActiveText: string;
};

export const NFL_SECTION_THEMES: Record<NflSectionThemeId, NflSectionTheme> = {
  blue: {
    border: "border-blue-300",
    background: "bg-blue-50/50",
    heading: "text-blue-800",
    activeBorder: "border-blue-400",
    activeBackground: "bg-blue-50",
    iconBackground: "bg-blue-100",
    linkActiveBorder: "border-blue-300",
    linkActiveBackground: "bg-white",
    linkActiveText: "text-blue-950",
  },
  emerald: {
    border: "border-emerald-300",
    background: "bg-emerald-50/40",
    heading: "text-emerald-800",
    activeBorder: "border-emerald-400",
    activeBackground: "bg-emerald-50",
    iconBackground: "bg-emerald-100",
    linkActiveBorder: "border-emerald-300",
    linkActiveBackground: "bg-white",
    linkActiveText: "text-emerald-950",
  },
  violet: {
    border: "border-violet-300",
    background: "bg-violet-50/40",
    heading: "text-violet-800",
    activeBorder: "border-violet-400",
    activeBackground: "bg-violet-50",
    iconBackground: "bg-violet-100",
    linkActiveBorder: "border-violet-300",
    linkActiveBackground: "bg-white",
    linkActiveText: "text-violet-950",
  },
  amber: {
    border: "border-amber-300",
    background: "bg-amber-50/40",
    heading: "text-amber-800",
    activeBorder: "border-amber-400",
    activeBackground: "bg-amber-50",
    iconBackground: "bg-amber-100",
    linkActiveBorder: "border-amber-300",
    linkActiveBackground: "bg-white",
    linkActiveText: "text-amber-950",
  },
};

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
  themeId: NflSectionThemeId;
  items: NflSectionNavItem[];
};

export const NFL_SECTION_NAV_CATEGORIES: NflSectionNavCategory[] = [
  {
    id: "overview",
    label: "NFL Overview",
    description: "Platform home and core team ratings.",
    themeId: "blue",
    items: [
      {
        to: "/nfl",
        label: "Power Ratings",
        shortLabel: "Power",
        description: "Overall, offense and defense ratings for all 32 teams.",
        icon: "📈",
      },
    ],
  },
  {
    id: "season",
    label: "Season",
    description: "Standings and schedule intelligence.",
    themeId: "emerald",
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
    themeId: "violet",
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
        icon: "🏆",
      },
    ],
  },
  {
    id: "team-intelligence",
    label: "Team Intelligence",
    description: "Guide hub, team dashboards and regression screens.",
    themeId: "amber",
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
