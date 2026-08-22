import { describe, expect, it } from "vitest";
import { computeRidgeAdjustment } from "./ridgeAdjustment";
import type { GameObservation } from "./types";

const TEAMS = ["A", "B", "C", "D"];

function obs(gameId: string, team: string, opponent: string, teamValue: number, oppValue: number, isHome: boolean): GameObservation {
  return {
    gameId,
    season: 2019,
    week: 1,
    teamExternalId: team,
    opponentExternalId: opponent,
    teamClassification: "fbs",
    opponentClassification: "fbs",
    isHome,
    isNeutral: false,
    offenseValue: teamValue,
    defenseAllowedValue: oppValue,
    weight: 1,
    actualTeamScore: null,
    actualOpponentScore: null,
  };
}

const OBSERVATIONS: GameObservation[] = [
  obs("g1", "A", "B", 6.0, 4.5, true),
  obs("g1", "B", "A", 4.5, 6.0, false),
  obs("g2", "C", "D", 5.0, 5.5, true),
  obs("g2", "D", "C", 5.5, 5.0, false),
  obs("g3", "A", "C", 5.8, 4.9, true),
  obs("g3", "C", "A", 4.9, 5.8, false),
  obs("g4", "B", "D", 6.2, 3.9, true),
  obs("g4", "D", "B", 3.9, 6.2, false),
];

describe("computeRidgeAdjustment", () => {
  it("ranks the strongest offense (A, high YPP against varied opponents) above the weakest", () => {
    const result = computeRidgeAdjustment(TEAMS, OBSERVATIONS, { lambda: 2, includeHfa: true });
    const a = result.teams.find((t) => t.teamExternalId === "A")!;
    const d = result.teams.find((t) => t.teamExternalId === "D")!;
    expect(a.offense).not.toBeNull();
    expect(a.offense!).toBeGreaterThan(d.offense!);
  });

  it("shrinks toward league mean as lambda increases", () => {
    const low = computeRidgeAdjustment(TEAMS, OBSERVATIONS, { lambda: 0.1, includeHfa: true });
    const high = computeRidgeAdjustment(TEAMS, OBSERVATIONS, { lambda: 100, includeHfa: true });
    const spread = (result: typeof low) => {
      const values = result.teams.map((t) => t.offense).filter((v): v is number => v !== null);
      return Math.max(...values) - Math.min(...values);
    };
    expect(spread(high)).toBeLessThan(spread(low));
  });

  it("returns null ratings when there are no eligible observations", () => {
    const result = computeRidgeAdjustment(TEAMS, [], { lambda: 2, includeHfa: true });
    expect(result.teams.every((t) => t.offense === null)).toBe(true);
    expect(result.leagueMean).toBeNull();
  });

  it("offense and defense are each centered around the league mean", () => {
    const result = computeRidgeAdjustment(TEAMS, OBSERVATIONS, { lambda: 2, includeHfa: true });
    const offenseValues = result.teams.map((t) => t.offense!).filter((v) => Number.isFinite(v));
    const avg = offenseValues.reduce((s, v) => s + v, 0) / offenseValues.length;
    expect(avg).toBeCloseTo(result.leagueMean!, 5);
  });
});
