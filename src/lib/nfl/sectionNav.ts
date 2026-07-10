export type NflSectionNavItem = {
  to: string;
  label: string;
  shortLabel: string;
  description: string;
  marker: string;
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
        marker: "PR",
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
        marker: "ST",
      },
      {
        to: "/nfl/schedule",
        label: "Schedule by Week",
        shortLabel: "Schedule",
        description: "Full season schedule with kickoff times, stadiums and final scores.",
        marker: "SC",
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
        marker: "SB",
      },
      {
        to: "/nfl/coach-of-year",
        label: "Coach of the Year",
        shortLabel: "Coach of Year",
        description: "Historical winner profile and 2026 candidate elimination model.",
        marker: "CY",
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
        marker: "TG",
        teamRouteMatch: true,
      },
      {
        to: "/nfl/guide/regression",
        label: "Fluke or Real",
        shortLabel: "Fluke or Real",
        description: "Bounce-back and regression candidates from the model.",
        marker: "FR",
      },
    ],
  },
];

export const NFL_SECTION_NAV_ITEMS: NflSectionNavItem[] = NFL_SECTION_NAV_CATEGORIES.flatMap((category) => category.items);

export function isNflSectionPathActive(pathname: string, to: string) {
  if (to === "/nfl/guide") {
    return pathname === to || pathname.startsWith("/nfl/guide/team/");
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
