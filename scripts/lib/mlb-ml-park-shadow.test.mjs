/**
 * mlb-ml-park-shadow.test.mjs
 * Run via: node --test scripts/lib/mlb-ml-park-shadow.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeMlParkShadow,
  computeParkVarianceModifier,
  NEUTRAL_BAND_PTS,
  MAX_DEVIATION_PTS,
  MAX_VARIANCE_REDUCTION,
} from "./mlb-ml-park-shadow.mjs";

describe("computeParkVarianceModifier: deterministic bounds", () => {
  it("is exactly 0 at the neutral point (100)", () => {
    assert.equal(computeParkVarianceModifier(100), 0);
  });

  it("is exactly 0 anywhere inside the neutral band", () => {
    assert.equal(computeParkVarianceModifier(100 + NEUTRAL_BAND_PTS), 0);
    assert.equal(computeParkVarianceModifier(100 - NEUTRAL_BAND_PTS), 0);
    assert.equal(computeParkVarianceModifier(102), 0);
    assert.equal(computeParkVarianceModifier(97), 0);
  });

  it("is symmetric: a hitter-friendly and pitcher-friendly park with the same deviation get the same modifier", () => {
    assert.equal(computeParkVarianceModifier(100 + 15), computeParkVarianceModifier(100 - 15));
  });

  it("increases monotonically with distance from neutral, up to the saturation point", () => {
    const m1 = computeParkVarianceModifier(108);
    const m2 = computeParkVarianceModifier(112);
    const m3 = computeParkVarianceModifier(118);
    assert.ok(m1 < m2);
    assert.ok(m2 < m3);
  });

  it("saturates at MAX_VARIANCE_REDUCTION at/beyond MAX_DEVIATION_PTS and never exceeds it", () => {
    const atCap = computeParkVarianceModifier(100 + MAX_DEVIATION_PTS);
    const beyondCap = computeParkVarianceModifier(100 + MAX_DEVIATION_PTS + 50);
    assert.ok(Math.abs(atCap - MAX_VARIANCE_REDUCTION) < 1e-9);
    assert.equal(beyondCap, MAX_VARIANCE_REDUCTION);
  });

  it("Coors Field (runs=118) lands below the hard cap, not pinned to it", () => {
    const coorsModifier = computeParkVarianceModifier(118);
    assert.ok(coorsModifier > 0);
    assert.ok(coorsModifier < MAX_VARIANCE_REDUCTION);
  });
});

describe("computeMlParkShadow: deterministic output", () => {
  it("same input always produces the same output (pure function)", () => {
    const input = { venue: "Coors Field", baseDifferential: 6, basePick: "away" };
    const r1 = computeMlParkShadow(input);
    const r2 = computeMlParkShadow(input);
    assert.deepEqual(r1, r2);
  });

  it("neutral park (Wrigley Field, runs=102) produces no material change to the differential", () => {
    const result = computeMlParkShadow({ venue: "Wrigley Field", baseDifferential: 6, basePick: "away" });
    assert.equal(result.parkVarianceModifier, 0);
    assert.equal(result.parkShadowDifferential, 6);
    assert.equal(result.parkShadowPick, "away");
  });

  it("high-run park (Coors Field) shrinks the differential within the documented bound", () => {
    const result = computeMlParkShadow({ venue: "Coors Field", baseDifferential: 10, basePick: "home" });
    assert.ok(result.parkVarianceModifier > 0 && result.parkVarianceModifier <= MAX_VARIANCE_REDUCTION);
    assert.ok(result.parkShadowDifferential < 10);
    assert.ok(result.parkShadowDifferential >= 10 * (1 - MAX_VARIANCE_REDUCTION) - 1); // -1 for rounding
    assert.equal(result.parkShadowPick, "home"); // same side, just shrunk
  });

  it("low-run park (Oracle Park) shrinks the differential within the documented bound", () => {
    const result = computeMlParkShadow({ venue: "Oracle Park", baseDifferential: 10, basePick: "away" });
    assert.ok(result.parkVarianceModifier > 0 && result.parkVarianceModifier <= MAX_VARIANCE_REDUCTION);
    assert.ok(result.parkShadowDifferential <= 10);
    assert.equal(result.parkShadowPick, "away");
  });
});

describe("computeMlParkShadow: missing/unknown venue fallback", () => {
  it("missing venue (null) falls back to neutral with explicit data-quality metadata", () => {
    const result = computeMlParkShadow({ venue: null, baseDifferential: 8, basePick: "away" });
    assert.equal(result.parkDataQuality, "missing_venue");
    assert.equal(result.parkVarianceModifier, 0);
    assert.equal(result.parkRunFactor, 100);
    assert.equal(result.parkShadowDifferential, 8);
    assert.equal(result.parkShadowPick, "away");
  });

  it("missing venue (empty string) falls back to neutral", () => {
    const result = computeMlParkShadow({ venue: "", baseDifferential: 8, basePick: "home" });
    assert.equal(result.parkDataQuality, "missing_venue");
    assert.equal(result.parkVarianceModifier, 0);
  });

  it("unknown/unrecognized venue falls back to neutral with explicit data-quality metadata", () => {
    const result = computeMlParkShadow({ venue: "Some New Stadium Nobody Has Heard Of", baseDifferential: 8, basePick: "away" });
    assert.equal(result.parkDataQuality, "unknown_venue");
    assert.equal(result.parkVarianceModifier, 0);
    assert.equal(result.parkRunFactor, 100);
    assert.equal(result.parkShadowDifferential, 8);
  });

  it("missing_venue and unknown_venue are distinguishable from each other and from known_venue", () => {
    const missing = computeMlParkShadow({ venue: null, baseDifferential: 5, basePick: "away" });
    const unknown = computeMlParkShadow({ venue: "Not A Real Park", baseDifferential: 5, basePick: "away" });
    const known = computeMlParkShadow({ venue: "Coors Field", baseDifferential: 5, basePick: "away" });
    assert.equal(missing.parkDataQuality, "missing_venue");
    assert.equal(unknown.parkDataQuality, "unknown_venue");
    assert.equal(known.parkDataQuality, "known_venue");
  });
});

describe("computeMlParkShadow: strong-pick non-inversion", () => {
  it("cannot flip a strong away pick to home, even at the most extreme park in the table", () => {
    const result = computeMlParkShadow({ venue: "Coors Field", baseDifferential: 20, basePick: "away" });
    assert.equal(result.parkShadowPick, "away");
  });

  it("cannot flip a strong home pick to away, even at the most extreme park in the table", () => {
    const result = computeMlParkShadow({ venue: "Coors Field", baseDifferential: 20, basePick: "home" });
    assert.equal(result.parkShadowPick, "home");
  });

  it("bounded score movement: park-adjusted differential never falls below (1 - MAX_VARIANCE_REDUCTION) of the base, for any venue", () => {
    const venues = ["Coors Field", "Oracle Park", "Yankee Stadium", "Busch Stadium", "Wrigley Field", null, "Unknown Park XYZ"];
    for (const venue of venues) {
      const result = computeMlParkShadow({ venue, baseDifferential: 10, basePick: "away" });
      assert.ok(result.parkShadowDifferential >= 10 * (1 - MAX_VARIANCE_REDUCTION) - 1);
      assert.ok(result.parkShadowDifferential <= 10);
    }
  });

  it("a push stays a push regardless of park", () => {
    const result = computeMlParkShadow({ venue: "Coors Field", baseDifferential: 0, basePick: "push" });
    assert.equal(result.parkShadowPick, "push");
    assert.equal(result.parkShadowDifferential, 0);
  });

  it("park variance can weaken a borderline pick to push, but this is not a 'flip' -- confirms the boundary behaves as documented", () => {
    // A pick right at the push threshold, at the most extreme park, may
    // cross into push -- this is expected variance-driven uncertainty,
    // not a side inversion (there is no "push -> other team" path).
    const result = computeMlParkShadow({ venue: "Coors Field", baseDifferential: 2.6, basePick: "away" });
    assert.ok(result.parkShadowPick === "away" || result.parkShadowPick === "push");
    assert.notEqual(result.parkShadowPick, "home");
  });
});

describe("computeMlParkShadow: identification fields", () => {
  it("carries live and shadow version identifiers, distinct from each other", () => {
    const result = computeMlParkShadow({ venue: "Coors Field", baseDifferential: 5, basePick: "away" });
    assert.equal(result.liveModelVersion, "mlb-ml-edge-v1.0");
    assert.equal(result.shadowExperimentVersion, "mlb-ml-phase2-shadow-v1");
    assert.equal(result.shadowComponent, "park-context");
  });

  it("labels the data source honestly as a static multi-year table, not a live season feed", () => {
    const result = computeMlParkShadow({ venue: "Coors Field", baseDifferential: 5, basePick: "away" });
    assert.equal(result.parkDataSource, "static-multiyear");
    assert.equal(result.parkDataSeason, null);
  });
});
