// CFB Model V2 — production rating-input contract (Phase 10 §4, WU2 §4/§5).
//
// Reuses V1's existing, already-tested pure CFBD normalization functions
// (src/lib/cfb/pipeline/normalizeCfbd.ts) for team-mapping/game-shape
// parsing ONLY — nothing here modifies pipeline/*.ts, and this module is
// read-only with respect to V1 (architectureGuard.test.ts's V1-does-not-
// import-V2 guard is the one-directional counterpart).

import type { CfbdGame, CfbdGameTeamStats, CfbdReturningProduction, CfbdTalent, CfbdTeam } from "../../pipeline/types";
import { normalizeCfbdGamePerformance, normalizeCfbdGames, resolveCfbdFbsTeams, type CfbResolvedCfbdTeam } from "../../pipeline/normalizeCfbd";
import type { CfbNormalizedHistoricalGame, CfbTeamGamePerformance } from "../../pipeline/types";

export type { CfbdGame, CfbdGameTeamStats, CfbdReturningProduction, CfbdTalent, CfbdTeam, CfbResolvedCfbdTeam };

/**
 * One team's side of one game, prepared for opponent-adjustment input.
 * Mirrors research's GameObservation shape (src/lib/cfb/research/phase2/types.ts)
 * without importing it — production owns its own parallel type (§2/§15).
 */
export type CfbV2Observation = {
  gameId: string;
  teamId: string;
  opponentTeamId: string;
  teamClassification: string | null;
  opponentClassification: string | null;
  isHome: boolean;
  isNeutral: boolean;
  offenseValue: number | null;
  defenseAllowedValue: number | null;
  /** gameWeighted aggregation (§5) — always 1. No play-level weighting, no garbage-time filtering. */
  weight: number;
};

export type CfbV2MetricName = "ypp" | "ppp";

function isFbs(classification: string | null): boolean {
  return (classification ?? "").toLowerCase() === "fbs";
}

/**
 * Team-game PPP (points per play) — points scored divided by offensive
 * plays run, the same "team-game" granularity as YPP. Never reinterpreted:
 * this is the plain points/plays ratio, matching the validated Phase 9
 * definition (research/derived team-game-metrics ppp field, computed the
 * same way — points scored over offensive snap count for that game).
 */
function ppp(points: number | null, plays: number | null): number | null {
  if (points === null || plays === null || plays <= 0) return null;
  return points / plays;
}

/**
 * Builds one CfbV2Observation per team-side per game for a given metric,
 * from already-normalized team-game performance rows. No garbage-time
 * filtering is applied (§5) — production has no play-by-play garbage-time
 * signal to filter on in the first place, so "NONE" policy is automatically
 * satisfied by construction, not by an explicit no-op filter step.
 */
export function buildV2Observations(
  performances: readonly CfbTeamGamePerformance[],
  games: readonly CfbNormalizedHistoricalGame[],
  metric: CfbV2MetricName,
): CfbV2Observation[] {
  const gameById = new Map(games.map((g) => [g.gameId, g]));
  const byGameTeam = new Map<string, CfbTeamGamePerformance>();
  for (const row of performances) byGameTeam.set(`${row.gameId}:${row.teamId}`, row);

  const observations: CfbV2Observation[] = [];
  for (const row of performances) {
    if (!row.opponentTeamId) continue;
    const opponentRow = byGameTeam.get(`${row.gameId}:${row.opponentTeamId}`);
    if (!opponentRow) continue; // opponent side missing — skip rather than fabricate
    const game = gameById.get(row.gameId);
    if (!game) continue;

    const offenseValue = metric === "ypp" ? row.yardsPerPlay : ppp(row.points, row.plays);
    const defenseAllowedValue = metric === "ypp" ? row.yardsPerPlayAllowed : ppp(opponentRow.points, opponentRow.plays);

    observations.push({
      gameId: row.gameId,
      teamId: row.teamId,
      opponentTeamId: row.opponentTeamId,
      teamClassification: row.teamClassification,
      opponentClassification: row.opponentClassification,
      isHome: game.homeTeamId === row.teamId,
      isNeutral: game.neutralSite,
      offenseValue,
      defenseAllowedValue,
      weight: 1,
    });
  }
  return observations;
}

export function isFbsVsFbsObservation(row: CfbV2Observation): boolean {
  return isFbs(row.teamClassification) && isFbs(row.opponentClassification);
}

/**
 * Normalizes raw CFBD games + resolves FBS team identity using V1's own
 * mapping (§1 — "current team mappings"). Re-exported here so callers
 * (scripts, builders) never need to reach into pipeline/*.ts directly.
 */
export function resolveTeamsAndGames(
  teams: readonly CfbdTeam[],
  games: readonly CfbdGame[],
): { mappings: CfbResolvedCfbdTeam[]; normalizedGames: CfbNormalizedHistoricalGame[] } {
  const mappings = resolveCfbdFbsTeams(teams);
  const normalizedGames = normalizeCfbdGames(games, mappings);
  return { mappings, normalizedGames };
}

export function buildTeamGamePerformances(
  teamGameStats: readonly CfbdGameTeamStats[],
  normalizedGames: readonly CfbNormalizedHistoricalGame[],
  mappings: readonly CfbResolvedCfbdTeam[],
): CfbTeamGamePerformance[] {
  return normalizeCfbdGamePerformance(teamGameStats, normalizedGames, mappings);
}
