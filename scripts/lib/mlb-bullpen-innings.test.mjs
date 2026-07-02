/**
 * mlb-bullpen-innings.test.mjs
 * Run via: node --test scripts/lib/mlb-bullpen-innings.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseInningsToOuts,
  outsToBaseballNotation,
  outsToDecimalInnings,
  sumInningsToOuts,
} from "./mlb-bullpen-innings.mjs";

describe("parseInningsToOuts", () => {
  it("parses whole innings", () => {
    assert.equal(parseInningsToOuts("6.0"), 18);
    assert.equal(parseInningsToOuts("0.0"), 0);
  });

  it("parses fractional (thirds) innings", () => {
    assert.equal(parseInningsToOuts("6.1"), 19);
    assert.equal(parseInningsToOuts("6.2"), 20);
    assert.equal(parseInningsToOuts("41.1"), 124);
  });

  it("accepts a bare integer or number input", () => {
    assert.equal(parseInningsToOuts("6"), 18);
    assert.equal(parseInningsToOuts(6), 18);
    assert.equal(parseInningsToOuts(6.1), 19);
  });

  it("returns null for missing/invalid values", () => {
    assert.equal(parseInningsToOuts(null), null);
    assert.equal(parseInningsToOuts(undefined), null);
    assert.equal(parseInningsToOuts(""), null);
    assert.equal(parseInningsToOuts("abc"), null);
    assert.equal(parseInningsToOuts("6.3"), null); // invalid thirds digit
    assert.equal(parseInningsToOuts("6.9"), null);
  });
});

describe("outsToBaseballNotation", () => {
  it("round-trips exact values", () => {
    assert.equal(outsToBaseballNotation(18), "6.0");
    assert.equal(outsToBaseballNotation(19), "6.1");
    assert.equal(outsToBaseballNotation(20), "6.2");
    assert.equal(outsToBaseballNotation(124), "41.1");
    assert.equal(outsToBaseballNotation(0), "0.0");
  });
});

describe("outsToDecimalInnings", () => {
  it("converts outs to true decimal innings for rate math", () => {
    assert.equal(outsToDecimalInnings(18), 6);
    assert.equal(outsToDecimalInnings(19), 19 / 3);
    assert.equal(outsToDecimalInnings(0), 0);
  });
});

describe("sumInningsToOuts", () => {
  it("sums baseball-notation values correctly (not naive float addition)", () => {
    // 6.1 + 6.1 = 12 outs + 2 outs = 14 outs = "4.2", NOT "12.2"
    const totalOuts = sumInningsToOuts(["6.1", "6.1"]);
    assert.equal(totalOuts, 38);
    assert.equal(outsToBaseballNotation(totalOuts), "12.2");
  });

  it("skips invalid/missing entries", () => {
    assert.equal(sumInningsToOuts(["6.0", null, undefined, "bad", "1.1"]), 18 + 4);
  });

  it("returns 0 for an empty or absent list", () => {
    assert.equal(sumInningsToOuts([]), 0);
    assert.equal(sumInningsToOuts(undefined), 0);
  });
});
