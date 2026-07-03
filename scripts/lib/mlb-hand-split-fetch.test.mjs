/**
 * mlb-hand-split-fetch.test.mjs
 * Run via: node --test scripts/lib/mlb-hand-split-fetch.test.mjs
 *
 * All tests use an injected fetchImpl -- zero live network calls. Fixture
 * shapes are copied verbatim (trimmed to relevant fields) from a live
 * smoke test performed 2026-07-02 against real players: Aaron Judge
 * (592450), Shohei Ohtani (660271), Ozzie Albies (645277, a switch
 * hitter), and one unknown player id.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  runLimited,
  toSplitMetrics,
  fetchBatterHandSplits,
  fetchBatterOverallSeasonStats,
  fetchHandSplitsForPlayers,
} from "./mlb-hand-split-fetch.mjs";

function jsonResponse(data) {
  return { ok: true, json: async () => data };
}

// Verbatim (trimmed) live response shape for Aaron Judge's vs-left / vs-right splits.
const JUDGE_SPLITS_RESPONSE = {
  stats: [
    {
      splits: [
        {
          stat: {
            plateAppearances: 76, atBats: 57, hits: 14, homeRuns: 5, baseOnBalls: 18, strikeOuts: 20,
            avg: ".246", obp: ".421", slg: ".526", ops: ".947",
          },
          split: { code: "vl", description: "vs Left" },
        },
        {
          stat: {
            plateAppearances: 185, atBats: 157, hits: 39, homeRuns: 12, baseOnBalls: 24, strikeOuts: 52,
            avg: ".248", obp: ".355", slg: ".535", ops: ".890",
          },
          split: { code: "vr", description: "vs Right" },
        },
      ],
    },
  ],
};

// Verbatim (trimmed) live response shape for an unknown/invalid player id.
const EMPTY_SPLITS_RESPONSE = { stats: [{ splits: [] }] };

describe("runLimited", () => {
  it("respects the concurrency cap", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);
    await runLimited(items, 3, async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
    });
    assert.ok(maxInFlight <= 3);
  });
});

describe("toSplitMetrics", () => {
  it("parses string avg/obp/slg/ops into numbers", () => {
    const metrics = toSplitMetrics({ plateAppearances: 76, atBats: 57, hits: 14, homeRuns: 5, baseOnBalls: 18, strikeOuts: 20, avg: ".246", obp: ".421", slg: ".526", ops: ".947" });
    assert.equal(metrics.battingAverage, 0.246);
    assert.equal(metrics.onBasePercentage, 0.421);
    assert.equal(metrics.sluggingPercentage, 0.526);
    assert.equal(metrics.ops, 0.947);
  });

  it("derives hrRate from homeRuns / plateAppearances", () => {
    const metrics = toSplitMetrics({ plateAppearances: 100, homeRuns: 10 });
    assert.equal(metrics.hrRate, 0.1);
  });

  it("returns null hrRate when plateAppearances is zero or missing", () => {
    assert.equal(toSplitMetrics({ plateAppearances: 0, homeRuns: 0 }).hrRate, null);
    assert.equal(toSplitMetrics({ homeRuns: 5 }).hrRate, null);
  });

  it("returns null for a null/missing stat block", () => {
    assert.equal(toSplitMetrics(null), null);
    assert.equal(toSplitMetrics(undefined), null);
  });
});

describe("fetchBatterHandSplits", () => {
  it("parses vl/vr into vsLeft/vsRight (Aaron Judge fixture)", async () => {
    const fetchImpl = async () => jsonResponse(JUDGE_SPLITS_RESPONSE);
    const result = await fetchBatterHandSplits(592450, 2026, { fetchImpl });
    assert.equal(result.vsLeft.plateAppearances, 76);
    assert.equal(result.vsLeft.ops, 0.947);
    assert.equal(result.vsRight.plateAppearances, 185);
    assert.equal(result.vsRight.ops, 0.89);
  });

  it("returns null for both sides when splits is empty (unknown player fixture)", async () => {
    const fetchImpl = async () => jsonResponse(EMPTY_SPLITS_RESPONSE);
    const result = await fetchBatterHandSplits(1, 2026, { fetchImpl });
    assert.equal(result.vsLeft, null);
    assert.equal(result.vsRight, null);
  });

  it("returns one null side when only one hand has been faced", async () => {
    const oneSidedResponse = { stats: [{ splits: [JUDGE_SPLITS_RESPONSE.stats[0].splits[1]] }] };
    const fetchImpl = async () => jsonResponse(oneSidedResponse);
    const result = await fetchBatterHandSplits(592450, 2026, { fetchImpl });
    assert.equal(result.vsLeft, null);
    assert.ok(result.vsRight);
  });

  it("does not special-case switch hitters -- StatsAPI splits are already keyed to pitcher hand", async () => {
    // Ozzie Albies (switch hitter) fixture: ordinary vl/vr splits, no third case.
    const albiesResponse = {
      stats: [{
        splits: [
          { stat: { plateAppearances: 157, homeRuns: 6, avg: ".299", obp: ".318", slg: ".497", ops: ".815" }, split: { code: "vl" } },
          { stat: { plateAppearances: 203, homeRuns: 7, avg: ".257", obp: ".330", slg: ".400", ops: ".730" }, split: { code: "vr" } },
        ],
      }],
    };
    const fetchImpl = async () => jsonResponse(albiesResponse);
    const result = await fetchBatterHandSplits(645277, 2026, { fetchImpl });
    assert.equal(result.vsLeft.plateAppearances, 157);
    assert.equal(result.vsRight.plateAppearances, 203);
  });
});

describe("fetchBatterOverallSeasonStats", () => {
  it("parses the season endpoint's single stat block", async () => {
    const fetchImpl = async () => jsonResponse({ stats: [{ splits: [{ stat: { plateAppearances: 300, homeRuns: 17, avg: ".260", obp: ".370", slg: ".510", ops: ".880" } }] }] });
    const result = await fetchBatterOverallSeasonStats(592450, 2026, { fetchImpl });
    assert.equal(result.plateAppearances, 300);
    assert.equal(result.ops, 0.88);
  });

  it("returns null when the season stat block is absent", async () => {
    const fetchImpl = async () => jsonResponse({ stats: [{ splits: [] }] });
    const result = await fetchBatterOverallSeasonStats(1, 2026, { fetchImpl });
    assert.equal(result, null);
  });
});

describe("fetchHandSplitsForPlayers", () => {
  it("fetches splits + overall for multiple players", async () => {
    const fetchImpl = async (url) => {
      if (url.includes("statSplits")) return jsonResponse(JUDGE_SPLITS_RESPONSE);
      return jsonResponse({ stats: [{ splits: [{ stat: { plateAppearances: 300, avg: ".260", obp: ".360", slg: ".480", ops: ".840" } }] }] });
    };
    const { resultsByPlayerId, failedPlayerIds } = await fetchHandSplitsForPlayers([592450, 660271], 2026, { fetchImpl });
    assert.equal(resultsByPlayerId.size, 2);
    assert.deepEqual(failedPlayerIds, []);
    assert.equal(resultsByPlayerId.get(592450).overall.plateAppearances, 300);
  });

  it("collapses duplicate player ids into a single request each", async () => {
    let splitCalls = 0;
    const fetchImpl = async (url) => {
      if (url.includes("statSplits")) {
        splitCalls += 1;
        return jsonResponse(JUDGE_SPLITS_RESPONSE);
      }
      return jsonResponse({ stats: [{ splits: [{ stat: { plateAppearances: 300 } }] }] });
    };
    await fetchHandSplitsForPlayers([592450, 592450, 592450], 2026, { fetchImpl });
    assert.equal(splitCalls, 1);
  });

  it("captures a single player's failure without failing the whole batch", async () => {
    const fetchImpl = async (url) => {
      if (url.includes("/people/2/")) throw new Error("network down");
      if (url.includes("statSplits")) return jsonResponse(JUDGE_SPLITS_RESPONSE);
      return jsonResponse({ stats: [{ splits: [{ stat: { plateAppearances: 300 } }] }] });
    };
    const { resultsByPlayerId, failedPlayerIds } = await fetchHandSplitsForPlayers([592450, 2], 2026, { fetchImpl, retries: 0 });
    assert.equal(resultsByPlayerId.size, 1);
    assert.deepEqual(failedPlayerIds, [2]);
  });

  it("retries a failing request up to the configured retry count, then succeeds", async () => {
    let calls = 0;
    const fetchImpl = async (url) => {
      if (url.includes("statSplits")) {
        calls += 1;
        if (calls === 1) throw new Error("transient failure");
        return jsonResponse(JUDGE_SPLITS_RESPONSE);
      }
      return jsonResponse({ stats: [{ splits: [{ stat: { plateAppearances: 300 } }] }] });
    };
    const { resultsByPlayerId, failedPlayerIds } = await fetchHandSplitsForPlayers([592450], 2026, { fetchImpl, retries: 2 });
    assert.equal(calls, 2);
    assert.equal(resultsByPlayerId.size, 1);
    assert.deepEqual(failedPlayerIds, []);
  });

  it("gives up after exhausting retries", async () => {
    let calls = 0;
    const fetchImpl = async (url) => {
      if (url.includes("statSplits")) {
        calls += 1;
        throw new Error("always fails");
      }
      return jsonResponse({ stats: [{ splits: [{ stat: { plateAppearances: 300 } }] }] });
    };
    const { resultsByPlayerId, failedPlayerIds } = await fetchHandSplitsForPlayers([592450], 2026, { fetchImpl, retries: 2 });
    assert.equal(calls, 3); // 1 initial + 2 retries
    assert.equal(resultsByPlayerId.size, 0);
    assert.deepEqual(failedPlayerIds, [592450]);
  });

  it("respects a timeout via AbortController", async () => {
    const fetchImpl = async (url, { signal }) => {
      if (!url.includes("statSplits")) return jsonResponse({ stats: [{ splits: [{ stat: { plateAppearances: 300 } }] }] });
      return new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      });
    };
    const { failedPlayerIds } = await fetchHandSplitsForPlayers([592450], 2026, { fetchImpl, retries: 0, timeoutMs: 20 });
    assert.deepEqual(failedPlayerIds, [592450]);
  });

  it("respects the concurrency cap across many players", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchImpl = async (url) => {
      if (url.includes("statSplits")) {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight -= 1;
        return jsonResponse(JUDGE_SPLITS_RESPONSE);
      }
      return jsonResponse({ stats: [{ splits: [{ stat: { plateAppearances: 300 } }] }] });
    };
    const playerIds = Array.from({ length: 10 }, (_, i) => i + 1);
    await fetchHandSplitsForPlayers(playerIds, 2026, { fetchImpl, concurrency: 3 });
    assert.ok(maxInFlight <= 3);
  });
});
