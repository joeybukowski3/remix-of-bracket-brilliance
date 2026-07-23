import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// @ts-expect-error -- plain JS module, no type declarations
import { generateKPropsV2ShadowArtifact } from "../../../scripts/generate-mlb-k-props-v2-shadow.mjs";
// @ts-expect-error -- plain JS module, no type declarations
import { validateKPropsV2SourceIntegrity } from "../../../scripts/lib/mlb-k-props-v2-source-integrity.mjs";

const rawPayload = {
  date: "2026-07-23",
  pitchers: [
    {
      gameKey: "AAA@BBB",
      gameId: 1,
      pitcher: "Starter One",
      pitcherId: 11,
      team: "BBB",
      opponent: "AAA",
      hand: "R",
      kRate: 24,
      whiffRate: 28,
      projectedIP: 5,
      projectedK9: 9,
      projectedKs: 5,
      kOddsSlateDate: "2026-07-23",
    },
  ],
  batters: [{ gameKey: "AAA@BBB", team: "AAA", kRate: 25, whiffRate: 30 }],
};
const workloadPayload = {
  date: "2026-07-23",
  leagueContext: { kRate: 0.225, whiffRate: 0.25 },
  pitchers: [
    {
      gamePk: 1,
      gameKey: "AAA@BBB",
      pitcherId: 11,
      team: "BBB",
      opponent: "AAA",
      isHome: true,
      pitcherContext: { recentKRate: 0.24 },
      opponentContext: { seasonKRate: 0.25, recent14KRate: 0.26 },
      projection: { expectedBF: 22, expectedInnings: 5.2 },
      inputs: {},
      confidence: {},
      flags: [],
    },
  ],
};
const detailsPayload = {
  date: "2026-07-23",
  details: [
    {
      key: "starter-one|bbb|aaa|2026-07-23",
      pitcherLastFiveStarts: [{ inningsPitched: "5.0", strikeouts: 5 }],
      opponentLastFiveGames: [{ opposingStarterInningsPitched: "5.0", opposingStarterStrikeouts: 5, teamTotalStrikeouts: 9 }],
    },
  ],
};
const oddsPayload = { date: "2026-07-23" };

let tempDirs: string[] = [];

function writeJson(filePath: string, payload: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

describe("K props V2 source integrity", () => {
  it("accepts sources when all dates agree", () => {
    const result = validateKPropsV2SourceIntegrity({ rawPayload, workloadPayload, detailsPayload, oddsPayload });

    expect(result.ok).toBe(true);
    expect(result.slateDate).toBe("2026-07-23");
    expect(result.sourceDates["k-workload-shadow.json"]).toBe("2026-07-23");
  });

  it("rejects stale workload source", () => {
    const result = validateKPropsV2SourceIntegrity({
      rawPayload,
      workloadPayload: { ...workloadPayload, date: "2026-07-22" },
      detailsPayload,
      oddsPayload,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("k-workload-shadow.json date 2026-07-22 does not match intended slate 2026-07-23.");
  });

  it("rejects stale details source", () => {
    const result = validateKPropsV2SourceIntegrity({
      rawPayload,
      workloadPayload,
      detailsPayload: { ...detailsPayload, date: "2026-07-22" },
      oddsPayload,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("strikeout-prop-details.json date 2026-07-22 does not match intended slate 2026-07-23.");
  });

  it("rejects stale odds source", () => {
    const result = validateKPropsV2SourceIntegrity({
      rawPayload,
      workloadPayload,
      detailsPayload,
      oddsPayload: { date: "2026-07-22" },
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("mlb-odds.json date 2026-07-22 does not match intended slate 2026-07-23.");
  });

  it("reports undated optional inputs without rejecting", () => {
    const result = validateKPropsV2SourceIntegrity({
      rawPayload: { ...rawPayload, pitchers: [{ ...rawPayload.pitchers[0], kOddsSlateDate: null }] },
      workloadPayload: {},
      detailsPayload: {},
      oddsPayload: {},
    });

    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        "k-workload-shadow.json has no trustworthy date field.",
        "strikeout-prop-details.json has no trustworthy date field.",
        "mlb-odds.json has no trustworthy date field.",
      ]),
    );
  });

  it("rejects invalid date formats", () => {
    const result = validateKPropsV2SourceIntegrity({
      rawPayload: { ...rawPayload, date: "07/23/2026" },
      workloadPayload,
      detailsPayload,
      oddsPayload,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('hr-props-raw.json has invalid date "07/23/2026".');
  });

  it("preserves prior artifact after source rejection", async () => {
    const dir = path.join(tmpdir(), `k-shadow-${process.pid}-${Date.now()}`);
    tempDirs.push(dir);
    const rawPath = path.join(dir, "hr-props-raw.json");
    const workloadPath = path.join(dir, "k-workload-shadow.json");
    const detailsPath = path.join(dir, "strikeout-prop-details.json");
    const oddsPath = path.join(dir, "mlb-odds.json");
    const outputPath = path.join(dir, "k-props-v2-shadow.json");
    const prior = { ok: true, marker: "prior-artifact" };

    writeJson(rawPath, rawPayload);
    writeJson(workloadPath, { ...workloadPayload, date: "2026-07-22" });
    writeJson(detailsPath, detailsPayload);
    writeJson(oddsPath, oddsPayload);
    writeJson(outputPath, prior);

    await expect(generateKPropsV2ShadowArtifact({ rawPath, workloadPath, detailsPath, oddsPath, outputPath })).rejects.toThrow(
      /k-workload-shadow\.json date 2026-07-22/,
    );

    expect(existsSync(outputPath)).toBe(true);
    expect(JSON.parse(readFileSync(outputPath, "utf8"))).toEqual(prior);
  });
});
