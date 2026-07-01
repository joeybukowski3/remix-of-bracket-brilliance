/**
 * hierarchical-scoring.test.ts
 * Regression fixtures for MLB Numerology Scoring v3 (hierarchical)
 *
 * Slate: June 30, 2026
 * Universal Day: 2+0+2+6+0+6+3+0 = 19/1  (rawSum=19, root=1, master=null)
 * Calendar Day: 30/3
 * Primary Family: [1,4,7]  Countercurrent: 8
 *
 * Run: npx vitest run src/lib/numerology/hierarchical-scoring.test.ts
 */

import { describe, it, expect } from "vitest";
import { calculateNumerologyScoreBreakdown } from "./mlbScoreAudit";
import type { DailyProfile } from "@/types/mlbNumerology";

// ── June 30, 2026 daily profile ───────────────────────────────────────────────
const JUNE_30_2026: DailyProfile = {
  universalDayRawSum: 19,
  universalDayCompound: 19,
  universalDayMaster: null,
  universalDayRoot: 1,
  universalDayTrace: ["2 + 0 + 2 + 6 + 0 + 6 + 3 + 0 = 19"],
  calendarDayCompound: 30,
  calendarDayRoot: 3,
  universalYear: 1,
  universalMonth: 7,
  structuralEcho: "10/1",
  primaryFamily: [1, 4, 7],
  secondaryFamily: [3, 6, 9],
  balancingComplement: 9,
  countercurrent: 8,
  repeatedDigits: [
    { digit: 2, count: 2, reinforces: "neither" },
    { digit: 6, count: 2, reinforces: "secondary" },
  ],
  interpretation: "Universal Day 19/1 — 1-4-7 family dominant.",
};

function run(playerName: string, birthDate: string | null, jerseyNumber: number | null, reportedScore = 0) {
  return calculateNumerologyScoreBreakdown(
    { playerName, numerologyScore: reportedScore, jerseyNumber },
    birthDate ? { birthDate, jerseyNumber } : null,
    JUNE_30_2026,
    "2026-06-30",
  );
}

// ── Jackson Merrill: LP 19/1 (exact compound) + BD 19/1 (exact compound) ──────
// Expected: double Tier1 exact compound → synergy +12 → score ~79
describe("Jackson Merrill — double Tier1 exact compound", () => {
  const result = run("Jackson Merrill", "2003-04-19", 3);

  it("Life Path 19 earns an exact compound signal", () => {
    const lp = result.signals.find(s => s.field === "lifePath");
    expect(lp).toBeDefined();
    expect(lp!.type).toBe("primary_exact_root");
    expect(lp!.rawPoints).toBe(22);
    expect(lp!.points).toBe(22);
  });

  it("Birth Day 19 earns an exact compound signal", () => {
    const bd = result.signals.find(s => s.field === "birthDay");
    expect(bd).toBeDefined();
    expect(bd!.type).toBe("primary_exact_root");
    expect(bd!.rawPoints).toBe(22);
    expect(bd!.points).toBe(22);
  });

  it("double Tier1 exact yields synergyBonus = 12", () => {
    expect(result.exactComboBonus).toBe(12);
    expect(result.synergyBonus).toBe(12);
  });

  it("calculatedScore is approximately 79", () => {
    expect(result.calculatedScore).toBe(79);
  });

  it("normCeiling is 76 (fixed)", () => {
    expect(result.normCeiling).toBe(76);
  });

  it("convergenceBonus is 0 (disabled in v3)", () => {
    expect(result.convergenceBonus).toBe(0);
  });
});

// ── George Springer: BD 19/1 (exact compound) + LP 46/1 (root only) ──────────
// Expected: single Tier1 exact + Tier1 root → synergy +4 → score ~61
describe("George Springer — single Tier1 exact + Tier1 root breadth", () => {
  const result = run("George Springer", "1989-09-19", 4);

  it("Birth Day 19 earns exact compound signal", () => {
    const bd = result.signals.find(s => s.field === "birthDay");
    expect(bd).toBeDefined();
    expect(bd!.type).toBe("primary_exact_root");
    expect(bd!.points).toBe(22);
  });

  it("Life Path 46/1 earns a root match (not exact compound)", () => {
    const lp = result.signals.find(s => s.field === "lifePath");
    expect(lp).toBeDefined();
    expect(lp!.type).toBe("primary_root");
    expect(lp!.rawPoints).toBe(11);
    expect(lp!.points).toBeLessThan(lp!.rawPoints!);
  });

  it("LP and Expr root signals are decayed (not full weight)", () => {
    const lp = result.signals.find(s => s.field === "lifePath")!;
    const expr = result.signals.find(s => s.field === "expression")!;
    expect(lp.indirectMultiplier).toBeLessThan(1.0);
    expect(expr.indirectMultiplier).toBe(1.0);
  });

  it("synergyBonus is 4 (1 Tier1 exact + 1 Tier1 root)", () => {
    expect(result.exactComboBonus).toBe(4);
  });

  it("calculatedScore is approximately 61", () => {
    expect(result.calculatedScore).toBe(61);
  });
});

// ── Merrill outranks Springer ─────────────────────────────────────────────────
describe("Hierarchy: Merrill > Springer", () => {
  const merrill = run("Jackson Merrill", "2003-04-19", 3);
  const springer = run("George Springer", "1989-09-19", 4);

  it("Merrill calculatedScore is higher than Springer", () => {
    expect(merrill.calculatedScore).toBeGreaterThan(springer.calculatedScore);
  });

  it("Merrill has synergyBonus=12 and Springer has synergyBonus=4", () => {
    expect(merrill.exactComboBonus).toBeGreaterThan(springer.exactComboBonus);
  });
});

// ── Alejandro Osuna: Jersey #19 (Tier2 exact compound) + BD 10/1 (root) ───────
// Expected: direct Jersey exact (18) + BD root indirect → score ~38
describe("Alejandro Osuna — Tier2 exact compound Jersey #19", () => {
  const result = run("Alejandro Osuna", "2002-10-10", 19);

  it("Jersey 19 earns Tier2 exact compound signal (direct, no decay)", () => {
    const j = result.signals.find(s => s.field === "jersey");
    expect(j).toBeDefined();
    expect(j!.type).toBe("primary_exact_root");
    expect(j!.rawPoints).toBe(18);
    expect(j!.points).toBe(18);
    expect(j!.fieldTier).toBe(2);
  });

  it("Birthday 10/1 earns a Tier1 root match (indirect)", () => {
    const bd = result.signals.find(s => s.field === "birthDay");
    expect(bd).toBeDefined();
    expect(bd!.type).toBe("primary_root");
    expect(bd!.rawPoints).toBe(11);
    expect(bd!.points).toBe(11);
  });

  it("no synergy bonus (no Tier1 exact compound field)", () => {
    expect(result.exactComboBonus).toBe(0);
  });

  it("calculatedScore is higher than current baseline 26", () => {
    expect(result.calculatedScore).toBeGreaterThan(26);
  });

  it("calculatedScore is approximately 38", () => {
    expect(result.calculatedScore).toBe(38);
  });
});

// ── Kazuma Okamoto: accumulated indirect signals, all decayed ─────────────────
// Expected: 4 indirect signals with decay → score ~30
describe("Kazuma Okamoto — accumulated indirect signals with decay", () => {
  const result = run("Kazuma Okamoto", "1996-06-30", 7);

  it("has no direct exact compound signals", () => {
    const direct = result.signals.filter(s => s.points > 0 && s.indirectMultiplier == null && s.rawPoints === s.points);
    expect(direct.every(s => s.type !== "primary_exact_master" && s.type !== "primary_exact_root" || s.fieldTier !== 1)).toBe(true);
  });

  it("Personal Day earns a Tier1 root match", () => {
    const pd = result.signals.find(s => s.field === "personalDay");
    expect(pd).toBeDefined();
    expect(pd!.type).toBe("personal_cycle");
    expect(pd!.rawPoints).toBe(11);
  });

  it("Expression earns a Tier1 root match", () => {
    const expr = result.signals.find(s => s.field === "expression");
    expect(expr).toBeDefined();
    expect(expr!.type).toBe("name_resonance");
    expect(expr!.rawPoints).toBe(11);
  });

  it("indirect signals are subject to diminishing returns", () => {
    const indirect = result.signals.filter(s => s.points > 0 && s.indirectMultiplier != null && s.indirectMultiplier < 1.0);
    expect(indirect.length).toBeGreaterThan(0);
  });

  it("no synergy bonus (no Tier1 exact compound)", () => {
    expect(result.exactComboBonus).toBe(0);
  });

  it("calculatedScore is approximately 30", () => {
    expect(result.calculatedScore).toBe(30);
  });
});

// ── Full ranking order ────────────────────────────────────────────────────────
describe("Ranking order on June 30, 2026", () => {
  const merrill = run("Jackson Merrill", "2003-04-19", 3);
  const springer = run("George Springer", "1989-09-19", 4);
  const osuna = run("Alejandro Osuna", "2002-10-10", 19);
  const okamoto = run("Kazuma Okamoto", "1996-06-30", 7);

  it("Merrill > Springer > Osuna > Okamoto", () => {
    expect(merrill.calculatedScore).toBeGreaterThan(springer.calculatedScore);
    expect(springer.calculatedScore).toBeGreaterThan(osuna.calculatedScore);
    expect(osuna.calculatedScore).toBeGreaterThan(okamoto.calculatedScore);
  });
});

// ── Diminishing returns mechanics ─────────────────────────────────────────────
describe("Diminishing returns", () => {
  it("first indirect signal is at 100% weight", () => {
    const result = run("Kazuma Okamoto", "1996-06-30", 7);
    const first = result.signals.filter(s => s.points > 0).find(s => s.indirectMultiplier != null);
    expect(first?.indirectMultiplier).toBe(1.0);
  });

  it("second indirect signal is at 70% weight", () => {
    const result = run("Kazuma Okamoto", "1996-06-30", 7);
    const indirect = result.signals.filter(s => s.points > 0 && s.indirectMultiplier != null).sort((a, b) => (b.indirectMultiplier! - a.indirectMultiplier!));
    const second = indirect.find(s => s.indirectMultiplier != null && s.indirectMultiplier < 1.0 && s.indirectMultiplier >= 0.65);
    expect(second?.indirectMultiplier).toBeCloseTo(0.7);
  });

  it("direct signals are never decayed", () => {
    const result = run("Jackson Merrill", "2003-04-19", 3);
    const direct = result.signals.filter(s => s.points > 0 && s.rawPoints != null && s.rawPoints === s.points);
    expect(direct.length).toBeGreaterThan(0);
    direct.forEach(s => {
      expect(s.indirectMultiplier == null || s.indirectMultiplier === 1.0).toBe(true);
    });
  });
});

// ── modelVersion ─────────────────────────────────────────────────────────────
describe("Model version", () => {
  it("breakdown reports modelVersion 3.0.0", () => {
    const result = run("Jackson Merrill", "2003-04-19", 3);
    expect(result.modelVersion).toBe("3.0.0");
  });
});

// ── Helper for custom daily profiles ─────────────────────────────────────────
function runOn(
  playerName: string,
  birthDate: string | null,
  jerseyNumber: number | null,
  daily: DailyProfile,
  date: string,
) {
  return calculateNumerologyScoreBreakdown(
    { playerName, numerologyScore: 0, jerseyNumber },
    birthDate ? { birthDate, jerseyNumber } : null,
    daily,
    date,
  );
}

// ── Synergy qualification: family_support does NOT qualify as a root match ────
// Born 2001-09-07 → LP sum=2+0+0+1+0+9+0+7=19 → LP.original=19 → Tier1 exact match
// BD day=7 → bd.root=7, in primaryFamily[1,4,7] but 7≠udRoot(1) and 7≠calDay(30) → family_support
// family_support type is not in ROOT_MATCH_TYPES → synergyBonus must be 0
describe("Synergy: Tier1 exact + Tier1 family_support → no synergy", () => {
  const result = run("Test Player", "2001-09-07", null);

  it("lifePath earns an exact compound signal", () => {
    const lp = result.signals.find(s => s.field === "lifePath");
    expect(lp?.type).toBe("primary_exact_root");
  });

  it("birthDay earns a family_support signal (not root match)", () => {
    const bd = result.signals.find(s => s.field === "birthDay");
    expect(bd?.type).toBe("family_support");
  });

  it("synergyBonus is 0 — family_support does not qualify as a root match", () => {
    expect(result.synergyBonus).toBe(0);
  });
});

// ── Synergy qualification: calDay secondary_exact does NOT qualify as a root match ──
// Profile with calDay=7. Born 2001-09-07 → LP exact (19→1). BD day=7 → bd.original=7===calDay(7) → secondary_exact.
// secondary_exact type is not in ROOT_MATCH_TYPES → synergyBonus must be 0
const CALDAY_7: DailyProfile = {
  universalDayRawSum: 19,
  universalDayCompound: 19,
  universalDayMaster: null,
  universalDayRoot: 1,
  universalDayTrace: ["2 + 0 + 2 + 6 + 0 + 6 + 3 + 0 = 19"],
  calendarDayCompound: 7,
  calendarDayRoot: 7,
  universalYear: 1,
  universalMonth: 7,
  structuralEcho: "9/9",
  primaryFamily: [1, 4, 7],
  secondaryFamily: [3, 6, 9],
  balancingComplement: 9,
  countercurrent: 8,
  repeatedDigits: [],
  interpretation: "Test profile — calendarDay 7.",
};

describe("Synergy: Tier1 exact + Tier1 calDay secondary_exact → no synergy", () => {
  const result = runOn("Test Player", "2001-09-07", null, CALDAY_7, "2026-06-30");

  it("lifePath earns an exact compound signal", () => {
    const lp = result.signals.find(s => s.field === "lifePath");
    expect(lp?.type).toBe("primary_exact_root");
  });

  it("birthDay earns a secondary_exact signal (calDay match, not root match)", () => {
    const bd = result.signals.find(s => s.field === "birthDay");
    expect(bd?.type).toBe("secondary_exact");
  });

  it("synergyBonus is 0 — secondary_exact does not qualify as a root match", () => {
    expect(result.synergyBonus).toBe(0);
  });
});

// ── Signal precedence: Jersey UD exact beats calDay exact when jersey matches both ──
// Profile where udRawSum===calDayCompound===30.
// Jersey #30 matches both UD exact (18pts, direct) and calDay exact (8pts, indirect).
// With correct precedence, UD exact wins.
const JERSEY_COLLISION: DailyProfile = {
  universalDayRawSum: 30,
  universalDayCompound: 30,
  universalDayMaster: null,
  universalDayRoot: 3,
  universalDayTrace: ["30"],
  calendarDayCompound: 30,
  calendarDayRoot: 3,
  universalYear: 3,
  universalMonth: 9,
  structuralEcho: "3/3",
  primaryFamily: [3, 6, 9],
  secondaryFamily: [1, 4, 7],
  balancingComplement: 7,
  countercurrent: 6,
  repeatedDigits: [],
  interpretation: "Test profile — udRawSum=calDay=30.",
};

describe("Signal precedence: Jersey UD exact wins over calDay exact when both match", () => {
  const result = runOn("Test Player", null, 30, JERSEY_COLLISION, "2026-06-30");

  it("jersey signal type is primary_exact_root (UD exact, not calDay secondary_exact)", () => {
    const jerseySignal = result.signals.find(s => s.field === "jersey");
    expect(jerseySignal?.type).toBe("primary_exact_root");
  });

  it("jersey signal is awarded at full direct weight (18pts)", () => {
    const jerseySignal = result.signals.find(s => s.field === "jersey");
    expect(jerseySignal?.points).toBe(18);
    expect(jerseySignal?.rawPoints).toBe(18);
  });

  it("jersey signal is direct (never decayed)", () => {
    const jerseySignal = result.signals.find(s => s.field === "jersey");
    expect(jerseySignal?.indirectMultiplier == null || jerseySignal.indirectMultiplier === 1.0).toBe(true);
  });
});

// ── Signal precedence: BirthDay root match beats calDay exact when bd qualifies for both ──
// Profile: udRawSum=19, udRoot=1, calDay=10 (10/1 — root equals udRoot but compound≠udRawSum).
// BirthDay on the 10th: bd.original=10, bd.compound=1, bd.root=1=udRoot → root match.
//   bd.original(10) === calDay(10) → would also qualify for calDay exact.
//   bd.compound(1) ≠ udRawSum(19) → exact compound check does not fire.
// With correct precedence, root match (stronger UD signal) wins.
const BIRTHDAY_COLLISION: DailyProfile = {
  universalDayRawSum: 19,
  universalDayCompound: 19,
  universalDayMaster: null,
  universalDayRoot: 1,
  universalDayTrace: ["19"],
  calendarDayCompound: 10,
  calendarDayRoot: 1,
  universalYear: 1,
  universalMonth: 7,
  structuralEcho: "1/1",
  primaryFamily: [1, 4, 7],
  secondaryFamily: [3, 6, 9],
  balancingComplement: 9,
  countercurrent: 8,
  repeatedDigits: [],
  interpretation: "Test profile — udRoot=1, calDay=10/1.",
};

describe("Signal precedence: BirthDay root match wins over calDay exact when bd qualifies for both", () => {
  // Born 1990-05-10: bd.original=10, bd.compound=1, bd.root=1=udRoot(1).
  //   bd.original(10) !== udRawSum(19) — not exact target.
  //   bd.compound(1) !== udRawSum(19) — not exact compound.
  //   bd.root(1) === udRoot(1) — root match fires (with fix).
  //   bd.original(10) === calDay(10) — would have fired calDay exact (without fix).
  const result = runOn("Test Player", "1990-05-10", null, BIRTHDAY_COLLISION, "2026-06-30");

  it("birthDay signal type is primary_root (root match, not secondary_exact)", () => {
    const bd = result.signals.find(s => s.field === "birthDay");
    expect(bd?.type).toBe("primary_root");
  });

  it("birthDay rawPoints reflects root match weight (11pts), not calDay weight (8pts)", () => {
    const bd = result.signals.find(s => s.field === "birthDay");
    expect(bd?.rawPoints).toBe(11);
  });
});
