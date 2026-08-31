import { describe, expect, it } from "vitest";
import { buildCompletedSeasonSosReferences } from "./completedSeasonSosReference";
import type { CanonicalNflTeam, NflResultRecord } from "@/lib/nfl/standings";

const teams = ["A", "B", "C"].map((abbr) => ({
  id: abbr,
  slug: abbr.toLowerCase(),
  abbr,
  nflverseAbbr: abbr,
  name: abbr,
  fullName: abbr,
  shortName: abbr,
  conference: "AFC" as const,
  division: "Test",
  primaryColor: "#000000",
  logoUrl: "",
  isDome: false,
  latitude: 0,
  longitude: 0,
})) satisfies CanonicalNflTeam[];

const game = (gameId: string, homeAbbr: string, awayAbbr: string, winner: string): NflResultRecord => ({
  gameId,
  season: 2025,
  week: Number(gameId),
  seasonType: "REG",
  homeAbbr,
  awayAbbr,
  homeScore: winner === homeAbbr ? 20 : 10,
  awayScore: winner === awayAbbr ? 20 : 10,
  winner,
  final: true,
});

describe("completed-season SOS reference", () => {
  it("uses only completed 2025 results and ranks harder opponent records first", () => {
    const references = buildCompletedSeasonSosReferences(
      [game("1", "A", "B", "B"), game("2", "A", "C", "C"), game("3", "B", "C", "B")],
      teams,
      2025
    );

    expect(references.get("A")).toMatchObject({ season: 2025, opponentWinPct: 0.75, rank: 1, games: 2 });
    expect(references.get("B")).toMatchObject({ season: 2025, opponentWinPct: 0.25, rank: 3, games: 2 });
  });

  it("ignores other seasons and has no model or resolver input", () => {
    const wrongSeason = { ...game("4", "A", "B", "A"), season: 2026 };
    const references = buildCompletedSeasonSosReferences([wrongSeason], teams, 2025);
    expect(references.get("A")).toMatchObject({ opponentWinPct: null, rank: null, games: 0 });
  });
});
