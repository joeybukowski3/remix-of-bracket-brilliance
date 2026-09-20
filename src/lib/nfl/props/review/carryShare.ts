import Papa from "papaparse";
import { canonicalPlayerId, normalizeNflTeamAbbr } from "@/lib/nfl/identity/identity";
import type { NflCurrentWeekProjectionRow } from "../types/currentWeekProjection";

export type CarryShareSample = { playerCarries: number; teamRbCarries: number; share: number };
export type PlayerWeekCarryRow = {
  player_id: string;
  position: string;
  season: string;
  season_type: string;
  game_id: string;
  team: string;
  carries: string;
};

/** The cache is source data; final game IDs come from the separate results artifact. */
export function parsePlayerWeekCarries(csv: string): PlayerWeekCarryRow[] {
  return Papa.parse<PlayerWeekCarryRow>(csv, { header: true, skipEmptyLines: true }).data;
}

export function buildCarryShareSamples(
  rows: readonly PlayerWeekCarryRow[],
  completedGameIds: ReadonlySet<string>,
  season: number,
): ReadonlyMap<string, CarryShareSample> {
  const totals = new Map<string, number>();
  const players = new Map<string, number>();
  const observed = new Set<string>();
  for (const row of rows) {
    if (Number(row.season) !== season || row.season_type !== "REG" || row.position !== "RB" || !completedGameIds.has(row.game_id)) continue;
    const team = normalizeNflTeamAbbr(row.team);
    const playerId = canonicalPlayerId(row.player_id);
    const carries = Number(row.carries);
    if (!team || !playerId || !Number.isFinite(carries) || carries < 0) continue;
    const teamKey = `${team}:${row.game_id}`;
    const playerGameKey = `${teamKey}:${playerId}`;
    if (observed.has(playerGameKey)) continue;
    observed.add(playerGameKey);
    totals.set(team, (totals.get(team) ?? 0) + carries);
    const key = `${team}:${playerId}`;
    players.set(key, (players.get(key) ?? 0) + carries);
  }
  const samples = new Map<string, CarryShareSample>();
  for (const [key, playerCarries] of players) {
    const teamRbCarries = totals.get(key.split(":", 1)[0]) ?? 0;
    if (teamRbCarries > 0) samples.set(key, { playerCarries, teamRbCarries, share: playerCarries / teamRbCarries });
  }
  return samples;
}

export function carryShareForRow(
  row: NflCurrentWeekProjectionRow,
  samples: ReadonlyMap<string, CarryShareSample>,
): CarryShareSample | null {
  if (row.market !== "rushing") return null;
  const team = normalizeNflTeamAbbr(row.team);
  return team ? samples.get(`${team}:${row.playerId}`) ?? null : null;
}

export function formatCarryShare(sample: CarryShareSample | null): string {
  return sample ? `${Math.round(sample.share * 100)}%` : "—";
}

export function carryShareTitle(sample: CarryShareSample | null): string | undefined {
  return sample ? `${sample.playerCarries} of ${sample.teamRbCarries} RB carries · ${formatCarryShare(sample)}` : undefined;
}
