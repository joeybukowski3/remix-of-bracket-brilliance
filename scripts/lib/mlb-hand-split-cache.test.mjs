/**
 * mlb-hand-split-cache.test.mjs
 * Run via: node --test scripts/lib/mlb-hand-split-cache.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isPlayerFresh,
  selectPlayersNeedingRefresh,
  mergePlayerCacheEntry,
  FRESHNESS_HOURS,
  FRESHNESS_STATUS,
} from "./mlb-hand-split-cache.mjs";

const NOW = new Date("2026-07-03T12:00:00Z");

function hoursAgoIso(hours) {
  return new Date(NOW.getTime() - hours * 3_600_000).toISOString();
}

describe("FRESHNESS_HOURS", () => {
  it("is 72 hours (3-day TTL) per approval", () => {
    assert.equal(FRESHNESS_HOURS, 72);
  });
});

describe("isPlayerFresh", () => {
  it("is fresh within the 3-day window", () => {
    const entry = { fetchedAt: hoursAgoIso(10) };
    assert.equal(isPlayerFresh(entry, NOW), true);
  });

  it("is stale just past the 3-day window", () => {
    const entry = { fetchedAt: hoursAgoIso(73) };
    assert.equal(isPlayerFresh(entry, NOW), false);
  });

  it("is fresh exactly at the boundary", () => {
    const entry = { fetchedAt: hoursAgoIso(72) };
    assert.equal(isPlayerFresh(entry, NOW), true);
  });

  it("is not fresh when missing entirely", () => {
    assert.equal(isPlayerFresh(null, NOW), false);
    assert.equal(isPlayerFresh({}, NOW), false);
  });
});

describe("selectPlayersNeedingRefresh", () => {
  it("flags missing players as needing refresh", () => {
    const result = selectPlayersNeedingRefresh({}, [592450, 660271], NOW);
    assert.deepEqual(result.sort(), [592450, 660271].sort());
  });

  it("does not flag a fresh player", () => {
    const cache = { 592450: { fetchedAt: hoursAgoIso(5) } };
    const result = selectPlayersNeedingRefresh(cache, [592450], NOW);
    assert.deepEqual(result, []);
  });

  it("flags a stale player", () => {
    const cache = { 592450: { fetchedAt: hoursAgoIso(100) } };
    const result = selectPlayersNeedingRefresh(cache, [592450], NOW);
    assert.deepEqual(result, [592450]);
  });

  it("collapses duplicate requested player ids", () => {
    const result = selectPlayersNeedingRefresh({}, [592450, 592450, 592450], NOW);
    assert.deepEqual(result, [592450]);
  });

  it("refreshes one missing player independently of an already-fresh one", () => {
    const cache = { 592450: { fetchedAt: hoursAgoIso(1) } };
    const result = selectPlayersNeedingRefresh(cache, [592450, 660271], NOW);
    assert.deepEqual(result, [660271]);
  });
});

describe("mergePlayerCacheEntry", () => {
  it("stores fresh data with a new fetchedAt timestamp on success", () => {
    const merged = mergePlayerCacheEntry(undefined, { ok: true, data: { playerId: 592450, splits: {} } }, NOW);
    assert.equal(merged.playerId, 592450);
    assert.equal(merged.fetchedAt, NOW.toISOString());
    assert.equal(merged.freshnessStatus, FRESHNESS_STATUS.FRESH);
  });

  it("preserves the last valid entry when a refresh fails", () => {
    const existing = { playerId: 592450, splits: {}, fetchedAt: hoursAgoIso(100) };
    const merged = mergePlayerCacheEntry(existing, { ok: false }, NOW);
    assert.equal(merged.playerId, 592450); // unchanged, not overwritten
    assert.equal(merged.freshnessStatus, FRESHNESS_STATUS.STALE_FALLBACK);
    assert.ok(merged.warnings.some((w) => w.includes("stale-fallback")));
  });

  it("reports missing when a refresh fails and there is no prior cache", () => {
    const merged = mergePlayerCacheEntry(undefined, { ok: false }, NOW);
    assert.equal(merged.freshnessStatus, FRESHNESS_STATUS.MISSING);
    assert.ok(merged.warnings.some((w) => w.includes("no prior cached data")));
  });

  it("clears a prior stale-fallback warning once a fresh refresh succeeds", () => {
    const existing = { playerId: 592450, warnings: ["stale-fallback: refresh failed, retaining last valid cached data"] };
    const merged = mergePlayerCacheEntry(existing, { ok: true, data: { playerId: 592450, splits: {} } }, NOW);
    assert.deepEqual(merged.warnings, []);
  });
});
