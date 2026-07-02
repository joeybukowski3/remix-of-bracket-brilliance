/**
 * mlb-bullpen-stats.test.mjs
 * Run via: node --test scripts/lib/mlb-bullpen-stats.test.mjs
 *
 * All tests use an injected fetchImpl -- zero live network calls.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildSeasonSection,
  buildWorkloadSection,
  fetchAndBuildTeamBullpenStats,
  toPersistableSchema,
} from "./mlb-bullpen-stats.mjs";

function jsonResponse(data) {
  return { ok: true, json: async () => data };
}

function stripGeneratedAt(obj) {
  const { generatedAt, season, workload, ...rest } = obj;
  return {
    ...rest,
    ...(season ? { season: (({ generatedAt: _g, ...s }) => s)(season) } : {}),
    ...(workload ? { workload: (({ generatedAt: _g, ...w }) => w)(workload) } : {}),
  };
}

describe("buildSeasonSection", () => {
  it("composes classification + aggregation deterministically", () => {
    const rosterPitchers = [{ pitcherId: 1 }, { pitcherId: 2 }];
    const seasonStatsByPitcherId = new Map([
      [1, { gamesStarted: 0, inningsPitched: "40.0", earnedRuns: 10, homeRuns: 3, strikeOuts: 45, baseOnBalls: 12, hits: 30 }],
      [2, { gamesStarted: 15, inningsPitched: "90.0", earnedRuns: 30, homeRuns: 10, strikeOuts: 80, baseOnBalls: 25, hits: 85 }],
    ]);
    const section = buildSeasonSection({ teamId: 147, teamAbbr: "NYY", season: 2026, rosterPitchers, seasonStatsByPitcherId });
    assert.deepEqual(section.relieverPitcherIds, [1]);
    assert.equal(section.relieverCount, 1);
    assert.equal(section.rosterPitcherCount, 2);
    assert.equal(section.seasonBullpenIp, "40.0");
    assert.ok(section._contributingPitcherIds); // internal-only field present pre-persist
  });

  it("is deterministic given the same inputs", () => {
    const rosterPitchers = [{ pitcherId: 1 }];
    const seasonStatsByPitcherId = new Map([[1, { gamesStarted: 0, inningsPitched: "10.0", earnedRuns: 3, homeRuns: 1, strikeOuts: 10, baseOnBalls: 4, hits: 8 }]]);
    const a = buildSeasonSection({ rosterPitchers, seasonStatsByPitcherId });
    const b = buildSeasonSection({ rosterPitchers, seasonStatsByPitcherId });
    assert.deepEqual(a, b);
  });
});

describe("buildWorkloadSection", () => {
  it("delegates to computeBullpenWorkload", () => {
    const section = buildWorkloadSection({ appearances: [], asOfDate: "2026-07-02" });
    assert.equal(section.bullpenFatigueTier, "fresh");
  });
});

describe("toPersistableSchema", () => {
  it("strips internal-only fields before persisting", () => {
    const entry = { teamId: 147, season: { seasonBullpenEra: 3.5, _contributingPitcherIds: [1, 2] } };
    const persisted = toPersistableSchema(entry);
    assert.equal(persisted.season._contributingPitcherIds, undefined);
    assert.equal(persisted.season.seasonBullpenEra, 3.5);
  });

  it("handles an entry with no season section", () => {
    const entry = { teamId: 147, workload: { bullpenFatigueTier: "fresh" } };
    const persisted = toPersistableSchema(entry);
    assert.deepEqual(persisted, entry);
  });
});

describe("fetchAndBuildTeamBullpenStats (mocked network, no live calls)", () => {
  function mockFetchImpl() {
    return async (url) => {
      if (url.includes("/roster")) {
        return jsonResponse({
          roster: [
            { person: { id: 1, fullName: "Reliever One" }, position: { abbreviation: "P" } },
            { person: { id: 2, fullName: "Starter One" }, position: { abbreviation: "P" } },
          ],
        });
      }
      if (url.includes("/people/1/stats")) {
        return jsonResponse({ stats: [{ splits: [{ stat: { gamesStarted: 0, inningsPitched: "40.0", earnedRuns: 10, homeRuns: 3, strikeOuts: 45, baseOnBalls: 12, hits: 30 } }] }] });
      }
      if (url.includes("/people/2/stats")) {
        return jsonResponse({ stats: [{ splits: [{ stat: { gamesStarted: 15, inningsPitched: "90.0", earnedRuns: 30, homeRuns: 10, strikeOuts: 80, baseOnBalls: 25, hits: 85 } }] }] });
      }
      if (url.includes("/schedule")) {
        return jsonResponse({
          dates: [{ games: [{ gamePk: 500, officialDate: "2026-07-01", gameType: "R", doubleHeader: "N", status: { codedGameState: "F" } }] }],
        });
      }
      if (url.includes("/boxscore")) {
        return jsonResponse({
          teams: {
            home: {
              team: { id: 147 },
              players: { ID1: { person: { id: 1 }, stats: { pitching: { gamesPlayed: 1, outs: 3, numberOfPitches: 15 } } } },
            },
            away: { team: { id: 999 }, players: {} },
          },
        });
      }
      throw new Error(`unexpected url in mock: ${url}`);
    };
  }

  it("builds a full team schema end to end from mocked fetch calls", async () => {
    const result = await fetchAndBuildTeamBullpenStats(
      { teamId: 147, teamAbbr: "NYY", season: 2026, asOfDate: "2026-07-02" },
      { fetchImpl: mockFetchImpl() }
    );
    assert.equal(result.teamId, 147);
    assert.equal(result.source, "mlb_stats_api");
    assert.deepEqual(result.season.relieverPitcherIds, [1]);
    assert.equal(result.workload.relieversUsedLast3Days, 1);
    assert.deepEqual(result.warnings, []);
  });

  it("produces deterministic output for identical mocked inputs", async () => {
    const params = { teamId: 147, teamAbbr: "NYY", season: 2026, asOfDate: "2026-07-02" };
    const a = await fetchAndBuildTeamBullpenStats(params, { fetchImpl: mockFetchImpl() });
    const b = await fetchAndBuildTeamBullpenStats(params, { fetchImpl: mockFetchImpl() });
    assert.deepEqual(stripGeneratedAt(a), stripGeneratedAt(b));
  });

  it("only fetches the requested sections", async () => {
    let boxscoreCalled = false;
    let scheduleCalled = false;
    const fetchImpl = async (url) => {
      if (url.includes("/schedule")) scheduleCalled = true;
      if (url.includes("/boxscore")) boxscoreCalled = true;
      return mockFetchImpl()(url);
    };
    const result = await fetchAndBuildTeamBullpenStats(
      { teamId: 147, teamAbbr: "NYY", season: 2026, asOfDate: "2026-07-02", sections: ["season"] },
      { fetchImpl }
    );
    assert.ok(result.season);
    assert.equal(result.workload, undefined);
    assert.equal(scheduleCalled, false);
    assert.equal(boxscoreCalled, false);
  });

  it("skips workload with a warning when no known reliever pool is available", async () => {
    const fetchImpl = async (url) => {
      if (url.includes("/roster")) return jsonResponse({ roster: [] });
      throw new Error(`unexpected url: ${url}`);
    };
    const result = await fetchAndBuildTeamBullpenStats(
      { teamId: 147, teamAbbr: "NYY", season: 2026, asOfDate: "2026-07-02", sections: ["workload"] },
      { fetchImpl }
    );
    assert.equal(result.workload, undefined);
    assert.ok(result.warnings.some((w) => w.includes("workload refresh skipped")));
  });
});
