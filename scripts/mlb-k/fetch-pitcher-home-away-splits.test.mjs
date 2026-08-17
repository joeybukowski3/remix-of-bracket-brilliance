/**
 * fetch-pitcher-home-away-splits.test.mjs
 * Run via: node --test scripts/mlb-k/fetch-pitcher-home-away-splits.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fetchPitcherHomeAwaySplits } from "./fetch-pitcher-home-away-splits.mjs";

function fakeFetch(payload, ok = true) {
  return async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => payload,
  });
}

describe("fetchPitcherHomeAwaySplits", () => {
  it("parses real home/away split codes into strikeouts/outs/starts", async () => {
    const payload = {
      stats: [
        {
          splits: [
            { split: { code: "h" }, stat: { strikeOuts: 30, outsPitched: 165, gamesStarted: 10 } },
            { split: { code: "a" }, stat: { strikeOuts: 36, outsPitched: 176, gamesStarted: 11 } },
          ],
        },
      ],
    };
    const result = await fetchPitcherHomeAwaySplits(1, 2026, { fetchImpl: fakeFetch(payload) });
    assert.equal(result.ok, true);
    assert.deepEqual(result.home, { strikeouts: 30, outs: 165, starts: 10 });
    assert.deepEqual(result.away, { strikeouts: 36, outs: 176, starts: 11 });
  });

  it("reports failure when the request errors", async () => {
    const result = await fetchPitcherHomeAwaySplits(1, 2026, { fetchImpl: fakeFetch({}, false), maxAttempts: 1 });
    assert.equal(result.ok, false);
    assert.equal(result.home, null);
  });

  it("reports failure when no home/away splits are present in the response", async () => {
    const result = await fetchPitcherHomeAwaySplits(1, 2026, { fetchImpl: fakeFetch({ stats: [{ splits: [] }] }) });
    assert.equal(result.ok, false);
  });
});
