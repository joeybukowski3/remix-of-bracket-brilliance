import { describe, expect, it } from "vitest";
import type { CfbdResearchGameRaw, CfbdResearchPlayRaw } from "../types";
import {
  auditPlayTeamIdentity,
  buildSeasonPlayTeamIdentityReport,
  countInconsistentMappings,
} from "./playTeamIdentityAudit";

const GAME: CfbdResearchGameRaw = {
  id: 1,
  season: 2019,
  week: 1,
  seasonType: "regular",
  startDate: "2019-09-01T00:00:00.000Z",
  startTimeTBD: false,
  completed: true,
  neutralSite: false,
  homeId: 100,
  homeTeam: "Alabama",
  awayId: 200,
  awayTeam: "Duke",
};

function play(overrides: Partial<CfbdResearchPlayRaw>): CfbdResearchPlayRaw {
  return {
    gameId: 1,
    id: "p1",
    offense: "Alabama",
    defense: "Duke",
    home: "Alabama",
    away: "Duke",
    ...overrides,
  };
}

describe("auditPlayTeamIdentity", () => {
  it("resolves a play whose offense/defense match the parent game's home/away names", () => {
    const [row] = auditPlayTeamIdentity([play({})], [GAME]);
    expect(row.status).toBe("resolved");
  });

  it("marks unresolved when offense or defense doesn't match either side", () => {
    const [row] = auditPlayTeamIdentity([play({ offense: "Some Other Team" })], [GAME]);
    expect(row.status).toBe("unresolved");
  });

  it("marks unresolved when the play references an unknown gameId", () => {
    const [row] = auditPlayTeamIdentity([play({ gameId: 999 })], [GAME]);
    expect(row.status).toBe("unresolved");
  });

  it("marks invalid_pairing when offense and defense resolve to the same side", () => {
    const [row] = auditPlayTeamIdentity([play({ offense: "Alabama", defense: "Alabama" })], [GAME]);
    expect(row.status).toBe("invalid_pairing");
  });

  it("marks ambiguous when the parent game's home and away names collide", () => {
    const degenerateGame: CfbdResearchGameRaw = { ...GAME, awayTeam: "Alabama" };
    const [row] = auditPlayTeamIdentity([play({})], [degenerateGame]);
    expect(row.status).toBe("ambiguous");
  });
});

describe("countInconsistentMappings", () => {
  it("is zero when the same raw name always resolves to the same external id within a game", () => {
    const plays = [play({ id: "p1" }), play({ id: "p2" })];
    expect(countInconsistentMappings(plays, [GAME])).toBe(0);
  });
});

describe("buildSeasonPlayTeamIdentityReport", () => {
  it("summarizes counts and resolution percentage", () => {
    const rows = auditPlayTeamIdentity(
      [play({ id: "p1" }), play({ id: "p2", offense: "Unknown Team" })],
      [GAME],
    );
    const report = buildSeasonPlayTeamIdentityReport(2019, rows, 0);
    expect(report).toMatchObject({
      season: 2019,
      totalPlays: 2,
      resolvedPlays: 1,
      unresolvedPlays: 1,
      ambiguousPlays: 0,
      invalidPairingPlays: 0,
      inconsistentMappingCount: 0,
      resolutionPct: 50,
    });
  });

  it("returns 0% resolution for an empty season without dividing by zero", () => {
    const report = buildSeasonPlayTeamIdentityReport(2019, [], 0);
    expect(report.resolutionPct).toBe(0);
  });
});
