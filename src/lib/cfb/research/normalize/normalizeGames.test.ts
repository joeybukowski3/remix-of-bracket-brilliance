import { describe, expect, it } from "vitest";
import type { CfbdResearchGameRaw } from "../types";
import { classifyResearchGame, normalizeResearchGames } from "./normalizeGames";

function makeGame(overrides: Partial<CfbdResearchGameRaw> = {}): CfbdResearchGameRaw {
  return {
    id: 401_127_235,
    season: 2019,
    week: 5,
    seasonType: "regular",
    startDate: "2019-09-26T23:30:00.000Z",
    startTimeTBD: false,
    completed: true,
    neutralSite: false,
    homeId: 2448,
    homeTeam: "Alabama",
    homeClassification: "fbs",
    homeConference: "SEC",
    homePoints: 37,
    awayId: 2169,
    awayTeam: "Duke",
    awayClassification: "fbs",
    awayConference: "ACC",
    awayPoints: 0,
    notes: null,
    playoff: null,
    ...overrides,
  };
}

describe("normalizeResearchGames", () => {
  it("preserves score state, ids, and classification for a completed game", () => {
    const [row] = normalizeResearchGames([makeGame()]);
    expect(row).toMatchObject({
      gameId: "401127235",
      season: 2019,
      week: 5,
      homeExternalId: "2448",
      awayExternalId: "2169",
      homeScore: 37,
      awayScore: 0,
      status: "final",
      gameType: "regular",
      homeConference: "SEC",
      awayConference: "ACC",
    });
  });

  it("resolves a known current team name to a JKB team id", () => {
    const [row] = normalizeResearchGames([makeGame({ homeTeam: "Alabama" })]);
    expect(row.homeTeamId).toBe("ala");
  });

  it("preserves external id with null jkbTeamId for an unmapped historical program name", () => {
    const [row] = normalizeResearchGames([makeGame({ awayTeam: "Idaho State" })]);
    expect(row.awayExternalId).toBe("2169");
    expect(row.awayTeamId).toBeNull();
  });

  it("derives scheduled/final status only from `completed` — never fabricates other states", () => {
    const [row] = normalizeResearchGames([makeGame({ completed: false, homePoints: null, awayPoints: null })]);
    expect(row.status).toBe("scheduled");
    expect(row.homeScore).toBeNull();
    expect(row.awayScore).toBeNull();
  });

  it("kickoffUtc is null when the CFBD start time is TBD", () => {
    const [row] = normalizeResearchGames([makeGame({ startTimeTBD: true })]);
    expect(row.kickoffUtc).toBeNull();
  });
});

describe("classifyResearchGame", () => {
  it("classifies playoff games by the playoff field", () => {
    expect(classifyResearchGame(makeGame({ seasonType: "postseason", playoff: { round: 1 } }))).toBe("playoff");
  });

  it("classifies conference championship games by notes", () => {
    expect(
      classifyResearchGame(makeGame({ seasonType: "postseason", notes: "SEC Championship Game" })),
    ).toBe("conference_championship");
  });

  it("classifies bowl games by notes", () => {
    expect(classifyResearchGame(makeGame({ seasonType: "postseason", notes: "Sugar Bowl" }))).toBe("bowl");
  });

  it("falls back to other_postseason for unrecognized postseason notes", () => {
    expect(classifyResearchGame(makeGame({ seasonType: "postseason", notes: null }))).toBe("other_postseason");
  });

  it("classifies regular season games as regular", () => {
    expect(classifyResearchGame(makeGame({ seasonType: "regular" }))).toBe("regular");
  });
});
