/**
 * Dynamic strength-of-schedule metrics for the 2026 in-season division board.
 *
 * SOS To Date / Future SOS are computed on the fly from the real schedule
 * (games.json), completed results (results.json), and the canonical
 * universal current-rating board (currentRating2026.ts) -- never stored as a
 * static artifact. Every value here recomputes automatically whenever the
 * underlying ratings or schedule data change; nothing in this module is
 * cached or persisted.
 *
 * This module only READS a CurrentRatingBoard -- it is never consumed by
 * currentRating2026.ts, and no value computed here ever feeds back into a
 * team's rating. That separation is a hard invariant carried over from the
 * v0.4 artifact's own `sosAffectsRating: false` contract.
 *
 * Doubleheaders: each scheduled regular-season game against an opponent is
 * its own sample. Opponents are never deduplicated by abbreviation, so a
 * divisional opponent played twice contributes two samples.
 *
 * A game whose opponent cannot be resolved in the current-rating board is
 * excluded from the mean rather than treated as league-average (0 or 50) --
 * see `missingOpponents` on `SosMetric` for surfacing that condition. If a
 * team's entire sample is unresolvable, the metric is N/A (`null`), the same
 * as a team with no games in that sample at all.
 */

import type { CurrentRatingBoard } from "@/lib/nfl/currentRating2026";
import { rankByDescending } from "@/lib/nfl/publicPowerRatings";
import type { NflGameRecord, NflResultRecord } from "@/lib/nfl/standings";

const REGULAR_SEASON = "REG";

function isCompletedRegularSeasonResult(
  result: NflResultRecord,
  season: number
): boolean {
  return result.season === season && result.seasonType === REGULAR_SEASON && result.final === true;
}

/**
 * Opponents this team has already faced, one entry per completed
 * regular-season game. A repeat opponent (doubleheader) appears twice.
 */
export function opponentAbbrsFromCompletedGames(
  results: readonly NflResultRecord[] | null | undefined,
  season: number,
  teamAbbr: string
): string[] {
  if (!results) return [];
  const opponents: string[] = [];
  for (const result of results) {
    if (!isCompletedRegularSeasonResult(result, season)) continue;
    if (result.homeAbbr === teamAbbr) opponents.push(result.awayAbbr);
    else if (result.awayAbbr === teamAbbr) opponents.push(result.homeAbbr);
  }
  return opponents;
}

/**
 * Opponents remaining on this team's regular-season schedule, one entry per
 * scheduled game not yet completed. `results.json` final-game presence
 * (matched by gameId) is the authoritative completed-game signal, the same
 * ground truth `deriveStandings` uses -- `games.json`'s own `status` field is
 * not consulted, so the two sources cannot disagree about what's "done".
 */
export function opponentAbbrsFromRemainingGames(
  games: readonly NflGameRecord[] | null | undefined,
  results: readonly NflResultRecord[] | null | undefined,
  season: number,
  teamAbbr: string
): string[] {
  if (!games) return [];
  const completedGameIds = new Set(
    (results ?? [])
      .filter((result) => isCompletedRegularSeasonResult(result, season))
      .map((result) => result.gameId)
  );
  const opponents: string[] = [];
  for (const game of games) {
    if (game.season !== season || game.seasonType !== REGULAR_SEASON) continue;
    if (completedGameIds.has(game.gameId)) continue;
    if (game.homeAbbr === teamAbbr) opponents.push(game.awayAbbr);
    else if (game.awayAbbr === teamAbbr) opponents.push(game.homeAbbr);
  }
  return opponents;
}

export type SosMetric = {
  /** Mean current universal OVR of the resolved opponent samples. */
  value: number;
  /** Games actually averaged (opponent rating resolved). */
  sampleSize: number;
  /** Games in the schedule sample whose opponent could not be resolved in the current-rating board -- excluded from `value`, never zero-filled. */
  missingOpponents: number;
};

/**
 * Mean current universal OVR across a list of opponent abbreviations.
 * `null` ("N/A") when there are no opponents in the sample, or every
 * opponent in the sample is unresolvable.
 */
export function computeSosMetric(
  opponentAbbrs: readonly string[],
  board: CurrentRatingBoard | null | undefined
): SosMetric | null {
  if (opponentAbbrs.length === 0) return null;
  const ratingByAbbr = new Map((board?.teams ?? []).map((team) => [team.abbr, team.rating]));

  let total = 0;
  let sampleSize = 0;
  let missingOpponents = 0;
  for (const abbr of opponentAbbrs) {
    const rating = ratingByAbbr.get(abbr);
    if (rating === undefined) {
      missingOpponents += 1;
      continue;
    }
    total += rating;
    sampleSize += 1;
  }

  if (sampleSize === 0) return null;
  return { value: total / sampleSize, sampleSize, missingOpponents };
}

/** SOS To Date = mean current universal OVR of completed regular-season opponents. N/A before any completed game. */
export function sosToDateFor(
  results: readonly NflResultRecord[] | null | undefined,
  season: number,
  teamAbbr: string,
  board: CurrentRatingBoard | null | undefined
): SosMetric | null {
  return computeSosMetric(opponentAbbrsFromCompletedGames(results, season, teamAbbr), board);
}

/** Future SOS = mean current universal OVR of remaining scheduled regular-season opponents. N/A once the season is complete. */
export function futureSosFor(
  games: readonly NflGameRecord[] | null | undefined,
  results: readonly NflResultRecord[] | null | undefined,
  season: number,
  teamAbbr: string,
  board: CurrentRatingBoard | null | undefined
): SosMetric | null {
  return computeSosMetric(opponentAbbrsFromRemainingGames(games, results, season, teamAbbr), board);
}

export type SosBoardRow = {
  teamAbbr: string;
  sosToDate: SosMetric | null;
  /** 1 = hardest schedule to date (highest mean opponent OVR). null when sosToDate is N/A. */
  sosToDateRank: number | null;
  futureSos: SosMetric | null;
  /** 1 = hardest remaining schedule. null when futureSos is N/A. */
  futureSosRank: number | null;
};

/**
 * SOS To Date / Future SOS + league-wide ranks for every named team.
 *
 * Ranking is descending by mean opponent OVR (rank 1 = hardest), computed
 * only over teams with a resolvable metric -- a team with N/A for a metric
 * receives no rank for it (never a fabricated rank 32).
 */
export function buildSosBoard(
  teamAbbrs: readonly string[],
  games: readonly NflGameRecord[] | null | undefined,
  results: readonly NflResultRecord[] | null | undefined,
  season: number,
  board: CurrentRatingBoard | null | undefined
): Map<string, SosBoardRow> {
  const rows = teamAbbrs.map((teamAbbr) => ({
    teamAbbr,
    sosToDate: sosToDateFor(results, season, teamAbbr, board),
    futureSos: futureSosFor(games, results, season, teamAbbr, board),
  }));

  const sosToDateRanks = rankByDescending(
    rows
      .filter((row): row is typeof row & { sosToDate: SosMetric } => row.sosToDate !== null)
      .map((row) => ({ key: row.teamAbbr, value: row.sosToDate.value, name: row.teamAbbr, teamId: row.teamAbbr }))
  );
  const futureSosRanks = rankByDescending(
    rows
      .filter((row): row is typeof row & { futureSos: SosMetric } => row.futureSos !== null)
      .map((row) => ({ key: row.teamAbbr, value: row.futureSos.value, name: row.teamAbbr, teamId: row.teamAbbr }))
  );

  const board_ = new Map<string, SosBoardRow>();
  for (const row of rows) {
    board_.set(row.teamAbbr, {
      teamAbbr: row.teamAbbr,
      sosToDate: row.sosToDate,
      sosToDateRank: row.sosToDate ? sosToDateRanks.get(row.teamAbbr) ?? null : null,
      futureSos: row.futureSos,
      futureSosRank: row.futureSos ? futureSosRanks.get(row.teamAbbr) ?? null : null,
    });
  }
  return board_;
}
