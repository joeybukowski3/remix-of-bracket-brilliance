import { describe, expect, it } from "vitest";
import { deriveCfbV2SuccessObservations, type CfbV2RawPlay } from "./successDerivation";
// Test-only import of research's own validated SUCCESS definition — proves
// production parity without production ever importing research at runtime
// (see architectureGuard.test.ts for the enforcement side).
import { computeSuccessRates } from "../../research/derived/successMetrics";
import type { WeightedPlay } from "../../research/derived/teamGameAggregation.types";
import type { PlayMetricRow } from "../../research/derived/playMetricRow";

function play(overrides: Partial<CfbV2RawPlay> = {}): CfbV2RawPlay {
  return {
    gameId: 1,
    offense: "Alabama",
    defense: "Auburn",
    ppa: 0.5,
    ...overrides,
  };
}

function weightedPlayFromRaw(raw: CfbV2RawPlay): WeightedPlay {
  const row: Partial<PlayMetricRow> = {
    ppaSuccess: raw.ppa === null ? null : raw.ppa > 0,
    isEarlyDown: false,
    isPassingDown: false,
  };
  return { row: row as PlayMetricRow, weight: 1 };
}

describe("deriveCfbV2SuccessObservations", () => {
  it("computes 1.0 for an offense with only positive-PPA plays", () => {
    const obs = deriveCfbV2SuccessObservations([play({ ppa: 0.4 }), play({ ppa: 1.2 })]);
    expect(obs).toEqual([{ teamId: "ala", successRate: 1 }]);
  });

  it("treats exactly zero PPA as NOT a success (strict > 0)", () => {
    const obs = deriveCfbV2SuccessObservations([play({ ppa: 0 })]);
    expect(obs).toEqual([{ teamId: "ala", successRate: 0 }]);
  });

  it("treats negative PPA as not a success", () => {
    const obs = deriveCfbV2SuccessObservations([play({ ppa: -0.3 })]);
    expect(obs).toEqual([{ teamId: "ala", successRate: 0 }]);
  });

  it("excludes null-PPA plays from both numerator and denominator", () => {
    const obs = deriveCfbV2SuccessObservations([
      play({ ppa: 1.0 }),
      play({ ppa: null }),
      play({ ppa: null }),
    ]);
    // If the null plays counted as failures the rate would be 1/3, not 1.
    expect(obs).toEqual([{ teamId: "ala", successRate: 1 }]);
  });

  it("attributes SUCCESS only to the offense, never the defense", () => {
    const obs = deriveCfbV2SuccessObservations([play({ offense: "Alabama", defense: "Auburn", ppa: 1.0 })]);
    expect(obs).toHaveLength(1);
    expect(obs[0].teamId).toBe("ala");
    expect(obs.some((o) => o.teamId === "aub")).toBe(false);
  });

  it("averages multiple plays within one team-game", () => {
    const obs = deriveCfbV2SuccessObservations([
      play({ ppa: 1.0 }), // success
      play({ ppa: -1.0 }), // fail
      play({ ppa: 0.1 }), // success
      play({ ppa: -0.1 }), // fail
    ]);
    expect(obs).toEqual([{ teamId: "ala", successRate: 0.5 }]);
  });

  it("keeps multiple games for the same team as SEPARATE observations (caller aggregates across games)", () => {
    const obs = deriveCfbV2SuccessObservations([
      play({ gameId: 1, ppa: 1.0 }),
      play({ gameId: 1, ppa: 1.0 }),
      play({ gameId: 2, ppa: -1.0 }),
    ]);
    expect(obs).toHaveLength(2);
    expect(obs).toEqual(
      expect.arrayContaining([
        { teamId: "ala", successRate: 1 },
        { teamId: "ala", successRate: 0 },
      ]),
    );
  });

  it("keeps multiple teams as distinct entries", () => {
    const obs = deriveCfbV2SuccessObservations([
      play({ gameId: 1, offense: "Alabama", ppa: 1.0 }),
      play({ gameId: 1, offense: "Auburn", defense: "Alabama", ppa: -1.0 }),
    ]);
    expect(obs).toHaveLength(2);
    const byTeam = Object.fromEntries(obs.map((o) => [o.teamId, o.successRate]));
    expect(byTeam.ala).toBe(1);
    expect(byTeam.aub).toBe(0);
  });

  it("skips plays whose offense name does not resolve to a known team, rather than fabricating an observation", () => {
    const obs = deriveCfbV2SuccessObservations([play({ offense: "Totally Not A Real Team", ppa: 1.0 })]);
    expect(obs).toEqual([]);
  });

  it("returns an empty array for an empty play list — never fabricates", () => {
    expect(deriveCfbV2SuccessObservations([])).toEqual([]);
  });
});

describe("deriveCfbV2SuccessObservations — parity with research's own SUCCESS definition", () => {
  const fixtures: { name: string; plays: CfbV2RawPlay[] }[] = [
    { name: "all positive PPA", plays: [play({ ppa: 0.2 }), play({ ppa: 0.9 }), play({ ppa: 0.01 })] },
    { name: "all zero PPA", plays: [play({ ppa: 0 }), play({ ppa: 0 })] },
    { name: "all negative PPA", plays: [play({ ppa: -0.5 }), play({ ppa: -0.01 })] },
    { name: "mixed positive/zero/negative", plays: [play({ ppa: 1.0 }), play({ ppa: 0 }), play({ ppa: -1.0 }), play({ ppa: 0.3 })] },
    { name: "includes null-PPA plays", plays: [play({ ppa: 1.0 }), play({ ppa: null }), play({ ppa: -1.0 })] },
  ];

  for (const fixture of fixtures) {
    it(`matches research's computeSuccessRates for: ${fixture.name}`, () => {
      const [productionObservation] = deriveCfbV2SuccessObservations(fixture.plays);
      const researchRate = computeSuccessRates(fixture.plays.map(weightedPlayFromRaw)).ppaSuccessRate;

      if (researchRate === null) {
        expect(productionObservation).toBeUndefined();
      } else {
        expect(productionObservation.successRate).toBeCloseTo(researchRate, 10);
      }
    });
  }
});
