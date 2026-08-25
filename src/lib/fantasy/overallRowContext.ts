/**
 * Extra context for the Overall board's rows.
 *
 * Overall renders JKB workbook rows, which carry their own rank fields but not
 * PAR/G or stable source identity. PAR/G remains limited to the approved PAR
 * rows. Historical season ranks use the full ROS consensus identity bridge,
 * while L8 uses the canonical nflverse player identity artifact.
 *
 * Missing joins remain undefined and render N/A; nothing is fabricated.
 */

import { FANTASY_PAR_ROWS, type FantasyParRankingRow } from "@/lib/fantasy/parRankings";
import { getParActual2025, type FantasyParActual2025 } from "@/lib/fantasy/parActual2025";
import { getLastEightRank, type LastEightRank } from "@/lib/fantasy/lastEightRanks2025";
import { getRosConsensusIdentity } from "@/lib/fantasy/rosPlayerIdentity";
import { FANTASY_RANKINGS, type FantasyRankingRow } from "@/lib/fantasy/rankings";
import { getSeasonRank2025, type SeasonRank2025 } from "@/lib/fantasy/seasonRanks2025";

export type OverallRowContext = {
  /** Approved projected PAR/G, taken verbatim from the PAR row. */
  parPerGame?: number;
  /** 2025 positional finish by total points and by PPG. */
  seasonRank2025?: SeasonRank2025;
  /** Populated 2025 season evidence, including sample size. */
  seasonActual2025?: FantasyParActual2025;
  /** Last-eight total-points positional rank from canonical player-game history. */
  lastEightRank?: LastEightRank;
  /** Stable ROS source key used for the existing PAR-file joins. */
  rosSourceId?: string;
};

export function buildOverallRowContext(
  parRows: readonly FantasyParRankingRow[],
  rankingRows: readonly FantasyRankingRow[] = FANTASY_RANKINGS.rows,
): ReadonlyMap<number, OverallRowContext> {
  const index = new Map<number, OverallRowContext>();
  for (const par of parRows) {
    if (par.jkbOverallRank == null) continue;
    index.set(par.jkbOverallRank, {
      parPerGame: par.parPerGame,
    });
  }
  for (const row of rankingRows) {
    const prior = index.get(row.overallRank) ?? {};
    const identity = getRosConsensusIdentity(row);
    const rosSourceId = identity?.["Source ID"];
    index.set(row.overallRank, {
      ...prior,
      rosSourceId,
      seasonRank2025: getSeasonRank2025(rosSourceId),
      seasonActual2025: getParActual2025(rosSourceId),
      lastEightRank: getLastEightRank(row),
    });
  }
  return index;
}

const CONTEXT_BY_OVERALL_RANK = buildOverallRowContext(FANTASY_PAR_ROWS);

/** Empty context for an unknown overall rank. */
const EMPTY: OverallRowContext = {};

export function getOverallRowContext(overallRank: number): OverallRowContext {
  return CONTEXT_BY_OVERALL_RANK.get(overallRank) ?? EMPTY;
}
