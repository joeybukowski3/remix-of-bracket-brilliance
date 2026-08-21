import type { FantasyPosition } from "@/lib/fantasy/rankings";
import type { WeeklyFantasyModelInput } from "@/lib/fantasy/weekly/contract";
import { normalizeWeeklyUsage } from "@/lib/fantasy/weekly/usage";

export type BenchmarkScenario =
  | "elite-favorable" | "elite-poor" | "average-favorable" | "high-team-total"
  | "low-team-total" | "favorite" | "underdog" | "bye" | "out" | "questionable"
  | "major-workload-increase" | "backup-replacing-starter" | "changed-teams"
  | "missing-market" | "missing-usage";

export type WeeklyInputBenchmark = {
  id: string;
  scenario: BenchmarkScenario;
  input: WeeklyFantasyModelInput;
  expectations: {
    eligible: boolean;
    directionality: string[];
    missingAuthorities: string[];
  };
};

const POSITION_SCENARIOS: Record<FantasyPosition, readonly BenchmarkScenario[]> = {
  QB: ["elite-favorable", "elite-poor", "high-team-total", "low-team-total", "favorite", "bye", "out", "questionable", "backup-replacing-starter", "missing-market"],
  RB: ["elite-favorable", "elite-poor", "average-favorable", "high-team-total", "low-team-total", "major-workload-increase", "out", "questionable", "backup-replacing-starter", "missing-usage"],
  WR: ["elite-favorable", "elite-poor", "average-favorable", "high-team-total", "favorite", "underdog", "bye", "questionable", "changed-teams", "missing-market"],
  TE: ["elite-favorable", "elite-poor", "average-favorable", "low-team-total", "favorite", "underdog", "out", "major-workload-increase", "changed-teams", "missing-usage"],
};

function benchmarkInput(position: FantasyPosition, scenario: BenchmarkScenario, index: number): WeeklyFantasyModelInput {
  const isBye = scenario === "bye";
  const isOut = scenario === "out";
  const missingMarket = scenario === "missing-market";
  const missingUsage = scenario === "missing-usage" || scenario === "backup-replacing-starter";
  const questionable = scenario === "questionable";
  const highTotal = scenario === "high-team-total";
  const lowTotal = scenario === "low-team-total";
  const underdog = scenario === "underdog";
  const poor = scenario === "elite-poor";
  const favorable = scenario === "elite-favorable" || scenario === "average-favorable";
  const week = scenario === "changed-teams" ? 9 : 6;
  const playerNumber = `${position}${String(index + 1).padStart(2, "0")}`;
  const usage = missingUsage
    ? normalizeWeeklyUsage({})
    : normalizeWeeklyUsage({
        offensiveSnaps: 50 + index,
        snapShare: Math.min(0.95, 0.62 + index * 0.02),
        passAttempts: position === "QB" ? 31 : 0,
        completions: position === "QB" ? 20 : 0,
        rushAttempts: position === "RB" ? 16 : position === "QB" ? 5 : 1,
        targets: position === "WR" ? 8 : position === "TE" ? 6 : position === "RB" ? 4 : 0,
        receptions: position === "WR" ? 5 : position === "TE" ? 4 : position === "RB" ? 3 : 0,
        targetShare: position === "WR" || position === "TE" || position === "RB" ? 0.2 : 0,
      });
  const missingInputs = [
    ...(missingMarket ? ["market"] : []),
    ...(missingUsage ? ["usage"] : []),
    ...(scenario === "backup-replacing-starter" ? ["starter-role"] : []),
  ];

  return {
    schemaVersion: "weekly-fantasy-model-input-v1",
    season: 2026,
    week,
    scoringFormat: "PPR",
    scoringVersion: "jkb-full-ppr-v1.0.0",
    player: {
      playerId: `gsis:benchmark-${playerNumber}`,
      playerName: `${position} Benchmark ${index + 1}`,
      position,
      externalIds: { gsis: `benchmark-${playerNumber}`, pfr: null, espn: null },
      starterStatus: "unknown",
    },
    team: scenario === "changed-teams" ? "buf" : "det",
    opponent: isBye ? null : "gb",
    homeAway: isBye ? "bye" : index % 2 ? "away" : "home",
    baselineProjectedPpg: scenario.startsWith("elite") ? 22 : 13,
    market: {
      homeSpread: missingMarket ? null : underdog ? 6.5 : -4.5,
      total: missingMarket ? null : highTotal ? 54.5 : lowTotal ? 37.5 : 46.5,
      impliedTeamTotal: missingMarket ? null : highTotal ? 29.5 : lowTotal ? 17.5 : underdog ? 20 : 25,
      sourceAsOf: missingMarket ? null : "2026-10-10T12:00:00.000Z",
    },
    usage,
    availability: {
      status: isOut ? "out" : questionable ? "questionable" : "active",
      practiceStatus: questionable ? "LIMITED" : null,
      sourceSeason: 2026,
      sourceWeek: week,
      sourceAsOf: "2026-10-10T12:00:00.000Z",
      isStale: false,
    },
    matchup: {
      grade: poor ? "Very Tough" : favorable ? "Great" : "Neutral",
      fpaSeason: 2025,
      fpaRank: poor ? 31 : favorable ? 3 : 17,
      fantasyPointsAllowed: poor ? 14 : favorable ? 25 : 19,
    },
    teamContext: {
      offensiveEpaPerPlay: null,
      defensiveEpaPerPlayAllowed: null,
      offensiveSuccessRate: null,
      defensiveSuccessRateAllowed: null,
      paceRank: null,
    },
    provenance: [{
      fieldGroup: "benchmark",
      source: "deterministic Phase A fixture",
      sourceSeason: 2026,
      sourceWeek: week,
      sourceAsOf: "2026-10-10T12:00:00.000Z",
      generatedAt: "2026-10-10T13:00:00.000Z",
      schemaVersion: "weekly-input-benchmarks-v1",
    }],
    missingInputs,
    staleInputs: [],
  };
}

function expectations(scenario: BenchmarkScenario) {
  const missingAuthorities = [
    ...(scenario === "missing-market" ? ["market"] : []),
    ...(scenario === "missing-usage" ? ["usage"] : []),
    ...(scenario === "backup-replacing-starter" ? ["usage", "starter-role"] : []),
  ];
  return {
    eligible: scenario !== "bye" && scenario !== "out",
    directionality: [scenario],
    missingAuthorities,
  };
}

export const WEEKLY_INPUT_BENCHMARKS: readonly WeeklyInputBenchmark[] = (
  Object.entries(POSITION_SCENARIOS) as Array<[FantasyPosition, readonly BenchmarkScenario[]]>
).flatMap(([position, scenarios]) => scenarios.map((scenario, index) => ({
  id: `${position.toLowerCase()}-${String(index + 1).padStart(2, "0")}-${scenario}`,
  scenario,
  input: benchmarkInput(position, scenario, index),
  expectations: expectations(scenario),
})));
