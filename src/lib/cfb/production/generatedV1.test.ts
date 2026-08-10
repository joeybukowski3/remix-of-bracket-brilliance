import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import generated from "../../../../data/generated/cfb/2026-preseason-ratings-v1.json";

describe("generated CFB preseason v1", () => {
  it("contains 138 finite ratings, complete ranks, and exactly 25 Top 25 teams", () => {
    expect(generated.teamCount).toBe(138);
    expect(generated.rows).toHaveLength(138);
    expect(generated.rows.map((row) => row.rank)).toEqual(
      Array.from({ length: 138 }, (_, index) => index + 1),
    );
    expect(generated.rows.filter((row) => row.rank <= 25)).toHaveLength(25);
    for (const row of generated.rows) {
      for (const value of [row.rawPower, row.rawOffense, row.rawDefense, row.jkbPower, row.jkbOffense, row.jkbDefense]) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it("retains generic prior-FCS provenance and 50% shrinkage metadata", () => {
    const transitions = generated.rows.filter((row) => row.priorPerformanceSource === "prior-fcs-fallback");
    expect(transitions.length).toBeGreaterThan(0);
    for (const row of transitions) {
      expect(row.transitionShrinkageApplied).toBe(true);
      expect(row.transitionPriorPerformanceWeight).toBe(0.5);
      expect(row.provenance.priorPerformance).toBe("prior-fcs-fallback");
    }
  });

  it("has valid preseason SOS and marks exactly eight flex schedules provisional", () => {
    expect(generated.rows.every((row) => row.sosPlayedRating === null && row.sosPlayedRank === null)).toBe(true);
    expect(generated.rows.every((row) => Number.isFinite(row.sosRemainingRating) && Number.isInteger(row.sosRemainingRank))).toBe(true);
    expect(new Set(generated.rows.map((row) => row.sosRemainingRank)).size).toBe(138);
    expect(generated.rows.filter((row) => row.sosProvenance === "provisional-pac-12-week-13-flex-unassigned")).toHaveLength(8);
  });

  it("locks the deterministic production CSV", () => {
    const csv = readFileSync(resolve(process.cwd(), "data", "generated", "cfb", "2026-preseason-ratings-v1.csv"));
    expect(createHash("sha256").update(csv).digest("hex")).toBe(
      "9244ae905a4cbeeda33e8f1f1c019d1a74578bb65382a32e11dc4e8b14f59856",
    );
  });
});
