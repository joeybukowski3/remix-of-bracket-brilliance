import { describe, expect, it } from "vitest";
import { buildQbPassingOutcomes, supplementalKey } from "./qbPassingOutcomes";
import type { NflYardageOutcomeRow } from "./historicalOutcomes";
import type { NflQbSupplementalStats } from "./qbPassingOutcomes";

function qbRow(overrides: Partial<NflYardageOutcomeRow["context"]> & { passAttempts: number; passingYards: number }): NflYardageOutcomeRow {
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
      passAttempts: overrides.passAttempts, passingYards: overrides.passingYards, carries: null, rushingYards: null,
      targets: null, receptions: null, receivingYards: null,
    },
    provenance: { source: "nflverse stats_player weekly", sourceSeason: 2025, sourceWeek: 1, gameContextSource: null },
  };
}

const supplemental = (completions: number, tds = 0, ints = 0): NflQbSupplementalStats => ({ completions, passingTds: tds, interceptions: ints });

describe("buildQbPassingOutcomes", () => {
  it("computes yards-per-attempt and keeps completions/TD/INT as diagnostics", () => {
    const rows = [qbRow({ passAttempts: 30, passingYards: 270 })];
    const supp = new Map([[supplementalKey("gsis:starter", 2025, 1), supplemental(20, 2, 1)]]);
    const result = buildQbPassingOutcomes(rows, new Map(), supp);
    expect(result[0]).toMatchObject({
      primaryQbAttempts: 30, primaryQbCompletions: 20, primaryQbPassingYards: 270,
      primaryQbYardsPerAttempt: 9, primaryQbPassingTds: 2, primaryQbInterceptions: 1,
    });
  });

  it("does NOT drop a multi-QB team-week (both QBs counted, primary by attempts)", () => {
    const rows = [
      qbRow({ passAttempts: 15, passingYards: 120, playerId: "gsis:starter" }),
      qbRow({ passAttempts: 20, passingYards: 210, playerId: "gsis:backup" }),
    ];
    const supp = new Map([
      [supplementalKey("gsis:starter", 2025, 1), supplemental(10)],
      [supplementalKey("gsis:backup", 2025, 1), supplemental(14)],
    ]);
    const result = buildQbPassingOutcomes(rows, new Map(), supp);
    expect(result).toHaveLength(1);
    expect(result[0].primaryQbPlayerId).toBe("gsis:backup"); // higher attempts wins primary
    expect(result[0].backupQbAttempts).toBe(15);
    expect(result[0].backupQbPassingYards).toBe(120);
    expect(result[0].instabilityCategory).toBe("multiQbGame");
    expect(result[0].qbCountThisWeek).toBe(2);
  });

  it("does NOT drop a poor-performance game (low yards, even negative)", () => {
    const rows = [qbRow({ passAttempts: 25, passingYards: -3 })];
    const supp = new Map([[supplementalKey("gsis:starter", 2025, 1), supplemental(8, 0, 4)]]);
    const result = buildQbPassingOutcomes(rows, new Map(), supp);
    expect(result).toHaveLength(1);
    expect(result[0].primaryQbPassingYards).toBe(-3);
    expect(result[0].primaryQbInterceptions).toBe(4);
  });

  it("throws when supplemental stats are missing for the resolved primary QB (never silently zero-fills)", () => {
    const rows = [qbRow({ passAttempts: 20, passingYards: 150 })];
    expect(() => buildQbPassingOutcomes(rows, new Map(), new Map())).toThrow(/Missing supplemental stats/);
  });
});
