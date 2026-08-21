import { describe, expect, it } from "vitest";
import { WEEKLY_INPUT_BENCHMARKS } from "@/lib/fantasy/weekly/__fixtures__/benchmarks";
import { validateBenchmarkContracts } from "./invariants";

describe("Phase A benchmark invariants", () => {
  it("keeps all 40 eligibility contracts valid without tuning against them", () => {
    expect(validateBenchmarkContracts(WEEKLY_INPUT_BENCHMARKS)).toEqual([]);
  });

  it("rejects scores for out/bye players and high confidence with missing authority", () => {
    const out = WEEKLY_INPUT_BENCHMARKS.find((fixture) => fixture.scenario === "out")!;
    const missing = WEEKLY_INPUT_BENCHMARKS.find((fixture) => fixture.scenario === "missing-usage")!;
    const errors = validateBenchmarkContracts(WEEKLY_INPUT_BENCHMARKS, [
      { benchmarkId: out.id, score: 20, confidence: "high" },
      { benchmarkId: missing.id, score: 10, confidence: "high" },
    ]);
    expect(errors).toEqual(expect.arrayContaining([
      `${out.id}: ineligible player received a score`,
      `${missing.id}: missing authority received high confidence`,
    ]));
  });
});
