import { describe, expect, it } from "vitest";
import {
  buildLastEightPointsRanks,
  type LastEightEligibleGame,
} from "@/lib/fantasy/lastEightPoints";

function game(
  playerId: string,
  playerName: string,
  position: LastEightEligibleGame["position"],
  week: number,
  fantasyPoints: number,
  seasonType = "REG",
): LastEightEligibleGame {
  return { season: 2025, week, seasonType, playerId, playerName, position, fantasyPoints };
}

describe("buildLastEightPointsRanks", () => {
  it("uses only the latest eight eligible regular-season games", () => {
    const rows = Array.from({ length: 10 }, (_, index) =>
      game("gsis:a", "Player A", "WR", index + 1, index + 1),
    );
    const [result] = buildLastEightPointsRanks(rows);
    expect(result.sampleSize).toBe(8);
    expect(result.games.map((row) => row.week)).toEqual([10, 9, 8, 7, 6, 5, 4, 3]);
    expect(result.totalPoints).toBe(52);
  });

  it("uses an available sample smaller than eight and excludes postseason", () => {
    const result = buildLastEightPointsRanks([
      game("gsis:a", "Player A", "RB", 17, 12),
      game("gsis:a", "Player A", "RB", 18, 8),
      game("gsis:a", "Player A", "RB", 19, 999, "POST"),
    ])[0];
    expect(result).toMatchObject({ sampleSize: 2, totalPoints: 20, rank: 1 });
  });

  it("uses only available 2025 games and never fills the sample from prior seasons", () => {
    const rows = [
      { ...game("gsis:a", "Player A", "RB", 2, 20), season: 2025 },
      { ...game("gsis:a", "Player A", "RB", 1, 10), season: 2025 },
      ...Array.from({ length: 8 }, (_, index) => ({
        ...game("gsis:a", "Player A", "RB", index + 1, 1),
        season: 2024,
      })),
    ];
    const result = buildLastEightPointsRanks(rows)[0];
    expect(result.sampleSize).toBe(2);
    expect(result.totalPoints).toBe(30);
    expect(result.games.map(({ season, week }) => `${season}-${week}`)).toEqual([
      "2025-2", "2025-1",
    ]);
  });

  it("has no output when a player has no eligible 2025 game", () => {
    expect(buildLastEightPointsRanks([
      { ...game("gsis:a", "Player A", "RB", 18, 20), season: 2024 },
    ])).toEqual([]);
  });

  it("ranks total points rather than last-eight PPG", () => {
    const rows = [
      ...Array.from({ length: 8 }, (_, index) => game("gsis:a", "Volume", "TE", index + 1, 10)),
      game("gsis:b", "Short Sample", "TE", 17, 30),
      game("gsis:b", "Short Sample", "TE", 18, 30),
    ];
    const ranked = buildLastEightPointsRanks(rows);
    expect(ranked.find((row) => row.playerId === "gsis:a")).toMatchObject({ totalPoints: 80, rank: 1 });
    expect(ranked.find((row) => row.playerId === "gsis:b")).toMatchObject({ totalPoints: 60, rank: 2 });
  });

  it("ranks within position and resolves tied ordering deterministically", () => {
    const input = [
      game("gsis:z", "Zed", "QB", 1, 20),
      game("gsis:a", "Alpha", "QB", 1, 20),
      game("gsis:r", "Runner", "RB", 1, 5),
    ];
    const forward = buildLastEightPointsRanks(input);
    const reverse = buildLastEightPointsRanks([...input].reverse());
    expect(forward).toEqual(reverse);
    expect(forward.filter((row) => row.position === "QB").map((row) => [row.playerId, row.rank])).toEqual([
      ["gsis:a", 1],
      ["gsis:z", 1],
    ]);
    expect(forward.find((row) => row.position === "RB")?.rank).toBe(1);
  });

  it("has no output for a player without a valid eligible sample", () => {
    const ranked = buildLastEightPointsRanks([
      game("gsis:a", "Player A", "WR", 19, 20, "POST"),
      game("", "Missing identity", "WR", 1, 20),
    ]);
    expect(ranked).toEqual([]);
  });
});
