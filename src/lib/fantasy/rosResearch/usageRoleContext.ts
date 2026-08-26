/**
 * ROS projection authority -- Phase 2.2 usage/role context (shadow research
 * input). Reuses the already-approved weekly usage fields
 * (`weekly/usage.ts` `WeeklyFantasyUsage`, carried on each row of the
 * player-week history artifact) and aggregates them to season-level
 * averages. Fields the current nflverse source cannot supply
 * (routes, routeParticipation, redZoneTouches, goalLineTouches,
 * redZoneTargets) stay explicitly null/missing rather than estimated.
 */
import type { FantasyPosition } from "@/lib/fantasy/rankings";

export const ROS_USAGE_ROLE_CONTEXT_SCHEMA_VERSION = "ros-usage-role-context-v1" as const;

export type UsageRoleSourceRow = {
  season: number;
  playerId: string;
  playerName: string;
  position: FantasyPosition;
  usage: {
    offensiveSnaps: number | null;
    snapShare: number | null;
    targets: number | null;
    receptions: number | null;
    rushAttempts: number | null;
    targetShare: number | null;
    airYardsShare: number | null;
  };
};

const AVERAGED_FIELDS = ["offensiveSnaps", "snapShare", "targets", "receptions", "rushAttempts", "targetShare", "airYardsShare"] as const;
type AveragedField = typeof AVERAGED_FIELDS[number];

export type SeasonUsageAverage = {
  season: number;
  gamesWithStats: number;
} & Record<AveragedField, { average: number | null; sampleSize: number }>;

export type PlayerUsageRoleContext = {
  playerId: string;
  playerName: string;
  position: FantasyPosition;
  seasons: SeasonUsageAverage[];
  unavailableFields: readonly string[];
};

export type UsageRoleContextResult = {
  players: PlayerUsageRoleContext[];
  counts: { totalPlayers: number; playersWithAnyUsage: number; totalGameRows: number; seasonsCovered: number[] };
};

const UNAVAILABLE_FIELDS = ["routes", "routeParticipation", "redZoneTouches", "goalLineTouches", "redZoneTargets"] as const;

function average(values: readonly (number | null)[]): { average: number | null; sampleSize: number } {
  const present = values.filter((value): value is number => value != null);
  if (!present.length) return { average: null, sampleSize: 0 };
  return { average: present.reduce((sum, value) => sum + value, 0) / present.length, sampleSize: present.length };
}

export function buildUsageRoleContext(
  rows: readonly UsageRoleSourceRow[],
  universe: readonly { playerId: string; playerName: string; position: FantasyPosition }[],
): UsageRoleContextResult {
  const bySeasonPlayer = new Map<string, UsageRoleSourceRow[]>();
  const seasonsCovered = new Set<number>();
  for (const row of rows) {
    seasonsCovered.add(row.season);
    const key = `${row.playerId}|${row.season}`;
    bySeasonPlayer.set(key, [...(bySeasonPlayer.get(key) ?? []), row]);
  }

  const players: PlayerUsageRoleContext[] = universe.map((player) => {
    const seasons: SeasonUsageAverage[] = [...seasonsCovered].sort((a, b) => a - b).flatMap((season) => {
      const seasonRows = bySeasonPlayer.get(`${player.playerId}|${season}`);
      if (!seasonRows || !seasonRows.length) return [];
      const fields = Object.fromEntries(
        AVERAGED_FIELDS.map((field) => [field, average(seasonRows.map((row) => row.usage[field]))]),
      ) as Record<AveragedField, { average: number | null; sampleSize: number }>;
      return [{ season, gamesWithStats: seasonRows.length, ...fields }];
    });

    return {
      playerId: player.playerId,
      playerName: player.playerName,
      position: player.position,
      seasons,
      unavailableFields: UNAVAILABLE_FIELDS,
    };
  });

  return {
    players,
    counts: {
      totalPlayers: players.length,
      playersWithAnyUsage: players.filter((player) => player.seasons.length > 0).length,
      totalGameRows: rows.length,
      seasonsCovered: [...seasonsCovered].sort((a, b) => a - b),
    },
  };
}
