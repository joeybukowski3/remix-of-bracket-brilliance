import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  TRENCH_METRIC_KEYS,
  TRENCH_TRANSITION_GAME_COUNT,
  collectTrenchPeriodValues,
  countCompletedGames,
  createTrenchResolver,
  describeTrenchPeriods,
  formatTrenchValue,
  isTrenchMetric,
  resolveTrenchPeriods,
  trenchPeriodLabel,
  type TrenchMetricsArtifact,
} from "@/lib/nfl/trenchMetricsData";

const ROOT = resolve(__dirname, "../../..");
const ARTIFACT: TrenchMetricsArtifact = JSON.parse(
  readFileSync(join(ROOT, "public/data/nfl/matchup-trench-metrics.json"), "utf-8")
);

describe("period policy", () => {
  it("shows only 2025 Season before either team plays a 2026 game", () => {
    expect(resolveTrenchPeriods(0, 0)).toEqual(["2025-season"]);
  });

  it("adds the 2026 period once any completed 2026 game exists", () => {
    expect(resolveTrenchPeriods(1, 0)).toEqual(["2025-season", "2026-season"]);
    expect(resolveTrenchPeriods(0, 1)).toEqual(["2025-season", "2026-season"]);
    expect(resolveTrenchPeriods(1, 1)).toEqual(["2025-season", "2026-season"]);
  });

  it("stays two-period through five completed games", () => {
    for (let n = 1; n <= 5; n += 1) {
      expect(resolveTrenchPeriods(n, n), `${n}`).toEqual(["2025-season", "2026-season"]);
    }
  });

  it("does not transition when only one team has six completed games", () => {
    expect(resolveTrenchPeriods(6, 5)).toEqual(["2025-season", "2026-season"]);
    expect(resolveTrenchPeriods(5, 6)).toEqual(["2025-season", "2026-season"]);
    expect(resolveTrenchPeriods(11, 4)).toEqual(["2025-season", "2026-season"]);
  });

  it("switches to 2026 only once both teams reach six, hiding 2025", () => {
    expect(resolveTrenchPeriods(6, 6)).toEqual(["2026-season"]);
    expect(resolveTrenchPeriods(9, 7)).toEqual(["2026-season"]);
    expect(resolveTrenchPeriods(6, 6)).not.toContain("2025-season");
  });

  it("stays 2026-only deeper into the season", () => {
    expect(resolveTrenchPeriods(12, 12)).toEqual(["2026-season"]);
    expect(resolveTrenchPeriods(17, 17)).toEqual(["2026-season"]);
  });

  it("uses the documented six-game threshold", () => {
    expect(TRENCH_TRANSITION_GAME_COUNT).toBe(6);
    expect(resolveTrenchPeriods(TRENCH_TRANSITION_GAME_COUNT - 1, 9)).toContain("2025-season");
    expect(resolveTrenchPeriods(TRENCH_TRANSITION_GAME_COUNT, 9)).not.toContain("2025-season");
  });

  it("never produces a Last 5 or Last 8 period", () => {
    for (const n of [0, 1, 5, 6, 12]) {
      const periods = resolveTrenchPeriods(n, n);
      expect(periods.join(" ")).not.toMatch(/last5|last8/i);
      expect(periods.every((p) => p === "2025-season" || p === "2026-season")).toBe(true);
    }
  });

  it("treats non-finite or negative counts as zero", () => {
    expect(resolveTrenchPeriods(Number.NaN, -2)).toEqual(["2025-season"]);
  });
});

describe("completed-game counting", () => {
  const results = [
    { seasonType: "REG", final: true, homeAbbr: "ne", awayAbbr: "buf" },
    { seasonType: "REG", final: true, homeAbbr: "sea", awayAbbr: "ne" },
    { seasonType: "REG", final: false, homeAbbr: "ne", awayAbbr: "mia" }, // not played
    { seasonType: "POST", final: true, homeAbbr: "ne", awayAbbr: "kc" }, // postseason
  ];

  it("counts only completed regular-season games", () => {
    expect(countCompletedGames(results, "ne")).toBe(2);
    expect(countCompletedGames(results, "buf")).toBe(1);
  });

  it("excludes postseason and unplayed games", () => {
    expect(countCompletedGames(results, "kc")).toBe(0);
    expect(countCompletedGames(results, "mia")).toBe(0);
  });

  it("counts games rather than weeks, so a bye is simply absent", () => {
    // A team idle in a week contributes no row at all; nothing to special-case.
    expect(countCompletedGames(results, "zzz")).toBe(0);
    expect(countCompletedGames(null, "ne")).toBe(0);
  });

  it("keeps a bye-affected matchup in the two-period state", () => {
    // Week 7: away played 6, home on bye played 5.
    expect(resolveTrenchPeriods(6, 5)).toEqual(["2025-season", "2026-season"]);
  });
});

describe("period labels", () => {
  it("labels the prior season plainly", () => {
    expect(trenchPeriodLabel(ARTIFACT, "2025-season")).toEqual({ label: "2025 Season", short: "2025" });
  });

  it("uses ESPN's published week for the current season when parsed", () => {
    const withWeek = {
      ...ARTIFACT,
      seasons: { ...ARTIFACT.seasons, "2026": { ...ARTIFACT.seasons["2025"], throughWeek: 4 } },
    };
    expect(trenchPeriodLabel(withWeek, "2026-season")).toEqual({
      label: "2026 Through Week 4",
      short: "2026 Wk 4",
    });
  });

  it("falls back to Season to Date when the week could not be parsed", () => {
    const noWeek = {
      ...ARTIFACT,
      seasons: { ...ARTIFACT.seasons, "2026": { ...ARTIFACT.seasons["2025"], throughWeek: null } },
    };
    expect(trenchPeriodLabel(noWeek, "2026-season").label).toBe("2026 Season to Date");
    expect(trenchPeriodLabel(null, "2026-season").label).toBe("2026 Season to Date");
  });
});

describe("section explanation", () => {
  it("describes each state", () => {
    expect(describeTrenchPeriods(["2025-season"])).toMatch(/ESPN Analytics season-level metrics/i);
    expect(describeTrenchPeriods(["2025-season", "2026-season"])).toMatch(/2025 final season alongside/i);
    expect(describeTrenchPeriods(["2026-season"])).toMatch(/2026 season-to-date values/i);
  });
});

describe("metric identification", () => {
  it("recognises exactly the four ESPN trench metrics", () => {
    expect(TRENCH_METRIC_KEYS).toHaveLength(4);
    for (const key of TRENCH_METRIC_KEYS) expect(isTrenchMetric(key)).toBe(true);
  });

  it("does not claim conventional, success-rate or EPA metrics", () => {
    for (const key of ["off.yardsPerPlay", "off.successRate", "def.sacksPerGame", "off.epaPerPlay"]) {
      expect(isTrenchMetric(key), key).toBe(false);
    }
  });
});

describe("generated artifact", () => {
  it("carries ESPN provenance and attribution", () => {
    expect(ARTIFACT.source).toMatch(/ESPN Analytics/i);
    expect(ARTIFACT.attribution).toMatch(/ESPN Analytics \/ NFL Next Gen Stats/i);
  });

  it("contains the 2025 season for all 32 teams with all four metrics", () => {
    const season = ARTIFACT.seasons["2025"];
    expect(Object.keys(season.teams)).toHaveLength(32);
    for (const [abbr, team] of Object.entries(season.teams)) {
      expect(Object.keys(team.metrics).sort(), abbr).toEqual([...TRENCH_METRIC_KEYS].sort());
    }
  });

  it("records the article id and parsed through-week", () => {
    expect(ARTIFACT.seasons["2025"].articleId).toBe("46138675");
    expect(ARTIFACT.seasons["2025"].throughWeek).toBe(18);
    expect(ARTIFACT.seasons["2025"].sourceUpdatedText).toMatch(/Through all Week 18/);
  });

  it("has no 2026 season yet", () => {
    expect(ARTIFACT.seasons["2026"]).toBeUndefined();
  });

  it("stores whole-number percentages, not invented decimals", () => {
    for (const team of Object.values(ARTIFACT.seasons["2025"].teams)) {
      for (const key of TRENCH_METRIC_KEYS) {
        expect(Number.isInteger(team.metrics[key].valuePct)).toBe(true);
      }
    }
  });

  it("keeps ESPN official ranks distinct 1-32 for each metric", () => {
    for (const key of TRENCH_METRIC_KEYS) {
      const ranks = Object.values(ARTIFACT.seasons["2025"].teams).map((t) => t.metrics[key].espnRank);
      expect(new Set(ranks).size, key).toBe(32);
      expect(Math.min(...ranks), key).toBe(1);
      expect(Math.max(...ranks), key).toBe(32);
    }
  });

  it("stores no locally computed rank field", () => {
    const sample = ARTIFACT.seasons["2025"].teams.buf.metrics["off.passBlockWinRate"];
    expect(Object.keys(sample).sort()).toEqual(["espnRank", "valuePct"]);
  });
});

describe("resolver", () => {
  const resolve0 = createTrenchResolver(ARTIFACT);

  it("resolves published values with ESPN ranks", () => {
    const pbwr = resolve0("buf", "off.passBlockWinRate", "2025-season")!;
    expect(pbwr).toEqual({ valuePct: 71, espnRank: 4 });
    expect(resolve0("buf", "off.runBlockWinRate", "2025-season")).toEqual({ valuePct: 75, espnRank: 1 });
    expect(resolve0("buf", "def.passRushWinRate", "2025-season")).toEqual({ valuePct: 31, espnRank: 27 });
    expect(resolve0("buf", "def.runStopWinRate", "2025-season")).toEqual({ valuePct: 30, espnRank: 22 });
  });

  it("returns null for the absent 2026 season rather than reusing 2025", () => {
    expect(resolve0("buf", "off.passBlockWinRate", "2026-season")).toBeNull();
  });

  it("returns null for unknown teams and non-trench metrics", () => {
    expect(resolve0("zzz", "off.passBlockWinRate", "2025-season")).toBeNull();
    expect(resolve0("buf", "off.yardsPerPlay", "2025-season")).toBeNull();
  });

  it("degrades to all-null without an artifact", () => {
    expect(createTrenchResolver(null)("buf", "off.passBlockWinRate", "2025-season")).toBeNull();
  });

  it("collects one value per visible period, leaving absent periods null", () => {
    const values = collectTrenchPeriodValues(resolve0, "buf", "off.passBlockWinRate", [
      "2025-season",
      "2026-season",
    ]);
    expect(values["2025-season"]).not.toBeNull();
    expect(values["2026-season"]).toBeNull();
  });
});

describe("display formatting", () => {
  it("renders whole-number percentages without fake precision", () => {
    expect(formatTrenchValue({ valuePct: 71, espnRank: 4 })).toBe("71%");
    expect(formatTrenchValue({ valuePct: 31, espnRank: 27 })).toBe("31%");
  });

  it("shows N/A for a missing value", () => {
    expect(formatTrenchValue(null)).toBe("N/A");
  });
});
