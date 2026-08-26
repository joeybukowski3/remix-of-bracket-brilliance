import { NFL_QB_PASSING_OUTCOME_SCHEMA_VERSION, type NflQbPassingOutcome } from "./types/qbPassing";
import type { NflYardageOutcomeRow } from "./historicalOutcomes";

export type NflQbSupplementalStats = {
  completions: number;
  passingTds: number;
  interceptions: number;
};

export function supplementalKey(playerId: string, season: number, week: number): string {
  return `${playerId}|${season}|${week}`;
}

/**
 * Builds one QB passing outcome row per team-game. Extends the Phase 3
 * primary-QB selection (same rule: most attempts wins, ties broken by
 * playerId) with passing yards (already in the Phase 1 outcome row) and
 * completions/TDs/INTs (not in the Phase 1 schema -- looked up from a
 * supplemental map built directly from the same stats_player_week source,
 * see generate-nfl-qb-passing-outcomes.ts). No row is dropped for
 * multi-QB status, a short game, or a poor performance -- every QB row
 * with attempts > 0 is counted.
 */
export function buildQbPassingOutcomes(
  yardageOutcomeRows: readonly NflYardageOutcomeRow[],
  teamDropbacksByGameTeam: ReadonlyMap<string, number>,
  supplementalByPlayerWeek: ReadonlyMap<string, NflQbSupplementalStats>,
): NflQbPassingOutcome[] {
  const byTeamGame = new Map<string, NflYardageOutcomeRow[]>();
  for (const row of yardageOutcomeRows) {
    if (row.context.position !== "QB") continue;
    if ((row.outcomes.passAttempts ?? 0) <= 0) continue;
    const key = `${row.context.season}|${row.context.week}|${row.context.team}`;
    const group = byTeamGame.get(key) ?? [];
    group.push(row);
    byTeamGame.set(key, group);
  }

  const results: NflQbPassingOutcome[] = [];
  for (const group of byTeamGame.values()) {
    const sorted = [...group].sort((a, b) => {
      const attemptsDiff = (b.outcomes.passAttempts ?? 0) - (a.outcomes.passAttempts ?? 0);
      if (attemptsDiff !== 0) return attemptsDiff;
      return a.context.playerId.localeCompare(b.context.playerId);
    });
    const primary = sorted[0];
    const backups = sorted.slice(1);
    const primaryAttempts = primary.outcomes.passAttempts ?? 0;
    const primaryYards = primary.outcomes.passingYards ?? 0;
    const backupAttempts = backups.reduce((s, r) => s + (r.outcomes.passAttempts ?? 0), 0);
    const backupYards = backups.reduce((s, r) => s + (r.outcomes.passingYards ?? 0), 0);
    const totalAttempts = primaryAttempts + backupAttempts;
    const qbCountThisWeek = sorted.length;

    const supplemental = supplementalByPlayerWeek.get(
      supplementalKey(primary.context.playerId, primary.context.season, primary.context.week),
    );
    if (!supplemental) {
      throw new Error(
        `Missing supplemental stats (completions/TDs/INTs) for ${primary.context.playerId} season ${primary.context.season} week ${primary.context.week}.`,
      );
    }

    const dropbackKey = primary.context.gameId ? `${primary.context.gameId}|${primary.context.team}` : null;
    const teamDropbacksContext = dropbackKey ? teamDropbacksByGameTeam.get(dropbackKey) ?? null : null;

    results.push({
      schemaVersion: NFL_QB_PASSING_OUTCOME_SCHEMA_VERSION,
      season: primary.context.season,
      week: primary.context.week,
      gameId: primary.context.gameId,
      team: primary.context.team,
      opponent: primary.context.opponent,
      primaryQbPlayerId: primary.context.playerId,
      primaryQbPlayerName: primary.context.playerName,
      primaryQbAttempts: primaryAttempts,
      primaryQbCompletions: supplemental.completions,
      primaryQbPassingYards: primaryYards,
      primaryQbYardsPerAttempt: primaryYards / primaryAttempts,
      primaryQbPassingTds: supplemental.passingTds,
      primaryQbInterceptions: supplemental.interceptions,
      backupQbAttempts: backupAttempts,
      backupQbPassingYards: backupYards,
      qbCountThisWeek,
      instabilityCategory: qbCountThisWeek > 1 ? "multiQbGame" : "singleQbGame",
      primaryQbAttemptShare: totalAttempts > 0 ? primaryAttempts / totalAttempts : null,
      teamDropbacksContext,
    });
  }

  return results.sort((a, b) => a.season - b.season || a.week - b.week || a.team.localeCompare(b.team));
}
