/**
 * My Draft / Team Builder (Phase 2B): manual, client-side-only pick state.
 * The system never chooses a player -- every entry here comes from an
 * explicit ADD TO TEAM click. Pure state-transition functions only; nothing
 * here reads or writes `DraftPreviewRow` source data.
 */
import { FANTASY_POSITIONS, type FantasyPosition } from "@/lib/fantasy/rankings";
import type { DraftPreviewRow } from "@/lib/fantasy/draftPreview/draftPreviewBoard";

/** Round number (1-based) -> the row drafted into that round. No roster-shape enforcement. */
export type MyDraftState = ReadonlyMap<number, DraftPreviewRow>;

export function createEmptyMyDraftState(): MyDraftState {
  return new Map();
}

/** Adds/overwrites the player drafted into `round`. Never mutates the passed-in state. */
export function addPlayerToRound(state: MyDraftState, round: number, row: DraftPreviewRow): MyDraftState {
  const next = new Map(state);
  next.set(round, row);
  return next;
}

/** Empties `round` back out. Other rounds are left untouched. */
export function removePlayerFromRound(state: MyDraftState, round: number): MyDraftState {
  const next = new Map(state);
  next.delete(round);
  return next;
}

export function resetMyDraftState(): MyDraftState {
  return createEmptyMyDraftState();
}

/** `true` if `sleeperRank` is already drafted into any round. */
export function isPlayerDrafted(state: MyDraftState, sleeperRank: number): boolean {
  for (const row of state.values()) {
    if (row.sleeperRank === sleeperRank) return true;
  }
  return false;
}

/** The round (if any) `sleeperRank` currently occupies. */
export function draftedRoundForPlayer(state: MyDraftState, sleeperRank: number): number | null {
  for (const [round, row] of state) {
    if (row.sleeperRank === sleeperRank) return round;
  }
  return null;
}

export type MyDraftTotals = {
  playersDrafted: number;
  countsByPosition: Record<FantasyPosition, number>;
  /** Sum of Sleeper projected season points across drafted players. Always defined -- Sleeper Proj is never missing on a row. */
  totalSleeperProjectedPoints: number;
  /** Sum of JKB Proj PPG across drafted players with a JKB join; `null` when no drafted player has one. */
  totalJkbProjectedPpg: number | null;
  /** Sum of JKB PAR/G across drafted players with a JKB join; `null` when no drafted player has one. */
  totalJkbParPerGame: number | null;
};

/** Roster totals for the current My Draft state. Missing JKB values are excluded from their sums, never treated as 0. */
export function computeMyDraftTotals(state: MyDraftState): MyDraftTotals {
  const countsByPosition: Record<FantasyPosition, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
  let totalSleeperProjectedPoints = 0;
  let jkbPpgSum = 0;
  let jkbPpgCount = 0;
  let jkbParSum = 0;
  let jkbParCount = 0;

  for (const row of state.values()) {
    if (row.canonicalPosition != null) countsByPosition[row.canonicalPosition] += 1;
    totalSleeperProjectedPoints += row.sleeperProjectedPoints;
    if (row.jkbProjectedPpg != null) {
      jkbPpgSum += row.jkbProjectedPpg;
      jkbPpgCount += 1;
    }
    if (row.jkbParPerGame != null) {
      jkbParSum += row.jkbParPerGame;
      jkbParCount += 1;
    }
  }

  return {
    playersDrafted: state.size,
    countsByPosition,
    totalSleeperProjectedPoints,
    totalJkbProjectedPpg: jkbPpgCount > 0 ? jkbPpgSum : null,
    totalJkbParPerGame: jkbParCount > 0 ? jkbParSum : null,
  };
}

export const MY_DRAFT_POSITIONS: readonly FantasyPosition[] = FANTASY_POSITIONS;
