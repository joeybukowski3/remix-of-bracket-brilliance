import { describe, expect, it } from "vitest";
import { runPhase5WalkForwardCore, type Phase5Config } from "./phase5WalkForwardCore";
import type { ScorePrediction } from "../phase4/types";

function prediction(overrides: Partial<ScorePrediction> = {}): ScorePrediction {
  return {
    gameId: "g1", season: 2020, week: 1, homeTeamExternalId: "A", awayTeamExternalId: "B",
    expectedHomePoints: 28, expectedAwayPoints: 21, projectedMargin: 7, projectedTotal: 49,
    actualHomePoints: 30, actualAwayPoints: 17, actualMargin: 13, actualTotal: 47,
    matchupPopulation: "fbs_vs_fbs",
    ...overrides,
  };
}

// 40 synthetic games spanning weeks 1-4 of season 2020, enough to clear the training-pool >=10 threshold.
function makeSeason(season: number, count: number): ScorePrediction[] {
  return Array.from({ length: count }, (_, i) =>
    prediction({
      gameId: `${season}-${i}`,
      season,
      week: 1 + (i % 4),
      expectedHomePoints: 25 + (i % 7),
      expectedAwayPoints: 20 + (i % 5),
      projectedMargin: (25 + (i % 7)) - (20 + (i % 5)),
      projectedTotal: (25 + (i % 7)) + (20 + (i % 5)),
      actualHomePoints: 24 + (i % 9),
      actualAwayPoints: 18 + (i % 6),
      actualMargin: (24 + (i % 9)) - (18 + (i % 6)),
      actualTotal: (24 + (i % 9)) + (18 + (i % 6)),
    }),
  );
}

const BASE_CONFIG: Phase5Config = {
  totalCalibrationMethod: "LINEAR",
  scoreCalibrationMode: "TOTAL_ONLY",
  distributionFamily: "INDEPENDENT_NORMAL",
  heteroskedastic: false,
  simulationSeed: 42,
  simulationDraws: 2000,
};

describe("runPhase5WalkForwardCore — leakage tests", () => {
  it("Week N+1 results cannot alter a Week N calibrated prediction or interval", () => {
    const season = makeSeason(2020, 40);
    const before = runPhase5WalkForwardCore(season, BASE_CONFIG);
    const targetBefore = before.calibrated.find((c) => c.week === 2);

    const seasonWithExtraWeek5 = [...season, prediction({ gameId: "extra", season: 2020, week: 5, actualHomePoints: 90, actualAwayPoints: 0, actualMargin: 90, actualTotal: 90 })];
    const after = runPhase5WalkForwardCore(seasonWithExtraWeek5, BASE_CONFIG);
    const targetAfter = after.calibrated.find((c) => c.gameId === targetBefore?.gameId);

    expect(targetAfter?.calibratedProjectedTotal).toBe(targetBefore?.calibratedProjectedTotal);
    expect(targetAfter?.calibratedExpectedHome).toBe(targetBefore?.calibratedExpectedHome);
  });

  it("a future season's results cannot alter an earlier season's calibration or intervals", () => {
    const season2020 = makeSeason(2020, 40);
    const only2020 = runPhase5WalkForwardCore(season2020, BASE_CONFIG);
    const target = only2020.calibrated.find((c) => c.week === 3);

    const season2021 = makeSeason(2021, 20).map((p) => ({ ...p, actualHomePoints: 90, actualAwayPoints: 3, actualMargin: 87, actualTotal: 93 }));
    const withFuture = runPhase5WalkForwardCore([...season2020, ...season2021], BASE_CONFIG);
    const targetWithFuture = withFuture.calibrated.find((c) => c.gameId === target?.gameId);

    expect(targetWithFuture?.calibratedProjectedTotal).toBe(target?.calibratedProjectedTotal);
  });

  it("score coherence identities hold exactly after calibration", () => {
    const season = makeSeason(2020, 40);
    const result = runPhase5WalkForwardCore(season, BASE_CONFIG);
    for (const row of result.calibrated) {
      expect(row.calibratedProjectedTotal).toBeCloseTo(row.calibratedExpectedHome + row.calibratedExpectedAway, 10);
      expect(row.calibratedProjectedMargin).toBeCloseTo(row.calibratedExpectedHome - row.calibratedExpectedAway, 10);
    }
  });

  it("probabilities remain within [0, 1]", () => {
    const season = makeSeason(2020, 40);
    const result = runPhase5WalkForwardCore(season, BASE_CONFIG);
    for (const p of result.probabilities) {
      expect(p.pHomeWin).toBeGreaterThanOrEqual(0);
      expect(p.pHomeWin).toBeLessThanOrEqual(1);
      expect(p.pAwayWin).toBeGreaterThanOrEqual(0);
      expect(p.pAwayWin).toBeLessThanOrEqual(1);
      expect(p.pHomeWin + p.pAwayWin).toBeCloseTo(1, 10);
    }
  });

  it("fixed-seed simulation (EMPIRICAL_BOOTSTRAP) is deterministic across identical runs", () => {
    const season = makeSeason(2020, 40);
    const config: Phase5Config = { ...BASE_CONFIG, distributionFamily: "EMPIRICAL_BOOTSTRAP" };
    const run1 = runPhase5WalkForwardCore(season, config);
    const run2 = runPhase5WalkForwardCore(season, config);
    expect(run1.probabilities).toEqual(run2.probabilities);
  });

  it("produces no NaN or Infinity anywhere in calibrated predictions or probabilities", () => {
    const season = makeSeason(2020, 40);
    const result = runPhase5WalkForwardCore(season, BASE_CONFIG);
    for (const row of result.calibrated) {
      for (const v of [row.calibratedExpectedHome, row.calibratedExpectedAway, row.calibratedProjectedMargin, row.calibratedProjectedTotal]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
    for (const p of result.probabilities) {
      expect(Number.isFinite(p.pHomeWin)).toBe(true);
      for (const interval of [p.marginInterval90, p.totalInterval90]) {
        if (!interval) continue;
        expect(Number.isFinite(interval[0])).toBe(true);
        expect(Number.isFinite(interval[1])).toBe(true);
      }
    }
  });

  it("excludes FBS-vs-FCS games from calibration/probability output", () => {
    const season = [...makeSeason(2020, 15), prediction({ gameId: "fcs-game", matchupPopulation: "fbs_vs_fcs" })];
    const result = runPhase5WalkForwardCore(season, BASE_CONFIG);
    expect(result.calibrated.some((c) => c.gameId === "fcs-game")).toBe(false);
  });
});
