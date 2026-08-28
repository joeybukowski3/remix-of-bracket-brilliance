import { describe, expect, it } from "vitest";
import {
  NFL_CLASSIC_DST_SCORING,
  NFL_CLASSIC_OFFENSIVE_SCORING,
  NFL_CLASSIC_ROSTER,
  NFL_CLASSIC_RULES,
  NFL_CLASSIC_SALARY_CAP,
} from "@/lib/nfl/dfs/nflClassicRules";

describe("NFL Classic rules contract", () => {
  it("encodes the 9-slot roster requirement with FLEX eligible for RB/WR/TE", () => {
    expect(NFL_CLASSIC_ROSTER.totalSlots).toBe(9);
    expect(NFL_CLASSIC_ROSTER.slots.reduce((sum, slot) => sum + slot.count, 0)).toBe(9);

    const flexSlot = NFL_CLASSIC_ROSTER.slots.find((slot) => slot.slot === "FLEX");
    expect(flexSlot?.eligiblePositions).toEqual(["RB", "WR", "TE"]);

    const qbSlot = NFL_CLASSIC_ROSTER.slots.find((slot) => slot.slot === "QB");
    expect(qbSlot?.count).toBe(1);
    const rbSlot = NFL_CLASSIC_ROSTER.slots.find((slot) => slot.slot === "RB");
    expect(rbSlot?.count).toBe(2);
    const wrSlot = NFL_CLASSIC_ROSTER.slots.find((slot) => slot.slot === "WR");
    expect(wrSlot?.count).toBe(3);
    const teSlot = NFL_CLASSIC_ROSTER.slots.find((slot) => slot.slot === "TE");
    expect(teSlot?.count).toBe(1);
    const dstSlot = NFL_CLASSIC_ROSTER.slots.find((slot) => slot.slot === "DST");
    expect(dstSlot?.count).toBe(1);
  });

  it("requires a minimum of 2 games in a lineup", () => {
    expect(NFL_CLASSIC_ROSTER.minimumGamesRequired).toBe(2);
  });

  it("encodes offensive scoring exactly as supplied", () => {
    expect(NFL_CLASSIC_OFFENSIVE_SCORING.passing).toEqual({
      touchdown: 4,
      pointsPerYard: 0.04,
      bonus: { yardThreshold: 300, points: 3 },
      interception: -1,
    });
    expect(NFL_CLASSIC_OFFENSIVE_SCORING.rushing).toEqual({
      touchdown: 6,
      pointsPerYard: 0.1,
      bonus: { yardThreshold: 100, points: 3 },
    });
    expect(NFL_CLASSIC_OFFENSIVE_SCORING.receiving).toEqual({
      touchdown: 6,
      pointsPerYard: 0.1,
      reception: 1,
      bonus: { yardThreshold: 100, points: 3 },
    });
    expect(NFL_CLASSIC_OFFENSIVE_SCORING.other).toEqual({
      fumbleLost: -1,
      twoPointConversion: 2,
      puntKickoffFieldGoalReturnTouchdown: 6,
      offensiveFumbleRecoveryTouchdown: 6,
    });
  });

  it("encodes DST scoring and points-allowed tiers exactly as supplied", () => {
    expect(NFL_CLASSIC_DST_SCORING.sack).toBe(1);
    expect(NFL_CLASSIC_DST_SCORING.interception).toBe(2);
    expect(NFL_CLASSIC_DST_SCORING.fumbleRecovery).toBe(2);
    expect(NFL_CLASSIC_DST_SCORING.safety).toBe(2);
    expect(NFL_CLASSIC_DST_SCORING.blockedKick).toBe(2);
    expect(NFL_CLASSIC_DST_SCORING.twoPointConversionOrExtraPointReturn).toBe(2);

    expect(NFL_CLASSIC_DST_SCORING.pointsAllowed).toEqual([
      { min: 0, max: 0, points: 10 },
      { min: 1, max: 6, points: 7 },
      { min: 7, max: 13, points: 4 },
      { min: 14, max: 20, points: 1 },
      { min: 21, max: 27, points: 0 },
      { min: 28, max: 34, points: -1 },
      { min: 35, max: null, points: -4 },
    ]);
  });

  it("does not encode an unproven salary cap value", () => {
    expect(NFL_CLASSIC_SALARY_CAP).toBeNull();
    expect(NFL_CLASSIC_RULES.salaryCap).toBeNull();
    expect(NFL_CLASSIC_RULES).not.toHaveProperty("salaryCapAmount");
  });

  it("is versioned so downstream consumers can detect rule changes", () => {
    expect(NFL_CLASSIC_RULES.version).toBe("nfl-classic-rules-v1");
  });
});
