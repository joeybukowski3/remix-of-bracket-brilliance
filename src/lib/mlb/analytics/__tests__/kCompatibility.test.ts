import { describe, expect, it } from "vitest";
import {
  createPendingSettlement,
  HISTORY_RECORD_VERSION,
  validateHistoryObservation,
  type HrHistoryObservation,
} from "../historySchema";
import { getMetric, getMetricsForMarket, METRIC_REGISTRY, METRIC_REGISTRY_VERSION } from "../metricRegistry";
import { validateModelConfig } from "../modelConfig";
import { scoreRow, type ScoreEngineContext } from "../scoreEngine";
import type { ModelConfig, ReferenceRangeArtifact } from "../types";

/**
 * K second-phase compatibility proof (contract tests only — no K UI, and
 * current K projection/eligibility/odds/recommendation behavior untouched).
 */

/**
 * In-memory K range fixture. Bounds are the verified fixed ranges the
 * production kVs composite already uses in computePitcherMatchupRatings
 * (kRate 15–32, whiffRate 18–35, bbRate 3–12).
 */
const K_RANGE_FIXTURE: ReferenceRangeArtifact = {
  artifactVersion: "k-fixture-v0",
  scoreVersion: "k-fixture-abs@0",
  generatedAt: "2026-07-12T00:00:00Z",
  sourceSeasons: null,
  sourceDescription: "Test fixture mirroring verified kVs composite fixed ranges.",
  populationDefinition: "test fixture",
  sampleCount: null,
  ranges: [
    { metricKey: "pitcher-k-rate", min: 15, max: 32, provenance: "computePitcherMatchupRatings kVs blendRawAndPercentile(kRate, ..., 15, 32)" },
    { metricKey: "pitcher-whiff-pct", min: 18, max: 35, provenance: "computePitcherMatchupRatings kVs blendRawAndPercentile(whiffRate, ..., 18, 35)" },
    { metricKey: "pitcher-bb-rate", min: 3, max: 12, provenance: "computePitcherMatchupRatings kVs blendRawAndPercentile(bbRate, ..., 3, 12, { invert: true })" },
  ],
};

/** Mirrors the verified kVs composite allocation (0.45 / 0.35 / 0.20). */
const K_FIXTURE_MODEL: ModelConfig = {
  modelId: "k-fixture-model",
  market: "k",
  name: "K compatibility fixture",
  description: "Contract-test fixture only. Not a production model.",
  modelType: "weighted",
  origin: "curated",
  modelVersion: "0.0.1",
  scoreVersion: "k-fixture-abs@0",
  registryVersion: METRIC_REGISTRY_VERSION,
  weights: {
    "pitcher-k-rate": 45,
    "pitcher-whiff-pct": 35,
    "pitcher-bb-rate": 20,
  },
  hardFilters: [],
  visibleColumns: [],
  createdAt: "2026-07-12T00:00:00Z",
  updatedAt: "2026-07-12T00:00:00Z",
  schemaVersion: 1,
  completenessFloorPercent: 65,
};

describe("K market compatibility", () => {
  it("the shared registry supports market k", () => {
    const kMetrics = getMetricsForMarket("k");
    expect(kMetrics.map((m) => m.key)).toEqual(
      expect.arrayContaining(["pitcher-k-rate", "pitcher-whiff-pct", "pitcher-bb-rate"]),
    );
  });

  it("the model contract can represent a K weighted model", () => {
    const result = validateModelConfig(K_FIXTURE_MODEL, METRIC_REGISTRY);
    expect(result.errors).toEqual([]);
  });

  it("the score engine processes higher-better and lower-better K metrics", () => {
    const context: ScoreEngineContext = {
      metrics: METRIC_REGISTRY,
      model: K_FIXTURE_MODEL,
      rangeArtifact: K_RANGE_FIXTURE,
      registryVersion: METRIC_REGISTRY_VERSION,
    };
    const strong = scoreRow(context, {
      rawValues: { "pitcher-k-rate": 32, "pitcher-whiff-pct": 35, "pitcher-bb-rate": 3 },
    });
    const weak = scoreRow(context, {
      rawValues: { "pitcher-k-rate": 15, "pitcher-whiff-pct": 18, "pitcher-bb-rate": 12 },
    });
    expect(strong.absoluteScore).toBe(100);
    expect(weak.absoluteScore).toBe(0);
    // Lower walk rate contributes MORE (direction inversion).
    const strongBb = strong.contributions.find((c) => c.metricKey === "pitcher-bb-rate")!;
    expect(strongBb.direction).toBe("lower-better");
    expect(strongBb.normalizedValue).toBe(100);
  });

  it("the history schema carries pitcher id, exact K line, over/under side, workload and projection fields", () => {
    const observation: HrHistoryObservation = {
      recordVersion: HISTORY_RECORD_VERSION,
      snapshotType: "PUBLICATION",
      playerId: 592789, // pitcher's MLB id — canonical subject of a K prop
      gameId: 822880,
      teamId: 121,
      opposingPitcherId: null,
      market: "k",
      side: "over",
      line: 5.5,
      slateDate: "2026-07-12",
      capturedAt: "2026-07-12T15:30:00Z",
      modelId: "k-fixture-model",
      modelVersion: "0.0.1",
      scoreVersion: "k-fixture-abs@0",
      registryVersion: METRIC_REGISTRY_VERSION,
      generatorCommitSha: null,
      registryArtifactHash: null,
      modelArtifactHash: null,
      rangeArtifactHash: null,
      rawMetrics: {
        "pitcher-k-rate": 28.4,
        // Native-unit projection/workload context ride along as raw fields.
        "pitcher-projected-ks": 6.2,
      },
      normalizedMetrics: { "pitcher-k-rate": 78.82 },
      contributions: [],
      finalScore: 74.1,
      slateRank: 2,
      completenessPercent: 100,
      confidencePercent: 88,
      lineupStatus: "confirmed",
      battingOrder: null,
      starterConfirmed: true,
      sourceFreshness: "generation-run",
      oddsObservations: [],
      consensusQuote: null,
      settlement: createPendingSettlement(),
    };
    expect(validateHistoryObservation(observation).errors).toEqual([]);
    // Exact-line discipline: 5.5 and 6.5 are different markets.
    expect(
      validateHistoryObservation({ ...observation, line: 6.5 }).valid,
    ).toBe(true);
  });

  it("K projection edge stays a native-unit informational field outside the weighted score", () => {
    const projection = getMetric("pitcher-projected-ks")!;
    expect(projection.informationalOnly).toBe(true);
    expect(projection.weightable).toBe(false);
    expect(projection.unit).toBe("count");

    const withProjectionWeight: ModelConfig = {
      ...K_FIXTURE_MODEL,
      weights: { "pitcher-k-rate": 50, "pitcher-projected-ks": 50 },
    };
    const result = validateModelConfig(withProjectionWeight, METRIC_REGISTRY);
    expect(result.valid).toBe(false);
    expect(result.errors.join()).toContain("not weightable");
  });
});
