import { describe, expect, it } from "vitest";
import { buildOverallRatings, buildSosBoard } from "@/lib/nfl/powerRatingsEfficiency";

describe("buildOverallRatings", () => {
  it("blends offense and inverted defense 50/50 and ranks by the unrounded blend", () => {
    // Team A: great offense, great (low) defense allowed -> best.
    // Team C: worst on both.
    const off = new Map<string, number>([["a", 0.3], ["b", 0.0], ["c", -0.3]]);
    const defAllowed = new Map<string, number>([["a", -0.2], ["b", 0.0], ["c", 0.2]]);

    const ratings = buildOverallRatings(off, defAllowed, { defenseLowerIsBetter: true });

    expect(ratings.get("a")?.rank).toBe(1);
    expect(ratings.get("c")?.rank).toBe(3);
    expect(ratings.get("b")?.value).toBeCloseTo(50, 5);
    expect(ratings.get("a")!.value).toBeGreaterThan(ratings.get("b")!.value);
    expect(ratings.get("c")!.value).toBeLessThan(ratings.get("b")!.value);
    // Clamped to the public scale.
    for (const rating of ratings.values()) {
      expect(rating!.value).toBeGreaterThanOrEqual(1);
      expect(rating!.value).toBeLessThanOrEqual(99);
    }
  });

  it("returns null (never zero) when a team is missing either side", () => {
    const off = new Map<string, number | null>([["a", 0.1], ["b", 0.2], ["c", null]]);
    const defAllowed = new Map<string, number | null>([["a", 0.1], ["b", null], ["c", 0.1]]);
    const ratings = buildOverallRatings(off, defAllowed, { defenseLowerIsBetter: true });
    expect(ratings.get("a")).not.toBeNull();
    expect(ratings.get("b")).toBeNull();
    expect(ratings.get("c")).toBeNull();
  });

  it("is deterministic under ties (broken by abbreviation)", () => {
    const off = new Map<string, number>([["z", 0.1], ["a", 0.1]]);
    const defAllowed = new Map<string, number>([["z", 0.1], ["a", 0.1]]);
    const ratings = buildOverallRatings(off, defAllowed, { defenseLowerIsBetter: true });
    expect(ratings.get("a")?.rank).toBe(1);
    expect(ratings.get("z")?.rank).toBe(2);
  });
});

describe("buildSosBoard", () => {
  it("averages period opponent EPA Overall ranks per game and ranks lowest-average hardest", () => {
    const epaRank = new Map<string, number>([
      ["opp1", 2], ["opp2", 8], ["opp3", 30], ["easy", 31],
    ]);
    const opponents = new Map<string, string[]>([
      ["hard", ["opp1", "opp2", "opp1"]], // faced opp1 twice -> counts twice: (2+8+2)/3 = 4
      ["soft", ["opp3", "easy"]], // (30+31)/2 = 30.5
    ]);
    const sos = buildSosBoard(epaRank, opponents);
    expect(sos.get("hard")?.avgOpponentRank).toBeCloseTo(4, 5);
    expect(sos.get("soft")?.avgOpponentRank).toBeCloseTo(30.5, 5);
    expect(sos.get("hard")?.rank).toBe(1);
    expect(sos.get("soft")?.rank).toBe(2);
  });

  it("excludes unresolvable opponents rather than zero-filling, and yields null with no rated games", () => {
    const epaRank = new Map<string, number>([["known", 5]]);
    const opponents = new Map<string, string[]>([
      ["partial", ["known", "unknown"]],
      ["blank", ["unknown", "unknown"]],
    ]);
    const sos = buildSosBoard(epaRank, opponents);
    expect(sos.get("partial")?.avgOpponentRank).toBe(5);
    expect(sos.get("partial")?.ratedGames).toBe(1);
    expect(sos.get("blank")).toBeNull();
  });
});
