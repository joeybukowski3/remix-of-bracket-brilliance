import { describe, expect, it } from "vitest";
import { buildQbStatGameLog, buildQbPassingFeatureRow } from "./qbPassingFeatures";
import { buildGameJoinIndex, type NflPropRawGameRecord } from "./historicalOutcomes";
import { buildTeamGameLog, buildTeamPregameFeatures } from "./teamPlayVolume";
import { buildTeamEpaGameLog, type NflTeamEpaGameRecord } from "./qbPassingEpaContext";
import type { NflTeamGamePlayVolumeRecord, NflTeamPregameFeatures } from "./types/teamPregameFeatures";
import type { NflQbPassingOutcome } from "./types/qbPassing";
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

const epaRecords: NflTeamEpaGameRecord[] = [
  { gameId: "2025_01_PHI_DAL", season: 2025, week: 1, team: "phi", opponent: "dal", passEpa: 6, passPlays: 34 },
  { gameId: "2025_01_PHI_DAL", season: 2025, week: 1, team: "dal", opponent: "phi", passEpa: -2, passPlays: 36 },
  { gameId: "2025_02_PHI_KC", season: 2025, week: 2, team: "phi", opponent: "kc", passEpa: 3, passPlays: 30 },
  { gameId: "2025_02_PHI_KC", season: 2025, week: 2, team: "kc", opponent: "phi", passEpa: 10, passPlays: 40 },
];
const epaGameLog = buildTeamEpaGameLog(epaRecords, gameJoinIndex);

const marketRows: NflHistoricalMarketRow[] = [
  { season: 2025, week: 1, team: "phi", spread: -3, total: 45, impliedTeamTotal: 24, homeAway: "home" },
  { season: 2025, week: 2, team: "phi", spread: 2.5, total: 44, impliedTeamTotal: 20.75, homeAway: "away" },
];
const marketByKey = new Map(marketRows.map((r) => [marketKey(r.season, r.week, r.team), r]));
const domeByGameId = new Map([["2025_01_PHI_DAL", false], ["2025_02_PHI_KC", true]]);

const outcomes: NflQbPassingOutcome[] = [
  {
    schemaVersion: "nfl-qb-passing-outcome-v1", season: 2025, week: 1, gameId: "2025_01_PHI_DAL",
    team: "phi", opponent: "dal", primaryQbPlayerId: "gsis:qb1", primaryQbPlayerName: "QB One",
    primaryQbAttempts: 28, primaryQbCompletions: 19, primaryQbPassingYards: 245, primaryQbYardsPerAttempt: 245 / 28,
    primaryQbPassingTds: 2, primaryQbInterceptions: 0,
    backupQbAttempts: 0, backupQbPassingYards: 0, qbCountThisWeek: 1, instabilityCategory: "singleQbGame",
    primaryQbAttemptShare: 1, teamDropbacksContext: 34,
  },
  {
    schemaVersion: "nfl-qb-passing-outcome-v1", season: 2025, week: 2, gameId: "2025_02_PHI_KC",
    team: "phi", opponent: "kc", primaryQbPlayerId: "gsis:qb1", primaryQbPlayerName: "QB One",
    primaryQbAttempts: 33, primaryQbCompletions: 21, primaryQbPassingYards: 275, primaryQbYardsPerAttempt: 275 / 33,
    primaryQbPassingTds: 1, primaryQbInterceptions: 1,
    backupQbAttempts: 0, backupQbPassingYards: 0, qbCountThisWeek: 1, instabilityCategory: "singleQbGame",
    primaryQbAttemptShare: 1, teamDropbacksContext: 30,
  },
];
const qbStatGameLog = buildQbStatGameLog(outcomes, gameJoinIndex);

function buildArgs() {
  return { gameJoinIndex, teamPregameFeaturesByKey, fullTeamGameLog, epaGameLog, marketByKey, domeByGameId, qbStatGameLog };
}

describe("buildQbPassingFeatureRow", () => {
  it("Week 1 has null current-season windows for team/QB/opponent context", () => {
    const row = buildQbPassingFeatureRow(outcomes[0], buildArgs());
    expect(row.features.opportunity.qbAttemptsPerGame).toEqual({ seasonPrior: null, last3: null, priorSeason: null });
    expect(row.features.qbEfficiency.yardsPerAttempt).toEqual({ seasonPrior: null, last3: null, priorSeason: null });
    expect(row.features.opponentPassDefense.passEpaPerPlayAllowed).toEqual({ seasonPrior: null, last3: null, priorSeason: null });
    expect(row.features.market.isDome).toBe(false);
  });

  it("Week 2 QB efficiency reflects exactly the Week 1 game (YPA and completion% from that one game)", () => {
    const row = buildQbPassingFeatureRow(outcomes[1], buildArgs());
    expect(row.features.qbEfficiency.yardsPerAttempt.seasonPrior).toBeCloseTo(245 / 28, 10);
    expect(row.features.qbEfficiency.completionPct.seasonPrior).toBeCloseTo(19 / 28, 10);
    expect(row.features.qbRollingPassingYardsPerGame.seasonPrior).toBe(245);
    expect(row.diagnostics.gamesStartedPriorThisSeason).toBe(1);
  });

  it("opponent pass-EPA-allowed for Week 2 (opponent=kc) is null (kc has no prior game in this fixture as an opponent)", () => {
    const row = buildQbPassingFeatureRow(outcomes[1], buildArgs());
    expect(row.features.opponentPassDefense.passEpaPerPlayAllowed.seasonPrior).toBeNull();
  });

  it("ADVERSARIAL LEAKAGE: mutating a target game's own outcome (yards/completions) never changes its own feature row", () => {
    const baseline = buildQbPassingFeatureRow(outcomes[1], buildArgs());
    const mutatedTarget: NflQbPassingOutcome = { ...outcomes[1], primaryQbPassingYards: 999, primaryQbCompletions: 1 };
    const mutatedAfter = buildQbPassingFeatureRow(mutatedTarget, buildArgs());
    // Features (everything EXCEPT target.primaryQbPassingYards, which is expected to change) are identical.
    expect(mutatedAfter.features).toEqual(baseline.features);
    expect(mutatedAfter.diagnostics).toEqual(baseline.diagnostics);
  });

  it("ADVERSARIAL LEAKAGE: a future game's outcome never enters an earlier week's feature row", () => {
    const week1Before = buildQbPassingFeatureRow(outcomes[0], buildArgs());
    const mutatedFuture: NflQbPassingOutcome = { ...outcomes[1], primaryQbPassingYards: 999 };
    const mutatedQbStatGameLog = buildQbStatGameLog([outcomes[0], mutatedFuture], gameJoinIndex);
    const week1After = buildQbPassingFeatureRow(outcomes[0], { ...buildArgs(), qbStatGameLog: mutatedQbStatGameLog });
    expect(week1After).toEqual(week1Before);
  });

  it("diagnostics are never folded into `features`", () => {
    const row = buildQbPassingFeatureRow(outcomes[0], buildArgs());
    expect(Object.keys(row.features)).toEqual(["opportunity", "qbEfficiency", "qbRollingPassingYardsPerGame", "opponentPassDefense", "proePassTendency", "market"]);
  });
});
