import { describe, it, expect } from "vitest";
import { calculateNumerologyScoreBreakdown } from "@/lib/numerology/mlbScoreAudit";
import type { DailyProfile } from "@/types/mlbNumerology";
import { compareRowsByNumerologyScore, type ExplorerRow } from "./ExplorerTable";
import { filterExplorerRows } from "./NumerologyExplorer";

function row(overrides: Partial<ExplorerRow> = {}): ExplorerRow {
  return {
    playerName: "Player",
    team: "NYY",
    opponent: "BOS",
    numerologyScore: 20,
    baseballScore: 40,
    matchType: "Exact Match",
    ...overrides,
  };
}

const DAILY: DailyProfile = {
  universalDayRawSum: 19,
  universalDayCompound: 19,
  universalDayMaster: null,
  universalDayRoot: 1,
  universalDayTrace: [],
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
  interpretation: "",
};

describe("Sin City list filter", () => {
  it("defaults to All Players and keeps zero-match rows", () => {
    const rows = [
      row({ playerName: "Has Match", scoreBreakdown: { sinCity: { matchCount: 2 } } as ExplorerRow["scoreBreakdown"] }),
      row({ playerName: "No Match", scoreBreakdown: { sinCity: { matchCount: 0 } } as ExplorerRow["scoreBreakdown"] }),
    ];
    const filtered = filterExplorerRows(rows, { sinCityIncluded: true, sinCityListScope: "all" });
    expect(filtered.map((r) => r.playerName)).toEqual(["Has Match", "No Match"]);
  });

  it("Has Sin City Match removes zero-match players", () => {
    const rows = [
      row({ playerName: "Has Match", scoreBreakdown: { sinCity: { included: true, matchCount: 1, evaluatedCount: 5, fieldPoints: 3, comboBonus: 0, bonus: 3, score: 14, rawCeiling: 21, matches: [] } } }),
      row({ playerName: "No Match", scoreBreakdown: { sinCity: { included: true, matchCount: 0, evaluatedCount: 5, fieldPoints: 0, comboBonus: 0, bonus: 0, score: 0, rawCeiling: 21, matches: [] } } }),
    ];
    const filtered = filterExplorerRows(rows, { sinCityIncluded: true, sinCityListScope: "hasMatch" });
    expect(filtered.map((r) => r.playerName)).toEqual(["Has Match"]);
  });

  it("active Sin City field exclusions change which players pass Has Sin City Match", () => {
    const player = { playerName: "Jersey Only", jerseyNumber: 19, battingOrder: null, numerologyScore: 0 };
    const identity = { birthDate: null, jerseyNumber: 19 };
    const withJersey = calculateNumerologyScoreBreakdown(player, identity, DAILY, "2026-06-30", undefined, {
      sinCity: { included: true, currentHrCount: null },
    });
    const jerseyExcluded = calculateNumerologyScoreBreakdown(player, identity, DAILY, "2026-06-30", undefined, {
      sinCity: { included: true, fields: { jersey: false }, currentHrCount: null },
    });

    const rowsWith = [row({ playerName: "Jersey Only", scoreBreakdown: withJersey })];
    const rowsWithout = [row({ playerName: "Jersey Only", scoreBreakdown: jerseyExcluded })];

    expect(withJersey.sinCity?.matchCount ?? 0).toBeGreaterThanOrEqual(1);
    expect(jerseyExcluded.sinCity?.matchCount ?? 0).toBe(0);
    expect(filterExplorerRows(rowsWith, { sinCityIncluded: true, sinCityListScope: "hasMatch" })).toHaveLength(1);
    expect(filterExplorerRows(rowsWithout, { sinCityIncluded: true, sinCityListScope: "hasMatch" })).toHaveLength(0);
  });

  it("Sin City master Exclude does not leave the list filtered by Sin City", () => {
    const rows = [
      row({ playerName: "Has Match", scoreBreakdown: { sinCity: { included: false, matchCount: 0, evaluatedCount: 0, fieldPoints: 0, comboBonus: 0, bonus: 0, score: 0, rawCeiling: 21, matches: [] } } }),
      row({ playerName: "No Match", scoreBreakdown: { sinCity: { included: false, matchCount: 0, evaluatedCount: 0, fieldPoints: 0, comboBonus: 0, bonus: 0, score: 0, rawCeiling: 21, matches: [] } } }),
    ];
    const filtered = filterExplorerRows(rows, { sinCityIncluded: false, sinCityListScope: "hasMatch" });
    expect(filtered.map((r) => r.playerName)).toEqual(["Has Match", "No Match"]);
  });

  it("keeps Base Numerology Score descending after Has Sin City Match", () => {
    const rows = [
      row({ playerName: "Low", numerologyScore: 10, baseballScore: 90, scoreBreakdown: { sinCity: { included: true, matchCount: 1, evaluatedCount: 1, fieldPoints: 3, comboBonus: 0, bonus: 3, score: 14, rawCeiling: 21, matches: [] } } }),
      row({ playerName: "High", numerologyScore: 80, baseballScore: 10, scoreBreakdown: { sinCity: { included: true, matchCount: 2, evaluatedCount: 2, fieldPoints: 6, comboBonus: 0, bonus: 6, score: 29, rawCeiling: 21, matches: [] } } }),
      row({ playerName: "Zero", numerologyScore: 99, baseballScore: 99, scoreBreakdown: { sinCity: { included: true, matchCount: 0, evaluatedCount: 1, fieldPoints: 0, comboBonus: 0, bonus: 0, score: 0, rawCeiling: 21, matches: [] } } }),
    ];
    const filtered = filterExplorerRows(rows, { sinCityIncluded: true, sinCityListScope: "hasMatch" })
      .sort(compareRowsByNumerologyScore);
    expect(filtered.map((r) => r.playerName)).toEqual(["High", "Low"]);
    expect(filtered[0].numerologyScore).toBeGreaterThan(filtered[1].numerologyScore);
  });
});
