import { describe, expect, it } from "vitest";
import {
  attachEligibility, buildActiveRosterUniverseRows, buildPlayerGameUniverse, buildStatsTableUniverseRows,
  isMarketPregameEligible, PRIOR_SEASON_ELIGIBILITY_THRESHOLD,
  type NflRosterStatusRow,
} from "./playerGameUniverse";
import { buildGameJoinIndex, type NflPropRawGameRecord, type NflYardageOutcomeRow } from "./historicalOutcomes";

const games: NflPropRawGameRecord[] = [
  { gameId: "2025_01_PHI_DAL", season: 2025, week: 1, seasonType: "REG", homeAbbr: "phi", awayAbbr: "dal", dateUtc: "2025-09-05T00:00:00.000Z" },
  { gameId: "2025_02_PHI_KC", season: 2025, week: 2, seasonType: "REG", homeAbbr: "kc", awayAbbr: "phi", dateUtc: "2025-09-14T00:00:00.000Z" },
];
const gameJoinIndex = buildGameJoinIndex(games);
const gameShapes = games.map((g) => ({ gameId: g.gameId, homeAbbr: g.homeAbbr, awayAbbr: g.awayAbbr }));

function statsRow(overrides: Omit<Partial<NflYardageOutcomeRow["context"]>, "position"> & { position?: string; carries?: number; targets?: number; passAttempts?: number }): NflYardageOutcomeRow {
  const { carries = 0, targets = 0, passAttempts = 0, ...ctxOverrides } = overrides;
  return {
    schemaVersion: "nfl-yardage-outcome-row-v1", outcomeSchemaVersion: "nfl-yardage-outcome-v1",
    context: {
      schemaVersion: "nfl-prop-player-game-context-v1", season: 2025, week: 1, gameId: "2025_01_PHI_DAL",
      playerId: "gsis:rb1", playerName: "RB One", team: "phi", opponent: "dal", position: "RB",
      homeAway: "home", gameDateUtc: "2025-09-05T00:00:00.000Z", spread: null, total: null, impliedTeamTotal: null, availabilityStatus: null,
      ...ctxOverrides,
    },
    outcomes: { passAttempts, passingYards: passAttempts > 0 ? 100 : 0, carries, rushingYards: carries > 0 ? 40 : 0, targets, receptions: targets > 0 ? 1 : 0, receivingYards: targets > 0 ? 10 : 0 },
    provenance: { source: "nflverse stats_player weekly", sourceSeason: 2025, sourceWeek: 1, gameContextSource: null },
  } as unknown as NflYardageOutcomeRow;
}

describe("buildStatsTableUniverseRows", () => {
  it("keeps a genuine zero-carry, zero-target row (a player who recorded some other stat) -- unlike Phase 5's carries>0 filter", () => {
    const rows = [statsRow({ carries: 0, targets: 0, playerId: "gsis:blocker", passAttempts: 0 })];
    const universe = buildStatsTableUniverseRows(rows, gameShapes, new Set([2025]));
    expect(universe).toHaveLength(1);
    expect(universe[0].outcomes.carries).toBe(0);
    expect(universe[0].outcomes.targets).toBe(0);
  });

  it("excludes non-QB/RB/WR/TE positions", () => {
    const rows = [statsRow({ position: "OL" })];
    expect(buildStatsTableUniverseRows(rows, gameShapes, new Set([2025]))).toHaveLength(0);
  });
});

describe("buildActiveRosterUniverseRows", () => {
  const roster: NflRosterStatusRow[] = [
    { season: 2025, week: 1, team: "PHI", playerId: "gsis:benched", playerName: "Benched RB", position: "RB", status: "ACT" },
    { season: 2025, week: 1, team: "PHI", playerId: "gsis:inactive", playerName: "Inactive RB", position: "RB", status: "INA" },
  ];

  it("creates a true-zero row for an ACT player with no stats-table row", () => {
    const rows = buildActiveRosterUniverseRows(roster, new Set(), gameJoinIndex, gameShapes);
    const benched = rows.find((r) => r.playerId === "gsis:benched");
    expect(benched).toBeDefined();
    expect(benched!.outcomes).toEqual({ passAttempts: 0, completions: 0, passingYards: 0, carries: 0, rushingYards: 0, targets: 0, receptions: 0, receivingYards: 0 });
    expect(benched!.membershipSource).toBe("activeRosterConfirmed");
  });

  it("does NOT create a row for an explicitly INA (inactive) player -- not a fabricated zero", () => {
    const rows = buildActiveRosterUniverseRows(roster, new Set(), gameJoinIndex, gameShapes);
    expect(rows.find((r) => r.playerId === "gsis:inactive")).toBeUndefined();
  });

  it("skips a player already covered by the stats-table tier (no duplicate)", () => {
    const statsTableKeys = new Set(["2025|1|gsis:benched"]);
    const rows = buildActiveRosterUniverseRows(roster, statsTableKeys, gameJoinIndex, gameShapes);
    expect(rows.find((r) => r.playerId === "gsis:benched")).toBeUndefined();
  });
});

describe("isMarketPregameEligible", () => {
  it("is true given prior current-season activity strictly before the target date", () => {
    const log = [{ playerId: "gsis:rb1", season: 2025, gameDateUtc: "2025-09-05T00:00:00.000Z", activityCount: 10 }];
    expect(isMarketPregameEligible(log, "gsis:rb1", 2025, "2025-09-14T00:00:00.000Z", 20)).toBe(true);
  });

  it("never uses target-week activity: a row on or after the target date does not count", () => {
    const log = [{ playerId: "gsis:rb1", season: 2025, gameDateUtc: "2025-09-14T00:00:00.000Z", activityCount: 10 }];
    expect(isMarketPregameEligible(log, "gsis:rb1", 2025, "2025-09-14T00:00:00.000Z", 20)).toBe(false);
  });

  it("falls back to a prior-season threshold when no current-season activity exists", () => {
    const log = [{ playerId: "gsis:rb1", season: 2024, gameDateUtc: "2024-12-01T00:00:00.000Z", activityCount: PRIOR_SEASON_ELIGIBILITY_THRESHOLD.carries }];
    expect(isMarketPregameEligible(log, "gsis:rb1", 2025, "2025-09-05T00:00:00.000Z", PRIOR_SEASON_ELIGIBILITY_THRESHOLD.carries)).toBe(true);
  });

  it("prior activity with activityCount=0 does not count as usage", () => {
    const log = [{ playerId: "gsis:rb1", season: 2025, gameDateUtc: "2025-09-05T00:00:00.000Z", activityCount: 0 }];
    expect(isMarketPregameEligible(log, "gsis:rb1", 2025, "2025-09-14T00:00:00.000Z", 20)).toBe(false);
  });
});

describe("attachEligibility / buildPlayerGameUniverse: market-specific eligibility is independent per market", () => {
  it("a player with only prior rushing usage is rushing-eligible but not receiving-eligible", () => {
    const week1 = statsRow({ carries: 12, targets: 0, week: 1, gameId: "2025_01_PHI_DAL" });
    const week2 = statsRow({ carries: 8, targets: 0, week: 2, gameId: "2025_02_PHI_KC", opponent: "kc", gameDateUtc: "2025-09-14T00:00:00.000Z" });
    const universe = buildPlayerGameUniverse([week1, week2], [], gameJoinIndex, gameShapes, new Set());
    const week2Row = universe.find((r) => r.week === 2)!;
    expect(week2Row.eligibility.rushingEligiblePregame).toBe(true);
    expect(week2Row.eligibility.receivingEligiblePregame).toBe(false);
  });

  it("QB passing eligibility requires QB position even with high prior activity count", () => {
    const week1 = statsRow({ passAttempts: 60, position: "QB", playerId: "gsis:qb1", week: 1, gameId: "2025_01_PHI_DAL" });
    const week2 = statsRow({ passAttempts: 30, position: "QB", playerId: "gsis:qb1", week: 2, gameId: "2025_02_PHI_KC", opponent: "kc", gameDateUtc: "2025-09-14T00:00:00.000Z" });
    const universe = buildPlayerGameUniverse([week1, week2], [], gameJoinIndex, gameShapes, new Set());
    const week2Row = universe.find((r) => r.week === 2)!;
    expect(week2Row.eligibility.passingEligiblePregame).toBe(true);
  });

  it("ADVERSARIAL LEAKAGE: changing a row's own target-game carries/targets/passAttempts never changes its own eligibility", () => {
    const week1 = statsRow({ carries: 12, week: 1, gameId: "2025_01_PHI_DAL" });
    const week2 = statsRow({ carries: 8, week: 2, gameId: "2025_02_PHI_KC", opponent: "kc" });
    const baseline = buildPlayerGameUniverse([week1, week2], [], gameJoinIndex, gameShapes, new Set());
    const week2Baseline = baseline.find((r) => r.week === 2)!.eligibility;

    const mutatedWeek2 = statsRow({ carries: 999, targets: 999, passAttempts: 999, week: 2, gameId: "2025_02_PHI_KC", opponent: "kc" });
    const mutated = buildPlayerGameUniverse([week1, mutatedWeek2], [], gameJoinIndex, gameShapes, new Set());
    const week2Mutated = mutated.find((r) => r.week === 2)!.eligibility;

    expect(week2Mutated).toEqual(week2Baseline);
  });

  it("ADVERSARIAL LEAKAGE: a future week's activity never changes an earlier week's eligibility", () => {
    const week1 = statsRow({ carries: 0, week: 1, gameId: "2025_01_PHI_DAL" });
    const baselineWeek1 = buildPlayerGameUniverse([week1], [], gameJoinIndex, gameShapes, new Set()).find((r) => r.week === 1)!.eligibility;

    const hugeFutureWeek2 = statsRow({ carries: 500, week: 2, gameId: "2025_02_PHI_KC", opponent: "kc" });
    const withFuture = buildPlayerGameUniverse([week1, hugeFutureWeek2], [], gameJoinIndex, gameShapes, new Set()).find((r) => r.week === 1)!.eligibility;

    expect(withFuture).toEqual(baselineWeek1);
  });

  it("produces zero duplicate (season, week, gameId, playerId) keys", () => {
    const week1 = statsRow({ carries: 12, week: 1, gameId: "2025_01_PHI_DAL" });
    const roster: NflRosterStatusRow[] = [{ season: 2025, week: 1, team: "PHI", playerId: "gsis:rb1", playerName: "RB One", position: "RB", status: "ACT" }];
    const universe = buildPlayerGameUniverse([week1], roster, gameJoinIndex, gameShapes, new Set([2025]));
    const keys = universe.map((r) => `${r.season}|${r.week}|${r.gameId}|${r.playerId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
