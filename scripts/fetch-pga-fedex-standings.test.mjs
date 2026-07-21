/**
 * fetch-pga-fedex-standings.test.mjs
 * Run via: node --test scripts/fetch-pga-fedex-standings.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateFedexStandings } from "./fetch-pga-fedex-standings.mjs";

function row(playerName, playerId, points) {
  return { playerId, playerName, stats: [{ statName: "Points", statValue: String(points) }] };
}

function validStatDetails(rowCount = 150) {
  return {
    statTitle: "FedExCup Standings",
    rows: Array.from({ length: rowCount }, (_, i) => row(`Player ${i}`, String(1000 + i), 5000 - i * 10)),
  };
}

describe("validateFedexStandings", () => {
  it("accepts a well-formed, strictly-ordered, sufficiently large response", () => {
    const { rows, points } = validateFedexStandings(validStatDetails());
    assert.equal(rows.length, 150);
    assert.equal(points[0], 5000);
  });

  it("throws when the response is missing or malformed", () => {
    assert.throws(() => validateFedexStandings(null), /missing or malformed/i);
    assert.throws(() => validateFedexStandings(undefined), /missing or malformed/i);
  });

  it("throws when statTitle does not exactly match \"FedExCup Standings\" (protects against a wrong/renamed stat)", () => {
    const bad = { ...validStatDetails(), statTitle: "Something Else" };
    assert.throws(() => validateFedexStandings(bad), /statTitle mismatch/i);
  });

  it("throws when row count is suspiciously small", () => {
    const bad = validStatDetails(10);
    assert.throws(() => validateFedexStandings(bad), /only 10 rows/i);
  });

  it("throws when points are not strictly non-increasing -- never derives rank from array position on unordered data", () => {
    const bad = validStatDetails();
    bad.rows[5] = row("Out Of Order", "9999", 999999); // spikes above earlier rows
    assert.throws(() => validateFedexStandings(bad), /not ordered by points/i);
  });

  it("throws on a duplicate player name", () => {
    const bad = validStatDetails();
    bad.rows[10] = { ...bad.rows[9], playerName: bad.rows[9].playerName };
    assert.throws(() => validateFedexStandings(bad), /duplicate player name/i);
  });

  it("throws on a missing/unparseable points value", () => {
    const bad = validStatDetails();
    bad.rows[3].stats = [{ statName: "Points", statValue: "N/A" }];
    assert.throws(() => validateFedexStandings(bad), /missing.*unparseable points/i);
  });
});
