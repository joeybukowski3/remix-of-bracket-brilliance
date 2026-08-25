/**
 * Phase 9: current-week passing-starter resolution.
 *
 * The historical passing feature/outcome pipeline (`qbPassingOutcomes.ts`,
 * `qbPassingFeatures.ts`) always starts from a KNOWN primary QB -- the
 * player who recorded the most attempts in that already-played game. A
 * future/current week has no attempts yet, so "who gets a passing
 * projection this week" cannot be read off a box score; it must be
 * inferred pregame. No depth-chart-order, beat-writer, or injury-report
 * starter designation exists anywhere in this repository's committed data
 * (`weekly_rosters`' `depth_chart_position` is confirmed, by direct
 * inspection, to equal the player's position group for every QB on a roster
 * -- e.g. three ACT quarterbacks on one team can all read
 * `depth_chart_position: "QB"` -- so it carries no ordinal depth
 * information and cannot be used to pick a starter).
 *
 * This module implements the one defensible, deterministic, fully
 * pregame-observable heuristic available: for each team, the ACT QB with
 * the highest rolling attempts (seasonPrior -> priorSeason coalesce, the
 * same coalesce Baseline B/D use) is treated as the passing-projection
 * candidate. Ties or an entirely QB-history-free roster are flagged, never
 * silently resolved. This is intentionally a heuristic, not a certainty --
 * see `starterUncertain`/`multiQbRoleUncertain` hard-case flags in the
 * output schema.
 */
import type { NflCurrentWeekCandidate } from "./currentWeekRosterUniverse";
import type { NflQbStatGameLogEntry } from "./qbPassingFeatures";

export type NflQbStarterResolution = {
  candidate: NflCurrentWeekCandidate;
  rollingAttempts: number | null;
  gamesStartedPriorThisSeason: number;
  hasPriorSeasonStarts: boolean;
  resolution: "rosterOnlyCandidate" | "rollingAttemptsLeader" | "noCompetingQb";
  starterUncertain: boolean;
  multiQbRoleUncertain: boolean;
};

function rollingAttempts(
  qbStatGameLog: readonly NflQbStatGameLogEntry[],
  playerId: string,
  season: number,
  beforeDateUtc: string,
): { attempts: number | null; gamesStartedPriorThisSeason: number; hasPriorSeasonStarts: boolean } {
  const priorThisSeason = qbStatGameLog
    .filter((g) => g.playerId === playerId && g.season === season && g.gameDateUtc < beforeDateUtc)
    .sort((a, b) => a.gameDateUtc.localeCompare(b.gameDateUtc));
  const priorSeasonGames = qbStatGameLog.filter((g) => g.playerId === playerId && g.season === season - 1);
  const seasonPrior = priorThisSeason.length > 0
    ? priorThisSeason.reduce((s, g) => s + g.attempts, 0) / priorThisSeason.length
    : null;
  const priorSeason = priorSeasonGames.length > 0
    ? priorSeasonGames.reduce((s, g) => s + g.attempts, 0) / priorSeasonGames.length
    : null;
  return {
    attempts: seasonPrior ?? priorSeason,
    gamesStartedPriorThisSeason: priorThisSeason.length,
    hasPriorSeasonStarts: priorSeasonGames.length > 0,
  };
}

/**
 * Resolves one passing-projection candidate per team from the current-week
 * roster pool. A team with zero ACT/passing-eligible QBs produces no row
 * (not a failure -- e.g. a team could theoretically have every QB on
 * injured reserve, though `weekly_rosters` "ACT" already excludes that).
 * A team with 2+ ACT QBs and no rolling-attempts history for any of them
 * emits its first roster QB (by playerId, deterministic tie-break) flagged
 * `starterUncertain`. A team with 2+ ACT QBs where more than one has
 * meaningful rolling attempts (>= 5/game) is flagged `multiQbRoleUncertain`
 * even though only the leader gets a projection row -- production should
 * treat that projection as materially less reliable.
 */
export function resolvePassingStarters(
  candidates: readonly NflCurrentWeekCandidate[],
  qbStatGameLog: readonly NflQbStatGameLogEntry[],
): NflQbStarterResolution[] {
  const byTeam = new Map<string, NflCurrentWeekCandidate[]>();
  for (const c of candidates) {
    if (c.position !== "QB") continue;
    const list = byTeam.get(c.team) ?? [];
    list.push(c);
    byTeam.set(c.team, list);
  }

  const results: NflQbStarterResolution[] = [];
  for (const [, qbs] of byTeam) {
    const ranked = qbs
      .map((c) => ({ candidate: c, ...rollingAttempts(qbStatGameLog, c.playerId, c.season, c.gameDateUtc) }))
      .sort((a, b) => (b.attempts ?? -1) - (a.attempts ?? -1) || a.candidate.playerId.localeCompare(b.candidate.playerId));

    if (ranked.length === 0) continue;
    const leader = ranked[0];
    const meaningfulCompetitors = ranked.slice(1).filter((r) => (r.attempts ?? 0) >= 5);

    results.push({
      candidate: leader.candidate,
      rollingAttempts: leader.attempts,
      gamesStartedPriorThisSeason: leader.gamesStartedPriorThisSeason,
      hasPriorSeasonStarts: leader.hasPriorSeasonStarts,
      resolution: ranked.length === 1 ? "noCompetingQb" : leader.attempts != null ? "rollingAttemptsLeader" : "rosterOnlyCandidate",
      starterUncertain: leader.attempts == null,
      multiQbRoleUncertain: meaningfulCompetitors.length > 0,
    });
  }
  return results;
}
