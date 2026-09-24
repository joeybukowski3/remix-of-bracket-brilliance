import { describe, expect, it } from "vitest";
import type { PositionMatchupTableRow } from "@/lib/nfl/positionMatchups/presentation";
import { nextPositionMatchupSort, sortPositionMatchupRows } from "./sort";

function cell(overrides: Partial<PositionMatchupTableRow["cells"]["qb"]> = {}) {
  return {
    forRank: null,
    forRaw: null,
    forDisplay: null,
    allowedRank: null,
    allowedRaw: null,
    allowedDisplay: null,
    edge: null,
    rating: null,
    ...overrides,
  };
}

function row(overrides: Partial<PositionMatchupTableRow> & { team: string }): PositionMatchupTableRow {
  return {
    id: overrides.team,
    opponent: null,
    location: null,
    cells: { qb: cell(), rb: cell(), wr: cell(), te: cell() },
    ...overrides,
  };
}

describe("sortPositionMatchupRows", () => {
  it("sorts by team alphabetically", () => {
    const rows = [row({ team: "nyj" }), row({ team: "buf" })];
    const sorted = sortPositionMatchupRows(rows, "team", "asc");
    expect(sorted.map((r) => r.team)).toEqual(["buf", "nyj"]);
  });

  it("sorts opponent alphabetically with nulls last", () => {
    const rows = [row({ team: "a", opponent: null }), row({ team: "b", opponent: "mia" })];
    const sorted = sortPositionMatchupRows(rows, "opponent", "asc");
    expect(sorted.map((r) => r.team)).toEqual(["b", "a"]);
  });

  it("sorts by FOR rank in rank mode, nulls last", () => {
    const rows = [
      row({ team: "a", cells: { qb: cell({ forRank: 20 }), rb: cell(), wr: cell(), te: cell() } }),
      row({ team: "b", cells: { qb: cell({ forRank: 5 }), rb: cell(), wr: cell(), te: cell() } }),
      row({ team: "c", cells: { qb: cell({ forRank: null }), rb: cell(), wr: cell(), te: cell() } }),
    ];
    const sorted = sortPositionMatchupRows(rows, "qb-for", "asc", "rank");
    expect(sorted.map((r) => r.team)).toEqual(["b", "a", "c"]);
  });

  it("sorts by the raw per-game value in raw mode", () => {
    const rows = [
      row({ team: "a", cells: { qb: cell({ forRank: 5, forRaw: 10.2 }), rb: cell(), wr: cell(), te: cell() } }),
      row({ team: "b", cells: { qb: cell({ forRank: 20, forRaw: 25.1 }), rb: cell(), wr: cell(), te: cell() } }),
    ];
    const sorted = sortPositionMatchupRows(rows, "qb-for", "desc", "raw");
    expect(sorted.map((r) => r.team)).toEqual(["b", "a"]);
  });

  it("sorts by edge regardless of display mode", () => {
    const rows = [
      row({ team: "a", cells: { qb: cell({ edge: -10 }), rb: cell(), wr: cell(), te: cell() } }),
      row({ team: "b", cells: { qb: cell({ edge: 15 }), rb: cell(), wr: cell(), te: cell() } }),
    ];
    const sorted = sortPositionMatchupRows(rows, "qb-edge", "desc");
    expect(sorted.map((r) => r.team)).toEqual(["b", "a"]);
  });
});

describe("nextPositionMatchupSort", () => {
  it("starts a new column ascending", () => {
    expect(nextPositionMatchupSort({ key: "team", direction: "asc" }, "qb-edge")).toEqual({ key: "qb-edge", direction: "asc" });
  });

  it("toggles direction on the same column", () => {
    expect(nextPositionMatchupSort({ key: "qb-edge", direction: "asc" }, "qb-edge")).toEqual({ key: "qb-edge", direction: "desc" });
  });
});
