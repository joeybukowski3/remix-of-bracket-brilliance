import { describe, expect, it } from "vitest";
import {
  DEFAULT_WEEKLY_SORT,
  defaultDirectionFor,
  nextSort,
  sortWeeklyRows,
  statSortKey,
} from "@/lib/fantasy/weeklySort";
import type { WeeklyRankingRow, WeeklyStatColumn } from "@/lib/fantasy/weeklyRankings";

const COLUMNS: WeeklyStatColumn[] = [
  {
    id: "passEpa",
    label: "Pass EPA",
    description: "",
    source: "epa",
    metricKey: "off.epaPerPass",
    direction: "higher-is-better",
  },
  {
    id: "sacksAllowed",
    label: "Sacks Allowed",
    description: "",
    source: "metrics",
    metricKey: "off.sacksAllowedPerGame",
    direction: "lower-is-better",
  },
];

function row(
  rank: number,
  projectedPpg: number,
  passEpa: number | null,
  fpaRank: number | null,
  fpaPerGame: number | null,
): WeeklyRankingRow {
  return {
    key: `p${rank}`,
    rank,
    player: `Player ${rank}`,
    position: "QB",
    teamAbbr: "buf",
    projectedPpg,
    opponent: null,
    opponentLabel: "—",
    fpa:
      fpaRank == null || fpaPerGame == null
        ? null
        : { rank: fpaRank, pointsAllowed: fpaPerGame },
    grade: null,
    stats: [
      passEpa == null ? null : { display: "x", raw: passEpa, rank: null, percentile: 50 },
      null,
    ],
  };
}

const ROWS = [
  row(1, 23.3, 0.2, 31, 13.2),
  row(2, 21.5, 0.328, 23, 15.6),
  row(3, 20.7, -0.018, 14, 17.6),
  row(4, 20.5, null, null, null),
];

const order = (rows: readonly WeeklyRankingRow[]) => rows.map((r) => r.rank);

describe("default sort", () => {
  it("is projected PPG descending", () => {
    expect(DEFAULT_WEEKLY_SORT).toEqual({ key: "projPpg", direction: "desc" });
    expect(order(sortWeeklyRows(ROWS, DEFAULT_WEEKLY_SORT, COLUMNS))).toEqual([1, 2, 3, 4]);
  });
});

describe("defaultDirectionFor", () => {
  it("opens each column best-first", () => {
    expect(defaultDirectionFor("projPpg", COLUMNS)).toBe("desc");
    // Higher FPA allowed = easier matchup.
    expect(defaultDirectionFor("fpaPerGame", COLUMNS)).toBe("desc");
    // FPA rank 1 = easiest matchup.
    expect(defaultDirectionFor("fpaRank", COLUMNS)).toBe("asc");
    expect(defaultDirectionFor(statSortKey("passEpa"), COLUMNS)).toBe("desc");
  });

  it("honours a lower-is-better stat column without special-casing it", () => {
    expect(defaultDirectionFor(statSortKey("sacksAllowed"), COLUMNS)).toBe("asc");
  });
});

describe("nextSort", () => {
  it("opens a new column best-first", () => {
    expect(nextSort(DEFAULT_WEEKLY_SORT, statSortKey("passEpa"), COLUMNS)).toEqual({
      key: "stat:passEpa",
      direction: "desc",
    });
    expect(nextSort(DEFAULT_WEEKLY_SORT, "fpaRank", COLUMNS)).toEqual({
      key: "fpaRank",
      direction: "asc",
    });
  });

  it("reverses the active column on a second click", () => {
    const first = nextSort(DEFAULT_WEEKLY_SORT, statSortKey("passEpa"), COLUMNS);
    const second = nextSort(first, statSortKey("passEpa"), COLUMNS);
    expect(second).toEqual({ key: "stat:passEpa", direction: "asc" });
    expect(nextSort(second, statSortKey("passEpa"), COLUMNS).direction).toBe("desc");
  });

  it("returns to projected PPG descending when that header is clicked", () => {
    const stat = nextSort(DEFAULT_WEEKLY_SORT, statSortKey("passEpa"), COLUMNS);
    expect(nextSort(stat, "projPpg", COLUMNS)).toEqual(DEFAULT_WEEKLY_SORT);
  });
});

describe("sortWeeklyRows", () => {
  it("sorts a stat column best-first then reverses", () => {
    const desc = sortWeeklyRows(ROWS, { key: statSortKey("passEpa"), direction: "desc" }, COLUMNS);
    expect(order(desc)).toEqual([2, 1, 3, 4]);
    const asc = sortWeeklyRows(ROWS, { key: statSortKey("passEpa"), direction: "asc" }, COLUMNS);
    expect(order(asc)).toEqual([3, 1, 2, 4]);
  });

  it("sorts the FPA columns", () => {
    expect(order(sortWeeklyRows(ROWS, { key: "fpaRank", direction: "asc" }, COLUMNS))).toEqual([
      3, 2, 1, 4,
    ]);
    expect(order(sortWeeklyRows(ROWS, { key: "fpaPerGame", direction: "desc" }, COLUMNS))).toEqual([
      3, 2, 1, 4,
    ]);
  });

  it("keeps rows with no value last in both directions", () => {
    const desc = sortWeeklyRows(ROWS, { key: statSortKey("passEpa"), direction: "desc" }, COLUMNS);
    const asc = sortWeeklyRows(ROWS, { key: statSortKey("passEpa"), direction: "asc" }, COLUMNS);
    expect(desc[desc.length - 1].rank).toBe(4);
    expect(asc[asc.length - 1].rank).toBe(4);
  });

  it("never renumbers the fantasy rank", () => {
    const sorted = sortWeeklyRows(ROWS, { key: "fpaRank", direction: "asc" }, COLUMNS);
    expect(sorted.map((r) => r.rank).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    expect(sorted[0].rank).toBe(3);
  });

  it("breaks ties on fantasy rank so the order is deterministic", () => {
    const tied = [row(2, 20, 0.5, 5, 10), row(1, 20, 0.5, 5, 10), row(3, 20, 0.5, 5, 10)];
    expect(order(sortWeeklyRows(tied, DEFAULT_WEEKLY_SORT, COLUMNS))).toEqual([1, 2, 3]);
  });

  it("does not mutate the input array", () => {
    const input = [...ROWS];
    sortWeeklyRows(input, { key: "fpaRank", direction: "asc" }, COLUMNS);
    expect(order(input)).toEqual([1, 2, 3, 4]);
  });

  it("sorts on raw values, so a percentile-only difference cannot reorder", () => {
    // Same raw value, different percentiles — order must fall back to rank.
    const a = row(1, 20, 0.5, 5, 10);
    const b = row(2, 19, 0.5, 5, 10);
    a.stats[0]!.percentile = 10;
    b.stats[0]!.percentile = 90;
    expect(
      order(sortWeeklyRows([b, a], { key: statSortKey("passEpa"), direction: "desc" }, COLUMNS)),
    ).toEqual([1, 2]);
  });
});
