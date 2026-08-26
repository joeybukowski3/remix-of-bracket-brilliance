import { describe, expect, it } from "vitest";
import { aggregateEdgeBuckets, bucketizeEdge } from "./nfl-research-buckets.mjs";

describe("bucketizeEdge", () => {
  it("uses a wider bucket width for passing than rushing/receiving", () => {
    expect(bucketizeEdge(10, "passing")).toBe("0..15");
    expect(bucketizeEdge(10, "rushing")).toBe("7.5..15");
    expect(bucketizeEdge(10, "receiving")).toBe("10..15");
  });

  it("buckets a negative edge symmetrically around 0", () => {
    expect(bucketizeEdge(-3, "receiving")).toBe("-5..0");
  });

  it("returns null for an unknown market or missing value", () => {
    expect(bucketizeEdge(10, "unknown")).toBeNull();
    expect(bucketizeEdge(null, "passing")).toBeNull();
  });
});

function row(overrides = {}) {
  return { rawEdgeYards: 8, outcome: "over", overPrice: -110, underPrice: -110, actualVsLine: 4, projectionError: -2, ...overrides };
}

describe("aggregateEdgeBuckets", () => {
  it("groups rows into the correct bucket and computes overHitRate for positive-edge rows", () => {
    const rows = [row({ rawEdgeYards: 8, outcome: "over" }), row({ rawEdgeYards: 8, outcome: "under" })];
    const buckets = aggregateEdgeBuckets(rows, "receiving");
    const bucket = buckets.find((b) => b.n === 2);
    expect(bucket.overHitRate).toBeCloseTo(0.5, 5);
  });

  it("computes underHitRate for negative-edge rows independently of overHitRate", () => {
    const rows = [row({ rawEdgeYards: -8, outcome: "under" }), row({ rawEdgeYards: -8, outcome: "over" })];
    const buckets = aggregateEdgeBuckets(rows, "receiving");
    const bucket = buckets[0];
    expect(bucket.underHitRate).toBeCloseTo(0.5, 5);
    expect(bucket.overHitRate).toBeNull(); // no positive-edge rows in this bucket
  });

  it("excludes ungraded rows (no outcome) from hit-rate/ROI but still counts them in n", () => {
    const rows = [row({ outcome: null, actualVsLine: null, projectionError: null })];
    const buckets = aggregateEdgeBuckets(rows, "receiving");
    expect(buckets[0].n).toBe(1);
    expect(buckets[0].gradedN).toBe(0);
    expect(buckets[0].overHitRate).toBeNull();
  });

  it("returns buckets sorted ascending by lower bound", () => {
    const rows = [row({ rawEdgeYards: 8 }), row({ rawEdgeYards: -8 }), row({ rawEdgeYards: 0 })];
    const buckets = aggregateEdgeBuckets(rows, "receiving");
    const lowerBounds = buckets.map((b) => parseFloat(b.bucket));
    expect(lowerBounds).toEqual([...lowerBounds].sort((a, b) => a - b));
  });
});
