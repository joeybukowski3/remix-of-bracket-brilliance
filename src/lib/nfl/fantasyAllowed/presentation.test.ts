import { describe, expect, it } from "vitest";
import { buildFantasyAllowedTableRows, fantasyAllowedColumns, fantasyAllowedRankTone } from "./presentation";
import type { FantasyAllowedArtifact } from "./types";

describe("fantasyAllowedRankTone", () => {
  it("colors rank 1 (stingiest defense) toward the green/gold end of the scale", () => {
    const tone = fantasyAllowedRankTone(1);
    expect(tone.style?.backgroundColor).toBeDefined();
  });

  it("colors rank 32 (most fantasy production allowed) differently from rank 1", () => {
    const best = fantasyAllowedRankTone(1);
    const worst = fantasyAllowedRankTone(32);
    expect(worst.style?.backgroundColor).not.toBe(best.style?.backgroundColor);
  });

  it("returns no styling for a null rank", () => {
    expect(fantasyAllowedRankTone(null)).toEqual({});
  });

  it("is monotonic across the tier boundaries used by the design spec (1-5 best, 28-32 worst)", () => {
    // Different tiers should not collapse to the same fill.
    const tones = [1, 8, 16, 24, 30].map((rank) => fantasyAllowedRankTone(rank).style?.backgroundColor);
    expect(new Set(tones).size).toBeGreaterThan(1);
  });
});

const artifact: FantasyAllowedArtifact = {
  schemaVersion: "nfl-fantasy-points-allowed-v2",
  generatedAt: "2026-09-17T00:00:00.000Z",
  season: 2026,
  week: 2,
  scoringVersion: "jkb-full-ppr-v1.0.0",
  rows: [
    {
      team: "buf",
      opponent: "mia",
      location: "@",
      samples: {
        "2026": {
          qb: { rank: 5, gamesSampled: 2, fantasyPointsAllowedTotal: 10, fantasyPointsAllowedPerGame: 5, source: "jkb-full-ppr-player-week" },
          rb: null,
          wr: { rank: 7, gamesSampled: 2, fantasyPointsAllowedTotal: 25, fantasyPointsAllowedPerGame: 12.5, source: "jkb-full-ppr-player-week" },
          te: null,
          wideWr: { rank: 8, gamesSampled: 0, fantasyPointsAllowedTotal: null, fantasyPointsAllowedPerGame: 11, source: "razzball-slot-wide-snapshot" },
          slotWr: { rank: 9, gamesSampled: 0, fantasyPointsAllowedTotal: null, fantasyPointsAllowedPerGame: 12, source: "razzball-slot-wide-snapshot" },
        },
        "2025": { qb: null, rb: null, wr: null, te: null, wideWr: null, slotWr: null },
        last5: { qb: null, rb: null, wr: null, te: null, wideWr: null, slotWr: null },
        last8: { qb: null, rb: null, wr: null, te: null, wideWr: null, slotWr: null },
      },
    },
  ],
};

describe("buildFantasyAllowedTableRows", () => {
  it("returns an empty array when the artifact hasn't loaded", () => {
    expect(buildFantasyAllowedTableRows(null, "2026")).toEqual([]);
  });

  it("maps a populated sample cell to its rank", () => {
    const rows = buildFantasyAllowedTableRows(artifact, "2026");
    expect(rows[0].cells.qb.rank).toBe(5);
  });

  it("maps a null sample cell to a null rank (never 0)", () => {
    const rows = buildFantasyAllowedTableRows(artifact, "2026");
    expect(rows[0].cells.rb.rank).toBeNull();
    expect(buildFantasyAllowedTableRows(artifact, "2025")[0].cells.wideWr.rank).toBeNull();
  });

  it("carries team/opponent/location through unchanged", () => {
    const rows = buildFantasyAllowedTableRows(artifact, "2026");
    expect(rows[0]).toMatchObject({ id: "buf", team: "buf", opponent: "mia", location: "@" });
  });

  it("maps fantasyPointsAllowedPerGame to rawValue/rawDisplay with one decimal place", () => {
    const rows = buildFantasyAllowedTableRows(artifact, "2026");
    expect(rows[0].cells.qb.rawValue).toBe(5);
    expect(rows[0].cells.qb.rawDisplay).toBe("5.0");
  });

  it("maps combined WR rank and raw PPG independently of split values", () => {
    const rows = buildFantasyAllowedTableRows(artifact, "2026");
    expect(rows[0].cells.wr).toEqual({ rank: 7, rawValue: 12.5, rawDisplay: "12.5" });
    expect(rows[0].cells.wideWr.rank).toBe(8);
  });

  it("maps a null sample cell to null rawValue/rawDisplay, never total points", () => {
    const rows = buildFantasyAllowedTableRows(artifact, "2026");
    expect(rows[0].cells.rb.rawValue).toBeNull();
    expect(rows[0].cells.rb.rawDisplay).toBeNull();
  });
});

describe("fantasyAllowedColumns", () => {
  it("shows 2026 split columns only when every defense has both split values", () => {
    expect(fantasyAllowedColumns(artifact, "2026").map((column) => column.key)).toEqual(["qb", "rb", "wideWr", "slotWr", "te"]);
    const withoutSplit = structuredClone(artifact);
    withoutSplit.rows[0].samples["2026"].slotWr = null;
    expect(fantasyAllowedColumns(withoutSplit, "2026").map((column) => column.key)).toEqual(["qb", "rb", "wr", "te"]);
  });

  it.each(["2025", "last5", "last8"] as const)("uses combined WR for %s", (sample) => {
    const columns = fantasyAllowedColumns(artifact, sample);
    expect(columns.map((column) => column.key)).toEqual(["qb", "rb", "wr", "te"]);
    expect(columns[2].headerClassName).toContain("bg-[#2F6B63]");
  });
});
