import { describe, expect, it } from "vitest";
import { computeRidgeAdjustment } from "../phase2/ridgeAdjustment";
import { computeRidgeAdjustmentWithPrior } from "./ridgeWithPrior";
import type { GameObservation } from "../phase2/types";

const TEAMS = ["A", "B", "SPARSE"];

function obs(gameId: string, team: string, opponent: string, teamValue: number, oppValue: number): GameObservation {
  return {
    gameId, season: 2020, week: 1,
    teamExternalId: team, opponentExternalId: opponent,
    teamClassification: "fbs", opponentClassification: "fbs",
    isHome: true, isNeutral: false,
    offenseValue: teamValue, defenseAllowedValue: oppValue,
    weight: 1, actualTeamScore: null, actualOpponentScore: null,
  };
}

// SPARSE plays exactly once, with a value near league average — its ridge
// estimate should therefore land close to whatever it's centered on.
const OBSERVATIONS: GameObservation[] = [
  obs("g1", "A", "B", 7.0, 4.0),
  obs("g1", "B", "A", 4.0, 7.0),
  obs("g2", "SPARSE", "A", 5.5, 5.5),
  obs("g2", "A", "SPARSE", 5.5, 5.5),
];

describe("computeRidgeAdjustmentWithPrior", () => {
  it("with no priors supplied (empty maps), matches ordinary ridge closely", () => {
    const plain = computeRidgeAdjustment(TEAMS, OBSERVATIONS, { lambda: 5, includeHfa: true });
    const withEmptyPrior = computeRidgeAdjustmentWithPrior(TEAMS, OBSERVATIONS, { lambda: 5, includeHfa: true }, new Map(), new Map());
    const a1 = plain.teams.find((t) => t.teamExternalId === "A")!.offense!;
    const a2 = withEmptyPrior.teams.find((t) => t.teamExternalId === "A")!.offense!;
    expect(a1).toBeCloseTo(a2, 5);
  });

  it("a higher prior for the same sparse team pulls its fitted offense higher, under a strong penalty", () => {
    // Every team gets an individualized prior here (the realistic Phase 3
    // shape) so the shared re-centering step doesn't get skewed by a
    // single outlier prior, which is what a lone-nonzero-prior toy case
    // would otherwise conflate.
    const basePriors = new Map([["A", 0], ["B", 0]]);
    const lowPrior = new Map([...basePriors, ["SPARSE", -5.0]]);
    const highPrior = new Map([...basePriors, ["SPARSE", 5.0]]);

    const withLowPrior = computeRidgeAdjustmentWithPrior(TEAMS, OBSERVATIONS, { lambda: 30, includeHfa: true }, lowPrior, new Map());
    const withHighPrior = computeRidgeAdjustmentWithPrior(TEAMS, OBSERVATIONS, { lambda: 30, includeHfa: true }, highPrior, new Map());

    const sparseLow = withLowPrior.teams.find((t) => t.teamExternalId === "SPARSE")!.offense!;
    const sparseHigh = withHighPrior.teams.find((t) => t.teamExternalId === "SPARSE")!.offense!;
    expect(sparseHigh).toBeGreaterThan(sparseLow);
  });

  it("returns null ratings when there are no eligible observations", () => {
    const result = computeRidgeAdjustmentWithPrior(TEAMS, [], { lambda: 5, includeHfa: true }, new Map(), new Map());
    expect(result.teams.every((t) => t.offense === null)).toBe(true);
  });
});
