/**
 * Phase 2 scarcity model: positional opportunity cost of waiting from the
 * user's current pick to their next pick, under the same Sleeper-order
 * scenario used by `availability.ts`.
 *
 * This does NOT skip `opponentPicksBeforeNextTurn` players at the position --
 * that would wrongly assume every intervening pick (by all 11 opponents,
 * regardless of the position they actually draft) comes from this one
 * position. Instead it directly compares the best available player at the
 * position now against the best available player at the position that is
 * still projected available at the next turn, using the existing JKB PAR/G
 * authority. No replacement-level threshold or weighting is invented here --
 * PAR/G is already replacement-relative by construction in `parRankings.ts`.
 */
import type { FantasyPosition } from "@/lib/fantasy/rankings";
import type { DraftPreviewRow } from "@/lib/fantasy/draftPreview/draftPreviewBoard";
import { computeRowAvailability, type PickWindow } from "@/lib/fantasy/draftPreview/availability";

export type BestParCandidate = {
  player: string;
  team: string | null;
  sleeperRank: number;
  parPerGame: number;
};

export type PositionOpportunityCost = {
  position: FantasyPosition;
  /** Highest JKB PAR/G among rows available now (`sleeperRank >= currentPick`). `null` if none qualify. */
  bestNow: BestParCandidate | null;
  /** Highest JKB PAR/G among rows still projected available at the next turn (`sleeperRank >= nextPick`). `null` if none qualify or there is no next pick. */
  bestNextTurn: BestParCandidate | null;
  /** `bestNow.parPerGame - bestNextTurn.parPerGame`. `null` (never `0`) when either side is unavailable. */
  opportunityCost: number | null;
  /** `true` when `bestNow` or `bestNextTurn` could not be determined (missing JKB PAR/G join, empty position, or no next pick). */
  insufficientData: boolean;
};

/**
 * Deterministic tie-break for equal PAR/G: the lower Sleeper Rank wins,
 * reusing Sleeper Rank as the established draft-order authority rather than
 * inventing a new tie-break rule.
 */
function pickBestByParPerGame(rows: readonly DraftPreviewRow[]): BestParCandidate | null {
  let best: DraftPreviewRow | null = null;
  for (const row of rows) {
    if (row.jkbParPerGame == null) continue;
    if (
      best == null ||
      row.jkbParPerGame > best.jkbParPerGame! ||
      (row.jkbParPerGame === best.jkbParPerGame && row.sleeperRank < best.sleeperRank)
    ) {
      best = row;
    }
  }
  if (best == null) return null;
  return {
    player: best.player,
    team: best.team,
    sleeperRank: best.sleeperRank,
    parPerGame: best.jkbParPerGame!,
  };
}

/**
 * Positional opportunity cost of waiting for one position, from the given
 * pick window. Duplicate Sleeper presentation rows are excluded, matching
 * the rendered board's de-duplication.
 */
export function computePositionOpportunityCost(
  rows: readonly DraftPreviewRow[],
  position: FantasyPosition,
  window: PickWindow,
): PositionOpportunityCost {
  const positionRows = rows.filter((row) => row.canonicalPosition === position && !row.isDuplicatePresentation);

  const nowRows = positionRows.filter((row) => computeRowAvailability(row.sleeperRank, window).availableNow);
  const nextTurnRows = positionRows.filter(
    (row) => computeRowAvailability(row.sleeperRank, window).projectedAvailableNextTurn,
  );

  const bestNow = pickBestByParPerGame(nowRows);
  const bestNextTurn = pickBestByParPerGame(nextTurnRows);

  const opportunityCost = bestNow != null && bestNextTurn != null ? bestNow.parPerGame - bestNextTurn.parPerGame : null;

  return {
    position,
    bestNow,
    bestNextTurn,
    opportunityCost,
    insufficientData: bestNow == null || bestNextTurn == null,
  };
}

/** Opportunity cost for every canonical position, in the given position order. */
export function computeAllPositionOpportunityCosts(
  rows: readonly DraftPreviewRow[],
  positions: readonly FantasyPosition[],
  window: PickWindow,
): readonly PositionOpportunityCost[] {
  return positions.map((position) => computePositionOpportunityCost(rows, position, window));
}
