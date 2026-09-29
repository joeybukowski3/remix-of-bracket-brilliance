import { describe, expect, it } from "vitest";
import {
  deltaTone,
  formatSignedDelta,
  resolveDivisionBoardMode,
  selectDivisionRating,
  sortTeamsByProjectedRating,
  sosTone,
  standingsDisplayMode,
} from "@/lib/nfl/divisionBoard2026";
import type { CurrentRatingRow } from "@/lib/nfl/currentRating2026";

const week3Rows = [
  {
    abbr: "ne", team: "New England Patriots", division: "AFC East", gamesPlayed: 3,
    rating: 53.695, rank: 11, offenseRating: 59.352, offenseRank: 11, defenseRating: 63.519, defenseRank: 7,
    preseasonV04Rating: 66.9, preseasonOffenseRating: 75.507, preseasonDefenseRating: 53.005,
    performanceRating: 44.892, performanceRank: 20, performanceOffenseRating: 48.582,
    performanceOffenseRank: 17, performanceDefenseRating: 70.528, performanceDefenseRank: 5,
    preseasonWeight: 0.4, performanceWeight: 0.6, state: "live",
  },
  {
    abbr: "cle", team: "Cleveland Browns", division: "AFC North", gamesPlayed: 3,
    rating: 35.354, rank: 30, offenseRating: 20.371, offenseRank: 32, defenseRating: 55.034, defenseRank: 13,
    preseasonV04Rating: 36.7, preseasonOffenseRating: 1, preseasonDefenseRating: 76.361,
    performanceRating: 34.457, performanceRank: 31, performanceOffenseRating: 33.285,
    performanceOffenseRank: 28, performanceDefenseRating: 40.816, performanceDefenseRank: 22,
    preseasonWeight: 0.4, performanceWeight: 0.6, state: "live",
  },
] as CurrentRatingRow[];

describe("selectDivisionRating", () => {
  it("shows canonical Auto and pure live 2026 Only for Week 3 NE/CLE without mutating Current", () => {
    for (const row of week3Rows) {
      const before = structuredClone(row);
      expect(selectDivisionRating(row, "auto")).toEqual({
        rating: row.rating, rank: row.rank,
        offenseRating: row.offenseRating, offenseRank: row.offenseRank,
        defenseRating: row.defenseRating, defenseRank: row.defenseRank,
      });
      expect(selectDivisionRating(row, "2026Only")).toEqual({
        rating: row.performanceRating, rank: row.performanceRank,
        offenseRating: row.performanceOffenseRating, offenseRank: row.performanceOffenseRank,
        defenseRating: row.performanceDefenseRating, defenseRank: row.performanceDefenseRank,
      });
      expect(row).toEqual(before);
    }
  });

  it("shows N/A for a team with zero live games, without substituting preseason", () => {
    const row = { ...week3Rows[0], gamesPlayed: 0, performanceRating: null };
    expect(selectDivisionRating(row, "2026Only")).toBeNull();
    expect(selectDivisionRating(row, "auto")?.rating).toBe(53.695);
  });
});

describe("deltaTone", () => {
  it("classifies positive, negative and zero", () => {
    expect(deltaTone(2.5)).toBe("positive");
    expect(deltaTone(-1.0)).toBe("negative");
    expect(deltaTone(0)).toBe("neutral");
  });
});

describe("formatSignedDelta", () => {
  it("formats a leading + for positive values", () => {
    expect(formatSignedDelta(2.5)).toBe("+2.5");
  });
  it("keeps the existing minus for negative values", () => {
    expect(formatSignedDelta(-1)).toBe("-1.0");
  });
  it("formats zero without a sign", () => {
    expect(formatSignedDelta(0)).toBe("0.0");
  });
});

describe("sosTone", () => {
  it("bands 1-8 as hard", () => {
    expect(sosTone(1)).toBe("hard");
    expect(sosTone(8)).toBe("hard");
  });
  it("bands 9-24 as middle", () => {
    expect(sosTone(9)).toBe("middle");
    expect(sosTone(24)).toBe("middle");
  });
  it("bands 25-32 as easy", () => {
    expect(sosTone(25)).toBe("easy");
    expect(sosTone(32)).toBe("easy");
  });
});

describe("sortTeamsByProjectedRating", () => {
  const teams = [
    { abbr: "a", name: "Team A" },
    { abbr: "b", name: "Team B" },
    { abbr: "c", name: "Team C" },
  ];

  it("orders by rating2026 descending", () => {
    const projection = new Map([
      ["a", { rating2026: 50 }],
      ["b", { rating2026: 80 }],
      ["c", { rating2026: 65 }],
    ]);
    expect(sortTeamsByProjectedRating(teams, projection).map((t) => t.abbr)).toEqual(["b", "c", "a"]);
  });

  it("sorts teams with a missing projection to the end instead of crashing", () => {
    const projection = new Map([
      ["a", { rating2026: 50 }],
      ["c", { rating2026: 65 }],
    ]);
    const sorted = sortTeamsByProjectedRating(teams, projection);
    expect(sorted.map((t) => t.abbr)).toEqual(["c", "a", "b"]);
  });

  it("never uses a legacy ranking value — sort output only depends on the provided projection map", () => {
    const projectionA = new Map([
      ["a", { rating2026: 10 }],
      ["b", { rating2026: 20 }],
      ["c", { rating2026: 30 }],
    ]);
    expect(sortTeamsByProjectedRating(teams, projectionA).map((t) => t.abbr)).toEqual(["c", "b", "a"]);
  });
});

describe("standingsDisplayMode", () => {
  it("shows preseasonProjection only for the current season with zero completed games", () => {
    expect(standingsDisplayMode(true, false)).toBe("preseasonProjection");
  });
  it("shows actualStandings for the current season once games are completed", () => {
    expect(standingsDisplayMode(true, true)).toBe("actualStandings");
  });
  it("shows actualStandings for a historical season regardless of completed-games count", () => {
    expect(standingsDisplayMode(false, false)).toBe("actualStandings");
    expect(standingsDisplayMode(false, true)).toBe("actualStandings");
  });
});

describe("resolveDivisionBoardMode", () => {
  it("auto defaults to preseasonProjection with 0 completed games", () => {
    expect(resolveDivisionBoardMode("auto", true, false)).toBe("preseasonProjection");
  });

  it("auto switches to inSeasonCurrent once at least one game is completed", () => {
    expect(resolveDivisionBoardMode("auto", true, true)).toBe("inSeasonCurrent");
  });

  it("manual preseason override always shows the preseason board, even mid-season", () => {
    expect(resolveDivisionBoardMode("preseason", true, true)).toBe("preseasonProjection");
    expect(resolveDivisionBoardMode("preseason", true, false)).toBe("preseasonProjection");
  });

  it("manual 2026 Only override shows the in-season layout even before Week 1", () => {
    expect(resolveDivisionBoardMode("2026Only", true, false)).toBe("inSeasonCurrent");
  });

  it("ignores the view mode entirely for a historical season", () => {
    expect(resolveDivisionBoardMode("2026Only", false, false)).toBe("historicalStandings");
    expect(resolveDivisionBoardMode("preseason", false, true)).toBe("historicalStandings");
    expect(resolveDivisionBoardMode("auto", false, true)).toBe("historicalStandings");
  });
});
