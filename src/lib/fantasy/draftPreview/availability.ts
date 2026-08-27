/**
 * Phase 2 availability model.
 *
 * Treats Sleeper Rank as a single deterministic draft-order scenario: "if
 * every team drafts in Sleeper Rank order, here is exactly who is gone by
 * pick N." This is a simulated scenario, not a probability -- there is no
 * variance/distribution data to calibrate a real probability from, so this
 * module intentionally stops at deterministic rank-window comparisons.
 *
 * Nothing here reorders or recomputes Sleeper Rank; it only compares the
 * existing value against pick numbers produced by `snakeDraft.ts`.
 */
import type { SnakeDraftPick } from "@/lib/fantasy/draftPreview/snakeDraft";

export type PickWindow = {
  /** The evaluated round for the slot. */
  round: number;
  /** The slot's overall pick number for this round. */
  currentPick: number;
  /** The slot's overall pick number for the following tracked round, or `null` on the last tracked round. */
  nextPick: number | null;
  /** Opponent picks that happen between `currentPick` and `nextPick`. `null` when there is no next pick. */
  opponentPicksBeforeNextTurn: number | null;
};

/**
 * Builds the pick window for one evaluated turn out of a slot's full pick
 * sequence (as produced by `computeSnakeDraftSlotPicks`).
 */
export function computePickWindow(
  picks: readonly SnakeDraftPick[],
  currentPickIndex: number,
): PickWindow {
  if (!Number.isInteger(currentPickIndex) || currentPickIndex < 0 || currentPickIndex >= picks.length) {
    throw new Error(`Invalid pick index ${currentPickIndex} for a ${picks.length}-pick sequence.`);
  }
  const current = picks[currentPickIndex];
  const next = picks[currentPickIndex + 1] ?? null;
  return {
    round: current.round,
    currentPick: current.overallPick,
    nextPick: next?.overallPick ?? null,
    opponentPicksBeforeNextTurn: next ? next.overallPick - current.overallPick - 1 : null,
  };
}

export type RowAvailability = {
  /** `sleeperRank >= currentPick`. */
  availableNow: boolean;
  /** `currentPick < sleeperRank < nextPick`. Always `false` when there is no next pick. */
  projectedGoneBeforeNextTurn: boolean;
  /** `nextPick != null && sleeperRank >= nextPick`. */
  projectedAvailableNextTurn: boolean;
};

/** Availability classification for a single Sleeper Rank against a pick window. */
export function computeRowAvailability(sleeperRank: number, window: PickWindow): RowAvailability {
  const { currentPick, nextPick } = window;
  const availableNow = sleeperRank >= currentPick;
  const projectedGoneBeforeNextTurn = nextPick != null && sleeperRank > currentPick && sleeperRank < nextPick;
  const projectedAvailableNextTurn = nextPick != null && sleeperRank >= nextPick;
  return { availableNow, projectedGoneBeforeNextTurn, projectedAvailableNextTurn };
}
