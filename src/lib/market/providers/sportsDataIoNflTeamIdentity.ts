/**
 * Deterministic SportsDataIO NFL team-identity resolution at the provider
 * boundary.
 *
 * The live `GameOddsByWeek` ("Pre-Game Odds - by Week") payload does NOT carry
 * the `AwayTeam` / `HomeTeam` abbreviation "Key" that the Scores feed and the
 * `GameBettingSplit` feed do. It carries `AwayTeamName` / `HomeTeamName`
 * instead, and — observed against the live 2026 Week 1 response on 2026-08-31 —
 * that field is populated with the SportsDataIO **abbreviation** ("SF", "LAR",
 * "WAS"), not the full club name the OpenAPI description implies. Both forms are
 * resolved here so discovery works regardless of which the provider returns:
 *
 *   - a 2–3 letter token is treated as a SportsDataIO abbreviation and returned
 *     upper-cased (canonical alias folding — LAR→lar, WAS→wsh, JAX→jax, ARI→ari
 *     — happens downstream in {@link normalizeNflTeamAbbr}, which every consumer
 *     already runs);
 *   - a longer string is looked up in an exact, reviewed full-name table.
 *
 * There is no fuzzy matching: an unrecognised value returns `null` and the
 * caller reports the game as unmatched rather than guessing.
 *
 * The numeric `AwayTeamId` / `HomeTeamId` / `GlobalAwayTeamId` /
 * `GlobalHomeTeamId` are SportsDataIO's own team ids. They are preserved by the
 * decoder as provider ids for crosswalk evidence and are never treated as
 * nflverse identity.
 */

/**
 * SportsDataIO NFL full club name (lower-cased) → SportsDataIO abbreviation.
 * Verified against SportsDataIO's published NFL team list (2026-08-31). The
 * abbreviation is normalised to the canonical nflverse token downstream.
 */
const SPORTS_DATA_IO_NFL_NAME_TO_ABBR: Readonly<Record<string, string>> = {
  "arizona cardinals": "ARI",
  "atlanta falcons": "ATL",
  "baltimore ravens": "BAL",
  "buffalo bills": "BUF",
  "carolina panthers": "CAR",
  "chicago bears": "CHI",
  "cincinnati bengals": "CIN",
  "cleveland browns": "CLE",
  "dallas cowboys": "DAL",
  "denver broncos": "DEN",
  "detroit lions": "DET",
  "green bay packers": "GB",
  "houston texans": "HOU",
  "indianapolis colts": "IND",
  "jacksonville jaguars": "JAX",
  "kansas city chiefs": "KC",
  "las vegas raiders": "LV",
  "los angeles chargers": "LAC",
  "los angeles rams": "LAR",
  "miami dolphins": "MIA",
  "minnesota vikings": "MIN",
  "new england patriots": "NE",
  "new orleans saints": "NO",
  "new york giants": "NYG",
  "new york jets": "NYJ",
  "philadelphia eagles": "PHI",
  "pittsburgh steelers": "PIT",
  "san francisco 49ers": "SF",
  "seattle seahawks": "SEA",
  "tampa bay buccaneers": "TB",
  "tennessee titans": "TEN",
  "washington commanders": "WAS",
};

/**
 * Resolve a SportsDataIO team string (abbreviation OR full club name) to a
 * SportsDataIO abbreviation, upper-cased. Returns `null` for empty or
 * unrecognised input. Callers pass the result through
 * {@link normalizeNflTeamAbbr} for canonical alias folding.
 */
export function resolveSportsDataIoNflTeamAbbr(
  value: string | null | undefined,
): string | null {
  const raw = String(value ?? "").trim();
  if (raw === "") return null;
  if (/^[A-Za-z]{2,3}$/.test(raw)) return raw.toUpperCase();
  return SPORTS_DATA_IO_NFL_NAME_TO_ABBR[raw.toLowerCase()] ?? null;
}
