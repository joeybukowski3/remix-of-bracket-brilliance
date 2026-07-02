/**
 * mlb-park-factors.test.mjs
 * Run via: node --test scripts/lib/mlb-park-factors.test.mjs
 *
 * Values below are pinned directly from src/lib/mlb/mlbParkFactors.ts at
 * port time. If mlbParkFactors.ts ever changes, this test (and the port
 * in mlb-park-factors.mjs) must be updated together.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getParkFactors, getParkType, PARK_DATA_SOURCE } from "./mlb-park-factors.mjs";

describe("getParkFactors: parity with mlbParkFactors.ts", () => {
  it("returns exact known values for a sample of venues", () => {
    assert.deepEqual(getParkFactors("Coors Field"), { runs: 118, hr: 140, hrPerGame: 3.12 });
    assert.deepEqual(getParkFactors("Oracle Park"), { runs: 92, hr: 85, hrPerGame: 1.71 });
    assert.deepEqual(getParkFactors("Yankee Stadium"), { runs: 110, hr: 118, hrPerGame: 2.68 });
    assert.deepEqual(getParkFactors("Wrigley Field"), { runs: 102, hr: 100, hrPerGame: 2.16 });
  });

  it("resolves known aliases (case/spacing-insensitive) to their canonical entry", () => {
    assert.deepEqual(getParkFactors("Camden Yards"), getParkFactors("Oriole Park at Camden Yards"));
    assert.deepEqual(getParkFactors("Marlins Park"), getParkFactors("loanDepot park"));
    assert.deepEqual(getParkFactors("Minute Maid Park"), getParkFactors("Daikin Park"));
    assert.deepEqual(getParkFactors("GUARANTEED RATE FIELD"), getParkFactors("Rate Field"));
    assert.deepEqual(getParkFactors("  rogers   center  "), getParkFactors("Rogers Centre"));
  });

  it("returns null for null/undefined/empty venue", () => {
    assert.equal(getParkFactors(null), null);
    assert.equal(getParkFactors(undefined), null);
    assert.equal(getParkFactors(""), null);
  });

  it("returns null for an unrecognized venue", () => {
    assert.equal(getParkFactors("Some Made Up Field"), null);
  });

  it("Coors Field is the most run-extreme park in the table (used as the shadow model's reference case)", () => {
    const allRuns = ["American Family Field", "Angel Stadium", "Busch Stadium", "Chase Field", "Citi Field",
      "Citizens Bank Park", "Comerica Park", "Coors Field", "Daikin Park", "Dodger Stadium", "Fenway Park",
      "Globe Life Field", "Great American Ball Park", "Guaranteed Rate Field", "Kauffman Stadium",
      "loanDepot park", "Nationals Park", "Oracle Park", "Oriole Park at Camden Yards", "Petco Park",
      "PNC Park", "Progressive Field", "Rate Field", "Rogers Centre", "Sutter Health Park", "T-Mobile Park",
      "Target Field", "Truist Park", "Wrigley Field", "Yankee Stadium"]
      .map((v) => Math.abs(getParkFactors(v).runs - 100));
    assert.equal(Math.max(...allRuns), Math.abs(118 - 100));
  });
});

describe("getParkType", () => {
  it("matches documented thresholds", () => {
    assert.equal(getParkType(118), "Hitter-friendly park");
    assert.equal(getParkType(110), "Hitter-friendly park");
    assert.equal(getParkType(106), "Slight hitter's park");
    assert.equal(getParkType(100), "Neutral park");
    assert.equal(getParkType(93), "Slight pitcher's park");
    assert.equal(getParkType(90), "Pitcher-friendly park");
    assert.equal(getParkType(85), "Pitcher-friendly park");
  });
});

describe("PARK_DATA_SOURCE", () => {
  it("is explicitly labeled as a static, multi-year table (not per-season)", () => {
    assert.equal(PARK_DATA_SOURCE, "static-multiyear");
  });
});
