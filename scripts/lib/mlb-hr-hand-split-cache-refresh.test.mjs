/**
 * mlb-hr-hand-split-cache-refresh.test.mjs
 * Run: node --test scripts/lib/mlb-hr-hand-split-cache-refresh.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  handSplitCacheTempPath,
  normalizeSlatePlayerIds,
  refreshHandSplitCacheForPlayerIds,
  writeHandSplitCacheFile,
} from "./mlb-hr-hand-split-cache-refresh.mjs";

const NOW = new Date("2026-07-25T15:00:00Z");

function fakeBuilt(playerId) {
  return {
    playerId,
    season: 2026,
    source: "mlb_stats_api",
    warnings: [],
    splits: {
      vsLeft: {
        atBats: 100,
        homeRuns: 4,
        raw: { atBats: 100, homeRuns: 4 },
        dataQuality: "medium",
      },
      vsRight: {
        atBats: 120,
        homeRuns: 6,
        raw: { atBats: 120, homeRuns: 6 },
        dataQuality: "medium",
      },
    },
  };
}

describe("normalizeSlatePlayerIds", () => {
  it("dedupes, drops invalid ids, keeps only positive finite numbers", () => {
    assert.deepEqual(
      normalizeSlatePlayerIds([1, "1", 2, null, 0, -3, "x", 2]),
      [1, 2],
    );
  });
});

describe("refreshHandSplitCacheForPlayerIds", () => {
  it("refreshes only missing slate player ids", async () => {
    const calls = [];
    const existing = {
      players: {
        10: {
          playerId: 10,
          fetchedAt: NOW.toISOString(),
          freshnessStatus: "fresh",
          splits: { vsLeft: { atBats: 50, homeRuns: 1 }, vsRight: { atBats: 50, homeRuns: 2 } },
        },
      },
    };
    const result = await refreshHandSplitCacheForPlayerIds(existing, [10, 20], {
      now: NOW,
      season: 2026,
      fetchAndBuild: async (playerId) => {
        calls.push(playerId);
        return fakeBuilt(playerId);
      },
    });
    assert.deepEqual(calls, [20]);
    assert.equal(result.stats.requested, 2);
    assert.equal(result.stats.needingRefresh, 1);
    assert.equal(result.stats.refreshedOk, 1);
    assert.equal(result.stats.skippedFresh, 1);
    assert.equal(result.cache.players["20"].freshnessStatus, "fresh");
    assert.equal(result.cache.players["10"].playerId, 10);
  });

  it("preserves last-valid entry when refresh fails", async () => {
    const existing = {
      players: {
        30: {
          playerId: 30,
          fetchedAt: "2020-01-01T00:00:00.000Z",
          freshnessStatus: "fresh",
          splits: {
            vsLeft: { atBats: 80, homeRuns: 3, raw: { atBats: 80, homeRuns: 3 } },
            vsRight: { atBats: 90, homeRuns: 2, raw: { atBats: 90, homeRuns: 2 } },
          },
        },
      },
    };
    const result = await refreshHandSplitCacheForPlayerIds(existing, [30], {
      now: NOW,
      season: 2026,
      force: true,
      fetchAndBuild: async () => {
        throw new Error("network down");
      },
    });
    assert.equal(result.stats.refreshedFailed, 1);
    assert.equal(result.cache.players["30"].freshnessStatus, "stale-fallback");
    assert.equal(result.cache.players["30"].splits.vsLeft.atBats, 80);
  });

  it("marks missing when refresh fails and no prior entry exists", async () => {
    const result = await refreshHandSplitCacheForPlayerIds({ players: {} }, [99], {
      now: NOW,
      season: 2026,
      fetchAndBuild: async () => {
        throw new Error("boom");
      },
    });
    assert.equal(result.cache.players["99"].freshnessStatus, "missing");
    assert.equal(result.stats.refreshedFailed, 1);
  });
});

describe("writeHandSplitCacheFile atomic publication", () => {
  it("publishes valid final JSON via same-directory temp rename", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "hand-split-cache-"));
    const finalPath = path.join(dir, "batter-hand-splits-cache.json");
    const cache = {
      schemaVersion: "1.0.0",
      season: 2026,
      generatedAt: NOW.toISOString(),
      players: { 1: { playerId: 1, freshnessStatus: "fresh" } },
    };

    try {
      writeHandSplitCacheFile(finalPath, cache);
      assert.equal(existsSync(finalPath), true);
      const parsed = JSON.parse(readFileSync(finalPath, "utf8"));
      assert.deepEqual(parsed, cache);
      // No leftover temp files in the destination directory.
      const leftovers = readdirSync(dir).filter((name) => name.endsWith(".tmp"));
      assert.deepEqual(leftovers, []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("removes the temporary file when publication fails and cleanup is possible", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "hand-split-cache-fail-"));
    // Destination is a directory, so rename(tmp → final) fails after the temp write.
    const finalPath = path.join(dir, "batter-hand-splits-cache.json");
    mkdirSync(finalPath);

    try {
      assert.throws(() => writeHandSplitCacheFile(finalPath, { players: {} }), /EISDIR|EPERM|ENOTEMPTY|EACCES|EBUSY|directory/i);
      const leftovers = readdirSync(dir).filter((name) => name.endsWith(".tmp"));
      assert.deepEqual(leftovers, []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uses a pid-scoped temp name rather than a fixed .tmp collision path", () => {
    const finalPath = path.join("public", "data", "mlb", "batter-hand-splits-cache.json");
    const tmpA = handSplitCacheTempPath(finalPath);
    const tmpB = handSplitCacheTempPath(finalPath);
    assert.match(path.basename(tmpA), new RegExp(`^\\.batter-hand-splits-cache\\.json\\.${process.pid}\\.`));
    assert.match(tmpA, /\.tmp$/);
    assert.notEqual(tmpA, tmpB);
    assert.equal(path.dirname(tmpA), path.dirname(finalPath));
  });
});
