import { describe, expect, it } from "vitest";
import { computeDistributionOutput } from "./distributionModels";
import { createSeededRandom } from "./normalMath";
import type { ResidualDistributionParams } from "./types";

const PARAMS: ResidualDistributionParams = { homeMean: 0, homeSd: 10, awayMean: 0, awaySd: 10, correlation: 0, n: 100 };

describe("computeDistributionOutput — INDEPENDENT_NORMAL", () => {
  it("a big favorite gets a high win probability", () => {
    const output = computeDistributionOutput({
      expectedHome: 35,
      expectedAway: 14,
      family: "INDEPENDENT_NORMAL",
      params: PARAMS,
      random: createSeededRandom(1),
      simulationDraws: 1000,
    });
    expect(output.pHomeWin).toBeGreaterThan(0.9);
  });

  it("an even matchup gives ~50% win probability", () => {
    const output = computeDistributionOutput({
      expectedHome: 24,
      expectedAway: 24,
      family: "INDEPENDENT_NORMAL",
      params: PARAMS,
      random: createSeededRandom(1),
      simulationDraws: 1000,
    });
    expect(output.pHomeWin).toBeCloseTo(0.5, 2);
  });

  it("90% interval is wider than 50% interval", () => {
    const output = computeDistributionOutput({
      expectedHome: 28,
      expectedAway: 21,
      family: "INDEPENDENT_NORMAL",
      params: PARAMS,
      random: createSeededRandom(1),
      simulationDraws: 1000,
    });
    const width = (level: number) => {
      const [lo, hi] = output.marginInterval(level);
      return hi - lo;
    };
    expect(width(0.9)).toBeGreaterThan(width(0.5));
  });
});

describe("computeDistributionOutput — BIVARIATE_NORMAL vs INDEPENDENT_NORMAL", () => {
  it("positive correlation widens the total interval relative to independence", () => {
    const correlatedParams: ResidualDistributionParams = { ...PARAMS, correlation: 0.5 };
    const independent = computeDistributionOutput({ expectedHome: 28, expectedAway: 21, family: "INDEPENDENT_NORMAL", params: PARAMS, random: createSeededRandom(1), simulationDraws: 1000 });
    const bivariate = computeDistributionOutput({ expectedHome: 28, expectedAway: 21, family: "BIVARIATE_NORMAL", params: correlatedParams, random: createSeededRandom(1), simulationDraws: 1000 });
    const totalWidth = (out: typeof independent) => {
      const [lo, hi] = out.totalInterval(0.9);
      return hi - lo;
    };
    expect(totalWidth(bivariate)).toBeGreaterThan(totalWidth(independent));
  });
});

describe("computeDistributionOutput — EMPIRICAL_BOOTSTRAP", () => {
  const pairs = Array.from({ length: 50 }, (_, i) => ({ home: (i % 10) - 5, away: (i % 7) - 3 }));

  it("is deterministic for a fixed seed", () => {
    const run = () =>
      computeDistributionOutput({
        expectedHome: 28,
        expectedAway: 21,
        family: "EMPIRICAL_BOOTSTRAP",
        params: PARAMS,
        historicalResidualPairs: pairs,
        random: createSeededRandom(99),
        simulationDraws: 2000,
      });
    const a = run();
    const b = run();
    expect(a.pHomeWin).toBe(b.pHomeWin);
    expect(a.marginInterval(0.9)).toEqual(b.marginInterval(0.9));
  });

  it("falls back to a normal approximation when no historical pool exists yet", () => {
    const output = computeDistributionOutput({
      expectedHome: 28,
      expectedAway: 21,
      family: "EMPIRICAL_BOOTSTRAP",
      params: PARAMS,
      historicalResidualPairs: [],
      random: createSeededRandom(1),
      simulationDraws: 1000,
    });
    expect(Number.isFinite(output.pHomeWin)).toBe(true);
  });
});
