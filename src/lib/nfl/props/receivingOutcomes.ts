import { NFL_RECEIVING_OUTCOME_SCHEMA_VERSION, RECEIVING_ELIGIBLE_POSITIONS, type NflReceivingOutcome, type NflReceivingPosition } from "./types/receivingOutcome";
import type { NflPlayerGameUniverseRow } from "./types/playerGameUniverse";

/**
 * Builds receiving outcome rows from the canonical player-game universe's
 * `receivingEligiblePregame` rows, INCLUDING true zero-target games.
 * QB is excluded -- see types/receivingOutcome.ts header for why.
 */
export function buildReceivingOutcomesFromUniverse(
  universeRows: readonly NflPlayerGameUniverseRow[],
  teamPassAttemptsByGameTeam: ReadonlyMap<string, number>,
): NflReceivingOutcome[] {
  const results: NflReceivingOutcome[] = [];
  for (const row of universeRows) {
    if (!row.eligibility.receivingEligiblePregame) continue;
    if (!RECEIVING_ELIGIBLE_POSITIONS.includes(row.position as NflReceivingPosition)) continue;
    if (row.outcomes.targets == null || row.outcomes.receptions == null || row.outcomes.receivingYards == null) continue; // missing, never coerced

    const targets = row.outcomes.targets;
    const receptions = row.outcomes.receptions;
    const receivingYards = row.outcomes.receivingYards;
    const key = row.gameId ? `${row.gameId}|${row.team}` : null;
    const teamPassAttemptsContext = key ? teamPassAttemptsByGameTeam.get(key) ?? null : null;

    results.push({
      schemaVersion: NFL_RECEIVING_OUTCOME_SCHEMA_VERSION,
      season: row.season, week: row.week, gameId: row.gameId,
      playerId: row.playerId, playerName: row.playerName, team: row.team, opponent: row.opponent ?? "",
      position: row.position as NflReceivingPosition,
      targets, receptions, receivingYards,
      receptionsPerTarget: targets > 0 ? receptions / targets : null,
      yardsPerReception: receptions > 0 ? receivingYards / receptions : null,
      yardsPerTarget: targets > 0 ? receivingYards / targets : 0,
      teamPassAttemptsContext,
      targetShare: teamPassAttemptsContext != null && teamPassAttemptsContext > 0 ? targets / teamPassAttemptsContext : (targets === 0 ? 0 : null),
      zeroTargetFlag: targets === 0,
      membershipSource: row.membershipSource,
    });
  }
  return results.sort(
    (a, b) => a.season - b.season || a.week - b.week || a.team.localeCompare(b.team) || a.playerId.localeCompare(b.playerId),
  );
}
