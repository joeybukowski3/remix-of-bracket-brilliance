/**
 * mlb-bullpen-cache.test.mjs
 * Run via: node --test scripts/lib/mlb-bullpen-cache.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isSectionFresh,
  selectTeamsNeedingRefresh,
  mergeTeamCacheEntry,
  SECTION_SEASON,
  SECTION_WORKLOAD,
  SEASON_FRESHNESS_HOURS,
  WORKLOAD_FRESHNESS_HOURS,
  FRESHNESS_STATUS,
} from "./mlb-bullpen-cache.mjs";

const NOW = new Date("2026-07-02T12:00:00Z");

function hoursAgoIso(hours) {
  return new Date(NOW.getTime() - hours * 3_600_000).toISOString();
}

describe("isSectionFresh", () => {
  it("is fresh within the freshness window", () => {
    const entry = { season: { generatedAt: hoursAgoIso(5) } };
    assert.equal(isSectionFresh(entry, SECTION_SEASON, NOW, SEASON_FRESHNESS_HOURS), true);
  });

  it("is stale outside the freshness window", () => {
    const entry = { season: { generatedAt: hoursAgoIso(30) } };
    assert.equal(isSectionFresh(entry, SECTION_SEASON, NOW, SEASON_FRESHNESS_HOURS), false);
  });

  it("is not fresh when missing entirely", () => {
    assert.equal(isSectionFresh(null, SECTION_SEASON, NOW, SEASON_FRESHNESS_HOURS), false);
    assert.equal(isSectionFresh({}, SECTION_SEASON, NOW, SEASON_FRESHNESS_HOURS), false);
  });

  it("season and workload have independent windows", () => {
    const entry = { season: { generatedAt: hoursAgoIso(10) }, workload: { generatedAt: hoursAgoIso(10) } };
    assert.equal(isSectionFresh(entry, SECTION_SEASON, NOW, SEASON_FRESHNESS_HOURS), true);
    assert.equal(isSectionFresh(entry, SECTION_WORKLOAD, NOW, WORKLOAD_FRESHNESS_HOURS), false);
  });
});

describe("selectTeamsNeedingRefresh", () => {
  it("flags missing teams as needing both season and workload refresh", () => {
    const result = selectTeamsNeedingRefresh({}, ["147", "111"], NOW);
    assert.deepEqual(result.seasonRefreshTeamIds.sort(), ["111", "147"]);
    assert.deepEqual(result.workloadRefreshTeamIds.sort(), ["111", "147"]);
  });

  it("flags only workload as stale when season is still fresh", () => {
    const cache = { "147": { season: { generatedAt: hoursAgoIso(5) }, workload: { generatedAt: hoursAgoIso(5) } } };
    const result = selectTeamsNeedingRefresh(cache, ["147"], NOW);
    assert.deepEqual(result.seasonRefreshTeamIds, []);
    assert.deepEqual(result.workloadRefreshTeamIds, ["147"]);
  });

  it("allows refreshing a single missing team independently of others", () => {
    const cache = { "147": { season: { generatedAt: hoursAgoIso(1) }, workload: { generatedAt: hoursAgoIso(1) } } };
    const result = selectTeamsNeedingRefresh(cache, ["147", "111"], NOW);
    assert.deepEqual(result.seasonRefreshTeamIds, ["111"]);
  });
});

describe("mergeTeamCacheEntry", () => {
  it("stores fresh data with a new generatedAt timestamp on success", () => {
    const merged = mergeTeamCacheEntry(undefined, { season: { ok: true, data: { seasonBullpenEra: 3.5 } } }, NOW);
    assert.equal(merged.season.seasonBullpenEra, 3.5);
    assert.equal(merged.season.generatedAt, NOW.toISOString());
    assert.equal(merged.freshnessStatus, FRESHNESS_STATUS.STALE_FALLBACK); // workload still missing
  });

  it("preserves the last valid section when a refresh fails", () => {
    const existing = { season: { seasonBullpenEra: 3.5, generatedAt: hoursAgoIso(40) } };
    const merged = mergeTeamCacheEntry(existing, { season: { ok: false } }, NOW);
    assert.equal(merged.season.seasonBullpenEra, 3.5); // unchanged, not overwritten
    assert.ok(merged.warnings.some((w) => w.includes("stale-fallback") && w.includes("season")));
  });

  it("never overwrites valid cached data with an incomplete failed result", () => {
    const existing = { workload: { bullpenFatigueScore: 40, generatedAt: hoursAgoIso(1) } };
    const merged = mergeTeamCacheEntry(existing, { workload: { ok: false } }, NOW);
    assert.equal(merged.workload.bullpenFatigueScore, 40);
  });

  it("reports missing when a section refresh fails and there is no prior cache", () => {
    const merged = mergeTeamCacheEntry(undefined, { workload: { ok: false } }, NOW);
    assert.equal(merged.workload, undefined);
    assert.ok(merged.warnings.some((w) => w.includes("no prior cached data")));
  });

  it("marks freshnessStatus fresh only when both sections are current", () => {
    const merged = mergeTeamCacheEntry(
      undefined,
      { season: { ok: true, data: {} }, workload: { ok: true, data: {} } },
      NOW
    );
    assert.equal(merged.freshnessStatus, FRESHNESS_STATUS.FRESH);
  });

  it("leaves an untouched section alone when it wasn't part of this refresh pass", () => {
    const existing = { workload: { bullpenFatigueScore: 10, generatedAt: hoursAgoIso(1) } };
    const merged = mergeTeamCacheEntry(existing, { season: { ok: true, data: {} } }, NOW);
    assert.equal(merged.workload.bullpenFatigueScore, 10);
  });
});
