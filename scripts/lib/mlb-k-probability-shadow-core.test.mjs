import { describe, expect, it } from "vitest";
import {
  buildKProbabilityShadowArtifact,
  buildKProbabilityShadowRecord,
  buildV4DiagnosticsIndex,
} from "./mlb-k-probability-shadow-core.mjs";

const V4_BLOCK = {
  finalProjectedIP: 5.8,
  finalProjectedKPerIP: 1.05,
  bfPerIP: 4.3,
  seasonIPPerStart: 5.8,
  last10IPPerStart: 5.7,
  last5IPPerStart: 5.9,
  seasonGamesStarted: 28,
  seasonKPerIP: 1.05,
  last10KPerIP: 1.02,
  last5KPerIP: 1.08,
  seasonInnings: 160,
  opponentConfidence: 0.8,
};

function baseRow(overrides = {}) {
  return {
    pitcherId: 1001,
    gameId: 500123,
    pitcher: "Test Pitcher",
    team: "NYY",
    opponent: "BOS",
    projectedKs: 6.1,
    projectedIP: 5.8,
    projectedKRate: 0.22,
    projectedBF: 24.9,
    projectionSource: "v4",
    workloadConfidenceScore: 0.7,
    kLine: 5.5,
    kOddsOver: "-120",
    kOddsUnder: "-110",
    kOddsBook: "draftkings",
    ...overrides,
  };
}

describe("buildKProbabilityShadowRecord", () => {
  it("computes a full record when a line, two-sided odds, and V4 diagnostics are present", () => {
    const record = buildKProbabilityShadowRecord(baseRow(), V4_BLOCK, { simulations: 3000, slateDate: "2026-09-11" });
    expect(record.status).toBe("computed");
    expect(record.model.overProbability).not.toBeNull();
    expect(record.model.underProbability).not.toBeNull();
    expect(record.market.twoSided).toBe(true);
    expect(record.edge.lean).toMatch(/OVER|UNDER|NEUTRAL/);
    expect(["HIGH", "MEDIUM", "LOW"]).toContain(record.confidence.grade);
  });

  it("Over-side positive value: a strong model Over vs a weaker no-vig market Over produces OVER lean with a positive edge", () => {
    // Manufacture an extreme case: a very low line against a normal projection
    // guarantees a very high model Over probability, comfortably above any
    // plausible no-vig market Over at a balanced -110/-110 price.
    const record = buildKProbabilityShadowRecord(baseRow({ kLine: 1.5, kOddsOver: "-110", kOddsUnder: "-110" }), V4_BLOCK, { simulations: 4000 });
    expect(record.edge.lean).toBe("OVER");
    expect(record.edge.overProbabilityEdge).toBeGreaterThan(0);
    expect(record.edge.bestProbabilityEdge).toBeGreaterThan(0);
  });

  it("Under-side positive value: a very high line produces UNDER lean with a positive edge", () => {
    const record = buildKProbabilityShadowRecord(baseRow({ kLine: 10.5, kOddsOver: "-110", kOddsUnder: "-110" }), V4_BLOCK, { simulations: 4000 });
    expect(record.edge.lean).toBe("UNDER");
    expect(record.edge.underProbabilityEdge).toBeGreaterThan(0);
  });

  it("no-value case: when model and no-vig market roughly agree, lean can be NEUTRAL", () => {
    // Line chosen very close to the projection with a balanced market -- the
    // model and market should be close enough that neither edge is reliably
    // positive; assert the invariant (edges are computed, never NaN) rather
    // than a specific lean, since Monte Carlo noise can tip either way.
    const record = buildKProbabilityShadowRecord(baseRow({ kLine: 6.1, kOddsOver: "-110", kOddsUnder: "-110" }), V4_BLOCK, { simulations: 6000 });
    expect(Number.isFinite(record.edge.overProbabilityEdge)).toBe(true);
    expect(Number.isFinite(record.edge.underProbabilityEdge)).toBe(true);
  });

  it("missing odds: no line at all yields NO_MARKET status with every probability field null", () => {
    const record = buildKProbabilityShadowRecord(baseRow({ kLine: null, kOddsOver: null, kOddsUnder: null }), V4_BLOCK);
    expect(record.status).toBe("no_market");
    expect(record.model.overProbability).toBeNull();
    expect(record.edge.overProbabilityEdge).toBeNull();
  });

  it("one-sided odds: a line with only an Over price still computes model probabilities but never fabricates a de-vig market edge", () => {
    const record = buildKProbabilityShadowRecord(baseRow({ kOddsOver: "-120", kOddsUnder: null }), V4_BLOCK, { simulations: 2000 });
    expect(record.status).toBe("one_sided_market");
    expect(record.model.overProbability).not.toBeNull();
    expect(record.market.overNoVigProbability).toBeNull();
    expect(record.edge.overProbabilityEdge).toBeNull();
    expect(record.edge.lean).toBe("NEUTRAL");
  });

  it("missing historical variance (no V4 block): falls back to legacy-row-derived inputs without throwing or producing NaN", () => {
    const record = buildKProbabilityShadowRecord(baseRow(), null, { simulations: 1500 });
    expect(record.status).toBe("computed");
    expect(record.diagnostics.usedV4Diagnostics).toBe(false);
    expect(Number.isFinite(record.model.overProbability)).toBe(true);
  });

  it("role/fallback protection: a row with no usable workload or rate inputs anywhere is INSUFFICIENT_DATA-shaped, not a crash", () => {
    const record = buildKProbabilityShadowRecord(
      baseRow({ projectedIP: null, projectedKRate: null, projectedBF: null, workloadConfidenceScore: null }),
      null,
    );
    expect(record.status).toBe("insufficient_projection");
    expect(record.model.overProbability).toBeNull();
  });

  it("never produces NaN/Infinity anywhere in the record", () => {
    const record = buildKProbabilityShadowRecord(baseRow(), V4_BLOCK, { simulations: 2000 });
    const assertFinite = (value) => {
      if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
      else if (value && typeof value === "object") Object.values(value).forEach(assertFinite);
    };
    assertFinite(record);
  });

  it("probabilities stay within [0, 1]", () => {
    const record = buildKProbabilityShadowRecord(baseRow(), V4_BLOCK, { simulations: 2000 });
    for (const p of [record.model.overProbability, record.model.underProbability, record.market.overNoVigProbability, record.market.underNoVigProbability]) {
      if (p === null) continue;
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it("uses the RESOLVED projectedKs (post-resolution, V4->V2->legacy) for display, never the legacy or candidate fields", () => {
    // Simulates a row shape exactly like hr-props-raw.json after
    // resolve-mlb-k-production-projection.mjs has run: projectedKs is the
    // resolved value, distinct from legacyProjectedKs/candidateProjectedKs.
    const record = buildKProbabilityShadowRecord(
      baseRow({ projectedKs: 6.1, legacyProjectedKs: 5.7, candidateProjectedKs: 5.0 }),
      V4_BLOCK,
      { simulations: 500 },
    );
    expect(record.projectedKs).toBe(6.1);
    expect(record.projectedKs).not.toBe(5.7);
    expect(record.projectedKs).not.toBe(5.0);
  });

  it("sportsbook inputs cannot change the underlying model probability shape -- only the threshold moves", () => {
    // Same workload/rate inputs, only the market odds differ: the
    // distribution (and therefore meanSimulatedKs) must be identical.
    const cheap = buildKProbabilityShadowRecord(baseRow({ kOddsOver: "-500", kOddsUnder: "+400" }), V4_BLOCK, { simulations: 2000 });
    const juiced = buildKProbabilityShadowRecord(baseRow({ kOddsOver: "+400", kOddsUnder: "-500" }), V4_BLOCK, { simulations: 2000 });
    expect(cheap.model.meanSimulatedKs).toEqual(juiced.model.meanSimulatedKs);
    expect(cheap.model.overProbability).toEqual(juiced.model.overProbability);
  });
});

describe("buildV4DiagnosticsIndex", () => {
  it("drops ambiguous (duplicate) identity keys rather than resolving arbitrarily", () => {
    const artifact = {
      rows: [
        { game: { gameId: 1 }, pitcher: { id: 2 }, v4: { finalProjectedIP: 5 } },
        { game: { gameId: 1 }, pitcher: { id: 2 }, v4: { finalProjectedIP: 6 } },
      ],
    };
    const index = buildV4DiagnosticsIndex(artifact);
    expect(index.has("1|2")).toBe(false);
  });

  it("handles a missing/null artifact without throwing", () => {
    expect(buildV4DiagnosticsIndex(null).size).toBe(0);
    expect(buildV4DiagnosticsIndex({}).size).toBe(0);
  });
});

describe("buildKProbabilityShadowArtifact", () => {
  it("joins raw pitcher rows to their v4 diagnostics by gameId+pitcherId and tallies status counts", () => {
    const rawPayload = {
      date: "2026-09-11",
      pitchers: [baseRow(), baseRow({ pitcherId: 1002, gameId: 500124, kLine: null, kOddsOver: null, kOddsUnder: null })],
    };
    const shadowArtifact = {
      slateDate: "2026-09-11",
      rows: [{ game: { gameId: 500123 }, pitcher: { id: 1001 }, v4: V4_BLOCK }],
    };
    const artifact = buildKProbabilityShadowArtifact(rawPayload, shadowArtifact, { simulations: 1500 });
    expect(artifact.diagnostics.totalRows).toBe(2);
    expect(artifact.diagnostics.computedRows).toBe(1);
    expect(artifact.diagnostics.noMarketRows).toBe(1);
    expect(artifact.rows[0].diagnostics.usedV4Diagnostics).toBe(true);
  });

  it("degrades gracefully with no shadow artifact at all", () => {
    const rawPayload = { date: "2026-09-11", pitchers: [baseRow()] };
    const artifact = buildKProbabilityShadowArtifact(rawPayload, null, { simulations: 1000 });
    expect(artifact.diagnostics.totalRows).toBe(1);
    expect(artifact.rows[0].status).toBe("computed");
    expect(artifact.rows[0].diagnostics.usedV4Diagnostics).toBe(false);
  });

  it("degrades gracefully with an empty/malformed raw payload", () => {
    const artifact = buildKProbabilityShadowArtifact({}, null);
    expect(artifact.diagnostics.totalRows).toBe(0);
    expect(artifact.rows).toEqual([]);
  });
});
