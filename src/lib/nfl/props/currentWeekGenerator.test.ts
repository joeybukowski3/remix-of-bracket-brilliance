import { describe, expect, it } from "vitest";
import { buildGameJoinIndex, type NflPropRawGameRecord } from "./historicalOutcomes";
import { buildTeamGameLog, buildTeamPregameFeatures } from "./teamPlayVolume";
import type { NflTeamGamePlayVolumeRecord } from "./types/teamPregameFeatures";
import { buildTeamEpaGameLog } from "./qbPassingEpaContext";
import { marketKey, type NflHistoricalMarketRow } from "./qbOpportunityFeatures";
import { buildQbPassingFeatureRow, buildQbStatGameLog, type NflQbStatGameLogEntry } from "./qbPassingFeatures";
import { buildPlayerRushingStatLog, buildRushingFeatureRow, buildTeamTopRbCarryShareByGameTeam } from "./rushingFeatures";
import { buildPlayerReceivingStatLog, buildReceivingFeatureRow, buildTeamTopTargetShareByGameTeam } from "./receivingFeatures";
import { generateCurrentWeekYardageProjections, type NflCurrentWeekSources } from "./currentWeekGenerator";
import type { NflCurrentWeekRosterSourceRow } from "./currentWeekRosterUniverse";
import type { NflQbPassingOutcome } from "./types/qbPassing";
import type { NflRushingOutcome } from "./types/rushingOutcome";
import type { NflReceivingOutcome } from "./types/receivingOutcome";
import type { NflFrozenScoreDefinition } from "./currentWeekMatchupScore";

// A tiny, fully synthetic two-team, two-season league so every code path
// (roster membership, eligibility, model fit, score reference, interval,
// leakage guard) runs against small, hand-checkable data instead of the
// full committed 2022-2025 caches.

const TEAMS = ["aaa", "bbb"] as const;

function schedule(season: number, week: number, home: string, away: string, dateUtc: string): NflPropRawGameRecord {
  return { gameId: `${season}_${String(week).padStart(2, "0")}_${away.toUpperCase()}_${home.toUpperCase()}`, season, week, seasonType: "REG", homeAbbr: home, awayAbbr: away, dateUtc };
}

function buildLeague(targetSeason: number, targetWeek: number) {
  // Two prior-season games (2024 wk1, wk2) so every candidate clears the pregame eligibility bar, plus the target game itself.
  const games: NflPropRawGameRecord[] = [
    schedule(2024, 1, "aaa", "bbb", "2024-09-08T17:00:00.000Z"),
    schedule(2024, 2, "bbb", "aaa", "2024-09-15T17:00:00.000Z"),
    schedule(targetSeason, targetWeek, "aaa", "bbb", `${targetSeason}-09-07T17:00:00.000Z`),
  ];
  const gameJoinIndex = buildGameJoinIndex(games);

  const playVolume: NflTeamGamePlayVolumeRecord[] = [
    { gameId: games[0].gameId, season: 2024, week: 1, team: "aaa", opponent: "bbb", eligiblePlays: 60, passPlays: 35, rushPlays: 25, neutralEligiblePlays: 30, neutralPassPlays: 15, passOeSum: 1, passOeCount: 30 },
    { gameId: games[0].gameId, season: 2024, week: 1, team: "bbb", opponent: "aaa", eligiblePlays: 58, passPlays: 30, rushPlays: 28, neutralEligiblePlays: 28, neutralPassPlays: 12, passOeSum: -1, passOeCount: 28 },
    { gameId: games[1].gameId, season: 2024, week: 2, team: "aaa", opponent: "bbb", eligiblePlays: 62, passPlays: 34, rushPlays: 28, neutralEligiblePlays: 31, neutralPassPlays: 16, passOeSum: 2, passOeCount: 31 },
    { gameId: games[1].gameId, season: 2024, week: 2, team: "bbb", opponent: "aaa", eligiblePlays: 59, passPlays: 31, rushPlays: 28, neutralEligiblePlays: 29, neutralPassPlays: 13, passOeSum: -0.5, passOeCount: 29 },
  ];
  const fullTeamGameLog = buildTeamGameLog(playVolume, gameJoinIndex);
  const teamPregameFeaturesByKey = new Map(
    playVolume.map((r) => [`${r.season}|${r.week}|${r.team}`, buildTeamPregameFeatures(r, gameJoinIndex, fullTeamGameLog)]),
  );
  const marketByKey = new Map<string, NflHistoricalMarketRow>();
  for (const g of [games[0], games[1]]) {
    marketByKey.set(marketKey(g.season, g.week, g.homeAbbr), { season: g.season, week: g.week, team: g.homeAbbr, spread: -2.5, total: 45, impliedTeamTotal: 23.75, homeAway: "home" });
    marketByKey.set(marketKey(g.season, g.week, g.awayAbbr), { season: g.season, week: g.week, team: g.awayAbbr, spread: 2.5, total: 45, impliedTeamTotal: 21.25, homeAway: "away" });
  }

  const domeByGameId = new Map<string, boolean>([[games[0].gameId, false], [games[1].gameId, true]]);

  const passEpaGameLog = buildTeamEpaGameLog(
    playVolume.map((r) => ({ gameId: r.gameId, season: r.season, week: r.week, team: r.team, opponent: r.opponent, passEpa: 5, passPlays: r.passPlays })),
    gameJoinIndex,
  );
  const rushEpaGameLog = buildTeamEpaGameLog(
    playVolume.map((r) => ({ gameId: r.gameId, season: r.season, week: r.week, team: r.team, opponent: r.opponent, passEpa: 1, passPlays: r.rushPlays })),
    gameJoinIndex,
  );

  // QB Two (team bbb) deliberately has NO historical passingOutcomes rows --
  // the "Week 1 rookie starting QB" fixture. QB One (team aaa) keeps real
  // 2024 history as the "established starter" control.
  const passingOutcomes: NflQbPassingOutcome[] = [
    { season: 2024, week: 1, gameId: games[0].gameId, team: "aaa", opponent: "bbb", primaryQbPlayerId: "gsis:QB1", primaryQbPlayerName: "QB One", primaryQbAttempts: 30, primaryQbCompletions: 20, primaryQbPassingYards: 230, primaryQbAttemptShare: 1, instabilityCategory: "singleQbGame" } as NflQbPassingOutcome,
    { season: 2024, week: 2, gameId: games[1].gameId, team: "aaa", opponent: "bbb", primaryQbPlayerId: "gsis:QB1", primaryQbPlayerName: "QB One", primaryQbAttempts: 32, primaryQbCompletions: 22, primaryQbPassingYards: 250, primaryQbAttemptShare: 1, instabilityCategory: "singleQbGame" } as NflQbPassingOutcome,
  ];
  const qbStatGameLog: NflQbStatGameLogEntry[] = buildQbStatGameLog(passingOutcomes, gameJoinIndex);
  const historicalPassingRows = passingOutcomes.map((o) => buildQbPassingFeatureRow(o, { gameJoinIndex, teamPregameFeaturesByKey, fullTeamGameLog, epaGameLog: passEpaGameLog, marketByKey, domeByGameId, qbStatGameLog }));

  const rushingOutcomes: NflRushingOutcome[] = [
    ...TEAMS.flatMap((team) => [
      { season: 2024, week: 1, gameId: games[0].gameId, team, opponent: team === "aaa" ? "bbb" : "aaa", playerId: `gsis:RB_${team}`, playerName: `RB ${team}`, position: "RB", carries: 18, rushingYards: 80, carryShare: 0.8 } as NflRushingOutcome,
      { season: 2024, week: 2, gameId: games[1].gameId, team, opponent: team === "aaa" ? "bbb" : "aaa", playerId: `gsis:RB_${team}`, playerName: `RB ${team}`, position: "RB", carries: 20, rushingYards: 95, carryShare: 0.82 } as NflRushingOutcome,
    ]),
    // "Veteran changing teams" fixture: real 2024 production recorded under
    // team aaa, but this player's 2026 roster row (below) lists them on bbb.
    { season: 2024, week: 1, gameId: games[0].gameId, team: "aaa", opponent: "bbb", playerId: "gsis:VETCHG", playerName: "Veteran Changed Team", position: "RB", carries: 15, rushingYards: 70, carryShare: 0.2 } as NflRushingOutcome,
    { season: 2024, week: 2, gameId: games[1].gameId, team: "aaa", opponent: "bbb", playerId: "gsis:VETCHG", playerName: "Veteran Changed Team", position: "RB", carries: 16, rushingYards: 75, carryShare: 0.18 } as NflRushingOutcome,
  ];
  const playerRushingStatLog = buildPlayerRushingStatLog(rushingOutcomes, gameJoinIndex);
  const teamTopRbCarryShareByGameTeam = buildTeamTopRbCarryShareByGameTeam(rushingOutcomes);
  const historicalRushingRows = rushingOutcomes.map((o) => buildRushingFeatureRow(o, { gameJoinIndex, teamPregameFeaturesByKey, fullTeamGameLog, rushEpaGameLog, marketByKey, domeByGameId, playerRushingStatLog, teamTopRbCarryShareByGameTeam }));

  const receivingOutcomes: NflReceivingOutcome[] = TEAMS.flatMap((team) => [
    { season: 2024, week: 1, gameId: games[0].gameId, team, opponent: team === "aaa" ? "bbb" : "aaa", playerId: `gsis:WR_${team}`, playerName: `WR ${team}`, position: "WR", targets: 9, receptions: 6, receivingYards: 85, targetShare: 0.3, zeroTargetFlag: false, membershipSource: "statsTable" } as NflReceivingOutcome,
    { season: 2024, week: 2, gameId: games[1].gameId, team, opponent: team === "aaa" ? "bbb" : "aaa", playerId: `gsis:WR_${team}`, playerName: `WR ${team}`, position: "WR", targets: 10, receptions: 7, receivingYards: 95, targetShare: 0.32, zeroTargetFlag: false, membershipSource: "statsTable" } as NflReceivingOutcome,
  ]);
  const airYardsByPlayerWeek = new Map(
    receivingOutcomes.map((o) => [`${o.playerId}|${o.season}|${o.week}`, { airYards: o.targets * 8 }]),
  );
  const playerReceivingStatLog = buildPlayerReceivingStatLog(receivingOutcomes, gameJoinIndex, airYardsByPlayerWeek);
  const teamTopTargetShareByGameTeam = buildTeamTopTargetShareByGameTeam(receivingOutcomes);
  const historicalReceivingRows = receivingOutcomes.map((o) => buildReceivingFeatureRow(o, { gameJoinIndex, teamPregameFeaturesByKey, fullTeamGameLog, passEpaGameLog, marketByKey, domeByGameId, playerReceivingStatLog, teamTopTargetShareByGameTeam }));

  const rushActivityLog = rushingOutcomes.map((o) => ({ playerId: o.playerId, season: o.season, gameDateUtc: gameJoinIndex.get(`${o.season}|${o.week}|${o.team}`)!.gameDateUtc, activityCount: o.carries }));
  const targetActivityLog = receivingOutcomes.map((o) => ({ playerId: o.playerId, season: o.season, gameDateUtc: gameJoinIndex.get(`${o.season}|${o.week}|${o.team}`)!.gameDateUtc, activityCount: o.targets }));
  const attemptActivityLog = passingOutcomes.map((o) => ({ playerId: o.primaryQbPlayerId, season: o.season, gameDateUtc: gameJoinIndex.get(`${o.season}|${o.week}|${o.team}`)!.gameDateUtc, activityCount: o.primaryQbAttempts }));

  const rosterRows: NflCurrentWeekRosterSourceRow[] = [
    ...TEAMS.flatMap((team) => [
      { season: targetSeason, week: targetWeek, team, gsisId: `QB1_${team}`.replace("QB1_", team === "aaa" ? "QB1" : "QB2"), playerName: team === "aaa" ? "QB One" : "QB Two", position: "QB", status: "ACT" },
      { season: targetSeason, week: targetWeek, team, gsisId: `RB_${team}`, playerName: `RB ${team}`, position: "RB", status: "ACT" },
      { season: targetSeason, week: targetWeek, team, gsisId: `WR_${team}`, playerName: `WR ${team}`, position: "WR", status: "ACT" },
      // A skill player with NO historical volume, on a team where the
      // historical-only view would leave that position below the
      // roster-scarcity floor -- the "rookie/new-contributor with role
      // evidence" fixture (Phase 9.1). Must be admitted, not fabricated.
      { season: targetSeason, week: targetWeek, team, gsisId: `ROOKIE_${team}`, playerName: `Rookie ${team}`, position: "WR", status: "ACT" },
    ]),
    // Rookie RB on team aaa: team aaa has only ONE historically-eligible RB
    // (RB_aaa), below the floor of 2 -- this player must be admitted via
    // the roster-scarcity fallback.
    { season: targetSeason, week: targetWeek, team: "aaa", gsisId: "ROOKIE_RB_aaa", playerName: "Rookie RB aaa", position: "RB", status: "ACT" },
    // Veteran who changed teams: real 2024 production as team aaa, current
    // roster lists them on bbb -- brings bbb's eligible-RB count to 2
    // (meets the floor) via HISTORICAL volume, not the fallback.
    { season: targetSeason, week: targetWeek, team: "bbb", gsisId: "VETCHG", playerName: "Veteran Changed Team", position: "RB", status: "ACT" },
    // Irrelevant camp-body RB on bbb, added AFTER bbb's RB floor is already
    // met by RB_bbb + the transferred veteran above -- must NOT be emitted
    // merely because it is ACT (Phase 9.1 "no flooding" requirement).
    { season: targetSeason, week: targetWeek, team: "bbb", gsisId: "CAMPBODY_RB_bbb", playerName: "Camp Body RB bbb", position: "RB", status: "ACT" },
  ];

  const passingWinner: NflFrozenScoreDefinition = { opportunityComponent: "opportunity", environmentComponents: ["opponent", "passingQuality", "gameEnvironment"], weights: { opportunity: 0.2, opponent: 0.3, passingQuality: 0.4, gameEnvironment: 0.1 } };
  const rushingWinner: NflFrozenScoreDefinition = { opportunityComponent: "workload", environmentComponents: ["roleQuality", "teamRushingEnvironment", "opponent"], weights: { workload: 0.5, roleQuality: 0.1, teamRushingEnvironment: 0.2, opponent: 0.2 } };
  const receivingWinner: NflFrozenScoreDefinition = { opportunityComponent: "opportunity", environmentComponents: ["roleStability", "opponent", "efficiencyProfile"], weights: { opportunity: 0.5, roleStability: 0.1, opponent: 0.1, efficiencyProfile: 0.3 } };

  const sources: NflCurrentWeekSources = {
    season: targetSeason, week: targetWeek, generatedAt: "2026-01-01T00:00:00.000Z",
    rosterRows, games, gameJoinIndex, fullTeamGameLog, passEpaGameLog, rushEpaGameLog, marketByKey, marketAvailable: false, domeByGameId,
    qbStatGameLog, playerRushingStatLog, playerReceivingStatLog, teamTopRbCarryShareByGameTeam, teamTopTargetShareByGameTeam,
    rushActivityLog, targetActivityLog, attemptActivityLog,
    historicalPassingRows, historicalRushingRows, historicalReceivingRows,
    scoreDefinitions: { passing: passingWinner, rushing: rushingWinner, receiving: receivingWinner },
  };
  return { sources, games };
}

describe("generateCurrentWeekYardageProjections", () => {
  it("is deterministic given identical inputs", () => {
    const { sources } = buildLeague(2025, 1);
    const first = generateCurrentWeekYardageProjections(sources);
    const second = generateCurrentWeekYardageProjections(sources);
    expect(second).toEqual(first);
  });

  it("never lets a target-week outcome mutation change that week's own projection (adversarial leakage test)", () => {
    // Replay 2024 week 2 itself as the "current" week -- 2024 is inside
    // PRODUCTION_TRAIN_SEASONS's neighborhood conceptually (the generator's
    // guard strips the exact target week regardless), so mutating that
    // week's own historical row must have zero effect on its own projection.
    const { sources } = buildLeague(2024, 2);
    const baseline = generateCurrentWeekYardageProjections(sources);

    const mutatedPassingRows = sources.historicalPassingRows.map((row) =>
      row.season === 2024 && row.week === 2 ? { ...row, target: { primaryQbPassingYards: 999999 } } : row,
    );
    const mutatedRushingRows = sources.historicalRushingRows.map((row) =>
      row.season === 2024 && row.week === 2 ? { ...row, target: { rushingYards: 999999 } } : row,
    );
    const mutatedReceivingRows = sources.historicalReceivingRows.map((row) =>
      row.season === 2024 && row.week === 2 ? { ...row, target: { receivingYards: 999999 } } : row,
    );
    const mutated = generateCurrentWeekYardageProjections({
      ...sources, historicalPassingRows: mutatedPassingRows, historicalRushingRows: mutatedRushingRows, historicalReceivingRows: mutatedReceivingRows,
    });

    expect(mutated).toEqual(baseline);
  });

  it("1. Week 1 rookie starting QB: still gets a projected row, flagged, not omitted", () => {
    const { sources } = buildLeague(2025, 1);
    const result = generateCurrentWeekYardageProjections(sources);
    const row = result.rows.find((r) => r.market === "passing" && r.team === "bbb");
    expect(row).toBeDefined();
    expect(row!.historyStatus).toBe("noHistory");
    expect(row!.status).toBe("eligibleInsufficientHistory");
    expect(row!.hardCaseFlags.roleUncertain).toBe(true);
    expect(row!.hardCaseFlags.noHistory).toBe(true);
    if (row!.market === "passing") expect(row!.projectedYards).not.toBeNull();
  });

  it("2. Week 1 veteran on a new team: projected normally, flagged teamChanged, not roleUncertain", () => {
    const { sources } = buildLeague(2025, 1);
    const result = generateCurrentWeekYardageProjections(sources);
    const row = result.rows.find((r) => r.market === "rushing" && r.playerId === "gsis:VETCHG");
    expect(row).toBeDefined();
    expect(row!.team).toBe("bbb");
    expect(row!.historyStatus).toBe("normal");
    expect(row!.status).toBe("projected");
    expect(row!.hardCaseFlags.teamChanged).toBe(true);
    expect(row!.hardCaseFlags.roleUncertain).toBe(false);
    expect(row!.fallbackProvenance).toBe("historicalVolume");
  });

  it("3. Week 1 rookie RB with legitimate role evidence (team below the RB eligibility floor)", () => {
    const { sources } = buildLeague(2025, 1);
    const result = generateCurrentWeekYardageProjections(sources);
    const row = result.rows.find((r) => r.market === "rushing" && r.playerId === "gsis:ROOKIE_RB_aaa");
    expect(row).toBeDefined();
    expect(row!.historyStatus).toBe("noHistory");
    expect(row!.status).toBe("eligibleInsufficientHistory");
    expect(row!.hardCaseFlags.roleUncertain).toBe(true);
    expect(row!.fallbackProvenance).toBe("rosterScarcityFloor");
  });

  it("4. Week 1 rookie WR with legitimate receiving-role evidence (team below the receiver eligibility floor)", () => {
    const { sources } = buildLeague(2025, 1);
    const result = generateCurrentWeekYardageProjections(sources);
    const row = result.rows.find((r) => r.market === "receiving" && r.playerId === "gsis:ROOKIE_aaa");
    expect(row).toBeDefined();
    expect(row!.historyStatus).toBe("noHistory");
    expect(row!.hardCaseFlags.roleUncertain).toBe(true);
    expect(row!.fallbackProvenance).toBe("rosterScarcityFloor");
  });

  it("5. a no-history player receives a model-computed neutral/shrunk projection, never fabricated or copied stats", () => {
    const { sources } = buildLeague(2025, 1);
    const result = generateCurrentWeekYardageProjections(sources);
    const rookieRb = result.rows.find((r) => r.market === "rushing" && r.playerId === "gsis:ROOKIE_RB_aaa");
    expect(rookieRb).toBeDefined();
    if (rookieRb!.market !== "rushing") throw new Error("expected rushing row");
    expect(rookieRb!.projectedCarries).not.toBeNull();
    expect(rookieRb!.projectedYardsPerCarry).not.toBeNull();
    expect(Number.isFinite(rookieRb!.projectedYards)).toBe(true);
    expect(rookieRb!.projectedYards!).toBeGreaterThanOrEqual(0);
    // Not a copy of any seeded historical player's actual rushing yards (80, 95, 70, 75).
    expect([80, 95, 70, 75]).not.toContain(rookieRb!.projectedYards);
    // Matchup Score stays a normal percentile-derived value, not degraded merely for lacking history.
    expect(rookieRb!.matchupScore!.matchupScore).toBeGreaterThanOrEqual(0);
    expect(rookieRb!.matchupScore!.matchupScore).toBeLessThanOrEqual(100);
  });

  it("7. an irrelevant ACT roster player is not emitted merely because active, once the position's eligibility floor is already met", () => {
    const { sources } = buildLeague(2025, 1);
    const result = generateCurrentWeekYardageProjections(sources);
    const campBody = result.rows.find((r) => r.market === "rushing" && r.playerId === "gsis:CAMPBODY_RB_bbb");
    expect(campBody).toBeUndefined();
    const bbbRushingRows = result.rows.filter((r) => r.market === "rushing" && r.team === "bbb");
    expect(bbbRushingRows.length).toBe(2); // RB_bbb (historical) + VETCHG (historical, transferred) -- not the camp body.
  });

  it("emits no sportsbook, edge, or betting field anywhere in the artifact", () => {
    const { sources } = buildLeague(2025, 1);
    const result = generateCurrentWeekYardageProjections(sources);
    const serialized = JSON.stringify(result).toLowerCase();
    for (const forbidden of ["sportsbook", "edgeyards", "moneyline", "overunder", "over_under", "betscore", "recommendation", "\"line\"", "\"odds\""]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("produces a bounded (0-100) Matchup Score on every emitted row", () => {
    const { sources } = buildLeague(2025, 1);
    const result = generateCurrentWeekYardageProjections(sources);
    for (const row of result.rows) {
      if (!row.matchupScore) continue;
      expect(row.matchupScore.matchupScore).toBeGreaterThanOrEqual(0);
      expect(row.matchupScore.matchupScore).toBeLessThanOrEqual(100);
      expect(row.matchupScore.opportunityScore).toBeGreaterThanOrEqual(0);
      expect(row.matchupScore.opportunityScore).toBeLessThanOrEqual(100);
    }
  });

  it("never requires the target game's own outcome to exist -- generation succeeds for a week with zero played games", () => {
    const { sources } = buildLeague(2025, 1);
    expect(() => generateCurrentWeekYardageProjections(sources)).not.toThrow();
  });

  it("reports gamesExpected/gamesResolved and non-empty rows for a resolvable week", () => {
    const { sources } = buildLeague(2025, 1);
    const result = generateCurrentWeekYardageProjections(sources);
    expect(result.qa.gamesExpected).toBe(1);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.every((r) => r.season === 2025 && r.week === 1)).toBe(true);
  });
});
