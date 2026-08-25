import { NFL_RUSHING_OUTCOME_SCHEMA_VERSION, type NflRushingOutcome, type NflRushingPosition } from "./types/rushingOutcome";
import { gameJoinKey, type NflGameJoinRecord, type NflYardageOutcomeRow } from "./historicalOutcomes";
import type { NflPlayerGameUniverseRow } from "./types/playerGameUniverse";

export const RUSHING_ELIGIBLE_POSITIONS: readonly NflRushingPosition[] = ["QB", "RB", "WR", "TE"];

/** Minimum prior-SEASON total carries to count as "had a real rushing role" when no current-season game exists yet (Week 1-3 early-season eligibility). Chosen as a low bar excluding one-off trick plays, not tuned against any holdout. */
export const PRIOR_SEASON_ELIGIBILITY_CARRY_THRESHOLD = 20;

export type NflPlayerRushingGameLogEntry = {
  playerId: string;
  season: number;
  week: number;
  team: string;
  carries: number;
  gameDateUtc: string;
};

export function buildPlayerRushingGameLog(
  yardageOutcomeRows: readonly NflYardageOutcomeRow[],
  gameJoinIndex: ReadonlyMap<string, NflGameJoinRecord>,
): NflPlayerRushingGameLogEntry[] {
  const log: NflPlayerRushingGameLogEntry[] = [];
  for (const row of yardageOutcomeRows) {
    const carries = row.outcomes.carries ?? 0;
    if (carries <= 0) continue;
    if (!RUSHING_ELIGIBLE_POSITIONS.includes(row.context.position as NflRushingPosition)) continue;
    const join = gameJoinIndex.get(gameJoinKey(row.context.season, row.context.week, row.context.team));
    if (!join) continue; // schedule-unresolved rows cannot be chronologically ordered; excluded from the eligibility log only
    log.push({ playerId: row.context.playerId, season: row.context.season, week: row.context.week, team: row.context.team, carries, gameDateUtc: join.gameDateUtc });
  }
  return log;
}

/**
 * Pregame-safe eligibility: true if the player has at least one game with
 * carries > 0 strictly before the target date this season, OR (for early
 * weeks with no current-season data yet) at least
 * `PRIOR_SEASON_ELIGIBILITY_CARRY_THRESHOLD` total carries the entire
 * prior season. Never reads the target game's own carries.
 */
export function isPregameEligible(
  log: readonly NflPlayerRushingGameLogEntry[],
  playerId: string,
  season: number,
  beforeDateUtc: string,
): boolean {
  const priorThisSeason = log.some((e) => e.playerId === playerId && e.season === season && e.gameDateUtc < beforeDateUtc);
  if (priorThisSeason) return true;
  const priorSeasonTotal = log
    .filter((e) => e.playerId === playerId && e.season === season - 1)
    .reduce((s, e) => s + e.carries, 0);
  return priorSeasonTotal >= PRIOR_SEASON_ELIGIBILITY_CARRY_THRESHOLD;
}

/**
 * Builds one rushing outcome row per (player, game) with carries > 0.
 * `pregameEligible` is computed from the SAME log passed in, using only
 * games strictly before the target game's own date.
 */
export function buildRushingOutcomes(
  yardageOutcomeRows: readonly NflYardageOutcomeRow[],
  teamRushAttemptsByGameTeam: ReadonlyMap<string, number>,
  gameJoinIndex: ReadonlyMap<string, NflGameJoinRecord>,
  rushingGameLog: readonly NflPlayerRushingGameLogEntry[],
): NflRushingOutcome[] {
  const results: NflRushingOutcome[] = [];
  for (const row of yardageOutcomeRows) {
    const carries = row.outcomes.carries ?? 0;
    if (carries <= 0) continue;
    const position = row.context.position as NflRushingPosition;
    if (!RUSHING_ELIGIBLE_POSITIONS.includes(position)) continue;

    const rushingYards = row.outcomes.rushingYards ?? 0;
    const join = gameJoinIndex.get(gameJoinKey(row.context.season, row.context.week, row.context.team));
    const dropbackKey = row.context.gameId ? `${row.context.gameId}|${row.context.team}` : null;
    const teamRushAttemptsContext = dropbackKey ? teamRushAttemptsByGameTeam.get(dropbackKey) ?? null : null;

    results.push({
      schemaVersion: NFL_RUSHING_OUTCOME_SCHEMA_VERSION,
      season: row.context.season, week: row.context.week, gameId: row.context.gameId,
      playerId: row.context.playerId, playerName: row.context.playerName,
      team: row.context.team, opponent: row.context.opponent, position,
      carries, rushingYards, yardsPerCarry: rushingYards / carries,
      teamRushAttemptsContext,
      carryShare: teamRushAttemptsContext != null && teamRushAttemptsContext > 0 ? carries / teamRushAttemptsContext : null,
      pregameEligible: join ? isPregameEligible(rushingGameLog, row.context.playerId, row.context.season, join.gameDateUtc) : false,
    });
  }
  return results.sort(
    (a, b) => a.season - b.season || a.week - b.week || a.team.localeCompare(b.team) || a.playerId.localeCompare(b.playerId),
  );
}

/**
 * Phase 5.5 (5R): builds rushing outcome rows from the canonical player-game
 * universe's `rushingEligiblePregame` rows, INCLUDING true zero-carry games
 * -- unlike `buildRushingOutcomes`, which only emits a row when the source
 * itself recorded `carries > 0`. `yardsPerCarry` is defined as 0 for a
 * zero-carry row (no attempts to average; a documented convention, not a
 * division result). Every row here already carries `pregameEligible: true`
 * by construction (the universe's own eligibility field is the filter).
 */
export function buildRushingOutcomesFromUniverse(
  universeRows: readonly NflPlayerGameUniverseRow[],
  teamRushAttemptsByGameTeam: ReadonlyMap<string, number>,
): NflRushingOutcome[] {
  const results: NflRushingOutcome[] = [];
  for (const row of universeRows) {
    if (!row.eligibility.rushingEligiblePregame) continue;
    if (row.outcomes.carries == null || row.outcomes.rushingYards == null) continue; // missing, not zero -- excluded, never coerced
    const carries = row.outcomes.carries;
    const rushingYards = row.outcomes.rushingYards;
    const dropbackKey = row.gameId ? `${row.gameId}|${row.team}` : null;
    const teamRushAttemptsContext = dropbackKey ? teamRushAttemptsByGameTeam.get(dropbackKey) ?? null : null;
    results.push({
      schemaVersion: NFL_RUSHING_OUTCOME_SCHEMA_VERSION,
      season: row.season, week: row.week, gameId: row.gameId,
      playerId: row.playerId, playerName: row.playerName,
      team: row.team, opponent: row.opponent ?? "", position: row.position as NflRushingPosition,
      carries, rushingYards, yardsPerCarry: carries > 0 ? rushingYards / carries : 0,
      teamRushAttemptsContext,
      carryShare: teamRushAttemptsContext != null && teamRushAttemptsContext > 0 ? carries / teamRushAttemptsContext : (carries === 0 ? 0 : null),
      pregameEligible: true,
    });
  }
  return results.sort(
    (a, b) => a.season - b.season || a.week - b.week || a.team.localeCompare(b.team) || a.playerId.localeCompare(b.playerId),
  );
}
