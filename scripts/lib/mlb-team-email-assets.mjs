/**
 * MLB team logo/color lookup for the numerology email (Node/.mjs context).
 *
 * Mirrors the values in src/lib/mlb/mlbTeamLogos.ts and
 * src/lib/mlbTeamColors.ts, which are TypeScript modules meant for the
 * Vite/React app and cannot be imported directly by a plain Node script.
 * Kept intentionally small and data-only so it's easy to eyeball against
 * those two files if either changes.
 *
 * Email clients cannot resolve the site's relative asset paths, so every
 * logo here resolves to an absolute URL (the one local override —
 * ARI — is qualified against the site's own domain instead of a relative
 * path).
 */

const SITE_ORIGIN = "https://www.joeknowsball.com";

// Same values as src/lib/mlb/mlbTeamLogos.ts, with the one relative path
// (ARI) made absolute against SITE_ORIGIN for email use.
const MLB_TEAM_LOGOS = {
  ARI: `${SITE_ORIGIN}/logos/mlb/ari.svg`,
  ATL: "https://a.espncdn.com/i/teamlogos/mlb/500/atl.png",
  ATH: "https://a.espncdn.com/i/teamlogos/mlb/500/oak.png",
  BAL: "https://a.espncdn.com/i/teamlogos/mlb/500/bal.png",
  BOS: "https://a.espncdn.com/i/teamlogos/mlb/500/bos.png",
  CHC: "https://a.espncdn.com/i/teamlogos/mlb/500/chc.png",
  CIN: "https://a.espncdn.com/i/teamlogos/mlb/500/cin.png",
  CLE: "https://a.espncdn.com/i/teamlogos/mlb/500/cle.png",
  COL: "https://a.espncdn.com/i/teamlogos/mlb/500/col.png",
  CWS: "https://a.espncdn.com/i/teamlogos/mlb/500/cws.png",
  DET: "https://a.espncdn.com/i/teamlogos/mlb/500/det.png",
  HOU: "https://a.espncdn.com/i/teamlogos/mlb/500/hou.png",
  KC: "https://a.espncdn.com/i/teamlogos/mlb/500/kc.png",
  LAA: "https://a.espncdn.com/i/teamlogos/mlb/500/laa.png",
  LAD: "https://a.espncdn.com/i/teamlogos/mlb/500/lad.png",
  MIA: "https://a.espncdn.com/i/teamlogos/mlb/500/mia.png",
  MIL: "https://a.espncdn.com/i/teamlogos/mlb/500/mil.png",
  MIN: "https://a.espncdn.com/i/teamlogos/mlb/500/min.png",
  NYM: "https://a.espncdn.com/i/teamlogos/mlb/500/nym.png",
  NYY: "https://a.espncdn.com/i/teamlogos/mlb/500/nyy.png",
  OAK: "https://a.espncdn.com/i/teamlogos/mlb/500/oak.png",
  PHI: "https://a.espncdn.com/i/teamlogos/mlb/500/phi.png",
  PIT: "https://a.espncdn.com/i/teamlogos/mlb/500/pit.png",
  SD: "https://a.espncdn.com/i/teamlogos/mlb/500/sd.png",
  SEA: "https://a.espncdn.com/i/teamlogos/mlb/500/sea.png",
  SF: "https://a.espncdn.com/i/teamlogos/mlb/500/sf.png",
  STL: "https://a.espncdn.com/i/teamlogos/mlb/500/stl.png",
  TB: "https://a.espncdn.com/i/teamlogos/mlb/500/tb.png",
  TEX: "https://a.espncdn.com/i/teamlogos/mlb/500/tex.png",
  TOR: "https://a.espncdn.com/i/teamlogos/mlb/500/tor.png",
  WSH: "https://a.espncdn.com/i/teamlogos/mlb/500/wsh.png",
};

// Same primary/secondary values as src/lib/mlbTeamColors.ts (tint omitted —
// unused here; the email uses solid low-opacity backgrounds computed below).
const MLB_TEAM_COLORS = {
  ARI: { primary: "#A71930", secondary: "#E3D4AD" },
  ATL: { primary: "#CE1141", secondary: "#13274F" },
  ATH: { primary: "#003831", secondary: "#EFB21E" },
  OAK: { primary: "#003831", secondary: "#EFB21E" },
  BAL: { primary: "#DF4601", secondary: "#000000" },
  BOS: { primary: "#BD3039", secondary: "#0C2340" },
  CHC: { primary: "#0E3386", secondary: "#CC3433" },
  CIN: { primary: "#C6011F", secondary: "#000000" },
  CLE: { primary: "#E31937", secondary: "#002B5C" },
  COL: { primary: "#33006F", secondary: "#C4CED4" },
  CWS: { primary: "#111111", secondary: "#C4CED4" },
  DET: { primary: "#0C2340", secondary: "#FA4616" },
  HOU: { primary: "#EB6E1F", secondary: "#002D62" },
  KC: { primary: "#004687", secondary: "#BD9B60" },
  KCR: { primary: "#004687", secondary: "#BD9B60" },
  LAA: { primary: "#BA0021", secondary: "#003263" },
  LAD: { primary: "#005A9C", secondary: "#EF3E42" },
  MIA: { primary: "#00A3E0", secondary: "#EF3340" },
  MIL: { primary: "#12284B", secondary: "#FFC52F" },
  MIN: { primary: "#002B5C", secondary: "#D31145" },
  NYM: { primary: "#002D72", secondary: "#FF5910" },
  NYY: { primary: "#132448", secondary: "#C4CED3" },
  PHI: { primary: "#E81828", secondary: "#002D72" },
  PIT: { primary: "#FDB827", secondary: "#27251F" },
  SD: { primary: "#2F241D", secondary: "#FFC425" },
  SDP: { primary: "#2F241D", secondary: "#FFC425" },
  SEA: { primary: "#005C5C", secondary: "#0C2C56" },
  SF: { primary: "#FD5A1E", secondary: "#27251F" },
  SFG: { primary: "#FD5A1E", secondary: "#27251F" },
  STL: { primary: "#C41E3A", secondary: "#0C2340" },
  TB: { primary: "#092C5C", secondary: "#8FBCE6" },
  TBR: { primary: "#092C5C", secondary: "#8FBCE6" },
  TEX: { primary: "#003278", secondary: "#C0111F" },
  TOR: { primary: "#134A8E", secondary: "#E8291C" },
  WSH: { primary: "#AB0003", secondary: "#14225A" },
};

const FALLBACK_COLOR = { primary: "#334155", secondary: "#CBD5E1" };
const FALLBACK_LOGO = "https://a.espncdn.com/i/teamlogos/mlb/500/mlb.png";

export function getEmailTeamLogoUrl(team) {
  const key = String(team ?? "").trim().toUpperCase();
  return MLB_TEAM_LOGOS[key] ?? FALLBACK_LOGO;
}

export function getEmailTeamColors(team) {
  const key = String(team ?? "").trim().toUpperCase();
  return MLB_TEAM_COLORS[key] ?? FALLBACK_COLOR;
}

/** Hex -> "r, g, b" for building an rgba() tint inline style. */
export function hexToRgbTriplet(hex) {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex ?? "").trim());
  if (!match) return "51, 65, 85";
  return [1, 2, 3].map((i) => parseInt(match[i], 16)).join(", ");
}
