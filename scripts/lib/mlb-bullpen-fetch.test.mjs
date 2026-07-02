/**
 * mlb-bullpen-fetch.test.mjs
 * Run via: node --test scripts/lib/mlb-bullpen-fetch.test.mjs
 *
 * All tests use an injected fetchImpl -- zero live network calls.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  runLimited,
  fetchAllTeams,
  fetchTeamRosterPitchers,
  fetchSeasonPitchingStatsForPitchers,
  fetchRecentRelieverAppearances,
} from "./mlb-bullpen-fetch.mjs";

function jsonResponse(data) {
  return { ok: true, json: async () => data };
}

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

  it("preserves result order regardless of completion order", async () => {
    const items = [30, 10, 20];
    const results = await runLimited(items, 3, async (ms) => {
      await new Promise((r) => setTimeout(r, ms));
      return ms;
    });
    assert.deepEqual(results, [30, 10, 20]);
  });
});

describe("fetchAllTeams", () => {
  it("returns the teams array", async () => {
    const fetchImpl = async () => jsonResponse({ teams: [{ id: 147, abbreviation: "NYY" }] });
    const teams = await fetchAllTeams(2026, { fetchImpl });
    assert.deepEqual(teams, [{ id: 147, abbreviation: "NYY" }]);
  });
});

describe("fetchTeamRosterPitchers", () => {
  it("filters roster down to pitchers only", async () => {
    const fetchImpl = async () =>
      jsonResponse({
        roster: [
          { person: { id: 1, fullName: "A Pitcher" }, position: { abbreviation: "P" } },
          { person: { id: 2, fullName: "A Catcher" }, position: { abbreviation: "C" } },
        ],
      });
    const pitchers = await fetchTeamRosterPitchers(147, 2026, { fetchImpl });
    assert.deepEqual(pitchers, [{ pitcherId: 1, fullName: "A Pitcher" }]);
  });
});

describe("fetchSeasonPitchingStatsForPitchers", () => {
  it("captures per-pitcher stats", async () => {
    const fetchImpl = async (url) => {
      const id = Number(url.match(/people\/(\d+)/)[1]);
      return jsonResponse({
        stats: [{ splits: [{ stat: { gamesStarted: 0, inningsPitched: "40.0", earnedRuns: 10, homeRuns: 3, strikeOuts: 45, baseOnBalls: 12, hits: 30 } }] }],
      });
    };
    const { statsByPitcherId, failedPitcherIds } = await fetchSeasonPitchingStatsForPitchers([1, 2], 2026, { fetchImpl });
    assert.equal(statsByPitcherId.size, 2);
    assert.equal(statsByPitcherId.get(1).gamesStarted, 0);
    assert.deepEqual(failedPitcherIds, []);
  });

  it("captures a single pitcher failure without failing the whole batch", async () => {
    const fetchImpl = async (url) => {
      if (url.includes("people/2/")) throw new Error("network down");
      return jsonResponse({ stats: [{ splits: [{ stat: { gamesStarted: 0, inningsPitched: "5.0" } }] }] });
    };
    const { statsByPitcherId, failedPitcherIds } = await fetchSeasonPitchingStatsForPitchers([1, 2], 2026, {
      fetchImpl,
      retries: 0,
    });
    assert.equal(statsByPitcherId.size, 1);
    assert.deepEqual(failedPitcherIds, [2]);
  });

  it("retries a failing request up to the configured retry count, then succeeds", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      if (calls === 1) throw new Error("transient failure");
      return jsonResponse({ stats: [{ splits: [{ stat: { gamesStarted: 0, inningsPitched: "5.0" } }] }] });
    };
    const { statsByPitcherId, failedPitcherIds } = await fetchSeasonPitchingStatsForPitchers([1], 2026, {
      fetchImpl,
      retries: 2,
    });
    assert.equal(calls, 2);
    assert.equal(statsByPitcherId.size, 1);
    assert.deepEqual(failedPitcherIds, []);
  });

  it("gives up after exhausting retries", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      throw new Error("always fails");
    };
    const { statsByPitcherId, failedPitcherIds } = await fetchSeasonPitchingStatsForPitchers([1], 2026, {
      fetchImpl,
      retries: 2,
    });
    assert.equal(calls, 3); // 1 initial + 2 retries
    assert.equal(statsByPitcherId.size, 0);
    assert.deepEqual(failedPitcherIds, [1]);
  });

  it("respects a timeout via AbortController", async () => {
    const fetchImpl = async (url, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      });
    const { failedPitcherIds } = await fetchSeasonPitchingStatsForPitchers([1], 2026, {
      fetchImpl,
      retries: 0,
      timeoutMs: 20,
    });
    assert.deepEqual(failedPitcherIds, [1]);
  });
});

describe("fetchRecentRelieverAppearances", () => {
  it("returns normalized appearances only for reliever-pool pitchers who actually pitched", async () => {
    const fetchImpl = async (url) => {
      if (url.includes("/schedule")) {
        return jsonResponse({
          dates: [
            {
              games: [
                {
                  gamePk: 111,
                  officialDate: "2026-07-01",
                  gameType: "R",
                  doubleHeader: "N",
                  status: { codedGameState: "F" },
                },
              ],
            },
          ],
        });
      }
      if (url.includes("/boxscore")) {
        return jsonResponse({
          teams: {
            home: {
              team: { id: 147 },
              players: {
                ID1: { person: { id: 1 }, stats: { pitching: { gamesPlayed: 1, outs: 3, numberOfPitches: 15 } } },
                ID2: { person: { id: 2 }, stats: { pitching: { gamesPlayed: 1, outs: 6, numberOfPitches: 20 } } }, // not in reliever pool
                ID3: { person: { id: 3 }, stats: { batting: {} } }, // no pitching stats
              },
            },
            away: { team: { id: 999 }, players: {} },
          },
        });
      }
      throw new Error(`unexpected url ${url}`);
    };
    const { appearances, failedGamePks } = await fetchRecentRelieverAppearances(
      147,
      new Set([1]),
      { startDate: "2026-06-25", endDate: "2026-07-01" },
      { fetchImpl }
    );
    assert.equal(appearances.length, 1);
    assert.equal(appearances[0].pitcherId, 1);
    assert.equal(appearances[0].outs, 3);
    assert.equal(appearances[0].officialDate, "2026-07-01");
    assert.deepEqual(failedGamePks, []);
  });

  it("records failed game fetches without throwing", async () => {
    const fetchImpl = async (url) => {
      if (url.includes("/schedule")) {
        return jsonResponse({
          dates: [{ games: [{ gamePk: 222, officialDate: "2026-07-01", gameType: "R", status: { codedGameState: "F" } }] }],
        });
      }
      throw new Error("boxscore fetch failed");
    };
    const { appearances, failedGamePks } = await fetchRecentRelieverAppearances(
      147,
      new Set([1]),
      { startDate: "2026-06-25", endDate: "2026-07-01" },
      { fetchImpl, retries: 0 }
    );
    assert.deepEqual(appearances, []);
    assert.deepEqual(failedGamePks, [222]);
  });

  it("excludes non-final and non-regular-season games", async () => {
    const fetchImpl = async (url) => {
      if (url.includes("/schedule")) {
        return jsonResponse({
          dates: [
            {
              games: [
                { gamePk: 1, officialDate: "2026-07-01", gameType: "R", status: { codedGameState: "I" } }, // in progress
                { gamePk: 2, officialDate: "2026-07-01", gameType: "S", status: { codedGameState: "F" } }, // spring training
              ],
            },
          ],
        });
      }
      throw new Error("should not fetch boxscore for excluded games");
    };
    const { appearances } = await fetchRecentRelieverAppearances(
      147,
      new Set([1]),
      { startDate: "2026-06-25", endDate: "2026-07-01" },
      { fetchImpl }
    );
    assert.deepEqual(appearances, []);
  });
});
