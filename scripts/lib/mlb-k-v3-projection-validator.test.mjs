/**
 * mlb-k-v3-projection-validator.test.mjs
 * Run via: node --test scripts/lib/mlb-k-v3-projection-validator.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  K_PROJECTION_V3_REJECTION_REASON as REASON,
  V3_BOUNDS,
  validateV3ForProduction,
} from "./mlb-k-v3-projection-validator.mjs";

/** A structurally valid v3 block: rate x BF equals the published strikeouts. */
const validBlock = (overrides = {}) => {
  const base = {
    modelVersion: "mlb-k-projection-v3",
    projectedKRate: 0.3059,
    projectedBF: 22.86,
    finalProjectedIP: 5.6,
    alpha: 0.8402,
    seasonBF: 657,
    seasonBFSource: "workload.pitcherContext.seasonBattersFaced",
    flags: [],
    ...overrides,
  };
  // `in` rather than `??`: an explicit null/0 override must survive, which is
  // exactly what the fail-closed cases below are testing.
  const projectedKs = "projectedKs" in overrides ? overrides.projectedKs : base.projectedKRate * base.projectedBF;
  return { ...base, projectedKs };
};

describe("v3 production gate: accepts a sound block", () => {
  it("accepts a well-formed projection", () => {
    assert.deepStrictEqual(validateV3ForProduction(validBlock()), { ok: true, reason: null });
  });

  it("accepts a fallback alpha, which is just today's production constant", () => {
    const out = validateV3ForProduction(validBlock({ alpha: 0.55, seasonBF: null, seasonBFSource: "unavailable" }));
    assert.strictEqual(out.ok, true);
  });

  it("accepts the venue-split provenance", () => {
    const out = validateV3ForProduction(
      validBlock({ seasonBFSource: "details.pitcherVenueSplits.season.battersFaced" }),
    );
    assert.strictEqual(out.ok, true);
  });
});

describe("v3 production gate: fails closed", () => {
  it("rejects a missing block", () => {
    assert.strictEqual(validateV3ForProduction(null).reason, REASON.MISSING_V3_BLOCK);
    assert.strictEqual(validateV3ForProduction(undefined).reason, REASON.MISSING_V3_BLOCK);
    assert.strictEqual(validateV3ForProduction("nope").reason, REASON.MISSING_V3_BLOCK);
  });

  it("rejects a foreign or missing model version", () => {
    assert.strictEqual(
      validateV3ForProduction(validBlock({ modelVersion: "mlb-k-projection-v2-production" })).reason,
      REASON.V3_MODEL_VERSION_MISMATCH,
    );
  });

  it("rejects a deliberately declined opener or reliever", () => {
    assert.strictEqual(
      validateV3ForProduction(validBlock({ flags: ["ROLE_OUT_OF_V3_SCOPE_OPENER"], projectedKs: null })).reason,
      REASON.V3_ROLE_OUT_OF_SCOPE,
    );
    assert.strictEqual(
      validateV3ForProduction(validBlock({ flags: ["ROLE_OUT_OF_V3_SCOPE_RELIEVER"] })).reason,
      REASON.V3_ROLE_OUT_OF_SCOPE,
    );
  });

  it("rejects a null or zero projection rather than publishing it", () => {
    assert.strictEqual(validateV3ForProduction(validBlock({ projectedKs: null })).reason, REASON.INVALID_V3_PROJECTION);
    assert.strictEqual(validateV3ForProduction(validBlock({ projectedKs: 0 })).reason, REASON.INVALID_V3_PROJECTION);
    assert.strictEqual(validateV3ForProduction(validBlock({ projectedKs: NaN })).reason, REASON.INVALID_V3_PROJECTION);
  });

  it("rejects a K rate outside the model's own clamp", () => {
    assert.strictEqual(
      validateV3ForProduction(validBlock({ projectedKRate: V3_BOUNDS.minKRate - 0.01 })).reason,
      REASON.INVALID_V3_K_RATE,
    );
    assert.strictEqual(
      validateV3ForProduction(validBlock({ projectedKRate: V3_BOUNDS.maxKRate + 0.01 })).reason,
      REASON.INVALID_V3_K_RATE,
    );
  });

  it("rejects batters faced outside the starter envelope", () => {
    assert.strictEqual(validateV3ForProduction(validBlock({ projectedBF: 11 })).reason, REASON.INVALID_V3_BATTERS_FACED);
    assert.strictEqual(validateV3ForProduction(validBlock({ projectedBF: 31 })).reason, REASON.INVALID_V3_BATTERS_FACED);
  });

  it("rejects innings outside the starter envelope", () => {
    assert.strictEqual(validateV3ForProduction(validBlock({ finalProjectedIP: 2.9 })).reason, REASON.INVALID_V3_INNINGS);
    assert.strictEqual(validateV3ForProduction(validBlock({ finalProjectedIP: 8.6 })).reason, REASON.INVALID_V3_INNINGS);
  });

  it("rejects an out-of-range alpha", () => {
    assert.strictEqual(validateV3ForProduction(validBlock({ alpha: -0.1 })).reason, REASON.INVALID_V3_ALPHA);
    assert.strictEqual(validateV3ForProduction(validBlock({ alpha: 1.1 })).reason, REASON.INVALID_V3_ALPHA);
    assert.strictEqual(validateV3ForProduction(validBlock({ alpha: null })).reason, REASON.INVALID_V3_ALPHA);
  });

  it("rejects an unevaluated season-BF provenance", () => {
    assert.strictEqual(
      validateV3ForProduction(validBlock({ seasonBFSource: "not-evaluated" })).reason,
      REASON.INVALID_V3_SEASON_BF_PROVENANCE,
    );
    assert.strictEqual(
      validateV3ForProduction(validBlock({ seasonBFSource: "guessed" })).reason,
      REASON.INVALID_V3_SEASON_BF_PROVENANCE,
    );
  });

  it("rejects a block whose parts do not multiply to its own answer", () => {
    // rate x BF = 6.99, but the block claims 9.5.
    assert.strictEqual(validateV3ForProduction(validBlock({ projectedKs: 9.5 })).reason, REASON.INVALID_V3_PROJECTION);
  });

  it("never coerces a null to zero anywhere", () => {
    for (const field of ["projectedKRate", "projectedBF", "finalProjectedIP", "alpha"]) {
      const out = validateV3ForProduction(validBlock({ [field]: null }));
      assert.strictEqual(out.ok, false, `${field} null must be rejected, not coerced`);
    }
  });

  it("is deterministic", () => {
    const block = validBlock();
    assert.deepStrictEqual(validateV3ForProduction(block), validateV3ForProduction(block));
  });
});

// ---------------------------------------------------------------------------
// Resolver integration: the actual production authority switch.
// ---------------------------------------------------------------------------

import {
  K_PROJECTION_SOURCE,
  applyResolvedKProjection,
  resolveKProjection,
} from "./mlb-k-production-projection.mjs";

/** A minimal artifact shaped exactly like k-props-v2-shadow.json. */
const buildArtifact = (v3Block, v2Overrides = {}) => ({
  schemaVersion: 2,
  slateDate: "2026-09-06",
  projectionMode: "shadow",
  rows: [
    {
      key: "2026-09-06|gavin-williams|CLE|DET",
      slateDate: "2026-09-06",
      game: { gameId: 824500, pitcherIsHome: true },
      pitcher: { id: 668909, name: "Gavin Williams", team: "CLE", opponent: "DET" },
      v2: {
        modelVersion: "mlb-k-projection-v2-production",
        projectedStrikeouts: 6.08,
        projectedKRate: 0.2792,
        projectedBattersFaced: 21.775,
        projectedInnings: 4.946,
        confidence: "high",
        ...v2Overrides,
      },
      v3: v3Block,
    },
  ],
});

const legacyRow = {
  gameId: 824500,
  pitcherId: 668909,
  pitcher: "Gavin Williams",
  team: "CLE",
  opponent: "DET",
  kLine: 7.5,
  projectedKs: 5.2,
  legacyProjectedKs: 5.2,
};

const resolve = (artifact) =>
  resolveKProjection({ legacyRow, artifact, publicSlateDate: "2026-09-06", artifactValid: true });

describe("production authority: v3 -> v2 -> legacy", () => {
  it("uses v3 when the block passes the gate", () => {
    const out = resolve(buildArtifact(validBlock()));
    assert.strictEqual(out.source, K_PROJECTION_SOURCE.V3);
    // Full precision is published; display rounding happens at presentation.
    assert.ok(Math.abs(out.effectiveProjectedKs - 0.3059 * 22.86) < 1e-9);
    assert.strictEqual(out.modelVersion, "mlb-k-projection-v3");
    assert.strictEqual(out.v3RejectionReason, null);
  });

  it("keeps v2 and records why when v3 declines an opener", () => {
    const out = resolve(buildArtifact(validBlock({ flags: ["ROLE_OUT_OF_V3_SCOPE_OPENER"], projectedKs: null })));
    assert.strictEqual(out.source, K_PROJECTION_SOURCE.V2);
    assert.strictEqual(out.effectiveProjectedKs, 6.08);
    assert.strictEqual(out.v3RejectionReason, "v3-role-out-of-scope");
    assert.strictEqual(out.modelVersion, "mlb-k-projection-v2-production");
  });

  it("keeps v2 when the v3 block is missing entirely", () => {
    const out = resolve(buildArtifact(undefined));
    assert.strictEqual(out.source, K_PROJECTION_SOURCE.V2);
    assert.strictEqual(out.effectiveProjectedKs, 6.08);
    assert.strictEqual(out.v3RejectionReason, "missing-v3-block");
  });

  it("keeps v2 when the v3 projection is unusable", () => {
    const out = resolve(buildArtifact(validBlock({ projectedKs: 0 })));
    assert.strictEqual(out.source, K_PROJECTION_SOURCE.V2);
    assert.strictEqual(out.v3RejectionReason, "invalid-v3-projection");
  });

  it("never reaches v3 when v2 itself was rejected", () => {
    // Low confidence rejects the whole V2 path, so legacy wins and v3 is moot.
    const out = resolve(buildArtifact(validBlock(), { confidence: "low" }));
    assert.strictEqual(out.source, K_PROJECTION_SOURCE.LEGACY_FALLBACK);
    assert.strictEqual(out.effectiveProjectedKs, 5.2);
    assert.strictEqual(out.v3RejectionReason, null);
  });

  it("falls back to legacy when the artifact is stale, regardless of v3", () => {
    const stale = buildArtifact(validBlock());
    stale.slateDate = "2026-09-05";
    const out = resolveKProjection({ legacyRow, artifact: stale, publicSlateDate: "2026-09-06", artifactValid: true });
    assert.strictEqual(out.source, K_PROJECTION_SOURCE.LEGACY_FALLBACK);
    assert.strictEqual(out.fallbackReason, "stale-v2-artifact");
  });

  it("publishes both projections plus provenance on the row", () => {
    const row = applyResolvedKProjection(legacyRow, resolve(buildArtifact(validBlock())));
    assert.strictEqual(row.projectionSource, "v3");
    assert.strictEqual(row.projectionModelVersion, "mlb-k-projection-v3");
    // v3ProjectedKs is the raw model value; only the published projection rounds.
    assert.ok(Math.abs(row.v3ProjectedKs - 0.3059 * 22.86) < 1e-6);
    assert.strictEqual(row.v2ProjectedKs, 6.08);
    // Legacy is preserved verbatim as the last-resort fail-safe.
    assert.strictEqual(row.legacyProjectedKs, 5.2);
  });

  it("recomputes kAdjustment from the published value, not from v2", () => {
    const row = applyResolvedKProjection(legacyRow, resolve(buildArtifact(validBlock())));
    // (6.9927 - 7.5) * 5 rounded
    assert.strictEqual(row.kAdjustment, Math.round((row.projectedKs - 7.5) * 5));
  });

  it("is deterministic", () => {
    const artifact = buildArtifact(validBlock());
    assert.deepStrictEqual(resolve(artifact), resolve(artifact));
  });

  it("never lets the market line influence which model is selected", () => {
    const a = resolveKProjection({
      legacyRow: { ...legacyRow, kLine: 2.5 },
      artifact: buildArtifact(validBlock()),
      publicSlateDate: "2026-09-06",
      artifactValid: true,
    });
    const b = resolveKProjection({
      legacyRow: { ...legacyRow, kLine: 11.5 },
      artifact: buildArtifact(validBlock()),
      publicSlateDate: "2026-09-06",
      artifactValid: true,
    });
    assert.strictEqual(a.source, b.source);
    assert.strictEqual(a.effectiveProjectedKs, b.effectiveProjectedKs);
  });
});

// ---------------------------------------------------------------------------
// Resolved workload consistency: the published strikeouts and the published
// innings must come from the SAME model.
// ---------------------------------------------------------------------------

describe("resolved workload travels with the published projection", () => {
  const v3Block = validBlock({ finalProjectedIP: 5.5884, projectedBF: 22.8779 });

  it("publishes v3 innings, BF and rate when v3 is selected", () => {
    const row = applyResolvedKProjection(legacyRow, resolve(buildArtifact(v3Block)));
    assert.strictEqual(row.projectionSource, "v3");
    assert.strictEqual(row.projectedIP, 5.5884);
    assert.strictEqual(row.projectedBF, 22.8779);
    assert.strictEqual(row.projectedKRate, v3Block.projectedKRate);
    assert.strictEqual(row.resolvedProjectedIPSource, "v3");
    assert.strictEqual(row.resolvedProjectedBFSource, "v3");
    assert.strictEqual(row.resolvedProjectionModel, "mlb-k-projection-v3");
  });

  it("keeps the published row internally consistent: Ks == rate x BF", () => {
    const row = applyResolvedKProjection(legacyRow, resolve(buildArtifact(v3Block)));
    assert.ok(Math.abs(row.projectedKs - row.projectedKRate * row.projectedBF) < 0.02);
  });

  it("publishes v2 innings when v3 is refused, never a v3/v2 hybrid", () => {
    const declined = validBlock({ flags: ["ROLE_OUT_OF_V3_SCOPE_OPENER"], projectedKs: null });
    const row = applyResolvedKProjection(legacyRow, resolve(buildArtifact(declined)));
    assert.strictEqual(row.projectionSource, "v2");
    assert.strictEqual(row.projectedIP, 4.946);
    assert.strictEqual(row.projectedBF, 21.775);
    assert.strictEqual(row.resolvedProjectedIPSource, "v2");
    assert.strictEqual(row.resolvedProjectionModel, "mlb-k-projection-v2-production");
  });

  it("an opener keeps v2 innings BELOW the v3 starter floor, which v3 could not express", () => {
    const opener = validBlock({ flags: ["ROLE_OUT_OF_V3_SCOPE_OPENER"], projectedKs: null });
    const artifact = buildArtifact(opener);
    artifact.rows[0].v2.projectedInnings = 1.182;
    artifact.rows[0].v2.projectedBattersFaced = 5.146;
    const row = applyResolvedKProjection(legacyRow, resolve(artifact));
    assert.strictEqual(row.projectedIP, 1.182);
    assert.ok(row.projectedIP < 3, "v2 can publish an opener's true workload; v3's floor is 3.0");
  });

  it("leaves the stored legacy innings alone on a legacy fallback", () => {
    const artifact = buildArtifact(validBlock(), { confidence: "low" });
    const row = applyResolvedKProjection({ ...legacyRow, projectedIP: 4.4 }, resolve(artifact));
    assert.strictEqual(row.projectionSource, "legacy-fallback");
    assert.strictEqual(row.projectedIP, 4.4);
    assert.strictEqual(row.resolvedProjectedIPSource, "legacy-stored");
  });
});

// ---------------------------------------------------------------------------
// Full-precision publishing: the resolver must not pre-round the projection.
// ---------------------------------------------------------------------------

describe("published projection keeps full precision", () => {
  it("does not round the published strikeouts to one decimal", () => {
    const block = validBlock({ projectedKRate: 0.25, projectedBF: 21.84 }); // 5.46
    const out = resolve(buildArtifact(block));
    assert.ok(Math.abs(out.effectiveProjectedKs - 5.46) < 1e-9, `got ${out.effectiveProjectedKs}`);
    assert.notStrictEqual(out.effectiveProjectedKs, 5.5);
  });

  it("keeps a genuine sub-0.05 edge visible instead of rounding it onto the line", () => {
    // 5.46 vs a 5.5 line is a real UNDER; rounding first made it a push.
    const block = validBlock({ projectedKRate: 0.25, projectedBF: 21.84 });
    const out = resolve(buildArtifact(block));
    assert.ok(out.effectiveProjectedKs < 5.5, "must stay strictly under the line");
  });
});
