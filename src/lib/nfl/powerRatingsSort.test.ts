import { describe, expect, it } from "vitest";
import {
  defaultSortDirection,
  defaultSortForPeriod,
  recordWinPct,
  sortPowerRatingRows,
  type PowerRatingsSortKey,
} from "@/lib/nfl/powerRatingsSort";
import type { PowerRatingsRow } from "@/hooks/useNflPowerRatingsBoard";
import type { WinLossTie } from "@/lib/nfl/standings";

function cell(value: number | null, rank: number | null = null) {
  return { value, rank };
}

function row(over: Partial<PowerRatingsRow> & { abbr: string }): PowerRatingsRow {
  return {
    slug: null,
    color: "#000",
    name: over.abbr,
    rank: null,
    off: cell(null),
    def: cell(null),
    ovr: cell(null),
    ypp: cell(null),
    epa: cell(null),
    success: cell(null),
    sos: cell(null),
    record: null,
    recordStats: null,
    ...over,
  };
}

const order = (rows: readonly PowerRatingsRow[]) => rows.map((r) => r.abbr);
const wlt = (wins: number, losses: number, ties = 0): WinLossTie => ({ wins, losses, ties });

describe("defaultSortDirection", () => {
  it("ascends for rank, team and SoS; descends for metrics and record", () => {
    expect(defaultSortDirection("rank")).toBe("asc");
    expect(defaultSortDirection("team")).toBe("asc");
    expect(defaultSortDirection("sos")).toBe("asc");
    for (const key of ["off", "def", "ovr", "ypp", "epa", "success", "record"] as PowerRatingsSortKey[]) {
      expect(defaultSortDirection(key)).toBe("desc");
    }
  });

  it("defaultSortForPeriod is always the primary rank, #1 first", () => {
    expect(defaultSortForPeriod()).toEqual({ key: "rank", direction: "asc" });
  });
});

describe("sortPowerRatingRows — metric columns", () => {
  const rows = [
    row({ abbr: "a", epa: cell(60, 10), ypp: cell(55, 12), off: cell(52, 15), def: cell(48, 20), ovr: cell(50, 16), success: cell(58, 9) }),
    row({ abbr: "b", epa: cell(80, 1), ypp: cell(70, 2), off: cell(75, 3), def: cell(66, 5), ovr: cell(71, 2), success: cell(72, 4) }),
    row({ abbr: "c", epa: cell(40, 30), ypp: cell(44, 28), off: cell(41, 29), def: cell(39, 31), ovr: cell(40, 30), success: cell(43, 27) }),
  ];

  it("EPA default direction is highest → lowest", () => {
    expect(order(sortPowerRatingRows(rows, { key: "epa", direction: "desc" }))).toEqual(["b", "a", "c"]);
  });

  it("EPA reverse is lowest → highest", () => {
    expect(order(sortPowerRatingRows(rows, { key: "epa", direction: "asc" }))).toEqual(["c", "a", "b"]);
  });

  it.each(["off", "def", "ovr", "ypp", "success"] as PowerRatingsSortKey[])(
    "%s sorts highest rating first by default and reverses",
    (key) => {
      expect(order(sortPowerRatingRows(rows, { key, direction: "desc" }))).toEqual(["b", "a", "c"]);
      expect(order(sortPowerRatingRows(rows, { key, direction: "asc" }))).toEqual(["c", "a", "b"]);
    }
  );

  it("null metric values stay last in BOTH directions", () => {
    const withNull = [
      row({ abbr: "a", epa: cell(60) }),
      row({ abbr: "b", epa: cell(null) }),
      row({ abbr: "c", epa: cell(40) }),
    ];
    expect(order(sortPowerRatingRows(withNull, { key: "epa", direction: "desc" }))).toEqual(["a", "c", "b"]);
    expect(order(sortPowerRatingRows(withNull, { key: "epa", direction: "asc" }))).toEqual(["c", "a", "b"]);
  });
});

describe("sortPowerRatingRows — SoS", () => {
  const rows = [
    row({ abbr: "a", sos: cell(5, 8) }),
    row({ abbr: "b", sos: cell(12, 24) }),
    row({ abbr: "c", sos: cell(3, 2) }),
  ];

  it("default is hardest → easiest (lowest avg opponent rank first)", () => {
    expect(order(sortPowerRatingRows(rows, { key: "sos", direction: "asc" }))).toEqual(["c", "a", "b"]);
  });

  it("reverse is easiest → hardest", () => {
    expect(order(sortPowerRatingRows(rows, { key: "sos", direction: "desc" }))).toEqual(["b", "a", "c"]);
  });

  it("null SoS stays last in both directions", () => {
    const withNull = [
      row({ abbr: "a", sos: cell(5) }),
      row({ abbr: "b", sos: cell(null) }),
      row({ abbr: "c", sos: cell(3) }),
    ];
    expect(order(sortPowerRatingRows(withNull, { key: "sos", direction: "asc" }))).toEqual(["c", "a", "b"]);
    expect(order(sortPowerRatingRows(withNull, { key: "sos", direction: "desc" }))).toEqual(["a", "c", "b"]);
  });
});

describe("sortPowerRatingRows — record", () => {
  it("recordWinPct = (W + 0.5T) / games, null for 0 games", () => {
    expect(recordWinPct(wlt(12, 5))).toBeCloseTo(12 / 17, 6);
    expect(recordWinPct(wlt(12, 4, 1))).toBeCloseTo(12.5 / 17, 6);
    expect(recordWinPct(wlt(0, 0, 0))).toBeNull();
    expect(recordWinPct(null)).toBeNull();
  });

  it("sorts by winning percentage, best first, 0-game records last", () => {
    const rows = [
      row({ abbr: "a", recordStats: wlt(12, 5) }), // .706
      row({ abbr: "b", recordStats: wlt(10, 7) }), // .588
      row({ abbr: "c", recordStats: wlt(12, 4, 1) }), // .735
      row({ abbr: "z", recordStats: wlt(0, 0, 0) }), // null -> last
    ];
    expect(order(sortPowerRatingRows(rows, { key: "record", direction: "desc" }))).toEqual(["c", "a", "b", "z"]);
    // Reverse: worst first, nulls still last.
    expect(order(sortPowerRatingRows(rows, { key: "record", direction: "asc" }))).toEqual(["b", "a", "c", "z"]);
  });

  it("breaks winPct ties by wins, then losses, then abbreviation", () => {
    const rows = [
      row({ abbr: "y", recordStats: wlt(9, 9) }), // .500
      row({ abbr: "x", recordStats: wlt(10, 10) }), // .500, more wins
      row({ abbr: "a", recordStats: wlt(9, 9) }), // .500, ties y on wins/losses -> abbr
    ];
    expect(order(sortPowerRatingRows(rows, { key: "record", direction: "desc" }))).toEqual(["x", "a", "y"]);
  });
});

describe("sortPowerRatingRows — team and rank", () => {
  it("Team sorts alphabetically by name and reverses", () => {
    const rows = [
      row({ abbr: "z", name: "Zebra" }),
      row({ abbr: "a", name: "Alpha" }),
      row({ abbr: "m", name: "Mango" }),
    ];
    expect(order(sortPowerRatingRows(rows, { key: "team", direction: "asc" }))).toEqual(["a", "m", "z"]);
    expect(order(sortPowerRatingRows(rows, { key: "team", direction: "desc" }))).toEqual(["z", "m", "a"]);
  });

  it("Power/Form rank sorts #1 → #N by default, reverses, nulls last", () => {
    const rows = [
      row({ abbr: "a", rank: 3 }),
      row({ abbr: "b", rank: 1 }),
      row({ abbr: "c", rank: 2 }),
      row({ abbr: "z", rank: null }),
    ];
    expect(order(sortPowerRatingRows(rows, { key: "rank", direction: "asc" }))).toEqual(["b", "c", "a", "z"]);
    expect(order(sortPowerRatingRows(rows, { key: "rank", direction: "desc" }))).toEqual(["a", "c", "b", "z"]);
  });
});

describe("sortPowerRatingRows — purity and determinism", () => {
  const rows = [
    row({ abbr: "a", name: "Alpha", epa: cell(60, 10), ovr: cell(50, 16) }),
    row({ abbr: "b", name: "Bravo", epa: cell(80, 1), ovr: cell(71, 2) }),
    row({ abbr: "c", name: "Charlie", epa: cell(40, 30), ovr: cell(40, 30) }),
  ];

  it("does not mutate the input array or its rows, and never touches metric ranks", () => {
    const snapshot = rows.map((r) => ({ ...r }));
    const result = sortPowerRatingRows(rows, { key: "team", direction: "asc" });
    expect(result).not.toBe(rows);
    expect(order(rows)).toEqual(["a", "b", "c"]); // original order intact
    for (let i = 0; i < rows.length; i += 1) {
      expect(rows[i].epa).toEqual(snapshot[i].epa);
      expect(rows[i].ovr.rank).toBe(snapshot[i].ovr.rank);
    }
    // Sorting by team leaves each row's own EPA/OVR ranks exactly as supplied.
    const bravo = result.find((r) => r.abbr === "b")!;
    expect(bravo.epa.rank).toBe(1);
    expect(bravo.ovr.rank).toBe(2);
  });

  it("is order-independent: reversed input yields the same sorted output", () => {
    const forward = order(sortPowerRatingRows(rows, { key: "epa", direction: "desc" }));
    const backward = order(sortPowerRatingRows([...rows].reverse(), { key: "epa", direction: "desc" }));
    expect(forward).toEqual(backward);
  });

  it("ties on the sort key fall back to abbreviation deterministically", () => {
    const tied = [
      row({ abbr: "n", epa: cell(50) }),
      row({ abbr: "d", epa: cell(50) }),
      row({ abbr: "k", epa: cell(50) }),
    ];
    expect(order(sortPowerRatingRows(tied, { key: "epa", direction: "desc" }))).toEqual(["d", "k", "n"]);
    expect(order(sortPowerRatingRows(tied, { key: "epa", direction: "asc" }))).toEqual(["d", "k", "n"]);
  });
});
