import { describe, expect, it } from "vitest";
import { buildV2Observations, isFbsVsFbsObservation } from "./ratingInputs";
import type { CfbNormalizedHistoricalGame, CfbTeamGamePerformance } from "../../pipeline/types";

function game(overrides: Partial<CfbNormalizedHistoricalGame> = {}): CfbNormalizedHistoricalGame {
  return {
    gameId: "g1",
    season: 2026,
    week: 1,
    date: "2026-09-05",
    homeTeamId: "alpha",
    awayTeamId: "bravo",
    homeExternalOpponentId: null,
    awayExternalOpponentId: null,
    homeScore: 30,
    awayScore: 20,
    neutralSite: false,
    completed: true,
    status: "final",
    seasonType: "regular",
    gameType: "regular",
    homeClassification: "fbs",
    awayClassification: "fbs",
    includesFcsOpponent: false,
    ...overrides,
  };
}

function performance(overrides: Partial<CfbTeamGamePerformance> = {}): CfbTeamGamePerformance {
  return {
    gameId: "g1",
    teamId: "alpha",
    teamClassification: "fbs",
    opponentTeamId: "bravo",
    opponentClassification: "fbs",
    points: 30,
    pointsAllowed: 20,
    plays: 60,
    totalYards: 400,
    yardsPerPlay: 6.6,
    yardsPerPlayAllowed: 5.5,
    turnovers: 1,
    ...overrides,
  };
}

describe("buildV2Observations — YPP", () => {
  it("uses yardsPerPlay/yardsPerPlayAllowed directly, unaltered", () => {
    const home = performance();
    const away = performance({ teamId: "bravo", opponentTeamId: "alpha", points: 20, pointsAllowed: 30, plays: 58, yardsPerPlay: 5.5, yardsPerPlayAllowed: 6.6 });
    const obs = buildV2Observations([home, away], [game()], "ypp");
    const homeObs = obs.find((o) => o.teamId === "alpha")!;
    expect(homeObs.offenseValue).toBe(6.6);
    expect(homeObs.defenseAllowedValue).toBe(5.5); // opponent's own YPP
    expect(homeObs.weight).toBe(1); // gameWeighted
  });
});

describe("buildV2Observations — PPP", () => {
  it("computes points/plays for both offense and opponent's own PPP", () => {
    const home = performance({ points: 30, plays: 60 });
    const away = performance({ teamId: "bravo", opponentTeamId: "alpha", points: 20, plays: 50 });
    const obs = buildV2Observations([home, away], [game()], "ppp");
    const homeObs = obs.find((o) => o.teamId === "alpha")!;
    expect(homeObs.offenseValue).toBeCloseTo(30 / 60, 10);
    expect(homeObs.defenseAllowedValue).toBeCloseTo(20 / 50, 10); // opponent's own PPP, not the team's pointsAllowed/plays
  });

  it("returns null PPP when plays is missing or zero, never divides by zero", () => {
    const home = performance({ plays: null });
    const away = performance({ teamId: "bravo", opponentTeamId: "alpha", plays: 0 });
    const obs = buildV2Observations([home, away], [game()], "ppp");
    const homeObs = obs.find((o) => o.teamId === "alpha")!;
    expect(homeObs.offenseValue).toBeNull();
    expect(homeObs.defenseAllowedValue).toBeNull();
  });
});

describe("buildV2Observations — opponent join safety", () => {
  it("skips a row whose opponent side is missing from the performance array, never fabricates it", () => {
    const home = performance();
    const obs = buildV2Observations([home], [game()], "ypp"); // no "bravo" row supplied
    expect(obs).toHaveLength(0);
  });

  it("skips a row with no gameId match in games", () => {
    const home = performance();
    const away = performance({ teamId: "bravo", opponentTeamId: "alpha" });
    const obs = buildV2Observations([home, away], [], "ypp"); // empty games list
    expect(obs).toHaveLength(0);
  });
});

describe("isFbsVsFbsObservation", () => {
  it("is true only when both sides are fbs", () => {
    const fbsVsFbs = { teamClassification: "fbs", opponentClassification: "fbs" } as any;
    const fbsVsFcs = { teamClassification: "fbs", opponentClassification: "fcs" } as any;
    expect(isFbsVsFbsObservation(fbsVsFbs)).toBe(true);
    expect(isFbsVsFbsObservation(fbsVsFcs)).toBe(false);
  });
});
