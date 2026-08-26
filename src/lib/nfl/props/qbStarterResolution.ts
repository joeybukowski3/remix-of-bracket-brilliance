/**
 * Phase 9 / 9.2: current-week passing-starter resolution.
 *
 * The historical passing feature/outcome pipeline (`qbPassingOutcomes.ts`,
 * `qbPassingFeatures.ts`) always starts from a KNOWN primary QB -- the
 * player who recorded the most attempts in that already-played game. A
 * future/current week has no attempts yet, so "who gets a passing
 * projection this week" cannot be read off a box score; it must be
 * inferred pregame.
 *
 * Phase 9.2 resolution hierarchy:
 * 1. **Sourced depth chart**: the ACT QB holding the nflverse/ESPN depth
 *    chart's rank-1 slot for this team (`currentWeekDepthChart.ts`). This is
 *    now the strongest available pregame evidence -- unlike
 *    `weekly_rosters`' `depth_chart_position` (confirmed, by direct
 *    inspection, to equal the position group for every QB -- no ordinal
 *    information), the depth-chart source carries a real ordinal rank. If
 *    the source lists more than one player at rank 1 for the same team (a
 *    data quirk, not expected but never assumed away), that is treated as
 *    AMBIGUOUS, never silently resolved by picking one -- falls through to
 *    step 2 with `roleUncertain: true`.
 * 2. **Historical rolling-attempts heuristic** (Phase 9 original): the ACT
 *    QB with the highest rolling attempts (seasonPrior -> priorSeason
 *    coalesce, the same coalesce Baseline B/D use).
 * 3. **Deterministic roster fallback**: first ACT QB by playerId, flagged
 *    `starterUncertain`.
 *
 * Every path emits exactly one row per team with >=1 ACT QB. Which path won
 * is always recorded (`resolution`), never hidden.
 */
import type { NflCurrentWeekCandidate } from "./currentWeekRosterUniverse";
import type { NflQbStatGameLogEntry } from "./qbPassingFeatures";
import { depthRankOneCandidates, fallbackRoleEvidence, sourcedRoleEvidence, type NflDepthChartIndex, type NflRoleEvidence } from "./currentWeekDepthChart";

export type NflQbStarterResolution = {
  candidate: NflCurrentWeekCandidate;
  rollingAttempts: number | null;
  gamesStartedPriorThisSeason: number;
  hasPriorSeasonStarts: boolean;
  resolution: "sourcedDepthChart" | "rosterOnlyCandidate" | "rollingAttemptsLeader" | "noCompetingQb";
  starterUncertain: boolean;
  multiQbRoleUncertain: boolean;
  sourceAmbiguous: boolean;
  roleEvidence: NflRoleEvidence;
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
 * roster pool. `depthChartIndex` is optional (null when the source is
 * unavailable/stale -- see `currentWeekGenerator.ts`'s failover); when null,
 * resolution falls straight to the historical/roster heuristic (steps 2-3),
 * exactly reproducing pre-9.2 behavior.
 */
export function resolvePassingStarters(
  candidates: readonly NflCurrentWeekCandidate[],
  qbStatGameLog: readonly NflQbStatGameLogEntry[],
  depthChartIndex: NflDepthChartIndex | null,
): NflQbStarterResolution[] {
  const byTeam = new Map<string, NflCurrentWeekCandidate[]>();
  for (const c of candidates) {
    if (c.position !== "QB") continue;
    const list = byTeam.get(c.team) ?? [];
    list.push(c);
    byTeam.set(c.team, list);
  }

  const results: NflQbStarterResolution[] = [];
  for (const [team, qbs] of byTeam) {
    const ranked = qbs
      .map((c) => ({ candidate: c, ...rollingAttempts(qbStatGameLog, c.playerId, c.season, c.gameDateUtc) }))
      .sort((a, b) => (b.attempts ?? -1) - (a.attempts ?? -1) || a.candidate.playerId.localeCompare(b.candidate.playerId));
    if (ranked.length === 0) continue;

    // Step 1: sourced depth chart, restricted to ACT candidates on this team's own roster.
    const actPlayerIds = new Set(qbs.map((c) => c.playerId));
    const sourcedCandidates = depthChartIndex
      ? depthRankOneCandidates(depthChartIndex, team, "QB").filter((e) => actPlayerIds.has(e.playerId))
      : [];
    if (sourcedCandidates.length === 1) {
      const winner = qbs.find((c) => c.playerId === sourcedCandidates[0].playerId)!;
      const rolling = rollingAttempts(qbStatGameLog, winner.playerId, winner.season, winner.gameDateUtc);
      const meaningfulCompetitors = ranked.filter((r) => r.candidate.playerId !== winner.playerId && (r.attempts ?? 0) >= 5);
      results.push({
        candidate: winner, rollingAttempts: rolling.attempts,
        gamesStartedPriorThisSeason: rolling.gamesStartedPriorThisSeason, hasPriorSeasonStarts: rolling.hasPriorSeasonStarts,
        resolution: "sourcedDepthChart", starterUncertain: false, multiQbRoleUncertain: meaningfulCompetitors.length > 0,
        sourceAmbiguous: false, roleEvidence: sourcedRoleEvidence(sourcedCandidates[0]),
      });
      continue;
    }
    const sourceAmbiguous = sourcedCandidates.length > 1;

    // Steps 2-3: historical rolling-attempts heuristic, deterministic roster fallback.
    const leader = ranked[0];
    const meaningfulCompetitors = ranked.slice(1).filter((r) => (r.attempts ?? 0) >= 5);
    const resolution = ranked.length === 1 ? "noCompetingQb" : leader.attempts != null ? "rollingAttemptsLeader" : "rosterOnlyCandidate";
    const roleEvidence = sourceAmbiguous
      ? fallbackRoleEvidence("unavailable", `Depth chart source listed ${sourcedCandidates.length} players at QB rank 1 for ${team} -- ambiguous, fell back to rolling-attempts heuristic.`)
      : depthChartIndex == null
        ? fallbackRoleEvidence("unavailable", "Depth chart source unavailable this run -- fell back to rolling-attempts heuristic.")
        : fallbackRoleEvidence("historicalVolume", `No depth chart rank-1 entry found for ${team} QB -- used rolling-attempts heuristic (${resolution}).`);

    results.push({
      candidate: leader.candidate, rollingAttempts: leader.attempts,
      gamesStartedPriorThisSeason: leader.gamesStartedPriorThisSeason, hasPriorSeasonStarts: leader.hasPriorSeasonStarts,
      resolution, starterUncertain: leader.attempts == null || sourceAmbiguous,
      multiQbRoleUncertain: meaningfulCompetitors.length > 0, sourceAmbiguous, roleEvidence,
    });
  }
  return results;
}
