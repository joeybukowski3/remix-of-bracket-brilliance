/**
 * Extra context for the Overall board's rows.
 *
 * Overall renders JKB workbook rows, which carry their own rank fields but not
 * PAR/G or a Source ID. Both are reachable through the already-built approved
 * PAR rows, which record the `jkbOverallRank` they joined to — so this module
 * only indexes existing values and recomputes nothing.
 *
 * Only the approved PAR universe (QB18 / RB66 / WR78 / TE18) has a PAR row, so
 * players outside it resolve to `undefined` for every field here. Those cells
 * render a dash; nothing is fabricated to fill them.
 */

import { FANTASY_PAR_ROWS, type FantasyParRankingRow } from "@/lib/fantasy/parRankings";
import { getSeasonRank2025, type SeasonRank2025 } from "@/lib/fantasy/seasonRanks2025";

export type OverallRowContext = {
  /** Approved projected PAR/G, taken verbatim from the PAR row. */
  parPerGame?: number;
  /** 2025 positional finish by total points and by PPG. */
  seasonRank2025?: SeasonRank2025;
};

export function buildOverallRowContext(
  parRows: readonly FantasyParRankingRow[],
): ReadonlyMap<number, OverallRowContext> {
  const index = new Map<number, OverallRowContext>();
  for (const par of parRows) {
    if (par.jkbOverallRank == null) continue;
    index.set(par.jkbOverallRank, {
      parPerGame: par.parPerGame,
      seasonRank2025: getSeasonRank2025(par.sourceId),
    });
  }
  return index;
}

const CONTEXT_BY_OVERALL_RANK = buildOverallRowContext(FANTASY_PAR_ROWS);

/** Empty context for players outside the approved PAR universe. */
const EMPTY: OverallRowContext = {};

export function getOverallRowContext(overallRank: number): OverallRowContext {
  return CONTEXT_BY_OVERALL_RANK.get(overallRank) ?? EMPTY;
}
