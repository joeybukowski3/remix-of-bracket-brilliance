import { describe, expect, it } from "vitest";
import { normalizeHrBestBetsPayload, normalizeHrPropRows } from "@/pages/MlbHrProps";

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
});
