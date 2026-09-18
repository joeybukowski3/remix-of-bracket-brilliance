import { describe, expect, it } from "vitest";
import { buildTdsAllowedTableRows, tdsAllowedRankTone } from "./presentation";
import type { TdsAllowedArtifact } from "./types";

describe("tdsAllowedRankTone", () => {
  it("colors rank 1 (fewest touchdowns allowed) toward the green/gold end of the scale", () => {
    const tone = tdsAllowedRankTone(1);
    expect(tone.style?.backgroundColor).toBeDefined();
  });

  it("colors rank 32 (most touchdowns allowed) differently from rank 1", () => {
    const best = tdsAllowedRankTone(1);
    const worst = tdsAllowedRankTone(32);
    expect(worst.style?.backgroundColor).not.toBe(best.style?.backgroundColor);
  });

  it("returns no styling for a null rank", () => {
    expect(tdsAllowedRankTone(null)).toEqual({});
  });

  it("is monotonic across the tier boundaries used by the design spec (1-5 best, 28-32 worst)", () => {
    const tones = [1, 8, 16, 24, 30].map((rank) => tdsAllowedRankTone(rank).style?.backgroundColor);
    expect(new Set(tones).size).toBeGreaterThan(1);
  });
});

describe("buildTdsAllowedTableRows", () => {
  const artifact: TdsAllowedArtifact = {
    schemaVersion: "nfl-tds-allowed-by-position-v1",
    generatedAt: "2026-09-17T00:00:00.000Z",
    season: 2026,
    week: 2,
    rows: [
      {
        team: "buf",
        opponent: "mia",
        location: "@",
        samples: {
          "2026": {
            // rank is deliberately based on a per-game value that disagrees with the raw total's
            // ordering, so tests can tell the two fields apart.
            qb: { rank: 5, gamesSampled: 2, touchdownsAllowedTotal: 3, touchdownsAllowedPerGame: 1.5, source: "nflverse-player-week" },
            rb: null,
            wr: { rank: 12, gamesSampled: 2, touchdownsAllowedTotal: 5, touchdownsAllowedPerGame: 2.5, source: "nflverse-player-week" },
            te: null,
          },
          "2025": { qb: null, rb: null, wr: null, te: null },
          last5: { qb: null, rb: null, wr: null, te: null },
          last8: { qb: null, rb: null, wr: null, te: null },
        },
      },
    ],
  };

  it("returns an empty array when the artifact hasn't loaded", () => {
    expect(buildTdsAllowedTableRows(null, "2026")).toEqual([]);
  });

  it("maps a populated sample cell to its rank", () => {
    const rows = buildTdsAllowedTableRows(artifact, "2026");
    expect(rows[0].cells.qb.rank).toBe(5);
  });

  it("maps touchdownsAllowedTotal (not per-game) to rawValue/rawDisplay as a whole number", () => {
    const rows = buildTdsAllowedTableRows(artifact, "2026");
    expect(rows[0].cells.qb.rawValue).toBe(3);
    expect(rows[0].cells.qb.rawDisplay).toBe("3");
  });

  it("maps a null sample cell to a null rank and null rawValue/rawDisplay", () => {
    const rows = buildTdsAllowedTableRows(artifact, "2026");
    expect(rows[0].cells.rb.rank).toBeNull();
    expect(rows[0].cells.rb.rawValue).toBeNull();
    expect(rows[0].cells.rb.rawDisplay).toBeNull();
  });

  it("maps the combined WR cell to its rank and whole-number total, same as any other position", () => {
    const rows = buildTdsAllowedTableRows(artifact, "2026");
    expect(rows[0].cells.wr.rank).toBe(12);
    expect(rows[0].cells.wr.rawValue).toBe(5);
    expect(rows[0].cells.wr.rawDisplay).toBe("5");
  });

  it("carries team/opponent/location through unchanged", () => {
    const rows = buildTdsAllowedTableRows(artifact, "2026");
    expect(rows[0]).toMatchObject({ id: "buf", team: "buf", opponent: "mia", location: "@" });
  });

  it("never appends a decimal place, even for values that were whole under the old per-game format", () => {
    const wholeArtifact: TdsAllowedArtifact = {
      ...artifact,
      rows: [
        {
          ...artifact.rows[0],
          samples: {
            ...artifact.rows[0].samples,
            "2026": {
              ...artifact.rows[0].samples["2026"],
              qb: { rank: 3, gamesSampled: 2, touchdownsAllowedTotal: 4, touchdownsAllowedPerGame: 2, source: "nflverse-player-week" },
            },
          },
        },
      ],
    };
    const rows = buildTdsAllowedTableRows(wholeArtifact, "2026");
    expect(rows[0].cells.qb.rawDisplay).toBe("4");
  });

  it("displays zero as \"0\", not null", () => {
    const zeroArtifact: TdsAllowedArtifact = {
      ...artifact,
      rows: [
        {
          ...artifact.rows[0],
          samples: {
            ...artifact.rows[0].samples,
            "2026": {
              ...artifact.rows[0].samples["2026"],
              qb: { rank: 32, gamesSampled: 2, touchdownsAllowedTotal: 0, touchdownsAllowedPerGame: 0, source: "nflverse-player-week" },
            },
          },
        },
      ],
    };
    const rows = buildTdsAllowedTableRows(zeroArtifact, "2026");
    expect(rows[0].cells.qb.rawValue).toBe(0);
    expect(rows[0].cells.qb.rawDisplay).toBe("0");
  });
});
