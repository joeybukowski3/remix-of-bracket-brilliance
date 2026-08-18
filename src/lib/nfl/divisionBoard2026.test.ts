import { describe, expect, it } from "vitest";
import {
  deltaTone,
  formatSignedDelta,
  sortTeamsByProjectedRating,
  sosTone,
  standingsDisplayMode,
} from "@/lib/nfl/divisionBoard2026";

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
