import { describe, expect, it } from "vitest";
import { buildHeatStatRanges, getHeatCellStyle, getTopParkFactorRows, normalizeHrBestBetsPayload, normalizeHrPropRows } from "@/pages/MlbHrProps";
import { parseCsv, sanitizePercentStat } from "../../scripts/generate-mlb-hr-props.mjs";

describe("MLB HR props payload guards", () => {
  it("normalizes best-bets payloads that use opp instead of opponent", () => {
    const payload = normalizeHrBestBetsPayload({
      date: "2026-05-08",
      generatedAt: "2026-05-08T11:55:55.255Z",
      bestBets: [
        {
          player: "Blake Dunn",
          team: "CIN",
          opp: "HOU",
          opposingPitcher: "Mike Burrows",
          hrScoreRank: 1,
          topStats: ["barrelRate=41.3", "hardHitRate=125"],
          bullets: ["hrScore=93.4 at GABP (parkFactor=1.25)", "last7HR=1 vs RHP Burrows"],
        },
      ],
      valueBets: [],
      longshots: [],
    });

    expect(payload?.bestBets).toHaveLength(1);
    expect(payload?.bestBets[0].opponent).toBe("HOU");
  });

  it("drops invalid rows instead of passing broken numbers through to the page", () => {
    const rows = normalizeHrPropRows([
      {
        player: "Valid Player",
        team: "NYY",
        opponent: "BOS",
        opposingPitcher: "Chris Sale",
        pitcherHand: "L",
        ballpark: "Yankee Stadium",
        parkFactor: 1.18,
        barrelRate: 20.5,
        hardHitRate: 64.2,
        exitVelo: 91.7,
        iso: 0.372,
        hrFBRatio: 10.9,
        pullRate: 40,
        last7HR: 3,
        last30HR: 12,
        hrScore: 73,
        hrScoreRank: 4,
      },
      {
        player: "Broken Player",
        team: "NYY",
        opponent: "BOS",
        opposingPitcher: "Chris Sale",
        pitcherHand: "L",
        ballpark: "Yankee Stadium",
        parkFactor: "bad-data",
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].player).toBe("Valid Player");
  });

  it("parses the statcast CSV header correctly and retains player ids", () => {
    const rows = parseCsv(
      "\"last_name, first_name\",\"player_id\",\"year\",\"player_id\",\"player_name\",\"barrel_batted_rate\",\"hard_hit_percent\",\"exit_velocity_avg\",\"isolated_power\",\"pull_percent\"\n\"Bleday, JJ\",668709,2026,668709,\"Bleday, JJ\",18.2,59.1,\"94.4\",\"0.449\",54.5\n",
    );

    expect(rows[0].player_id).toBe("668709");
    expect(rows[0].hard_hit_percent).toBe("59.1");
    expect(rows[0].exit_velocity_avg).toBe("94.4");
  });

  it("rejects impossible percentage stats instead of treating them as valid output", () => {
    expect(sanitizePercentStat("125", "Hard Hit%", { player: "Blake Dunn" })).toBeNull();
    expect(sanitizePercentStat("59.1", "Hard Hit%", { player: "JJ Bleday" })).toBe(59.1);
  });

  it("derives the top park factor card from the current slate only", () => {
    const rows = normalizeHrPropRows([
      {
        player: "Player A",
        team: "CIN",
        opponent: "HOU",
        opposingPitcher: "Pitcher A",
        pitcherHand: "R",
        ballpark: "Great American Ball Park",
        parkFactor: 1.25,
        barrelRate: 10,
        hardHitRate: 45,
        exitVelo: 90,
        iso: 0.2,
        hrFBRatio: 5,
        pullRate: 40,
        last7HR: 1,
        last30HR: 4,
        hrScore: 60,
        hrScoreRank: 1,
      },
      {
        player: "Player B",
        team: "HOU",
        opponent: "CIN",
        opposingPitcher: "Pitcher B",
        pitcherHand: "R",
        ballpark: "Great American Ball Park",
        parkFactor: 1.25,
        barrelRate: 11,
        hardHitRate: 44,
        exitVelo: 91,
        iso: 0.21,
        hrFBRatio: 6,
        pullRate: 39,
        last7HR: 0,
        last30HR: 3,
        hrScore: 58,
        hrScoreRank: 2,
      },
      {
        player: "Player C",
        team: "COL",
        opponent: "PHI",
        opposingPitcher: "Pitcher C",
        pitcherHand: "L",
        ballpark: "Citizens Bank Park",
        parkFactor: 1.2,
        barrelRate: 12,
        hardHitRate: 46,
        exitVelo: 92,
        iso: 0.22,
        hrFBRatio: 7,
        pullRate: 41,
        last7HR: 2,
        last30HR: 5,
        hrScore: 62,
        hrScoreRank: 3,
      },
    ]);

    const parks = getTopParkFactorRows(rows);

    expect(parks).toHaveLength(2);
    expect(parks[0].ballpark).toBe("Great American Ball Park");
    expect(parks[0].parkFactor).toBe(1.25);
  });

  it("builds deterministic red-blue heat styles from slate-relative values", () => {
    const rows = normalizeHrPropRows([
      {
        player: "Low",
        team: "AAA",
        opponent: "BBB",
        opposingPitcher: "Pitcher Low",
        pitcherHand: "R",
        ballpark: "Park A",
        parkFactor: 0.9,
        barrelRate: 5,
        hardHitRate: 30,
        exitVelo: 88,
        iso: 0.1,
        hrFBRatio: 3,
        pullRate: 35,
        last7HR: 0,
        last30HR: 1,
        hrScore: 20,
        hrScoreRank: 2,
      },
      {
        player: "High",
        team: "CCC",
        opponent: "DDD",
        opposingPitcher: "Pitcher High",
        pitcherHand: "L",
        ballpark: "Park B",
        parkFactor: 1.2,
        barrelRate: 20,
        hardHitRate: 60,
        exitVelo: 94,
        iso: 0.35,
        hrFBRatio: 8,
        pullRate: 45,
        last7HR: 3,
        last30HR: 9,
        hrScore: 80,
        hrScoreRank: 1,
      },
    ]);

    const ranges = buildHeatStatRanges(rows);
    const hot = getHeatCellStyle(60, ranges.hardHitRate);
    const cold = getHeatCellStyle(30, ranges.hardHitRate);

    expect(hot?.backgroundColor).toContain("220, 38, 38");
    expect(cold?.backgroundColor).toContain("37, 99, 235");
  });
});
