import { describe, it, expect } from "vitest";
import { compareRowsByNumerologyScore, compareRowsBySinCityScore, type ExplorerRow } from "./ExplorerTable";
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

describe("Shared explorer filters", () => {
  it("filters by player search", () => {
    const rows = [row({ playerName: "Aaron Judge" }), row({ playerName: "Juan Soto" })];
    expect(filterExplorerRows(rows, { query: "judge" }).map((r) => r.playerName)).toEqual(["Aaron Judge"]);
  });

  it("filters by team", () => {
    const rows = [row({ playerName: "Judge", team: "NYY" }), row({ playerName: "Ohtani", team: "LAD" })];
    expect(filterExplorerRows(rows, { team: "LAD" }).map((r) => r.playerName)).toEqual(["Ohtani"]);
  });

  it("filters by match type", () => {
    const rows = [
      row({ playerName: "Exact", matchType: "Exact Match" }),
      row({ playerName: "Root", matchType: "Root Match" }),
    ];
    expect(filterExplorerRows(rows, { matchType: "Root Match" }).map((r) => r.playerName)).toEqual(["Root"]);
  });

  it("does not apply a Sin City has-match list filter", () => {
    const rows = [
      row({ playerName: "Has Match", scoreBreakdown: { sinCity: { matchCount: 2 } } as ExplorerRow["scoreBreakdown"] }),
      row({ playerName: "No Match", scoreBreakdown: { sinCity: { matchCount: 0 } } as ExplorerRow["scoreBreakdown"] }),
    ];
    expect(filterExplorerRows(rows, {}).map((r) => r.playerName)).toEqual(["Has Match", "No Match"]);
  });
});

describe("Independent ranking comparators", () => {
  it("Sin City ranking uses Sin City Score first, then Base Numerology, then Model Rating, then name", () => {
    const rows = [
      row({ playerName: "Zach", numerologyScore: 90, baseballScore: 90, scoreBreakdown: { sinCity: { included: true, score: 10 } } as ExplorerRow["scoreBreakdown"] }),
      row({ playerName: "Amy", numerologyScore: 40, baseballScore: 20, scoreBreakdown: { sinCity: { included: true, score: 80 } } as ExplorerRow["scoreBreakdown"] }),
      row({ playerName: "Bob", numerologyScore: 70, baseballScore: 10, scoreBreakdown: { sinCity: { included: true, score: 80 } } as ExplorerRow["scoreBreakdown"] }),
    ];
    expect([...rows].sort(compareRowsBySinCityScore).map((r) => r.playerName)).toEqual(["Bob", "Amy", "Zach"]);
  });

  it("Numerology ranking ignores Sin City Score", () => {
    const rows = [
      row({ playerName: "Low", numerologyScore: 10, baseballScore: 99, scoreBreakdown: { sinCity: { included: true, score: 100 } } as ExplorerRow["scoreBreakdown"] }),
      row({ playerName: "High", numerologyScore: 80, baseballScore: 10, scoreBreakdown: { sinCity: { included: true, score: 0 } } as ExplorerRow["scoreBreakdown"] }),
    ];
    expect([...rows].sort(compareRowsByNumerologyScore).map((r) => r.playerName)).toEqual(["High", "Low"]);
  });
});
