import { describe, expect, it } from "vitest";
import { buildPlayerRushingStatLog, buildRushingFeatureRow, buildTeamTopRbCarryShareByGameTeam } from "./rushingFeatures";
import { buildGameJoinIndex, type NflPropRawGameRecord } from "./historicalOutcomes";
import { buildTeamGameLog, buildTeamPregameFeatures } from "./teamPlayVolume";
import { buildTeamEpaGameLog, type NflTeamEpaGameRecord } from "./qbPassingEpaContext";
import type { NflTeamGamePlayVolumeRecord, NflTeamPregameFeatures } from "./types/teamPregameFeatures";
import type { NflRushingOutcome } from "./types/rushingOutcome";
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
const rushEpaRecords: NflTeamEpaGameRecord[] = [
  { gameId: "2025_01_PHI_DAL", season: 2025, week: 1, team: "phi", opponent: "dal", passEpa: -3, passPlays: 26 },
  { gameId: "2025_01_PHI_DAL", season: 2025, week: 1, team: "dal", opponent: "phi", passEpa: 1, passPlays: 26 },
];
const rushEpaGameLog = buildTeamEpaGameLog(rushEpaRecords, gameJoinIndex);
const marketByKey = new Map<string, NflHistoricalMarketRow>([[marketKey(2025, 1, "phi"), { season: 2025, week: 1, team: "phi", spread: -3, total: 45, impliedTeamTotal: 24, homeAway: "home" }]]);
const domeByGameId = new Map([["2025_01_PHI_DAL", false]]);

const outcomes: NflRushingOutcome[] = [
  { schemaVersion: "nfl-rushing-outcome-v1", season: 2025, week: 1, gameId: "2025_01_PHI_DAL", playerId: "gsis:rb1", playerName: "RB One", team: "phi", opponent: "dal", position: "RB", carries: 18, rushingYards: 85, yardsPerCarry: 85 / 18, teamRushAttemptsContext: 26, carryShare: 18 / 26, pregameEligible: true },
  { schemaVersion: "nfl-rushing-outcome-v1", season: 2025, week: 2, gameId: "2025_02_PHI_KC", playerId: "gsis:rb1", playerName: "RB One", team: "phi", opponent: "kc", position: "RB", carries: 15, rushingYards: 60, yardsPerCarry: 4, teamRushAttemptsContext: 28, carryShare: 15 / 28, pregameEligible: true },
];
const playerRushingStatLog = buildPlayerRushingStatLog(outcomes, gameJoinIndex);
const teamTopRbCarryShareByGameTeam = buildTeamTopRbCarryShareByGameTeam(outcomes);

function buildArgs() {
  return { gameJoinIndex, teamPregameFeaturesByKey, fullTeamGameLog, rushEpaGameLog, marketByKey, domeByGameId, playerRushingStatLog, teamTopRbCarryShareByGameTeam };
}

describe("buildRushingFeatureRow", () => {
  it("Week 1 has null player-usage/efficiency windows", () => {
    const row = buildRushingFeatureRow(outcomes[0], buildArgs());
    expect(row.features.playerUsage.carriesPerGame).toEqual({ seasonPrior: null, last3: null, priorSeason: null });
    expect(row.diagnostics.gamesWithCarriesPriorThisSeason).toBe(0);
  });

  it("Week 2 usage reflects exactly the Week 1 game", () => {
    const row = buildRushingFeatureRow(outcomes[1], buildArgs());
    expect(row.features.playerUsage.carriesPerGame.seasonPrior).toBe(18);
    expect(row.features.playerEfficiency.yardsPerCarry.seasonPrior).toBeCloseTo(85 / 18, 10);
    expect(row.diagnostics.gamesWithCarriesPriorThisSeason).toBe(1);
  });

  it("ADVERSARIAL LEAKAGE: mutating a target game's own carries/yards never changes its own feature row", () => {
    const baseline = buildRushingFeatureRow(outcomes[1], buildArgs());
    const mutated: NflRushingOutcome = { ...outcomes[1], carries: 40, rushingYards: 400, yardsPerCarry: 10 };
    const after = buildRushingFeatureRow(mutated, buildArgs());
    expect(after.features).toEqual(baseline.features);
  });

  it("ADVERSARIAL LEAKAGE: a future game's stats never enter an earlier week's feature row", () => {
    const week1Before = buildRushingFeatureRow(outcomes[0], buildArgs());
    const mutatedFuture: NflRushingOutcome = { ...outcomes[1], carries: 99, rushingYards: 999 };
    const mutatedLog = buildPlayerRushingStatLog([outcomes[0], mutatedFuture], gameJoinIndex);
    const week1After = buildRushingFeatureRow(outcomes[0], { ...buildArgs(), playerRushingStatLog: mutatedLog });
    expect(week1After).toEqual(week1Before);
  });
});

describe("buildTeamTopRbCarryShareByGameTeam", () => {
  it("takes the maximum RB carry share per team-game", () => {
    const shares = buildTeamTopRbCarryShareByGameTeam(outcomes);
    expect(shares.get("2025_01_PHI_DAL|phi")).toBeCloseTo(18 / 26, 10);
  });
});
