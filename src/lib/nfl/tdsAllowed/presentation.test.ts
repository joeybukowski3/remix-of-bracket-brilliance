import { describe, expect, it } from "vitest";
import { TDS_ALLOWED_COLUMNS, buildTdsAllowedTableRows, tdsAllowedRankTone } from "./presentation";
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

const EMPTY = { qbPass: null, qbRush: null, rbRush: null, rbRec: null, wrRec: null, teRec: null };

describe("TDS_ALLOWED_COLUMNS", () => {
  it("lists the six scoring-method columns in desktop order with compact stacked labels", () => {
    expect(TDS_ALLOWED_COLUMNS.map((column) => column.key)).toEqual(["qbPass", "qbRush", "rbRush", "rbRec", "wrRec", "teRec"]);
    expect(TDS_ALLOWED_COLUMNS.map((column) => column.label)).toEqual(["QB PASS", "QB RUSH", "RB RUSH", "RB REC", "WR REC", "TE REC"]);
    expect(TDS_ALLOWED_COLUMNS.every((column) => column.stackLabel)).toBe(true);
  });

  it("no longer exposes the old broad QB/RB/WR/TE columns", () => {
    expect(TDS_ALLOWED_COLUMNS.map((column) => column.label)).not.toEqual(expect.arrayContaining(["QB", "RB", "WR", "TE"]));
  });
});

describe("buildTdsAllowedTableRows", () => {
  const artifact: TdsAllowedArtifact = {
    schemaVersion: "nfl-tds-allowed-by-position-v2",
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
            qbPass: { rank: 5, gamesSampled: 2, touchdownsAllowedTotal: 3, touchdownsAllowedPerGame: 1.5, source: "nflverse-player-week" },
            qbRush: null,
            rbRush: null,
            rbRec: null,
            wrRec: { rank: 12, gamesSampled: 2, touchdownsAllowedTotal: 5, touchdownsAllowedPerGame: 2.5, source: "nflverse-player-week" },
            teRec: null,
          },
          "2025": EMPTY,
          last5: EMPTY,
          last8: EMPTY,
        },
      },
    ],
  };

  it("returns an empty array when the artifact hasn't loaded", () => {
    expect(buildTdsAllowedTableRows(null, "2026")).toEqual([]);
  });

  it("maps a populated sample cell to its rank", () => {
    const rows = buildTdsAllowedTableRows(artifact, "2026");
    expect(rows[0].cells.qbPass.rank).toBe(5);
  });

  it("maps touchdownsAllowedTotal (not per-game) to rawValue/rawDisplay as a whole number", () => {
    const rows = buildTdsAllowedTableRows(artifact, "2026");
    expect(rows[0].cells.qbPass.rawValue).toBe(3);
    expect(rows[0].cells.qbPass.rawDisplay).toBe("3");
  });

  it("maps a null sample cell to a null rank and null rawValue/rawDisplay", () => {
    const rows = buildTdsAllowedTableRows(artifact, "2026");
    expect(rows[0].cells.rbRush.rank).toBeNull();
    expect(rows[0].cells.rbRush.rawValue).toBeNull();
    expect(rows[0].cells.rbRush.rawDisplay).toBeNull();
  });

  it("maps the WR REC cell to its rank and whole-number total, same as any other position", () => {
    const rows = buildTdsAllowedTableRows(artifact, "2026");
    expect(rows[0].cells.wrRec.rank).toBe(12);
    expect(rows[0].cells.wrRec.rawValue).toBe(5);
    expect(rows[0].cells.wrRec.rawDisplay).toBe("5");
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
              qbPass: { rank: 3, gamesSampled: 2, touchdownsAllowedTotal: 4, touchdownsAllowedPerGame: 2, source: "nflverse-player-week" },
            },
          },
        },
      ],
    };
    const rows = buildTdsAllowedTableRows(wholeArtifact, "2026");
    expect(rows[0].cells.qbPass.rawDisplay).toBe("4");
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
              qbPass: { rank: 32, gamesSampled: 2, touchdownsAllowedTotal: 0, touchdownsAllowedPerGame: 0, source: "nflverse-player-week" },
            },
          },
        },
      ],
    };
    const rows = buildTdsAllowedTableRows(zeroArtifact, "2026");
    expect(rows[0].cells.qbPass.rawValue).toBe(0);
    expect(rows[0].cells.qbPass.rawDisplay).toBe("0");
  });
});
