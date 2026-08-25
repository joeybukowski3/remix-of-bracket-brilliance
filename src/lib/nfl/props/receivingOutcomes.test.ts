import { describe, expect, it } from "vitest";
import { buildReceivingOutcomesFromUniverse } from "./receivingOutcomes";
import type { NflPlayerGameUniverseRow } from "./types/playerGameUniverse";

function universeRow(overrides: Partial<NflPlayerGameUniverseRow> = {}): NflPlayerGameUniverseRow {
  return {
    schemaVersion: "nfl-player-game-universe-v1", season: 2025, week: 3, gameId: "2025_03_PHI_KC",
    gameDateUtc: "2025-09-21T00:00:00.000Z", playerId: "gsis:wr1", playerName: "WR One", team: "phi", opponent: "kc",
    position: "WR", homeAway: "home", membershipSource: "statsTable", rosterStatusKnown: true,
    outcomes: { passAttempts: 0, completions: 0, passingYards: 0, carries: 0, rushingYards: 0, targets: 5, receptions: 3, receivingYards: 40 },
    eligibility: { rushingEligiblePregame: false, receivingEligiblePregame: true, passingEligiblePregame: false },
    ...overrides,
  };
}

describe("buildReceivingOutcomesFromUniverse", () => {
  it("includes a true zero-target row for an eligible player, with defined convention values", () => {
    const rows = [universeRow({ outcomes: { ...universeRow().outcomes, targets: 0, receptions: 0, receivingYards: 0 } })];
    const result = buildReceivingOutcomesFromUniverse(rows, new Map());
    expect(result).toHaveLength(1);
    expect(result[0].targets).toBe(0);
    expect(result[0].zeroTargetFlag).toBe(true);
    expect(result[0].yardsPerTarget).toBe(0); // convention, not division
    expect(result[0].receptionsPerTarget).toBeNull(); // undefined, not fabricated
    expect(result[0].yardsPerReception).toBeNull();
    expect(result[0].targetShare).toBe(0);
  });

  it("preserves receptionsPerTarget/yardsPerReception as real ratios for a positive-target row", () => {
    const result = buildReceivingOutcomesFromUniverse([universeRow()], new Map());
    expect(result[0].receptionsPerTarget).toBeCloseTo(3 / 5, 10);
    expect(result[0].yardsPerReception).toBeCloseTo(40 / 3, 10);
    expect(result[0].yardsPerTarget).toBe(8);
  });

  it("excludes QB even if somehow marked receivingEligiblePregame", () => {
    const rows = [universeRow({ position: "QB", playerId: "gsis:qb1" })];
    expect(buildReceivingOutcomesFromUniverse(rows, new Map())).toHaveLength(0);
  });

  it("excludes a row not flagged receivingEligiblePregame", () => {
    const rows = [universeRow({ eligibility: { rushingEligiblePregame: false, receivingEligiblePregame: false, passingEligiblePregame: false } })];
    expect(buildReceivingOutcomesFromUniverse(rows, new Map())).toHaveLength(0);
  });

  it("excludes a row with missing (null) targets/receptions/receivingYards rather than coercing to zero", () => {
    const rows = [universeRow({ outcomes: { ...universeRow().outcomes, targets: null, receptions: null, receivingYards: null } })];
    expect(buildReceivingOutcomesFromUniverse(rows, new Map())).toHaveLength(0);
  });

  it("carries membershipSource through for zero-target provenance auditing", () => {
    const statsTableZero = universeRow({ outcomes: { ...universeRow().outcomes, targets: 0, receptions: 0, receivingYards: 0 }, membershipSource: "statsTable" });
    const rosterZero = universeRow({ playerId: "gsis:wr2", outcomes: { ...universeRow().outcomes, targets: 0, receptions: 0, receivingYards: 0 }, membershipSource: "activeRosterConfirmed" });
    const result = buildReceivingOutcomesFromUniverse([statsTableZero, rosterZero], new Map());
    expect(result.find((r) => r.playerId === "gsis:wr1")!.membershipSource).toBe("statsTable");
    expect(result.find((r) => r.playerId === "gsis:wr2")!.membershipSource).toBe("activeRosterConfirmed");
  });

  it("uses team pass-attempts context for target share when available", () => {
    const result = buildReceivingOutcomesFromUniverse([universeRow()], new Map([["2025_03_PHI_KC|phi", 25]]));
    expect(result[0].targetShare).toBe(0.2);
    expect(result[0].teamPassAttemptsContext).toBe(25);
  });
});
