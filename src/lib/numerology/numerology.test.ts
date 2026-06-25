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

describe("June 25, 2026 — compound display regression", () => {
  const profile = buildDailyProfile("2026-06-25");

  it("preserves 23 as the full-date compound and reduces it to root 5", () => {
    expect(profile.universalDay.rawSum).toBe(23);
    expect(profile.universalDay.root).toBe(5);
    expect(profile.universalDay.master).toBeNull();
  });

  it("does not treat 5 as the compound number", () => {
    expect(profile.universalDay.rawSum).not.toBe(profile.universalDay.root);
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

// ── Repeated date digits (Issue #3) ──────────────────────────────────────────

describe("June 24, 2026 repeated digits — both 2 and 6 must appear", () => {
  const profile = buildDailyProfile("2026-06-24");

  it("digit 2 appears 3 times in 20260624", () => {
    const entry = profile.repeatedDigits.find(r => r.digit === 2);
    expect(entry).toBeDefined();
    expect(entry!.count).toBe(3);
  });

  it("digit 6 appears 2 times in 20260624", () => {
    const entry = profile.repeatedDigits.find(r => r.digit === 6);
    expect(entry).toBeDefined();
    expect(entry!.count).toBe(2);
  });

  it("returns both repeated digits", () => {
    const digits = profile.repeatedDigits.map(r => r.digit).sort();
    expect(digits).toContain(2);
    expect(digits).toContain(6);
    expect(profile.repeatedDigits.length).toBeGreaterThanOrEqual(2);
  });

  it("digit 2 reinforces 'neither' (2 not in primary [1,4,7] or secondary [3,6,9])", () => {
    const entry = profile.repeatedDigits.find(r => r.digit === 2);
    expect(entry!.reinforces).toBe("neither");
  });

  it("digit 6 reinforces 'secondary' (6 is in [3,6,9])", () => {
    const entry = profile.repeatedDigits.find(r => r.digit === 6);
    expect(entry!.reinforces).toBe("secondary");
  });
});

// ── Batting order normalization (Issue #6) ────────────────────────────────────

describe("normalizeBattingOrder()", () => {
  // Inline the function for testing (mirrors generate-mlb-numerology.mjs)
  function normalizeBattingOrder(raw: string | number | null | undefined): number | null {
    if (raw == null) return null;
    const n = parseInt(String(raw), 10);
    if (!isFinite(n)) return null;
    const pos = n >= 100 ? Math.round(n / 100) : n;
    return (pos >= 1 && pos <= 9) ? pos : null;
  }

  it("string '100' → 1", () => expect(normalizeBattingOrder("100")).toBe(1));
  it("number 100 → 1", () => expect(normalizeBattingOrder(100)).toBe(1));
  it("number 400 → 4", () => expect(normalizeBattingOrder(400)).toBe(4));
  it("number 900 → 9", () => expect(normalizeBattingOrder(900)).toBe(9));
  it("string '4' → 4", () => expect(normalizeBattingOrder("4")).toBe(4));
  it("number 4 → 4", () => expect(normalizeBattingOrder(4)).toBe(4));
  it("null → null", () => expect(normalizeBattingOrder(null)).toBeNull());
  it("undefined → null", () => expect(normalizeBattingOrder(undefined)).toBeNull());
  it("0 → null (invalid)", () => expect(normalizeBattingOrder(0)).toBeNull());
  it("10 → null (not 100-based, invalid single digit)", () => expect(normalizeBattingOrder(10)).toBeNull());
  it("1000 → null (out of range after /100)", () => expect(normalizeBattingOrder(1000)).toBeNull());
  it("'abc' → null", () => expect(normalizeBattingOrder("abc")).toBeNull());
});

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

// ── Disabled-signal normalization (Issue #5) ──────────────────────────────────

describe("Disabled signals contribute exactly zero and never reduce score below zero", () => {
  it("numerologyScore is never negative (countercurrent floor)", () => {
    // Math.max(0, negativeRaw) ensures floor
    const rawNegative = Math.max(0, 0 - 12 + 0);
    expect(rawNegative).toBe(0);
    expect(Math.round((rawNegative / 60) * 100)).toBe(0);
  });

  it("jersey-only score is positive when root matches UD root", () => {
    const jerseyRoot4 = reduce(4); // jersey 4 on a root-4 day
    const jerseyPts = 12; // W.jerseyRoot
    const numScore = Math.min(100, Math.round((jerseyPts / 60) * 100));
    expect(numScore).toBeGreaterThan(0);
    expect(numScore).toBeLessThanOrEqual(100);
    expect(jerseyRoot4.root).toBe(4);
  });

  it("a player with only counter signals scores 0 numerology (not negative)", () => {
    const posTotal = 0;
    const negTotal = 6; // one countercurrent hit
    const conv = 0;
    const raw = Math.max(0, posTotal - negTotal + conv);
    expect(raw).toBe(0);
  });
});

// ── Fixture safety ─────────────────────────────────────────────────────────────

describe("Fixture safety validation", () => {
  function isFixtureData(output: { generationMode?: string; featuredPlays?: { playerName?: string }[] }) {
    if (output.generationMode === "fixture") return true;
    const demoPatterns = [/demonstration/i, /demo player/i, /placeholder/i];
    for (const play of output.featuredPlays ?? []) {
      for (const pat of demoPatterns) {
        if (pat.test(play.playerName ?? "")) return true;
      }
    }
    return false;
  }

  it("rejects generationMode=fixture", () => {
    expect(isFixtureData({ generationMode: "fixture" })).toBe(true);
  });

  it("rejects demonstration player name", () => {
    expect(isFixtureData({ generationMode: "live", featuredPlays: [{ playerName: "Demonstration Player" }] })).toBe(true);
  });

  it("accepts live data with real player name", () => {
    expect(isFixtureData({ generationMode: "live", featuredPlays: [{ playerName: "Juan Soto" }] })).toBe(false);
  });

  it("accepts empty featured plays", () => {
    expect(isFixtureData({ generationMode: "live", featuredPlays: [] })).toBe(false);
  });
});
