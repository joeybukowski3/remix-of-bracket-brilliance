/**
 * ExplorerTable.sorting.test.tsx
 * Numerology Score is the locked primary ranking.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  ExplorerTable,
  compareRowsByNumerologyScore,
  compareRowsBySort,
  type ExplorerRow,
} from "./ExplorerTable";
import { calculateNumerologyScoreBreakdown } from "@/lib/numerology/mlbScoreAudit";
import type { DailyProfile } from "@/types/mlbNumerology";

function makeRow(overrides: Partial<ExplorerRow> = {}): ExplorerRow {
  return {
    playerId: 1,
    playerName: "Player A",
    team: "NYY",
    opponent: "BOS",
    lineupStatus: "unknown",
    battingOrder: null,
    jerseyNumber: 10,
    numerologyScore: 50,
    baseballScore: 50,
    matchType: "Exact Match",
    ...overrides,
  };
}

describe("Locked Numerology Score ranking", () => {
  it("always ranks highest Numerology Score first", () => {
    const rows = [makeRow({ playerName: "Low", numerologyScore: 20 }), makeRow({ playerName: "High", numerologyScore: 80 })];
    const sorted = [...rows].sort(compareRowsByNumerologyScore);
    expect(sorted[0].playerName).toBe("High");
  });

  it("ties break by Model Rating descending, then player name", () => {
    const rows = [
      makeRow({ playerName: "Zach", numerologyScore: 50, baseballScore: 60 }),
      makeRow({ playerName: "Amy", numerologyScore: 50, baseballScore: 80 }),
      makeRow({ playerName: "Bob", numerologyScore: 50, baseballScore: 80 }),
    ];
    const sorted = [...rows].sort(compareRowsByNumerologyScore);
    expect(sorted.map((r) => r.playerName)).toEqual(["Amy", "Bob", "Zach"]);
  });

  it("does not let Model Rating become the primary ranking when no explicit sort is passed", () => {
    const rows = [
      makeRow({ playerName: "HighNum", numerologyScore: 90, baseballScore: 10 }),
      makeRow({ playerName: "HighModel", numerologyScore: 20, baseballScore: 99 }),
    ];
    render(<ExplorerTable rows={rows} />);
    const names = screen.getAllByText(/HighNum|HighModel/).map((el) => el.textContent);
    expect(names[0]).toContain("HighNum");
  });
});

describe("Descending Numerology Score after recalculation", () => {
  const daily: DailyProfile = {
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

  it("re-ranks by calculated Numerology Score after a field is excluded", () => {
    const players = [
      { playerName: "Jersey Star", team: "NYY", opponent: "BOS", jerseyNumber: 19, baseballScore: 10, matchType: "Exact Match" as const },
      { playerName: "Birthday Star", team: "BOS", opponent: "NYY", jerseyNumber: 3, baseballScore: 90, matchType: "Root Match" as const },
    ];

    const withJersey = players.map((p) => {
      const breakdown = calculateNumerologyScoreBreakdown(
        { playerName: p.playerName, jerseyNumber: p.jerseyNumber, numerologyScore: 0 },
        { birthDate: p.playerName === "Birthday Star" ? "2003-04-19" : "1995-08-03", jerseyNumber: p.jerseyNumber },
        daily,
        "2026-06-30",
      );
      return { ...makeRow(p), numerologyScore: breakdown.calculatedScore, scoreBreakdown: breakdown };
    });

    const jerseyExcluded = players.map((p) => {
      const breakdown = calculateNumerologyScoreBreakdown(
        { playerName: p.playerName, jerseyNumber: p.jerseyNumber, numerologyScore: 0 },
        { birthDate: p.playerName === "Birthday Star" ? "2003-04-19" : "1995-08-03", jerseyNumber: p.jerseyNumber },
        daily,
        "2026-06-30",
        undefined,
        { includedFields: { jersey: false } },
      );
      return { ...makeRow(p), numerologyScore: breakdown.calculatedScore, scoreBreakdown: breakdown };
    });

    const before = [...withJersey].sort(compareRowsByNumerologyScore);
    const after = [...jerseyExcluded].sort(compareRowsByNumerologyScore);

    expect(before[0].numerologyScore).toBeGreaterThanOrEqual(before[1].numerologyScore);
    expect(after[0].numerologyScore).toBeGreaterThanOrEqual(after[1].numerologyScore);
    expect(after.map((r) => r.playerName)).not.toEqual([]);
    expect(after.find((r) => r.playerName === "Birthday Star")?.numerologyScore).toBeGreaterThan(
      after.find((r) => r.playerName === "Jersey Star")?.numerologyScore ?? 0,
    );
  });
});

describe("Sorting preserves row set", () => {
  it("sorting does not change which rows are present", () => {
    const rows = [makeRow({ playerName: "A", team: "NYY", numerologyScore: 10 }), makeRow({ playerName: "B", team: "BOS", numerologyScore: 90 })];
    render(<ExplorerTable rows={rows} />);
    expect(screen.getAllByText("A").length).toBeGreaterThan(0);
    expect(screen.getAllByText("B").length).toBeGreaterThan(0);
  });
});

describe("Expanded rows remain functional", () => {
  it("expanding a row works after ranking", () => {
    const rows = [makeRow({ playerName: "Sortable Player" })];
    render(<ExplorerTable rows={rows} />);
    const row = document.querySelector("tbody tr");
    expect(row).toBeTruthy();
    fireEvent.click(row!);
    expect(screen.getAllByText(/HR Model Stats/i).length).toBeGreaterThan(0);
  });
});

describe("Header labels", () => {
  it("desktop header shows Numerology Score as the ranking column", () => {
    const rows = [makeRow()];
    render(<ExplorerTable rows={rows} />);
    expect(screen.getByRole("columnheader", { name: /Numerology Score/i })).toHaveAttribute("aria-sort", "descending");
  });

  it("desktop header shows Model Rating without making it the primary sort", () => {
    const rows = [makeRow()];
    render(<ExplorerTable rows={rows} />);
    expect(screen.getByRole("columnheader", { name: /Model Rating/i })).toHaveAttribute("aria-sort", "none");
  });
});

describe("compareRowsBySort still supports explicit test sort states", () => {
  it("Numerology Score descending", () => {
    const rows = [makeRow({ playerName: "Low", numerologyScore: 20 }), makeRow({ playerName: "High", numerologyScore: 80 })];
    const sorted = [...rows].sort((a, b) => compareRowsBySort(a, b, { field: "numerologyScore", direction: "desc" }));
    expect(sorted[0].playerName).toBe("High");
  });
});
