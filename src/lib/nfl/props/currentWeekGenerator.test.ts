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
import { buildDepthChartIndex, parseDepthChartRows, type NflDepthChartCsvRow } from "./currentWeekDepthChart";
import { resolvePassingStarters } from "./qbStarterResolution";
import type { NflCurrentWeekCandidate } from "./currentWeekRosterUniverse";

// A tiny, fully synthetic two-team, two-season league so every code path
// (roster membership, eligibility, model fit, score reference, interval,
// leakage guard) runs against small, hand-checkable data instead of the
// full committed 2022-2025 caches.

const TEAMS = ["aaa", "bbb"] as const;

function schedule(season: number, week: number, home: string, away: string, dateUtc: string): NflPropRawGameRecord {
  return { gameId: `${season}_${String(week).padStart(2, "0")}_${away.toUpperCase()}_${home.toUpperCase()}`, season, week, seasonType: "REG", homeAbbr: home, awayAbbr: away, dateUtc };
}

function buildLeague(
  targetSeason: number,
  targetWeek: number,
  options: { depthChartRows?: readonly NflDepthChartCsvRow[]; depthChartAsOf?: string } = {},
) {
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

  const generatedAt = options.depthChartAsOf ?? "2026-01-01T00:00:00.000Z";
  const depthChartIndex = options.depthChartRows ? buildDepthChartIndex(parseDepthChartRows(options.depthChartRows)) : null;

  const sources: NflCurrentWeekSources = {
    season: targetSeason, week: targetWeek, generatedAt,
    rosterRows, games, gameJoinIndex, fullTeamGameLog, passEpaGameLog, rushEpaGameLog, marketByKey, marketAvailable: false, domeByGameId,
    qbStatGameLog, playerRushingStatLog, playerReceivingStatLog, teamTopRbCarryShareByGameTeam, teamTopTargetShareByGameTeam,
    rushActivityLog, targetActivityLog, attemptActivityLog,
    historicalPassingRows, historicalRushingRows, historicalReceivingRows,
    depthChartIndex,
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

  it("exposes archive-only fitted state and exact prediction inputs without changing any projection legs", () => {
    const { sources } = buildLeague(2025, 1);
    const captures: Parameters<NonNullable<NflCurrentWeekSources["archiveObserver"]>["onPrediction"]>[0][] = [];
    let fitted: unknown = null;
    const artifact = generateCurrentWeekYardageProjections({
      ...sources,
      archiveObserver: {
        onFittedModels: (models) => { fitted = models; },
        onPrediction: (capture) => captures.push(capture),
      },
    });
    expect(fitted).not.toBeNull();
    expect(captures.map((capture) => capture.row)).toEqual(artifact.rows);

    const passing = captures.find((capture) => capture.row.market === "passing")!;
    if (passing.row.market !== "passing") throw new Error("expected passing capture");
    expect(passing.orderedVector).toHaveLength(16);
    expect(passing.row.projectedYards).toBe(passing.row.directModelPrediction);
    expect((passing.featureValues as { market: unknown }).market).toEqual(expect.objectContaining({ spread: null, total: null, impliedTeamTotal: null }));

    const rushing = captures.find((capture) => capture.row.market === "rushing")!;
    expect(rushing.row.market).toBe("rushing");
    if (rushing.row.market !== "rushing") throw new Error("expected rushing capture");
    expect(rushing.row.projectedYards).toBe(rushing.row.projectedCarries! * rushing.row.projectedYardsPerCarry!);
    expect(rushing.row.featureSnapshot.carriesPerGame).toEqual((rushing.featureValues as { playerUsage: { carriesPerGame: unknown } }).playerUsage.carriesPerGame);

    const receiving = captures.find((capture) => capture.row.market === "receiving")!;
    expect(receiving.row.market).toBe("receiving");
    if (receiving.row.market !== "receiving") throw new Error("expected receiving capture");
    expect(receiving.row.projectedYards).toBe(receiving.row.projectedTargets! * receiving.row.projectedYardsPerTarget!);
    expect(receiving.row.featureSnapshot.targetsPerGame).toEqual((receiving.featureValues as { playerUsage: { targetsPerGame: unknown } }).playerUsage.targetsPerGame);
    expect(receiving.row).toEqual(expect.objectContaining({ roleSource: expect.any(String), historyStatus: expect.any(String) }));
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

  it("emits a diagnostic featureSnapshot on every row, pulled straight from the ForTarget feature row -- never a new computation", () => {
    const { sources } = buildLeague(2025, 1);
    const result = generateCurrentWeekYardageProjections(sources);

    const passingRow = result.rows.find((r) => r.market === "passing" && r.team === "aaa");
    expect(passingRow).toBeDefined();
    if (passingRow!.market !== "passing") throw new Error("expected passing row");
    // Shape/window-key presence, market-independent of any specific fixture player's history.
    expect(passingRow!.featureSnapshot).toHaveProperty("yardsPerAttempt");
    expect(passingRow!.featureSnapshot).toHaveProperty("completionPct");
    expect(passingRow!.featureSnapshot.yardsPerAttempt).toHaveProperty("seasonPrior");
    expect(passingRow!.featureSnapshot.yardsPerAttempt).toHaveProperty("priorSeason");
    // Market context is disclosed even though the live path has no market feed for the target week itself.
    expect(passingRow!.featureSnapshot.market).toEqual({ spread: null, total: null, impliedTeamTotal: null, isDome: null });

    const rushingRow = result.rows.find((r) => r.market === "rushing" && r.playerId === "gsis:VETCHG");
    expect(rushingRow).toBeDefined();
    if (rushingRow!.market !== "rushing") throw new Error("expected rushing row");
    // VETCHG's own 2024 rolling YPC (70/15, 75/16 across two games): 145 total yards / 31 total carries.
    expect(rushingRow!.featureSnapshot.rollingYardsPerCarry.priorSeason).toBeCloseTo(145 / 31, 5);
    expect(rushingRow!.featureSnapshot.carriesPerGame.priorSeason).toBeCloseTo((15 + 16) / 2, 5);
    // Never equal to the model's own shrunk YPC -- the snapshot is the raw rolling value, not a duplicate of projectedYardsPerCarry.
    expect(rushingRow!.featureSnapshot.rollingYardsPerCarry.priorSeason).not.toBe(rushingRow!.projectedYardsPerCarry);

    const receivingRow = result.rows.find((r) => r.market === "receiving");
    expect(receivingRow).toBeDefined();
    if (receivingRow!.market !== "receiving") throw new Error("expected receiving row");
    expect(receivingRow!.featureSnapshot).toHaveProperty("targetsPerGame");
    expect(receivingRow!.featureSnapshot).toHaveProperty("rollingYardsPerTarget");
    expect(receivingRow!.featureSnapshot).toHaveProperty("opponentTargetsAllowedPerGame");
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

// ---------------------------------------------------------------------------
// Phase 9.2: depth-chart role integration
// ---------------------------------------------------------------------------

function dcRow(team: string, posName: string, gsisId: string, rank: number, playerName = "", dt = "2026-01-01T00:00:00.000Z"): NflDepthChartCsvRow {
  return { dt, team, player_name: playerName, espn_id: "", gsis_id: gsisId, pos_name: posName, pos_rank: String(rank) };
}

describe("Phase 9.2 depth-chart role integration", () => {
  it("QB rank-1 sourced selection: an established starter is confirmed via sourced depth evidence", () => {
    const { sources } = buildLeague(2025, 1, { depthChartRows: [dcRow("aaa", "Quarterback", "QB1aaa", 1, "QB One")] });
    const result = generateCurrentWeekYardageProjections(sources);
    const row = result.rows.find((r) => r.market === "passing" && r.team === "aaa");
    expect(row).toBeDefined();
    expect(row!.fallbackProvenance).toBe("depthChart");
    expect(row!.roleConfidence).toBe("sourced");
    expect(row!.starterFlag).toBe(true);
    expect(row!.depthRank).toBe(1);
    if (row!.market === "passing") expect(row!.diagnostics.starterResolution).toBe("sourcedDepthChart");
  });

  it("sourced QB overrides the attempts-history heuristic: a no-history QB with depthRank=1 resolves confidently, not starterUncertain", () => {
    // QB Two (team bbb) has zero historical attempts in the base fixture --
    // without depth data this resolves via the "noCompetingQb" heuristic
    // path with starterUncertain=true (see the Phase 9.1 rookie-QB test).
    // Sourced depth evidence should override that uncertainty.
    const { sources } = buildLeague(2025, 1, { depthChartRows: [dcRow("bbb", "Quarterback", "QB2bbb", 1, "QB Two")] });
    const result = generateCurrentWeekYardageProjections(sources);
    const row = result.rows.find((r) => r.market === "passing" && r.team === "bbb");
    expect(row).toBeDefined();
    expect(row!.fallbackProvenance).toBe("depthChart");
    expect(row!.roleConfidence).toBe("sourced");
    expect(row!.hardCaseFlags.roleUncertain).toBe(false);
    if (row!.market === "passing") expect(row!.diagnostics.starterResolution).toBe("sourcedDepthChart");
  });

  it("ambiguous QB depth source falls back deterministically and flags sourceAmbiguous", () => {
    const candidateA: NflCurrentWeekCandidate = {
      season: 2025, week: 1, gameId: "g1", gameDateUtc: "2025-09-07T17:00:00.000Z", homeAway: "home",
      playerId: "gsis:QBX", playerName: "QB X", team: "ccc", opponent: "ddd", position: "QB",
      rushingEligiblePregame: false, receivingEligiblePregame: false, passingEligiblePregame: false,
      rushingRoleUncertain: false, receivingRoleUncertain: false,
      rushingFallbackProvenance: null, receivingFallbackProvenance: null, rushingRoleEvidence: null, receivingRoleEvidence: null,
    };
    const candidateB: NflCurrentWeekCandidate = { ...candidateA, playerId: "gsis:QBY", playerName: "QB Y" };
    const depthChartIndex = buildDepthChartIndex(parseDepthChartRows([
      dcRow("ccc", "Quarterback", "QBX", 1, "QB X"),
      dcRow("ccc", "Quarterback", "QBY", 1, "QB Y"),
    ]));
    const results = resolvePassingStarters([candidateA, candidateB], [], depthChartIndex);
    expect(results).toHaveLength(1);
    expect(results[0].sourceAmbiguous).toBe(true);
    expect(results[0].resolution).not.toBe("sourcedDepthChart");
    expect(results[0].starterUncertain).toBe(true);
    expect(results[0].roleEvidence.roleConfidence).toBe("inferred");
  });

  it("rookie RB admitted through sourced depth evidence (not the scarcity floor)", () => {
    const { sources } = buildLeague(2025, 1, { depthChartRows: [dcRow("aaa", "Running Back", "ROOKIE_RB_aaa", 2, "Rookie RB aaa")] });
    const result = generateCurrentWeekYardageProjections(sources);
    const row = result.rows.find((r) => r.market === "rushing" && r.playerId === "gsis:ROOKIE_RB_aaa");
    expect(row).toBeDefined();
    expect(row!.fallbackProvenance).toBe("depthChart");
    expect(row!.roleConfidence).toBe("sourced");
    expect(row!.depthRank).toBe(2);
    expect(row!.hardCaseFlags.roleUncertain).toBe(false); // sourced evidence, not the arbitrary scarcity-floor tie-break
  });

  it("rookie WR admitted through sourced depth evidence (not the scarcity floor)", () => {
    const { sources } = buildLeague(2025, 1, { depthChartRows: [dcRow("aaa", "Wide Receiver", "ROOKIE_aaa", 3, "Rookie aaa")] });
    const result = generateCurrentWeekYardageProjections(sources);
    const row = result.rows.find((r) => r.market === "receiving" && r.playerId === "gsis:ROOKIE_aaa");
    expect(row).toBeDefined();
    expect(row!.fallbackProvenance).toBe("depthChart");
    expect(row!.roleConfidence).toBe("sourced");
    expect(row!.depthRank).toBe(3);
    expect(row!.hardCaseFlags.roleUncertain).toBe(false);
  });

  it("a historically eligible veteran survives complete absence from the depth-chart feed", () => {
    // Depth chart snapshot covers only team aaa this run -- team bbb's
    // RB_bbb (historically eligible) must still appear.
    const { sources } = buildLeague(2025, 1, { depthChartRows: [dcRow("aaa", "Running Back", "RB_aaa", 1, "RB aaa")] });
    const result = generateCurrentWeekYardageProjections(sources);
    const row = result.rows.find((r) => r.market === "rushing" && r.playerId === "gsis:RB_bbb");
    expect(row).toBeDefined();
    expect(row!.fallbackProvenance).toBe("historicalVolume");
  });

  it("scarcity-floor fallback still activates when the depth-chart source is entirely unavailable", () => {
    const { sources } = buildLeague(2025, 1); // no depthChartRows -> depthChartIndex: null
    const result = generateCurrentWeekYardageProjections(sources);
    expect(result.depthChartSource.available).toBe(false);
    expect(result.depthChartSource.stale).toBe(false);
    const row = result.rows.find((r) => r.market === "rushing" && r.playerId === "gsis:ROOKIE_RB_aaa");
    expect(row).toBeDefined();
    expect(row!.fallbackProvenance).toBe("rosterScarcityFloor");
    expect(row!.hardCaseFlags.roleUncertain).toBe(true);
  });

  it("a stale depth-chart snapshot is disclosed as stale and NOT used as sourced evidence", () => {
    const { sources } = buildLeague(2025, 1, {
      depthChartRows: [dcRow("aaa", "Running Back", "ROOKIE_RB_aaa", 2, "Rookie RB aaa", "2025-01-01T00:00:00.000Z")],
      depthChartAsOf: "2026-01-01T00:00:00.000Z", // ~1 year after the snapshot -> far beyond the 48h staleness threshold
    });
    const result = generateCurrentWeekYardageProjections(sources);
    expect(result.depthChartSource.stale).toBe(true);
    expect(result.depthChartSource.available).toBe(false);
    expect(result.depthChartSource.snapshotAt).toBe("2025-01-01T00:00:00.000Z");
    const row = result.rows.find((r) => r.market === "rushing" && r.playerId === "gsis:ROOKIE_RB_aaa");
    expect(row).toBeDefined();
    expect(row!.fallbackProvenance).toBe("rosterScarcityFloor"); // fell back, not silently treated as sourced
  });

  it("is deterministic with a depth chart present", () => {
    const { sources } = buildLeague(2025, 1, { depthChartRows: [dcRow("aaa", "Quarterback", "QB1aaa", 1, "QB One"), dcRow("aaa", "Running Back", "ROOKIE_RB_aaa", 2, "Rookie RB aaa")] });
    const first = generateCurrentWeekYardageProjections(sources);
    const second = generateCurrentWeekYardageProjections(sources);
    expect(second).toEqual(first);
  });
});
