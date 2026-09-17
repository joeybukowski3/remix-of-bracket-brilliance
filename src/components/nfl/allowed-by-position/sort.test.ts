import { describe, expect, it } from "vitest";
import { nextAllowedByPositionSort, sortAllowedByPositionRows } from "./sort";
import type { AllowedByPositionRow } from "./types";

type Col = "qb" | "rb";

function row(
  id: string,
  team: string,
  opponent: string | null,
  qbRank: number | null,
  rbRank: number | null = null,
  qbRaw: number | null = null,
): AllowedByPositionRow<Col> {
  return {
    id,
    team,
    opponent,
    location: opponent ? "vs" : null,
    cells: { qb: { rank: qbRank, rawValue: qbRaw }, rb: { rank: rbRank } },
  };
}

describe("sortAllowedByPositionRows", () => {
  const rows = [row("kc", "kc", "buf", 12), row("ari", "ari", "sea", 3), row("buf", "buf", "kc", null)];

  it("sorts by team abbreviation A-Z by default", () => {
    const result = sortAllowedByPositionRows(rows, "team", "asc");
    expect(result.map((r) => r.team)).toEqual(["ari", "buf", "kc"]);
  });

  it("sorts by team Z-A when direction is desc", () => {
    const result = sortAllowedByPositionRows(rows, "team", "desc");
    expect(result.map((r) => r.team)).toEqual(["kc", "buf", "ari"]);
  });

  it("sorts a position column ascending: 1 -> 32", () => {
    const result = sortAllowedByPositionRows(rows, "qb", "asc");
    expect(result.map((r) => r.team)).toEqual(["ari", "kc", "buf"]);
  });

  it("sorts a position column descending: 32 -> 1", () => {
    const result = sortAllowedByPositionRows(rows, "qb", "desc");
    expect(result.map((r) => r.team)).toEqual(["kc", "ari", "buf"]);
  });

  it("always sorts null ranks last, in both directions", () => {
    const ascending = sortAllowedByPositionRows(rows, "qb", "asc");
    const descending = sortAllowedByPositionRows(rows, "qb", "desc");
    expect(ascending.at(-1)?.team).toBe("buf");
    expect(descending.at(-1)?.team).toBe("buf");
  });

  it("sorts by opponent alphabetically with nulls last", () => {
    const withMissingOpponent = [row("a", "aaa", "sea"), row("b", "bbb", null, 1), row("c", "ccc", "buf")];
    const result = sortAllowedByPositionRows(withMissingOpponent, "opponent", "asc");
    expect(result.map((r) => r.team)).toEqual(["ccc", "aaa", "bbb"]);
  });
});

describe("sortAllowedByPositionRows with valueMode='raw'", () => {
  // Ranks are intentionally the inverse of raw values to prove raw mode sorts by rawValue, not rank.
  const rawRows = [
    row("kc", "kc", "buf", 1, null, 18.7),
    row("ari", "ari", "sea", 3, null, 5.4),
    row("buf", "buf", "kc", 2, null, null),
  ];

  it("sorts a position column by raw value ascending, low to high", () => {
    const result = sortAllowedByPositionRows(rawRows, "qb", "asc", "raw");
    expect(result.map((r) => r.team)).toEqual(["ari", "kc", "buf"]);
  });

  it("sorts a position column by raw value descending on second click", () => {
    const result = sortAllowedByPositionRows(rawRows, "qb", "desc", "raw");
    expect(result.map((r) => r.team)).toEqual(["kc", "ari", "buf"]);
  });

  it("keeps null raw values last in both directions", () => {
    const ascending = sortAllowedByPositionRows(rawRows, "qb", "asc", "raw");
    const descending = sortAllowedByPositionRows(rawRows, "qb", "desc", "raw");
    expect(ascending.at(-1)?.team).toBe("buf");
    expect(descending.at(-1)?.team).toBe("buf");
  });

  it("defaults to rank-based sorting when valueMode is omitted", () => {
    const result = sortAllowedByPositionRows(rawRows, "qb", "asc");
    expect(result.map((r) => r.team)).toEqual(["kc", "buf", "ari"]);
  });
});

describe("nextAllowedByPositionSort", () => {
  it("switches to a new column ascending", () => {
    expect(nextAllowedByPositionSort({ key: "team", direction: "asc" }, "qb")).toEqual({ key: "qb", direction: "asc" });
  });

  it("toggles direction when clicking the already-active column", () => {
    expect(nextAllowedByPositionSort({ key: "qb", direction: "asc" }, "qb")).toEqual({ key: "qb", direction: "desc" });
    expect(nextAllowedByPositionSort({ key: "qb", direction: "desc" }, "qb")).toEqual({ key: "qb", direction: "asc" });
  });
});
