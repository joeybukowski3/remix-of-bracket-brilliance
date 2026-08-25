import type { WeeklyResearchPresentationRow } from "@/lib/fantasy/weekly/researchPresentation";

export type WeeklyResearchSortMode = "stat" | "rank";
export type WeeklyEvidenceSortKey =
  | "touches"
  | "yardsPerCarry"
  | "receivingTargets"
  | "targetShare"
  | "airYardsPerGame"
  | "targetsPerGame";
export type WeeklyResearchSortKey =
  | "rank"
  | "player"
  | "opponent"
  | "projectedFantasyPoints"
  | "seasonPpg"
  | "last5Ppg"
  | "matchup"
  | "opponentFpaSeason"
  | "opponentFpaLast5"
  | "trenches"
  | "epa"
  | "success"
  | WeeklyEvidenceSortKey;
export type WeeklyResearchSortDirection = "asc" | "desc";
export type WeeklyResearchSort = {
  key: WeeklyResearchSortKey;
  direction: WeeklyResearchSortDirection;
};

export const CANONICAL_WEEKLY_SORT: WeeklyResearchSort = { key: "rank", direction: "asc" };

const MATCHUP_STRENGTH = {
  great: 1,
  good: 2,
  neutral: 3,
  tough: 4,
  "very-tough": 5,
} as const;

const EVIDENCE_KEYS = new Set<WeeklyResearchSortKey>([
  "touches",
  "yardsPerCarry",
  "receivingTargets",
  "targetShare",
  "airYardsPerGame",
  "targetsPerGame",
]);

export function defaultWeeklySortDirection(
  key: WeeklyResearchSortKey,
  mode: WeeklyResearchSortMode,
): WeeklyResearchSortDirection {
  if (key === "rank" || key === "player" || key === "opponent" || key === "matchup") return "asc";
  if (key === "projectedFantasyPoints") return "desc";
  return mode === "rank" ? "asc" : "desc";
}

function metricValue(
  metric: { rawValue: number | null; displayRank: number | null },
  mode: WeeklyResearchSortMode,
): number | null {
  return mode === "rank" ? metric.displayRank : metric.rawValue;
}

function sortValue(
  presentation: WeeklyResearchPresentationRow,
  key: WeeklyResearchSortKey,
  mode: WeeklyResearchSortMode,
): number | string | null {
  const { row } = presentation;
  if (key === "rank") return row.positionRank;
  if (key === "player") return row.playerName.trim() || null;
  if (key === "opponent") return row.opponent.trim() || null;
  if (key === "projectedFantasyPoints") return row.projectedFantasyPoints;
  if (key === "seasonPpg") return metricValue(presentation.seasonPpg, mode);
  if (key === "last5Ppg") return metricValue(presentation.last5Ppg, mode);
  if (key === "opponentFpaSeason") return metricValue(presentation.opponentFpaSeason, mode);
  if (key === "opponentFpaLast5") return metricValue(presentation.opponentFpaLast5, mode);
  if (key === "matchup") return row.matchupRating?.id ? MATCHUP_STRENGTH[row.matchupRating.id] : null;
  if (key === "trenches" || key === "epa" || key === "success") {
    return metricValue(presentation.matchupEdges[key], mode);
  }
  if (EVIDENCE_KEYS.has(key)) {
    return metricValue(presentation.evidence[key as WeeklyEvidenceSortKey], mode);
  }
  return null;
}

function comparePresentValues(left: number | string, right: number | string): number {
  if (typeof left === "string" && typeof right === "string") {
    return left.localeCompare(right, undefined, { sensitivity: "base" });
  }
  return Number(left) - Number(right);
}

/**
 * Returns a presentation-only copy. Missing values always remain last, while
 * canonical rank and player ID provide deterministic tie handling.
 */
export function sortWeeklyResearchPresentation(
  rows: readonly WeeklyResearchPresentationRow[],
  sort: WeeklyResearchSort,
  mode: WeeklyResearchSortMode,
): readonly WeeklyResearchPresentationRow[] {
  return [...rows].sort((left, right) => {
    const leftValue = sortValue(left, sort.key, mode);
    const rightValue = sortValue(right, sort.key, mode);
    const leftMissing = leftValue == null || (typeof leftValue === "number" && !Number.isFinite(leftValue));
    const rightMissing = rightValue == null || (typeof rightValue === "number" && !Number.isFinite(rightValue));

    if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
    if (!leftMissing && !rightMissing) {
      const comparison = comparePresentValues(leftValue, rightValue);
      if (comparison !== 0) return sort.direction === "asc" ? comparison : -comparison;
    }

    return left.row.positionRank - right.row.positionRank
      || left.row.playerId.localeCompare(right.row.playerId);
  });
}
