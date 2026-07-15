export type SeoPage =
  | "home"
  | "mlb"
  | "mlb-hr-props"
  | "mlb-strikeout-props"
  | "mlb-batter-vs-pitcher"
  | "mlb-props-hub"
  | "pga"
  | "pga-custom"
  | "pga-dfs"
  | "pga-best-bets"
  | "pga-model"
  | "nfl"
  | "nba"
  | "ncaa"
  | "world-cup";

type SeoMeta = {
  title: string;
  description: string;
  path: string;
  noindex?: boolean;
};

const SEO_META: Record<SeoPage, SeoMeta> = {
  home: {
    title: "MLB Props, PGA Golf Models & Analytics | Joe Knows Ball",
    description:
      "Free MLB HR props, strikeout props, hit props, PGA Tour models, and game matchup analysis. Advanced sports betting analytics.",
    path: "/",
  },
  mlb: {
    title: "MLB Game Matchup Analysis & Daily Player Props | Joe Knows Ball",
    description:
      "Live MLB game matchup analyzer with park factors, pitcher vs batter analysis, lineup context, and daily HR props, strikeout props, and hit props betting models.",
    path: "/mlb",
  },
  "mlb-hr-props": {
    title: "MLB HR Props Model — Home Run Prop Picks & Analytics",
    description:
      "Free MLB home run prop model ranking every batter by barrel rate, hard-hit %, park factor, and pitcher vulnerability. Daily HR prop picks with sportsbook odds.",
    path: "/mlb/hr-props",
  },
  "mlb-strikeout-props": {
    title: "MLB Strikeout Props Model — Pitcher K Prop Picks & Analytics",
    description:
      "Free MLB strikeout prop model ranking pitchers by K rate, whiff rate, K/9, and opponent strikeout tendency. Daily K prop picks with sportsbook odds and avg IP.",
    path: "/mlb/strikeout-props",
  },
  "mlb-batter-vs-pitcher": {
    title: "MLB Batter vs Pitcher Matchup Tool | Joe Knows Ball",
    description:
      "MLB batter vs pitcher matchup explorer using historical stats, handedness splits, and pitch-type data. Find today's best hitting matchups.",
    path: "/mlb/batter-vs-pitcher",
  },
  "mlb-props-hub": {
    title: "MLB Props Hub — HR, Strikeout & Hit Props | Joe Knows Ball",
    description:
      "Central hub for all MLB daily prop models including home run props, strikeout props, hit props, and batter vs pitcher matchup analysis.",
    path: "/mlb/props",
  },
  pga: {
    title: "PGA Tour Power Rankings & Golf Tournament Models | Joe Knows Ball",
    description:
      "Custom-weighted PGA Tour player rankings updated weekly. Golf analytics, course-fit models, strokes gained breakdowns, DFS salary tools, and tournament model views.",
    path: "/pga",
  },
  "pga-custom": {
    title: "Custom PGA Golf Model Builder | Joe Knows Ball",
    description:
      "Build your own PGA Tour ranking model by adjusting strokes gained weights and course-specific stats. Personalized golf analytics and tournament ranking views.",
    path: "/pga/custom",
  },
  "pga-dfs": {
    title: "PGA DFS Salary Upload & Price Context | Joe Knows Ball",
    description:
      "Upload DraftKings or FanDuel PGA salary files and compare DFS pricing against Joe Knows Ball golf model rankings for price-context research.",
    path: "/pga/dfs",
  },
  "pga-best-bets": {
    title: "PGA Tour Best Bets — Golf Tournament Picks & Model Signals",
    description:
      "PGA Tour betting-card research based on strokes gained models, course history, and matchup analytics. Review model ranks and odds context for this week's golf tournament.",
    path: "/pga/best-bets",
  },
  "pga-model": {
    title: "PGA Tour Model Rankings — Strokes Gained Analytics",
    description:
      "Deep-dive PGA Tour player rankings powered by strokes gained off-the-tee, approach, around-the-green, and putting with course-fit adjustments.",
    path: "/pga/model",
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
    title: "NCAA Football Analytics — Coming Soon | Joe Knows Ball",
    description:
      "NCAA Football power rankings, matchup analysis, betting models, and team insights are being developed.",
    path: "/ncaa",
    noindex: true,
  },
  "world-cup": {
    title: "FIFA World Cup 2026 Power Rankings & Bracket Predictions | Joe Knows Ball",
    description:
      "FIFA World Cup 2026 group stage power rankings, knockout bracket predictions, and team analytics. Model picks Brazil to beat Spain in the final. Updated daily.",
    path: "/world-cup",
  },
};

export function getSeoMeta(page: SeoPage): SeoMeta {
  return SEO_META[page];
}
