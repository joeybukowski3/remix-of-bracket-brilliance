/**
 * mlb-bullpen-schema.test.mjs
 * Run via: node --test scripts/lib/mlb-bullpen-schema.test.mjs
 *
 * Validates the shape of the persisted team-bullpen-stats.json schema
 * (built via mocked fetch, zero live network calls), and statically
 * confirms the bullpen pipeline files never import any live-scoring
 * module.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchAndBuildTeamBullpenStats, toPersistableSchema } from "./mlb-bullpen-stats.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function jsonResponse(data) {
  return { ok: true, json: async () => data };
}

function mockFetchImpl() {
  return async (url) => {
    if (url.includes("/roster")) {
      return jsonResponse({
        roster: [
          { person: { id: 1, fullName: "Reliever One" }, position: { abbreviation: "P" } },
          { person: { id: 2, fullName: "Reliever Two" }, position: { abbreviation: "P" } },
          { person: { id: 3, fullName: "Reliever Three" }, position: { abbreviation: "P" } },
        ],
      });
    }
    if (url.includes("/people/")) {
      return jsonResponse({
        stats: [
          {
            splits: [
              { stat: { gamesStarted: 0, inningsPitched: "25.0", earnedRuns: 8, homeRuns: 3, strikeOuts: 28, baseOnBalls: 9, hits: 20 } },
            ],
          },
        ],
      });
    }
    if (url.includes("/schedule")) {
      return jsonResponse({
        dates: [{ games: [{ gamePk: 700, officialDate: "2026-07-01", gameType: "R", doubleHeader: "N", status: { codedGameState: "F" } }] }],
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

const EXPECTED_TOP_LEVEL_FIELDS = ["teamId", "teamAbbr", "season", "generatedAt", "source", "warnings", "freshnessStatus"];
const EXPECTED_SEASON_FIELDS = [
  "relieverPitcherIds",
  "relieverCount",
  "rosterPitcherCount",
  "approximationMethod",
  "seasonBullpenIp",
  "seasonBullpenEra",
  "seasonBullpenHr9",
  "seasonBullpenKbb",
  "seasonBullpenWhip",
  "coverageMetadata",
  "sampleSize",
  "dataQuality",
  "warnings",
  "generatedAt",
];
const EXPECTED_WORKLOAD_FIELDS = [
  "last3BullpenIp",
  "last7BullpenIp",
  "relieversUsedLast3Days",
  "pitchersUsedOnConsecutiveDays",
  "highWorkloadRelievers",
  "bullpenFatigueScore",
  "bullpenFatigueTier",
  "generatedAt",
];

describe("persisted bullpen stats schema", () => {
  it("includes every documented field and strips internal-only fields", async () => {
    const built = await fetchAndBuildTeamBullpenStats(
      { teamId: 147, teamAbbr: "NYY", season: 2026, asOfDate: "2026-07-02" },
      { fetchImpl: mockFetchImpl() }
    );
    // freshnessStatus/warnings normally get set by mergeTeamCacheEntry in
    // the CLI script; simulate that composition here for schema purposes.
    const persistable = toPersistableSchema({ ...built, freshnessStatus: "fresh" });

    for (const field of EXPECTED_TOP_LEVEL_FIELDS) assert.ok(field in persistable, `missing top-level field: ${field}`);
    for (const field of EXPECTED_SEASON_FIELDS) assert.ok(field in persistable.season, `missing season field: ${field}`);
    for (const field of EXPECTED_WORKLOAD_FIELDS) assert.ok(field in persistable.workload, `missing workload field: ${field}`);

    assert.equal("_contributingPitcherIds" in persistable.season, false);
  });

  it("never labels team-wide (non-reliever-pool) aggregates as bullpen data", async () => {
    const built = await fetchAndBuildTeamBullpenStats(
      { teamId: 147, teamAbbr: "NYY", season: 2026, asOfDate: "2026-07-02" },
      { fetchImpl: mockFetchImpl() }
    );
    // All 3 mocked pitchers have gamesStarted: 0, so all 3 land in the
    // reliever pool; relieverCount must be reported from that pool, not
    // just copied from the full roster count.
    assert.equal(built.season.relieverCount, 3);
    assert.equal(built.season.rosterPitcherCount, 3);
  });
});

describe("no live-scoring interaction (static check)", () => {
  const FORBIDDEN_MODULES = ["mlb-ml-edge-core.mjs", "generate-mlb-hr-props.mjs", "generate-mlb-ml-picks.mjs"];
  const BULLPEN_FILES = readdirSync(__dirname).filter((f) => f.startsWith("mlb-bullpen-") && f.endsWith(".mjs") && !f.endsWith(".test.mjs"));

  it("no bullpen pipeline module imports any live-scoring module", () => {
    for (const file of BULLPEN_FILES) {
      const contents = readFileSync(path.join(__dirname, file), "utf8");
      for (const forbidden of FORBIDDEN_MODULES) {
        assert.equal(contents.includes(forbidden), false, `${file} must not reference ${forbidden}`);
      }
    }
  });

  it("the CLI build script does not import any live-scoring module", () => {
    const contents = readFileSync(path.join(__dirname, "..", "build-mlb-team-bullpen-stats.mjs"), "utf8");
    for (const forbidden of FORBIDDEN_MODULES) {
      assert.equal(contents.includes(forbidden), false, `build script must not reference ${forbidden}`);
    }
  });
});
