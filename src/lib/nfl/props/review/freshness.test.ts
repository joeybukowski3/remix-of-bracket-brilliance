import { describe, expect, test } from "vitest";
import {
  buildYardageReviewFreshness,
  classifyFreshness,
  NFL_YARDAGE_FRESHNESS_THRESHOLDS,
  oldestTimestamp,
  worstFreshnessTier,
} from "./freshness";

const NOW = new Date("2026-08-26T18:00:00.000Z");

describe("classifyFreshness", () => {
  test("returns unknown for a missing timestamp", () => {
    expect(classifyFreshness(null, NFL_YARDAGE_FRESHNESS_THRESHOLDS.projection, NOW)).toEqual({
      tier: "unknown",
      ageHours: null,
      generatedAt: null,
    });
  });

  test("returns unknown for an unparsable timestamp", () => {
    expect(classifyFreshness("not-a-date", NFL_YARDAGE_FRESHNESS_THRESHOLDS.projection, NOW).tier).toBe("unknown");
  });

  test("treats a future timestamp as fresh rather than a false stale warning", () => {
    const result = classifyFreshness("2026-08-27T00:00:00.000Z", NFL_YARDAGE_FRESHNESS_THRESHOLDS.projection, NOW);
    expect(result.tier).toBe("fresh");
  });

  test("projection: fresh at 12h, aging at 48h, stale at 96h", () => {
    expect(classifyFreshness("2026-08-26T06:00:00.000Z", NFL_YARDAGE_FRESHNESS_THRESHOLDS.projection, NOW).tier).toBe("fresh");
    expect(classifyFreshness("2026-08-24T18:00:00.000Z", NFL_YARDAGE_FRESHNESS_THRESHOLDS.projection, NOW).tier).toBe("aging");
    expect(classifyFreshness("2026-08-22T18:00:00.000Z", NFL_YARDAGE_FRESHNESS_THRESHOLDS.projection, NOW).tier).toBe("stale");
  });

  test("depth chart tier boundary matches the generator's own 48h stale threshold", () => {
    expect(classifyFreshness("2026-08-24T18:00:00.001Z", NFL_YARDAGE_FRESHNESS_THRESHOLDS.depthChart, NOW).tier).toBe("aging");
    expect(classifyFreshness("2026-08-24T17:59:59.000Z", NFL_YARDAGE_FRESHNESS_THRESHOLDS.depthChart, NOW).tier).toBe("stale");
  });

  test("sportsbook: fresh window is much shorter than projection/depth-chart", () => {
    expect(classifyFreshness("2026-08-26T13:00:00.000Z", NFL_YARDAGE_FRESHNESS_THRESHOLDS.sportsbook, NOW).tier).toBe("fresh");
    expect(classifyFreshness("2026-08-26T09:00:00.000Z", NFL_YARDAGE_FRESHNESS_THRESHOLDS.sportsbook, NOW).tier).toBe("aging");
    expect(classifyFreshness("2026-08-25T12:00:00.000Z", NFL_YARDAGE_FRESHNESS_THRESHOLDS.sportsbook, NOW).tier).toBe("stale");
  });

  test("opponent context: weekly-cadence window", () => {
    expect(classifyFreshness("2026-08-20T18:00:00.000Z", NFL_YARDAGE_FRESHNESS_THRESHOLDS.opponentContext, NOW).tier).toBe("fresh");
    expect(classifyFreshness("2026-08-16T18:00:00.000Z", NFL_YARDAGE_FRESHNESS_THRESHOLDS.opponentContext, NOW).tier).toBe("aging");
    expect(classifyFreshness("2026-07-01T18:00:00.000Z", NFL_YARDAGE_FRESHNESS_THRESHOLDS.opponentContext, NOW).tier).toBe("stale");
  });
});

describe("oldestTimestamp", () => {
  test("returns the chronologically oldest value", () => {
    expect(
      oldestTimestamp(["2026-08-04T00:00:00.000Z", "2026-08-03T00:00:00.000Z", "2026-08-10T00:00:00.000Z"]),
    ).toBe("2026-08-03T00:00:00.000Z");
  });

  test("ignores null/undefined and unparsable entries", () => {
    expect(oldestTimestamp([null, undefined, "not-a-date", "2026-08-03T00:00:00.000Z"])).toBe("2026-08-03T00:00:00.000Z");
  });

  test("returns null when nothing is usable", () => {
    expect(oldestTimestamp([null, undefined, "not-a-date"])).toBeNull();
  });
});

describe("buildYardageReviewFreshness", () => {
  test("classifies each of the four sources independently, using the oldest opponent-context timestamp", () => {
    const sources = buildYardageReviewFreshness(
      {
        projectionGeneratedAt: "2026-08-26T06:00:00.000Z",
        depthChartSnapshotAt: "2026-08-25T07:39:23Z",
        sportsbookGeneratedAt: "2026-08-26T14:09:24.393Z",
        opponentContextGeneratedAts: ["2026-08-26T16:32:53.409Z", "2026-08-04T12:23:37.931Z", "2026-08-03T10:13:18.750Z"],
      },
      NOW,
    );

    expect(sources.map((s) => s.key)).toEqual(["projection", "depthChart", "sportsbook", "opponentContext"]);
    const opponentContext = sources.find((s) => s.key === "opponentContext");
    expect(opponentContext?.generatedAt).toBe("2026-08-03T10:13:18.750Z");
    expect(opponentContext?.tier).toBe("stale");
  });

  test("a source with no generatedAt at all resolves to unknown, not fresh", () => {
    const sources = buildYardageReviewFreshness(
      {
        projectionGeneratedAt: null,
        depthChartSnapshotAt: null,
        sportsbookGeneratedAt: null,
        opponentContextGeneratedAts: [null, null, null],
      },
      NOW,
    );
    expect(sources.every((s) => s.tier === "unknown")).toBe(true);
  });
});

describe("worstFreshnessTier", () => {
  test("returns fresh when every source is fresh", () => {
    const sources = buildYardageReviewFreshness(
      {
        projectionGeneratedAt: NOW.toISOString(),
        depthChartSnapshotAt: NOW.toISOString(),
        sportsbookGeneratedAt: NOW.toISOString(),
        opponentContextGeneratedAts: [NOW.toISOString()],
      },
      NOW,
    );
    expect(worstFreshnessTier(sources)).toBe("fresh");
  });

  test("unknown outranks stale", () => {
    expect(
      worstFreshnessTier([
        { key: "projection", label: "Projections", tier: "stale", ageHours: 1000, generatedAt: "x" },
        { key: "depthChart", label: "Depth chart", tier: "unknown", ageHours: null, generatedAt: null },
      ]),
    ).toBe("unknown");
  });

  test("returns fresh for an empty source list", () => {
    expect(worstFreshnessTier([])).toBe("fresh");
  });
});
