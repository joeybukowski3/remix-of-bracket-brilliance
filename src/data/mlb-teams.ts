export type MLBTeamId =
  | "ari" | "atl" | "bal" | "bos" | "chc" | "cin" | "cle" | "col" | "cws"
  | "det" | "hou" | "kc"  | "laa" | "lad" | "mia" | "mil" | "min"
  | "nym" | "nyy" | "phi" | "pit" | "sd"  | "sea" | "sf"  | "stl"
  | "tb"  | "tex" | "tor" | "wsh";

export interface MLBTeam {
  id: MLBTeamId;
  name: string;
  short: string;
  logo: string;
}

export const MLB_TEAMS: MLBTeam[] = [
  { id: "ari", name: "Arizona Diamondbacks", short: "ARI", logo: "/logos/mlb/ari.svg" },
  { id: "atl", name: "Atlanta Braves", short: "ATL", logo: "/logos/mlb/atl.svg" },
  { id: "bal", name: "Baltimore Orioles", short: "BAL", logo: "/logos/mlb/bal.svg" },
  { id: "bos", name: "Boston Red Sox", short: "BOS", logo: "/logos/mlb/bos.svg" },
  { id: "chc", name: "Chicago Cubs", short: "CHC", logo: "/logos/mlb/chc.svg" },
  { id: "cin", name: "Cincinnati Reds", short: "CIN", logo: "/logos/mlb/cin.svg" },
  { id: "cle", name: "Cleveland Guardians", short: "CLE", logo: "/logos/mlb/cle.svg" },
  { id: "col", name: "Colorado Rockies", short: "COL", logo: "/logos/mlb/col.svg" },
  { id: "cws", name: "Chicago White Sox", short: "CWS", logo: "/logos/mlb/cws.svg" },
  { id: "det", name: "Detroit Tigers", short: "DET", logo: "/logos/mlb/det.svg" },
  { id: "hou", name: "Houston Astros", short: "HOU", logo: "/logos/mlb/hou.svg" },
  { id: "kc",  name: "Kansas City Royals", short: "KC",  logo: "/logos/mlb/kc.svg" },
  { id: "laa", name: "Los Angeles Angels", short: "LAA", logo: "/logos/mlb/laa.svg" },
  { id: "lad", name: "Los Angeles Dodgers", short: "LAD", logo: "/logos/mlb/lad.svg" },
  { id: "mia", name: "Miami Marlins", short: "MIA", logo: "/logos/mlb/mia.svg" },
  { id: "mil", name: "Milwaukee Brewers", short: "MIL", logo: "/logos/mlb/mil.svg" },
  { id: "min", name: "Minnesota Twins", short: "MIN", logo: "/logos/mlb/min.svg" },
  { id: "nym", name: "New York Mets", short: "NYM", logo: "/logos/mlb/nym.svg" },
  { id: "nyy", name: "New York Yankees", short: "NYY", logo: "/logos/mlb/nyy.svg" },
  { id: "phi", name: "Philadelphia Phillies", short: "PHI", logo: "/logos/mlb/phi.svg" },
  { id: "pit", name: "Pittsburgh Pirates", short: "PIT", logo: "/logos/mlb/pit.svg" },
  { id: "sd",  name: "San Diego Padres", short: "SD",  logo: "/logos/mlb/sd.svg" },
  { id: "sea", name: "Seattle Mariners", short: "SEA", logo: "/logos/mlb/sea.svg" },
  { id: "sf",  name: "San Francisco Giants", short: "SF",  logo: "/logos/mlb/sf.svg" },
  { id: "stl", name: "St. Louis Cardinals", short: "STL", logo: "/logos/mlb/stl.svg" },
  { id: "tb",  name: "Tampa Bay Rays", short: "TB",  logo: "/logos/mlb/tb.svg" },
  { id: "tex", name: "Texas Rangers", short: "TEX", logo: "/logos/mlb/tex.svg" },
  { id: "tor", name: "Toronto Blue Jays", short: "TOR", logo: "/logos/mlb/tor.svg" },
  { id: "wsh", name: "Washington Nationals", short: "WSH", logo: "/logos/mlb/wsh.svg" },
];
