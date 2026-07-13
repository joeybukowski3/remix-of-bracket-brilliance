import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  getRangeEntry,
  parseReferenceRangeArtifact,
  referenceRangeArtifactPath,
  validateReferenceRangeArtifact,
} from "../referenceRanges";

const checkedInArtifact = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "public/data/mlb/model-reference-ranges/hr-bridge-v1.json"),
    "utf8",
  ),
) as Record<string, unknown>;

describe("reference-range artifact", () => {
  it("the checked-in bridge artifact is valid", () => {
    const result = validateReferenceRangeArtifact(checkedInArtifact);
    expect(result.errors).toEqual([]);
  });

  it("bridge artifact carries verified production ranges", () => {
    const artifact = parseReferenceRangeArtifact(checkedInArtifact);
    expect(artifact.artifactVersion).toBe("hr-bridge-v1");
    expect(artifact.scoreVersion).toBe("hr-bridge-abs@1");
    // Bridge ranges are inherited, not empirically derived.
    expect(artifact.sourceSeasons).toBeNull();
    expect(artifact.sampleCount).toBeNull();
    expect(getRangeEntry(artifact, "batter-barrel-pct")).toMatchObject({ min: 3, max: 20 });
    expect(getRangeEntry(artifact, "batter-hard-hit-pct")).toMatchObject({ min: 25, max: 60 });
    expect(getRangeEntry(artifact, "batter-xba")).toMatchObject({ min: 0.18, max: 0.34 });
    expect(getRangeEntry(artifact, "batter-whiff-pct")).toMatchObject({ min: 15, max: 38 });
    expect(getRangeEntry(artifact, "weather-hr-boost")).toMatchObject({ min: -10, max: 10 });
    // Every entry documents where its bounds came from.
    for (const range of artifact.ranges) {
      expect(range.provenance.length).toBeGreaterThan(10);
    }
  });

  it("rejects ranges where max does not exceed min", () => {
    const broken = JSON.parse(JSON.stringify(checkedInArtifact)) as {
      ranges: Array<{ min: number; max: number }>;
    };
    broken.ranges[0].max = broken.ranges[0].min;
    const result = validateReferenceRangeArtifact(broken);
    expect(result.errors.join()).toContain("max must exceed min");
  });

  it("rejects entries without provenance", () => {
    const broken = JSON.parse(JSON.stringify(checkedInArtifact)) as {
      ranges: Array<{ provenance?: string }>;
    };
    delete broken.ranges[0].provenance;
    const result = validateReferenceRangeArtifact(broken);
    expect(result.errors.join()).toContain("provenance is required");
  });

  it("rejects duplicate metric ranges", () => {
    const broken = JSON.parse(JSON.stringify(checkedInArtifact)) as { ranges: unknown[] };
    broken.ranges.push(broken.ranges[0]);
    const result = validateReferenceRangeArtifact(broken);
    expect(result.errors.join()).toContain("duplicate range");
  });

  it("parse throws on invalid artifacts instead of defaulting silently", () => {
    expect(() => parseReferenceRangeArtifact({})).toThrow(/Invalid reference-range artifact/);
  });

  it("builds the public artifact path from a version id", () => {
    expect(referenceRangeArtifactPath("hr-bridge-v1")).toBe(
      "/data/mlb/model-reference-ranges/hr-bridge-v1.json",
    );
  });
});
