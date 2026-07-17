import type {
  NflTrendClassification,
  NflTrendConfidenceLevel,
  NflTrendRecord,
} from "@/lib/nfl/teamTrends";

export type NflTrendSortKey = "finalRank" | "ratingChange" | "rankChange" | "offenseChange" | "defenseChange";

export const NFL_TREND_SORT_LABELS: Record<NflTrendSortKey, string> = {
  finalRank: "Final-eight rank",
  ratingChange: "Rating change",
  rankChange: "Rank change",
  offenseChange: "Offense change",
  defenseChange: "Defense change",
};

export const NFL_TREND_CLASSIFICATION_LABELS: Record<NflTrendClassification, string> = {
  strong_improvement: "Strong late-season improvement",
  moderate_improvement: "Moderate late-season improvement",
  stable: "Stable late-season profile",
  moderate_decline: "Moderate late-season decline",
  strong_decline: "Strong late-season decline",
  insufficient_data: "Insufficient data",
};

export type NflTrendMovementTone = "up" | "down" | "neutral";
export type NflTrendClassificationTone = NflTrendMovementTone | "low";

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

export function formatTrendNumber(value: number | null, digits = 1): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

export function formatTrendRank(rank: number | null): string {
  return rank === null ? "—" : `#${rank}`;
}

export function rankMovementLabel(value: number | null): string {
  if (value === null) return "No rank movement available";
  if (value > 0) return `Improved ${value} spots`;
  if (value < 0) return `Declined ${Math.abs(value)} spots`;
  return "No rank change";
}

export function movementLabel(value: number | null, unit: string, digits = 1): string {
  if (value === null) return `No ${unit} movement available`;
  if (value > 0) return `Improved by ${value.toFixed(digits)} ${unit}`;
  if (value < 0) return `Declined by ${Math.abs(value).toFixed(digits)} ${unit}`;
  return `No ${unit} change`;
}

export function movementArrow(value: number | null, digits = 1): string {
  if (value === null) return "—";
  if (value > 0) return `↑ ${value.toFixed(digits)}`;
  if (value < 0) return `↓ ${Math.abs(value).toFixed(digits)}`;
  return "→ 0";
}

export function rankMovementArrow(value: number | null): string {
  if (value === null) return "—";
  if (value > 0) return `↑ ${value}`;
  if (value < 0) return `↓ ${Math.abs(value)}`;
  return "→ 0";
}

export function movementTone(value: number | null): NflTrendMovementTone {
  if (value === null || value === 0) return "neutral";
  return value > 0 ? "up" : "down";
}

export function classificationTone(classification: NflTrendClassification): NflTrendClassificationTone {
  if (classification.endsWith("improvement")) return "up";
  if (classification.endsWith("decline")) return "down";
  if (classification === "insufficient_data") return "low";
  return "neutral";
}

export function confidenceTone(level: NflTrendConfidenceLevel): NflTrendClassificationTone {
  if (level === "high") return "up";
  if (level === "medium") return "neutral";
  return "low";
}

export function buildNflTeamTrendSummary(record: NflTrendRecord): string {
  const statements: string[] = [];

  if (record.fullSeason.rank !== null && record.finalEight.rank !== null) {
    statements.push(
      `${record.name} moved from #${record.fullSeason.rank} over the full 2025 season to #${record.finalEight.rank} over its final eight games.`
    );
  } else if (record.deltas.rating !== null) {
    statements.push(
      `${record.name} changed by ${formatTrendNumber(record.deltas.rating, 1)} public-scale rating points over its final eight games.`
    );
  }

  const offense = record.deltas.offense;
  const defense = record.deltas.defense;
  if (offense !== null && defense !== null) {
    if (offense > 0 && defense > 0) {
      statements.push(
        `Both offense and defense improved, with ${Math.abs(offense) >= Math.abs(defense) ? "offense" : "defense"} showing the larger movement.`
      );
    } else if (offense > 0 && defense < 0) {
      statements.push("Offense improved while defense declined.");
    } else if (offense < 0 && defense > 0) {
      statements.push("Defense improved while offense declined.");
    } else if (offense < 0 && defense < 0) {
      statements.push(
        `Both offense and defense declined, with ${Math.abs(offense) >= Math.abs(defense) ? "offense" : "defense"} showing the larger movement.`
      );
    } else if (offense === 0 && defense === 0) {
      statements.push("Offense and defense were unchanged by the displayed z-score deltas.");
    } else {
      statements.push(
        `${offense === 0 ? "Offense was unchanged" : `Offense moved ${formatTrendNumber(offense, 2)}`} while ${defense === 0 ? "defense was unchanged" : `defense moved ${formatTrendNumber(defense, 2)}`}.`
      );
    }
  }

  return statements.join(" ");
}
