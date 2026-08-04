import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  artifactWindowId,
  createMatchupMetricResolver,
  describeMatchupSample,
  formatMetricValue,
  type MatchupMetricsArtifact,
} from "@/lib/nfl/matchupMetricsData";
import { getMetricDef } from "@/lib/nfl/matchupMetrics";

const ROOT = resolve(__dirname, "../../..");
const ARTIFACT: MatchupMetricsArtifact = JSON.parse(
  readFileSync(join(ROOT, "public/data/nfl/matchup-metrics.json"), "utf-8")
);

const SLUG_TO_ABBR = new Map([
  ["new-england-patriots", "ne"],
  ["seattle-seahawks", "sea"],
]);

const SEASON_BLEND = { window: "season", includePriorSeason: true } as const;
const SEASON_CURRENT = { window: "season", includePriorSeason: false } as const;
const LAST5_BLEND = { window: "last5", includePriorSeason: true } as const;
const LAST5_CURRENT = { window: "last5", includePriorSeason: false } as const;

describe("generated artifact", () => {
  it("carries provenance identifying nflverse and the exact source files", () => {
    expect(ARTIFACT._meta.source).toMatch(/nflverse/i);
    expect(ARTIFACT._meta.sourceFiles.length).toBeGreaterThan(0);
    for (const file of ARTIFACT._meta.sourceFiles) {
      expect(file.path).toMatch(/stats_team_week_\d{4}\.csv$/);
      expect(file.rowCount).toBeGreaterThan(0);
    }
    expect(ARTIFACT._meta.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // TeamRankings must appear nowhere in the provenance.
    expect(JSON.stringify(ARTIFACT._meta)).not.toMatch(/teamrankings/i);
  });

  it("exposes all four control-state windows", () => {
    expect(Object.keys(ARTIFACT.windows).sort()).toEqual([
      "last5-blend", "last5-current", "season-blend", "season-current",
    ]);
  });

  it("covers all 32 teams in the blended windows", () => {
    expect(Object.keys(ARTIFACT.windows["season-blend"].teams)).toHaveLength(32);
    expect(Object.keys(ARTIFACT.windows["last5-blend"].teams)).toHaveLength(32);
  });

  it("leaves the current-season-only windows empty until 2026 games are played", () => {
    // Correct preseason behaviour: blend OFF has no completed 2026 games to use.
    expect(Object.keys(ARTIFACT.windows["season-current"].teams)).toHaveLength(0);
    expect(Object.keys(ARTIFACT.windows["last5-current"].teams)).toHaveLength(0);
  });

  it("uses eight completed prior-season games per team in the blended season window", () => {
    for (const [abbr, team] of Object.entries(ARTIFACT.windows["season-blend"].teams)) {
      expect(team.gamesIncluded, abbr).toBe(8);
      expect(team.gameIds, abbr).toHaveLength(8);
      expect(new Set(team.gameIds).size, abbr).toBe(8);
      expect(team.seasons, abbr).toEqual([2025]);
    }
  });

  it("uses five games per team in the blended Last 5 window", () => {
    for (const [abbr, team] of Object.entries(ARTIFACT.windows["last5-blend"].teams)) {
      expect(team.gamesIncluded, abbr).toBe(5);
      expect(team.gameIds, abbr).toHaveLength(5);
    }
  });

  it("produces a contiguous competition ranking over 32 teams for a quality metric", () => {
    const ranks = Object.values(ARTIFACT.windows["season-blend"].teams)
      .map((team) => team.metrics["off.yardsPerPlay"]?.[1])
      .filter((r): r is number => r != null);
    expect(ranks).toHaveLength(32);
    expect(Math.min(...ranks)).toBe(1);
    expect(Math.max(...ranks)).toBeLessThanOrEqual(32);
  });

  it("contains no deferred metric keys", () => {
    const keys = new Set(
      Object.values(ARTIFACT.windows["season-blend"].teams).flatMap((t) => Object.keys(t.metrics))
    );
    for (const deferred of [
      "off.epaPerPlay", "off.successRate", "off.thirdDownConversion", "off.timeOfPossession",
      "off.firstDownsPerPlay", "off.passBlockWinRate", "def.runStopWinRate", "def.epaPerPlayAllowed",
      "mkt.atsRecord", "mkt.overUnderRecord",
    ]) {
      expect(keys.has(deferred), `${deferred} must not be present`).toBe(false);
    }
  });

  it("keeps play-mix shares summing to 100% for every team", () => {
    for (const [abbr, team] of Object.entries(ARTIFACT.windows["season-blend"].teams)) {
      const pass = team.metrics["off.passPlayRate"][0];
      const rush = team.metrics["off.rushPlayRate"][0];
      expect(pass + rush, abbr).toBeCloseTo(100, 0);
    }
  });
});

describe("resolver", () => {
  const resolve0 = createMatchupMetricResolver(ARTIFACT, SEASON_BLEND, SLUG_TO_ABBR);

  it("resolves a real value and rank by team slug", () => {
    const value = resolve0("new-england-patriots", "off.yardsPerPlay");
    expect(value).not.toBeNull();
    expect(value!.value).toBeGreaterThan(3);
    expect(value!.value).toBeLessThan(9);
    expect(value!.rank).toBeGreaterThanOrEqual(1);
    expect(value!.rank).toBeLessThanOrEqual(32);
    expect(value!.formattedValue).toMatch(/^\d+\.\d{2}$/);
    expect(value!.source).toMatch(/nflverse/i);
  });

  it("returns null for deferred metrics so the UI renders N/A", () => {
    for (const key of [
      "off.epaPerPlay", "off.successRate", "off.thirdDownConversion", "off.timeOfPossession",
      "off.passBlockWinRate", "def.passRushWinRate", "def.runStopWinRate", "mkt.atsRecord",
    ]) {
      expect(resolve0("new-england-patriots", key), key).toBeNull();
    }
  });

  it("returns null for unknown teams and unknown metrics", () => {
    expect(resolve0("not-a-team", "off.yardsPerPlay")).toBeNull();
    expect(resolve0("new-england-patriots", "off.notAMetric")).toBeNull();
  });

  it("returns null for every metric in the empty blend-OFF windows", () => {
    const off = createMatchupMetricResolver(ARTIFACT, SEASON_CURRENT, SLUG_TO_ABBR);
    expect(off("new-england-patriots", "off.yardsPerPlay")).toBeNull();
    expect(off("seattle-seahawks", "def.pointsAllowedPerGame")).toBeNull();

    const last5Off = createMatchupMetricResolver(ARTIFACT, LAST5_CURRENT, SLUG_TO_ABBR);
    expect(last5Off("new-england-patriots", "off.yardsPerPlay")).toBeNull();
  });

  it("resolves a different sample when the control state changes", () => {
    const season = resolve0("new-england-patriots", "off.passYardsPerGame");
    const last5 = createMatchupMetricResolver(ARTIFACT, LAST5_BLEND, SLUG_TO_ABBR)(
      "new-england-patriots",
      "off.passYardsPerGame"
    );
    expect(season).not.toBeNull();
    expect(last5).not.toBeNull();
    // Different windows over different game counts; the 8-game and 5-game
    // samples should not be the identical aggregate.
    expect(last5!.value).not.toBe(season!.value);
  });

  it("degrades to all-null when the artifact is missing entirely", () => {
    const none = createMatchupMetricResolver(null, SEASON_BLEND, SLUG_TO_ABBR);
    expect(none("new-england-patriots", "off.yardsPerPlay")).toBeNull();
  });

  it("maps control state onto the artifact window id", () => {
    expect(artifactWindowId(SEASON_BLEND)).toBe("season-blend");
    expect(artifactWindowId(LAST5_CURRENT)).toBe("last5-current");
  });
});

describe("value formatting", () => {
  it("formats each catalogue format correctly", () => {
    expect(formatMetricValue("off.yardsPerPlay", 5.7149)).toBe("5.71");
    expect(formatMetricValue("off.pointsPerGame", 24.25)).toBe("24.3");
    expect(formatMetricValue("off.passPlayRate", 52.75)).toBe("52.8%");
    expect(formatMetricValue("def.opponentPasserRating", 87.44)).toBe("87.4");
  });

  it("uses the format declared by the metric catalogue", () => {
    expect(getMetricDef("off.yardsPerPlay")!.format).toBe("decimal2");
    expect(getMetricDef("off.passPlayRate")!.format).toBe("percent1");
  });
});

describe("sample label", () => {
  it("describes the preseason blended samples", () => {
    expect(describeMatchupSample(ARTIFACT, SEASON_BLEND, ["ne", "sea"]).label).toBe("8 games · 2025");
    expect(describeMatchupSample(ARTIFACT, LAST5_BLEND, ["ne", "sea"]).label).toBe("5 games · 2025");
  });

  it("reports the empty blend-OFF state honestly rather than borrowing 2025", () => {
    const summary = describeMatchupSample(ARTIFACT, SEASON_CURRENT, ["ne", "sea"]);
    expect(summary.empty).toBe(true);
    expect(summary.label).toMatch(/no completed 2026 games/i);
  });

  it("exposes the exact game ids backing the sample", () => {
    const summary = describeMatchupSample(ARTIFACT, SEASON_BLEND, ["ne", "sea"]);
    expect(summary.gameIdsByTeam.ne).toHaveLength(8);
    expect(summary.gameIdsByTeam.sea).toHaveLength(8);
    for (const id of summary.gameIdsByTeam.ne) expect(id).toMatch(/^2025_\d{2}_/);
  });
});
