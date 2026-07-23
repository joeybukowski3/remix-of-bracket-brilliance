import { describe, expect, it } from "vitest";

import { projectStrikeoutsV2, type KProjectionInput, type KProjectionResult } from "./kProjectionV2";

const allFieldsInput: KProjectionInput = {
  pitcher: {
    seasonKRate: 28,
    seasonKPer9: 10.4,
    seasonWhiffRate: 31,
    recentKRate: 30,
    recentKPer9: 11.1,
    recentWhiffRate: 33,
    homeKRate: 29,
    awayKRate: 25,
    homeWhiffRate: 32,
    awayWhiffRate: 28,
    projectedInnings: 5.8,
    projectedBattersFaced: 24,
    averageBattersFacedPerInning: 4.2,
    handedness: "R",
    pitchCountTrend: 92,
    pitcherKScore: 71,
    recentStarts: [
      { strikeouts: 8, inningsPitched: 6, battersFaced: 23, pitchCount: 96 },
      { strikeouts: 7, inningsPitched: 5.2, battersFaced: 22, pitchCount: 91 },
      { strikeouts: 5, inningsPitched: 5, battersFaced: 21, pitchCount: 88 },
      { strikeouts: 9, inningsPitched: 6.1, battersFaced: 24, pitchCount: 99 },
      { strikeouts: 6, inningsPitched: 5.2, battersFaced: 22, pitchCount: 93 },
    ],
  },
  opponent: {
    seasonKRate: 24,
    recentKRate: 27,
    homeKRate: 22,
    awayKRate: 26,
    vsLhpKRate: 21,
    vsRhpKRate: 25,
    seasonWhiffRate: 29,
    recentWhiffRate: 31,
    homeWhiffRate: 27,
    awayWhiffRate: 30,
    projectedLineupKRate: 26.5,
    opponentKScore: 66,
    matchupRating: 69,
    recentVsStarters: [
      { teamTotalStrikeouts: 10, teamPlateAppearances: 38, opposingStarterStrikeouts: 7, opposingStarterInningsPitched: 6 },
      { teamTotalStrikeouts: 8, teamPlateAppearances: 36, opposingStarterStrikeouts: 6, opposingStarterInningsPitched: 5.2 },
    ],
  },
  context: {
    pitcherIsHome: true,
    leagueAverageKRate: 22.5,
    leagueAverageWhiffRate: 25,
  },
};

function expectFiniteResult(result: KProjectionResult): void {
  for (const value of [
    result.projectedStrikeouts,
    result.projectedKRate,
    result.projectedBattersFaced,
    result.projectedInnings,
    result.pitcherSkillRate,
    result.opponentEnvironmentRate,
    result.matchupAdjustment,
  ]) {
    if (value != null) {
      expect(Number.isFinite(value)).toBe(true);
    }
  }

  for (const component of result.components) {
    expect(Number.isFinite(component.value)).toBe(true);
    expect(Number.isFinite(component.weight)).toBe(true);
    expect(Number.isFinite(component.normalizedWeight)).toBe(true);
    expect(Number.isFinite(component.contribution)).toBe(true);
  }
}

describe("projectStrikeoutsV2", () => {
  it("uses all available field groups without mutating the input", () => {
    const input = structuredClone(allFieldsInput);
    const before = structuredClone(input);
    const result = projectStrikeoutsV2(input);

    expect(input).toEqual(before);
    expect(result.modelVersion).toBe("mlb-k-projection-v2-shadow");
    expect(result.projectedStrikeouts).toBeGreaterThan(6);
    expect(result.confidence).toBe("high");
    expect(result.components.map((entry) => entry.key)).toEqual(
      expect.arrayContaining([
        "pitcher.seasonSkillRate",
        "pitcher.recentSkillRate",
        "pitcher.whiffSupportedKRate",
        "pitcher.homeKRate",
        "opponent.awayKRate",
        "opponent.handednessKRate",
        "opponent.projectedLineupKRate",
      ]),
    );
  });

  it("projects with only core season fields available", () => {
    const result = projectStrikeoutsV2({
      pitcher: {
        seasonKRate: 27,
        seasonKPer9: 9.8,
        projectedBattersFaced: 23,
        averageBattersFacedPerInning: 4.2,
      },
      opponent: {
        seasonKRate: 23,
      },
      context: {
        pitcherIsHome: false,
        leagueAverageKRate: 22.5,
        leagueAverageWhiffRate: 25,
      },
    });

    expect(result.projectedStrikeouts).toBeGreaterThan(5);
    expect(result.confidence).toBe("medium");
  });

  it("renormalizes when recent metrics are missing", () => {
    const result = projectStrikeoutsV2({
      ...allFieldsInput,
      pitcher: {
        ...allFieldsInput.pitcher,
        recentKRate: null,
        recentKPer9: null,
        recentStarts: null,
      },
      opponent: {
        ...allFieldsInput.opponent,
        recentKRate: null,
        recentVsStarters: null,
      },
    });

    expect(result.projectedStrikeouts).not.toBeNull();
    expect(result.components.some((entry) => entry.key === "pitcher.recentSkillRate")).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("renormalizes when venue splits are missing", () => {
    const result = projectStrikeoutsV2({
      ...allFieldsInput,
      pitcher: {
        ...allFieldsInput.pitcher,
        homeKRate: null,
        awayKRate: null,
        homeWhiffRate: null,
        awayWhiffRate: null,
      },
      opponent: {
        ...allFieldsInput.opponent,
        homeKRate: null,
        awayKRate: null,
        homeWhiffRate: null,
        awayWhiffRate: null,
      },
    });

    expect(result.projectedStrikeouts).not.toBeNull();
    expect(result.components.some((entry) => entry.key === "pitcher.homeKRate")).toBe(false);
    expect(result.components.some((entry) => entry.key === "opponent.awayKRate")).toBe(false);
  });

  it("renormalizes when handedness splits are missing", () => {
    const result = projectStrikeoutsV2({
      ...allFieldsInput,
      opponent: {
        ...allFieldsInput.opponent,
        vsLhpKRate: null,
        vsRhpKRate: null,
      },
    });

    expect(result.projectedStrikeouts).not.toBeNull();
    expect(result.components.some((entry) => entry.key === "opponent.handednessKRate")).toBe(false);
  });

  it("prefers projected batters faced supplied directly", () => {
    const result = projectStrikeoutsV2(allFieldsInput);

    expect(result.projectedBattersFaced).toBe(24);
    expect(result.fallbacks.some((entry) => entry.field === "pitcher.projectedBattersFaced")).toBe(false);
  });

  it("derives projected batters faced from projected innings when direct BF is missing", () => {
    const result = projectStrikeoutsV2({
      ...allFieldsInput,
      pitcher: {
        ...allFieldsInput.pitcher,
        projectedBattersFaced: null,
      },
    });

    expect(result.projectedBattersFaced).toBeCloseTo(24.36, 8);
    expect(result.fallbacks).toContainEqual({
      field: "pitcher.projectedBattersFaced",
      reason: "missing projected batters faced; derived from projected innings and BF/IP",
      used: 24.36,
    });
  });

  it("uses explicit BF-per-inning fallback when deriving workload", () => {
    const result = projectStrikeoutsV2({
      ...allFieldsInput,
      pitcher: {
        ...allFieldsInput.pitcher,
        projectedBattersFaced: null,
        averageBattersFacedPerInning: null,
      },
    });

    expect(result.projectedBattersFaced).toBeCloseTo(24.65, 8);
    expect(result.fallbacks.map((entry) => entry.field)).toContain("pitcher.averageBattersFacedPerInning");
  });

  it("pitcher at home uses opponent road split", () => {
    const result = projectStrikeoutsV2({
      ...allFieldsInput,
      context: {
        ...allFieldsInput.context,
        pitcherIsHome: true,
      },
    });

    expect(result.components.find((entry) => entry.key === "opponent.awayKRate")?.value).toBe(0.26);
  });

  it("pitcher away uses opponent home split", () => {
    const result = projectStrikeoutsV2({
      ...allFieldsInput,
      context: {
        ...allFieldsInput.context,
        pitcherIsHome: false,
      },
    });

    expect(result.components.find((entry) => entry.key === "opponent.homeKRate")?.value).toBe(0.22);
  });

  it("selects opponent vs-LHP split for a left-handed pitcher", () => {
    const result = projectStrikeoutsV2({
      ...allFieldsInput,
      pitcher: {
        ...allFieldsInput.pitcher,
        handedness: "L",
      },
    });

    expect(result.components.find((entry) => entry.key === "opponent.handednessKRate")?.value).toBe(0.21);
  });

  it("selects opponent vs-RHP split for a right-handed pitcher", () => {
    const result = projectStrikeoutsV2(allFieldsInput);

    expect(result.components.find((entry) => entry.key === "opponent.handednessKRate")?.value).toBe(0.25);
  });

  it("distinguishes explicit zero from missing by warning and ignoring it", () => {
    const result = projectStrikeoutsV2({
      ...allFieldsInput,
      pitcher: {
        ...allFieldsInput.pitcher,
        seasonKRate: 0,
      },
    });

    expect(result.warnings).toContain("pitcher.seasonKRate was non-positive and ignored.");
    expect(result.projectedStrikeouts).not.toBeNull();
  });

  it("accepts decimal and percent rate units but rejects ambiguous units", () => {
    const decimal = projectStrikeoutsV2({
      ...allFieldsInput,
      pitcher: {
        ...allFieldsInput.pitcher,
        seasonKRate: 0.28,
      },
    });
    const percent = projectStrikeoutsV2({
      ...allFieldsInput,
      pitcher: {
        ...allFieldsInput.pitcher,
        seasonKRate: 28,
      },
    });
    const ambiguous = projectStrikeoutsV2({
      ...allFieldsInput,
      pitcher: {
        ...allFieldsInput.pitcher,
        seasonKRate: 1.2,
      },
    });

    expect(decimal.components.find((entry) => entry.key === "pitcher.seasonSkillRate")?.value).toBeCloseTo(
      percent.components.find((entry) => entry.key === "pitcher.seasonSkillRate")?.value ?? 0,
      8,
    );
    expect(ambiguous.warnings).toContain("pitcher.seasonKRate used unsupported rate units and was ignored.");
  });

  it("clamps extreme values", () => {
    const result = projectStrikeoutsV2({
      pitcher: {
        seasonKRate: 99,
        seasonKPer9: 35,
        seasonWhiffRate: 99,
        projectedBattersFaced: 30,
        averageBattersFacedPerInning: 4,
      },
      opponent: {
        seasonKRate: 99,
        projectedLineupKRate: 99,
      },
      context: {
        pitcherIsHome: true,
        leagueAverageKRate: 22.5,
        leagueAverageWhiffRate: 25,
      },
    });

    expect(result.pitcherSkillRate).toBeLessThanOrEqual(0.4);
    expect(result.projectedKRate).toBeLessThanOrEqual(0.4);
    expect(result.matchupAdjustment).toBeLessThanOrEqual(0.035);
  });

  it("rejects or sanitizes negative inputs explicitly", () => {
    const result = projectStrikeoutsV2({
      ...allFieldsInput,
      pitcher: {
        ...allFieldsInput.pitcher,
        projectedBattersFaced: -24,
        projectedInnings: -5,
        recentStarts: [{ strikeouts: -1, inningsPitched: -5, battersFaced: -20 }],
      },
    });

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        "pitcher.projectedInnings was non-positive and ignored.",
        "pitcher.projectedBattersFaced was non-positive and ignored.",
        "pitcher.recentStarts.inningsPitched was non-positive and ignored.",
        "pitcher.recentStarts.battersFaced was non-positive and ignored.",
      ]),
    );
    expectFiniteResult(result);
  });

  it("does not emit NaN", () => {
    const result = projectStrikeoutsV2({
      pitcher: {
        seasonKRate: Number.NaN,
        seasonKPer9: 9,
        projectedBattersFaced: 22,
      },
      opponent: {
        seasonKRate: Number.NaN,
      },
      context: {
        pitcherIsHome: false,
        leagueAverageKRate: Number.NaN,
      },
    });

    expect(JSON.stringify(result)).not.toContain("NaN");
    expectFiniteResult(result);
  });

  it("does not emit Infinity", () => {
    const result = projectStrikeoutsV2({
      pitcher: {
        seasonKRate: Number.POSITIVE_INFINITY,
        seasonKPer9: 9,
        projectedBattersFaced: 22,
      },
      opponent: {
        seasonKRate: Number.NEGATIVE_INFINITY,
      },
      context: {
        pitcherIsHome: true,
        leagueAverageWhiffRate: Number.POSITIVE_INFINITY,
      },
    });

    expect(JSON.stringify(result)).not.toContain("Infinity");
    expectFiniteResult(result);
  });

  it("is deterministic for repeated output", () => {
    expect(projectStrikeoutsV2(allFieldsInput)).toEqual(projectStrikeoutsV2(allFieldsInput));
  });

  it("does not use sportsbook line as a projection input", () => {
    const withoutLine = projectStrikeoutsV2(allFieldsInput);
    const withLine = projectStrikeoutsV2({
      ...allFieldsInput,
      context: {
        ...allFieldsInput.context,
        sportsbookLine: 9.5,
      },
    } as KProjectionInput);

    expect(withLine.projectedStrikeouts).toBe(withoutLine.projectedStrikeouts);
    expect(withLine.projectedKRate).toBe(withoutLine.projectedKRate);
  });

  it("component contributions reconcile with grouped rates and result", () => {
    const result = projectStrikeoutsV2(allFieldsInput);
    const pitcherContribution = result.components
      .filter((entry) => entry.group === "pitcher")
      .reduce((sum, entry) => sum + entry.contribution, 0);
    const opponentContribution = result.components
      .filter((entry) => entry.group === "opponent")
      .reduce((sum, entry) => sum + entry.contribution, 0);

    expect(pitcherContribution).toBeCloseTo(result.pitcherSkillRate ?? 0, 10);
    expect(opponentContribution).toBeCloseTo(result.opponentEnvironmentRate ?? 0, 10);
    expect((result.pitcherSkillRate ?? 0) + (result.matchupAdjustment ?? 0)).toBeCloseTo(result.projectedKRate ?? 0, 10);
    expect((result.projectedKRate ?? 0) * (result.projectedBattersFaced ?? 0)).toBeCloseTo(
      result.projectedStrikeouts ?? 0,
      10,
    );
  });

  it("keeps warnings and fallbacks stable and deduplicated", () => {
    const result = projectStrikeoutsV2({
      ...allFieldsInput,
      pitcher: {
        ...allFieldsInput.pitcher,
        averageBattersFacedPerInning: null,
        projectedBattersFaced: null,
        recentStarts: [
          { strikeouts: -1, inningsPitched: -5, battersFaced: -20 },
          { strikeouts: -2, inningsPitched: -6, battersFaced: -21 },
        ],
      },
    });

    expect(new Set(result.warnings).size).toBe(result.warnings.length);
    expect(new Set(result.fallbacks.map((entry) => `${entry.field}:${entry.reason}`)).size).toBe(result.fallbacks.length);
  });
});
