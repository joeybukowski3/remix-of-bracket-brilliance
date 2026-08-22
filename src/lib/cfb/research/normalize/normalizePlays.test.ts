import { describe, expect, it } from "vitest";
import type { CfbdResearchGameRaw, CfbdResearchPlayRaw } from "../types";
import { normalizeResearchPlays } from "./normalizePlays";

const GAME: CfbdResearchGameRaw = {
  id: 401_110_806,
  season: 2019,
  week: 5,
  seasonType: "regular",
  startDate: "2019-09-28T19:00:00.000Z",
  startTimeTBD: false,
  completed: true,
  neutralSite: false,
  homeId: 333,
  homeTeam: "Alabama",
  homeClassification: "fbs",
  homeConference: "SEC",
  homePoints: 59,
  awayId: 145,
  awayTeam: "Ole Miss",
  awayClassification: "fbs",
  awayConference: "SEC",
  awayPoints: 31,
  notes: null,
  playoff: null,
};

function makePlay(overrides: Partial<CfbdResearchPlayRaw> = {}): CfbdResearchPlayRaw {
  return {
    gameId: 401_110_806,
    driveId: "4011108063",
    id: "401110806101897901",
    driveNumber: 3,
    playNumber: 7,
    offense: "Ole Miss",
    offenseConference: "SEC",
    offenseScore: 7,
    defense: "Alabama",
    defenseConference: "SEC",
    defenseScore: 7,
    home: "Alabama",
    away: "Ole Miss",
    period: 1,
    clock: { minutes: 10, seconds: 20 },
    offenseTimeouts: 3,
    defenseTimeouts: 3,
    yardline: 1,
    yardsToGoal: 1,
    down: 3,
    distance: 1,
    yardsGained: 1,
    scoring: true,
    playType: "Rushing Touchdown",
    playText: "John Rhys Plumlee run for 1 yd for a TD",
    ppa: 2.45399822917955,
    wallclock: "2019-09-28T19:54:28.000Z",
    ...overrides,
  };
}

describe("normalizeResearchPlays", () => {
  it("resolves offense/defense external ids by matching names against the parent game", () => {
    const [row] = normalizeResearchPlays([makePlay()], [GAME], 2019, 5);
    expect(row.offenseExternalId).toBe("145");
    expect(row.defenseExternalId).toBe("333");
    expect(row.offenseTeamId).toBe("miss");
    expect(row.defenseTeamId).toBe("ala");
  });

  it("preserves providerPpa and score state exactly", () => {
    const [row] = normalizeResearchPlays([makePlay()], [GAME], 2019, 5);
    expect(row.providerPpa).toBeCloseTo(2.45399822917955);
    expect(row.offenseScore).toBe(7);
    expect(row.defenseScore).toBe(7);
    expect(row.providerScoringFlag).toBe(true);
  });

  it("always stores providerSuccess and providerGarbageTime as null (not returned by CFBD /plays)", () => {
    const [row] = normalizeResearchPlays([makePlay()], [GAME], 2019, 5);
    expect(row.providerSuccess).toBeNull();
    expect(row.providerGarbageTime).toBeNull();
  });

  it("does not drop garbage-time-looking plays (large score differential, late period)", () => {
    const rows = normalizeResearchPlays(
      [makePlay({ period: 4, offenseScore: 55, defenseScore: 3 })],
      [GAME],
      2019,
      5,
    );
    expect(rows).toHaveLength(1);
  });

  it("falls back to null external/team ids without fabricating a match when the game is unknown", () => {
    const [row] = normalizeResearchPlays([makePlay({ gameId: 999_999 })], [GAME], 2019, 5);
    expect(row.offenseExternalId).toBeNull();
    expect(row.defenseExternalId).toBeNull();
  });

  it("preserves raw offense/defense name strings for provenance", () => {
    const [row] = normalizeResearchPlays([makePlay()], [GAME], 2019, 5);
    expect(row.offenseName).toBe("Ole Miss");
    expect(row.defenseName).toBe("Alabama");
  });

  it("treats a non-finite ppa as null rather than propagating NaN", () => {
    const [row] = normalizeResearchPlays([makePlay({ ppa: Number.NaN })], [GAME], 2019, 5);
    expect(row.providerPpa).toBeNull();
  });

  it("handles missing clock/down/distance without throwing", () => {
    const [row] = normalizeResearchPlays(
      [makePlay({ clock: null, down: null, distance: null })],
      [GAME],
      2019,
      5,
    );
    expect(row.clockMinutes).toBeNull();
    expect(row.clockSeconds).toBeNull();
    expect(row.down).toBeNull();
    expect(row.distance).toBeNull();
  });
});
