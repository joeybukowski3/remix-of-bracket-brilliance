/**
 * ROS projection authority -- Phase 3B shadow availability/status layer.
 *
 * Determines each resolved player's roster status from the best existing
 * authoritative nflverse data already cached in this repo, in priority
 * order:
 *
 *   1. `data/nfl/nflverse/weekly-rosters/roster_weekly_2026.csv` -- the
 *      current-season, week-specific roster snapshot (currently Week 1
 *      only). This is the most current authority: "on a 2026 team roster
 *      right now."
 *   2. `data/nfl/nflverse/players/players.csv` -- the nflverse master
 *      player table's `status` field, used ONLY when a player is absent
 *      from the current-season snapshot. This table is not season-specific
 *      and may reflect a stale/last-known status, so it is always labeled
 *      distinctly from the current-season source.
 *
 * Every status code is mapped through an explicit, literal lookup table --
 * no name heuristics, no inference from projection value or rank. A code
 * not present in the map (or a player present in neither source) resolves
 * to the explicit "unknown" category rather than a guess.
 */
import type { FantasyPosition } from "@/lib/fantasy/rankings";

export const ROS_STATUS_AVAILABILITY_SCHEMA_VERSION = "ros-status-availability-v1" as const;

export type StatusCategory = "active" | "reserve" | "released" | "suspended" | "otherUnavailable" | "unknown";

export type StatusSourceRow = {
  gsisId: string;
  team: string | null;
  rawStatus: string;
};

/**
 * `roster_weekly_2026.csv` status codes observed in the committed cache:
 * ACT, CUT, E14, RES, RET. E14 is not a documented nflverse code this repo
 * has a confirmed meaning for, so it is deliberately left unmapped
 * ("otherUnavailable" via the explicit fallback below is NOT applied here --
 * see the default-to-"unknown" behavior in `buildStatusAvailability`) rather
 * than guessed.
 */
export const PRIMARY_ROSTER_STATUS_CATEGORY: Readonly<Record<string, StatusCategory>> = {
  ACT: "active",
  CUT: "released",
  RES: "reserve",
  RET: "otherUnavailable",
};

/**
 * `players.csv` master-table status codes observed in the committed cache:
 * ACT, CUT, RES, DEV, RSN, NWT, PUP, RSR, SUS, RET, EXE, RLS, LB, INA.
 * Only codes with a confident, documented nflverse meaning are mapped to a
 * specific category; codes without a confirmed meaning in this repo (RSN,
 * NWT, RSR, EXE, LB, INA) are intentionally left unmapped and resolve to
 * "unknown" rather than guessed, per the no-fuzzy/no-invented-category rule.
 */
export const MASTER_TABLE_STATUS_CATEGORY: Readonly<Record<string, StatusCategory>> = {
  ACT: "active",
  CUT: "released",
  RLS: "released",
  RES: "reserve",
  PUP: "reserve",
  SUS: "suspended",
  RET: "otherUnavailable",
  DEV: "otherUnavailable", // practice squad: rostered but not on the active game-day roster
};

export type PlayerStatusAvailability = {
  playerId: string;
  playerName: string;
  position: FantasyPosition;
  status: {
    category: StatusCategory;
    rawCode: string | null;
    source: "current-season-roster" | "master-player-table" | "none";
    sourceTeam: string | null;
    asOf: string | null;
  };
};

export type StatusAvailabilityResult = {
  players: PlayerStatusAvailability[];
  counts: {
    totalPlayers: number;
    byCategory: Record<StatusCategory, number>;
    bySource: Record<"current-season-roster" | "master-player-table" | "none", number>;
  };
};

function gsisFromPlayerId(playerId: string): string {
  return playerId.startsWith("gsis:") ? playerId.slice("gsis:".length) : playerId;
}

export function buildStatusAvailability(input: {
  currentSeasonRosterRows: readonly StatusSourceRow[];
  currentSeasonAsOf: string;
  masterTableRows: readonly StatusSourceRow[];
  masterTableAsOf: string;
  universe: readonly { playerId: string; playerName: string; position: FantasyPosition }[];
}): StatusAvailabilityResult {
  const { currentSeasonRosterRows, currentSeasonAsOf, masterTableRows, masterTableAsOf, universe } = input;
  const currentByGsis = new Map(currentSeasonRosterRows.map((row) => [row.gsisId, row]));
  const masterByGsis = new Map(masterTableRows.map((row) => [row.gsisId, row]));

  const players: PlayerStatusAvailability[] = universe.map((player) => {
    const gsisId = gsisFromPlayerId(player.playerId);
    const current = currentByGsis.get(gsisId);
    if (current) {
      const category = PRIMARY_ROSTER_STATUS_CATEGORY[current.rawStatus] ?? "unknown";
      return {
        playerId: player.playerId,
        playerName: player.playerName,
        position: player.position,
        status: { category, rawCode: current.rawStatus, source: "current-season-roster", sourceTeam: current.team, asOf: currentSeasonAsOf },
      };
    }
    const master = masterByGsis.get(gsisId);
    if (master) {
      const category = MASTER_TABLE_STATUS_CATEGORY[master.rawStatus] ?? "unknown";
      return {
        playerId: player.playerId,
        playerName: player.playerName,
        position: player.position,
        status: { category, rawCode: master.rawStatus, source: "master-player-table", sourceTeam: master.team, asOf: masterTableAsOf },
      };
    }
    return {
      playerId: player.playerId,
      playerName: player.playerName,
      position: player.position,
      status: { category: "unknown", rawCode: null, source: "none", sourceTeam: null, asOf: null },
    };
  });

  const byCategory: Record<StatusCategory, number> = { active: 0, reserve: 0, released: 0, suspended: 0, otherUnavailable: 0, unknown: 0 };
  const bySource: Record<"current-season-roster" | "master-player-table" | "none", number> = {
    "current-season-roster": 0,
    "master-player-table": 0,
    none: 0,
  };
  for (const player of players) {
    byCategory[player.status.category] += 1;
    bySource[player.status.source] += 1;
  }

  return { players, counts: { totalPlayers: players.length, byCategory, bySource } };
}
