import { describe, expect, it } from "vitest";
import {
  buildPositionMatchupTableRows,
  positionMatchupAllowedRankTone,
  positionMatchupForRankTone,
  positionMatchupRatingTone,
} from "./presentation";
import type { PositionMatchupArtifact, PositionMatchupCell, PositionMatchupCells } from "./types";

function emptyCell(overrides: Partial<PositionMatchupCell> = {}): PositionMatchupCell {
  return {
    forRank: null,
    forPerGame: null,
    forGamesSampled: 0,
    allowedRank: null,
    allowedPerGame: null,
    allowedGamesSampled: 0,
    edge: null,
    rating: null,
    ...overrides,
  };
}

function makeCells(overrides: Partial<Record<"qb" | "rb" | "wr" | "te", Partial<PositionMatchupCell>>> = {}): PositionMatchupCells {
  return {
    qb: emptyCell(overrides.qb),
    rb: emptyCell(overrides.rb),
    wr: emptyCell(overrides.wr),
    te: emptyCell(overrides.te),
  };
}

function makeArtifact(): PositionMatchupArtifact {
  return {
    schemaVersion: "nfl-fantasy-position-matchups-v1",
    generatedAt: "2026-09-17T00:00:00.000Z",
    season: 2026,
    week: 3,
    scoringVersion: "test",
    rows: [
      {
        team: "buf",
        opponent: "mia",
        location: "@",
        samples: {
          "2026": makeCells({ qb: { forRank: 5, forPerGame: 22.4, allowedRank: 29, allowedPerGame: 25.1, edge: 1, rating: "neutral" } }),
          "2025": makeCells(),
          last5: makeCells(),
          last8: makeCells(),
        },
      },
    ],
  };
}

describe("buildPositionMatchupTableRows", () => {
  it("returns an empty array when the artifact has not loaded", () => {
    expect(buildPositionMatchupTableRows(null, "2026")).toEqual([]);
  });

  it("formats raw per-game values to one decimal place", () => {
    const rows = buildPositionMatchupTableRows(makeArtifact(), "2026");
    expect(rows[0].cells.qb.forDisplay).toBe("22.4");
    expect(rows[0].cells.qb.allowedDisplay).toBe("25.1");
  });

  it("passes through rank, edge and rating without recomputation", () => {
    const rows = buildPositionMatchupTableRows(makeArtifact(), "2026");
    expect(rows[0].cells.qb.forRank).toBe(5);
    expect(rows[0].cells.qb.allowedRank).toBe(29);
    expect(rows[0].cells.qb.edge).toBe(1);
    expect(rows[0].cells.qb.rating).toBe("neutral");
  });

  it("selects the requested sample window", () => {
    const rows = buildPositionMatchupTableRows(makeArtifact(), "2025");
    expect(rows[0].cells.qb.forDisplay).toBeNull();
  });
});

describe("positionMatchupForRankTone", () => {
  it("gives the most productive rank (32) the strongest tone, and the least (1) the weakest", () => {
    expect(positionMatchupForRankTone(32).style?.backgroundColor).not.toBe(positionMatchupForRankTone(1).style?.backgroundColor);
  });
});

describe("positionMatchupAllowedRankTone", () => {
  it("inverts so the most generous defense (rank 32) reads favorable, same as rank-1 FOR", () => {
    expect(positionMatchupAllowedRankTone(32)).toEqual(positionMatchupForRankTone(1));
    expect(positionMatchupAllowedRankTone(1)).toEqual(positionMatchupForRankTone(32));
  });
});

describe("positionMatchupRatingTone", () => {
  it("maps very-strong to green and very-weak to strong-red", () => {
    expect(positionMatchupRatingTone("very-strong")).not.toEqual({});
    expect(positionMatchupRatingTone(null)).toEqual({});
  });
});
