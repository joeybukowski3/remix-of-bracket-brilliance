/**
 * Maps WalterFootball's full team names (as they appear in <img title="...">
 * attributes on the picks pages) to this repo's nflverse-style team
 * abbreviations, the same codes used in public/data/nfl/{season}/games.json
 * gameIds (e.g. "2026_01_NE_SEA"). Keyed by full name rather than Walter's
 * own panel-id shorthand (e.g. "NEP_SEA") because Walter's shorthand does not
 * reliably match nflverse codes and full team names are the stable anchor
 * available in the markup (img title, panel heading text).
 */
export const TEAM_NAME_TO_ABBR = {
  "Arizona Cardinals": "ARI",
  "Atlanta Falcons": "ATL",
  "Baltimore Ravens": "BAL",
  "Buffalo Bills": "BUF",
  "Carolina Panthers": "CAR",
  "Chicago Bears": "CHI",
  "Cincinnati Bengals": "CIN",
  "Cleveland Browns": "CLE",
  "Dallas Cowboys": "DAL",
  "Denver Broncos": "DEN",
  "Detroit Lions": "DET",
  "Green Bay Packers": "GB",
  "Houston Texans": "HOU",
  "Indianapolis Colts": "IND",
  "Jacksonville Jaguars": "JAX",
  "Kansas City Chiefs": "KC",
  "Las Vegas Raiders": "LV",
  "Los Angeles Chargers": "LAC",
  "Los Angeles Rams": "LA",
  "Miami Dolphins": "MIA",
  "Minnesota Vikings": "MIN",
  "New England Patriots": "NE",
  "New Orleans Saints": "NO",
  "New York Giants": "NYG",
  "New York Jets": "NYJ",
  "Philadelphia Eagles": "PHI",
  "Pittsburgh Steelers": "PIT",
  "San Francisco 49ers": "SF",
  "Seattle Seahawks": "SEA",
  "Tampa Bay Buccaneers": "TB",
  "Tennessee Titans": "TEN",
  "Washington Commanders": "WAS",
  // WalterFootball has historically kept the pre-rebrand name in some markup;
  // normalize it to the current abbreviation used by our own schedule data.
  "Washington Redskins": "WAS",
  "Washington Football Team": "WAS",
};

/**
 * Resolves a WalterFootball team name to our nflverse-style abbreviation.
 * Returns null (never throws) when the name isn't recognized, so callers can
 * record a parse warning instead of failing the whole capture.
 */
export function resolveTeamAbbr(fullName) {
  if (!fullName) return null;
  const trimmed = fullName.trim();
  if (TEAM_NAME_TO_ABBR[trimmed]) return TEAM_NAME_TO_ABBR[trimmed];

  // Strip a trailing "(0-0)"-style record if present before giving up.
  const withoutRecord = trimmed.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return TEAM_NAME_TO_ABBR[withoutRecord] ?? null;
}
