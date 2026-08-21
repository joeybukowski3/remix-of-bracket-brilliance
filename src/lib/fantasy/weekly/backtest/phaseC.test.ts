import type { PregameFeatureSnapshot } from "./features";
import {
  cloneForUsageWindow, groupedBootstrapDifference, minimumHistoryBucket, PHASE_C_PREREGISTRATION,
  phaseCAdvanceDecision, phaseCConfidence, phaseCMonotonicityChecks, phaseCTrainingRows, rankMovement,
  scoreWithBaselineFallback, withBaselineTiers,
} from "./phaseC";

function snapshot(season: number, week: number, id: string, baseline: number, actual = baseline): PregameFeatureSnapshot {
  const rolling = { last1: baseline + 1, last3: baseline, last5: baseline - 1, seasonToDate: baseline - 2, priorGames: Math.max(0, week - 1), availableGames: Math.max(0, week - 1) };
  return {
    schemaVersion: "weekly-backtest-features-v1", season, week, playerId: id, playerName: id,
    position: "QB", team: "buf", opponent: "mia", actualFantasyPoints: actual,
    baseline: { priorSeasonPpg: baseline, rollingPpg: rolling },
    usage: { snapShare: rolling, passAttempts: rolling, rushAttempts: rolling, targets: rolling, receptions: rolling, targetShare: rolling, airYardsShare: rolling },
    matchup: { priorSeasonFpaPerGame: 10, priorSeasonFpaRank: 10, currentSeasonFpaPerGame: 10, currentSeasonFpaRank: 10 },
    teamEnvironment: { offensiveEpaPerPlay: 0, passingEpaPerPlay: 0, rushingEpaPerPlay: 0, playsPerGame: 60, opponentEpaAllowedPerPlay: 0 },
    market: { gameTotal: null, teamImpliedTotal: null, opponentImpliedTotal: null, homeSpread: null, source: null, capturedAt: null, excludedReason: "missing" },
    cutoffs: { playerHistoryLatest: week > 1 ? { season, week: week - 1 } : null, matchupHistoryLatest: null, teamHistoryLatest: null },
    missingFeatures: [],
  };
}

describe("Phase C preregistration and robustness helpers", () => {
  it("deep-freezes the approved QB and WR definitions", () => {
    expect(Object.isFrozen(PHASE_C_PREREGISTRATION)).toBe(true);
    expect(Object.isFrozen(PHASE_C_PREREGISTRATION.candidates.QB.features)).toBe(true);
    expect(PHASE_C_PREREGISTRATION.candidates.QB.features).toEqual(["seasonToDatePpg", "last3PassAttempts", "last3RushAttempts"]);
    expect(PHASE_C_PREREGISTRATION.candidates.WR.features).toEqual(["seasonToDatePpg", "last3Targets", "last3TargetShare", "last3AirYardsShare"]);
  });

  it("keeps replication training strictly earlier than its target", () => {
    const rows = [snapshot(2023, 18, "a", 1), snapshot(2024, 2, "b", 2), snapshot(2024, 3, "c", 3), snapshot(2025, 1, "d", 4)];
    expect(phaseCTrainingRows(rows, { season: 2024, week: 3 }).map((row) => row.playerId)).toEqual(["a", "b"]);
  });

  it("never permits the 2025 holdout into training or tuning", () => {
    const rows = [snapshot(2023, 1, "a", 1), snapshot(2024, 1, "b", 2), snapshot(2025, 1, "c", 3)];
    expect(phaseCTrainingRows(rows, { season: 2025 }).map((row) => row.season)).toEqual([2023, 2024]);
  });

  it("freezes predetermined feature ablations without adding features", () => {
    const full = new Set(PHASE_C_PREREGISTRATION.candidates.WR.features);
    for (const features of Object.values(PHASE_C_PREREGISTRATION.candidates.WR.ablations)) {
      expect(features.every((feature) => full.has(feature))).toBe(true);
      expect(features.length).toBeLessThan(full.size);
    }
  });

  it("switches rolling windows without changing target-week cutoffs", () => {
    const row = snapshot(2024, 6, "a", 10);
    const transformed = cloneForUsageWindow(row, "QB", "last1");
    expect(transformed.usage.passAttempts.last3).toBe(row.usage.passAttempts.last1);
    expect(transformed.cutoffs).toEqual(row.cutoffs);
    expect(row.usage.passAttempts.last3).toBe(10);
  });

  it("uses predetermined minimum-history buckets", () => {
    expect(minimumHistoryBucket(snapshot(2024, 1, "a", 1))).toBe("0");
    expect(minimumHistoryBucket(snapshot(2024, 2, "a", 1))).toBe("1");
    expect(minimumHistoryBucket(snapshot(2024, 3, "a", 1))).toBe("2");
    expect(minimumHistoryBucket(snapshot(2024, 4, "a", 1))).toBe("3+");
  });

  it("falls back deterministically when a usage score is missing", () => {
    expect(scoreWithBaselineFallback(null, 12)).toBe(12);
    expect(scoreWithBaselineFallback(14, 12)).toBe(14);
    expect(scoreWithBaselineFallback(null, null)).toBeNull();
  });

  it("calculates deterministic rank-movement distributions", () => {
    const rows = [snapshot(2025, 2, "a", 3, 3), snapshot(2025, 2, "b", 2, 1), snapshot(2025, 2, "c", 1, 2)];
    const first = rankMovement(rows, (row) => row.baseline.priorSeasonPpg, (row) => row.playerId === "c" ? 4 : row.baseline.priorSeasonPpg);
    expect(first).toEqual(rankMovement(rows, (row) => row.baseline.priorSeasonPpg, (row) => row.playerId === "c" ? 4 : row.baseline.priorSeasonPpg));
    expect(first.maximumAbsolute).toBe(2);
  });

  it("bootstraps whole weeks deterministically", () => {
    const rows = [1, 2, 3].flatMap((week) => [snapshot(2025, week, `a${week}`, 2, 2), snapshot(2025, week, `b${week}`, 1, 1)]);
    const options = { iterations: 100, seed: 7 };
    const first = groupedBootstrapDifference(rows, (row) => row.baseline.priorSeasonPpg, (row) => row.baseline.priorSeasonPpg, 1, options);
    expect(first).toEqual(groupedBootstrapDifference(rows, (row) => row.baseline.priorSeasonPpg, (row) => row.baseline.priorSeasonPpg, 1, options));
    expect(first.spearman.observed).toBe(0);
  });

  it("preserves monotonic usage behavior for a monotone scorer", () => {
    const rows = [snapshot(2025, 4, "a", 10)];
    expect(phaseCMonotonicityChecks(rows, (row) => row.usage.passAttempts.last3! + row.usage.rushAttempts.last3!, "QB")).toEqual([]);
  });

  it("assigns start-sit tiers from baseline order", () => {
    const rows = Array.from({ length: 20 }, (_, index) => snapshot(2025, 4, `p${index}`, 20 - index));
    const tiered = withBaselineTiers(rows);
    expect(tiered[7].tier).toBe("start-sit");
    expect(tiered[18].tier).toBe("deep");
  });

  it("assigns confidence and fallback policy from history and required inputs", () => {
    const features = PHASE_C_PREREGISTRATION.candidates.QB.features;
    expect(phaseCConfidence(snapshot(2025, 4, "a", 10), features, [10, 20, 3])).toBe("high");
    expect(phaseCConfidence(snapshot(2025, 2, "a", 10), features, [10, 20, 3])).toBe("medium");
    expect(phaseCConfidence(snapshot(2025, 4, "a", 10), features, [10, null, 3])).toBe("low");
  });

  it("requires every preregistered advancement gate", () => {
    expect(phaseCAdvanceDecision({ replication: true, practical: true, invariants: true })).toBe(true);
    expect(phaseCAdvanceDecision({ replication: true, practical: false, invariants: true })).toBe(false);
  });
});
