/**
 * ROS projection authority -- Phase 2.1 historical baseline (shadow research
 * input). Aggregates the already-approved 2023-2025 player-week history
 * (`weekly/history.ts` / `data/fantasy/weekly/player-week-history-2023-2025.json`)
 * into per-player, per-season games-played and PPR PPG, plus the most recent
 * season's PPG as "recent historical PPG". This module never produces a final
 * ROS-projected PPG -- that is explicitly Phase 3 scope.
 */
import type { FantasyPosition } from "@/lib/fantasy/rankings";

export const ROS_HISTORICAL_BASELINE_SCHEMA_VERSION = "ros-historical-baseline-v1" as const;

export type HistoricalBaselineSourceRow = {
  season: number;
  playerId: string;
  playerName: string;
  position: FantasyPosition;
  actualFantasyPoints: number;
};

export type PlayerSeasonBaseline = {
  season: number;
  gamesPlayed: number;
  totalFantasyPoints: number;
  ppg: number;
};

export type PlayerHistoricalBaseline = {
  playerId: string;
  playerName: string;
  position: FantasyPosition;
  seasons: PlayerSeasonBaseline[];
  /** Most recent season with at least one game in the source, or null when the player has no history at all. Not a projection. */
  recentHistoricalPpg: { season: number; ppg: number; gamesPlayed: number } | null;
  sampleMetadata: {
    totalGamesAllSeasons: number;
    seasonsWithData: number[];
  };
};

export type HistoricalBaselineResult = {
  players: PlayerHistoricalBaseline[];
  counts: {
    totalPlayers: number;
    playersWithAnyHistory: number;
    playersWithNoHistory: number;
    totalGameRows: number;
    seasonsCovered: number[];
  };
};

/**
 * `universe` names every canonical playerId the caller wants a baseline row
 * for (e.g. the Phase 1 identity crosswalk's resolved players), so a player
 * with zero rows in the history source still appears with an explicit empty
 * result instead of silently disappearing.
 */
export function buildHistoricalBaseline(
  rows: readonly HistoricalBaselineSourceRow[],
  universe: readonly { playerId: string; playerName: string; position: FantasyPosition }[],
): HistoricalBaselineResult {
  const bySeasonPlayer = new Map<string, HistoricalBaselineSourceRow[]>();
  const seasonsCovered = new Set<number>();
  for (const row of rows) {
    seasonsCovered.add(row.season);
    const key = `${row.playerId}|${row.season}`;
    bySeasonPlayer.set(key, [...(bySeasonPlayer.get(key) ?? []), row]);
  }

  const players: PlayerHistoricalBaseline[] = universe.map((player) => {
    const seasons: PlayerSeasonBaseline[] = [...seasonsCovered].sort((a, b) => a - b).flatMap((season) => {
      const seasonRows = bySeasonPlayer.get(`${player.playerId}|${season}`);
      if (!seasonRows || !seasonRows.length) return [];
      const totalFantasyPoints = seasonRows.reduce((sum, row) => sum + row.actualFantasyPoints, 0);
      return [{
        season,
        gamesPlayed: seasonRows.length,
        totalFantasyPoints,
        ppg: totalFantasyPoints / seasonRows.length,
      }];
    });

    const mostRecent = seasons.at(-1) ?? null;

    return {
      playerId: player.playerId,
      playerName: player.playerName,
      position: player.position,
      seasons,
      recentHistoricalPpg: mostRecent
        ? { season: mostRecent.season, ppg: mostRecent.ppg, gamesPlayed: mostRecent.gamesPlayed }
        : null,
      sampleMetadata: {
        totalGamesAllSeasons: seasons.reduce((sum, season) => sum + season.gamesPlayed, 0),
        seasonsWithData: seasons.map((season) => season.season),
      },
    };
  });

  return {
    players,
    counts: {
      totalPlayers: players.length,
      playersWithAnyHistory: players.filter((player) => player.seasons.length > 0).length,
      playersWithNoHistory: players.filter((player) => player.seasons.length === 0).length,
      totalGameRows: rows.length,
      seasonsCovered: [...seasonsCovered].sort((a, b) => a - b),
    },
  };
}
