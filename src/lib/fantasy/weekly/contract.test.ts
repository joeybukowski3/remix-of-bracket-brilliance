import { parseWeeklyFantasyModelInput } from "@/lib/fantasy/weekly/contract";
import { normalizeWeeklyUsage } from "@/lib/fantasy/weekly/usage";

export function validWeeklyInput() {
  return {
    schemaVersion: "weekly-fantasy-model-input-v1" as const,
    season: 2026,
    week: 1,
    scoringFormat: "PPR" as const,
    scoringVersion: "jkb-full-ppr-v1.0.0" as const,
    player: {
      playerId: "gsis:00-0039999", playerName: "Fixture Player", position: "WR" as const,
      externalIds: { gsis: "00-0039999", pfr: "FixtPl00", espn: "12345" }, starterStatus: "unknown" as const,
    },
    team: "buf", opponent: "mia", homeAway: "home" as const, baselineProjectedPpg: 16.5,
    market: { homeSpread: -3, total: 47, impliedTeamTotal: 25, sourceAsOf: "2026-09-01T12:00:00.000Z" },
    usage: normalizeWeeklyUsage({ targets: 8, targetShare: 0.24 }),
    availability: {
      status: "active" as const, practiceStatus: null, sourceSeason: 2026, sourceWeek: 1,
      sourceAsOf: "2026-09-01T12:00:00.000Z", isStale: false,
    },
    matchup: { grade: "Good" as const, fpaSeason: 2025, fpaRank: 8, fantasyPointsAllowed: 22.1 },
    teamContext: {
      offensiveEpaPerPlay: null, defensiveEpaPerPlayAllowed: null,
      offensiveSuccessRate: null, defensiveSuccessRateAllowed: null, paceRank: null,
    },
    provenance: [{
      fieldGroup: "identity", source: "nflverse", sourceSeason: 2026, sourceWeek: 1,
      sourceAsOf: "2026-09-01T12:00:00.000Z", generatedAt: "2026-09-01T13:00:00.000Z",
      schemaVersion: "weekly-roster-v1",
    }],
    missingInputs: [], staleInputs: [],
  };
}

describe("weekly fantasy model input contract", () => {
  it("accepts a normalized row without a score or rank", () => {
    const parsed = parseWeeklyFantasyModelInput(validWeeklyInput());
    expect(parsed.player.playerId).toBe("gsis:00-0039999");
    expect(parsed).not.toHaveProperty("weeklyScore");
    expect(parsed).not.toHaveProperty("positionRank");
  });

  it("rejects malformed or extra authority fields", () => {
    expect(() => parseWeeklyFantasyModelInput({ ...validWeeklyInput(), weeklyScore: 80 })).toThrow();
    expect(() => parseWeeklyFantasyModelInput({ ...validWeeklyInput(), week: 0 })).toThrow();
    expect(() => parseWeeklyFantasyModelInput({
      ...validWeeklyInput(), player: { ...validWeeklyInput().player, playerId: "name:fixture" },
    })).toThrow();
  });

  it("rejects scheduled rows without an opponent and byes with one", () => {
    expect(() => parseWeeklyFantasyModelInput({ ...validWeeklyInput(), opponent: null })).toThrow();
    expect(() => parseWeeklyFantasyModelInput({ ...validWeeklyInput(), homeAway: "bye", opponent: "mia" })).toThrow();
  });
});
