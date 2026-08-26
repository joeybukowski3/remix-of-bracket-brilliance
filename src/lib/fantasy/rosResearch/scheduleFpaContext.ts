/**
 * ROS projection authority -- Phase 2.4 remaining-schedule opponent/FPA
 * context (shadow research input). Aggregates the approved 2025
 * points-allowed-by-position source (`pointsAllowed2025.ts` /
 * `data/fantasy/points-allowed-2025.csv`) over every opponent on a team's
 * full remaining 2026 schedule. Never fabricates a value for a bye week or an
 * opponent missing from the FPA source -- those games are simply excluded
 * from the average and counted in coverage.
 *
 * FPA direction follows the source exactly: a HIGHER average points-allowed
 * value across the remaining slate is a MORE favourable remaining schedule
 * for that position (the source's rank 1 = allowed the most = best matchup).
 */
import type { FantasyPosition } from "@/lib/fantasy/rankings";
import { normalizeNflTeamAbbr } from "@/lib/fantasy/weekly/identity";

export const ROS_SCHEDULE_FPA_CONTEXT_SCHEMA_VERSION = "ros-schedule-fpa-context-v1" as const;

export type RemainingScheduleGame = { week: number; opponent: string };

export type FpaLookup = ReadonlyMap<string, Record<FantasyPosition, { rank: number; pointsAllowed: number }>>;

export type TeamPositionFpaContext = {
  team: string;
  position: FantasyPosition;
  remainingGames: number;
  opponentsWithFpaData: number;
  averagePointsAllowed: number | null;
  games: Array<{ week: number; opponent: string; pointsAllowed: number | null }>;
};

export type ScheduleFpaContextResult = {
  teams: TeamPositionFpaContext[];
  counts: {
    totalTeams: number;
    totalTeamPositionRows: number;
    totalRemainingGames: number;
    totalGamesWithFpaData: number;
    overallFraction: number;
    fpaSourceSeason: number;
  };
};

const POSITIONS: readonly FantasyPosition[] = ["QB", "RB", "WR", "TE"];

export function buildScheduleFpaContext(
  scheduleByTeam: ReadonlyMap<string, readonly RemainingScheduleGame[]>,
  fpaByTeam: FpaLookup,
  fpaSourceSeason: number,
): ScheduleFpaContextResult {
  const teams: TeamPositionFpaContext[] = [];

  for (const [rawTeam, remainingGames] of [...scheduleByTeam.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const team = normalizeNflTeamAbbr(rawTeam) ?? rawTeam;
    for (const position of POSITIONS) {
      const games = remainingGames.map((game) => {
        const opponent = normalizeNflTeamAbbr(game.opponent) ?? game.opponent;
        const fpa = fpaByTeam.get(opponent)?.[position] ?? null;
        return { week: game.week, opponent, pointsAllowed: fpa ? fpa.pointsAllowed : null };
      }).sort((a, b) => a.week - b.week);

      const withData = games.filter((game) => game.pointsAllowed !== null);
      teams.push({
        team,
        position,
        remainingGames: games.length,
        opponentsWithFpaData: withData.length,
        averagePointsAllowed: withData.length
          ? withData.reduce((sum, game) => sum + (game.pointsAllowed ?? 0), 0) / withData.length
          : null,
        games,
      });
    }
  }

  const totalRemainingGames = teams.reduce((sum, row) => sum + row.remainingGames, 0);
  const totalGamesWithFpaData = teams.reduce((sum, row) => sum + row.opponentsWithFpaData, 0);

  return {
    teams,
    counts: {
      totalTeams: scheduleByTeam.size,
      totalTeamPositionRows: teams.length,
      totalRemainingGames,
      totalGamesWithFpaData,
      overallFraction: totalRemainingGames ? totalGamesWithFpaData / totalRemainingGames : 0,
      fpaSourceSeason,
    },
  };
}
