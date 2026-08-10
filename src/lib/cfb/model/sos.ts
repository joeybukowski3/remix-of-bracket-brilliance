/**
 * JKB CFB strength-of-schedule engine.
 *
 * Deliberately decoupled from any specific schedule source: callers pass in a
 * flat list of CfbSosGameInput rows (one row per team-game — see toSosGameInputs
 * for converting a CfbGame[] slate into this shape) plus an opponent power-rating
 * lookup. This module never imports src/data/cfb/season2026/schedule.ts directly,
 * so a future full-slate/live schedule ingest is a drop-in replacement.
 *
 * SOS is computed from opponent POWER RATINGS, never from opponent win-loss
 * record (a 0-3 team that lost three one-possession games to top-10 opponents
 * is a much harder out than its record implies).
 *
 * Played vs remaining:
 * - A game counts toward "played" only when gameStatus === "final".
 * - A game counts toward "remaining" when gameStatus is "scheduled" or
 *   "in_progress" (a game in progress hasn't finished contributing to SOS yet).
 * - "postponed" / "canceled" games are excluded from both — they never
 *   happened and aren't going to.
 *
 * Home/away/neutral location is carried on every input row and preserved on
 * output via `location`, but does NOT currently affect the computed strength
 * value. Per the model architecture, raw opponent quality (opponentStrengthSOS)
 * is kept distinct from any future location-based adjustment
 * (scheduleDifficultyAdjusted) so home-field effects can be layered in later
 * without re-deriving opponent quality. applyLocationAdjustment below is a
 * no-op placeholder demonstrating that seam.
 */

import { generateRanks } from "./rank";
import { normalizeToDisplayScale } from "./normalize";
import { CFB_MODEL_CONFIG } from "./config";
import type {
  CfbGame,
  CfbGameStatus,
} from "@/data/cfb/types";
import type {
  CfbHomeFieldAdvantage,
  CfbRawSosForTeam,
  CfbSosDisplay,
  CfbSosGameInput,
} from "./types";

const PLAYED_STATUS: CfbGameStatus = "final";
const REMAINING_STATUSES: ReadonlySet<CfbGameStatus> = new Set(["scheduled", "in_progress"]);

/** Expands a CfbGame[] slate into one CfbSosGameInput row per team per game. */
export function toSosGameInputs(games: ReadonlyArray<CfbGame>): CfbSosGameInput[] {
  const rows: CfbSosGameInput[] = [];
  for (const game of games) {
    const awayLocation = game.neutralSite ? "neutral" : "away";
    const homeLocation = game.neutralSite ? "neutral" : "home";
    rows.push({
      gameId: game.id,
      teamId: game.awayTeamId,
      opponentTeamId: game.homeTeamId,
      location: awayLocation,
      date: game.date,
      gameStatus: game.gameStatus,
    });
    rows.push({
      gameId: game.id,
      teamId: game.homeTeamId,
      opponentTeamId: game.awayTeamId,
      location: homeLocation,
      date: game.date,
      gameStatus: game.gameStatus,
    });
  }
  return rows;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Computes raw (unnormalized) played/remaining opponent strength for one team.
 * Opponents missing from opponentPowerRatingLookup (unknown opponent, or a
 * known opponent with a null rating) are safely skipped rather than throwing
 * or treated as zero strength.
 */
export function computeRawSosForTeam(
  teamId: string,
  teamGames: ReadonlyArray<CfbSosGameInput>,
  opponentPowerRatingLookup: ReadonlyMap<string, number | null>,
): CfbRawSosForTeam {
  const played: number[] = [];
  const remaining: number[] = [];

  for (const row of teamGames) {
    if (row.teamId !== teamId) continue;
    const opponentRating = opponentPowerRatingLookup.get(row.opponentTeamId);
    const isKnownOpponent = opponentRating !== undefined && opponentRating !== null;

    if (row.gameStatus === PLAYED_STATUS) {
      if (isKnownOpponent) played.push(opponentRating);
    } else if (REMAINING_STATUSES.has(row.gameStatus)) {
      if (isKnownOpponent) remaining.push(opponentRating);
    }
  }

  return {
    teamId,
    playedOpponentStrength: average(played),
    remainingOpponentStrength: average(remaining),
    gamesPlayedCount: played.length,
    gamesRemainingCount: remaining.length,
  };
}

/** Computes raw SOS for every team referenced in the game rows. */
export function computeRawSosForAllTeams(
  teamIds: ReadonlyArray<string>,
  games: ReadonlyArray<CfbSosGameInput>,
  opponentPowerRatingLookup: ReadonlyMap<string, number | null>,
): CfbRawSosForTeam[] {
  const gamesByTeam = new Map<string, CfbSosGameInput[]>();
  for (const row of games) {
    const list = gamesByTeam.get(row.teamId) ?? [];
    list.push(row);
    gamesByTeam.set(row.teamId, list);
  }

  return teamIds.map((teamId) =>
    computeRawSosForTeam(teamId, gamesByTeam.get(teamId) ?? [], opponentPowerRatingLookup),
  );
}

/**
 * Normalizes raw SOS into display ratings + ranks. Higher rating = harder
 * schedule; rank #1 = hardest schedule (generateRanks direction "desc" gives
 * the highest raw average-opponent-strength value rank 1).
 */
export function computeSosDisplay(rawSos: ReadonlyArray<CfbRawSosForTeam>): CfbSosDisplay[] {
  const scale = CFB_MODEL_CONFIG.normalization.displayScale;

  const playedDisplay = normalizeToDisplayScale(
    rawSos.map((r) => r.playedOpponentStrength),
    scale,
  );
  const remainingDisplay = normalizeToDisplayScale(
    rawSos.map((r) => r.remainingOpponentStrength),
    scale,
  );

  const playedRanks = generateRanks(
    rawSos.map((r, i) => ({ teamId: r.teamId, value: playedDisplay[i] })),
    "desc",
  );
  const remainingRanks = generateRanks(
    rawSos.map((r, i) => ({ teamId: r.teamId, value: remainingDisplay[i] })),
    "desc",
  );

  return rawSos.map((r, i) => ({
    teamId: r.teamId,
    sosPlayedRating: playedDisplay[i],
    sosPlayedRank: playedRanks.get(r.teamId) ?? null,
    sosRemainingRating: remainingDisplay[i],
    sosRemainingRank: remainingRanks.get(r.teamId) ?? null,
  }));
}

/**
 * Placeholder seam for a future location-based adjustment layer
 * (scheduleDifficultyAdjusted). Currently a pass-through: without team-specific
 * home-field-advantage data, applying a uniform adjustment would just be
 * another undocumented magic number, which the model explicitly avoids.
 * Returns the input unchanged whenever hfa data is unavailable.
 */
export function applyLocationAdjustment(
  rawSos: CfbRawSosForTeam,
  _homeFieldAdvantage: CfbHomeFieldAdvantage | null,
): CfbRawSosForTeam {
  return rawSos;
}
