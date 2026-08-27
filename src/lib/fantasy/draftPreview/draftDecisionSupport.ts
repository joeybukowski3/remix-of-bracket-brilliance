/**
 * Phase 2 decision-support snapshot: composes the availability window
 * (`availability.ts`) and positional scarcity (`scarcity.ts`) into the
 * values the Draft Preview decision panel renders for one evaluated turn.
 *
 * Reach/Value-Fall is intentionally NOT computed here. Sleeper Rank, AVG Rk,
 * Model Rk and Projection Rk live on different scales with no shared,
 * non-arbitrary distance threshold for "disagreement" -- picking one would
 * be exactly the kind of invented weighting this layer is required to
 * avoid. Deferred to a future phase if/when a defensible rule exists.
 */
import { FANTASY_POSITIONS, type FantasyPosition } from "@/lib/fantasy/rankings";
import type { DraftPreviewRow } from "@/lib/fantasy/draftPreview/draftPreviewBoard";
import { computeSnakeDraftSlotPicks, type SnakeDraftPick } from "@/lib/fantasy/draftPreview/snakeDraft";
import { computePickWindow, computeRowAvailability, type PickWindow } from "@/lib/fantasy/draftPreview/availability";
import { computeAllPositionOpportunityCosts, type PositionOpportunityCost } from "@/lib/fantasy/draftPreview/scarcity";

export type BestRowSummary = {
  player: string;
  team: string | null;
  sleeperRank: number;
  value: number;
};

export type DraftDecisionSupportSnapshot = {
  draftSlot: number;
  picks: readonly SnakeDraftPick[];
  currentPickIndex: number;
  window: PickWindow;
  /** Lowest Sleeper Rank among rows available now. Reuses Sleeper Rank as the ordering authority -- no new ranking is computed. */
  bestAvailable: BestRowSummary | null;
  /** Highest JKB Proj PPG among rows available now. `null` when no available row has a JKB projection join. */
  bestProjection: BestRowSummary | null;
  /** Highest JKB PAR/G among rows available now. `null` when no available row has a JKB PAR/G join. */
  bestPar: BestRowSummary | null;
  positionOpportunityCosts: readonly PositionOpportunityCost[];
};

/** Rows eligible for the decision panel: in-scope JKB positions, single presentation row per real player. */
function eligibleRows(rows: readonly DraftPreviewRow[]): readonly DraftPreviewRow[] {
  return rows.filter((row) => row.canonicalPosition != null && !row.isDuplicatePresentation);
}

function availableNowRows(rows: readonly DraftPreviewRow[], window: PickWindow): readonly DraftPreviewRow[] {
  return rows.filter((row) => computeRowAvailability(row.sleeperRank, window).availableNow);
}

function pickLowestSleeperRank(rows: readonly DraftPreviewRow[]): BestRowSummary | null {
  let best: DraftPreviewRow | null = null;
  for (const row of rows) {
    if (best == null || row.sleeperRank < best.sleeperRank) best = row;
  }
  if (best == null) return null;
  return { player: best.player, team: best.team, sleeperRank: best.sleeperRank, value: best.sleeperRank };
}

function pickHighestNumericField(
  rows: readonly DraftPreviewRow[],
  field: "jkbProjectedPpg" | "jkbParPerGame",
): BestRowSummary | null {
  let best: DraftPreviewRow | null = null;
  let bestValue = -Infinity;
  for (const row of rows) {
    const value = row[field];
    if (value == null) continue;
    if (best == null || value > bestValue || (value === bestValue && row.sleeperRank < best.sleeperRank)) {
      best = row;
      bestValue = value;
    }
  }
  if (best == null) return null;
  return { player: best.player, team: best.team, sleeperRank: best.sleeperRank, value: bestValue };
}

/**
 * Full decision-support snapshot for one evaluated turn.
 *
 * `roundCount` bounds how many of the slot's picks are considered (matches
 * the rendered board's round coverage). `currentPickIndex` is 0-based into
 * that pick sequence (0 = round 1).
 */
export function computeDraftDecisionSupportSnapshot(
  rows: readonly DraftPreviewRow[],
  draftSlot: number,
  currentPickIndex: number,
  roundCount: number,
): DraftDecisionSupportSnapshot {
  const picks = computeSnakeDraftSlotPicks(draftSlot, roundCount);
  const window = computePickWindow(picks, currentPickIndex);

  const eligible = eligibleRows(rows);
  const available = availableNowRows(eligible, window);

  return {
    draftSlot,
    picks,
    currentPickIndex,
    window,
    bestAvailable: pickLowestSleeperRank(available),
    bestProjection: pickHighestNumericField(available, "jkbProjectedPpg"),
    bestPar: pickHighestNumericField(available, "jkbParPerGame"),
    positionOpportunityCosts: computeAllPositionOpportunityCosts(eligible, FANTASY_POSITIONS as readonly FantasyPosition[], window),
  };
}
