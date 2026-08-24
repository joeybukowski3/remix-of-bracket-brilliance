import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCfbV2TeamRatingArtifact, cfbV2TeamRatingArtifactPath, writeCfbV2TeamRatingArtifact } from "./artifactWriter";
import { CFB_V2_IPR_MODEL_VERSION } from "./versions";
import { CFB_V2_CONFIG_VERSION } from "./config";
import type { CfbV2TeamRating } from "./types";

function fixtureRating(): CfbV2TeamRating {
  return {
    teamId: "alpha",
    season: 2026,
    asOfWeek: 0,
    modelVersion: CFB_V2_IPR_MODEL_VERSION,
    offenseRating: 0.1,
    defenseRating: 0.2,
    overallRating: 0.15,
    preseasonPriorOffense: 0.1,
    preseasonPriorDefense: 0.2,
    priorTier: "LEAGUE_MEAN",
    gamesPlayed: 0,
    classification: "fbs",
    connectivity: { componentSize: 1, regularizationMultiplier: 3 },
    ratingStatus: "computed",
    configVersion: CFB_V2_CONFIG_VERSION,
    generatedAt: "2026-08-20T12:00:00.000Z",
    dataAsOf: "2026-08-20T00:00:00.000Z",
  };
}

describe("cfbV2TeamRatingArtifactPath", () => {
  it("uses the preseason path at asOfWeek 0 and the weekly path otherwise", () => {
    expect(cfbV2TeamRatingArtifactPath(0)).toBe("data/generated/cfb/v2/preseason-ratings.json");
    expect(cfbV2TeamRatingArtifactPath(4)).toBe("data/generated/cfb/v2/week-04-ratings.json");
  });
});

describe("buildCfbV2TeamRatingArtifact", () => {
  it("wraps records in a complete provenance envelope", () => {
    const artifact = buildCfbV2TeamRatingArtifact({ season: 2026, asOfWeek: 0, generatedAt: "2026-08-20T12:00:00.000Z", dataAsOf: "2026-08-20T00:00:00.000Z", records: [fixtureRating()] });
    expect(artifact.schemaVersion).toBeTruthy();
    expect(artifact.modelVersion).toBeTruthy();
    expect(artifact.versions.ipr).toBe(CFB_V2_IPR_MODEL_VERSION);
    expect(artifact.records).toHaveLength(1);
  });
});

describe("writeCfbV2TeamRatingArtifact", () => {
  let tempRoot: string | null = null;
  afterEach(() => {
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  it("writes the artifact under data/generated/cfb/v2/, never a V1/V1.1 path", () => {
    tempRoot = mkdtempSync(join(tmpdir(), "cfb-v2-artifact-"));
    const artifact = buildCfbV2TeamRatingArtifact({ season: 2026, asOfWeek: 0, generatedAt: "2026-08-20T12:00:00.000Z", dataAsOf: "2026-08-20T00:00:00.000Z", records: [fixtureRating()] });
    const relativePath = writeCfbV2TeamRatingArtifact(tempRoot, artifact);
    expect(relativePath).toBe("data/generated/cfb/v2/preseason-ratings.json");
    expect(relativePath).not.toMatch(/v1|market-anchor/i);
    const written = JSON.parse(readFileSync(join(tempRoot, relativePath), "utf8"));
    expect(written.records).toHaveLength(1);
    expect(written.records[0].teamId).toBe("alpha");
  });

  it("is deterministic — identical artifact writes identical bytes", () => {
    tempRoot = mkdtempSync(join(tmpdir(), "cfb-v2-artifact-"));
    const artifact = buildCfbV2TeamRatingArtifact({ season: 2026, asOfWeek: 3, generatedAt: "2026-08-20T12:00:00.000Z", dataAsOf: "2026-08-20T00:00:00.000Z", records: [fixtureRating()] });
    const path1 = writeCfbV2TeamRatingArtifact(tempRoot, artifact);
    const bytes1 = readFileSync(join(tempRoot, path1));
    const path2 = writeCfbV2TeamRatingArtifact(tempRoot, artifact);
    const bytes2 = readFileSync(join(tempRoot, path2));
    expect(bytes1.equals(bytes2)).toBe(true);
  });
});
