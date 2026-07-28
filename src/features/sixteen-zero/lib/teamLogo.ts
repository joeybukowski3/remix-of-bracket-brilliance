const NFL_TEAM_LOGO_SLUGS: Record<string, string> = {
  ARI: "ari",
  ATL: "atl",
  BAL: "bal",
  BUF: "buf",
  CAR: "car",
  CHI: "chi",
  CIN: "cin",
  CLE: "cle",
  DAL: "dal",
  DEN: "den",
  DET: "det",
  GB: "gb",
  HOU: "hou",
  IND: "ind",
  JAX: "jax",
  KC: "kc",
  LAC: "lac",
  LAR: "lar",
  LV: "lv",
  MIA: "mia",
  MIN: "min",
  NE: "ne",
  NO: "no",
  NYG: "nyg",
  NYJ: "nyj",
  PHI: "phi",
  PIT: "pit",
  SEA: "sea",
  SF: "sf",
  TB: "tb",
  TEN: "ten",
  WSH: "wsh",
};

export function normalizeNflTeamCode(team: string): string {
  return team.trim().toUpperCase();
}

export function getNflTeamLogoUrl(team: string): string | null {
  const slug = NFL_TEAM_LOGO_SLUGS[normalizeNflTeamCode(team)];
  return slug ? `https://a.espncdn.com/i/teamlogos/nfl/500/${slug}.png` : null;
}
