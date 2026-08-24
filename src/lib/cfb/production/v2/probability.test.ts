import { describe, expect, it } from "vitest";
import { createCfbV2SeededRandom, deriveCfbV2GameSeed, runCfbV2EmpiricalBootstrap } from "./probability";

const RESIDUAL_POOL = Array.from({ length: 50 }, (_, i) => ({ home: (i % 10) - 5, away: ((i + 3) % 10) - 5 }));

describe("createCfbV2SeededRandom", () => {
  it("produces a deterministic, repeatable sequence for the same seed", () => {
    const a = createCfbV2SeededRandom(20260101);
    const b = createCfbV2SeededRandom(20260101);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different seeds", () => {
    const a = createCfbV2SeededRandom(1);
    const b = createCfbV2SeededRandom(2);
    expect(a()).not.toBe(b());
  });

  it("stays within [0, 1)", () => {
    const r = createCfbV2SeededRandom(42);
    for (let i = 0; i < 1000; i += 1) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("deriveCfbV2GameSeed", () => {
  it("is deterministic for the same (baseSeed, gameId)", () => {
    expect(deriveCfbV2GameSeed(20260101, "401520144")).toBe(deriveCfbV2GameSeed(20260101, "401520144"));
  });

  it("differs across gameIds", () => {
    expect(deriveCfbV2GameSeed(20260101, "g1")).not.toBe(deriveCfbV2GameSeed(20260101, "g2"));
  });
});

describe("runCfbV2EmpiricalBootstrap (§13/§14/§15 golden determinism test)", () => {
  it("produces byte-identical results across repeated runs with identical inputs (§14 golden test)", () => {
    const run = () => {
      const random = createCfbV2SeededRandom(deriveCfbV2GameSeed(20260101, "gX"));
      return runCfbV2EmpiricalBootstrap(27, 24, RESIDUAL_POOL, random, 20000);
    };
    const first = run();
    const second = run();
    expect(second).toEqual(first);
  });

  it("changes deterministically when the seed changes", () => {
    const runA = runCfbV2EmpiricalBootstrap(27, 24, RESIDUAL_POOL, createCfbV2SeededRandom(1), 5000);
    const runB = runCfbV2EmpiricalBootstrap(27, 24, RESIDUAL_POOL, createCfbV2SeededRandom(2), 5000);
    expect(runA.homeWinProbability).not.toBe(runB.homeWinProbability);
  });

  it("home + away win probability sums to exactly 1 (tie handling: home>away only counts as a home win)", () => {
    const result = runCfbV2EmpiricalBootstrap(24, 24, RESIDUAL_POOL, createCfbV2SeededRandom(7), 5000);
    expect(result.homeWinProbability + result.awayWinProbability).toBeCloseTo(1, 12);
  });

  it("produces probabilities within [0, 1]", () => {
    const result = runCfbV2EmpiricalBootstrap(50, 3, RESIDUAL_POOL, createCfbV2SeededRandom(9), 5000);
    expect(result.homeWinProbability).toBeGreaterThanOrEqual(0);
    expect(result.homeWinProbability).toBeLessThanOrEqual(1);
  });

  it("produces well-ordered intervals at every level for margin and total", () => {
    const result = runCfbV2EmpiricalBootstrap(27, 24, RESIDUAL_POOL, createCfbV2SeededRandom(11), 5000);
    for (const level of ["p50", "p80", "p90", "p95"] as const) {
      expect(result.intervals.margin[level][0]).toBeLessThanOrEqual(result.intervals.margin[level][1]);
      expect(result.intervals.total[level][0]).toBeLessThanOrEqual(result.intervals.total[level][1]);
    }
  });

  it("wider confidence levels produce wider (or equal) intervals", () => {
    const result = runCfbV2EmpiricalBootstrap(27, 24, RESIDUAL_POOL, createCfbV2SeededRandom(13), 20000);
    const width = (iv: [number, number]) => iv[1] - iv[0];
    expect(width(result.intervals.margin.p80)).toBeGreaterThanOrEqual(width(result.intervals.margin.p50));
    expect(width(result.intervals.margin.p90)).toBeGreaterThanOrEqual(width(result.intervals.margin.p80));
    expect(width(result.intervals.margin.p95)).toBeGreaterThanOrEqual(width(result.intervals.margin.p90));
  });
});
