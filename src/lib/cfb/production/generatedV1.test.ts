import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import generated from "../../../../data/generated/cfb/2026-preseason-ratings-v1.1.json";
import { CFB_GAMES_2026 } from "@/data/cfb/season2026/schedule";
import { CFB_MARKET_ANCHOR_VERSION } from "@/lib/cfb/marketAnchor";
import { computeRawSosForAllTeams, computeSosDisplay, toSosGameInputs } from "@/lib/cfb/model";

describe("generated CFB preseason v1.1 market anchor", () => {
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

    const productionPower = new Map(generated.rows.map((row) => [row.teamId, row.jkbPower]));
    const recalculated = new Map(computeSosDisplay(computeRawSosForAllTeams(
      generated.rows.map((row) => row.teamId),
      toSosGameInputs(CFB_GAMES_2026),
      productionPower,
    )).map((row) => [row.teamId, row]));
    for (const row of generated.rows) {
      const sos = recalculated.get(row.teamId);
      expect(sos?.sosRemainingRank).toBe(row.sosRemainingRank);
      expect(Number(sos?.sosRemainingRating?.toFixed(2))).toBe(row.sosRemainingRating);
    }
  });

  it("locks the approved production methodology and independent AP field", () => {
    expect(generated.modelVersion).toBe(CFB_MARKET_ANCHOR_VERSION);
    expect(generated.status).toBe("production");
    expect(generated.config.preseasonWeights).toEqual({ market: 0.75, jkbStatistics: 0.25 });
    expect(generated.rows.every((row) => row.apRank === null)).toBe(true);
    const serialized = JSON.stringify(generated);
    expect(serialized).not.toContain("sourcePowerRating");
    expect(serialized).not.toContain("standardizedMarketBaseline");
  });

  it("locks the deterministic production CSV", () => {
    const csv = readFileSync(
      resolve(process.cwd(), "data", "generated", "cfb", "2026-preseason-ratings-v1.1.csv"),
      "utf8",
    ).replace(/\r\n?/g, "\n");
    expect(createHash("sha256").update(csv).digest("hex")).toBe(
      "10a32b23086f723648cf0477b508adda93f827d3ba580c15d33d0df3c80daa13",
    );
  });
});
