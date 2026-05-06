export type SeoPage =
  | "home"
  | "mlb"
  | "pga"
  | "pga-custom"
  | "pga-dfs"
  | "nfl"
  | "nba"
  | "ncaa";

type SeoMeta = {
  title: string;
  description: string;
  path: string;
};

const SEO_META: Record<SeoPage, SeoMeta> = {
  home: {
    title: "Joe Knows Ball — Advanced Sports Analytics & Betting Models",
    description:
      "Free advanced analytics, matchup intelligence, and betting models for MLB, NFL, NBA, NCAA, and PGA. Built for bettors who want an edge.",
    path: "/",
  },
  mlb: {
    title: "MLB Matchup Intelligence — Joe Knows Ball",
    description:
      "Deep MLB matchup breakdowns with pitcher vs lineup data, park factors, team form, and run total context updated daily.",
    path: "/mlb",
  },
  pga: {
    title: "PGA Tour Power Rankings & Tournament Models — Joe Knows Ball",
    description:
      "Custom-weighted PGA Tour player rankings updated every Monday. Build your own golf model, compare DFS salaries, and get course-specific tournament projections.",
    path: "/pga",
  },
  "pga-custom": {
    title: "Custom Golf Model Builder — Joe Knows Ball",
    description:
      "Drag the sliders, set your own weights, and build a personalized PGA Tour ranking model based on strokes gained and course stats.",
    path: "/pga/custom",
  },
  "pga-dfs": {
    title: "PGA DFS Upload & Salary Value Finder — Joe Knows Ball",
    description:
      "Upload DraftKings or FanDuel salary files and compare DFS pricing against Joe Knows Ball PGA model rankings.",
    path: "/pga/dfs",
  },
  nfl: {
    title: "NFL Analytics & Betting Models — Joe Knows Ball",
    description:
      "NFL matchup analytics, efficiency metrics, and betting context for every week of the season.",
    path: "/nfl",
  },
  nba: {
    title: "NBA Matchup Analytics — Joe Knows Ball",
    description:
      "NBA game breakdowns and advanced analytics to inform your bets and daily fantasy decisions.",
    path: "/nba",
  },
  ncaa: {
    title: "NCAA Analytics — Joe Knows Ball",
    description:
      "College sports analytics and matchup data across football and basketball.",
    path: "/ncaa",
  },
};

export function getSeoMeta(page: SeoPage): SeoMeta {
  return SEO_META[page];
}
