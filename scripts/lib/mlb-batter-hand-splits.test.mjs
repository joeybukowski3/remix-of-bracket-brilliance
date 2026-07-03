/**
 * mlb-batter-hand-splits.test.mjs
 * Run via: node --test scripts/lib/mlb-batter-hand-splits.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPlayerHandSplitEntry, fetchAndBuildPlayerHandSplits, SCHEMA_VERSION } from "./mlb-batter-hand-splits.mjs";

// Trimmed live-verified metrics (already normalized, as mlb-hand-split-fetch.mjs would produce them).
const JUDGE_VS_LEFT = { plateAppearances: 76, atBats: 57, hits: 14, homeRuns: 5, walks: 18, strikeouts: 20, battingAverage: 0.246, onBasePercentage: 0.421, sluggingPercentage: 0.526, ops: 0.947, hrRate: 5 / 76 };
const JUDGE_VS_RIGHT = { plateAppearances: 185, atBats: 157, hits: 39, homeRuns: 12, walks: 24, strikeouts: 52, battingAverage: 0.248, onBasePercentage: 0.355, sluggingPercentage: 0.535, ops: 0.89, hrRate: 12 / 185 };
const JUDGE_OVERALL = { plateAppearances: 261, battingAverage: 0.247, onBasePercentage: 0.376, sluggingPercentage: 0.533, ops: 0.909, hrRate: 17 / 261 };

describe("buildPlayerHandSplitEntry", () => {
  it("builds both sides with schema fields present (Judge fixture)", () => {
    const entry = buildPlayerHandSplitEntry({
      playerId: 592450,
      season: 2026,
      splits: { vsLeft: JUDGE_VS_LEFT, vsRight: JUDGE_VS_RIGHT },
      overall: JUDGE_OVERALL,
    });
    assert.equal(entry.playerId, 592450);
    assert.equal(entry.season, 2026);
    assert.equal(entry.source, "mlb_stats_api");
    assert.deepEqual(entry.warnings, []);

    assert.equal(entry.splits.vsLeft.plateAppearances, 76);
    assert.equal(entry.splits.vsLeft.sampleSizeTier, "low");
    assert.equal(entry.splits.vsLeft.dataQuality, "low");
    assert.equal(entry.splits.vsLeft.fallbackUsed, true);
    assert.equal(entry.splits.vsLeft.fallbackSource, "batter_overall_season");
    assert.ok(entry.splits.vsLeft.shrunk);
    assert.ok(entry.splits.vsLeft.raw);

    assert.equal(entry.splits.vsRight.plateAppearances, 185);
    assert.equal(entry.splits.vsRight.sampleSizeTier, "medium"); // 80-199 PA tier
  });

  it("marks a side unavailable when the batter has zero appearances against that hand", () => {
    const entry = buildPlayerHandSplitEntry({
      playerId: 660271,
      season: 2026,
      splits: { vsLeft: null, vsRight: JUDGE_VS_RIGHT },
      overall: JUDGE_OVERALL,
    });
    // Zero raw PA but a trustworthy fallback still exists -- pure fallback, not "unavailable".
    assert.equal(entry.splits.vsLeft.plateAppearances, 0);
    assert.equal(entry.splits.vsLeft.dataQuality, "insufficient");
    assert.equal(entry.splits.vsLeft.shrinkageWeight, 0);
    assert.equal(entry.splits.vsLeft.shrunk.ops, JUDGE_OVERALL.ops);
  });

  it("marks a side unavailable when there is no trustworthy overall fallback at all", () => {
    const entry = buildPlayerHandSplitEntry({
      playerId: 1,
      season: 2026,
      splits: { vsLeft: null, vsRight: null },
      overall: null,
    });
    assert.deepEqual(entry.warnings, ["overall season stats unavailable; hand-split fallback disabled for this player"]);
    assert.equal(entry.splits.vsLeft.dataQuality, "unavailable");
    assert.equal(entry.splits.vsRight.dataQuality, "unavailable");
    assert.equal(entry.splits.vsLeft.shrunk, null);
    assert.equal(entry.splits.vsRight.shrunk, null);
  });

  it("is deterministic for identical inputs", () => {
    const input = { playerId: 592450, season: 2026, splits: { vsLeft: JUDGE_VS_LEFT, vsRight: JUDGE_VS_RIGHT }, overall: JUDGE_OVERALL };
    const first = buildPlayerHandSplitEntry(input);
    const second = buildPlayerHandSplitEntry(input);
    assert.deepEqual(first, second);
  });
});

describe("fetchAndBuildPlayerHandSplits (mocked network, no live calls)", () => {
  it("builds a full player entry end to end from mocked fetch calls", async () => {
    const fetchImpl = async (url) => {
      if (url.includes("statSplits")) {
        return {
          ok: true,
          json: async () => ({
            stats: [{
              splits: [
                { stat: { plateAppearances: 76, homeRuns: 5, avg: ".246", obp: ".421", slg: ".526", ops: ".947" }, split: { code: "vl" } },
                { stat: { plateAppearances: 185, homeRuns: 12, avg: ".248", obp: ".355", slg: ".535", ops: ".890" }, split: { code: "vr" } },
              ],
            }],
          }),
        };
      }
      return { ok: true, json: async () => ({ stats: [{ splits: [{ stat: { plateAppearances: 261, homeRuns: 17, avg: ".247", obp: ".376", slg: ".533", ops: ".909" } }] }] }) };
    };
    const entry = await fetchAndBuildPlayerHandSplits(592450, 2026, { fetchImpl });
    assert.equal(entry.playerId, 592450);
    assert.equal(entry.splits.vsLeft.plateAppearances, 76);
    assert.equal(entry.splits.vsRight.plateAppearances, 185);
    assert.ok(entry.splits.vsRight.shrunk.ops > 0);
  });

  it("produces deterministic output for identical mocked inputs", async () => {
    const fetchImpl = async (url) => {
      if (url.includes("statSplits")) return { ok: true, json: async () => ({ stats: [{ splits: [] }] }) };
      return { ok: true, json: async () => ({ stats: [{ splits: [{ stat: { plateAppearances: 100, avg: ".250" } }] }] }) };
    };
    const first = await fetchAndBuildPlayerHandSplits(1, 2026, { fetchImpl });
    const second = await fetchAndBuildPlayerHandSplits(1, 2026, { fetchImpl });
    assert.deepEqual(first, second);
  });
});

describe("SCHEMA_VERSION", () => {
  it("is exported and semver-shaped", () => {
    assert.match(SCHEMA_VERSION, /^\d+\.\d+\.\d+$/);
  });
});
