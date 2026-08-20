import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createWeeklyStatResolver,
  WEEKLY_STAT_WINDOW_ID,
} from "@/lib/fantasy/weeklyStatResolver";
import { WEEKLY_STAT_COLUMNS } from "@/lib/fantasy/weeklyRankings";
import type { EpaArtifact } from "@/lib/nfl/epaData";
import type { MatchupMetricsArtifact } from "@/lib/nfl/matchupMetricsData";
import type { SuccessRatesArtifact } from "@/lib/nfl/successRateData";

function fixture<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), relativePath), "utf-8")) as T;
}

const EPA = fixture<EpaArtifact>("public/data/nfl/matchup-epa.json");
const METRICS = fixture<MatchupMetricsArtifact>("public/data/nfl/matchup-metrics.json");
const SUCCESS = fixture<SuccessRatesArtifact>("public/data/nfl/matchup-success-rates.json");

const resolve = createWeeklyStatResolver({ epa: EPA, metrics: METRICS, success: SUCCESS });

const PASS_EPA = WEEKLY_STAT_COLUMNS.QB[0];
const YPA = WEEKLY_STAT_COLUMNS.QB[2];
const RUSH_SUCCESS = WEEKLY_STAT_COLUMNS.RB[2];

/** Every team key in the artifact window — the population under test. */
const TEAMS = Object.keys(EPA.windows[WEEKLY_STAT_WINDOW_ID].teams);

describe("createWeeklyStatResolver", () => {
  it("resolves raw value, display and percentile for every team", () => {
    expect(TEAMS).toHaveLength(32);
    for (const team of TEAMS) {
      const stat = resolve(team, PASS_EPA);
      expect(stat, team).not.toBeNull();
      expect(Number.isFinite(stat!.raw)).toBe(true);
      expect(stat!.display).toMatch(/^[+-]?\d\.\d{3}$/);
      expect(stat!.percentile).toBeGreaterThanOrEqual(0);
      expect(stat!.percentile).toBeLessThanOrEqual(100);
    }
  });

  it("scores the league's strongest team 100 and the weakest 0", () => {
    const byRaw = TEAMS.map((team) => ({ team, stat: resolve(team, PASS_EPA)! })).sort(
      (a, b) => a.stat.raw - b.stat.raw,
    );
    const worst = byRaw[0];
    const best = byRaw[byRaw.length - 1];

    expect(best.stat.percentile).toBe(100);
    expect(worst.stat.percentile).toBe(0);
    expect(best.stat.raw).toBeGreaterThan(worst.stat.raw);
  });

  it("keeps percentile monotonic with the raw value", () => {
    const byRaw = TEAMS.map((team) => resolve(team, YPA)!).sort((a, b) => a.raw - b.raw);
    for (let i = 1; i < byRaw.length; i += 1) {
      if (byRaw[i].raw > byRaw[i - 1].raw) {
        expect(byRaw[i].percentile!).toBeGreaterThan(byRaw[i - 1].percentile!);
      } else {
        expect(byRaw[i].percentile).toBe(byRaw[i - 1].percentile);
      }
    }
  });

  it("puts the league middle near 50", () => {
    const percentiles = TEAMS.map((team) => resolve(team, PASS_EPA)!.percentile!).sort(
      (a, b) => a - b,
    );
    const median = (percentiles[15] + percentiles[16]) / 2;
    expect(median).toBeGreaterThan(40);
    expect(median).toBeLessThan(60);
  });

  // The population is the 32 unique teams in the artifact, never the player
  // rows on screen — several players share one team environment.
  it("builds percentiles from the 32-team population, not from repeated rows", () => {
    const buffalo = resolve("buf", PASS_EPA)!;
    // Asking for the same team many times cannot shift its own percentile.
    for (let i = 0; i < 50; i += 1) {
      expect(resolve("buf", PASS_EPA)!.percentile).toBe(buffalo.percentile);
    }
    // And exactly 32 distinct percentile slots exist for a 32-team metric.
    const distinct = new Set(TEAMS.map((team) => resolve(team, PASS_EPA)!.percentile));
    expect(distinct.size).toBeLessThanOrEqual(32);
    expect(distinct.size).toBeGreaterThan(25);
  });

  it("percentiles the success-rate artifact on its own population", () => {
    const values = TEAMS.map((team) => resolve(team, RUSH_SUCCESS)).filter(
      (stat): stat is NonNullable<typeof stat> => stat != null,
    );
    expect(values).toHaveLength(32);
    expect(Math.max(...values.map((v) => v.percentile!))).toBe(100);
    expect(Math.min(...values.map((v) => v.percentile!))).toBe(0);
    expect(values[0].display).toMatch(/^\d+\.\d%$/);
  });

  it("returns null for an unknown team and a missing artifact", () => {
    expect(resolve("zzz", PASS_EPA)).toBeNull();
    expect(resolve("", PASS_EPA)).toBeNull();

    const empty = createWeeklyStatResolver({ epa: null, metrics: null, success: null });
    expect(empty("buf", PASS_EPA)).toBeNull();
    expect(empty("buf", YPA)).toBeNull();
    expect(empty("buf", RUSH_SUCCESS)).toBeNull();
  });

  it("refuses to grade a context-only column", () => {
    const contextOnly = { ...PASS_EPA, direction: "context-only" as const };
    const stat = resolve("buf", contextOnly);
    expect(stat).not.toBeNull();
    expect(stat!.raw).toBeCloseTo(resolve("buf", PASS_EPA)!.raw, 6);
    expect(stat!.percentile).toBeNull();
  });
});
