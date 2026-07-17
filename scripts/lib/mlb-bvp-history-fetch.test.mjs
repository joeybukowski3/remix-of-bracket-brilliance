/**
 * mlb-bvp-history-fetch.test.mjs
 * Run via: node --test scripts/lib/mlb-bvp-history-fetch.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fetchBvpHistoryForPair, fetchVsPlayerSplit, runLimited } from "./mlb-bvp-history-fetch.mjs";

function jsonResponse(body) {
  return { ok: true, json: async () => body };
}

function errorResponse(status) {
  return { ok: false, status };
}

describe("fetchVsPlayerSplit", () => {
  it("requests the given statsType with the batter/pitcher ids in the URL", async () => {
    let requestedUrl = null;
    const fetchImpl = async (url) => {
      requestedUrl = url;
      return jsonResponse({ stats: [{ splits: [] }] });
    };
    await fetchVsPlayerSplit(665742, 605400, "vsPlayerTotal", { fetchImpl, retries: 0 });
    assert.match(requestedUrl, /\/people\/665742\/stats/);
    assert.match(requestedUrl, /stats=vsPlayerTotal/);
    assert.match(requestedUrl, /opposingPlayerId=605400/);
    assert.match(requestedUrl, /group=hitting/);
  });

  it("returns { json, error: null } on success", async () => {
    const payload = { stats: [{ splits: [{ stat: { plateAppearances: 3 } }] }] };
    const fetchImpl = async () => jsonResponse(payload);
    const result = await fetchVsPlayerSplit(1, 2, "vsPlayerTotal", { fetchImpl, retries: 0 });
    assert.deepEqual(result.json, payload);
    assert.equal(result.error, null);
  });

  it("returns { json: null, error } on a non-OK HTTP response, never throwing", async () => {
    const fetchImpl = async () => errorResponse(500);
    const result = await fetchVsPlayerSplit(1, 2, "vsPlayerTotal", { fetchImpl, retries: 0 });
    assert.equal(result.json, null);
    assert.ok(result.error instanceof Error);
  });

  it("returns { json: null, error } when fetchImpl itself throws (network failure), never throwing", async () => {
    const fetchImpl = async () => { throw new Error("network down"); };
    const result = await fetchVsPlayerSplit(1, 2, "vsPlayerTotal", { fetchImpl, retries: 0 });
    assert.equal(result.json, null);
    assert.ok(result.error instanceof Error);
  });
});

describe("fetchBvpHistoryForPair", () => {
  it("fetches both career and last5y in parallel and returns both results", async () => {
    const seenStatsTypes = [];
    const fetchImpl = async (url) => {
      const statsType = new URL(url).searchParams.get("stats");
      seenStatsTypes.push(statsType);
      return jsonResponse({ stats: [{ splits: [{ stat: { plateAppearances: statsType === "vsPlayerTotal" ? 10 : 5 } }] }] });
    };
    const result = await fetchBvpHistoryForPair(1, 2, { fetchImpl, retries: 0 });
    assert.deepEqual(seenStatsTypes.sort(), ["vsPlayer5Y", "vsPlayerTotal"]);
    assert.equal(result.careerJson.stats[0].splits[0].stat.plateAppearances, 10);
    assert.equal(result.last5yJson.stats[0].splits[0].stat.plateAppearances, 5);
    assert.equal(result.careerError, null);
    assert.equal(result.last5yError, null);
  });

  it("one endpoint failing does not block the other from succeeding", async () => {
    const fetchImpl = async (url) => {
      const statsType = new URL(url).searchParams.get("stats");
      if (statsType === "vsPlayerTotal") return errorResponse(500);
      return jsonResponse({ stats: [{ splits: [{ stat: { plateAppearances: 5 } }] }] });
    };
    const result = await fetchBvpHistoryForPair(1, 2, { fetchImpl, retries: 0 });
    assert.equal(result.careerJson, null);
    assert.ok(result.careerError instanceof Error);
    assert.equal(result.last5yError, null);
    assert.equal(result.last5yJson.stats[0].splits[0].stat.plateAppearances, 5);
  });
});

describe("runLimited", () => {
  it("processes every item and preserves result order regardless of concurrency", async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await runLimited(items, 2, async (item) => item * 10);
    assert.deepEqual(results, [10, 20, 30, 40, 50]);
  });

  it("never exceeds the given concurrency", async () => {
    let active = 0;
    let maxActive = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);
    await runLimited(items, 3, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
    });
    assert.ok(maxActive <= 3, `expected maxActive <= 3, got ${maxActive}`);
  });
});
