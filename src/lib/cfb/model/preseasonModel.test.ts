import { describe, expect, it } from "vitest";
import { CFB_TEAM_METADATA } from "@/data/cfb/teamMetadata";
import { CFB_MODEL_CONFIG } from "./config";
import { computeDisplayRatings, computeRawTeamRating } from "./preseasonModel";
import type { CfbPreseasonModelInputs } from "./types";

function emptyInputs(teamId: string): CfbPreseasonModelInputs {
  return {
    teamId,
    priorPerformance: null,
    priorPerformanceMetadata: null,
    opponentAdjusted: null,
    returningProduction: null,
    rosterTalent: null,
    coachingContinuity: null,
  };
}

describe("CFB_MODEL_CONFIG", () => {
  it("contains no per-team hardcoded exceptions", () => {
    const serialized = JSON.stringify(CFB_MODEL_CONFIG);
    for (const team of CFB_TEAM_METADATA) {
      // Team ids are short slugs (e.g. "osu", "uga"); guard against accidental
      // false positives by requiring a quoted-key or quoted-value match.
      expect(serialized).not.toContain(`"${team.id}"`);
      expect(serialized).not.toContain(`"${team.slug}"`);
    }
  });

  it("has weights that sum to 1 for each weighted stage", () => {
    const off = CFB_MODEL_CONFIG.offensiveBaseWeights;
    expect(
      off.priorPerformanceWeight + off.returningProductionWeight + off.quarterbackContinuityWeight,
    ).toBeCloseTo(1);

    const def = CFB_MODEL_CONFIG.defensiveBaseWeights;
    expect(def.priorPerformanceWeight + def.returningProductionWeight).toBeCloseTo(1);

    const power = CFB_MODEL_CONFIG.powerBaseWeights;
    expect(power.offensiveBaseWeight + power.defensiveBaseWeight).toBeCloseTo(1);
  });
});

describe("computeRawTeamRating", () => {
  it("returns insufficient-data status with all-null outputs when every input is null", () => {
    const result = computeRawTeamRating(emptyInputs("test-team"));
    expect(result.status).toBe("insufficient-data");
    expect(result.rawOffensiveRating).toBeNull();
    expect(result.rawDefensiveRating).toBeNull();
    expect(result.rawPowerRating).toBeNull();
  });

  it("computes a rating from prior performance alone, reweighting around missing inputs", () => {
    const inputs: CfbPreseasonModelInputs = {
      ...emptyInputs("solo-prior"),
      priorPerformance: {
        teamId: "solo-prior",
        season: 2025,
        offensiveYardsPerPlay: 6.5,
        defensiveYardsPerPlayAllowed: 5.0,
        pointsPerGame: 30,
        pointsAllowedPerGame: 20,
        wins: 9,
        losses: 3,
        pointDifferentialPerGame: 10,
      },
    };
    const result = computeRawTeamRating(inputs);
    expect(result.status).toBe("computed");
    // Only priorPerformance was available, so it should be fully reweighted to 1.0.
    expect(result.rawOffensiveRating).toBeCloseTo(6.5);
    // Defensive metric is negated (lower allowed = better).
    expect(result.rawDefensiveRating).toBeCloseTo(-5.0);
    expect(result.rawPowerRating).not.toBeNull();
  });

  it("does not throw when only returning-production data is present (no prior performance)", () => {
    const inputs: CfbPreseasonModelInputs = {
      ...emptyInputs("solo-returning"),
      returningProduction: {
        teamId: "solo-returning",
        returningQuarterback: true,
        returningOffensiveStarters: 8,
        returningDefensiveStarters: 7,
        returningOffensiveProductionPct: 75,
        returningDefensiveProductionPct: 60,
      },
    };
    expect(() => computeRawTeamRating(inputs)).not.toThrow();
    const result = computeRawTeamRating(inputs);
    expect(result.status).toBe("computed");
    expect(result.rawOffensiveRating).not.toBeNull();
  });

  it("prefers opponent-adjusted efficiency over raw prior performance when both exist", () => {
    const inputs: CfbPreseasonModelInputs = {
      ...emptyInputs("adjusted"),
      priorPerformance: {
        teamId: "adjusted",
        season: 2025,
        offensiveYardsPerPlay: 5.0,
        defensiveYardsPerPlayAllowed: 5.0,
        pointsPerGame: null,
        pointsAllowedPerGame: null,
        wins: null,
        losses: null,
        pointDifferentialPerGame: null,
      },
      opponentAdjusted: {
        teamId: "adjusted",
        opponentAdjustedOffensiveEfficiency: 7.2,
        opponentAdjustedDefensiveEfficiency: 4.1,
        opponentAdjustedPointDifferential: null,
      },
    };
    const result = computeRawTeamRating(inputs);
    expect(result.rawOffensiveRating).toBeCloseTo(7.2);
    expect(result.rawDefensiveRating).toBeCloseTo(-4.1);
  });

  it("carries a full breakdown of contributing components", () => {
    const inputs: CfbPreseasonModelInputs = {
      teamId: "full",
      priorPerformance: {
        teamId: "full",
        season: 2025,
        offensiveYardsPerPlay: 6.0,
        defensiveYardsPerPlayAllowed: 5.0,
        pointsPerGame: 28,
        pointsAllowedPerGame: 21,
        wins: 8,
        losses: 4,
        pointDifferentialPerGame: 7,
      },
      priorPerformanceMetadata: {
        source: "prior-fbs-raw",
        sampleGames: 12,
        sourceClassification: "fbs",
        sourceGameIds: [],
      },
      opponentAdjusted: null,
      returningProduction: {
        teamId: "full",
        returningQuarterback: true,
        returningOffensiveStarters: 7,
        returningDefensiveStarters: 6,
        returningOffensiveProductionPct: 70,
        returningDefensiveProductionPct: 55,
      },
      rosterTalent: null,
      coachingContinuity: null,
    };
    const result = computeRawTeamRating(inputs);
    expect(result.breakdown.priorPerformanceContribution).not.toBeNull();
    expect(result.breakdown.returningProductionContribution).not.toBeNull();
    expect(result.breakdown.qbContinuityContribution).not.toBeNull();
    expect(result.breakdown.offensiveBaseContribution).not.toBeNull();
    expect(result.breakdown.defensiveBaseContribution).not.toBeNull();
  });
});

describe("computeDisplayRatings", () => {
  it("preserves rank ordering: rank #1 corresponds to the highest jkbPowerRating", () => {
    const raw = [
      computeRawTeamRating({
        ...emptyInputs("low"),
        priorPerformance: {
          teamId: "low",
          season: 2025,
          offensiveYardsPerPlay: 4.0,
          defensiveYardsPerPlayAllowed: 7.0,
          pointsPerGame: null,
          pointsAllowedPerGame: null,
          wins: null,
          losses: null,
          pointDifferentialPerGame: null,
        },
      }),
      computeRawTeamRating({
        ...emptyInputs("high"),
        priorPerformance: {
          teamId: "high",
          season: 2025,
          offensiveYardsPerPlay: 8.0,
          defensiveYardsPerPlayAllowed: 3.0,
          pointsPerGame: null,
          pointsAllowedPerGame: null,
          wins: null,
          losses: null,
          pointDifferentialPerGame: null,
        },
      }),
    ];
    const display = computeDisplayRatings(raw);
    const high = display.find((d) => d.teamId === "high")!;
    const low = display.find((d) => d.teamId === "low")!;
    expect(high.jkbRank).toBe(1);
    expect(low.jkbRank).toBe(2);
    expect(high.jkbPowerRating!).toBeGreaterThan(low.jkbPowerRating!);
  });

  it("leaves teams with insufficient data at null rating and null rank", () => {
    const raw = [computeRawTeamRating(emptyInputs("nodata"))];
    const display = computeDisplayRatings(raw);
    expect(display[0].jkbPowerRating).toBeNull();
    expect(display[0].jkbRank).toBeNull();
  });
});
