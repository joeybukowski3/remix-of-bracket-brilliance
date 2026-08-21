import type { FantasyPosition } from "@/lib/fantasy/rankings";
import type { PregameFeatureSnapshot } from "./features";
import { evaluateRankingMetrics, type ScoredPlayerWeek } from "./metrics";

export const PHASE_D1_SCHEMA_VERSION = "weekly-fantasy-phase-d1-v1" as const;

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export const PHASE_D1_PREREGISTRATION = deepFreeze({
  schemaVersion: "weekly-fantasy-phase-d1-preregistration-v1",
  frozenAt: "2026-08-21T15:00:00.000Z",
  positions: ["QB", "RB", "WR", "TE"] as FantasyPosition[],
  historicalEvidence: {
    foundation: 2023,
    selectionSeason: 2024,
    untouchedHoldout: 2025,
    prior: "prior-season actual PPG proxy only; never described as a preseason projection",
  },
  productionPrior: {
    season: 2026,
    authority: "data/fantasy/2026-par-consensus.json",
    representation: "2026 Projected PPG",
    parPerGameRelationship: "identical within-position ordering because replacement PPG is constant by position",
  },
  transitionCandidates: [1, 2, 3],
  selectionRule: "maximize 2024 macro-average weekly Spearman; within 0.005 choose the larger history threshold; 2025 remains unread",
  scoring: {
    beforeThreshold: "prior-season actual PPG historical proxy / preseason ROS in production",
    atThreshold: "current-season-to-date actual PPG using only prior player games",
    blending: "none",
  },
  evidenceSegments: { week1: [1, 1], early: [2, 4], established: [5, 18] },
  decisionThresholds: { QB: 12, RB: 24, WR: 24, TE: 12 },
  eligibility: "separate downstream concern; bye/out/reserve/unresolved identity never changes baseline strength",
  experimentalUsage: "not activated or imported by the D1 authority",
});

export type HistoricalTransitionAuthority = "historical-prior-season-proxy" | "current-season" | "unavailable";

export function historicalTransitionScore(row: PregameFeatureSnapshot, minimumHistoryGames: number): {
  score: number | null;
  authority: HistoricalTransitionAuthority;
} {
  if (!Number.isInteger(minimumHistoryGames) || minimumHistoryGames < 1) {
    throw new Error("minimumHistoryGames must be a positive integer");
  }
  if (row.baseline.rollingPpg.priorGames >= minimumHistoryGames && row.baseline.rollingPpg.seasonToDate != null) {
    return { score: row.baseline.rollingPpg.seasonToDate, authority: "current-season" };
  }
  if (row.baseline.priorSeasonPpg != null) {
    return { score: row.baseline.priorSeasonPpg, authority: "historical-prior-season-proxy" };
  }
  return { score: null, authority: "unavailable" };
}

function scored(rows: readonly PregameFeatureSnapshot[], minimumHistoryGames: number): ScoredPlayerWeek[] {
  return rows.map((row) => ({
    season: row.season,
    week: row.week,
    position: row.position,
    playerId: row.playerId,
    actualFantasyPoints: row.actualFantasyPoints,
    score: historicalTransitionScore(row, minimumHistoryGames).score,
  }));
}

export function selectSharedHistoryThreshold(validationRows: readonly PregameFeatureSnapshot[]) {
  if (validationRows.some((row) => row.season !== PHASE_D1_PREREGISTRATION.historicalEvidence.selectionSeason)) {
    throw new Error("D1 threshold selection accepts 2024 validation rows only; holdout isolation violated");
  }
  const candidates = PHASE_D1_PREREGISTRATION.transitionCandidates.map((threshold) => {
    const byPosition = Object.fromEntries(PHASE_D1_PREREGISTRATION.positions.map((position) => {
      const rows = validationRows.filter((row) => row.position === position);
      return [position, evaluateRankingMetrics(scored(rows, threshold), PHASE_D1_PREREGISTRATION.decisionThresholds[position])];
    })) as Record<FantasyPosition, ReturnType<typeof evaluateRankingMetrics>>;
    const correlations = Object.values(byPosition).map((metrics) => metrics.spearman).filter((value): value is number => value != null);
    const macroSpearman = correlations.length ? correlations.reduce((sum, value) => sum + value, 0) / correlations.length : null;
    return { threshold, macroSpearman, byPosition };
  });
  const best = [...candidates].sort((left, right) => {
    const delta = (right.macroSpearman ?? -Infinity) - (left.macroSpearman ?? -Infinity);
    return Math.abs(delta) <= 0.005 ? right.threshold - left.threshold : delta;
  })[0];
  return { selectedThreshold: best.threshold, candidates };
}

export function assertHistoricalCutoffs(rows: readonly PregameFeatureSnapshot[]): void {
  for (const row of rows) {
    const latest = row.cutoffs.playerHistoryLatest;
    if (latest && (latest.season > row.season || (latest.season === row.season && latest.week >= row.week))) {
      throw new Error(`Player-history leakage at ${row.season} week ${row.week} for ${row.playerId}`);
    }
  }
}
