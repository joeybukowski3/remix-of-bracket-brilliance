import { calculateCompositeScore, normalizeTournamentPlayerData, rankPlayersByScore } from "@/lib/pga/modelEngine";
import { PGA_TOP_20_PROFILE_WEIGHTS } from "@/lib/pga/pgaWeights";
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

describe("PGA model preset ranking", () => {
  const balancedWeights: PgaWeights = {
    sgApproach: 22,
    par4: 14,
    drivingAccuracy: 11,
    bogeyAvoidance: 11,
    sgAroundGreen: 9,
    trendRank: 11,
    birdie125150: 7,
    sgPutting: 6,
    birdieUnder125: 3,
    courseTrueSg: 6,
  };

  function rankedPlayer(name: string, statRank: number, trendRank: number, courseTrueSg: number) {
    return buildRawPlayer({
      "Player Name": name,
      TrendRank: trendRank,
      "Course True SG": courseTrueSg,
      "SG: Approach the Green_rank": statRank,
      "SG: Around the Green_rank": statRank,
      "SG: Putting_rank": statRank,
      "Par 4 Scoring Average_rank": statRank,
      "Driving Accuracy %_rank": statRank,
      "Bogey Avoidance_rank": statRank,
      "Birdie or Better 125-150 yds_rank": statRank,
      "Birdie or Better <125 yds_rank": statRank,
    });
  }

  it("changes order through rankPlayersByScore when Top 20 Profile is selected", () => {
    const players = normalizeTournamentPlayerData([
      rankedPlayer("Form and History", 30, 1, 2),
      rankedPlayer("Baseline Stats", 5, 80, -2),
    ]);

    expect(rankPlayersByScore(players, balancedWeights).map((row) => row.player)).toEqual(["Baseline Stats", "Form and History"]);
    expect(rankPlayersByScore(players, PGA_TOP_20_PROFILE_WEIGHTS as PgaWeights).map((row) => row.player)).toEqual(["Form and History", "Baseline Stats"]);
  });

  it("keeps existing preset scoring unchanged and does not mutate base players", () => {
    const players = normalizeTournamentPlayerData([
      rankedPlayer("Form and History", 30, 1, 2),
      rankedPlayer("Baseline Stats", 5, 80, -2),
    ]);
    const before = structuredClone(players);
    const rows = rankPlayersByScore(players, balancedWeights);

    expect(rows.map((row) => [row.player, Number(row.score.toFixed(6))])).toEqual([
      ["Baseline Stats", 0.795301],
      ["Form and History", 0.698],
    ]);
    expect(players).toEqual(before);
  });

  it("uses each tournament's supplied course history with the same Top 20 weights", () => {
    const firstTournament = normalizeTournamentPlayerData([
      rankedPlayer("Alpha", 20, 20, 2),
      rankedPlayer("Bravo", 20, 20, -2),
    ]);
    const secondTournament = normalizeTournamentPlayerData([
      rankedPlayer("Alpha", 20, 20, -2),
      rankedPlayer("Bravo", 20, 20, 2),
    ]);

    expect(rankPlayersByScore(firstTournament, PGA_TOP_20_PROFILE_WEIGHTS as PgaWeights)[0].player).toBe("Alpha");
    expect(rankPlayersByScore(secondTournament, PGA_TOP_20_PROFILE_WEIGHTS as PgaWeights)[0].player).toBe("Bravo");
  });

  it("keeps alphabetical tie-breaking deterministic", () => {
    const players = normalizeTournamentPlayerData([
      rankedPlayer("Zulu", 10, 10, 1),
      rankedPlayer("Alpha", 10, 10, 1),
    ]);
    const rows = rankPlayersByScore(players, PGA_TOP_20_PROFILE_WEIGHTS as PgaWeights);

    expect(rows.map((row) => row.player)).toEqual(["Alpha", "Zulu"]);
    expect(rows.map((row) => row.rank)).toEqual([1, 1]);
  });
});
