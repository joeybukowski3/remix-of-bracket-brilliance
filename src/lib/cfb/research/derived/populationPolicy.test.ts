import { describe, expect, it } from "vitest";
import type { CfbResearchGame } from "../types";
import { classifyMatchupPopulation, isFbsResearchPopulationGame, isFbsTeamClassification } from "./populationPolicy";

function makeGame(homeClassification: string | null, awayClassification: string | null): CfbResearchGame {
  return {
    gameId: "g1",
    season: 2022,
    week: 1,
    seasonType: "regular",
    kickoffUtc: null,
    homeExternalId: "1",
    awayExternalId: "2",
    homeTeamId: null,
    awayTeamId: null,
    homeConference: null,
    awayConference: null,
    homeClassification,
    awayClassification,
    neutralSite: false,
    homeScore: null,
    awayScore: null,
    status: "final",
    gameType: "regular",
  };
}

describe("classifyMatchupPopulation", () => {
  it("classifies fbs_vs_fbs, fbs_vs_fcs, fcs_vs_fbs, non_fbs_only, and unknown", () => {
    expect(classifyMatchupPopulation(makeGame("fbs", "fbs"))).toBe("fbs_vs_fbs");
    expect(classifyMatchupPopulation(makeGame("fbs", "fcs"))).toBe("fbs_vs_fcs");
    expect(classifyMatchupPopulation(makeGame("fcs", "fbs"))).toBe("fcs_vs_fbs");
    expect(classifyMatchupPopulation(makeGame("ii", "iii"))).toBe("non_fbs_only");
    expect(classifyMatchupPopulation(makeGame(null, "fbs"))).toBe("unknown");
  });

  it("is case-insensitive on classification strings", () => {
    expect(classifyMatchupPopulation(makeGame("FBS", "FBS"))).toBe("fbs_vs_fbs");
  });
});

describe("isFbsResearchPopulationGame", () => {
  it("is true whenever at least one side is FBS", () => {
    expect(isFbsResearchPopulationGame(makeGame("fbs", "fbs"))).toBe(true);
    expect(isFbsResearchPopulationGame(makeGame("fbs", "fcs"))).toBe(true);
    expect(isFbsResearchPopulationGame(makeGame("fcs", "fbs"))).toBe(true);
  });

  it("is false for D2/D3-only games — they must not contaminate FBS distributions", () => {
    expect(isFbsResearchPopulationGame(makeGame("ii", "iii"))).toBe(false);
    expect(isFbsResearchPopulationGame(makeGame("fcs", "fcs"))).toBe(false);
  });
});

describe("isFbsTeamClassification", () => {
  it("distinguishes a single team's classification", () => {
    expect(isFbsTeamClassification("fbs")).toBe(true);
    expect(isFbsTeamClassification("fcs")).toBe(false);
    expect(isFbsTeamClassification(null)).toBe(false);
  });
});
