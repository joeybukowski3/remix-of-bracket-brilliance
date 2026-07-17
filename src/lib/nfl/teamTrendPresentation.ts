import type { NflTrendRecord } from "@/lib/nfl/teamTrends";

export type NflTrendSortKey = "finalRank" | "ratingChange" | "rankChange" | "offenseChange" | "defenseChange";

export const NFL_TREND_SORT_LABELS: Record<NflTrendSortKey, string> = {
  finalRank: "Final-eight rank",
  ratingChange: "Rating change",
  rankChange: "Rank change",
  offenseChange: "Offense change",
  defenseChange: "Defense change",
};

const TREND_VALUE_BY_SORT: Record<NflTrendSortKey, (record: NflTrendRecord) => number | null> = {
  finalRank: (record) => record.finalEight.rank,
  ratingChange: (record) => record.deltas.rating,
  rankChange: (record) => record.deltas.rank,
  offenseChange: (record) => record.deltas.offense,
  defenseChange: (record) => record.deltas.defense,
};

export function sortTrendRowsForNflPage(
  records: readonly NflTrendRecord[],
  sortKey: NflTrendSortKey
): NflTrendRecord[] {
  const valueFor = TREND_VALUE_BY_SORT[sortKey];
  const direction = sortKey === "finalRank" ? "asc" : "desc";
  return [...records].sort((a, b) => {
    const av = valueFor(a);
    const bv = valueFor(b);
    const aNull = av === null || !Number.isFinite(av);
    const bNull = bv === null || !Number.isFinite(bv);
    if (aNull !== bNull) return aNull ? 1 : -1;
    if (!aNull && !bNull && av !== bv) {
      return direction === "asc" ? av - bv : bv - av;
    }
    const aRank = a.finalEight.rank ?? Number.POSITIVE_INFINITY;
    const bRank = b.finalEight.rank ?? Number.POSITIVE_INFINITY;
    if (aRank !== bRank) return aRank - bRank;
    return a.name.localeCompare(b.name);
  });
}
