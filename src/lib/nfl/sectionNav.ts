export type NflSectionNavItem = {
  to: string;
  label: string;
  shortLabel: string;
  description: string;
  marker: string;
};

export const NFL_SECTION_NAV_ITEMS: NflSectionNavItem[] = [
  {
    to: "/nfl",
    label: "NFL Guide Home",
    shortLabel: "Guide Home",
    description: "Start here: guide status, print edition and every section of the NFL hub.",
    marker: "GH",
  },
  {
    to: "/nfl/guide",
    label: "Full Interactive Guide",
    shortLabel: "Full Guide",
    description: "Team previews, projections, playoff picks and all 32 dashboards.",
    marker: "TG",
  },
  {
    to: "/nfl-guide/",
    label: "Print / PDF Edition",
    shortLabel: "Print Edition",
    description: "The same guide data, formatted for printing or saving as a PDF.",
    marker: "PR",
  },
  {
    to: "/nfl/power-ratings",
    label: "Power Ratings",
    shortLabel: "Power Ratings",
    description: "Overall, offense and defense ratings for all 32 teams.",
    marker: "PW",
  },
  {
    to: "/nfl/standings",
    label: "Standings by Division",
    shortLabel: "Standings",
    description: "Division-by-division records with unit and power ranks.",
    marker: "ST",
  },
  {
    to: "/nfl/super-bowl",
    label: "Super Bowl Odds",
    shortLabel: "Super Bowl Odds",
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
  {
    to: "/nfl/guide/regression",
    label: "Fluke or Real",
    shortLabel: "Fluke or Real",
    description: "Bounce-back and regression candidates from the model.",
    marker: "FR",
  },
];

function normalizeTrailingSlash(pathname: string) {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

export function isNflSectionPathActive(pathname: string, to: string) {
  if (to === "/nfl/guide") {
    return pathname === to || pathname.startsWith("/nfl/guide/team/");
  }
  return normalizeTrailingSlash(pathname) === normalizeTrailingSlash(to);
}
