import { describe, it, expect } from "vitest";
import type { DailyProfile } from "@/types/mlbNumerology";
import {
  DEFAULT_SIN_CITY_FIELDS,
  defaultSinCityFields,
  evaluateSinCityMasonic,
  reduceSinCityNumber,
  SIN_CITY_FIELD_KEYS,
} from "./sinCityMasonic";

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
  repeatedDigits: [],
  interpretation: "Test profile",
};

describe("Sin City defaults", () => {
  it("all five Sin City fields default to Include", () => {
    expect(SIN_CITY_FIELD_KEYS).toEqual([
      "jersey",
      "battingOrder",
      "birthDay",
      "lifePath",
      "currentHrCount",
    ]);
    expect(DEFAULT_SIN_CITY_FIELDS).toEqual({
      jersey: true,
      battingOrder: true,
      birthDay: true,
      lifePath: true,
      currentHrCount: true,
    });
    expect(Object.values(defaultSinCityFields()).every(Boolean)).toBe(true);
  });

  it("master Exclude returns zero contribution and no matches", () => {
    const result = evaluateSinCityMasonic({
      included: false,
      jerseyNumber: 19,
      battingOrder: 1,
      birthDay: reduceSinCityNumber(19),
      lifePath: reduceSinCityNumber(19),
      currentHrCount: 19,
      daily: DAILY,
    });
    expect(result.included).toBe(false);
    expect(result.bonus).toBe(0);
    expect(result.score).toBe(0);
    expect(result.matchCount).toBe(0);
    expect(result.matches).toHaveLength(0);
  });
});

describe("individual Sin City exclusion", () => {
  it("excluding one field drops only that field's points and match", () => {
    const allIn = evaluateSinCityMasonic({
      included: true,
      jerseyNumber: 19,
      battingOrder: 1,
      birthDay: reduceSinCityNumber(19),
      lifePath: reduceSinCityNumber(28),
      currentHrCount: 4,
      daily: DAILY,
    });
    const jerseyOut = evaluateSinCityMasonic({
      included: true,
      fields: { jersey: false },
      jerseyNumber: 19,
      battingOrder: 1,
      birthDay: reduceSinCityNumber(19),
      lifePath: reduceSinCityNumber(28),
      currentHrCount: 4,
      daily: DAILY,
    });

    expect(allIn.matches.some((m) => m.field === "jersey")).toBe(true);
    expect(jerseyOut.matches.some((m) => m.field === "jersey")).toBe(false);
    expect(jerseyOut.bonus).toBeLessThan(allIn.bonus);
    expect(jerseyOut.matchCount).toBe(allIn.matchCount - 1);
  });
});

describe("missing Sin City data", () => {
  it("missing values contribute nothing and never fabricate a match", () => {
    const result = evaluateSinCityMasonic({
      included: true,
      jerseyNumber: null,
      battingOrder: null,
      birthDay: null,
      lifePath: null,
      currentHrCount: null,
      daily: DAILY,
    });
    expect(result.matches).toHaveLength(5);
    expect(result.matches.every((m) => m.matchKind === "missing")).toBe(true);
    expect(result.matches.every((m) => m.points === 0)).toBe(true);
    expect(result.matchCount).toBe(0);
    expect(result.evaluatedCount).toBe(0);
    expect(result.bonus).toBe(0);
  });

  it("Current HR Count of 0 is evaluated but does not invent an alignment", () => {
    const result = evaluateSinCityMasonic({
      included: true,
      jerseyNumber: null,
      battingOrder: null,
      birthDay: null,
      lifePath: null,
      currentHrCount: 0,
      daily: DAILY,
    });
    const hr = result.matches.find((m) => m.field === "currentHrCount");
    expect(hr?.matchKind).toBe("none");
    expect(hr?.points).toBe(0);
  });
});

describe("standalone Sin City Score", () => {
  it("normalizes raw bonus against the Sin City ceiling, not 76", () => {
    const result = evaluateSinCityMasonic({
      included: true,
      jerseyNumber: 19,
      battingOrder: 1,
      birthDay: reduceSinCityNumber(19),
      lifePath: reduceSinCityNumber(19),
      currentHrCount: 19,
      daily: DAILY,
    });
    expect(result.bonus).toBe(20);
    expect(result.rawCeiling).toBe(21);
    expect(result.score).toBe(95);
  });
});

describe("Signal Type exclusions", () => {
  it("excluding Exact zeros Exact awards and drops them from combo hits", () => {
    const included = evaluateSinCityMasonic({
      included: true,
      jerseyNumber: 19,
      battingOrder: 1,
      birthDay: reduceSinCityNumber(19),
      lifePath: reduceSinCityNumber(19),
      currentHrCount: 19,
      daily: DAILY,
    });
    const excluded = evaluateSinCityMasonic({
      included: true,
      includedSignalTypes: { exact: false },
      jerseyNumber: 19,
      battingOrder: 1,
      birthDay: reduceSinCityNumber(19),
      lifePath: reduceSinCityNumber(19),
      currentHrCount: 19,
      daily: DAILY,
    });
    expect(included.matches.filter((m) => m.matchKind === "exact").every((m) => m.points > 0)).toBe(true);
    expect(excluded.matches.filter((m) => m.matchKind === "exact").every((m) => m.points === 0)).toBe(true);
    expect(excluded.matches.find((m) => m.field === "battingOrder")?.points).toBe(2);
    expect(excluded.bonus).toBeLessThan(included.bonus);
    expect(excluded.score).toBeLessThan(included.score);
  });

  it("excluding Root and Family zeros those Sin City awards only", () => {
    const result = evaluateSinCityMasonic({
      included: true,
      includedSignalTypes: { root: false, family: false },
      jerseyNumber: 19,
      battingOrder: 1,
      birthDay: reduceSinCityNumber(4),
      lifePath: reduceSinCityNumber(19),
      currentHrCount: 7,
      daily: DAILY,
    });
    expect(result.matches.find((m) => m.field === "jersey")?.points).toBe(3);
    expect(result.matches.find((m) => m.field === "battingOrder")?.points).toBe(0);
    expect(result.matches.find((m) => m.field === "birthDay")?.points).toBe(0);
    expect(result.matches.find((m) => m.field === "currentHrCount")?.points).toBe(0);
  });
});

describe("Current HR Count uses season total reduction", () => {
  it("season HR 19 is an exact Universal Day symbol match", () => {
    const result = evaluateSinCityMasonic({
      included: true,
      currentHrCount: 19,
      daily: DAILY,
    });
    const hr = result.matches.find((m) => m.field === "currentHrCount");
    expect(hr?.matchKind).toBe("exact");
    expect(hr?.points).toBeGreaterThan(0);
  });
});
