import { describe, expect, it } from "vitest";
import { buildWeekGraphSnapshots } from "./scheduleGraph";
import type { CfbResearchGame } from "../types";

function game(overrides: Partial<CfbResearchGame>): CfbResearchGame {
  return {
    gameId: "g",
    season: 2022,
    week: 1,
    seasonType: "regular",
    kickoffUtc: null,
    homeExternalId: "A",
    awayExternalId: "B",
    homeTeamId: "A",
    awayTeamId: "B",
    homeConference: "X",
    awayConference: "X",
    homeClassification: "fbs",
    awayClassification: "fbs",
    neutralSite: false,
    homeScore: 20,
    awayScore: 10,
    status: "final",
    gameType: "regular",
    ...overrides,
  };
}

describe("buildWeekGraphSnapshots — leakage safety (Section 3/23/24)", () => {
  it("a team's own Week N game never appears in Week N's pregame graph", () => {
    const games: CfbResearchGame[] = [
      game({ gameId: "g1", week: 1, homeExternalId: "A", awayExternalId: "B" }),
      game({ gameId: "g2", week: 2, homeExternalId: "A", awayExternalId: "C" }),
    ];
    const teamConf = new Map([["A", "X"], ["B", "X"], ["C", "X"]]);
    const snapshots = buildWeekGraphSnapshots(2022, games, teamConf);

    const week1 = snapshots.find((s) => s.week === 1)!;
    expect(week1.byTeam.get("A")!.weightedDegree).toBe(0); // week 1's own game hasn't happened yet at week-1 cutoff

    const week2 = snapshots.find((s) => s.week === 2)!;
    expect(week2.byTeam.get("A")!.weightedDegree).toBe(1); // only week 1's game counted
    expect(week2.byTeam.get("A")!.uniqueOpponents).toBe(1);
  });

  it("adding a Week 3 game does not change Week 2's connectivity output", () => {
    const gamesWithoutFuture: CfbResearchGame[] = [game({ gameId: "g1", week: 1, homeExternalId: "A", awayExternalId: "B" })];
    const gamesWithFuture: CfbResearchGame[] = [
      ...gamesWithoutFuture,
      game({ gameId: "g2", week: 3, homeExternalId: "A", awayExternalId: "C" }),
    ];
    const teamConf = new Map([["A", "X"], ["B", "X"], ["C", "X"]]);

    // Week 2's pregame cutoff (games.week < 2) sees only g1 in BOTH inputs — g2 (week 3) must not leak in.
    const withoutFuture = buildWeekGraphSnapshots(2022, [...gamesWithoutFuture, game({ gameId: "gx", week: 2, homeExternalId: "A", awayExternalId: "C" })], teamConf).find((s) => s.week === 2)!;
    const withFuture = buildWeekGraphSnapshots(2022, [...gamesWithFuture, game({ gameId: "gx", week: 2, homeExternalId: "A", awayExternalId: "C" })], teamConf).find((s) => s.week === 2)!;

    expect(withFuture.byTeam.get("A")!.weightedDegree).toBe(withoutFuture.byTeam.get("A")!.weightedDegree);
    expect(withFuture.byTeam.get("A")!.componentSize).toBe(withoutFuture.byTeam.get("A")!.componentSize);
    expect(withFuture.byTeam.get("A")!.weightedDegree).toBe(1);
  });

  it("cross-conference opponent count only counts games completed before the cutoff", () => {
    const games: CfbResearchGame[] = [
      game({ gameId: "g1", week: 1, homeExternalId: "A", awayExternalId: "B", homeConference: "X", awayConference: "Y" }),
      game({ gameId: "g2", week: 3, homeExternalId: "A", awayExternalId: "C", homeConference: "X", awayConference: "Z" }),
    ];
    const teamConf = new Map([["A", "X"], ["B", "Y"], ["C", "Z"]]);
    const snapshots = buildWeekGraphSnapshots(2022, games, teamConf);
    // weeks list is the distinct set of GAME weeks (1 and 3 here) — week 3's cutoff (games.week < 3) sees only g1.
    const week3 = snapshots.find((s) => s.week === 3)!;
    expect(week3.byTeam.get("A")!.crossConferenceOpponents).toBe(1); // only g1 (week 1) counted, g2 (week 3, this same cutoff) not yet played
  });
});
