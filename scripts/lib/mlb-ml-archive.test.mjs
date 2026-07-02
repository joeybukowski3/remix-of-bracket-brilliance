/**
 * mlb-ml-archive.test.mjs
 * Unit tests for pure archive helpers (key generation, upsert/merge, graded
 * record immutability). Mirrors the HR archive test suite's coverage.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildArchiveKey, buildArchiveRecord, upsertArchiveRecord, mergeArchiveBatch } from "./mlb-ml-archive.mjs";

function makeFixturePick(overrides = {}) {
  return {
    gameId: 555,
    gameKey: "NYY@BOS",
    pick: "away",
    pickAbbr: "NYY",
    confidence: 59,
    differential: 8,
    topFactor: "Pitcher Quality",
    factors: [{ label: "Pitcher Quality", awayScore: 66, homeScore: 55, weight: 0.3, weightedDifference: 3.3, description: "ERA, K/9, BB%, HR/9" }],
    priceAtPick: { american: "-135", implied: 0.574, capturedAt: "2026-06-30T13:00:00.000Z" },
    polymarketAtPick: { yesPrice: 0.56, capturedAt: "2026-06-30T05:00:00.000Z" },
    ...overrides,
  };
}

describe("buildArchiveKey", () => {
  it("builds a stable date|gameId|modelVersion key", () => {
    const record = { date: "2026-06-30", gameId: 555, modelVersion: "test-v1" };
    assert.equal(buildArchiveKey(record), "2026-06-30|555|test-v1");
  });
});

describe("buildArchiveRecord", () => {
  it("carries pick fields through and defaults result to pending", () => {
    const record = buildArchiveRecord({
      pick: makeFixturePick(),
      date: "2026-06-30",
      generatedAt: "2026-06-30T09:00:00.000Z",
      modelVersion: "test-v1",
    });
    assert.equal(record.gameId, 555);
    assert.equal(record.gameKey, "NYY@BOS");
    assert.equal(record.pick, "away");
    assert.equal(record.pickAbbr, "NYY");
    assert.equal(record.confidence, 59);
    assert.equal(record.differential, 8);
    assert.equal(record.result.status, "pending");
    assert.equal(record.result.clv, null);
    assert.deepEqual(record.runHistory, ["2026-06-30T09:00:00.000Z"]);
  });

  it("never includes a probability or value-edge field", () => {
    const record = buildArchiveRecord({
      pick: makeFixturePick(),
      date: "2026-06-30",
      generatedAt: "2026-06-30T09:00:00.000Z",
      modelVersion: "test-v1",
    });
    assert.equal(record.probability, undefined);
    assert.equal(record.valueEdge, undefined);
    assert.equal(record.modelProb, undefined);
  });
});

describe("upsertArchiveRecord", () => {
  it("appends a new record when the key does not exist", () => {
    const first = buildArchiveRecord({ pick: makeFixturePick(), date: "2026-06-30", generatedAt: "2026-06-30T09:00:00.000Z", modelVersion: "test-v1" });
    const result = upsertArchiveRecord([], first);
    assert.equal(result.action, "appended");
    assert.equal(result.records.length, 1);
  });

  it("updates a pending record in place on same-day rerun, preserving firstGeneratedAt", () => {
    const first = buildArchiveRecord({ pick: makeFixturePick(), date: "2026-06-30", generatedAt: "2026-06-30T09:00:00.000Z", modelVersion: "test-v1" });
    const second = buildArchiveRecord({ pick: makeFixturePick({ confidence: 65 }), date: "2026-06-30", generatedAt: "2026-06-30T11:00:00.000Z", modelVersion: "test-v1" });
    const afterFirst = upsertArchiveRecord([], first).records;
    const afterSecond = upsertArchiveRecord(afterFirst, second);
    assert.equal(afterSecond.action, "updated");
    assert.equal(afterSecond.records[0].confidence, 65);
    assert.equal(afterSecond.records[0].firstGeneratedAt, "2026-06-30T09:00:00.000Z");
    assert.deepEqual(afterSecond.records[0].runHistory, ["2026-06-30T09:00:00.000Z", "2026-06-30T11:00:00.000Z"]);
  });

  it("preserves priceAtPick/polymarketAtPick as first-captured, but refreshes latestPriceSeen/latestPolymarketSeen, on same-day rerun", () => {
    const first = buildArchiveRecord({
      pick: makeFixturePick({
        priceAtPick: { american: "-135", implied: 0.574, capturedAt: "2026-06-30T09:00:00.000Z" },
        polymarketAtPick: { yesPrice: 0.56, capturedAt: "2026-06-30T09:00:00.000Z" },
      }),
      date: "2026-06-30", generatedAt: "2026-06-30T09:00:00.000Z", modelVersion: "test-v1",
    });
    const second = buildArchiveRecord({
      pick: makeFixturePick({
        priceAtPick: { american: "-150", implied: 0.6, capturedAt: "2026-06-30T13:00:00.000Z" },
        polymarketAtPick: { yesPrice: 0.61, capturedAt: "2026-06-30T13:00:00.000Z" },
      }),
      date: "2026-06-30", generatedAt: "2026-06-30T13:00:00.000Z", modelVersion: "test-v1",
    });
    const afterFirst = upsertArchiveRecord([], first).records;
    const afterSecond = upsertArchiveRecord(afterFirst, second).records[0];

    // priceAtPick / polymarketAtPick pinned to the FIRST capture
    assert.equal(afterSecond.priceAtPick.implied, 0.574);
    assert.equal(afterSecond.priceAtPick.capturedAt, "2026-06-30T09:00:00.000Z");
    assert.equal(afterSecond.polymarketAtPick.yesPrice, 0.56);

    // latestPriceSeen / latestPolymarketSeen refreshed to the SECOND run's capture
    assert.equal(afterSecond.latestPriceSeen.implied, 0.6);
    assert.equal(afterSecond.latestPriceSeen.capturedAt, "2026-06-30T13:00:00.000Z");
    assert.equal(afterSecond.latestPolymarketSeen.yesPrice, 0.61);
  });

  it("a THIRD same-day rerun still preserves the original first-captured price, not the second rerun's price", () => {
    const runs = [
      { at: "2026-06-30T09:00:00.000Z", implied: 0.574 },
      { at: "2026-06-30T13:00:00.000Z", implied: 0.6 },
      { at: "2026-06-30T17:00:00.000Z", implied: 0.55 },
    ];
    let records = [];
    for (const run of runs) {
      const record = buildArchiveRecord({
        pick: makeFixturePick({ priceAtPick: { american: "-135", implied: run.implied, capturedAt: run.at } }),
        date: "2026-06-30", generatedAt: run.at, modelVersion: "test-v1",
      });
      records = upsertArchiveRecord(records, record).records;
    }
    assert.equal(records[0].priceAtPick.implied, 0.574); // first run, never overwritten
    assert.equal(records[0].latestPriceSeen.implied, 0.55); // most recent run
  });

  it("never overwrites a graded record", () => {
    const graded = buildArchiveRecord({ pick: makeFixturePick(), date: "2026-06-30", generatedAt: "2026-06-30T09:00:00.000Z", modelVersion: "test-v1" });
    graded.result = { status: "win", actualWinnerAbbr: "NYY", finalScore: { away: 5, home: 3 }, gameFinalStatus: "Final", closingLine: null, clv: null, gradedAt: "2026-07-01T05:00:00.000Z" };
    const rerun = buildArchiveRecord({ pick: makeFixturePick({ confidence: 70 }), date: "2026-06-30", generatedAt: "2026-07-01T09:00:00.000Z", modelVersion: "test-v1" });
    const result = upsertArchiveRecord([graded], rerun);
    assert.equal(result.action, "skipped_graded");
    assert.equal(result.records[0].confidence, 59); // unchanged
    assert.equal(result.records[0].result.status, "win");
  });
});

describe("mergeArchiveBatch", () => {
  it("tallies appended/updated/skippedGraded across a batch", () => {
    const pending = buildArchiveRecord({ pick: makeFixturePick({ gameId: 1 }), date: "2026-06-30", generatedAt: "2026-06-30T09:00:00.000Z", modelVersion: "test-v1" });
    const graded = buildArchiveRecord({ pick: makeFixturePick({ gameId: 2 }), date: "2026-06-30", generatedAt: "2026-06-30T09:00:00.000Z", modelVersion: "test-v1" });
    graded.result.status = "loss";
    const existing = [pending, graded];

    const newBatch = [
      buildArchiveRecord({ pick: makeFixturePick({ gameId: 1, confidence: 61 }), date: "2026-06-30", generatedAt: "2026-06-30T11:00:00.000Z", modelVersion: "test-v1" }), // update
      buildArchiveRecord({ pick: makeFixturePick({ gameId: 2, confidence: 61 }), date: "2026-06-30", generatedAt: "2026-06-30T11:00:00.000Z", modelVersion: "test-v1" }), // skipped_graded
      buildArchiveRecord({ pick: makeFixturePick({ gameId: 3 }), date: "2026-06-30", generatedAt: "2026-06-30T11:00:00.000Z", modelVersion: "test-v1" }), // appended
    ];

    const result = mergeArchiveBatch(existing, newBatch);
    assert.equal(result.appended, 1);
    assert.equal(result.updated, 1);
    assert.equal(result.skippedGraded, 1);
    assert.equal(result.records.length, 3);
  });
});
