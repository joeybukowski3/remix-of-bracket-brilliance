import { describe, expect, it } from "vitest";
import { buildPlayerRushingGameLog, buildRushingOutcomes, buildRushingOutcomesFromUniverse, isPregameEligible, PRIOR_SEASON_ELIGIBILITY_CARRY_THRESHOLD } from "./rushingOutcomes";
import { buildGameJoinIndex, type NflPropRawGameRecord } from "./historicalOutcomes";
import type { NflYardageOutcomeRow } from "./historicalOutcomes";
import type { NflPlayerGameUniverseRow } from "./types/playerGameUniverse";

function outcomeRow(overrides: Omit<Partial<NflYardageOutcomeRow["context"]>, "position"> & { carries: number; rushingYards: number; position?: string }): NflYardageOutcomeRow {
  const { carries, rushingYards, position = "RB", ...ctxOverrides } = overrides;
  return {
    schemaVersion: "nfl-yardage-outcome-row-v1", outcomeSchemaVersion: "nfl-yardage-outcome-v1",
    context: {
      schemaVersion: "nfl-prop-player-game-context-v1", season: 2025, week: 1, gameId: "2025_01_PHI_DAL",
      playerId: "gsis:rb1", playerName: "RB One", team: "phi", opponent: "dal", position,
      homeAway: "home", gameDateUtc: "2025-09-05T00:00:00.000Z", spread: null, total: null, impliedTeamTotal: null, availabilityStatus: null,
      ...ctxOverrides,
    },
    outcomes: { passAttempts: null, passingYards: null, carries, rushingYards, targets: null, receptions: null, receivingYards: null },
    provenance: { source: "nflverse stats_player weekly", sourceSeason: 2025, sourceWeek: 1, gameContextSource: null },
  } as unknown as NflYardageOutcomeRow;
}

const games: NflPropRawGameRecord[] = [
  { gameId: "2025_01_PHI_DAL", season: 2025, week: 1, seasonType: "REG", homeAbbr: "phi", awayAbbr: "dal", dateUtc: "2025-09-05T00:00:00.000Z" },
  { gameId: "2025_02_PHI_KC", season: 2025, week: 2, seasonType: "REG", homeAbbr: "kc", awayAbbr: "phi", dateUtc: "2025-09-14T00:00:00.000Z" },
  { gameId: "2024_18_PHI_NYG", season: 2024, week: 18, seasonType: "REG", homeAbbr: "phi", awayAbbr: "nyg", dateUtc: "2025-01-05T00:00:00.000Z" },
];
const gameJoinIndex = buildGameJoinIndex(games);

describe("buildRushingOutcomes: official-stat and zero/missing semantics", () => {
  it("carries and rushing yards come verbatim from the official source, including kneels (no special-case exclusion)", () => {
    // A kneel is officially recorded as carries/rushing_yards (often negative) by nflverse; this pipeline does not filter it out.
    const rows = [outcomeRow({ carries: 3, rushingYards: -2, playerId: "gsis:qb1", position: "QB" })];
    const result = buildRushingOutcomes(rows, new Map(), gameJoinIndex, []);
    expect(result[0].carries).toBe(3);
    expect(result[0].rushingYards).toBe(-2);
    expect(result[0].yardsPerCarry).toBeCloseTo(-2 / 3, 10);
  });

  it("excludes a row with carries=0 or null from the outcome artifact entirely (not a fabricated zero-yard row)", () => {
    const rows = [outcomeRow({ carries: 0, rushingYards: 0 }), outcomeRow({ carries: 5, rushingYards: 22, playerId: "gsis:rb2" })];
    const result = buildRushingOutcomes(rows, new Map(), gameJoinIndex, []);
    expect(result).toHaveLength(1);
    expect(result[0].playerId).toBe("gsis:rb2");
  });

  it("only includes QB/RB/WR/TE positions", () => {
    const rows = [outcomeRow({ carries: 2, rushingYards: 8, position: "OL", playerId: "gsis:ol1" })];
    const result = buildRushingOutcomes(rows, new Map(), gameJoinIndex, []);
    expect(result).toHaveLength(0);
  });

  it("computes carryShare from the team rush-attempts context and leaves it null when unresolved", () => {
    const rows = [outcomeRow({ carries: 10, rushingYards: 40 })];
    const withContext = buildRushingOutcomes(rows, new Map([["2025_01_PHI_DAL|phi", 25]]), gameJoinIndex, []);
    expect(withContext[0].carryShare).toBe(0.4);
    const withoutContext = buildRushingOutcomes(rows, new Map(), gameJoinIndex, []);
    expect(withoutContext[0].carryShare).toBeNull();
    expect(withoutContext[0].teamRushAttemptsContext).toBeNull();
  });
});

describe("isPregameEligible", () => {
  it("is true given at least one current-season game strictly before the target date", () => {
    const log = [{ playerId: "gsis:rb1", season: 2025, week: 1, team: "phi", carries: 10, gameDateUtc: "2025-09-05T00:00:00.000Z" }];
    expect(isPregameEligible(log, "gsis:rb1", 2025, "2025-09-14T00:00:00.000Z")).toBe(true);
  });

  it("is false when the only current-season game is ON the target date (not strictly before)", () => {
    const log = [{ playerId: "gsis:rb1", season: 2025, week: 1, team: "phi", carries: 10, gameDateUtc: "2025-09-05T00:00:00.000Z" }];
    expect(isPregameEligible(log, "gsis:rb1", 2025, "2025-09-05T00:00:00.000Z")).toBe(false);
  });

  it("falls back to a prior-season carry-total threshold when no current-season game exists yet", () => {
    const heavyPriorSeason = [{ playerId: "gsis:rb1", season: 2024, week: 18, team: "phi", carries: PRIOR_SEASON_ELIGIBILITY_CARRY_THRESHOLD, gameDateUtc: "2025-01-05T00:00:00.000Z" }];
    expect(isPregameEligible(heavyPriorSeason, "gsis:rb1", 2025, "2025-09-05T00:00:00.000Z")).toBe(true);

    const lightPriorSeason = [{ playerId: "gsis:rb1", season: 2024, week: 18, team: "phi", carries: PRIOR_SEASON_ELIGIBILITY_CARRY_THRESHOLD - 1, gameDateUtc: "2025-01-05T00:00:00.000Z" }];
    expect(isPregameEligible(lightPriorSeason, "gsis:rb1", 2025, "2025-09-05T00:00:00.000Z")).toBe(false);
  });

  it("never uses the target week's own carries to decide eligibility (no survivorship leakage)", () => {
    // Even a player with a huge target-week carry total (not in the log, since the log is built from PRIOR-only usage in production) is ineligible with an empty log.
    expect(isPregameEligible([], "gsis:surprise", 2025, "2025-09-05T00:00:00.000Z")).toBe(false);
  });
});

describe("buildPlayerRushingGameLog / pregameEligible on outcome rows", () => {
  it("marks a rookie's very first career carry as pregame-ineligible (real, not silently dropped)", () => {
    const rows = [outcomeRow({ carries: 4, rushingYards: 15 })];
    const log = buildPlayerRushingGameLog(rows, gameJoinIndex);
    const result = buildRushingOutcomes(rows, new Map(), gameJoinIndex, log);
    expect(result).toHaveLength(1);
    expect(result[0].pregameEligible).toBe(false);
  });

  it("marks Week 2 as eligible once Week 1 provided current-season history", () => {
    const rows = [
      outcomeRow({ carries: 4, rushingYards: 15, week: 1, gameId: "2025_01_PHI_DAL" }),
      outcomeRow({ carries: 6, rushingYards: 30, week: 2, gameId: "2025_02_PHI_KC", opponent: "kc" }),
    ];
    const log = buildPlayerRushingGameLog(rows, gameJoinIndex);
    const result = buildRushingOutcomes(rows, new Map(), gameJoinIndex, log);
    const week2 = result.find((r) => r.week === 2)!;
    expect(week2.pregameEligible).toBe(true);
  });
});

function universeRow(overrides: Partial<NflPlayerGameUniverseRow> = {}): NflPlayerGameUniverseRow {
  return {
    schemaVersion: "nfl-player-game-universe-v1", season: 2025, week: 2, gameId: "2025_02_PHI_KC",
    gameDateUtc: "2025-09-14T00:00:00.000Z", playerId: "gsis:rb1", playerName: "RB One", team: "phi", opponent: "kc",
    position: "RB", homeAway: "away", membershipSource: "statsTable", rosterStatusKnown: true,
    outcomes: { passAttempts: 0, completions: 0, passingYards: 0, carries: 0, rushingYards: 0, targets: 2, receptions: 1, receivingYards: 8 },
    eligibility: { rushingEligiblePregame: true, receivingEligiblePregame: true, passingEligiblePregame: false },
    ...overrides,
  };
}

describe("buildRushingOutcomesFromUniverse (Phase 5.5 corrected population)", () => {
  it("includes a true zero-carry row for an already-eligible player (the Phase 5 gap this corrects)", () => {
    const rows = [universeRow()];
    const result = buildRushingOutcomesFromUniverse(rows, new Map());
    expect(result).toHaveLength(1);
    expect(result[0].carries).toBe(0);
    expect(result[0].rushingYards).toBe(0);
    expect(result[0].yardsPerCarry).toBe(0); // convention for a zero-carry row, not a division result
    expect(result[0].pregameEligible).toBe(true);
  });

  it("excludes a row where rushingEligiblePregame is false", () => {
    const rows = [universeRow({ eligibility: { rushingEligiblePregame: false, receivingEligiblePregame: true, passingEligiblePregame: false } })];
    expect(buildRushingOutcomesFromUniverse(rows, new Map())).toHaveLength(0);
  });

  it("excludes a row with missing (null) carries/rushingYards rather than coercing to zero", () => {
    const rows = [universeRow({ outcomes: { ...universeRow().outcomes, carries: null, rushingYards: null } })];
    expect(buildRushingOutcomesFromUniverse(rows, new Map())).toHaveLength(0);
  });

  it("carryShare is 0 (not null) for a zero-carry row even without a team-context match", () => {
    const rows = [universeRow()];
    const result = buildRushingOutcomesFromUniverse(rows, new Map());
    expect(result[0].carryShare).toBe(0);
  });

  it("uses the team rush-attempts context when available for a positive-carry row", () => {
    const rows = [universeRow({ outcomes: { ...universeRow().outcomes, carries: 10, rushingYards: 45 } })];
    const result = buildRushingOutcomesFromUniverse(rows, new Map([["2025_02_PHI_KC|phi", 25]]));
    expect(result[0].carryShare).toBe(0.4);
    expect(result[0].yardsPerCarry).toBe(4.5);
  });
});
