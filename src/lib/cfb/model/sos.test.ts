import { describe, expect, it } from "vitest";
import {
  computeRawSosForAllTeams,
  computeRawSosForTeam,
  computeSosDisplay,
  toSosGameInputs,
} from "./sos";
import type { CfbGame } from "@/data/cfb/types";
import type { CfbSosGameInput } from "./types";

function game(overrides: Partial<CfbGame> & { id: string; awayTeamId: string; homeTeamId: string }): CfbGame {
  return {
    season: 2026,
    week: 1,
    date: "2026-08-29",
    time: null,
    neutralSite: false,
    venue: null,
    tvNetwork: null,
    gameStatus: "scheduled",
    awayScore: null,
    homeScore: null,
    odds: {
      openingSpread: null,
      currentSpread: null,
      awayMoneyline: null,
      homeMoneyline: null,
      openingTotal: null,
      currentTotal: null,
    },
    model: {
      jkbProjectedSpread: null,
      jkbProjectedTotal: null,
      homeWinProbability: null,
      awayWinProbability: null,
      neutralPowerDifference: null,
      homeFieldAdjustment: null,
      jkbPowerLine: null,
    },
    ...overrides,
  };
}

describe("computeRawSosForTeam", () => {
  it("returns a safe null state when the team has no schedule", () => {
    const result = computeRawSosForTeam("solo", [], new Map());
    expect(result.playedOpponentStrength).toBeNull();
    expect(result.remainingOpponentStrength).toBeNull();
    expect(result.gamesPlayedCount).toBe(0);
    expect(result.gamesRemainingCount).toBe(0);
  });

  it("preseason: SOS Played is null when no games are final", () => {
    const rows: CfbSosGameInput[] = [
      { gameId: "g1", teamId: "a", opponentTeamId: "b", location: "home", date: "2026-08-29", gameStatus: "scheduled" },
      { gameId: "g2", teamId: "a", opponentTeamId: "c", location: "away", date: "2026-09-05", gameStatus: "scheduled" },
    ];
    const ratings = new Map([["b", 70], ["c", 80]]);
    const result = computeRawSosForTeam("a", rows, ratings);
    expect(result.playedOpponentStrength).toBeNull();
    expect(result.remainingOpponentStrength).toBeCloseTo(75);
  });

  it("moves completed games from remaining into played SOS", () => {
    const rows: CfbSosGameInput[] = [
      { gameId: "g1", teamId: "a", opponentTeamId: "b", location: "home", date: "2026-08-29", gameStatus: "final" },
      { gameId: "g2", teamId: "a", opponentTeamId: "c", location: "away", date: "2026-09-05", gameStatus: "scheduled" },
    ];
    const ratings = new Map([["b", 60], ["c", 90]]);
    const result = computeRawSosForTeam("a", rows, ratings);
    expect(result.playedOpponentStrength).toBeCloseTo(60);
    expect(result.remainingOpponentStrength).toBeCloseTo(90);
    expect(result.gamesPlayedCount).toBe(1);
    expect(result.gamesRemainingCount).toBe(1);
  });

  it("fails safely on an unknown opponent (skips it rather than throwing or treating it as zero)", () => {
    const rows: CfbSosGameInput[] = [
      { gameId: "g1", teamId: "a", opponentTeamId: "unknown-team", location: "home", date: "2026-08-29", gameStatus: "final" },
      { gameId: "g2", teamId: "a", opponentTeamId: "b", location: "away", date: "2026-09-05", gameStatus: "final" },
    ];
    const ratings = new Map([["b", 88]]); // "unknown-team" intentionally absent
    expect(() => computeRawSosForTeam("a", rows, ratings)).not.toThrow();
    const result = computeRawSosForTeam("a", rows, ratings);
    expect(result.playedOpponentStrength).toBeCloseTo(88);
  });

  it("returns null when every opponent is unknown, rather than 0", () => {
    const rows: CfbSosGameInput[] = [
      { gameId: "g1", teamId: "a", opponentTeamId: "unknown", location: "home", date: "2026-08-29", gameStatus: "final" },
    ];
    const result = computeRawSosForTeam("a", rows, new Map());
    expect(result.playedOpponentStrength).toBeNull();
  });

  it("excludes postponed and canceled games from both played and remaining", () => {
    const rows: CfbSosGameInput[] = [
      { gameId: "g1", teamId: "a", opponentTeamId: "b", location: "home", date: "2026-08-29", gameStatus: "postponed" },
      { gameId: "g2", teamId: "a", opponentTeamId: "c", location: "away", date: "2026-09-05", gameStatus: "canceled" },
    ];
    const ratings = new Map([["b", 70], ["c", 80]]);
    const result = computeRawSosForTeam("a", rows, ratings);
    expect(result.playedOpponentStrength).toBeNull();
    expect(result.remainingOpponentStrength).toBeNull();
  });

  it("supports neutral-site games without special-casing them out of the average", () => {
    const rows: CfbSosGameInput[] = [
      { gameId: "g1", teamId: "a", opponentTeamId: "b", location: "neutral", date: "2026-08-29", gameStatus: "final" },
    ];
    const ratings = new Map([["b", 65]]);
    const result = computeRawSosForTeam("a", rows, ratings);
    expect(result.playedOpponentStrength).toBeCloseTo(65);
  });
});

describe("computeRawSosForAllTeams", () => {
  it("stronger opponents produce a harder (higher) raw SOS value", () => {
    const rows: CfbSosGameInput[] = [
      { gameId: "g1", teamId: "easy", opponentTeamId: "weak", location: "home", date: "2026-08-29", gameStatus: "final" },
      { gameId: "g2", teamId: "hard", opponentTeamId: "strong", location: "home", date: "2026-08-29", gameStatus: "final" },
    ];
    const ratings = new Map([["weak", 40], ["strong", 95]]);
    const results = computeRawSosForAllTeams(["easy", "hard"], rows, ratings);
    const easy = results.find((r) => r.teamId === "easy")!;
    const hard = results.find((r) => r.teamId === "hard")!;
    expect(hard.playedOpponentStrength!).toBeGreaterThan(easy.playedOpponentStrength!);
  });
});

describe("computeSosDisplay", () => {
  it("assigns rank #1 to the hardest schedule", () => {
    const display = computeSosDisplay([
      { teamId: "easy", playedOpponentStrength: 40, remainingOpponentStrength: null, gamesPlayedCount: 1, gamesRemainingCount: 0 },
      { teamId: "hard", playedOpponentStrength: 95, remainingOpponentStrength: null, gamesPlayedCount: 1, gamesRemainingCount: 0 },
      { teamId: "mid", playedOpponentStrength: 70, remainingOpponentStrength: null, gamesPlayedCount: 1, gamesRemainingCount: 0 },
    ]);
    const hard = display.find((d) => d.teamId === "hard")!;
    const easy = display.find((d) => d.teamId === "easy")!;
    expect(hard.sosPlayedRank).toBe(1);
    expect(easy.sosPlayedRank).toBe(3);
    expect(hard.sosPlayedRating!).toBeGreaterThan(easy.sosPlayedRating!);
  });

  it("keeps sosPlayedRating/Rank null preseason (no completed games) while remaining is populated", () => {
    const display = computeSosDisplay([
      { teamId: "a", playedOpponentStrength: null, remainingOpponentStrength: 70, gamesPlayedCount: 0, gamesRemainingCount: 5 },
    ]);
    expect(display[0].sosPlayedRating).toBeNull();
    expect(display[0].sosPlayedRank).toBeNull();
    expect(display[0].sosRemainingRating).not.toBeNull();
  });
});

describe("toSosGameInputs", () => {
  it("expands a game slate into one row per team with correct home/away/neutral location", () => {
    const games: CfbGame[] = [
      game({ id: "g1", awayTeamId: "a", homeTeamId: "b", neutralSite: false }),
      game({ id: "g2", awayTeamId: "c", homeTeamId: "d", neutralSite: true }),
    ];
    const rows = toSosGameInputs(games);
    expect(rows).toHaveLength(4);
    const g1Away = rows.find((r) => r.gameId === "g1" && r.teamId === "a")!;
    const g1Home = rows.find((r) => r.gameId === "g1" && r.teamId === "b")!;
    expect(g1Away.location).toBe("away");
    expect(g1Home.location).toBe("home");
    const g2Away = rows.find((r) => r.gameId === "g2" && r.teamId === "c")!;
    expect(g2Away.location).toBe("neutral");
  });
});
