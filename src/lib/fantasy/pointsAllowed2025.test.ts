import { describe, expect, it } from "vitest";
import {
  POINTS_ALLOWED_2025,
  POINTS_ALLOWED_POSITIONS,
  POINTS_ALLOWED_TEAM_COUNT,
  getOpponentPointsAllowed,
  getPointsAllowedTeam,
  normalizeOpponentCode,
} from "@/lib/fantasy/pointsAllowed2025";
import { FANTASY_RANKINGS } from "@/lib/fantasy/rankings";

describe("points-allowed source", () => {
  it("parses all 32 defenses to canonical team codes", () => {
    expect(POINTS_ALLOWED_2025).toHaveLength(POINTS_ALLOWED_TEAM_COUNT);
    expect(new Set(POINTS_ALLOWED_2025.map((t) => t.abbr)).size).toBe(POINTS_ALLOWED_TEAM_COUNT);
  });

  it("holds a complete 1-32 ranking for every position", () => {
    for (const position of POINTS_ALLOWED_POSITIONS) {
      const ranks = POINTS_ALLOWED_2025.map((t) => t.byPosition[position].rank).sort((a, b) => a - b);
      expect(ranks).toEqual(Array.from({ length: POINTS_ALLOWED_TEAM_COUNT }, (_, i) => i + 1));
    }
  });

  it("ranks the defense allowing the most points as 1", () => {
    for (const position of POINTS_ALLOWED_POSITIONS) {
      const sorted = [...POINTS_ALLOWED_2025].sort(
        (a, b) => b.byPosition[position].pointsAllowed - a.byPosition[position].pointsAllowed,
      );
      expect(sorted[0].byPosition[position].rank).toBe(1);
      expect(sorted.at(-1)!.byPosition[position].rank).toBe(POINTS_ALLOWED_TEAM_COUNT);
    }
  });

  it("reads the supplied values verbatim", () => {
    // Dallas allowed the most QB points in 2025; Minnesota the fewest.
    expect(getPointsAllowedTeam("dal")?.byPosition.QB).toEqual({ rank: 1, pointsAllowed: 23.9 });
    expect(getPointsAllowedTeam("min")?.byPosition.QB).toEqual({ rank: 32, pointsAllowed: 12.1 });
    expect(getPointsAllowedTeam("cin")?.byPosition.TE).toEqual({ rank: 1, pointsAllowed: 18.6 });
  });
});

describe("normalizeOpponentCode", () => {
  it("strips the away marker", () => {
    expect(normalizeOpponentCode("@KC")).toBe("kc");
    expect(normalizeOpponentCode("KC")).toBe("kc");
  });

  it("maps the workbook's divergent codes onto canonical ones", () => {
    expect(normalizeOpponentCode("LA")).toBe("lar");
    expect(normalizeOpponentCode("@WAS")).toBe("wsh");
  });

  it("returns undefined for missing or empty tokens", () => {
    expect(normalizeOpponentCode(undefined)).toBeUndefined();
    expect(normalizeOpponentCode("")).toBeUndefined();
    expect(normalizeOpponentCode("@")).toBeUndefined();
  });
});

describe("opponent resolution against the real schedule", () => {
  it("resolves every playoff-week opponent in the workbook", () => {
    const unresolved = new Set<string>();
    for (const row of FANTASY_RANKINGS.rows) {
      for (const token of [
        row.playoffWeek15Opponent,
        row.playoffWeek16Opponent,
        row.playoffWeek17Opponent,
      ]) {
        if (!token) continue;
        if (!getPointsAllowedTeam(normalizeOpponentCode(token))) unresolved.add(token);
      }
    }
    expect([...unresolved]).toEqual([]);
  });

  it("returns the opponent's value for the row's own position", () => {
    // Buffalo's W15 opponent is Chicago; CHI allowed the 3rd-most WR points.
    expect(getOpponentPointsAllowed("CHI", "WR")).toMatchObject({ rank: 3, pointsAllowed: 30.2 });
    // Same opponent, different position ranks differently.
    expect(getOpponentPointsAllowed("CHI", "QB")).toMatchObject({ rank: 5, pointsAllowed: 19.7 });
    expect(getOpponentPointsAllowed("CHI", "TE")).toMatchObject({ rank: 14, pointsAllowed: 10.7 });
  });

  it("returns undefined for an unknown opponent", () => {
    expect(getOpponentPointsAllowed("ZZZ", "WR")).toBeUndefined();
    expect(getOpponentPointsAllowed(undefined, "WR")).toBeUndefined();
  });
});
