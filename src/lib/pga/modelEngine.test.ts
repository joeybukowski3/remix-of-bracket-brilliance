import { calculateCompositeScore, normalizeTournamentPlayerData, rankPlayersByScore } from "@/lib/pga/modelEngine";
import type { PgaWeights, RawPgaPlayer } from "@/lib/pga/pgaTypes";

function buildRawPlayer(overrides: Partial<RawPgaPlayer>): RawPgaPlayer {
  return {
    "Player Name": "Test Player",
    Salary: 8000,
    "HT # Rounds": null,
    "Course True SG": null,
    "2021": null,
    "2022": null,
    "2023": null,
    "2024": null,
    "2025": null,
    "SG: Approach the Green": 0.5,
    "SG: Around the Green": 0.2,
    "SG: Putting": 0.1,
    "Par 4 Scoring Average": 12,
    "Driving Accuracy %": 65,
    "Bogey Avoidance": 0.85,
    "Birdie or Better 125-150 yds": 0.4,
    "Birdie or Better <125 yds": 0.3,
    TrendRank: 12,
    "Masters 2026": null,
    "SG: Approach the Green_rank": 10,
    "SG: Around the Green_rank": 18,
    "SG: Putting_rank": 22,
    "Par 4 Scoring Average_rank": 14,
    "Driving Accuracy %_rank": 11,
    "Bogey Avoidance_rank": 17,
    "Birdie or Better 125-150 yds_rank": 9,
    "Birdie or Better <125 yds_rank": 13,
    ...overrides,
  };
}

describe("PGA model missing-data handling", () => {
  it("nulls out rank fields when the underlying raw stat is missing", () => {
    const [player] = normalizeTournamentPlayerData([
      buildRawPlayer({
        "SG: Approach the Green": null,
        "SG: Approach the Green_rank": 77,
        "Driving Accuracy %": null,
        "Driving Accuracy %_rank": 77,
      }),
    ]);

    expect(player.statRanks.sgApproachRank).toBeNull();
    expect(player.statRanks.drivingAccuracyRank).toBeNull();
    expect(player.statRanks.trendRank).toBe(12);
  });

  it("re-normalizes the score across available metrics instead of treating missing ranks as worst-in-field", () => {
    const weights: PgaWeights = {
      sgApproach: 60,
      par4: 40,
      drivingAccuracy: 0,
      bogeyAvoidance: 0,
      sgAroundGreen: 0,
      trendRank: 0,
      birdie125150: 0,
      sgPutting: 0,
      birdieUnder125: 0,
      courseTrueSg: 0,
    };

    const [player] = normalizeTournamentPlayerData([
      buildRawPlayer({
        "Par 4 Scoring Average": null,
        "Par 4 Scoring Average_rank": 77,
      }),
    ]);

    const result = calculateCompositeScore(player, weights, 83);
    const expectedScore = (83 + 1 - 10) / 83;

    expect(result.score).toBeCloseTo(expectedScore, 6);
    expect(result.isEligible).toBe(false);
  });

  it("excludes incomplete players from the ranked leaderboard", () => {
    const weights: PgaWeights = {
      sgApproach: 25,
      par4: 25,
      drivingAccuracy: 25,
      bogeyAvoidance: 0,
      sgAroundGreen: 0,
      trendRank: 25,
      birdie125150: 0,
      sgPutting: 0,
      birdieUnder125: 0,
      courseTrueSg: 0,
    };

    const players = normalizeTournamentPlayerData([
      buildRawPlayer({ "Player Name": "Complete A", TrendRank: 5 }),
      buildRawPlayer({
        "Player Name": "Complete B",
        TrendRank: 8,
        "SG: Approach the Green_rank": 20,
        "Par 4 Scoring Average_rank": 19,
        "Driving Accuracy %_rank": 18,
      }),
      buildRawPlayer({
        "Player Name": "Incomplete Player",
        TrendRank: 3,
        "SG: Approach the Green": null,
        "SG: Around the Green": null,
        "SG: Putting": null,
        "Par 4 Scoring Average": null,
        "Driving Accuracy %": null,
        "Bogey Avoidance": null,
        "Birdie or Better 125-150 yds": null,
        "Birdie or Better <125 yds": null,
        "SG: Approach the Green_rank": 77,
        "Par 4 Scoring Average_rank": 77,
        "Driving Accuracy %_rank": 77,
      }),
    ]);

    const rows = rankPlayersByScore(players, weights);

    expect(rows.map((row) => row.player)).toEqual(["Complete A", "Complete B"]);
  });
});
