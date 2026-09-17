// WR-view opponent-defense slot/wide context join for the DFS board.
//
// Reuses the shared Razzball slot-wide defense artifact
// (src/lib/nfl/slotWideDefenseContext.ts) -- never a DFS-only copy of this
// data, and never a player's personal alignment (a different data source).
// Joined by the WR's OPPONENT team, since these fields describe the
// opposing defense, not the player.
//
// Slot/Wide PPG Allowed get a rank (1 = most PPG allowed = most favorable to
// the receiver) computed across the full 32-team artifact, independent of
// the slate -- the same "fixed league-wide rank" convention Def Rank/Off
// Rank already use, so the board's existing rank-heat cells apply unchanged.
// Slot%/Wide% carry no rank -- they are descriptive distribution shares, not
// heat-coded (per spec, "neutral/descriptive" formatting only).

import type { SlotWideDefenseContextArtifact, SlotWideDefenseTeamEntry } from "@/lib/nfl/slotWideDefenseContext";
import { buildSlotWideDefenseIndex } from "@/lib/nfl/slotWideDefenseContext";
import { normalizeNflTeamAbbr } from "@/lib/nfl/identity/identity";

export type DfsSlotWideEntry = SlotWideDefenseTeamEntry & {
  /** 1 = most fantasy PPG allowed to the slot in the league (most favorable to the receiver). */
  slotPpgAllowedRank: number | null;
  /** 1 = most fantasy PPG allowed to wide receivers in the league (most favorable to the receiver). */
  widePpgAllowedRank: number | null;
  poolSize: number;
};

function rankDescending(teams: readonly SlotWideDefenseTeamEntry[], value: (team: SlotWideDefenseTeamEntry) => number): ReadonlyMap<string, number> {
  const sorted = [...teams].sort((a, b) => value(b) - value(a));
  const ranks = new Map<string, number>();
  sorted.forEach((team, index) => ranks.set(team.team, index + 1));
  return ranks;
}

/** Keyed by normalized team abbreviation. Empty map when the artifact hasn't loaded. */
export function buildDfsSlotWideContext(artifact: SlotWideDefenseContextArtifact | null | undefined): ReadonlyMap<string, DfsSlotWideEntry> {
  const byAbbr = buildSlotWideDefenseIndex(artifact);
  const teams = [...byAbbr.values()];
  const poolSize = teams.length;
  const slotRank = rankDescending(teams, (team) => team.slotPpgAllowed);
  const wideRank = rankDescending(teams, (team) => team.widePpgAllowed);
  const map = new Map<string, DfsSlotWideEntry>();
  for (const team of teams) {
    map.set(team.team, { ...team, slotPpgAllowedRank: slotRank.get(team.team) ?? null, widePpgAllowedRank: wideRank.get(team.team) ?? null, poolSize });
  }
  return map;
}

/** The opposing defense's slot/wide context for a WR row. `null` when the opponent or artifact is unavailable. */
export function resolveDfsOppSlotWideContext(
  slotWideByAbbr: ReadonlyMap<string, DfsSlotWideEntry>,
  opponent: string | null | undefined,
): DfsSlotWideEntry | null {
  if (!opponent) return null;
  const normalized = normalizeNflTeamAbbr(opponent);
  if (!normalized) return null;
  return slotWideByAbbr.get(normalized) ?? null;
}
