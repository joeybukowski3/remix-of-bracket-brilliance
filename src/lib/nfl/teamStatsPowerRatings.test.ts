import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { NFL_SCHEMA_VERSION } from "../../../scripts/lib/nfl-data-meta.mjs";
import {
  MODEL_VERSION,
  RATING_WEIGHTS,
  buildSanityReport,
  computePowerRatings,
  computeTeamStats,
  runRatingsPipeline,
} from "../../../scripts/lib/nfl-team-ratings-core.mjs";

const ROOT = resolve(__dirname, "../../..");
const SEASONS = [2022, 2023, 2024, 2025, 2026];
const TEAMS_JSON = JSON.parse(readFileSync(join(ROOT, "public/data/nfl/teams.json"), "utf-8"));
const CANONICAL_IDS = new Set(TEAMS_JSON.teams.map((t: { id: string }) => t.id));

type ResultFixture = {
  gameId: string;
  season: number;
  week: number;
  seasonType: string;
  homeAbbr: string;
  awayAbbr: string;
  homeScore: number;
  awayScore: number;
  winner: string;
  final: boolean;
};

function reg(home: string, away: string, homeScore: number, awayScore: number, week = 1): ResultFixture {
  return {
    gameId: `f_${week}_${away}_${home}`,
    season: 2025,
    week,
    seasonType: "REG",
    homeAbbr: home,
    awayAbbr: away,
    homeScore,
    awayScore,
    winner: homeScore === awayScore ? "TIE" : homeScore > awayScore ? home : away,
    final: true,
  };
}

const FIXTURE_RESULTS: ResultFixture[] = [
  reg("buf", "mia", 30, 20),
  reg("nyj", "buf", 17, 17, 2),
  reg("mia", "nyj", 21, 14, 3),
];

function readGenerated(season: number, name: string) {
  return JSON.parse(readFileSync(join(ROOT, `public/data/nfl/${season}/${name}`), "utf-8"));
}

describe("computeTeamStats (fixtures)", () => {
  const stats = computeTeamStats(FIXTURE_RESULTS, TEAMS_JSON, 2025);
  const buf = stats.find((t: { abbr: string }) => t.abbr === "buf")!;
  const mia = stats.find((t: { abbr: string }) => t.abbr === "mia")!;

  it("calculates W/L/T from fixture results", () => {
    expect([buf.wins, buf.losses, buf.ties, buf.gamesPlayed]).toEqual([1, 0, 1, 2]);
    expect([mia.wins, mia.losses, mia.ties, mia.gamesPlayed]).toEqual([1, 1, 0, 2]);
  });

  it("calculates PF/PA/differential correctly", () => {
    expect(buf.pointsFor).toBe(30 + 17);
    expect(buf.pointsAgainst).toBe(20 + 17);
    expect(buf.pointDifferential).toBe(10);
  });

  it("calculates points per game and points allowed per game", () => {
    expect(buf.pointsPerGame).toBeCloseTo(23.5);
    expect(buf.pointsAllowedPerGame).toBeCloseTo(18.5);
    expect(buf.winPercentage).toBeCloseTo(0.75); // (1 + 0.5) / 2
  });

  it("ignores non-REG and non-final rows", () => {
    const playoff = { ...reg("buf", "mia", 40, 0), seasonType: "SB" };
    const pending = { ...reg("buf", "mia", 40, 0), final: false };
    const stats2 = computeTeamStats([playoff, pending], TEAMS_JSON, 2025);
    expect(stats2.find((t: { abbr: string }) => t.abbr === "buf")!.gamesPlayed).toBe(0);
  });

  it("hard-fails on an unknown team abbreviation", () => {
    const bad = [{ ...reg("buf", "mia", 10, 7), homeAbbr: "zzz" }];
    expect(() => computeTeamStats(bad, TEAMS_JSON, 2025)).toThrow(/Unknown team abbreviation "zzz"/);
  });

  it("emits advanced metrics as null (deferred, documented)", () => {
    expect(buf.offensiveEpaPerPlay).toBeNull();
    expect(buf.defensiveSuccessRate).toBeNull();
    expect(buf.yardsPerGame).toBeNull();
    expect(buf.turnoverDifferential).toBeNull();
  });
});

describe("computePowerRatings (fixtures)", () => {
  it("returns empty for a season with no completed games", () => {
    const stats = computeTeamStats([], TEAMS_JSON, 2026);
    expect(computePowerRatings(stats, 2026)).toEqual([]);
  });

  it("rates and ranks deterministically with explainable components", () => {
    // Give every team one game so the full field is ratable.
    const abbrs = TEAMS_JSON.teams.map((t: { abbr: string }) => t.abbr);
    const results: ResultFixture[] = [];
    for (let i = 0; i < abbrs.length; i += 2) {
      results.push(reg(abbrs[i], abbrs[i + 1], 30 - i, 10 + i));
    }
    const stats = computeTeamStats(results, TEAMS_JSON, 2025);
    const ratings = computePowerRatings(stats, 2025);
    expect(ratings).toHaveLength(32);
    expect(ratings[0].rank).toBe(1);
    expect(ratings[0].rating).toBeGreaterThanOrEqual(ratings[31].rating);
    for (const row of ratings) {
      expect(row.modelVersion).toBe(MODEL_VERSION);
      expect(row.scheduleAdjustment).toBeNull();
      expect(row.components.pointDifferentialPerGame.weight).toBe(RATING_WEIGHTS.pointDifferentialPerGame);
      expect(row.components.pointsPerGame.normalized).toBeGreaterThanOrEqual(0);
      expect(row.components.winPercentage.normalized).toBeLessThanOrEqual(100);
    }
    // Deterministic: same input, same output.
    expect(computePowerRatings(stats, 2025)).toEqual(ratings);
  });

  it("inverts the defensive metric so fewer points allowed scores higher", () => {
    const abbrs = TEAMS_JSON.teams.map((t: { abbr: string }) => t.abbr);
    const results: ResultFixture[] = [];
    for (let i = 0; i < abbrs.length; i += 2) {
      results.push(reg(abbrs[i], abbrs[i + 1], 20, 10 + i)); // later away teams allow more
    }
    const stats = computeTeamStats(results, TEAMS_JSON, 2025);
    const ratings = computePowerRatings(stats, 2025);
    const best = ratings.find((r: { abbr: string }) => r.abbr === abbrs[0])!; // allowed 10
    const worstDefAbbr = abbrs[abbrs.length - 2]; // home team that allowed the most
    const worst = ratings.find((r: { abbr: string }) => r.abbr === worstDefAbbr)!;
    expect(best.defenseRating).toBeGreaterThan(worst.defenseRating);
  });
});

describe("generated files (real pipeline output)", () => {
  it("exist for all seasons 2022-2026 with nfl-v0.1 _meta and modelVersion", () => {
    for (const season of SEASONS) {
      for (const name of ["team-stats.json", "power-ratings.json"]) {
        expect(existsSync(join(ROOT, `public/data/nfl/${season}/${name}`)), `${season}/${name}`).toBe(true);
        const parsed = readGenerated(season, name);
        expect(parsed._meta.schemaVersion).toBe(NFL_SCHEMA_VERSION);
        expect(parsed._meta.season).toBe(season);
      }
      expect(readGenerated(season, "power-ratings.json")._meta.modelVersion).toBe(MODEL_VERSION);
      expect(readGenerated(season, "power-ratings.json")._meta.notes.join(" ")).toContain("60% point differential");
    }
  });

  it("all generated teams resolve to canonical teams", () => {
    for (const season of SEASONS) {
      const stats = readGenerated(season, "team-stats.json").teamStats;
      expect(stats).toHaveLength(32);
      for (const row of stats) expect(CANONICAL_IDS.has(row.teamId), `${season} ${row.teamId}`).toBe(true);
    }
  });

  it("2022 cancelled BUF-CIN produces 16-game Buffalo/Cincinnati records", () => {
    const stats = readGenerated(2022, "team-stats.json").teamStats;
    const buf = stats.find((t: { abbr: string }) => t.abbr === "buf")!;
    const cin = stats.find((t: { abbr: string }) => t.abbr === "cin")!;
    expect(buf.gamesPlayed).toBe(16);
    expect(cin.gamesPlayed).toBe(16);
    const others = stats.filter((t: { abbr: string }) => t.abbr !== "buf" && t.abbr !== "cin");
    for (const team of others) expect(team.gamesPlayed).toBe(17);
  });

  it("2026 no-results state generates safe placeholders, nothing invented", () => {
    const stats = readGenerated(2026, "team-stats.json");
    const ratings = readGenerated(2026, "power-ratings.json");
    expect(stats.teamStats).toHaveLength(32);
    for (const team of stats.teamStats) {
      expect(team.gamesPlayed).toBe(0);
      expect(team.pointsPerGame).toBeNull();
      expect(team.winPercentage).toBeNull();
    }
    expect(ratings.ratings).toEqual([]);
    expect(ratings._meta.notes.join(" ")).toContain("No final 2026 games exist yet");
  });

  it("completed seasons rate all 32 teams with rating components present", () => {
    for (const season of [2022, 2023, 2024, 2025]) {
      const ratings = readGenerated(season, "power-ratings.json").ratings;
      expect(ratings).toHaveLength(32);
      expect(ratings.map((r: { rank: number }) => r.rank)).toEqual([...Array(32)].map((_, i) => i + 1));
      for (const row of ratings) {
        expect(row.modelVersion).toBe(MODEL_VERSION);
        expect(row.components.pointDifferentialPerGame).toBeDefined();
        expect(row.components.pointsPerGame).toBeDefined();
        expect(row.components.winPercentage).toBeDefined();
        expect(row.offenseRating).not.toBeNull();
        expect(row.defenseRating).not.toBeNull();
      }
    }
  });

  it("generates no betting/odds/picks fields anywhere", () => {
    for (const season of SEASONS) {
      for (const name of ["team-stats.json", "power-ratings.json"]) {
        const text = readFileSync(join(ROOT, `public/data/nfl/${season}/${name}`), "utf-8");
        expect(text).not.toMatch(/moneyline|spread_line|"odds"|bettingEdge|"pick"|"picks"|clv/i);
      }
    }
  });
});

describe("runRatingsPipeline (temp dirs)", () => {
  function makeInputDir(results: ResultFixture[], season: number) {
    const dir = mkdtempSync(join(tmpdir(), "nfl-ratings-in-"));
    writeFileSync(join(dir, "teams.json"), JSON.stringify(TEAMS_JSON));
    mkdirSync(join(dir, String(season)), { recursive: true });
    writeFileSync(join(dir, String(season), "results.json"), JSON.stringify({ results }));
    return dir;
  }

  it("dry-run writes nothing", () => {
    const inputDir = makeInputDir(FIXTURE_RESULTS, 2025);
    const outputDir = mkdtempSync(join(tmpdir(), "nfl-ratings-out-"));
    try {
      const summaries = runRatingsPipeline({ inputDir, outputDir, seasons: [2025], dryRun: true });
      expect(summaries[0].written).toEqual([]);
      expect(readdirSync(outputDir)).toHaveLength(0);
    } finally {
      rmSync(inputDir, { recursive: true, force: true });
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("repeated runs are deterministic except generatedAt", () => {
    const inputDir = makeInputDir(FIXTURE_RESULTS, 2025);
    const outA = mkdtempSync(join(tmpdir(), "nfl-ratings-a-"));
    const outB = mkdtempSync(join(tmpdir(), "nfl-ratings-b-"));
    try {
      runRatingsPipeline({ inputDir, outputDir: outA, seasons: [2025] });
      runRatingsPipeline({ inputDir, outputDir: outB, seasons: [2025] });
      const normalize = (dir: string, name: string) =>
        readFileSync(join(dir, "2025", name), "utf-8").replace(/"generatedAt": "[^"]+"/, '"generatedAt": "X"');
      expect(normalize(outA, "power-ratings.json")).toBe(normalize(outB, "power-ratings.json"));
      expect(normalize(outA, "team-stats.json")).toBe(normalize(outB, "team-stats.json"));
    } finally {
      rmSync(inputDir, { recursive: true, force: true });
      rmSync(outA, { recursive: true, force: true });
      rmSync(outB, { recursive: true, force: true });
    }
  });
});

describe("sanity report", () => {
  it("includes top/bottom teams, Super Bowl ranks and disagreements for real 2025 data", () => {
    const resultsRows = JSON.parse(readFileSync(join(ROOT, "public/data/nfl/2025/results.json"), "utf-8")).results;
    const stats = readGenerated(2025, "team-stats.json").teamStats;
    const ratings = readGenerated(2025, "power-ratings.json").ratings;
    const report = buildSanityReport(ratings, stats, resultsRows, 2025);
    expect(report.available).toBe(true);
    expect(report.top10).toHaveLength(10);
    expect(report.bottom10).toHaveLength(10);
    expect(report.top10[0].rank).toBe(1);
    expect(report.superBowl?.teams).toHaveLength(2);
    expect(report.playoffTeamCount).toBe(14);
    expect(report.biggestDisagreements.length).toBeGreaterThan(0);
  });

  it("marks unavailable seasons instead of inventing output", () => {
    const report = buildSanityReport([], [], [], 2026);
    expect(report).toEqual({ season: 2026, available: false });
  });
});
