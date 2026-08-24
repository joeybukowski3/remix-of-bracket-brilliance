import { describe, expect, it } from "vitest";
import { computeOpponentAdjustedPerformance } from "../../pipeline/opponentAdjustment";
import type { CfbTeamGamePerformance } from "../../pipeline/types";
import { computeIterativeAdjustment } from "./iterativeAdjustment";
import type { GameObservation } from "./types";

const TEAMS = ["A", "B", "C", "D", "E"];

// Small round-robin-ish slate so every team has >=2 games.
const RAW_GAMES: Array<{ gameId: string; team: string; opponent: string; teamYpp: number; oppYpp: number }> = [
  { gameId: "g1", team: "A", opponent: "B", teamYpp: 6.0, oppYpp: 4.5 },
  { gameId: "g1", team: "B", opponent: "A", teamYpp: 4.5, oppYpp: 6.0 },
  { gameId: "g2", team: "C", opponent: "D", teamYpp: 5.0, oppYpp: 5.5 },
  { gameId: "g2", team: "D", opponent: "C", teamYpp: 5.5, oppYpp: 5.0 },
  { gameId: "g3", team: "A", opponent: "C", teamYpp: 5.8, oppYpp: 4.9 },
  { gameId: "g3", team: "C", opponent: "A", teamYpp: 4.9, oppYpp: 5.8 },
  { gameId: "g4", team: "B", opponent: "D", teamYpp: 6.2, oppYpp: 3.9 },
  { gameId: "g4", team: "D", opponent: "B", teamYpp: 3.9, oppYpp: 6.2 },
  { gameId: "g5", team: "E", opponent: "A", teamYpp: 4.0, oppYpp: 6.5 },
  { gameId: "g5", team: "A", opponent: "E", teamYpp: 6.5, oppYpp: 4.0 },
];

function toProductionPerformance(): CfbTeamGamePerformance[] {
  return RAW_GAMES.map((row) => ({
    gameId: row.gameId,
    teamId: row.team,
    teamClassification: "fbs",
    opponentTeamId: row.opponent,
    opponentClassification: "fbs",
    points: null,
    pointsAllowed: null,
    plays: null,
    totalYards: null,
    yardsPerPlay: row.teamYpp,
    yardsPerPlayAllowed: row.oppYpp,
    turnovers: null,
  }));
}

function toObservations(): GameObservation[] {
  return RAW_GAMES.map((row) => ({
    gameId: row.gameId,
    season: 2019,
    week: 1,
    teamExternalId: row.team,
    opponentExternalId: row.opponent,
    teamClassification: "fbs",
    opponentClassification: "fbs",
    isHome: true,
    isNeutral: false,
    offenseValue: row.teamYpp,
    defenseAllowedValue: row.oppYpp,
    weight: 1,
    actualTeamScore: null,
    actualOpponentScore: null,
  }));
}

describe("computeIterativeAdjustment — parity with production opponentAdjustment.ts", () => {
  it("matches production's offense/defense values under strength=0.20, iterations=6, minimumGames=1 (gameWeighted)", () => {
    const production = computeOpponentAdjustedPerformance(TEAMS, toProductionPerformance(), {
      opponentAdjustmentIterations: 6,
      opponentAdjustmentStrength: 0.2,
      minimumGames: 1,
    });
    const research = computeIterativeAdjustment(TEAMS, toObservations(), {
      strength: 0.2,
      iterations: 6,
      minimumGames: 1,
    });

    for (const team of TEAMS) {
      const prod = production.adjusted.find((t) => t.teamId === team)!;
      const res = research.teams.find((t) => t.teamExternalId === team)!;
      expect(res.offense).not.toBeNull();
      expect(res.offense!).toBeCloseTo(prod.opponentAdjustedOffensiveEfficiency!, 10);
      // production returns defense in "allowed" units (lower=better); research returns higher=better.
      // leagueMean - allowed should equal (research.defense - leagueMean) by construction.
      const leagueMean = research.leagueMean!;
      expect(leagueMean - prod.opponentAdjustedDefensiveEfficiency!).toBeCloseTo(res.defense! - leagueMean, 10);
    }
  });
});

describe("computeIterativeAdjustment — general behavior", () => {
  it("gates sparse teams (below minimumGames) to null", () => {
    const observations = toObservations().filter((o) => o.teamExternalId !== "E" && o.opponentExternalId !== "E");
    const result = computeIterativeAdjustment(["A", "B", "C", "D", "E"], observations, {
      strength: 0.2,
      iterations: 6,
      minimumGames: 1,
    });
    const eTeam = result.teams.find((t) => t.teamExternalId === "E")!;
    expect(eTeam.offense).toBeNull();
    expect(eTeam.gamesCount).toBe(0);
  });

  it("excludes FBS-vs-FCS observations from the network", () => {
    const observations: GameObservation[] = [
      ...toObservations(),
      {
        gameId: "gfcs",
        season: 2019,
        week: 1,
        teamExternalId: "A",
        opponentExternalId: "FCSTeam",
        teamClassification: "fbs",
        opponentClassification: "fcs",
        isHome: true,
        isNeutral: false,
        offenseValue: 15,
        defenseAllowedValue: 1,
        weight: 1,
        actualTeamScore: null,
        actualOpponentScore: null,
      },
    ];
    const withFcs = computeIterativeAdjustment(TEAMS, observations, { strength: 0.2, iterations: 6, minimumGames: 1 });
    const withoutFcs = computeIterativeAdjustment(TEAMS, toObservations(), { strength: 0.2, iterations: 6, minimumGames: 1 });
    const aWithFcs = withFcs.teams.find((t) => t.teamExternalId === "A")!;
    const aWithoutFcs = withoutFcs.teams.find((t) => t.teamExternalId === "A")!;
    expect(aWithFcs.offense).toBeCloseTo(aWithoutFcs.offense!, 10);
  });
});
