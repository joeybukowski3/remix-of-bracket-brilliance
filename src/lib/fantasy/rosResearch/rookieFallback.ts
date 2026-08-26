/**
 * ROS projection authority -- Phase 3B rookie/no-history fallback.
 *
 * 26 of the 250 Phase 1-resolved players have zero 2023-2025 game history
 * (`historical-baseline.json`'s `playersWithNoHistory`), so all three
 * Phase 3 baseline weightings return `null` for them. This module audits
 * the repo for a legitimate, already-approved preseason prior for exactly
 * those players and nothing else -- it never invents a number, and it never
 * touches a player who already has a real historical baseline.
 *
 * The only existing repo authority that already carries a per-player 2026
 * season-level projection independent of 2023-2025 game history is the live
 * PAR consensus source (`FANTASY_PAR_ROWS[...].projectedPpg`, sourced from
 * `data/fantasy/2026-par-consensus.json`'s "2026 Projected PPG" column).
 * That source already covers rookies (its `Projection Status` field reads
 * "authoritative-derived (source-implied scoring)" for them, same as every
 * other row) -- reusing it here as a FALLBACK prior is not fabrication, it
 * is citing an already-approved external projection, explicitly labeled
 * apart from the Phase 3 historical model's own output. This module is
 * read-only against that source; it does not modify it.
 */
import type { FantasyPosition } from "@/lib/fantasy/rankings";

export const ROS_ROOKIE_FALLBACK_SCHEMA_VERSION = "ros-rookie-fallback-v1" as const;

export type RookieFallbackSourceRow = {
  playerId: string;
  playerName: string;
  position: FantasyPosition;
  parConsensusProjectedPpg: number | null; // live PAR row's projectedPpg, or null if no PAR match exists for this player
};

export type PlayerFallbackBaseline = {
  playerId: string;
  playerName: string;
  position: FantasyPosition;
  hasHistoricalBaseline: boolean; // true = this module does not apply; historical model output is authoritative
  fallback: {
    applied: boolean;
    source: "par-consensus-2026-projected-ppg" | "none";
    ppg: number | null;
    reason: string | null;
  };
};

export type RookieFallbackResult = {
  players: PlayerFallbackBaseline[];
  counts: {
    playersWithNoHistory: number;
    resolvedByFallback: number;
    unresolvedNoFallbackAvailable: number;
  };
};

/**
 * `noHistoryUniverse` is exactly the set of players Phase 3's historical
 * baseline could not compute for (all three weightings null). Players with
 * a real historical baseline are not represented in the output at all --
 * this module never overrides historical-model output.
 */
export function buildRookieFallback(
  noHistoryUniverse: readonly { playerId: string; playerName: string; position: FantasyPosition }[],
  parSourceRows: readonly RookieFallbackSourceRow[],
): RookieFallbackResult {
  const parByPlayerId = new Map(parSourceRows.map((row) => [row.playerId, row]));

  const players: PlayerFallbackBaseline[] = noHistoryUniverse.map((player) => {
    const parRow = parByPlayerId.get(player.playerId);
    if (parRow && parRow.parConsensusProjectedPpg != null) {
      return {
        playerId: player.playerId,
        playerName: player.playerName,
        position: player.position,
        hasHistoricalBaseline: false,
        fallback: { applied: true, source: "par-consensus-2026-projected-ppg", ppg: parRow.parConsensusProjectedPpg, reason: null },
      };
    }
    return {
      playerId: player.playerId,
      playerName: player.playerName,
      position: player.position,
      hasHistoricalBaseline: false,
      fallback: { applied: false, source: "none", ppg: null, reason: "no live PAR consensus row (projectedPpg) resolved for this canonical identity; no other approved preseason prior is available in this repo" },
    };
  });

  return {
    players,
    counts: {
      playersWithNoHistory: players.length,
      resolvedByFallback: players.filter((p) => p.fallback.applied).length,
      unresolvedNoFallbackAvailable: players.filter((p) => !p.fallback.applied).length,
    },
  };
}
