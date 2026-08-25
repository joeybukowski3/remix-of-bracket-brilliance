/**
 * 2025 positional finish, ranked two ways.
 *
 * Both ranks are computed here from the values already in
 * `data/fantasy/2025-par-actual.json` — no new file and no new join. For each
 * position, every player with populated 2025 data is sorted by total fantasy
 * points (descending) for the points rank, and separately by PPG (descending)
 * for the per-game rank. The two orders differ whenever a player missed games.
 *
 * Ranking is competition style: equal values share a rank and the next rank
 * skips accordingly, so no two players are ordered arbitrarily.
 *
 * The population is every row with 2025 data, including rows with no Source ID.
 * Those players cannot be joined to a board row, but excluding them would
 * understate everyone else's finish.
 */

import parActualSource from "../../../data/fantasy/2025-par-actual.json";
import type { FantasyParActualSourceRow } from "@/lib/fantasy/parActual2025";

export type SeasonRank2025 = {
  /** Rank within the position by total 2025 fantasy points. */
  byPoints: number;
  /** Rank within the position by 2025 points per game. */
  byPpg: number;
  /** Size of the ranked pool at that position. */
  poolSize: number;
  position: string;
};

const rawRows = parActualSource as readonly FantasyParActualSourceRow[];

type Ranked = { sourceId: string | null; value: number };

/** Competition ranking: ties share a rank, the next rank skips the tied count. */
function rankDescending(entries: readonly Ranked[]): Map<string, number> {
  const sorted = [...entries].sort(
    (a, b) => b.value - a.value || (a.sourceId ?? "").localeCompare(b.sourceId ?? ""),
  );
  const ranks = new Map<string, number>();
  let previousValue: number | null = null;
  let previousRank = 0;

  sorted.forEach((entry, index) => {
    const rank = previousValue !== null && entry.value === previousValue ? previousRank : index + 1;
    previousValue = entry.value;
    previousRank = rank;
    if (entry.sourceId) ranks.set(entry.sourceId, rank);
  });

  return ranks;
}

export function buildSeasonRanks2025(
  sourceRows: readonly FantasyParActualSourceRow[],
): ReadonlyMap<string, SeasonRank2025> {
  const byPosition = new Map<string, FantasyParActualSourceRow[]>();
  for (const row of sourceRows) {
    // A player needs both measures to be ranked on either.
    if (!Number.isFinite(row["2025 Fantasy Points"]) || !Number.isFinite(row["2025 PPG"])) continue;
    byPosition.set(row.Position, [...(byPosition.get(row.Position) ?? []), row]);
  }

  const result = new Map<string, SeasonRank2025>();
  for (const [position, rows] of byPosition) {
    const pointsRanks = rankDescending(
      rows.map((row) => ({ sourceId: row["Source ID"], value: row["2025 Fantasy Points"] as number })),
    );
    const ppgRanks = rankDescending(
      rows.map((row) => ({ sourceId: row["Source ID"], value: row["2025 PPG"] as number })),
    );

    for (const row of rows) {
      const sourceId = row["Source ID"];
      if (!sourceId) continue;
      result.set(sourceId, {
        byPoints: pointsRanks.get(sourceId)!,
        byPpg: ppgRanks.get(sourceId)!,
        poolSize: rows.length,
        position,
      });
    }
  }

  return result;
}

export const SEASON_RANKS_2025 = buildSeasonRanks2025(rawRows);

/** Returns the player's 2025 positional finish, or undefined with no 2025 data. */
export function getSeasonRank2025(sourceId: string | undefined): SeasonRank2025 | undefined {
  return sourceId ? SEASON_RANKS_2025.get(sourceId) : undefined;
}
