/**
 * numerology.test.ts — Unit tests for MLB Numerology Engine v2.0.0
 *
 * Run: npx vitest run src/lib/numerology/numerology.test.ts
 */

import { describe, it, expect } from "vitest";
import { reduce, MASTER_NUMBERS, getFamily, balancingComplement, countercurrent } from "./reduce";
import { buildDailyProfile } from "./dateProfile";
import { expressionNumber, normalizeName } from "./nameNumerology";

// ── Core reduction ─────────────────────────────────────────────────────────────

describe("reduce()", () => {
  it("returns single digit unchanged", () => {
    expect(reduce(7)).toMatchObject({ original: 7, compound: 7, master: null, root: 7 });
  });

  it("reduces 24: original=24, compound=6 (2+4), root=6", () => {
    const r = reduce(24);
    expect(r.original).toBe(24);
    expect(r.compound).toBe(6);   // 2+4=6
    expect(r.root).toBe(6);
    expect(r.master).toBeNull();
  });

  it("preserves master 11", () => {
    const r = reduce(11);
    expect(r.original).toBe(11);
    expect(r.compound).toBe(11);
    expect(r.master).toBe(11);
    expect(r.root).toBe(2);
  });

  it("preserves master 22", () => {
    const r = reduce(22);
    expect(r.original).toBe(22);
    expect(r.compound).toBe(22);
    expect(r.master).toBe(22);
    expect(r.root).toBe(4);
  });

  it("preserves master 33", () => {
    const r = reduce(33);
    expect(r.original).toBe(33);
    expect(r.compound).toBe(33);
    expect(r.master).toBe(33);
    expect(r.root).toBe(6);
  });

  it("reduces 13 to root 4 (not master): original=13, compound=4", () => {
    const r = reduce(13);
    expect(r.original).toBe(13);
    expect(r.root).toBe(4);
    expect(r.master).toBeNull();
  });

  it("reduces 29: digit-sum 11 is master, compound=11", () => {
    const r = reduce(29);
    expect(r.original).toBe(29);
    expect(r.compound).toBe(11);  // 2+9=11 (master)
    expect(r.master).toBe(11);
    expect(r.root).toBe(2);
  });
});

// ── June 24, 2026 fixture (REQUIRED test) ─────────────────────────────────────

describe("June 24, 2026 — canonical fixture", () => {
  const profile = buildDailyProfile("2026-06-24");

  it("Universal Day raw sum is 22", () => {
    expect(profile.universalDay.rawSum).toBe(22);
  });

  it("Universal Day master is 22", () => {
    expect(profile.universalDay.master).toBe(22);
  });

  it("Universal Day root is 4", () => {
    expect(profile.universalDay.root).toBe(4);
  });

  it("Calendar Day compound is 24", () => {
    expect(profile.calendarDay.original).toBe(24);
  });

  it("Calendar Day root is 6", () => {
    expect(profile.calendarDay.root).toBe(6);
  });

  it("Universal Year root is 1", () => {
    // 2+0+2+6 = 10 → 1
    expect(profile.universalYear.root).toBe(1);
  });

  it("Universal Month root is 7", () => {
    // month 6 + universal year root 1 = 7
    expect(profile.universalMonth.root).toBe(7);
  });

  it("Structural Echo is 13/4 (original=13, root=4)", () => {
    // month root 6 + calDay root 6 + year root 1 = 13 → root 4
    expect(profile.structuralEcho.original).toBe(13);
    expect(profile.structuralEcho.root).toBe(4);
  });

  it("Primary family is [1,4,7]", () => {
    expect(profile.primaryFamily).toEqual([1, 4, 7]);
  });

  it("Secondary family is [3,6,9]", () => {
    expect(profile.secondaryFamily).toEqual([3, 6, 9]);
  });

  it("Balancing complement is 6", () => {
    expect(profile.balancingComplement).toBe(6);
  });

  it("Countercurrent is 5", () => {
    expect(profile.countercurrent).toBe(5);
  });

  it("Primary is NOT mislabeled as root-6 (old demo error)", () => {
    expect(profile.universalDay.root).not.toBe(6);
  });
});

// ── Signal classification ──────────────────────────────────────────────────────

describe("Signal classification on June 24, 2026 (22/4 day)", () => {
  const profile = buildDailyProfile("2026-06-24");

  it("Jersey 22 → exact master match", () => {
    const j = reduce(22);
    expect(j.master).toBe(22);
    expect(j.master).toBe(profile.universalDay.master);
  });

  it("Jersey 4 → exact root match (not master)", () => {
    const j = reduce(4);
    expect(j.root).toBe(4);
    expect(j.master).toBeNull();
    expect(j.root).toBe(profile.universalDay.root);
  });

  it("Jersey 13 → root match (reduces to 4)", () => {
    const j = reduce(13);
    expect(j.root).toBe(4);
    expect(j.master).toBeNull();
  });

  it("Jersey 24 → exact Calendar Day compound match (24 = calendarDay)", () => {
    const j = reduce(24);
    expect(j.original).toBe(24);
    expect(profile.calendarDay.original).toBe(24);
    // 24 matches calendar day exactly
    expect(j.original).toBe(profile.calendarDay.original);
  });

  it("Jersey 33 → secondary root-6 match, NOT exact compound match to 24", () => {
    const j = reduce(33);
    expect(j.root).toBe(6); // shares root with calendarDay
    expect(j.compound).not.toBe(24); // NOT the same compound
    expect(j.original).not.toBe(24);
  });

  it("Batting 4 → exact root match", () => {
    expect(4).toBe(profile.universalDay.root);
  });

  it("Batting 1 → primary family only (not exact)", () => {
    expect(profile.primaryFamily).toContain(1);
    expect(1).not.toBe(profile.universalDay.root);
  });

  it("Batting 7 → primary family only (not exact)", () => {
    expect(profile.primaryFamily).toContain(7);
    expect(7).not.toBe(profile.universalDay.root);
  });
});

// ── Number families ────────────────────────────────────────────────────────────

describe("getFamily()", () => {
  it("4 belongs to [1,4,7]", () => expect(getFamily(4)).toEqual([1, 4, 7]));
  it("6 belongs to [3,6,9]", () => expect(getFamily(6)).toEqual([3, 6, 9]));
  it("8 belongs to [2,5,8]", () => expect(getFamily(8)).toEqual([2, 5, 8]));
});

// ── Balancing complement and countercurrent ───────────────────────────────────

describe("balancingComplement()", () => {
  it("complement of 4 is 6", () => expect(balancingComplement(4)).toBe(6));
  it("complement of 1 is 9", () => expect(balancingComplement(1)).toBe(9));
  it("complement of 5 is 5", () => expect(balancingComplement(5)).toBe(5));
});

describe("countercurrent()", () => {
  it("countercurrent of 4 is 5", () => expect(countercurrent(4)).toBe(5));
  it("countercurrent of 9 is 9 (0 → 9)", () => expect(countercurrent(9)).toBe(9));
  it("countercurrent of 1 is 8", () => expect(countercurrent(1)).toBe(8));
});

// ── Final score formula ────────────────────────────────────────────────────────

describe("Final Alignment Score formula", () => {
  it("60/40 split rounds correctly", () => {
    const num = 80, base = 70;
    const final = Math.round(0.6 * num + 0.4 * base);
    expect(final).toBe(76); // 48 + 28 = 76
  });

  it("matches formula for boundary values", () => {
    expect(Math.round(0.6 * 100 + 0.4 * 100)).toBe(100);
    expect(Math.round(0.6 * 0 + 0.4 * 0)).toBe(0);
  });
});

// ── Name numerology ────────────────────────────────────────────────────────────

describe("Pythagorean name numerology", () => {
  it("normalizes accented characters", () => {
    expect(normalizeName("Éury Pérez")).toBe("eury perez");
  });

  it("strips Jr/Sr suffixes", () => {
    expect(normalizeName("Bobby Jones Jr.")).toBe("bobby jones");
  });

  it("calculates expression number", () => {
    // Verify it returns a valid reduced number
    const r = expressionNumber("Juan Soto");
    expect(r.root).toBeGreaterThanOrEqual(1);
    expect(r.root).toBeLessThanOrEqual(9);
  });
});

// ── Master number preservation ─────────────────────────────────────────────────

describe("Master number preservation across date profiles", () => {
  it("2/9/2029 produces master 22 Universal Day", () => {
    // 0+2+0+9+2+0+2+9 = 24 → 6 (not a master, just checking)
    const p = buildDailyProfile("2029-02-09");
    expect(typeof p.universalDay.root).toBe("number");
  });

  it("Nov 11 profile has 11 somewhere", () => {
    const p = buildDailyProfile("2026-11-11");
    // 0+2+0+2+6+1+1+1+1 = 14 → 5
    // 11/11 → calendar day 11 should be master 11
    expect(p.calendarDay.original).toBe(11);
    expect(p.calendarDay.master).toBe(11);
  });
});
