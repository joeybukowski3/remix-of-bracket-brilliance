import { describe, expect, it } from "vitest";
import { aggregateGenericWindow, buildGenericIndex } from "./genericWindow";

describe("aggregateGenericWindow", () => {
  it("coalesces to season-prior, excluding the target game", () => {
    const entries = [
      { season: 2022, week: 5, numerator: 999, denominator: 1 }, // target game -- must be excluded
      { season: 2022, week: 1, numerator: 10, denominator: 2 },
      { season: 2022, week: 2, numerator: 20, denominator: 2 },
    ];
    const result = aggregateGenericWindow(entries, { season: 2022, week: 5 });
    expect(result.window).toBe("seasonPrior");
    expect(result.rate).toBeCloseTo(30 / 4, 6);
    expect(result.sampleGames).toBe(2);
  });

  it("falls back to prior season when no current-season history exists", () => {
    const entries = [{ season: 2021, week: 10, numerator: 5, denominator: 1 }];
    const result = aggregateGenericWindow(entries, { season: 2022, week: 1 });
    expect(result.window).toBe("priorSeason");
    expect(result.rate).toBe(5);
  });

  it("returns insufficient with a null rate when no history exists", () => {
    const result = aggregateGenericWindow([], { season: 2022, week: 1 });
    expect(result.window).toBe("insufficient");
    expect(result.rate).toBeNull();
  });
});

describe("buildGenericIndex", () => {
  it("indexes by both team and opponent so defense-allowed windows can reuse the same rows", () => {
    const rows = [{ season: 2022, week: 1, team: "buf", opponent: "mia", value: 40, plays: 60 }];
    const index = buildGenericIndex(rows, (r) => ({ numerator: r.value, denominator: r.plays }));
    expect(index.byTeam.get("buf")).toHaveLength(1);
    expect(index.byOpponent.get("mia")).toHaveLength(1);
    expect(index.byTeam.get("mia")).toBeUndefined();
  });
});
