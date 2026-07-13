import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NFL_POWER_V03_FORMULA_METADATA,
  NFL_POWER_V03_FORMULA_WEIGHTS,
  NFL_POWER_V03_MODEL_VERSION,
  NFL_POWER_V03_POOLED_DIVISOR,
  NFL_POWER_V03_PUBLIC_SCALE,
  NFL_POWER_V03_REQUIRED_METRICS,
  NFL_POWER_V03_TRAJECTORY,
  NFL_POWER_V03_TRAJECTORY_THRESHOLDS,
  adjustDefensiveEpaPerPlay,
  adjustOffensiveEpaPerPlay,
  adjustPointDifferentialPerGame,
  calculateComposite,
  calculateTrajectoryTerm,
  clampTrajectoryDelta,
  classifyPrimaryTrajectory,
  classifyTrajectoryWithScheduleContext,
  compositeToUnitZ,
  getScheduleContextModifiers,
  invertDefensiveValue,
  leagueMeanAndStandardDeviation,
  rankRatings,
  shrinkTrajectoryDelta,
  stableZScore,
  toPublicRating,
  validateRequiredMetrics,
} from "../../../scripts/lib/nfl-power-v03-metrics.mjs";

const ROOT = resolve(__dirname, "../../..");

describe("nfl-power-v0.3.0 opponent adjustments", () => {
  it("adjusts offensive EPA/play for opponent defensive EPA/play", () => {
    // Opponents allowed -0.03 EPA/play vs a +0.01 league mean, so +0.04.
    expect(adjustOffensiveEpaPerPlay(0.12, [-0.08, 0.02], 0.01)).toBeCloseTo(0.16);
  });

  it("adjusts defensive EPA/play for opponent offensive EPA/play", () => {
    // Opponents produced +0.10 EPA/play vs a +0.04 league mean, so EPA allowed improves by 0.06.
    expect(adjustDefensiveEpaPerPlay(0.03, [0.12, 0.08], 0.04)).toBeCloseTo(-0.03);
  });

  it("inverts lower-is-better defensive values", () => {
    expect(invertDefensiveValue(-0.03)).toBeCloseTo(0.03);
    expect(invertDefensiveValue(0.07)).toBeCloseTo(-0.07);
  });

  it("adjusts each game margin using its opponent context before averaging", () => {
    const games = [
      { pointDifferential: 7, opponentPointDifferentialPerGame: 4 },
      { pointDifferential: -3, opponentPointDifferentialPerGame: -2 },
    ];

    // ((7 + 4) + (-3 - 2)) / 2 = 3.
    expect(adjustPointDifferentialPerGame(games, 0)).toBe(3);
  });
});

describe("nfl-power-v0.3.0 standardization and composite", () => {
  it("computes league population mean and standard deviation", () => {
    expect(leagueMeanAndStandardDeviation([1, 2, 3])).toEqual({
      mean: 2,
      standardDeviation: Math.sqrt(2 / 3),
      count: 3,
    });
  });

  it("converts values to stable z-scores", () => {
    const stats = leagueMeanAndStandardDeviation([1, 2, 3]);
    expect(stableZScore(3, stats)).toBeCloseTo(Math.sqrt(3 / 2));
    expect(stableZScore(2, stats)).toBe(0);
  });

  it("maps valid zero-variance inputs to z = 0 deterministically", () => {
    const stats = leagueMeanAndStandardDeviation([4, 4, 4]);
    expect(stats).toEqual({ mean: 4, standardDeviation: 0, count: 3 });
    expect(stableZScore(4, stats)).toBe(0);
    expect(stableZScore(100, stats)).toBe(0);
  });

  it("uses the approved 40/40/20 weights and they sum to one", () => {
    expect(NFL_POWER_V03_FORMULA_WEIGHTS).toEqual({
      opponentAdjustedOffensiveEpaPerPlay: 0.4,
      opponentAdjustedDefensiveEpaPerPlayInverted: 0.4,
      opponentAdjustedPointDifferentialPerGame: 0.2,
    });
    expect(
      Object.values(NFL_POWER_V03_FORMULA_WEIGHTS).reduce((sum, weight) => sum + weight, 0)
    ).toBeCloseTo(1);
    expect(
      calculateComposite({ offensiveZ: 1, defensiveZ: 0.5, pointDifferentialZ: -0.5 })
    ).toBeCloseTo(0.5);
  });

  it("produces deterministic output for identical inputs", () => {
    const input = { offensiveZ: 0.8, defensiveZ: -0.2, pointDifferentialZ: 0.4 };
    const first = calculateComposite(input);
    expect(calculateComposite(input)).toBe(first);
    expect(toPublicRating(first)).toBe(toPublicRating(first));
  });
});

describe("nfl-power-v0.3.0 missing-data behavior", () => {
  it("marks missing EPA as unrated", () => {
    expect(
      validateRequiredMetrics({
        offensiveEpaPerPlay: null,
        defensiveEpaPerPlay: -0.02,
        pointDifferentialPerGame: 4,
      })
    ).toEqual({
      isValid: false,
      status: "unrated",
      missingFields: ["offensiveEpaPerPlay"],
      invalidFields: [],
    });
  });

  it("never implicitly converts missing EPA to a real zero", () => {
    expect(adjustOffensiveEpaPerPlay(null, [-0.02], 0)).toBeNull();
    expect(adjustOffensiveEpaPerPlay(0.1, [null], 0)).toBeNull();
    expect(adjustDefensiveEpaPerPlay(undefined, [0.1], 0)).toBeNull();
    expect(adjustDefensiveEpaPerPlay(0.1, [], 0)).toBeNull();
    expect(stableZScore(null, { mean: 0, standardDeviation: 1 })).toBeNull();
  });

  it("rejects non-finite inputs instead of returning NaN or Infinity", () => {
    expect(leagueMeanAndStandardDeviation([1, Number.NaN])).toBeNull();
    expect(stableZScore(1, { mean: 0, standardDeviation: Number.POSITIVE_INFINITY })).toBeNull();
    expect(invertDefensiveValue(Number.NEGATIVE_INFINITY)).toBeNull();
    expect(calculateComposite({ offensiveZ: 1, defensiveZ: 1, pointDifferentialZ: Number.NaN })).toBeNull();
    expect(toPublicRating(Number.POSITIVE_INFINITY)).toBeNull();
    expect(
      validateRequiredMetrics({
        offensiveEpaPerPlay: Number.NaN,
        defensiveEpaPerPlay: Number.POSITIVE_INFINITY,
        pointDifferentialPerGame: 0,
      })
    ).toEqual({
      isValid: false,
      status: "unrated",
      missingFields: [],
      invalidFields: ["offensiveEpaPerPlay", "defensiveEpaPerPlay"],
    });
  });

  it("leaves invalid ratings explicitly unrated during ranking", () => {
    expect(
      rankRatings([
        { teamId: "nfl-rated", publicRating: 60, compositeZ: 0.5 },
        { teamId: "nfl-missing", publicRating: null, compositeZ: null },
      ])
    ).toEqual([
      { teamId: "nfl-rated", publicRating: 60, compositeZ: 0.5, rank: 1 },
      { teamId: "nfl-missing", publicRating: null, compositeZ: null, rank: null },
    ]);
  });
});

describe("nfl-power-v0.3.0 public scale and ranking", () => {
  it("uses the approved pooled divisor and stable 50 + 15 * unitZ transform", () => {
    expect(NFL_POWER_V03_POOLED_DIVISOR).toBe(0.733);
    expect(compositeToUnitZ(0.733)).toBe(1);
    expect(toPublicRating(0)).toBe(50);
    expect(toPublicRating(0.733)).toBe(65);
    expect(toPublicRating(-0.733)).toBe(35);
  });

  it("applies only the soft pathological [1, 99] cap", () => {
    expect(NFL_POWER_V03_PUBLIC_SCALE.minimum).toBe(1);
    expect(NFL_POWER_V03_PUBLIC_SCALE.maximum).toBe(99);
    expect(toPublicRating(100)).toBe(99);
    expect(toPublicRating(-100)).toBe(1);
    expect(toPublicRating(0.3665)).toBeCloseTo(57.5);
  });

  it("ranks deterministically by rating, uncapped composite, then team ID", () => {
    const rows = [
      { teamId: "nfl-z", publicRating: 99, compositeZ: 4 },
      { teamId: "nfl-b", publicRating: 60, compositeZ: 0.5 },
      { teamId: "nfl-a", publicRating: 60, compositeZ: 0.5 },
      { teamId: "nfl-y", publicRating: 99, compositeZ: 5 },
    ];
    const expected = ["nfl-y", "nfl-z", "nfl-a", "nfl-b"];

    expect(rankRatings(rows).map((row: { teamId: string }) => row.teamId)).toEqual(expected);
    expect(rankRatings([...rows].reverse()).map((row: { teamId: string }) => row.teamId)).toEqual(expected);
    expect(rankRatings(rows).map((row: { rank: number }) => row.rank)).toEqual([1, 2, 3, 4]);
  });
});

describe("nfl-power-v0.3.0 trajectory calculations", () => {
  it("uses k = 4 shrinkage with an eight-game window", () => {
    expect(NFL_POWER_V03_TRAJECTORY.shrinkageK).toBe(4);
    // (8 / (8 + 4)) * (1.2 - 0) = 0.8.
    expect(shrinkTrajectoryDelta(1.2, 0, 8)).toBeCloseTo(0.8);
  });

  it("shrinks short windows using the actual supplied window size", () => {
    // (2 / (2 + 4)) * (1.2 - 0) = 0.4.
    expect(shrinkTrajectoryDelta(1.2, 0, 2)).toBeCloseTo(0.4);
    expect(shrinkTrajectoryDelta(1.2, 0, 2)).toBeLessThan(
      shrinkTrajectoryDelta(1.2, 0, 8)!
    );
  });

  it("clamps positive and negative deltas at the approved +/-1.0 cap", () => {
    expect(NFL_POWER_V03_TRAJECTORY.cap).toBe(1);
    expect(clampTrajectoryDelta(1.8)).toBe(1);
    expect(clampTrajectoryDelta(-1.8)).toBe(-1);
    expect(clampTrajectoryDelta(0.8)).toBe(0.8);
  });

  it("returns trajectoryTerm 0 with launch lambda = 0", () => {
    expect(NFL_POWER_V03_TRAJECTORY.lambda).toBe(0);
    expect(calculateTrajectoryTerm(0.8)).toBe(0);
    expect(calculateTrajectoryTerm(-0.8)).toBe(0);
  });

  it("accepts a nonzero lambda so the helper remains reusable", () => {
    expect(calculateTrajectoryTerm(0.8, 0.25)).toBeCloseTo(0.2);
    expect(calculateTrajectoryTerm(-0.8, 0.25)).toBeCloseTo(-0.2);
  });

  it("returns null for missing, non-finite, or invalid trajectory inputs", () => {
    expect(shrinkTrajectoryDelta(null, 0, 8)).toBeNull();
    expect(shrinkTrajectoryDelta(1, undefined, 8)).toBeNull();
    expect(shrinkTrajectoryDelta(1, 0, 0)).toBeNull();
    expect(shrinkTrajectoryDelta(1, 0, 8, Number.POSITIVE_INFINITY)).toBeNull();
    expect(clampTrajectoryDelta(Number.NaN)).toBeNull();
    expect(clampTrajectoryDelta(1, 0)).toBeNull();
    expect(calculateTrajectoryTerm(null)).toBeNull();
    expect(calculateTrajectoryTerm(1, Number.NEGATIVE_INFINITY)).toBeNull();
  });
});

describe("nfl-power-v0.3.0 trajectory rules", () => {
  it("classifies the exact +0.5 and -0.5 boundaries", () => {
    expect(NFL_POWER_V03_TRAJECTORY_THRESHOLDS.lateRiser).toBe(0.5);
    expect(NFL_POWER_V03_TRAJECTORY_THRESHOLDS.lateDecline).toBe(-0.5);
    expect(classifyPrimaryTrajectory(0.5)).toBe("Late Riser");
    expect(classifyPrimaryTrajectory(-0.5)).toBe("Late Decline");
  });

  it("classifies values immediately inside both boundaries as Stable", () => {
    expect(classifyPrimaryTrajectory(0.499999)).toBe("Stable");
    expect(classifyPrimaryTrajectory(-0.499999)).toBe("Stable");
  });

  it("reclassifies a schedule-inflated surge", () => {
    expect(classifyTrajectoryWithScheduleContext(0.5, 0.249999)).toBe(
      "Schedule-Inflated Surge"
    );
    expect(classifyTrajectoryWithScheduleContext(0.5, 0.25)).toBe("Stable");
  });

  it("reclassifies a schedule-masked fade", () => {
    expect(classifyTrajectoryWithScheduleContext(-0.5, -0.249999)).toBe(
      "Schedule-Masked Fade"
    );
    expect(classifyTrajectoryWithScheduleContext(-0.5, -0.25)).toBe("Stable");
  });

  it("returns Schedule-Aided and Schedule-Hidden at the inclusive 0.5 gap", () => {
    expect(getScheduleContextModifiers(0.75, 0.25)).toEqual(["Schedule-Aided"]);
    expect(getScheduleContextModifiers(-0.25, 0.25)).toEqual(["Schedule-Hidden"]);
  });

  it("returns no modifier below the 0.5 gap", () => {
    expect(getScheduleContextModifiers(0.749999, 0.25)).toEqual([]);
    expect(getScheduleContextModifiers(-0.249999, 0.25)).toEqual([]);
  });

  it("returns null classifications and modifiers for missing or non-finite inputs", () => {
    expect(classifyPrimaryTrajectory(null)).toBeNull();
    expect(classifyPrimaryTrajectory(Number.NaN)).toBeNull();
    expect(classifyTrajectoryWithScheduleContext(undefined, 0)).toBeNull();
    expect(classifyTrajectoryWithScheduleContext(0, Number.POSITIVE_INFINITY)).toBeNull();
    expect(getScheduleContextModifiers(null, 0)).toBeNull();
    expect(getScheduleContextModifiers(0, Number.NEGATIVE_INFINITY)).toBeNull();
  });

  it("does not mutate inputs and is deterministic across repeated calls", () => {
    const trajectoryArgs = Object.freeze([1.2, 0, 8] as const);
    const ruleArgs = Object.freeze([0.75, 0.25] as const);
    const firstDelta = shrinkTrajectoryDelta(...trajectoryArgs);
    const firstClassification = classifyTrajectoryWithScheduleContext(...ruleArgs);
    const firstModifiers = getScheduleContextModifiers(...ruleArgs);

    expect(shrinkTrajectoryDelta(...trajectoryArgs)).toBe(firstDelta);
    expect(classifyTrajectoryWithScheduleContext(...ruleArgs)).toBe(firstClassification);
    expect(getScheduleContextModifiers(...ruleArgs)).toEqual(firstModifiers);
    expect(trajectoryArgs).toEqual([1.2, 0, 8]);
    expect(ruleArgs).toEqual([0.75, 0.25]);
  });
});

describe("nfl-power-v0.3.0 isolation and immutability", () => {
  it("does not use unrelated scoring fields", () => {
    const forbidden = [
      "odds",
      "betting",
      "market",
      "spread",
      "total",
      "winTotal",
      "winPercentage",
      "upcomingSchedule",
    ];
    const formulaFields = [
      ...Object.keys(NFL_POWER_V03_FORMULA_WEIGHTS),
      ...NFL_POWER_V03_REQUIRED_METRICS,
    ];
    expect(formulaFields.some((field) => forbidden.includes(field))).toBe(false);

    const source = readFileSync(
      join(ROOT, "scripts/lib/nfl-power-v03-metrics.mjs"),
      "utf-8"
    );
    expect(source).not.toMatch(/\.(odds|betting|market|spread|total|winTotal|winPercentage)\b/);
  });

  it("does not mutate arrays, game contexts, metric inputs, or rating rows", () => {
    const opponentDefense = Object.freeze([-0.08, 0.02]);
    const games = Object.freeze([
      Object.freeze({ pointDifferential: 7, opponentPointDifferentialPerGame: 4 }),
    ]);
    const metrics = Object.freeze({
      offensiveEpaPerPlay: 0.1,
      defensiveEpaPerPlay: -0.02,
      pointDifferentialPerGame: 3,
    });
    const rows = Object.freeze([
      Object.freeze({ teamId: "nfl-a", publicRating: 60, compositeZ: 0.5 }),
    ]);

    expect(() => adjustOffensiveEpaPerPlay(0.1, opponentDefense, 0)).not.toThrow();
    expect(() => adjustPointDifferentialPerGame(games, 0)).not.toThrow();
    expect(() => validateRequiredMetrics(metrics)).not.toThrow();
    expect(() => rankRatings(rows)).not.toThrow();
    expect(opponentDefense).toEqual([-0.08, 0.02]);
    expect(games).toEqual([{ pointDifferential: 7, opponentPointDifferentialPerGame: 4 }]);
    expect(rows[0]).not.toHaveProperty("rank");
  });

  it("exposes versioned formula metadata for later artifact generation", () => {
    expect(NFL_POWER_V03_MODEL_VERSION).toBe("nfl-power-v0.3.0");
    expect(NFL_POWER_V03_FORMULA_METADATA).toMatchObject({
      modelVersion: NFL_POWER_V03_MODEL_VERSION,
      weights: NFL_POWER_V03_FORMULA_WEIGHTS,
      standardization: {
        method: "league population z-score",
        zeroVarianceZScore: 0,
      },
      publicScale: {
        pooledDivisor: 0.733,
        cap: [1, 99],
      },
      trajectory: {
        lambda: 0,
        shrinkageK: 4,
        cap: 1,
        thresholds: NFL_POWER_V03_TRAJECTORY_THRESHOLDS,
      },
    });
  });
});

describe("nfl-power-v0.3.0 representative teams", () => {
  it("separates strong, average, and weak fixtures without season min-max scaling", () => {
    const fixtures = [
      { teamId: "nfl-strong", offense: 0.2, defenseAllowed: -0.16, margin: 9 },
      { teamId: "nfl-average", offense: 0, defenseAllowed: 0, margin: 0 },
      { teamId: "nfl-weak", offense: -0.2, defenseAllowed: 0.16, margin: -9 },
    ];
    const offenseStats = leagueMeanAndStandardDeviation(fixtures.map((team) => team.offense));
    const defenseValues = fixtures.map((team) => invertDefensiveValue(team.defenseAllowed));
    const defenseStats = leagueMeanAndStandardDeviation(defenseValues);
    const marginStats = leagueMeanAndStandardDeviation(fixtures.map((team) => team.margin));

    const rows = fixtures.map((team, index) => {
      const compositeZ = calculateComposite({
        offensiveZ: stableZScore(team.offense, offenseStats),
        defensiveZ: stableZScore(defenseValues[index], defenseStats),
        pointDifferentialZ: stableZScore(team.margin, marginStats),
      });
      return {
        teamId: team.teamId,
        compositeZ,
        publicRating: toPublicRating(compositeZ),
      };
    });
    const ranked = rankRatings(rows);

    expect(ranked.map((row: { teamId: string }) => row.teamId)).toEqual([
      "nfl-strong",
      "nfl-average",
      "nfl-weak",
    ]);
    expect(ranked[0].publicRating).toBeGreaterThan(50);
    expect(ranked[1].publicRating).toBe(50);
    expect(ranked[2].publicRating).toBeLessThan(50);
  });
});
