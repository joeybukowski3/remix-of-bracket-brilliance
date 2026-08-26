/**
 * Draft Preview row builder. Joins each fixed Sleeper source row to the
 * existing JKB authorities and never recomputes any of them:
 *
 * - Sleeper Rk / Sleeper Proj / Sleeper PPG -- verbatim from the source CSV.
 * - Pos Rk -- `FantasyRankingRow.positionRank` (canonical JKB position rank).
 * - JKB Proj PPG / JKB PAR/G -- the approved PAR authority (`parRankings.ts`).
 * - Model Rk -- the corrected F2 shadow model authority (`shadowModelRankJoin.ts`).
 * - Projection Rk / AVG Rk / SOS / W15-W17 -- straight off the JKB workbook row.
 * - 2025 Pts Rk / 2025 PPG Rk / L8 Pts Rk -- `overallRowContext.ts`.
 *
 * `FANTASY_RANKINGS`, `FANTASY_PAR_ROWS` and the shadow model artifact are
 * only ever read here, never mutated or resorted.
 */
import { FANTASY_PAR_ROWS } from "@/lib/fantasy/parRankings";
import { FANTASY_RANKINGS, type FantasyPosition, type FantasyRankingRow } from "@/lib/fantasy/rankings";
import { getOverallRowContext } from "@/lib/fantasy/overallRowContext";
import { getShadowModelRankRow } from "@/lib/fantasy/rosResearch/shadowModelRankJoin";
import { buildDraftPreviewIdentity, canonicalPositionForSource } from "@/lib/fantasy/draftPreview/identity";
import { SLEEPER_DRAFT_BOARD_2026 } from "@/lib/fantasy/draftPreview/sleeperDraftBoard";
import type { SleeperDraftBoardRow } from "@/lib/fantasy/draftPreview/sleeperCsv";

export type DraftPreviewRow = {
  sleeperRank: number;
  player: string;
  team: string | null;
  sourcePosition: string;
  /** JKB-tracked position (QB/RB/WR/TE) this row maps to, or null if out of scope (DEF/K). */
  canonicalPosition: FantasyPosition | null;
  bye: number | null;
  sleeperProjectedPoints: number;
  sleeperProjectedPpg: number;

  jkb: FantasyRankingRow | undefined;
  jkbProjectedPpg: number | undefined;
  jkbParPerGame: number | undefined;
  modelRank: number | null;
  seasonPointsRank2025: number | undefined;
  seasonPpgRank2025: number | undefined;
  lastEightPointsRank: number | undefined;

  /**
   * True when this source row is a duplicate Sleeper listing of a real
   * player already presented under a different Sleeper Rank (e.g. Dylan
   * Sampson appears twice in the source at ranks 89 and 188). The row still
   * exists in `DRAFT_PREVIEW_ROWS_2026` for provenance/QA -- it is only
   * excluded from the rendered board by `filterDraftPreviewRows` -- so
   * nothing is discarded, only de-duplicated at presentation time. See
   * `pickPrimarySleeperRank` for the selection rule.
   */
  isDuplicatePresentation: boolean;
};

const PAR_ROW_BY_JKB_OVERALL_RANK: ReadonlyMap<number, (typeof FANTASY_PAR_ROWS)[number]> = new Map(
  FANTASY_PAR_ROWS.filter((row) => row.jkbOverallRank != null).map((row) => [row.jkbOverallRank as number, row]),
);

function buildJkbBySleeperRank(
  sleeperRows: readonly SleeperDraftBoardRow[],
  jkbRows: readonly FantasyRankingRow[],
): ReadonlyMap<number, FantasyRankingRow> {
  const identity = buildDraftPreviewIdentity(sleeperRows, jkbRows);
  return new Map(identity.resolved.map((match) => [match.sleeperRow.sleeperRank, match.jkbRow]));
}

/**
 * Deterministic tie-break for a group of Sleeper source rows that all join
 * the same real JKB player: keep the lowest Sleeper Rank. Sleeper Rank is
 * the draft-board ordering authority, so it alone decides which row
 * survives -- JKB data (e.g. `team`) is never used as a selection
 * authority, only (elsewhere, via the identity join) to confirm the rows
 * really do represent one canonical player.
 */
function pickPrimarySleeperRank(
  _jkbRow: FantasyRankingRow,
  duplicateRows: readonly SleeperDraftBoardRow[],
): number {
  return duplicateRows.reduce((best, row) => (row.sleeperRank < best ? row.sleeperRank : best), Infinity);
}

function buildDuplicatePresentationSet(
  sleeperRows: readonly SleeperDraftBoardRow[],
  jkbRows: readonly FantasyRankingRow[],
): ReadonlySet<number> {
  const identity = buildDraftPreviewIdentity(sleeperRows, jkbRows);
  const hidden = new Set<number>();
  for (const { jkbRow, sleeperRows: duplicateRows } of identity.duplicateCanonicalMatches) {
    const primaryRank = pickPrimarySleeperRank(jkbRow, duplicateRows);
    for (const row of duplicateRows) {
      if (row.sleeperRank !== primaryRank) hidden.add(row.sleeperRank);
    }
  }
  return hidden;
}

export function buildDraftPreviewRows(
  sleeperRows: readonly SleeperDraftBoardRow[] = SLEEPER_DRAFT_BOARD_2026,
  jkbRows: readonly FantasyRankingRow[] = FANTASY_RANKINGS.rows,
): readonly DraftPreviewRow[] {
  const jkbBySleeperRank = buildJkbBySleeperRank(sleeperRows, jkbRows);
  const duplicatePresentationRanks = buildDuplicatePresentationSet(sleeperRows, jkbRows);

  return sleeperRows.map((row): DraftPreviewRow => {
    const jkb = jkbBySleeperRank.get(row.sleeperRank);
    const context = jkb ? getOverallRowContext(jkb.overallRank) : undefined;
    const parRow = jkb ? PAR_ROW_BY_JKB_OVERALL_RANK.get(jkb.overallRank) : undefined;
    const model = jkb ? getShadowModelRankRow(jkb.overallRank) : undefined;
    return {
      sleeperRank: row.sleeperRank,
      player: row.player,
      team: row.team,
      sourcePosition: row.sourcePosition,
      canonicalPosition: canonicalPositionForSource(row.sourcePosition),
      bye: row.bye,
      sleeperProjectedPoints: row.projectedPoints,
      sleeperProjectedPpg: row.projectedPpg,
      jkb,
      jkbProjectedPpg: parRow?.projectedPpg,
      jkbParPerGame: context?.parPerGame,
      modelRank: model?.modelRank ?? null,
      seasonPointsRank2025: context?.seasonRank2025?.byPoints,
      seasonPpgRank2025: context?.seasonRank2025?.byPpg,
      lastEightPointsRank: context?.lastEightRank?.rank,
      isDuplicatePresentation: duplicatePresentationRanks.has(row.sleeperRank),
    };
  });
}

export const DRAFT_PREVIEW_ROWS_2026: readonly DraftPreviewRow[] = buildDraftPreviewRows();

/**
 * Rows for the rendered board: one presentation row per real player (a
 * duplicate Sleeper listing is dropped here, never from
 * `DRAFT_PREVIEW_ROWS_2026` itself -- see `DraftPreviewRow.isDuplicatePresentation`),
 * filtered by position and free-text search.
 */
export function filterDraftPreviewRows(
  rows: readonly DraftPreviewRow[],
  position: "ALL" | FantasyPosition,
  query: string,
): readonly DraftPreviewRow[] {
  const needle = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (row.isDuplicatePresentation) return false;
    const posOk = position === "ALL" || row.canonicalPosition === position;
    if (!posOk) return false;
    if (!needle) return true;
    const team = row.team?.toLowerCase() ?? "";
    return row.player.toLowerCase().includes(needle) || team.includes(needle);
  });
}
