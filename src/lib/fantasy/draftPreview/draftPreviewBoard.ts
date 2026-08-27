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
import { computeDisplayTeam, computeRosterPosition, type RosterPosition } from "@/lib/fantasy/draftPreview/rosterPosition";
import { MALFORMED_RANKS, SUPPRESSED_DUPLICATE_RANKS } from "@/lib/fantasy/draftPreview/presentationSuppression";
import type { SleeperDraftBoardRow } from "@/lib/fantasy/draftPreview/sleeperCsv";

export type DraftPreviewRow = {
  sleeperRank: number;
  player: string;
  team: string | null;
  sourcePosition: string;
  /** JKB-tracked position (QB/RB/WR/TE) this row maps to, or null if out of scope (DEF/K). Drives the JKB ranking/PAR join -- untouched by the Phase 2C identity-display audit. */
  canonicalPosition: FantasyPosition | null;
  /**
   * DISPLAY team, corrected against the audited canonical 2026 nflverse
   * roster snapshot when a stale-team conflict was confirmed (see
   * `docs/fantasy-draft-preview-identity-audit-2026.md`). Falls back to the
   * raw Sleeper `team` when no correction applies. `team` above always keeps
   * the original Sleeper source value for provenance.
   */
  displayTeam: string | null;
  /**
   * DISPLAY roster-slot position (adds K/DST to `canonicalPosition`'s
   * QB/RB/WR/TE scope, and applies the same audited position correction).
   * Used only for the Starting Roster table -- never for the JKB
   * ranking/PAR join, which stays on `canonicalPosition`.
   */
  rosterPosition: RosterPosition | null;
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
   * True when this source row is a confirmed duplicate Sleeper listing of a
   * real player already presented under a lower Sleeper Rank (e.g. Dylan
   * Sampson appears twice in the source at ranks 89 and 188 -- 89 is
   * retained, 188 is suppressed). Driven by the audited canonical-identity
   * duplicate groups (`presentationSuppression.ts`), not by whether the row
   * happens to share a JKB join -- so a duplicate is caught even when the
   * two Sleeper rows disagree on position (e.g. Jalen Milroe at QB and RB).
   * The row still exists in `DRAFT_PREVIEW_ROWS_2026` for provenance/QA --
   * it is only excluded from the rendered board by `filterDraftPreviewRows`.
   */
  isDuplicatePresentation: boolean;
  /**
   * True when this source row is confirmed malformed (not a real
   * draftable player -- e.g. an NFL team name in the player column with a
   * fabricated stat line). Preserved in `DRAFT_PREVIEW_ROWS_2026` for
   * provenance/QA; excluded from the rendered board by
   * `filterDraftPreviewRows` and therefore never reachable from My
   * Draft/Starting Roster or any total.
   */
  isMalformedSourceRow: boolean;
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

export function buildDraftPreviewRows(
  sleeperRows: readonly SleeperDraftBoardRow[] = SLEEPER_DRAFT_BOARD_2026,
  jkbRows: readonly FantasyRankingRow[] = FANTASY_RANKINGS.rows,
): readonly DraftPreviewRow[] {
  const jkbBySleeperRank = buildJkbBySleeperRank(sleeperRows, jkbRows);

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
      displayTeam: computeDisplayTeam(row.sleeperRank, row.team),
      rosterPosition: computeRosterPosition(row.sleeperRank, row.sourcePosition),
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
      isDuplicatePresentation: SUPPRESSED_DUPLICATE_RANKS.has(row.sleeperRank),
      isMalformedSourceRow: MALFORMED_RANKS.has(row.sleeperRank),
    };
  });
}

export const DRAFT_PREVIEW_ROWS_2026: readonly DraftPreviewRow[] = buildDraftPreviewRows();

/**
 * Rows for the rendered board: one presentation row per real player (a
 * duplicate Sleeper listing is dropped here, never from
 * `DRAFT_PREVIEW_ROWS_2026` itself -- see `DraftPreviewRow.isDuplicatePresentation`),
 * confirmed-malformed rows dropped (`isMalformedSourceRow`), filtered by
 * position and free-text search.
 */
export function filterDraftPreviewRows(
  rows: readonly DraftPreviewRow[],
  position: "ALL" | FantasyPosition,
  query: string,
): readonly DraftPreviewRow[] {
  const needle = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (row.isDuplicatePresentation || row.isMalformedSourceRow) return false;
    const posOk = position === "ALL" || row.canonicalPosition === position;
    if (!posOk) return false;
    if (!needle) return true;
    const team = row.team?.toLowerCase() ?? "";
    return row.player.toLowerCase().includes(needle) || team.includes(needle);
  });
}
