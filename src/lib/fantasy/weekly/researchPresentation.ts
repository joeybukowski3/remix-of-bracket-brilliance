import type { MatchupGradeId } from "@/lib/fantasy/matchupGrade";
import type { WeeklyResearchMetric } from "@/lib/fantasy/weekly/researchContext";
import type { WeeklyFantasyResearchRow } from "@/lib/fantasy/weekly/researchJoin";
import { PERCENTILE_TIERS } from "@/lib/mlb/percentileColorScale";

export type WeeklyHeatTone =
  | "missing"
  | "gold"
  | "dark-green"
  | "green"
  | "light-green"
  | "neutral"
  | "light-red"
  | "red"
  | "strong-red";

export type WeeklyDisplayMetric = {
  rawValue: number | null;
  displayRank: number | null;
  poolSize: number;
  /** Favorable percentile: 100 is best and 0 is worst. */
  percentile: number | null;
  tone: WeeklyHeatTone;
};

export type WeeklyMatchupMetricKey = "trenches" | "epa" | "success";

export type WeeklyResearchPresentationRow = {
  row: WeeklyFantasyResearchRow;
  seasonPpg: WeeklyDisplayMetric;
  last5Ppg: WeeklyDisplayMetric;
  opponentFpaSeason: WeeklyDisplayMetric;
  opponentFpaLast5: WeeklyDisplayMetric;
  evidence: Record<keyof WeeklyFantasyResearchRow["research"]["evidence"], WeeklyDisplayMetric>;
  matchupEdges: Record<WeeklyMatchupMetricKey, WeeklyDisplayMetric>;
};

const mlbTier = (id: (typeof PERCENTILE_TIERS)[number]["id"]) =>
  PERCENTILE_TIERS.find((tier) => tier.id === id)!.style;

/**
 * Weekly fantasy reuses the MLB gold/green/neutral fills and borders. The
 * unfavorable half uses the requested JKB red language instead of the MLB
 * batter-table blue counter-scale.
 */
const HEAT_STYLES: Record<WeeklyHeatTone, { backgroundColor: string; color: string; border: string }> = {
  missing: { backgroundColor: "#f8fafc", color: "#64748b", border: "1px solid rgba(148, 163, 184, 0.18)" },
  gold: mlbTier("elite"),
  "dark-green": mlbTier("excellent"),
  green: mlbTier("great"),
  "light-green": mlbTier("aboveAverage"),
  neutral: mlbTier("average"),
  "light-red": { backgroundColor: "rgba(251, 113, 133, 0.18)", color: "#9f1239", border: "1px solid rgba(244, 63, 94, 0.22)" },
  red: { backgroundColor: "rgba(239, 68, 68, 0.38)", color: "#7f1d1d", border: "1px solid rgba(220, 38, 38, 0.32)" },
  "strong-red": { backgroundColor: "#dc2626", color: "#ffffff", border: "1px solid rgba(153, 27, 27, 0.45)" },
};

const HEAT_CLASSES: Record<WeeklyHeatTone, string> = {
  missing: "weekly-heat-missing",
  gold: "weekly-heat-gold",
  "dark-green": "weekly-heat-dark-green",
  green: "weekly-heat-green",
  "light-green": "weekly-heat-light-green",
  neutral: "weekly-heat-neutral",
  "light-red": "weekly-heat-light-red",
  red: "weekly-heat-red",
  "strong-red": "weekly-heat-strong-red",
};

export function weeklyHeatClass(tone: WeeklyHeatTone): string {
  return HEAT_CLASSES[tone];
}

export function weeklyHeatStyle(tone: WeeklyHeatTone): { backgroundColor: string; color: string; boxShadow: string } {
  const style = HEAT_STYLES[tone];
  return {
    backgroundColor: style.backgroundColor,
    color: style.color,
    boxShadow: style.border.replace("1px solid ", "inset 0 0 0 1px "),
  };
}

function validRank(rank: number | null | undefined, poolSize: number | null | undefined): rank is number {
  return Number.isInteger(rank)
    && Number.isInteger(poolSize)
    && (rank as number) >= 1
    && (poolSize as number) >= 1
    && (rank as number) <= (poolSize as number);
}

export function favorablePercentile(rank: number | null | undefined, poolSize: number | null | undefined): number | null {
  if (!validRank(rank, poolSize)) return null;
  return (((poolSize as number) - (rank as number) + 1) / (poolSize as number)) * 100;
}

/** Lower ranks are better. Position pools use the requested percentile bands. */
export function weeklyRankHeatTone(
  rank: number | null | undefined,
  poolSize: number | null | undefined,
): WeeklyHeatTone {
  if (!validRank(rank, poolSize)) return "missing";

  // The weekly team board uses explicit, easy-to-audit 1–32 bands.
  if (poolSize === 32) {
    if (rank <= 3) return "gold";
    if (rank <= 6) return "dark-green";
    if (rank <= 10) return "green";
    if (rank <= 14) return "light-green";
    if (rank <= 18) return "neutral";
    if (rank <= 22) return "light-red";
    if (rank <= 27) return "red";
    return "strong-red";
  }

  const share = rank / poolSize;
  if (share <= 0.05) return "gold";
  if (share <= 0.15) return "dark-green";
  if (share <= 0.30) return "green";
  if (share <= 0.45) return "light-green";
  if (share <= 0.60) return "neutral";
  if (share <= 0.75) return "light-red";
  if (share <= 0.90) return "red";
  return "strong-red";
}

export function weeklyRankHeatClass(
  rank: number | null | undefined,
  poolSize: number | null | undefined,
): string {
  return weeklyHeatClass(weeklyRankHeatTone(rank, poolSize));
}

export function matchupGradeHeatTone(grade: MatchupGradeId | null | undefined): WeeklyHeatTone {
  if (grade === "great") return "gold";
  if (grade === "good") return "dark-green";
  if (grade === "neutral") return "neutral";
  if (grade === "tough") return "red";
  if (grade === "very-tough") return "strong-red";
  return "missing";
}

export function matchupGradeHeatClass(grade: MatchupGradeId | null | undefined): string {
  return weeklyHeatClass(matchupGradeHeatTone(grade));
}

function displayMetric(rawValue: number | null, displayRank: number | null, poolSize: number): WeeklyDisplayMetric {
  return {
    rawValue,
    displayRank,
    poolSize,
    percentile: favorablePercentile(displayRank, poolSize),
    tone: weeklyRankHeatTone(displayRank, poolSize),
  };
}

export function prepareWeeklyMetric(metric: WeeklyResearchMetric): WeeklyDisplayMetric {
  return displayMetric(metric.value, metric.rank, metric.poolSize);
}

function rankMatchupEdges(
  rows: readonly WeeklyFantasyResearchRow[],
  key: WeeklyMatchupMetricKey,
): Map<string, WeeklyDisplayMetric> {
  const valuesByTeam = new Map<string, number>();
  for (const row of rows) {
    const value = row.matchupEdges[key].rankDifference;
    if (value != null && Number.isFinite(value)) valuesByTeam.set(row.team.toUpperCase(), value);
  }

  const ranked = [...valuesByTeam.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const poolSize = ranked.length;
  const result = new Map<string, WeeklyDisplayMetric>();
  let priorValue: number | null = null;
  let priorRank = 0;
  ranked.forEach(([team, value], index) => {
    const rank = priorValue !== null && value === priorValue ? priorRank : index + 1;
    result.set(team, displayMetric(value, rank, poolSize));
    priorValue = value;
    priorRank = rank;
  });
  return result;
}

/**
 * Adds display-only values without sorting or mutating the canonical rows.
 * Player ranks come from the selected-position research pool. Opponent FPA
 * retains its 32-opponent pool; matchup edges are ranked once per NFL team.
 */
export function prepareWeeklyResearchPresentation(
  rows: readonly WeeklyFantasyResearchRow[],
): readonly WeeklyResearchPresentationRow[] {
  const edgeRanks = {
    trenches: rankMatchupEdges(rows, "trenches"),
    epa: rankMatchupEdges(rows, "epa"),
    success: rankMatchupEdges(rows, "success"),
  };

  return rows.map((row) => {
    const team = row.team.toUpperCase();
    const missingEdge = (key: WeeklyMatchupMetricKey) =>
      displayMetric(row.matchupEdges[key].rankDifference, null, edgeRanks[key].size);
    return {
      row,
      seasonPpg: prepareWeeklyMetric(row.research.seasonPpg),
      last5Ppg: prepareWeeklyMetric(row.research.last5Ppg),
      opponentFpaSeason: prepareWeeklyMetric(row.research.opponentFpaSeason),
      opponentFpaLast5: prepareWeeklyMetric(row.research.opponentFpaLast5),
      evidence: {
        touches: prepareWeeklyMetric(row.research.evidence.touches),
        redZoneTouches: prepareWeeklyMetric(row.research.evidence.redZoneTouches),
        yardsPerCarry: prepareWeeklyMetric(row.research.evidence.yardsPerCarry),
        receivingTargets: prepareWeeklyMetric(row.research.evidence.receivingTargets),
        targetShare: prepareWeeklyMetric(row.research.evidence.targetShare),
        airYardsPerGame: prepareWeeklyMetric(row.research.evidence.airYardsPerGame),
        targetsPerGame: prepareWeeklyMetric(row.research.evidence.targetsPerGame),
      },
      matchupEdges: {
        trenches: edgeRanks.trenches.get(team) ?? missingEdge("trenches"),
        epa: edgeRanks.epa.get(team) ?? missingEdge("epa"),
        success: edgeRanks.success.get(team) ?? missingEdge("success"),
      },
    };
  });
}
