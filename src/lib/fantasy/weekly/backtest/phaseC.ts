import type { FantasyPosition } from "@/lib/fantasy/rankings";
import type { BacktestFeatureKey } from "./featureRegistry";
import type { PregameFeatureSnapshot, RollingWindow } from "./features";
import { spearmanRankCorrelation, type ScoredPlayerWeek } from "./metrics";

export const PHASE_C_SCHEMA_VERSION = "weekly-fantasy-phase-c-v1" as const;

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export const PHASE_C_PREREGISTRATION = deepFreeze({
  schemaVersion: "weekly-fantasy-phase-c-preregistration-v1",
  frozenFrom: "Phase B model-comparison-v1 generated 2026-08-21T14:00:00.000Z",
  scoringVersion: "jkb-full-ppr-v1.0.0",
  candidates: {
    QB: {
      family: "baseline-usage",
      features: ["seasonToDatePpg", "last3PassAttempts", "last3RushAttempts"] as BacktestFeatureKey[],
      selectedLambda: 10,
      ablations: {
        removePassAttempts: ["seasonToDatePpg", "last3RushAttempts"],
        removeRushAttempts: ["seasonToDatePpg", "last3PassAttempts"],
        removeRecentProduction: ["last3PassAttempts", "last3RushAttempts"],
      } as Record<string, BacktestFeatureKey[]>,
    },
    WR: {
      family: "baseline-usage",
      features: ["seasonToDatePpg", "last3Targets", "last3TargetShare", "last3AirYardsShare"] as BacktestFeatureKey[],
      selectedLambda: 1,
      ablations: {
        removeTargets: ["seasonToDatePpg", "last3TargetShare", "last3AirYardsShare"],
        removeTargetShare: ["seasonToDatePpg", "last3Targets", "last3AirYardsShare"],
        removeAirYardsShare: ["seasonToDatePpg", "last3Targets", "last3TargetShare"],
        removeRecentProduction: ["last3Targets", "last3TargetShare", "last3AirYardsShare"],
      } as Record<string, BacktestFeatureKey[]>,
    },
  },
  transforms: {
    rollingUsage: "arithmetic mean of available exact-player prior current-season games; target week excluded",
    recentProduction: "arithmetic mean PPR over all prior current-season games",
    target: "unrounded jkb-full-ppr-v1.0.0 outcome",
  },
  missingData: "complete-case scoring; no imputation; production-policy research falls back to baseline player strength",
  standardization: "training-set mean and population standard deviation per feature; zero-variance scale is 1",
  ridge: {
    candidateLambdas: [0.01, 0.1, 1, 10, 100],
    phaseBSelection: "highest 2024 mean weekly Spearman, then coverage, then smaller lambda; 2025 unread",
    finalFit: "refit unchanged features/lambda on 2023+2024 before untouched 2025 scoring",
  },
  chronology: {
    foundation: [2023], validation: [2024], primaryHoldout: [2025],
    internalReplication: ["2024-weeks-1-9", "2024-weeks-10-18", "2024-odd", "2024-even", "2024-rolling-origin"],
  },
  sensitivity: {
    windows: ["last1", "last3", "last5", "seasonToDate"] as RollingWindow[],
    minimumHistory: ["0", "1", "2", "3+"],
    seasonSegments: { early: [1, 4], mid: [5, 9], late: [10, 18] },
    bootstrap: { unit: "season-week", iterations: 2000, seed: 20260821, confidenceLevel: 0.95 },
  },
  confidence: {
    high: "3+ prior current-season games, all frozen inputs present, resolved identity/availability",
    medium: "1-2 prior games and all frozen inputs present",
    low: "0 prior games or any frozen input missing; use baseline fallback",
  },
  advancementRule: {
    minimumHoldoutSpearmanDelta: 0.01,
    minimumCoverage: 0.85,
    maximumSegmentDegradation: -0.01,
    minimumBootstrapProbabilityPositive: 0.75,
    maximumPracticalMetricDegradation: -0.02,
    requirements: [
      "positive 2024 internal-replication direction in a majority of predetermined partitions",
      "at least one practical Top-N precision/recall/hit-rate improvement",
      "baseline fallback under missing frozen usage inputs",
      "zero benchmark, eligibility, leakage, monotonicity, and holdout-isolation violations",
    ],
  },
  positionAuthorities: {
    RB: "leakage-safe player-strength baseline; fixed 16-0 benchmark only",
    TE: "compare leakage-safe player-strength baseline with fixed 16-0; no fitted candidate",
  },
});

export function cloneForUsageWindow(row: PregameFeatureSnapshot, position: "QB" | "WR", window: RollingWindow) {
  const clone = structuredClone(row);
  const keys = position === "QB"
    ? ["passAttempts", "rushAttempts"] as const
    : ["targets", "targetShare", "airYardsShare"] as const;
  for (const key of keys) clone.usage[key].last3 = clone.usage[key][window];
  return clone;
}

export function phaseCTrainingRows(rows: readonly PregameFeatureSnapshot[], target: { season: number; week?: number }) {
  return rows.filter((row) => row.season < target.season || (row.season === target.season && target.week != null && row.week < target.week));
}

export function scoreWithBaselineFallback(candidate: number | null, baseline: number | null) {
  return candidate ?? baseline;
}

export function phaseCAdvanceDecision(checks: Readonly<Record<string, boolean>>) {
  return Object.values(checks).every(Boolean);
}

export function minimumHistoryBucket(row: PregameFeatureSnapshot): "0" | "1" | "2" | "3+" {
  const games = row.baseline.rollingPpg.priorGames;
  return games >= 3 ? "3+" : String(games) as "0" | "1" | "2";
}

export function phaseCConfidence(row: PregameFeatureSnapshot, features: readonly BacktestFeatureKey[], values: readonly (number | null)[]) {
  if (values.some((value) => value == null) || row.baseline.rollingPpg.priorGames === 0) return "low" as const;
  return row.baseline.rollingPpg.priorGames >= 3 ? "high" as const : "medium" as const;
}

export function scoredRows(
  rows: readonly PregameFeatureSnapshot[],
  scorer: (row: PregameFeatureSnapshot) => number | null,
): ScoredPlayerWeek[] {
  return rows.map((row) => ({
    season: row.season, week: row.week, position: row.position, playerId: row.playerId,
    actualFantasyPoints: row.actualFantasyPoints, score: scorer(row),
  }));
}

function percentile(values: readonly number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

export function rankMovement(
  rows: readonly PregameFeatureSnapshot[],
  baseline: (row: PregameFeatureSnapshot) => number | null,
  candidate: (row: PregameFeatureSnapshot) => number | null,
) {
  const groups = new Map<string, PregameFeatureSnapshot[]>();
  for (const row of rows) {
    const key = `${row.season}|${row.week}|${row.position}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const movements: Array<{ season: number; week: number; playerId: string; playerName: string; baselineRank: number; candidateRank: number; movement: number; beneficial: boolean }> = [];
  for (const group of groups.values()) {
    const complete = group.filter((row) => baseline(row) != null && candidate(row) != null);
    const baseOrder = [...complete].sort((a, b) => baseline(b)! - baseline(a)! || a.playerId.localeCompare(b.playerId));
    const candidateOrder = [...complete].sort((a, b) => candidate(b)! - candidate(a)! || a.playerId.localeCompare(b.playerId));
    const actualOrder = [...complete].sort((a, b) => b.actualFantasyPoints - a.actualFantasyPoints || a.playerId.localeCompare(b.playerId));
    const baseRank = new Map(baseOrder.map((row, index) => [row.playerId, index + 1]));
    const candidateRank = new Map(candidateOrder.map((row, index) => [row.playerId, index + 1]));
    const actualRank = new Map(actualOrder.map((row, index) => [row.playerId, index + 1]));
    for (const row of complete) {
      const before = baseRank.get(row.playerId)!;
      const after = candidateRank.get(row.playerId)!;
      movements.push({
        season: row.season, week: row.week, playerId: row.playerId, playerName: row.playerName,
        baselineRank: before, candidateRank: after, movement: after - before,
        beneficial: Math.abs(after - actualRank.get(row.playerId)!) < Math.abs(before - actualRank.get(row.playerId)!),
      });
    }
  }
  const absolute = movements.map((row) => Math.abs(row.movement));
  const large = movements.filter((row) => Math.abs(row.movement) >= 5);
  return {
    rows: movements.length,
    medianAbsolute: percentile(absolute, 0.5),
    percentile75: percentile(absolute, 0.75),
    percentile90: percentile(absolute, 0.9),
    maximumAbsolute: absolute.length ? Math.max(...absolute) : null,
    largeBeneficial: large.filter((row) => row.beneficial).length,
    largeHarmful: large.filter((row) => !row.beneficial).length,
    largestMoves: [...movements].sort((a, b) => Math.abs(b.movement) - Math.abs(a.movement) || a.playerId.localeCompare(b.playerId)).slice(0, 20),
  };
}

function weeklyMetric(
  rows: readonly PregameFeatureSnapshot[],
  scorer: (row: PregameFeatureSnapshot) => number | null,
  topK: number,
) {
  const scored = rows.filter((row) => scorer(row) != null);
  const spearman = scored.length >= 2
    ? spearmanRankCorrelation(scored.map((row) => row.actualFantasyPoints), scored.map((row) => scorer(row)!))
    : null;
  const slots = Math.min(topK, rows.length);
  const actual = new Set([...rows].sort((a, b) => b.actualFantasyPoints - a.actualFantasyPoints || a.playerId.localeCompare(b.playerId)).slice(0, slots).map((row) => row.playerId));
  const predicted = [...scored].sort((a, b) => scorer(b)! - scorer(a)! || a.playerId.localeCompare(b.playerId)).slice(0, Math.min(slots, scored.length));
  const hits = predicted.filter((row) => actual.has(row.playerId)).length;
  return { spearman, topN: slots ? hits / slots : null };
}

function lcg(seed: number) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(1664525, state) + 1013904223) >>> 0) / 4294967296);
}

export function groupedBootstrapDifference(
  rows: readonly PregameFeatureSnapshot[],
  baseline: (row: PregameFeatureSnapshot) => number | null,
  candidate: (row: PregameFeatureSnapshot) => number | null,
  topK: number,
  options: { iterations?: number; seed?: number } = {},
) {
  const groups = new Map<string, PregameFeatureSnapshot[]>();
  for (const row of rows) groups.set(`${row.season}|${row.week}`, [...(groups.get(`${row.season}|${row.week}`) ?? []), row]);
  const differences = [...groups.values()].map((group) => {
    const base = weeklyMetric(group, baseline, topK);
    const next = weeklyMetric(group, candidate, topK);
    return {
      spearman: base.spearman == null || next.spearman == null ? null : next.spearman - base.spearman,
      topN: base.topN == null || next.topN == null ? null : next.topN - base.topN,
    };
  }).filter((row): row is { spearman: number; topN: number } => row.spearman != null && row.topN != null);
  const iterations = options.iterations ?? 2000;
  const random = lcg(options.seed ?? 20260821);
  const samples = (key: "spearman" | "topN") => {
    const observed = differences.reduce((sum, row) => sum + row[key], 0) / differences.length;
    const draws = Array.from({ length: iterations }, () => {
      let sum = 0;
      for (let index = 0; index < differences.length; index += 1) sum += differences[Math.floor(random() * differences.length)][key];
      return sum / differences.length;
    }).sort((a, b) => a - b);
    return {
      observed, lower95: percentile(draws, 0.025), upper95: percentile(draws, 0.975),
      probabilityPositive: draws.filter((value) => value > 0).length / draws.length,
    };
  };
  return { weeks: differences.length, spearman: samples("spearman"), topNHitRate: samples("topN") };
}

export function baselineTier(row: PregameFeatureSnapshot, rank: number): string {
  if (row.position === "QB") return rank <= 7 ? "elite" : rank <= 18 ? "start-sit" : "deep";
  if (row.position === "WR") return rank <= 19 ? "elite" : rank <= 50 ? "start-sit" : "deep";
  if (row.position === "RB") return rank <= 12 ? "elite" : rank <= 36 ? "starter" : "deep";
  return rank <= 6 ? "elite" : rank <= 18 ? "starter" : "deep";
}

export function withBaselineTiers(rows: readonly PregameFeatureSnapshot[]) {
  const groups = new Map<string, PregameFeatureSnapshot[]>();
  for (const row of rows) groups.set(`${row.season}|${row.week}|${row.position}`, [...(groups.get(`${row.season}|${row.week}|${row.position}`) ?? []), row]);
  return [...groups.values()].flatMap((group) => [...group]
    .sort((a, b) => (b.baseline.rollingPpg.seasonToDate ?? Number.NEGATIVE_INFINITY) - (a.baseline.rollingPpg.seasonToDate ?? Number.NEGATIVE_INFINITY) || a.playerId.localeCompare(b.playerId))
    .map((row, index) => ({ row, baselineRank: index + 1, tier: baselineTier(row, index + 1) })));
}

export function phaseCMonotonicityChecks(
  rows: readonly PregameFeatureSnapshot[],
  scorer: (row: PregameFeatureSnapshot) => number | null,
  position: "QB" | "WR",
) {
  const keys = position === "QB" ? ["passAttempts", "rushAttempts"] as const : ["targets", "targetShare", "airYardsShare"] as const;
  const violations: string[] = [];
  for (const row of rows.filter((candidate) => candidate.position === position).slice(0, 500)) {
    const original = scorer(row);
    if (original == null) continue;
    for (const key of keys) {
      const clone = structuredClone(row);
      clone.usage[key].last3 = clone.usage[key].last3! + (key.includes("Share") ? 0.01 : 1);
      const changed = scorer(clone);
      if (changed != null && changed < original - 1e-9) violations.push(`${row.playerId}:${key}`);
    }
  }
  return violations;
}
