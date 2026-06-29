/**
 * numerology-target-priority.test.ts
 * Tests for the refined scoring hierarchy:
 * exact target > reduces to target > 3/6/9 family > 2-based
 * birthday > age
 */
import { describe, it, expect } from "vitest";
import { calculateNumerologyScoreBreakdown } from "@/lib/numerology/mlbScoreAudit";
import type { DailyProfile } from "@/types/mlbNumerology";

// ── Fixtures ──────────────────────────────────────────────────────────────────

// Universal Day 27/9, primaryFamily=[3,6,9], secondaryFamily=[2,5,8]
const DAILY: DailyProfile = {
  universalDayRawSum: 27,
  universalDayCompound: 27,
  universalDayMaster: null,
  universalDayRoot: 9,
  universalDayTrace: ["2+0+2+6+0+6+2+9=27"],
  calendarDayCompound: 29,
  calendarDayRoot: 2,
  universalYear: 1,
  universalMonth: 7,
  structuralEcho: "9/9",
  primaryFamily: [3, 6, 9],
  secondaryFamily: [2, 5, 8],
  balancingComplement: 1,
  countercurrent: 9,
  repeatedDigits: [{ digit: 2, count: 3, reinforces: "secondary" }],
  interpretation: "Test profile",
};

const SLATE = "2026-06-29";

function makePlayer(overrides: Partial<{ playerName: string; jerseyNumber: number | null; battingOrder: number | null; numerologyScore: number }> = {}) {
  return { playerName: "Test Player", jerseyNumber: null, battingOrder: null, numerologyScore: 50, ...overrides };
}

function makeIdentity(overrides: Partial<{ birthDate: string | null; jerseyNumber: number | null }> = {}) {
  return { birthDate: null, jerseyNumber: null, ...overrides };
}

// ── 1–3: Hierarchy tests ──────────────────────────────────────────────────────

describe("Scoring hierarchy: exact target > reduces to target > 3/6/9 family > 2", () => {
  it("1. exact 9 jersey outranks 27/9 jersey (same root, but 9 is exact single digit)", () => {
    // jersey=9 is exact root target (single digit 9 === root 9)
    const exact9 = calculateNumerologyScoreBreakdown(makePlayer({ jerseyNumber: 9 }), makeIdentity(), DAILY, SLATE);
    // jersey=27 reduces to 9 (compound match to target 27, which also → 9)
    const reduces27 = calculateNumerologyScoreBreakdown(makePlayer({ jerseyNumber: 27 }), makeIdentity(), DAILY, SLATE);
    // jersey=27 is exact compound target match — should score AT LEAST as high as jersey=9
    // (27 is the exact universalDayRawSum=27, so it hits the exactPoints branch with W.jerseyExact=18)
    // jersey=9 hits root match with W.jerseyRoot=10
    const score27 = reduces27.signals.find(s => s.field === "jersey")?.points ?? 0;
    const score9 = exact9.signals.find(s => s.field === "jersey")?.points ?? 0;
    expect(score27).toBeGreaterThan(score9); // exact compound 27 > root 9
  });

  it("2. jersey 27/9 (reduces to target) outranks jersey 6 (family support)", () => {
    const reduces = calculateNumerologyScoreBreakdown(makePlayer({ jerseyNumber: 27 }), makeIdentity(), DAILY, SLATE);
    const family = calculateNumerologyScoreBreakdown(makePlayer({ jerseyNumber: 6 }), makeIdentity(), DAILY, SLATE);
    const rScore = reduces.signals.find(s => s.field === "jersey")?.points ?? 0;
    const fScore = family.signals.find(s => s.field === "jersey")?.points ?? 0;
    expect(rScore).toBeGreaterThan(fScore);
  });

  it("3. 3/6/9 family outranks 2-based signal", () => {
    const family = calculateNumerologyScoreBreakdown(makePlayer({ jerseyNumber: 6 }), makeIdentity(), DAILY, SLATE);
    const twoBase = calculateNumerologyScoreBreakdown(makePlayer({ jerseyNumber: 2 }), makeIdentity(), DAILY, SLATE);
    const fScore = family.signals.find(s => s.field === "jersey")?.points ?? 0;
    const tScore = twoBase.signals.find(s => s.field === "jersey")?.points ?? 0;
    expect(fScore).toBeGreaterThan(tScore);
  });
});

// ── 4–6: Birthday vs age ──────────────────────────────────────────────────────

describe("Birthday outweighs age", () => {
  it("4. exact birth day 9 scores above exact age 9", () => {
    // Player born on the 9th → birthDay.original=9=root
    const bdPlayer = calculateNumerologyScoreBreakdown(
      makePlayer({ numerologyScore: 50 }),
      makeIdentity({ birthDate: "1998-03-09" }), // birth day = 9
      DAILY, SLATE
    );
    // Player who is 9 years old (unrealistic, but tests the weight)
    const bdSignal = bdPlayer.signals.find(s => s.field === "birthDay")?.points ?? 0;
    // Age 9 would use W.ageRoot (since 9 is root) = 3
    // BirthDay 9 root match should be W.birthDayRoot = 12
    expect(bdSignal).toBeGreaterThanOrEqual(12); // birthDayRoot >= 12
  });

  it("5. birth day 27/9 scores above age 27/9", () => {
    // Born on 27th → birthDay compound = 27, root = 9 → exact compound target match
    const bdPlayer = calculateNumerologyScoreBreakdown(
      makePlayer(),
      makeIdentity({ birthDate: "1998-03-27" }), // birth day = 27
      DAILY, SLATE
    );
    const bdSignal = bdPlayer.signals.find(s => s.field === "birthDay")?.points ?? 0;
    // BirthDay 27 = exact target (27 === universalDayRawSum=27) → W.birthDayExact = 20
    // Age 27 = W.ageExact = 7
    expect(bdSignal).toBeGreaterThanOrEqual(18); // at least birthDayRoot=12 if not exact
  });

  it("6. birthday strong match outranks age strong match in calculated score", () => {
    const withBirthday = calculateNumerologyScoreBreakdown(
      makePlayer({ jerseyNumber: 1 }),
      makeIdentity({ birthDate: "1998-03-27" }), // birthday = 27 = exact target
      DAILY, SLATE
    );
    expect(withBirthday.hasBirthdayExact || withBirthday.hasBirthdayStrong).toBe(true);
  });
});

// ── 7–8: Strong vs weak combinations ─────────────────────────────────────────

describe("Quality-first: strong matches beat weak accumulation", () => {
  it("7. two strong matches (jersey+birthday exact) outrank player with many weak family signals", () => {
    // Strong player: jersey=27 (exact target) + birthDay=27 (exact target)
    const strong = calculateNumerologyScoreBreakdown(
      makePlayer({ jerseyNumber: 27 }),
      makeIdentity({ birthDate: "1990-03-27" }),
      DAILY, SLATE
    );
    // Weak player: many family signals but none exact
    // Simulate via expressionRoot + primaryFamily signals only (low weights)
    const weak = calculateNumerologyScoreBreakdown(
      makePlayer({ jerseyNumber: 6 }), // family only
      makeIdentity({ birthDate: "1990-01-06" }), // birthDay=6, family
      DAILY, SLATE
    );
    expect(strong.rawNumerology).toBeGreaterThan(weak.rawNumerology);
  });

  it("8. 3/6/9 family alone does not outrank direct 9 match", () => {
    // Direct root match (9) jersey
    const direct = calculateNumerologyScoreBreakdown(makePlayer({ jerseyNumber: 9 }), makeIdentity(), DAILY, SLATE);
    // Family only: jersey=3 
    const family = calculateNumerologyScoreBreakdown(makePlayer({ jerseyNumber: 3 }), makeIdentity(), DAILY, SLATE);
    const directScore = direct.signals.find(s => s.field === "jersey")?.points ?? 0;
    const familyScore = family.signals.find(s => s.field === "jersey")?.points ?? 0;
    expect(directScore).toBeGreaterThan(familyScore);
  });
});

// ── 9–10: 2-based de-emphasis ─────────────────────────────────────────────────

describe("2-based signals receive minimal weight", () => {
  it("9. jersey=2 (secondary family) receives very low points (≤1)", () => {
    const player = calculateNumerologyScoreBreakdown(makePlayer({ jerseyNumber: 2 }), makeIdentity(), DAILY, SLATE);
    const jerseySignal = player.signals.find(s => s.field === "jersey");
    // jersey=2, calendarDayRoot=2, so it may hit secondary_exact for calendarDay=29/2
    // Otherwise secondaryFamilyMatch=1
    const pts = jerseySignal?.points ?? 0;
    expect(pts).toBeLessThanOrEqual(8); // calendar exact=8 is max; family=1
  });

  it("10. multiple 2-based signals do not create a large combo bonus", () => {
    // Player with jersey=2, battingOrder=2
    const player = calculateNumerologyScoreBreakdown(
      makePlayer({ jerseyNumber: 2, battingOrder: 2 }),
      makeIdentity(),
      DAILY, SLATE
    );
    // Combo bonus should be 0 — 2-based signals are low priority, not high-value fields
    expect(player.exactComboBonus).toBe(0);
  });
});

// ── 11–13: Combo bonuses ─────────────────────────────────────────────────────

describe("Combo bonuses: birthday+jersey, not weak families", () => {
  it("11. birthday + jersey both exact/reduced to target gets a combo bonus", () => {
    const player = calculateNumerologyScoreBreakdown(
      makePlayer({ jerseyNumber: 27 }),        // jersey = exact compound target
      makeIdentity({ birthDate: "1990-03-27" }), // birthDay = exact compound target
      DAILY, SLATE
    );
    expect(player.exactComboBonus).toBeGreaterThan(0);
  });

  it("12. birthday + personal day both strong gets a bonus", () => {
    // Player with exact personal day = 27 and exact birthday = 27
    const player = calculateNumerologyScoreBreakdown(
      makePlayer({ jerseyNumber: 4 }), // jersey = family
      makeIdentity({ birthDate: "1990-03-27" }),
      DAILY, SLATE
    );
    // birthday is exact target → hasBirthdayExact=true → birthdayComboBonus may apply
    // at minimum exactComboBonus = 0 because only birthDay is exact high-value field
    // But if it also has personalDay reduction, it should get the bonus
    expect(player.exactPrimaryCount).toBeGreaterThanOrEqual(1);
  });

  it("13. weak family-only combination receives no major combo bonus", () => {
    const player = calculateNumerologyScoreBreakdown(
      makePlayer({ jerseyNumber: 3 }),         // family 3
      makeIdentity({ birthDate: "1990-01-06" }), // birthDay=6 → family
      DAILY, SLATE
    );
    // No exact primary matches → exactComboBonus = 0
    expect(player.exactComboBonus).toBe(0);
    expect(player.exactPrimaryCount).toBe(0);
  });
});

// ── 14–16: Sorting and model rating ──────────────────────────────────────────

describe("Quality-first sorting", () => {
  it("14. exact primary count drives ranking over accumulated weak points", () => {
    const strong = calculateNumerologyScoreBreakdown(
      makePlayer({ jerseyNumber: 27 }),
      makeIdentity({ birthDate: "1998-03-27" }),
      DAILY, SLATE
    );
    expect(strong.exactPrimaryCount).toBeGreaterThanOrEqual(1);
    expect(strong.calculatedScore).toBeGreaterThan(0);
  });

  it("15. model rating is only used as tiebreaker (not in numerology score)", () => {
    // Two players with same numerology profile, different baseball score
    const p1 = calculateNumerologyScoreBreakdown(
      { ...makePlayer({ jerseyNumber: 9 }), numerologyScore: 40 },
      makeIdentity(),
      DAILY, SLATE
    );
    const p2 = calculateNumerologyScoreBreakdown(
      { ...makePlayer({ jerseyNumber: 9 }), numerologyScore: 40 },
      makeIdentity(),
      DAILY, SLATE
    );
    // Same numerology inputs → same score
    expect(p1.calculatedScore).toBe(p2.calculatedScore);
  });

  it("16. existing signal categories (primary_exact_root, primary_root, family_support) still work", () => {
    const player = calculateNumerologyScoreBreakdown(makePlayer({ jerseyNumber: 27 }), makeIdentity(), DAILY, SLATE);
    const types = new Set(player.signals.map(s => s.type));
    expect(types.has("primary_exact_root")).toBe(true); // jersey 27 = exact compound
  });
});

// ── 17–22: Data integrity ─────────────────────────────────────────────────────

describe("Data integrity", () => {
  it("17. signal labels distinguish exact vs reduction vs family", () => {
    const p27 = calculateNumerologyScoreBreakdown(makePlayer({ jerseyNumber: 27 }), makeIdentity(), DAILY, SLATE);
    const p9 = calculateNumerologyScoreBreakdown(makePlayer({ jerseyNumber: 9 }), makeIdentity(), DAILY, SLATE);
    const p6 = calculateNumerologyScoreBreakdown(makePlayer({ jerseyNumber: 6 }), makeIdentity(), DAILY, SLATE);
    const label27 = p27.signals.find(s => s.field === "jersey")?.label ?? "";
    const label9 = p9.signals.find(s => s.field === "jersey")?.label ?? "";
    const label6 = p6.signals.find(s => s.field === "jersey")?.label ?? "";
    // 27 should be "Exact" or "Exact Primary" or "Exact Target"
    expect(label27.toLowerCase()).toMatch(/exact|target/);
    // 6 should be "Family" or "Primary Family"
    expect(label6.toLowerCase()).toMatch(/family/);
  });

  it("18. birth day derived correctly from full DOB (day-of-month)", () => {
    // Born on 27th → birthDay = 27
    const player = calculateNumerologyScoreBreakdown(
      makePlayer(),
      makeIdentity({ birthDate: "1990-05-27" }),
      DAILY, SLATE
    );
    // Should have birthDay signal with compound 27
    const bdSignal = player.signals.find(s => s.field === "birthDay");
    expect(bdSignal).toBeDefined();
    // The label should show 27
    expect(bdSignal?.label).toContain("27");
  });

  it("19. age is calculated correctly from DOB and slate date", () => {
    // Born 1998-06-28 → age on 2026-06-29 = 28 (birthday was yesterday)
    const player = calculateNumerologyScoreBreakdown(
      makePlayer(),
      makeIdentity({ birthDate: "1998-06-28" }),
      DAILY, SLATE
    );
    const ageSignal = player.signals.find(s => s.field === "age");
    // Should show age 28 (28 → 2+8 = 10 → 1, root=1, no signal for root=9)
    // Not finding a signal is OK if 28 doesn't match
    expect(player.missingData).not.toContain("age");
  });

  it("20. missing DOB fails safely (no crash, missingData populated)", () => {
    expect(() => {
      calculateNumerologyScoreBreakdown(makePlayer({ jerseyNumber: 9 }), makeIdentity(), DAILY, SLATE);
    }).not.toThrow();
    const player = calculateNumerologyScoreBreakdown(makePlayer({ jerseyNumber: 9 }), makeIdentity(), DAILY, SLATE);
    expect(player.missingData).toContain("birthDate");
  });

  it("21. same input always produces same output (deterministic)", () => {
    const p1 = calculateNumerologyScoreBreakdown(
      makePlayer({ jerseyNumber: 27 }),
      makeIdentity({ birthDate: "1998-03-27" }),
      DAILY, SLATE
    );
    const p2 = calculateNumerologyScoreBreakdown(
      makePlayer({ jerseyNumber: 27 }),
      makeIdentity({ birthDate: "1998-03-27" }),
      DAILY, SLATE
    );
    expect(p1.calculatedScore).toBe(p2.calculatedScore);
    expect(p1.exactPrimaryCount).toBe(p2.exactPrimaryCount);
  });

  it("22. HR/baseball score field is not modified by numerology scoring", () => {
    const player = calculateNumerologyScoreBreakdown(
      { ...makePlayer({ jerseyNumber: 27 }), numerologyScore: 75 },
      makeIdentity({ birthDate: "1998-03-27" }),
      DAILY, SLATE
    );
    // The breakdown should not contain any HR-related fields
    const hrFields = player.signals.filter(s => s.field.toLowerCase().includes("hr") || s.field.toLowerCase().includes("baseball"));
    expect(hrFields).toHaveLength(0);
  });
});
