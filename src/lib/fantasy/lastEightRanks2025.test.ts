import { describe, expect, it } from "vitest";
import { FANTASY_RANKINGS } from "@/lib/fantasy/rankings";
import {
  LAST_EIGHT_RANKS_META,
  buildRosLastEightRankIndex,
  getLastEightRank,
} from "@/lib/fantasy/lastEightRanks2025";

describe("ROS L8 artifact join", () => {
  it("carries approved scoring and regular-season provenance", () => {
    expect(LAST_EIGHT_RANKS_META).toMatchObject({
      schemaVersion: "fantasy-ros-last8-points-v2",
      seasons: [2025],
      scoringVersion: "jkb-full-ppr-v1.0.0",
      summaryBasis: expect.stringMatching(/Total fantasy points/i),
      consumerRankBasis: expect.stringMatching(/JKB ROS board.*within canonical position/i),
      eligibility: expect.stringMatching(/2025 REG.*prior seasons.*postseason excluded/i),
    });
  });

  it("joins through the canonical historical identity and preserves sample evidence", () => {
    const allen = FANTASY_RANKINGS.rows.find((row) => row.player === "Josh Allen")!;
    expect(getLastEightRank(allen)).toMatchObject({
      playerId: "gsis:00-0034857",
      position: "QB",
      sampleSize: 8,
    });
  });

  it("returns undefined for a player with no valid historical sample", () => {
    const rookie = FANTASY_RANKINGS.rows.find((row) => row.player === "Jeremiyah Love")!;
    expect(getLastEightRank(rookie)).toBeUndefined();
  });

  it("uses 2025-only samples for the validated boundary cases", () => {
    const row = (player: string) => FANTASY_RANKINGS.rows.find((candidate) => candidate.player === player)!;

    expect(getLastEightRank(row("Jahmyr Gibbs"))).toMatchObject({ sampleSize: 8, totalPoints: 182.9 });
    expect(getLastEightRank(row("Garrett Wilson"))).toMatchObject({ sampleSize: 7, totalPoints: 99.5 });
    const blue = getLastEightRank(row("Jaydon Blue"));
    expect(blue).toMatchObject({ sampleSize: 5 });
    expect(blue?.totalPoints).toBeCloseTo(20.4);
    expect(getLastEightRank(row("Jonathon Brooks"))).toBeUndefined();
  });

  it("keeps prepared ranks unchanged when the consumer row order changes", () => {
    const normal = buildRosLastEightRankIndex(FANTASY_RANKINGS.rows);
    const reversed = buildRosLastEightRankIndex([...FANTASY_RANKINGS.rows].reverse());
    for (const row of FANTASY_RANKINGS.rows) {
      expect(reversed.get(row.overallRank)).toEqual(normal.get(row.overallRank));
    }
  });
});
