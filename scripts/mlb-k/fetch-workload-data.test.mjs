/**
 * fetch-workload-data.test.mjs
 * Run via: node --test scripts/mlb-k/fetch-workload-data.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseInnings } from "./fetch-workload-data.mjs";

describe("parseInnings: baseball innings notation (thirds, not decimal tenths)", () => {
  it("0.1 converts to 1/3 of an inning", () => {
    assert.equal(parseInnings("0.1"), 1 / 3);
  });

  it("0.2 converts to 2/3 of an inning", () => {
    assert.equal(parseInnings("0.2"), 2 / 3);
  });

  it("1.1 converts to 1 and 1/3 innings", () => {
    assert.equal(parseInnings("1.1"), 1 + 1 / 3);
  });

  it("1.2 converts to 1 and 2/3 innings", () => {
    assert.equal(parseInnings("1.2"), 1 + 2 / 3);
  });

  it("whole innings (no partial) pass through unchanged", () => {
    assert.equal(parseInnings("2.0"), 2);
    assert.equal(parseInnings("5.0"), 5);
  });

  it("rejects an invalid partial-innings digit (only 0/1/2 are valid)", () => {
    assert.equal(parseInnings("3.5"), null);
    assert.equal(parseInnings("1.9"), null);
  });

  it("returns null for missing/empty values", () => {
    assert.equal(parseInnings(null), null);
    assert.equal(parseInnings(undefined), null);
    assert.equal(parseInnings(""), null);
  });
});
