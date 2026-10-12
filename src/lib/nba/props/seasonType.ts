/**
 * NBA season and season-type identity.
 *
 * stats.nba.com encodes the competition in the first three characters of the
 * 10-character GAME_ID ("0022400061" -> "002" regular season, season "24").
 * The request parameter used to fetch a row and the GAME_ID prefix must agree;
 * a disagreement is a validation error, never silently resolved.
 */

export const NBA_SEASON_TYPES = ["preseason", "regular", "play_in", "playoffs"] as const;
export type NbaSeasonType = (typeof NBA_SEASON_TYPES)[number];

/** Season types whose games feed pregame features and evaluation targets. */
export const NBA_COMPETITIVE_SEASON_TYPES: readonly NbaSeasonType[] = ["regular", "play_in", "playoffs"];

/** stats.nba.com `SeasonType` query values. */
export const STATS_NBA_SEASON_TYPE_PARAM: Record<NbaSeasonType, string> = {
  preseason: "Pre Season",
  regular: "Regular Season",
  play_in: "PlayIn",
  playoffs: "Playoffs",
};

const GAME_ID_PREFIX_TO_SEASON_TYPE: Record<string, NbaSeasonType> = {
  "001": "preseason",
  "002": "regular",
  "004": "playoffs",
  "005": "play_in",
};

const SEASON_PATTERN = /^(\d{4})-(\d{2})$/;
const GAME_ID_PATTERN = /^\d{10}$/;

export function isNbaSeasonType(value: string): value is NbaSeasonType {
  return (NBA_SEASON_TYPES as readonly string[]).includes(value);
}

/** "2024-25" -> 2024. Throws on malformed or non-consecutive seasons. */
export function seasonStartYear(season: string): number {
  const match = SEASON_PATTERN.exec(season);
  if (!match) throw new Error(`Invalid NBA season "${season}" (expected YYYY-YY)`);
  const start = Number(match[1]);
  const endSuffix = Number(match[2]);
  if ((start + 1) % 100 !== endSuffix) {
    throw new Error(`Invalid NBA season "${season}" (end year must follow start year)`);
  }
  return start;
}

export function seasonFromStartYear(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export function previousSeason(season: string): string {
  return seasonFromStartYear(seasonStartYear(season) - 1);
}

export interface GameIdParts {
  seasonType: NbaSeasonType | null;
  /** Two-digit season start year embedded in the id, e.g. 24 for 2024-25. */
  seasonYearSuffix: number;
}

export function parseGameId(gameId: string): GameIdParts {
  if (!GAME_ID_PATTERN.test(gameId)) throw new Error(`Invalid NBA GAME_ID "${gameId}"`);
  return {
    seasonType: GAME_ID_PREFIX_TO_SEASON_TYPE[gameId.slice(0, 3)] ?? null,
    seasonYearSuffix: Number(gameId.slice(3, 5)),
  };
}

/** True when the GAME_ID is consistent with the requested season and season type. */
export function gameIdMatches(gameId: string, season: string, seasonType: NbaSeasonType): boolean {
  const parts = parseGameId(gameId);
  return parts.seasonType === seasonType && parts.seasonYearSuffix === seasonStartYear(season) % 100;
}
