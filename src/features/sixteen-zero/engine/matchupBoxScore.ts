import type { LineupSlot, MatchupLineupEntry, SimulationPlayer, WeeklyLineup } from "../types";
import { LINEUP_SLOTS, normalizeOpponent } from "./lineupOptimizer";

/**
 * Builds an immutable snapshot of a played weekly lineup for storage on
 * ScheduleGame. Presentation-only: consumes the exact lineup and slot scores
 * already produced by simulateLineupScore, never recomputes or re-simulates.
 */
export function buildMatchupLineupEntries(
  lineup: WeeklyLineup,
  slotScores: Record<LineupSlot, number>,
  week: number,
  rosterPlayerIds: ReadonlySet<string>,
): MatchupLineupEntry[] {
  return LINEUP_SLOTS.map((slot) => {
    const player = lineup[slot];
    if (!player) {
      throw new Error(`Cannot build a matchup snapshot with an empty ${slot} slot.`);
    }
    return buildEntry(slot, player, slotScores[slot], week, rosterPlayerIds);
  });
}

function buildEntry(
  slot: LineupSlot,
  player: SimulationPlayer,
  points: number,
  week: number,
  rosterPlayerIds: ReadonlySet<string>,
): MatchupLineupEntry {
  const rawOpponent = player.weeklyOpponents[week] ?? null;
  const nflOpponent = normalizeOpponent(rawOpponent);
  return {
    slot,
    playerId: player.id,
    playerName: player.name,
    position: player.position,
    nflTeam: player.team,
    nflOpponent,
    isHome: rawOpponent === null ? null : !rawOpponent.trim().startsWith("@"),
    points,
    isTemporaryReplacement: !rosterPlayerIds.has(player.id),
  };
}
