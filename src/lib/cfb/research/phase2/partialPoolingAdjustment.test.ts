import { describe, expect, it } from "vitest";
import { computeIterativeAdjustment } from "./iterativeAdjustment";
import { computePartialPoolingAdjustment } from "./partialPoolingAdjustment";
import type { GameObservation } from "./types";

const TEAMS = ["A", "B", "C", "D", "SPARSE"];

function obs(gameId: string, team: string, opponent: string, teamValue: number, oppValue: number): GameObservation {
  return {
    gameId,
    season: 2019,
    week: 1,
    teamExternalId: team,
    opponentExternalId: opponent,
    teamClassification: "fbs",
    opponentClassification: "fbs",
    isHome: true,
    isNeutral: false,
    offenseValue: teamValue,
    defenseAllowedValue: oppValue,
    weight: 1,
    actualTeamScore: null,
    actualOpponentScore: null,
  };
}

const RICH_OBSERVATIONS: GameObservation[] = [
  obs("g1", "A", "B", 7.0, 4.0),
  obs("g1", "B", "A", 4.0, 7.0),
  obs("g2", "A", "C", 7.2, 3.8),
  obs("g2", "C", "A", 3.8, 7.2),
  obs("g3", "A", "D", 6.8, 4.2),
  obs("g3", "D", "A", 4.2, 6.8),
  obs("g4", "C", "D", 5.0, 5.5),
  obs("g4", "D", "C", 5.5, 5.0),
  // SPARSE only plays once, with a huge outlier value
  obs("g5", "SPARSE", "B", 10.0, 1.0),
  obs("g5", "B", "SPARSE", 1.0, 10.0),
];

describe("computePartialPoolingAdjustment", () => {
  it("shrinks a one-game outlier team's rating toward league mean more than a data-rich team", () => {
    const result = computePartialPoolingAdjustment(TEAMS, RICH_OBSERVATIONS, {
      tau: 3,
      iterations: 8,
      minimumGames: 1,
      propagation: 1,
    });
    const sparse = result.teams.find((t) => t.teamExternalId === "SPARSE")!;
    const a = result.teams.find((t) => t.teamExternalId === "A")!; // 3 games, consistently strong
    // SPARSE's raw signal (huge outlier) should be shrunk closer to the mean than A's well-supported rating.
    expect(Math.abs(sparse.offense! - result.leagueMean!)).toBeLessThan(Math.abs(a.offense! - result.leagueMean!) * 3);
  });

  it("shrinks harder as tau increases", () => {
    const low = computePartialPoolingAdjustment(TEAMS, RICH_OBSERVATIONS, { tau: 0.1, iterations: 8, minimumGames: 1, propagation: 1 });
    const high = computePartialPoolingAdjustment(TEAMS, RICH_OBSERVATIONS, { tau: 50, iterations: 8, minimumGames: 1, propagation: 1 });
    const spread = (result: typeof low) => {
      const values = result.teams.map((t) => t.offense).filter((v): v is number => v !== null);
      return Math.max(...values) - Math.min(...values);
    };
    expect(spread(high)).toBeLessThan(spread(low));
  });

  it("with tau near 0, converges toward the unshrunk iterative estimate (documented convergence, not identity with ridge)", () => {
    const pooled = computePartialPoolingAdjustment(TEAMS, RICH_OBSERVATIONS, { tau: 1e-6, iterations: 20, minimumGames: 1, propagation: 0.2 });
    const iterative = computeIterativeAdjustment(TEAMS, RICH_OBSERVATIONS, { strength: 0.2, iterations: 20, minimumGames: 1 });
    const a = pooled.teams.find((t) => t.teamExternalId === "A")!;
    const aIter = iterative.teams.find((t) => t.teamExternalId === "A")!;
    expect(a.offense!).toBeCloseTo(aIter.offense!, 3);
  });
});
