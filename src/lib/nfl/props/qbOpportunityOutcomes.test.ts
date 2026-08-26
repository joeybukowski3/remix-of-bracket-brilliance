import { describe, expect, it } from "vitest";
import { buildQbOpportunityOutcomes, indexTeamDropbacks } from "./qbOpportunityOutcomes";
import type { NflYardageOutcomeRow } from "./historicalOutcomes";
import type { NflTeamGamePlayVolumeRecord } from "./types/teamPregameFeatures";

function qbRow(overrides: Partial<NflYardageOutcomeRow["context"]> & { passAttempts: number }): NflYardageOutcomeRow {
  return {
    schemaVersion: "nfl-yardage-outcome-row-v1",
    outcomeSchemaVersion: "nfl-yardage-outcome-v1",
    context: {
      schemaVersion: "nfl-prop-player-game-context-v1",
      season: 2025, week: 1, gameId: "2025_01_PHI_DAL", playerId: "gsis:starter",
      playerName: "Starter QB", team: "phi", opponent: "dal", position: "QB",
      homeAway: "home", gameDateUtc: "2025-09-05T00:00:00.000Z",
      spread: null, total: null, impliedTeamTotal: null, availabilityStatus: null,
      ...overrides,
    },
    outcomes: {
      passAttempts: overrides.passAttempts, passingYards: null, carries: null, rushingYards: null,
      targets: null, receptions: null, receivingYards: null,
    },
    provenance: { source: "nflverse stats_player weekly", sourceSeason: 2025, sourceWeek: 1, gameContextSource: null },
  };
}

function dropbacks(overrides: Partial<NflTeamGamePlayVolumeRecord> = {}): NflTeamGamePlayVolumeRecord {
  return {
    gameId: "2025_01_PHI_DAL", season: 2025, week: 1, team: "phi", opponent: "dal",
    eligiblePlays: 60, passPlays: 35, rushPlays: 25,
    neutralEligiblePlays: 20, neutralPassPlays: 10, passOeSum: 0, passOeCount: 60,
    ...overrides,
  };
}

describe("buildQbOpportunityOutcomes", () => {
  it("a single-QB team-week resolves to singleQbGame with a 1.0 attempt share", () => {
    const rows = [qbRow({ passAttempts: 30 })];
    const index = indexTeamDropbacks([dropbacks()]);
    const result = buildQbOpportunityOutcomes(rows, index);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      primaryQbPlayerId: "gsis:starter",
      primaryQbAttempts: 30,
      backupQbAttempts: 0,
      qbCountThisWeek: 1,
      instabilityCategory: "singleQbGame",
      primaryQbAttemptShare: 1,
    });
  });

  it("a multi-QB team-week picks the higher-attempts QB as primary and flags multiQbGame", () => {
    const rows = [
      qbRow({ passAttempts: 22, playerId: "gsis:starter" }),
      qbRow({ passAttempts: 8, playerId: "gsis:backup", playerName: "Backup QB" }),
    ];
    const index = indexTeamDropbacks([dropbacks()]);
    const result = buildQbOpportunityOutcomes(rows, index);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      primaryQbPlayerId: "gsis:starter",
      primaryQbAttempts: 22,
      backupQbAttempts: 8,
      qbCountThisWeek: 2,
      instabilityCategory: "multiQbGame",
    });
    expect(result[0].primaryQbAttemptShare).toBeCloseTo(22 / 30, 10);
  });

  it("breaks an exact attempts tie deterministically by playerId order", () => {
    const rows = [
      qbRow({ passAttempts: 15, playerId: "gsis:zzz" }),
      qbRow({ passAttempts: 15, playerId: "gsis:aaa" }),
    ];
    const index = indexTeamDropbacks([dropbacks()]);
    const a = buildQbOpportunityOutcomes(rows, index);
    const b = buildQbOpportunityOutcomes([rows[1], rows[0]], index); // reversed input order
    expect(a[0].primaryQbPlayerId).toBe("gsis:aaa");
    expect(b[0].primaryQbPlayerId).toBe("gsis:aaa");
    expect(a).toEqual(b);
  });

  it("excludes a QB row with zero attempts (e.g. a kneel-only holder/emergency QB) from the group entirely", () => {
    const rows = [qbRow({ passAttempts: 25 }), qbRow({ passAttempts: 0, playerId: "gsis:emergency" })];
    const index = indexTeamDropbacks([dropbacks()]);
    const result = buildQbOpportunityOutcomes(rows, index);
    expect(result[0].qbCountThisWeek).toBe(1);
    expect(result[0].instabilityCategory).toBe("singleQbGame");
  });

  it("team dropbacks context is >= the primary QB's own attempts (a real logical bound: dropbacks include sacks/scrambles beyond pass attempts)", () => {
    const rows = [qbRow({ passAttempts: 30 })];
    const index = indexTeamDropbacks([dropbacks({ passPlays: 34 })]); // dropbacks = attempts(30) + sacks(4), plausible
    const result = buildQbOpportunityOutcomes(rows, index);
    expect(result[0].teamDropbacksContext).toBe(34);
    expect(result[0].teamDropbacksContext!).toBeGreaterThanOrEqual(result[0].primaryQbAttempts);
  });

  it("leaves teamDropbacksContext null when no compact play-volume record matches the game/team", () => {
    const rows = [qbRow({ passAttempts: 30 })];
    const result = buildQbOpportunityOutcomes(rows, new Map());
    expect(result[0].teamDropbacksContext).toBeNull();
  });

  it("is deterministic: identical input produces a deep-equal result", () => {
    const rows = [qbRow({ passAttempts: 22, playerId: "gsis:starter" }), qbRow({ passAttempts: 8, playerId: "gsis:backup" })];
    const index = indexTeamDropbacks([dropbacks()]);
    expect(buildQbOpportunityOutcomes(rows, index)).toEqual(buildQbOpportunityOutcomes(rows, index));
  });

  it("never groups rows from different team-weeks together", () => {
    const rows = [
      qbRow({ passAttempts: 22, week: 1 }),
      qbRow({ passAttempts: 25, week: 2, gameId: "2025_02_PHI_KC" }),
    ];
    const result = buildQbOpportunityOutcomes(rows, new Map());
    expect(result).toHaveLength(2);
  });
});
