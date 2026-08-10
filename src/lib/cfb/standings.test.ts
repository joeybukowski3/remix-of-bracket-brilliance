import { describe, expect, it } from "vitest";
import type { CfbTeam } from "@/data/cfb/types";
import { sortConferenceStandings, isPreseasonConferenceRecords, toStandingRow } from "./standings";

function makeTeam(
  id: string,
  name: string,
  power: number,
  confW: number,
  confL: number,
  w = confW,
  l = confL,
): CfbTeam {
  return {
    id,
    slug: id,
    name,
    shortName: name,
    abbreviation: id.toUpperCase().slice(0, 4),
    mascot: "Tigers",
    conference: "sec",
    espnId: 1,
    primaryColor: "#000",
    secondaryColor: "#fff",
    logo: null as unknown as string,
    ratings: {
      teamId: id,
      jkbRank: null,
      previousJkbRank: null,
      jkbPowerRating: power,
      offensiveRating: power,
      defensiveRating: power,
      sosPlayedRating: null,
      sosPlayedRank: null,
      sosRemainingRating: 70,
      sosRemainingRank: 10,
    },
    record: {
      teamId: id,
      wins: w,
      losses: l,
      ties: 0,
      conferenceWins: confW,
      conferenceLosses: confL,
      conferenceTies: 0,
      atsWins: null,
      atsLosses: null,
      overs: null,
      unders: null,
    },
    context: {
      teamId: id,
      headCoach: null,
      headCoachYear: null,
      startingQuarterback: null,
      returningQuarterback: null,
      returningOffensiveStarters: null,
      returningDefensiveStarters: null,
    },
    stats: {
      teamId: id,
      pointsPerGame: null,
      yardsPerPlay: null,
      rushYardsPerGame: null,
      yardsPerRush: null,
      passYardsPerGame: null,
      yardsPerPass: null,
      turnovers: null,
      pointsAllowedPerGame: null,
      yardsPerPlayAllowed: null,
      rushYardsAllowedPerGame: null,
      yardsPerRushAllowed: null,
      passYardsAllowedPerGame: null,
      yardsPerPassAllowed: null,
      takeaways: null,
    },
  };
}

describe("conference standings", () => {
  it("falls back to JKB power rating in preseason (all 0-0)", () => {
    const teams = [
      makeTeam("b", "Beta", 80, 0, 0),
      makeTeam("a", "Alpha", 95, 0, 0),
      makeTeam("c", "Charlie", 88, 0, 0),
    ];
    const rows = teams.map(toStandingRow);
    expect(isPreseasonConferenceRecords(rows)).toBe(true);

    const sorted = sortConferenceStandings(teams);
    expect(sorted.map((t) => t.id)).toEqual(["a", "c", "b"]);
  });

  it("prioritizes conference record in-season over power rating", () => {
    const teams = [
      makeTeam("power", "Powerhouse", 99, 1, 2, 4, 2),
      makeTeam("leader", "Leader", 85, 3, 0, 5, 1),
      makeTeam("mid", "Middling", 90, 2, 1, 4, 2),
    ];
    const sorted = sortConferenceStandings(teams);
    expect(sorted.map((t) => t.id)).toEqual(["leader", "mid", "power"]);
  });

  it("uses conference wins as secondary sort when win% ties", () => {
    // 2-1 and 1-0.5 not available; 2-2 (0.5) vs 1-1 (0.5) — more conf wins first
    const teams = [
      makeTeam("one", "One Win", 90, 1, 1, 3, 3),
      makeTeam("two", "Two Wins", 80, 2, 2, 4, 4),
    ];
    const sorted = sortConferenceStandings(teams);
    expect(sorted[0].id).toBe("two");
  });
});
