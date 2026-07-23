import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// @ts-expect-error -- plain JS module, no type declarations
import { runCurrentSlateComparison, runHistoricalBacktest } from "../../../scripts/backtest-mlb-k-projection-v2.mjs";

let tempDirs: string[] = [];

function writeJson(filePath: string, payload: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

describe("MLB K projection V2 comparison harness", () => {
  it("summarizes current-slate legacy versus V2 differences", () => {
    const dir = path.join(tmpdir(), `k-current-${process.pid}-${Date.now()}`);
    tempDirs.push(dir);
    const artifactPath = path.join(dir, "artifact.json");
    writeJson(artifactPath, {
      slateDate: "2026-07-23",
      rows: [
        {
          pitcher: { name: "Pitcher A", team: "AAA", opponent: "BBB" },
          legacy: { projectedKs: 5 },
          v2: { projectedStrikeouts: 6, confidence: "high", fallbacks: [] },
          market: { kLine: 5.5 },
          inputs: { availability: { pitcher: { homeKRate: false }, opponent: { seasonKRate: true } } },
        },
        {
          pitcher: { name: "Pitcher B", team: "CCC", opponent: "DDD" },
          legacy: { projectedKs: 4 },
          v2: { projectedStrikeouts: 3.5, confidence: "low", fallbacks: [{ field: "x" }] },
          market: { kLine: 4.5 },
          inputs: { availability: { pitcher: { homeKRate: false }, opponent: { seasonKRate: false } } },
        },
      ],
    });

    const result = runCurrentSlateComparison(artifactPath);

    expect(result.aggregate.rowCount).toBe(2);
    expect(result.aggregate.averageAbsoluteDifference).toBe(0.75);
    expect(result.aggregate.maximumDifference).toMatchObject({ pitcher: "Pitcher A", absoluteDifference: 1 });
    expect(result.aggregate.meanSignedDifference).toBe(0.25);
    expect(result.aggregate.confidenceDistribution).toEqual({ high: 1, low: 1 });
    expect(result.aggregate.nullCountsByInputField["pitcher.homeKRate"]).toBe(2);
  });

  it("returns INSUFFICIENT_HISTORICAL_DATA when no real snapshots exist", () => {
    const result = runHistoricalBacktest("missing-file.json");

    expect(result.status).toBe("INSUFFICIENT_HISTORICAL_DATA");
    expect(result.requiredSnapshotSchema).toBeTruthy();
  });

  it("calculates historical error metrics without making improvement claims", () => {
    const dir = path.join(tmpdir(), `k-history-${process.pid}-${Date.now()}`);
    tempDirs.push(dir);
    const historyPath = path.join(dir, "history.json");
    writeJson(historyPath, [
      { actualStrikeouts: 6, legacyProjection: 5, v2Projection: 6.5, pitcherIsHome: true, handedness: "R", kLine: 5.5, opponentKRate: 0.25, confidence: "high", completeness: "A" },
      { actualStrikeouts: 4, legacyProjection: 5, v2Projection: 3.5, pitcherIsHome: false, handedness: "L", kLine: 4.5, opponentKRate: 0.2, confidence: "low", completeness: "C" },
    ]);

    const result = runHistoricalBacktest(historyPath);

    expect(result.status).toBe("OK");
    expect(result.sampleSize).toBe(2);
    expect(result.legacyMAE).toBe(1);
    expect(result.v2MAE).toBe(0.5);
    expect(result.buckets.homeAway.home.sampleSize).toBe(1);
    expect(result.note).toContain("not evidence of model improvement");
  });
});
