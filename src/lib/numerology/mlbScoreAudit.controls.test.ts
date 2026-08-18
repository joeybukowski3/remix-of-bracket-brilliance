import { describe, it, expect } from "vitest";
import type { DailyProfile } from "@/types/mlbNumerology";
import {
  calculateNumerologyScoreBreakdown,
  DEFAULT_INCLUDED_FIELDS,
  DEFAULT_INCLUDED_SIGNAL_TYPES,
  NUMEROLOGY_SCORING_FIELDS,
} from "./mlbScoreAudit";

const DAILY: DailyProfile = {
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
  repeatedDigits: [{ digit: 1, count: 2, reinforces: "primary" }],
  interpretation: "Test profile",
};

const SLATE = "2026-06-30";

function score(
  birthDate: string,
  extras: {
    jerseyNumber?: number | null;
    battingOrder?: number | null;
    currentHrCount?: number | null;
    includedFields?: Partial<typeof DEFAULT_INCLUDED_FIELDS>;
    includedSignalTypes?: Partial<typeof DEFAULT_INCLUDED_SIGNAL_TYPES>;
    sinCityIncluded?: boolean;
    sinCityFields?: Partial<typeof DEFAULT_INCLUDED_FIELDS> & { currentHrCount?: boolean; jersey?: boolean; battingOrder?: boolean; birthDay?: boolean; lifePath?: boolean };
  } = {},
) {
  return calculateNumerologyScoreBreakdown(
    {
      playerName: "Control Player",
      numerologyScore: 0,
      jerseyNumber: extras.jerseyNumber ?? 19,
      battingOrder: extras.battingOrder ?? 1,
    },
    { birthDate, jerseyNumber: extras.jerseyNumber ?? 19 },
    DAILY,
    SLATE,
    undefined,
    {
      includedFields: extras.includedFields,
      includedSignalTypes: extras.includedSignalTypes,
      sinCity: {
        included: extras.sinCityIncluded ?? false,
        fields: extras.sinCityFields,
        currentHrCount: extras.currentHrCount,
      },
    },
  );
}

describe("Age has zero influence on Numerology Score", () => {
  it("changing Age alone does not change Numerology Score or emit age signals", () => {
    // Same month/day keeps birthday + personal day identical.
    // Digit sums are equal so Life Path compound/root stay aligned.
    // Ages on 2026-06-30: 19 vs 28 — old model would score these differently
    // (19 exact vs 28 root-1) against Universal Day 19/1.
    const age19 = score("2007-04-19", { jerseyNumber: 3, battingOrder: null });
    const age28 = score("1998-04-19", { jerseyNumber: 3, battingOrder: null });

    expect(age19.profile.age).not.toBe(age28.profile.age);
    expect(age19.signals.some((s) => s.field === "age")).toBe(false);
    expect(age28.signals.some((s) => s.field === "age")).toBe(false);
    expect(age19.calculatedScore).toBe(age28.calculatedScore);
    expect(age19.rawNumerology).toBe(age28.rawNumerology);
    expect(age19.positiveTotal).toBe(age28.positiveTotal);
  });
});

describe("normal scoring fields default to Include", () => {
  it("exports every legitimate scoring field as Include and never includes Age", () => {
    expect(NUMEROLOGY_SCORING_FIELDS).toEqual([
      "personalDay",
      "jersey",
      "battingOrder",
      "lifePath",
      "birthDay",
      "expression",
      "repeatedDigit",
    ]);
    expect(NUMEROLOGY_SCORING_FIELDS).not.toContain("age");
    expect(Object.values(DEFAULT_INCLUDED_FIELDS).every(Boolean)).toBe(true);
    expect(Object.values(DEFAULT_INCLUDED_SIGNAL_TYPES).every(Boolean)).toBe(true);
  });
});

describe("excluding and re-including a field", () => {
  it("excluding jersey removes all jersey contribution and re-including restores it", () => {
    const included = score("2003-04-19", { jerseyNumber: 19 });
    const excluded = score("2003-04-19", {
      jerseyNumber: 19,
      includedFields: { jersey: false },
    });
    const restored = score("2003-04-19", {
      jerseyNumber: 19,
      includedFields: { jersey: true },
    });

    expect(included.signals.some((s) => s.field === "jersey")).toBe(true);
    expect(excluded.signals.some((s) => s.field === "jersey")).toBe(false);
    expect(excluded.calculatedScore).toBeLessThan(included.calculatedScore);
    expect(restored.calculatedScore).toBe(included.calculatedScore);
    expect(restored.signals.filter((s) => s.field === "jersey")).toEqual(
      included.signals.filter((s) => s.field === "jersey"),
    );
  });

  it("excluding Personal Day drops every Personal Day signal type", () => {
    const included = score("2003-04-19");
    const excluded = score("2003-04-19", { includedFields: { personalDay: false } });
    expect(included.signals.some((s) => s.field === "personalDay") || included.profile.personalDay != null).toBe(true);
    expect(excluded.signals.some((s) => s.field === "personalDay")).toBe(false);
  });
});

describe("Sin City master and field states in scoring", () => {
  it("Sin City master Exclude contributes nothing even when symbols match", () => {
    const off = score("2003-04-19", {
      jerseyNumber: 19,
      currentHrCount: 19,
      sinCityIncluded: false,
    });
    expect(off.sinCity?.included).toBe(false);
    expect(off.sinCity?.bonus ?? 0).toBe(0);
    expect(off.signals.some((s) => s.field === "sinCity")).toBe(false);
  });

  it("Sin City Include adds a separate contribution without replacing regular field points", () => {
    const off = score("2003-04-19", { jerseyNumber: 19, currentHrCount: 19, sinCityIncluded: false });
    const on = score("2003-04-19", { jerseyNumber: 19, currentHrCount: 19, sinCityIncluded: true });

    expect(on.sinCity?.included).toBe(true);
    expect(on.sinCity?.bonus ?? 0).toBeGreaterThan(0);
    expect(on.signals.some((s) => s.field === "jersey")).toBe(true);
    expect(on.signals.some((s) => s.field === "sinCity")).toBe(true);
    expect(on.sinCity?.bonus ?? 0).toBeGreaterThan(0);
    expect(on.rawNumerology).toBeGreaterThan(off.rawNumerology);
  });

  it("excluding a Sin City field does not remove the regular numerology field", () => {
    const result = score("2003-04-19", {
      jerseyNumber: 19,
      currentHrCount: 19,
      sinCityIncluded: true,
      sinCityFields: { jersey: false },
    });
    expect(result.signals.some((s) => s.field === "jersey")).toBe(true);
    expect(result.sinCity?.matches.some((m) => m.field === "jersey")).toBe(false);
  });
});
