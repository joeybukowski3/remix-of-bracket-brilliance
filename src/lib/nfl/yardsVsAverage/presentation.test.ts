import { describe, expect, it } from "vitest";
import { fantasyAllowedRankTone } from "@/lib/nfl/fantasyAllowed/presentation";
import { SMALL_SAMPLE_STYLE } from "@/lib/shared/jkbHeat";
import {
  buildYardsVsAverageTableRows,
  formatYardsVsAverageDelta,
  formatYardsVsAverageDeltaCompact,
  YARDS_VS_AVERAGE_COLUMNS,
  yardsVsAverageConsistency,
  yardsVsAverageRankTone,
} from "./presentation";
import { YARDS_VS_AVERAGE_METRIC_KEYS, YARDS_VS_AVERAGE_SAMPLE_KEYS, type YardsVsAverageArtifact, type YardsVsAverageMetricSample } from "./types";

function sample(overrides: Partial<YardsVsAverageMetricSample> = {}): YardsVsAverageMetricSample {
  return { gamesSampled: 3, deltaYds: 18.9, deltaPct: 17.2, rankYds: 30, rankPct: 29, gamesAbove: 3, gamesBelow: 0, ...overrides };
}

function artifact(teRec: YardsVsAverageMetricSample): YardsVsAverageArtifact {
  const metrics = Object.fromEntries(YARDS_VS_AVERAGE_METRIC_KEYS.map((key) => [key, key === "teRec" ? teRec : sample()]));
  return {
    rows: [{ team: "car", opponent: "atl", location: "vs", samples: Object.fromEntries(YARDS_VS_AVERAGE_SAMPLE_KEYS.map((key) => [key, metrics])) }],
  } as unknown as YardsVsAverageArtifact;
}

describe("Yards vs Avg presentation", () => {
  it("shows PASS, RUSH and the five position columns without a QB PASS column", () => {
    expect(YARDS_VS_AVERAGE_COLUMNS.map((column) => column.label)).toEqual(["PASS", "RUSH", "QB RUSH", "RB RUSH", "RB REC", "WR REC", "TE REC"]);
  });

  it("formats signed one-decimal yards and percentages", () => {
    expect(formatYardsVsAverageDelta(18.94, "yds")).toBe("+18.9");
    expect(formatYardsVsAverageDelta(-4, "yds")).toBe("-4.0");
    expect(formatYardsVsAverageDelta(0, "pct")).toBe("0.0%");
    expect(formatYardsVsAverageDelta(122.7, "pct")).toBe("+123%");
    expect(formatYardsVsAverageDelta(null, "pct")).toBeNull();
  });

  it("formats whole-number compact values for narrow mobile columns", () => {
    expect(formatYardsVsAverageDeltaCompact(68.4, "yds")).toBe("+68");
    expect(formatYardsVsAverageDeltaCompact(-58.5, "yds")).toBe("-59");
    expect(formatYardsVsAverageDeltaCompact(-0.4, "yds")).toBe("0");
    expect(formatYardsVsAverageDeltaCompact(100.1, "pct")).toBe("+100%");
    expect(formatYardsVsAverageDeltaCompact(null, "yds")).toBeNull();
  });

  it("uses the % rank and value in % mode and the yards rank in Yds mode", () => {
    const [yds] = buildYardsVsAverageTableRows(artifact(sample()), "2026", "yds");
    expect(yds.cells.teRec).toMatchObject({ rank: 30, rawValue: 18.9, rawDisplay: "+18.9", rawDisplayCompact: "+19", smallSample: false });
    expect(yds.cells.teRec.title).toBe("Rank 30 of 32 · 3/3 opponents above avg, 0 below (3 games)");
    const [pct] = buildYardsVsAverageTableRows(artifact(sample({ deltaPct: null, rankPct: null })), "2026", "pct");
    expect(pct.cells.teRec).toMatchObject({ rank: null, rawValue: null, rawDisplay: null });
  });

  it("describes consistency and marks fewer than 3 games as a small sample", () => {
    expect(yardsVsAverageConsistency(sample())).toBe("3/3 opponents above avg, 0 below (3 games)");
    const [row] = buildYardsVsAverageTableRows(artifact(sample({ gamesSampled: 2, gamesAbove: 1, gamesBelow: 1 })), "2026", "yds");
    expect(row.cells.teRec.smallSample).toBe(true);
    expect(yardsVsAverageRankTone(5, row.cells.teRec).style?.backgroundColor).toBe(SMALL_SAMPLE_STYLE.backgroundColor);
  });

  it("keeps Fantasy Points Allowed's rank direction for normal samples", () => {
    expect(yardsVsAverageRankTone(1, { rank: 1 })).toEqual(fantasyAllowedRankTone(1));
    expect(yardsVsAverageRankTone(32, { rank: 32 })).toEqual(fantasyAllowedRankTone(32));
  });
});
