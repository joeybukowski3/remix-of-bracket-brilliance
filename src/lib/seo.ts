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
  noindex?: boolean;
};

const SEO_META: Record<SeoPage, SeoMeta> = {
  home: {
    title: "MLB Player Props, PGA Golf Models & Advanced Sports Analytics | Joe Knows Ball",
    description:
      "Free advanced sports analytics for MLB daily props, PGA Tour power rankings, and betting models. HR props, strikeout props, hit props, game matchup analysis, and golf tournament models.",
    path: "/",
  },
  mlb: {
    title: "MLB Game Matchup Analysis & Daily Player Props | Joe Knows Ball",
    description:
      "Live MLB game matchup analyzer with park factors, pitcher vs batter analysis, lineup context, and daily HR props, strikeout props, and hit props betting models.",
    path: "/mlb",
  },
  pga: {
    title: "PGA Tour Power Rankings & Golf Tournament Models | Joe Knows Ball",
    description:
      "Custom-weighted PGA Tour player rankings updated weekly. Advanced golf analytics, course-fit models, strokes gained breakdowns, DFS salary tools, and tournament projections.",
    path: "/pga",
  },
  "pga-custom": {
    title: "Custom PGA Golf Model Builder | Joe Knows Ball",
    description:
      "Build your own PGA Tour ranking model by adjusting strokes gained weights and course-specific stats. Personalized golf analytics and tournament predictions.",
    path: "/pga/custom",
  },
  "pga-dfs": {
    title: "PGA DFS Salary Upload & Value Finder | Joe Knows Ball",
    description:
      "Upload DraftKings or FanDuel PGA salary files and compare DFS pricing against Joe Knows Ball golf model rankings to find value plays.",
    path: "/pga/dfs",
  },
  nfl: {
    title: "NFL Analytics & Betting Models | Joe Knows Ball",
    description:
      "NFL matchup analytics, efficiency metrics, and betting context. Advanced football models coming soon.",
    path: "/nfl",
    noindex: true,
  },
  nba: {
    title: "NBA Analytics & Betting Models | Joe Knows Ball",
    description:
      "NBA game breakdowns and advanced analytics. Basketball models coming soon.",
    path: "/nba",
    noindex: true,
  },
  ncaa: {
    title: "NCAA Basketball Analytics & Bracket Tools | Joe Knows Ball",
    description:
      "College basketball analytics, custom team rankings, matchup breakdowns, and March Madness bracket builder.",
    path: "/ncaa",
  },
};

export function getSeoMeta(page: SeoPage): SeoMeta {
  return SEO_META[page];
}
