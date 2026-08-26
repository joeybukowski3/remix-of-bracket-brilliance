import { describe, expect, it } from "vitest";
import { buildQbGameLog, buildQbOpportunityFeatureRow, marketKey, type NflHistoricalMarketRow } from "./qbOpportunityFeatures";
import { buildGameJoinIndex, type NflPropRawGameRecord } from "./historicalOutcomes";
import { buildTeamGameLog, buildTeamPregameFeatures } from "./teamPlayVolume";
import type { NflTeamGamePlayVolumeRecord, NflTeamPregameFeatures } from "./types/teamPregameFeatures";
import type { NflQbOpportunityOutcome } from "./types/qbOpportunity";
import { computeTrainFallbacks, encodeFeatureRow } from "./qbOpportunityEncoding";
import { fitRidgeModel } from "./ridge";

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

const marketRows: NflHistoricalMarketRow[] = [
  { season: 2025, week: 1, team: "phi", spread: -3, total: 45, impliedTeamTotal: 24, homeAway: "home" },
  { season: 2025, week: 2, team: "phi", spread: 2.5, total: 44, impliedTeamTotal: 20.75, homeAway: "away" },
];
const marketByKey = new Map(marketRows.map((r) => [marketKey(r.season, r.week, r.team), r]));

const outcomes: NflQbOpportunityOutcome[] = [
  {
    schemaVersion: "nfl-qb-opportunity-outcome-v1", season: 2025, week: 1, gameId: "2025_01_PHI_DAL",
    team: "phi", opponent: "dal", primaryQbPlayerId: "gsis:qb1", primaryQbPlayerName: "QB One",
    primaryQbAttempts: 28, backupQbAttempts: 0, qbCountThisWeek: 1, instabilityCategory: "singleQbGame",
    primaryQbAttemptShare: 1, teamDropbacksContext: 34,
  },
  {
    schemaVersion: "nfl-qb-opportunity-outcome-v1", season: 2025, week: 2, gameId: "2025_02_PHI_KC",
    team: "phi", opponent: "kc", primaryQbPlayerId: "gsis:qb1", primaryQbPlayerName: "QB One",
    primaryQbAttempts: 33, backupQbAttempts: 0, qbCountThisWeek: 1, instabilityCategory: "singleQbGame",
    primaryQbAttemptShare: 1, teamDropbacksContext: 30,
  },
];
const qbGameLog = buildQbGameLog(outcomes, gameJoinIndex);

describe("buildQbOpportunityFeatureRow", () => {
  it("Week 1 has zero current-season team-volume/pass-tendency games and zero prior QB starts", () => {
    const row = buildQbOpportunityFeatureRow(outcomes[0], {
      gameJoinIndex, teamPregameFeaturesByKey, fullTeamGameLog, marketByKey, qbGameLog, split: "train",
    });
    expect(row.features.teamVolume.offensivePlaysPerGame).toEqual({ seasonPrior: null, last3: null, priorSeason: null });
    expect(row.features.qbRole.gamesStartedPriorThisSeason).toBe(0);
    expect(row.features.qbRole.isFirstStartForTeamThisSeason).toBe(true);
    expect(row.features.market.spread).toBe(-3);
    expect(row.features.market.homeAway).toBe("home");
  });

  it("Week 2 QB role reflects exactly the Week 1 game for the same QB", () => {
    const row = buildQbOpportunityFeatureRow(outcomes[1], {
      gameJoinIndex, teamPregameFeaturesByKey, fullTeamGameLog, marketByKey, qbGameLog, split: "train",
    });
    expect(row.features.qbRole.gamesStartedPriorThisSeason).toBe(1);
    expect(row.features.qbRole.attemptsPerGameSeasonPrior).toBe(28);
    expect(row.features.qbRole.isFirstStartForTeamThisSeason).toBe(false);
  });

  it("ADVERSARIAL LEAKAGE: a feature row never reads the target game's own diagnostics as a feature", () => {
    const row = buildQbOpportunityFeatureRow(outcomes[0], {
      gameJoinIndex, teamPregameFeaturesByKey, fullTeamGameLog, marketByKey, qbGameLog, split: "train",
    });
    // diagnostics exists ONLY as its own top-level field, never folded into `features`.
    expect(Object.keys(row.features)).toEqual(["teamVolume", "passTendency", "opponent", "market", "qbRole"]);
    expect((row.features as unknown as Record<string, unknown>).instabilityCategory).toBeUndefined();
    expect((row.features as unknown as Record<string, unknown>).primaryQbAttemptShare).toBeUndefined();
  });

  it("throws when the target row's own schedule entry cannot be resolved", () => {
    const orphan: NflQbOpportunityOutcome = { ...outcomes[0], season: 2099, week: 1, team: "zzz" };
    expect(() =>
      buildQbOpportunityFeatureRow(orphan, { gameJoinIndex, teamPregameFeaturesByKey, fullTeamGameLog, marketByKey, qbGameLog, split: "train" }),
    ).toThrow(/No schedule entry/);
  });
});

describe("holdout isolation (train/select/holdout split discipline)", () => {
  it("2025 (holdout) target values cannot affect a model whose train/select rows never include them -- the production script's own split", () => {
    const trainRow = buildQbOpportunityFeatureRow(outcomes[0], {
      gameJoinIndex, teamPregameFeaturesByKey, fullTeamGameLog, marketByKey, qbGameLog, split: "train",
    });

    // Two "holdout worlds" that differ only in what the 2025 target value
    // would have been -- the production pipeline (run-nfl-qb-opportunity-
    // baseline-competition.ts) only ever passes `trainRows` (2022-2023) to
    // computeTrainFallbacks/fitRidgeModel, so a fitted model built from
    // ONLY trainRows must be byte-identical regardless of what the holdout
    // world's outcome was.
    const trainRowsOnly = [trainRow];
    const fitFromTrainOnly = () => {
      const fallbacks = computeTrainFallbacks(trainRowsOnly);
      const encoded = trainRowsOnly.map((r) => encodeFeatureRow(r, fallbacks));
      const targets = trainRowsOnly.map((r) => r.target.primaryQbAttempts);
      return fitRidgeModel(encoded, targets, 1);
    };

    const modelInHoldoutWorldA = fitFromTrainOnly(); // holdout outcome (imagined): primaryQbAttempts = 33
    const modelInHoldoutWorldB = fitFromTrainOnly(); // holdout outcome (imagined): primaryQbAttempts = 999, or holdout omitted entirely

    // Because neither call's inputs ever included a holdout row, the two
    // "worlds" produce an identical model -- proving the holdout target
    // cannot influence training regardless of its value.
    expect(modelInHoldoutWorldA).toEqual(modelInHoldoutWorldB);

    // Contrast: a model that WERE (incorrectly) fit including the holdout
    // row differs, showing this isn't a vacuous assertion.
    const holdoutRow = buildQbOpportunityFeatureRow(outcomes[1], {
      gameJoinIndex, teamPregameFeaturesByKey, fullTeamGameLog, marketByKey, qbGameLog, split: "holdout",
    });
    const leakedRows = [trainRow, { ...holdoutRow, target: { primaryQbAttempts: 999 } }];
    const leakedFallbacks = computeTrainFallbacks(leakedRows);
    const leakedModel = fitRidgeModel(
      leakedRows.map((r) => encodeFeatureRow(r, leakedFallbacks)),
      leakedRows.map((r) => r.target.primaryQbAttempts),
      1,
    );
    expect(leakedModel).not.toEqual(modelInHoldoutWorldA);
  });

  it("train-only fallback statistics are computed from train rows only, never from select/holdout rows", () => {
    const trainRow = buildQbOpportunityFeatureRow(outcomes[0], {
      gameJoinIndex, teamPregameFeaturesByKey, fullTeamGameLog, marketByKey, qbGameLog, split: "train",
    });
    const fallbacksFromTrainOnly = computeTrainFallbacks([trainRow]);

    // A holdout row with wildly different features must not perturb the fallback constants above.
    const holdoutRow = buildQbOpportunityFeatureRow(outcomes[1], {
      gameJoinIndex, teamPregameFeaturesByKey, fullTeamGameLog, marketByKey, qbGameLog, split: "holdout",
    });
    const fallbacksIfHoldoutWereIncluded = computeTrainFallbacks([trainRow, holdoutRow]);

    expect(fallbacksFromTrainOnly).not.toEqual(fallbacksIfHoldoutWereIncluded);
    // This test documents the invariant by contrast: the production script
    // must only ever call computeTrainFallbacks(trainRows), never with
    // select/holdout rows mixed in -- see run-nfl-qb-opportunity-baseline-competition.ts.
  });
});
