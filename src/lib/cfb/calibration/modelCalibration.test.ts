import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { CFB_TEAM_METADATA } from "@/data/cfb/teamMetadata";
import { CFB_V02_CANDIDATE_CONFIG } from "./config";
import {
  buildTeamStrengths,
  describe,
  splitCalibrationGames,
  standardizedCombinedRatings,
  zScore,
  type CalibrationGame,
} from "./modelCalibration";
import type { CfbTeamGamePerformance } from "../pipeline";

const games: CalibrationGame[] = [
  { gameId: "train", week: 2, date: "2025-09-01", gameType: "regular", homeTeamId: "a", awayTeamId: "b", homeScore: 35, awayScore: 14 },
  { gameId: "test", week: 10, date: "2025-11-01", gameType: "regular", homeTeamId: "b", awayTeamId: "a", homeScore: 10, awayScore: 28 },
];
const rows: CfbTeamGamePerformance[] = [
  { gameId: "train", teamId: "a", teamClassification: "fbs", opponentTeamId: "b", opponentClassification: "fbs", points: 35, pointsAllowed: 14, plays: 70, totalYards: 490, yardsPerPlay: 7, yardsPerPlayAllowed: 4, turnovers: 0 },
  { gameId: "train", teamId: "b", teamClassification: "fbs", opponentTeamId: "a", opponentClassification: "fbs", points: 14, pointsAllowed: 35, plays: 70, totalYards: 280, yardsPerPlay: 4, yardsPerPlayAllowed: 7, turnovers: 2 },
  { gameId: "test", teamId: "a", teamClassification: "fbs", opponentTeamId: "b", opponentClassification: "fbs", points: 28, pointsAllowed: 10, plays: 60, totalYards: 420, yardsPerPlay: 7, yardsPerPlayAllowed: 3, turnovers: 0 },
  { gameId: "test", teamId: "b", teamClassification: "fbs", opponentTeamId: "a", opponentClassification: "fbs", points: 10, pointsAllowed: 28, plays: 60, totalYards: 180, yardsPerPlay: 3, yardsPerPlayAllowed: 7, turnovers: 2 },
];

suite("CFB Phase 2C calibration", () => {
  it("standardizes unlike raw scales before applying weights", () => {
    const prior = zScore(7, describe([4, 5, 6, 7]));
    const returning = zScore(90, describe([30, 50, 70, 90]));
    expect(prior).toBeCloseTo(returning as number, 10);
    const weighted = (prior as number) * 0.9 + (returning as number) * 0.1;
    expect(weighted).toBeCloseTo(prior as number, 10);
  });

  it("keeps offense and defense higher-is-better, including allowed metrics", () => {
    const strengths = buildTeamStrengths({ teamIds: ["a", "b"], performances: rows.slice(0, 2), games: games.slice(0, 1), strength: 0, iterations: 3 });
    const ratings = standardizedCombinedRatings(strengths, "combined");
    expect(ratings.get("a")).toBeGreaterThan(ratings.get("b") as number);
    expect(strengths[0].adjustedYppDefenseAllowed).toBeLessThan(strengths[1].adjustedYppDefenseAllowed as number);
  });

  it("combines standardized offense and defense exactly 50/50", () => {
    const offense = 1.2, defense = -0.4;
    const offensiveContribution = offense * CFB_V02_CANDIDATE_CONFIG.power.offenseWeight;
    const defensiveContribution = defense * CFB_V02_CANDIDATE_CONFIG.power.defenseWeight;
    expect(offensiveContribution).toBe(0.6);
    expect(defensiveContribution).toBe(-0.2);
    expect(offensiveContribution + defensiveContribution).toBeCloseTo(0.4, 12);
  });

  it("prevents train/test leakage", () => {
    const split = splitCalibrationGames(games);
    expect(split.train.map((game) => game.gameId)).toEqual(["train"]);
    expect(split.test.map((game) => game.gameId)).toEqual(["test"]);
    const trainingIds = new Set(split.train.map((game) => game.gameId));
    expect(rows.filter((row) => trainingIds.has(row.gameId))).toHaveLength(2);
  });

  it("is deterministic across opponent-adjustment runs", () => {
    const options = { teamIds: ["a", "b"], performances: rows.slice(0, 2), games: games.slice(0, 1), strength: 0.35, iterations: 6 };
    expect(buildTeamStrengths(options)).toEqual(buildTeamStrengths(options));
  });

  it("preserves the checked v0.1 baseline artifact", () => {
    const path = resolve(process.cwd(), "data", "generated", "cfb", "2026-preseason-ratings.csv");
    const hash = createHash("sha256").update(readFileSync(path)).digest("hex");
    expect(hash).toBe("bfa74bef5b76ebf0fbf881555d4906769350d44750fe211c83f57e776ffcadc2");
  });

  it("contains no team-specific v0.2 exceptions", () => {
    const serialized = JSON.stringify(CFB_V02_CANDIDATE_CONFIG);
    for (const team of CFB_TEAM_METADATA) expect(serialized).not.toContain(`"${team.id}"`);
  });
});
