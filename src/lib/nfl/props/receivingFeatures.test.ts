import { describe, expect, it } from "vitest";
import { buildPlayerReceivingStatLog, buildReceivingFeatureRow, buildTeamTopTargetShareByGameTeam } from "./receivingFeatures";
import { buildGameJoinIndex, type NflPropRawGameRecord } from "./historicalOutcomes";
import { buildTeamGameLog, buildTeamPregameFeatures } from "./teamPlayVolume";
import { buildTeamEpaGameLog, type NflTeamEpaGameRecord } from "./qbPassingEpaContext";
import type { NflTeamGamePlayVolumeRecord, NflTeamPregameFeatures } from "./types/teamPregameFeatures";
import type { NflReceivingOutcome } from "./types/receivingOutcome";
import { marketKey, type NflHistoricalMarketRow } from "./qbOpportunityFeatures";

const games: NflPropRawGameRecord[] = [
  { gameId: "2025_01_PHI_DAL", season: 2025, week: 1, seasonType: "REG", homeAbbr: "phi", awayAbbr: "dal", dateUtc: "2025-09-05T00:00:00.000Z" },
  { gameId: "2025_02_PHI_KC", season: 2025, week: 2, seasonType: "REG", homeAbbr: "kc", awayAbbr: "phi", dateUtc: "2025-09-14T00:00:00.000Z" },
];
const gameJoinIndex = buildGameJoinIndex(games);

const playVolumeRecords: NflTeamGamePlayVolumeRecord[] = [
  { gameId: "2025_01_PHI_DAL", season: 2025, week: 1, team: "phi", opponent: "dal", eligiblePlays: 60, passPlays: 34, rushPlays: 26, neutralEligiblePlays: 20, neutralPassPlays: 10, passOeSum: 5, passOeCount: 60 },
  { gameId: "2025_01_PHI_DAL", season: 2025, week: 1, team: "dal", opponent: "phi", eligiblePlays: 62, passPlays: 36, rushPlays: 26, neutralEligiblePlays: 22, neutralPassPlays: 12, passOeSum: -3, passOeCount: 62 },
  { gameId: "2025_02_PHI_KC", season: 2025, week: 2, team: "phi", opponent: "kc", eligiblePlays: 58, passPlays: 30, rushPlays: 28, neutralEligiblePlays: 18, neutralPassPlays: 9, passOeSum: 2, passOeCount: 58 },
  { gameId: "2025_02_PHI_KC", season: 2025, week: 2, team: "kc", opponent: "phi", eligiblePlays: 65, passPlays: 40, rushPlays: 25, neutralEligiblePlays: 24, neutralPassPlays: 15, passOeSum: 8, passOeCount: 65 },
];
const fullTeamGameLog = buildTeamGameLog(playVolumeRecords, gameJoinIndex);
const teamPregameFeaturesByKey = new Map<string, NflTeamPregameFeatures>(
  playVolumeRecords.map((r) => [`${r.season}|${r.week}|${r.team}`, buildTeamPregameFeatures(r, gameJoinIndex, fullTeamGameLog)]),
);
const passEpaRecords: NflTeamEpaGameRecord[] = [
  { gameId: "2025_01_PHI_DAL", season: 2025, week: 1, team: "phi", opponent: "dal", passEpa: 6, passPlays: 34 },
  { gameId: "2025_01_PHI_DAL", season: 2025, week: 1, team: "dal", opponent: "phi", passEpa: -2, passPlays: 36 },
];
const passEpaGameLog = buildTeamEpaGameLog(passEpaRecords, gameJoinIndex);
const marketByKey = new Map<string, NflHistoricalMarketRow>([[marketKey(2025, 1, "phi"), { season: 2025, week: 1, team: "phi", spread: -3, total: 45, impliedTeamTotal: 24, homeAway: "home" }]]);
const domeByGameId = new Map([["2025_01_PHI_DAL", false]]);

const outcomes: NflReceivingOutcome[] = [
  { schemaVersion: "nfl-receiving-outcome-v1", season: 2025, week: 1, gameId: "2025_01_PHI_DAL", playerId: "gsis:wr1", playerName: "WR One", team: "phi", opponent: "dal", position: "WR", targets: 8, receptions: 5, receivingYards: 70, receptionsPerTarget: 5 / 8, yardsPerReception: 14, yardsPerTarget: 8.75, teamPassAttemptsContext: 34, targetShare: 8 / 34, zeroTargetFlag: false, membershipSource: "statsTable" },
  { schemaVersion: "nfl-receiving-outcome-v1", season: 2025, week: 2, gameId: "2025_02_PHI_KC", playerId: "gsis:wr1", playerName: "WR One", team: "phi", opponent: "kc", position: "WR", targets: 6, receptions: 4, receivingYards: 55, receptionsPerTarget: 4 / 6, yardsPerReception: 13.75, yardsPerTarget: 55 / 6, teamPassAttemptsContext: 30, targetShare: 0.2, zeroTargetFlag: false, membershipSource: "statsTable" },
];
const airYardsByPlayerWeek = new Map([["gsis:wr1|2025|1", { airYards: 90 }]]);
const playerReceivingStatLog = buildPlayerReceivingStatLog(outcomes, gameJoinIndex, airYardsByPlayerWeek);
const teamTopTargetShareByGameTeam = buildTeamTopTargetShareByGameTeam(outcomes);

function buildArgs() {
  return { gameJoinIndex, teamPregameFeaturesByKey, fullTeamGameLog, passEpaGameLog, marketByKey, domeByGameId, playerReceivingStatLog, teamTopTargetShareByGameTeam };
}

describe("buildReceivingFeatureRow", () => {
  it("Week 1 has null current-season usage/efficiency windows", () => {
    const row = buildReceivingFeatureRow(outcomes[0], buildArgs());
    expect(row.features.playerUsage.targetsPerGame).toEqual({ seasonPrior: null, last3: null, priorSeason: null });
    expect(row.diagnostics.gamesWithTargetsPriorThisSeason).toBe(0);
  });

  it("Week 2 usage/efficiency/air-yards reflect exactly the Week 1 game", () => {
    const row = buildReceivingFeatureRow(outcomes[1], buildArgs());
    expect(row.features.playerUsage.targetsPerGame.seasonPrior).toBe(8);
    expect(row.features.playerEfficiency.yardsPerTarget.seasonPrior).toBeCloseTo(8.75, 10);
    expect(row.features.airYards.adot.seasonPrior).toBeCloseTo(90 / 8, 10);
  });

  it("ADVERSARIAL LEAKAGE: mutating a target game's own targets/receptions/receivingYards never changes its own feature row", () => {
    const baseline = buildReceivingFeatureRow(outcomes[1], buildArgs());
    const mutated: NflReceivingOutcome = { ...outcomes[1], targets: 99, receptions: 99, receivingYards: 999 };
    const after = buildReceivingFeatureRow(mutated, buildArgs());
    expect(after.features).toEqual(baseline.features);
  });

  it("ADVERSARIAL LEAKAGE: a future game's stats never enter an earlier week's feature row", () => {
    const week1Before = buildReceivingFeatureRow(outcomes[0], buildArgs());
    const mutatedFuture: NflReceivingOutcome = { ...outcomes[1], targets: 500, receivingYards: 5000 };
    const mutatedLog = buildPlayerReceivingStatLog([outcomes[0], mutatedFuture], gameJoinIndex, airYardsByPlayerWeek);
    const week1After = buildReceivingFeatureRow(outcomes[0], { ...buildArgs(), playerReceivingStatLog: mutatedLog });
    expect(week1After).toEqual(week1Before);
  });
});

describe("buildTeamTopTargetShareByGameTeam", () => {
  it("takes the maximum target share per team-game", () => {
    const shares = buildTeamTopTargetShareByGameTeam(outcomes);
    expect(shares.get("2025_01_PHI_DAL|phi")).toBeCloseTo(8 / 34, 10);
  });
});
