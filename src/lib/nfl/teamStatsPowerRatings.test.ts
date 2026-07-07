import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { NFL_SCHEMA_VERSION } from "../../../scripts/lib/nfl-data-meta.mjs";
import {
  FORMULA_TIERS,
  MODEL_VERSION,
  applyScheduleStrength,
  buildSanityReport,
  computePowerRatings,
  computeTeamStats,
  runRatingsPipeline,
} from "../../../scripts/lib/nfl-team-ratings-core.mjs";
import { computeAdvancedTeamMetrics } from "../../../scripts/lib/nfl-advanced-stats.mjs";

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

// buf +20 diff vs mia; ne +7 vs nyj — hand-checkable schedule strengths.
const SCHEDULE_FIXTURE: ResultFixture[] = [
  reg("buf", "mia", 30, 10),
  reg("ne", "nyj", 21, 14),
];

const ADVANCED_FIXTURE_CSV = [
  "season,week,team,season_type,opponent_team,attempts,sacks_suffered,carries,passing_yards,rushing_yards,passing_interceptions,sack_fumbles_lost,rushing_fumbles_lost,receiving_fumbles_lost,passing_epa,rushing_epa,def_interceptions,fumble_recovery_opp",
  "2025,1,BUF,REG,MIA,30,2,28,250,150,1,0,0,0,8.5,1.5,2,1",
  "2025,1,MIA,REG,BUF,32,4,24,200,100,2,1,0,0,-4.0,-2.0,1,0",
].join("\n");

function readGenerated(season: number, name: string) {
  return JSON.parse(readFileSync(join(ROOT, `public/data/nfl/${season}/${name}`), "utf-8"));
}

describe("advanced metrics from nflverse stats_team fixture", () => {
  const metrics = computeAdvancedTeamMetrics(ADVANCED_FIXTURE_CSV, 2025, TEAMS_JSON)!;

  it("computes offensive EPA/play, yards/play and turnovers", () => {
    const buf = metrics.get("buf")!;
    expect(buf.offensiveEpaPerPlay).toBeCloseTo(10 / 60, 3); // (8.5+1.5)/(30+2+28)
    expect(buf.yardsPerPlay).toBeCloseTo(400 / 60, 2);
    expect(buf.turnovers).toBe(1);
    expect(buf.takeaways).toBe(3);
    expect(buf.turnoverDifferential).toBe(2);
  });

  it("derives defensive EPA/play from the opponent's offense", () => {
    const buf = metrics.get("buf")!;
    expect(buf.defensiveEpaPerPlay).toBeCloseTo(-6 / 60, 3); // mia offense: -6 EPA on 60 plays
    const mia = metrics.get("mia")!;
    expect(mia.defensiveEpaPerPlay).toBeCloseTo(10 / 60, 3);
  });

  it("returns null for missing/empty source (season not published)", () => {
    expect(computeAdvancedTeamMetrics(null, 2026, TEAMS_JSON)).toBeNull();
    expect(computeAdvancedTeamMetrics("season,week\n", 2026, TEAMS_JSON)).toBeNull();
  });

  it("hard-fails on unknown team codes", () => {
    const bad = ADVANCED_FIXTURE_CSV.replace("2025,1,BUF,REG,MIA", "2025,1,XXX,REG,MIA");
    expect(() => computeAdvancedTeamMetrics(bad, 2025, TEAMS_JSON)).toThrow(/Unknown nflverse team code "XXX"/);
  });

  it("consumes no betting columns (source scan)", () => {
    const source = readFileSync(join(ROOT, "scripts/lib/nfl-advanced-stats.mjs"), "utf-8");
    expect(source).not.toMatch(/row\.(spread|moneyline|odds|total_line)/);
    const core = readFileSync(join(ROOT, "scripts/lib/nfl-team-ratings-core.mjs"), "utf-8");
    expect(core).not.toMatch(/row\.(spread|moneyline|odds|total_line)/);
  });
});

describe("schedule strength (fixture)", () => {
  it("averages opponents' point differential per game and normalizes 0-100", () => {
    const stats = computeTeamStats(SCHEDULE_FIXTURE, TEAMS_JSON, 2025);
    const by = new Map(stats.map((t: { abbr: string }) => [t.abbr, t]));
    expect((by.get("buf") as { scheduleStrength: number }).scheduleStrength).toBeCloseTo(-20); // played mia (-20/gm)
    expect((by.get("mia") as { scheduleStrength: number }).scheduleStrength).toBeCloseTo(20);
    expect((by.get("buf") as { scheduleAdjustment: number }).scheduleAdjustment).toBe(0);
    expect((by.get("mia") as { scheduleAdjustment: number }).scheduleAdjustment).toBe(100);
    expect((by.get("nyj") as { scheduleAdjustment: number }).scheduleAdjustment).toBeCloseTo(67.5);
    expect((by.get("ne") as { scheduleAdjustment: number }).scheduleAdjustment).toBeCloseTo(32.5);
  });

  it("leaves schedule fields null for teams without games", () => {
    const stats = computeTeamStats(SCHEDULE_FIXTURE, TEAMS_JSON, 2025);
    const idle = stats.find((t: { abbr: string }) => t.abbr === "kc")!;
    expect(idle.scheduleStrength).toBeNull();
    expect(idle.scheduleAdjustment).toBeNull();
  });
});

describe("formula tiers", () => {
  it("every tier's weights sum to 1", () => {
    for (const [tier, weights] of Object.entries(FORMULA_TIERS)) {
      const sum = Object.values(weights as Record<string, number>).reduce((a, b) => a + b, 0);
      expect(sum, tier).toBeCloseTo(1);
    }
  });

  it("uses v0.2-epa when advanced metrics are available", () => {
    const advanced = computeAdvancedTeamMetrics(ADVANCED_FIXTURE_CSV, 2025, TEAMS_JSON);
    const stats = computeTeamStats([reg("buf", "mia", 30, 10)], TEAMS_JSON, 2025, advanced);
    const { tier, ratings } = computePowerRatings(stats, 2025);
    expect(tier).toBe("v0.2-epa");
    expect(ratings[0].components.offensiveEpaPerPlay).toBeDefined();
    expect(ratings[0].components.scheduleAdjustment).toBeDefined();
  });

  it("falls back to v0.2-schedule when advanced metrics are unavailable", () => {
    const stats = computeTeamStats(SCHEDULE_FIXTURE, TEAMS_JSON, 2025);
    const { tier, ratings } = computePowerRatings(stats, 2025);
    expect(tier).toBe("v0.2-schedule");
    expect(ratings[0].components.pointsPerGame).toBeDefined();
    expect(ratings[0].components.offensiveEpaPerPlay).toBeUndefined();
  });

  it("falls back to v0.1 weights when schedule data is also unavailable", () => {
    const stats = computeTeamStats(SCHEDULE_FIXTURE, TEAMS_JSON, 2025).map((t: object) => ({
      ...t,
      scheduleAdjustment: null,
      scheduleStrength: null,
    }));
    const { tier, weights, ratings } = computePowerRatings(stats, 2025);
    expect(tier).toBe("v0.1-fallback");
    expect(weights).toEqual(FORMULA_TIERS["v0.1-fallback"]);
    expect(ratings[0].scheduleAdjustment).toBeNull();
  });

  it("inverts defensive EPA so a better defense rates higher", () => {
    const advanced = computeAdvancedTeamMetrics(ADVANCED_FIXTURE_CSV, 2025, TEAMS_JSON);
    const stats = computeTeamStats([reg("buf", "mia", 30, 10)], TEAMS_JSON, 2025, advanced);
    const { ratings } = computePowerRatings(stats, 2025);
    const buf = ratings.find((r: { abbr: string }) => r.abbr === "buf")!;
    const mia = ratings.find((r: { abbr: string }) => r.abbr === "mia")!;
    // buf allowed -6 EPA (great defense), mia allowed +10 EPA (bad defense).
    expect(buf.defenseRating).toBeGreaterThan(mia.defenseRating);
    expect(buf.defenseRating).toBe(100);
  });

  it("is deterministic for identical inputs", () => {
    const stats = computeTeamStats(SCHEDULE_FIXTURE, TEAMS_JSON, 2025);
    expect(computePowerRatings(stats, 2025)).toEqual(computePowerRatings(stats, 2025));
  });
});

describe("generated files (real v0.2 pipeline output)", () => {
  it("exist for all seasons with nfl-v0.1 meta schema and v0.2 modelVersion", () => {
    for (const season of SEASONS) {
      for (const name of ["team-stats.json", "power-ratings.json"]) {
        expect(existsSync(join(ROOT, `public/data/nfl/${season}/${name}`)), `${season}/${name}`).toBe(true);
        const parsed = readGenerated(season, name);
        expect(parsed._meta.schemaVersion).toBe(NFL_SCHEMA_VERSION);
        expect(parsed.model.modelVersion).toBe(MODEL_VERSION);
      }
      const ratings = readGenerated(season, "power-ratings.json");
      expect(ratings._meta.modelVersion).toBe(MODEL_VERSION);
      expect(ratings._meta.notes.join(" ")).toContain("pointDifferentialPerGame");
      expect(ratings._meta.notes.join(" ")).toContain("not validated and not betting guidance");
      expect(ratings.model.scheduleAdjustmentMethod).toContain("opponents");
    }
  });

  it("completed seasons rate all 32 teams at tier v0.2-epa with real advanced metrics", () => {
    for (const season of [2022, 2023, 2024, 2025]) {
      const ratings = readGenerated(season, "power-ratings.json");
      expect(ratings.model.formula).toBe("v0.2-epa");
      expect(ratings.model.advancedMetricsAvailable).toBe(true);
      expect(ratings.ratings).toHaveLength(32);
      const stats = readGenerated(season, "team-stats.json").teamStats;
      for (const team of stats) {
        expect(team.offensiveEpaPerPlay).not.toBeNull();
        expect(team.defensiveEpaPerPlay).not.toBeNull();
        expect(team.scheduleStrength).not.toBeNull();
        expect(team.offensiveSuccessRate).toBeNull(); // needs pbp — documented
        expect(CANONICAL_IDS.has(team.teamId)).toBe(true);
      }
      for (const row of ratings.ratings) {
        expect(row.scheduleAdjustment).not.toBeNull();
        for (const component of Object.values(row.components) as { weight: number; normalized?: number }[]) {
          expect(component.weight).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("2026 remains unrated with null advanced/schedule fields (nothing invented)", () => {
    const stats = readGenerated(2026, "team-stats.json");
    const ratings = readGenerated(2026, "power-ratings.json");
    expect(ratings.ratings).toEqual([]);
    expect(ratings.model.advancedMetricsAvailable).toBe(false);
    expect(ratings._meta.notes.join(" ")).toContain("No final 2026 games exist yet");
    for (const team of stats.teamStats) {
      expect(team.gamesPlayed).toBe(0);
      expect(team.offensiveEpaPerPlay).toBeNull();
      expect(team.scheduleStrength).toBeNull();
    }
  });

  it("generates no betting/odds/picks fields or language anywhere", () => {
    for (const season of SEASONS) {
      for (const name of ["team-stats.json", "power-ratings.json"]) {
        const text = readFileSync(join(ROOT, `public/data/nfl/${season}/${name}`), "utf-8");
        expect(text).not.toMatch(/"(odds|spread|moneyline|edge|pick|picks|clv)"/i);
        expect(text).not.toMatch(/bettingEdge|best bet|lock of the/i);
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

  it("dry-run writes nothing", async () => {
    const inputDir = makeInputDir(SCHEDULE_FIXTURE, 2025);
    const outputDir = mkdtempSync(join(tmpdir(), "nfl-ratings-out-"));
    try {
      const summaries = await runRatingsPipeline({ inputDir, outputDir, seasons: [2025], dryRun: true });
      expect(summaries[0].written).toEqual([]);
      expect(summaries[0].tier).toBe("v0.2-schedule");
      expect(readdirSync(outputDir)).toHaveLength(0);
    } finally {
      rmSync(inputDir, { recursive: true, force: true });
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("repeated runs are deterministic except generatedAt", async () => {
    const inputDir = makeInputDir(SCHEDULE_FIXTURE, 2025);
    const outA = mkdtempSync(join(tmpdir(), "nfl-det-a-"));
    const outB = mkdtempSync(join(tmpdir(), "nfl-det-b-"));
    try {
      const loadAdvanced = async () => computeAdvancedTeamMetrics(ADVANCED_FIXTURE_CSV, 2025, TEAMS_JSON);
      await runRatingsPipeline({ inputDir, outputDir: outA, seasons: [2025], loadAdvanced });
      await runRatingsPipeline({ inputDir, outputDir: outB, seasons: [2025], loadAdvanced });
      const normalizeFile = (dir: string, name: string) =>
        readFileSync(join(dir, "2025", name), "utf-8").replace(/"generatedAt": "[^"]+"/, '"generatedAt": "X"');
      expect(normalizeFile(outA, "power-ratings.json")).toBe(normalizeFile(outB, "power-ratings.json"));
      expect(normalizeFile(outA, "team-stats.json")).toBe(normalizeFile(outB, "team-stats.json"));
    } finally {
      rmSync(inputDir, { recursive: true, force: true });
      rmSync(outA, { recursive: true, force: true });
      rmSync(outB, { recursive: true, force: true });
    }
  });

  it("unknown teams in results fail clearly", () => {
    const bad = [{ ...reg("buf", "mia", 10, 7), homeAbbr: "zzz" }];
    expect(() => computeTeamStats(bad, TEAMS_JSON, 2025)).toThrow(/Unknown team abbreviation "zzz"/);
  });
});

describe("sanity report (v0.2)", () => {
  it("includes top/bottom, schedule strength, risers/fallers and SB ranks for real 2025 data", () => {
    const resultsRows = JSON.parse(readFileSync(join(ROOT, "public/data/nfl/2025/results.json"), "utf-8")).results;
    const stats = readGenerated(2025, "team-stats.json").teamStats;
    const ratings = readGenerated(2025, "power-ratings.json").ratings;
    const report = buildSanityReport(ratings, stats, resultsRows, 2025);
    expect(report.available).toBe(true);
    expect(report.top10).toHaveLength(10);
    expect(report.bottom10).toHaveLength(10);
    expect(report.hardestSchedules).toHaveLength(5);
    expect(report.easiestSchedules).toHaveLength(5);
    expect(report.hardestSchedules[0].scheduleStrength).toBeGreaterThan(
      report.easiestSchedules[0].scheduleStrength
    );
    expect(report.risers.length).toBeGreaterThan(0);
    expect(report.fallers.length).toBeGreaterThan(0);
    expect(report.superBowl?.teams).toHaveLength(2);
    expect(report.playoffTeamCount).toBe(14);
    expect(report.biggestDisagreements.length).toBeGreaterThan(0);
  });

  it("marks unavailable seasons instead of inventing output", () => {
    const report = buildSanityReport([], [], [], 2026);
    expect(report).toEqual({ season: 2026, available: false });
  });
});

describe("public isolation", () => {
  it("power-ratings.json is not imported/read by any page, component or hook", () => {
    const dirs = ["src/pages", "src/components", "src/hooks"];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel);
        else if (/\.(ts|tsx)$/.test(entry.name)) {
          const source = readFileSync(join(ROOT, rel), "utf-8");
          if (/power-ratings/.test(source)) offenders.push(rel);
        }
      }
    };
    for (const dir of dirs) walk(dir);
    expect(offenders).toEqual([]);
  });
});
