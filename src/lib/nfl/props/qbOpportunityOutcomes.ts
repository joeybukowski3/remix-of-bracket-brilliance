import { NFL_QB_OPPORTUNITY_OUTCOME_SCHEMA_VERSION, type NflQbOpportunityOutcome } from "./types/qbOpportunity";
import type { NflYardageOutcomeRow } from "./historicalOutcomes";
import type { NflTeamGamePlayVolumeRecord } from "./types/teamPregameFeatures";

/**
 * Builds one QB-opportunity outcome row per team-game from the Phase 1
 * player-week outcome rows (already leakage-safe ground truth; no new
 * source parsing here) plus the Phase 2 compact team-dropback cache for
 * context. Grouping key is `season|week|team`.
 *
 * Primary QB = the QB row with the most pass attempts that team-week; ties
 * break on `playerId` string order for determinism. A team-week with two or
 * more QBs recording at least one attempt is flagged `multiQbGame` -- this
 * is a real, data-grounded signal (not inferred from snaps), available for
 * every season without a new join.
 */
export function buildQbOpportunityOutcomes(
  yardageOutcomeRows: readonly NflYardageOutcomeRow[],
  teamDropbacksByGameTeam: ReadonlyMap<string, number>,
): NflQbOpportunityOutcome[] {
  const byTeamGame = new Map<string, NflYardageOutcomeRow[]>();
  for (const row of yardageOutcomeRows) {
    if (row.context.position !== "QB") continue;
    if ((row.outcomes.passAttempts ?? 0) <= 0) continue;
    const key = `${row.context.season}|${row.context.week}|${row.context.team}`;
    const group = byTeamGame.get(key) ?? [];
    group.push(row);
    byTeamGame.set(key, group);
  }

  const results: NflQbOpportunityOutcome[] = [];
  for (const group of byTeamGame.values()) {
    const sorted = [...group].sort((a, b) => {
      const attemptsDiff = (b.outcomes.passAttempts ?? 0) - (a.outcomes.passAttempts ?? 0);
      if (attemptsDiff !== 0) return attemptsDiff;
      return a.context.playerId.localeCompare(b.context.playerId);
    });
    const primary = sorted[0];
    const backups = sorted.slice(1);
    const primaryAttempts = primary.outcomes.passAttempts ?? 0;
    const backupAttempts = backups.reduce((sum, row) => sum + (row.outcomes.passAttempts ?? 0), 0);
    const totalAttempts = primaryAttempts + backupAttempts;
    const qbCountThisWeek = sorted.length;

    const dropbackKey = primary.context.gameId ? `${primary.context.gameId}|${primary.context.team}` : null;
    const teamDropbacksContext = dropbackKey ? teamDropbacksByGameTeam.get(dropbackKey) ?? null : null;

    results.push({
      schemaVersion: NFL_QB_OPPORTUNITY_OUTCOME_SCHEMA_VERSION,
      season: primary.context.season,
      week: primary.context.week,
      gameId: primary.context.gameId,
      team: primary.context.team,
      opponent: primary.context.opponent,
      primaryQbPlayerId: primary.context.playerId,
      primaryQbPlayerName: primary.context.playerName,
      primaryQbAttempts: primaryAttempts,
      backupQbAttempts: backupAttempts,
      qbCountThisWeek,
      instabilityCategory: qbCountThisWeek > 1 ? "multiQbGame" : "singleQbGame",
      primaryQbAttemptShare: totalAttempts > 0 ? primaryAttempts / totalAttempts : null,
      teamDropbacksContext,
    });
  }

  return results.sort(
    (a, b) => a.season - b.season || a.week - b.week || a.team.localeCompare(b.team),
  );
}

/** Builds the `gameId|team -> passPlays (team dropbacks)` lookup consumed above. */
export function indexTeamDropbacks(records: readonly NflTeamGamePlayVolumeRecord[]): Map<string, number> {
  const index = new Map<string, number>();
  for (const record of records) index.set(`${record.gameId}|${record.team}`, record.passPlays);
  return index;
}
