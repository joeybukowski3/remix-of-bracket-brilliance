import type { MatchupLineupEntry, SimulationPlayer, WeeklyLineup } from "../types";
import { LINEUP_SLOTS, normalizeOpponent } from "./lineupOptimizer";

/**
 * Thrown when a simulated draft, lineup, or score fails an invariant that
 * should be impossible under correct engine logic. Never caught and silently
 * repaired — these indicate a bug, not recoverable user input.
 */
export class IntegrityError extends Error {
  constructor(message: string) {
    super(`16-0 integrity check failed: ${message}`);
    this.name = "IntegrityError";
  }
}

/**
 * Verifies the full completed draft: exactly 12 rosters of 17 unique
 * players each, no player drafted onto more than one roster, and the
 * draftedPlayerIds set matches the union of every roster exactly.
 */
export function assertDraftIntegrity(
  allRosters: Record<number, readonly SimulationPlayer[]>,
  draftedPlayerIds: ReadonlySet<string>,
): void {
  const slots = Object.keys(allRosters).map(Number);
  if (slots.length !== 12) {
    throw new IntegrityError(`expected 12 drafted rosters, found ${slots.length}.`);
  }

  const seenAcrossLeague = new Set<string>();
  for (const slot of slots) {
    const roster = allRosters[slot];
    if (roster.length !== 17) {
      throw new IntegrityError(`roster at slot ${slot} has ${roster.length} players, expected 17.`);
    }
    const rosterIds = new Set(roster.map((player) => player.id));
    if (rosterIds.size !== roster.length) {
      throw new IntegrityError(`roster at slot ${slot} contains a duplicate player.`);
    }
    for (const id of rosterIds) {
      if (seenAcrossLeague.has(id)) {
        throw new IntegrityError(`player ${id} appears on more than one drafted roster.`);
      }
      seenAcrossLeague.add(id);
    }
  }

  if (seenAcrossLeague.size !== 204) {
    throw new IntegrityError(`expected 204 unique drafted players, found ${seenAcrossLeague.size}.`);
  }
  if (draftedPlayerIds.size !== seenAcrossLeague.size) {
    throw new IntegrityError("draftedPlayerIds does not match the number of players actually rostered.");
  }
  for (const id of seenAcrossLeague) {
    if (!draftedPlayerIds.has(id)) {
      throw new IntegrityError(`player ${id} is on a roster but missing from draftedPlayerIds.`);
    }
  }
}

/**
 * Verifies one week's completed starting lineup: exactly nine unique
 * starters, and every non-replacement starter actually belongs to the
 * roster it was optimized from.
 */
export function assertLineupIntegrity(
  lineup: WeeklyLineup,
  rosterPlayerIds: ReadonlySet<string>,
  draftedPlayerIds: ReadonlySet<string>,
  label: string,
): void {
  const players = LINEUP_SLOTS.map((slot) => lineup[slot]);
  if (players.some((player) => player === null)) {
    throw new IntegrityError(`${label}: lineup has an unfilled starting slot.`);
  }
  const filled = players as SimulationPlayer[];
  const ids = filled.map((player) => player.id);
  if (new Set(ids).size !== 9) {
    throw new IntegrityError(`${label}: lineup contains a duplicate starter.`);
  }
  for (const player of filled) {
    const isRosterPlayer = rosterPlayerIds.has(player.id);
    if (!isRosterPlayer && draftedPlayerIds.has(player.id)) {
      throw new IntegrityError(
        `${label}: temporary replacement ${player.name} is actually a drafted player, not a free agent.`,
      );
    }
  }
}

/**
 * Verifies the saved player-level scores for a matchup sum (under the same
 * rounding policy the engine already uses) to the stored team total.
 */
export function assertScoreReconciliation(
  entries: readonly MatchupLineupEntry[],
  teamScore: number,
  label: string,
): void {
  const sum = Math.round(entries.reduce((total, entry) => total + entry.points, 0) * 10) / 10;
  if (Math.abs(sum - teamScore) > 0.05) {
    throw new IntegrityError(
      `${label}: sum of displayed player scores (${sum}) does not match the stored team score (${teamScore}).`,
    );
  }
}

/**
 * Verifies a displayed matchup entry's NFL opponent matches the player's
 * own weeklyOpponents data for that week, rather than being invented.
 */
export function assertNflMatchupConsistency(
  entry: MatchupLineupEntry,
  player: SimulationPlayer,
  week: number,
  label: string,
): void {
  const raw = player.weeklyOpponents[week] ?? null;
  const expectedOpponent = normalizeOpponent(raw);
  if (entry.nflOpponent !== expectedOpponent) {
    throw new IntegrityError(
      `${label}: displayed NFL opponent for ${player.name} (${entry.nflOpponent ?? "none"}) does not match weekly data (${expectedOpponent ?? "none"}).`,
    );
  }
}
