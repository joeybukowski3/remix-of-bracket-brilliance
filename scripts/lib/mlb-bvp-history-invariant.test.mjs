/**
 * mlb-bvp-history-invariant.test.mjs
 * Run via: node --test scripts/lib/mlb-bvp-history-invariant.test.mjs
 *
 * Regression coverage for a real, investigated data-quality issue: MLB
 * StatsAPI's vsPlayerTotal ("career") endpoint can lag its vsPlayer5Y
 * ("last 5 years") endpoint by more than 24 hours in reflecting a
 * just-completed game, and vsPlayer5Y has independently shown its own
 * data-quality issues (a mismatched team field) unrelated to same-day lag.
 * Neither endpoint is proven authoritative when they disagree, so a pair
 * whose two windows violate the "trailing window can't exceed career
 * totals" invariant must have BOTH windows nulled rather than publish an
 * unverified value -- this is a display-only feature, so failing soft to
 * "no history" is safer than presenting a potentially wrong number.
 *
 * The three fixture pairs below are real MLB StatsAPI responses fetched
 * and saved on 2026-07-17 while investigating exactly this issue (see the
 * PR that introduced this file for the full writeup):
 *   - Kyle Schwarber vs Christian Scott: career 2 PA, last5y 5 PA
 *   - Bryce Harper vs Christian Scott: career 2 PA, last5y 4 PA
 *   - Jared Young vs Aaron Nola: career 5 PA, last5y 8 PA
 * Cross-verified against Christian Scott's own pitching game log and a
 * boxscore: he started against the Phillies on 2026-06-27 AND 2026-07-16,
 * and both Schwarber and Harper batted in the July 16 game -- but
 * vsPlayerTotal for both batters only counted the June 27 game, even when
 * re-fetched more than 24 hours after the July 16 game finished.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBvpHistoryEntry, parseVsPlayerSplit, violatesCareerInvariant } from "./mlb-bvp-history-core.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "__fixtures__", "mlb-bvp-history");

function loadFixture(filename) {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, filename), "utf8"));
}

const CASES = [
  {
    name: "Kyle Schwarber vs Christian Scott",
    batterId: 656941,
    pitcherId: 681035,
    batter: "Kyle Schwarber",
    pitcher: "Christian Scott",
    totalFixture: "schwarber-vs-scott-vsPlayerTotal.json",
    fiveYFixture: "schwarber-vs-scott-vsPlayer5Y.json",
    expectedCareer: { pa: 2, h: 0, avg: 0, hr: 0 },
    expectedLast5y: { pa: 5, h: 1, avg: 0.25, hr: 0 },
  },
  {
    name: "Bryce Harper vs Christian Scott",
    batterId: 547180,
    pitcherId: 681035,
    batter: "Bryce Harper",
    pitcher: "Christian Scott",
    totalFixture: "harper-vs-scott-vsPlayerTotal.json",
    fiveYFixture: "harper-vs-scott-vsPlayer5Y.json",
    expectedCareer: { pa: 2, h: 1, avg: 0.5, hr: 1 },
    expectedLast5y: { pa: 4, h: 2, avg: 0.5, hr: 1 },
  },
  {
    name: "Jared Young vs Aaron Nola",
    batterId: 676724,
    pitcherId: 605400,
    batter: "Jared Young",
    pitcher: "Aaron Nola",
    totalFixture: "young-vs-nola-vsPlayerTotal.json",
    fiveYFixture: "young-vs-nola-vsPlayer5Y.json",
    expectedCareer: { pa: 5, h: 1, avg: 0.2, hr: 1 },
    expectedLast5y: { pa: 8, h: 1, avg: 0.143, hr: 1 },
  },
];

describe("real-world invariant violations (fixtures captured 2026-07-17)", () => {
  for (const testCase of CASES) {
    describe(testCase.name, () => {
      const career = parseVsPlayerSplit(loadFixture(testCase.totalFixture), "vsPlayerTotal");
      const last5y = parseVsPlayerSplit(loadFixture(testCase.fiveYFixture), "vsPlayer5Y");

      it("parses the raw vsPlayerTotal fixture to the documented career values", () => {
        assert.deepEqual(career, testCase.expectedCareer);
      });

      it("parses the raw vsPlayer5Y fixture to the documented last5y values", () => {
        assert.deepEqual(last5y, testCase.expectedLast5y);
      });

      it("is detected as an invariant violation (last5y exceeds career on a counting stat)", () => {
        assert.equal(violatesCareerInvariant(career, last5y), true);
      });

      it("buildBvpHistoryEntry nulls both windows -- never zero-fills, never picks a side", () => {
        const entry = buildBvpHistoryEntry({
          batterId: testCase.batterId,
          pitcherId: testCase.pitcherId,
          batter: testCase.batter,
          pitcher: testCase.pitcher,
          career,
          last5y,
        });
        assert.equal(entry.career, null);
        assert.equal(entry.last5y, null);
        // Identity fields must survive rejection -- only the untrustworthy
        // stat windows are nulled, not the whole record.
        assert.equal(entry.batterId, testCase.batterId);
        assert.equal(entry.pitcherId, testCase.pitcherId);
        assert.equal(entry.batter, testCase.batter);
        assert.equal(entry.pitcher, testCase.pitcher);
      });
    });
  }
});

describe("violatesCareerInvariant does not reject valid, consistent pairs", () => {
  it("returns false when last5y is a true subset of career on every counting stat", () => {
    const career = { pa: 59, h: 11, avg: 0.262, hr: 5 };
    const last5y = { pa: 27, h: 7, avg: 0.412, hr: 3 };
    assert.equal(violatesCareerInvariant(career, last5y), false);
  });

  it("returns false when the two windows are identical (all career PAs fall within the trailing window)", () => {
    const split = { pa: 10, h: 3, avg: 0.3, hr: 1 };
    assert.equal(violatesCareerInvariant(split, { ...split }), false);
  });

  it("returns false when either window is null (nothing to compare)", () => {
    const split = { pa: 10, h: 3, avg: 0.3, hr: 1 };
    assert.equal(violatesCareerInvariant(null, split), false);
    assert.equal(violatesCareerInvariant(split, null), false);
    assert.equal(violatesCareerInvariant(null, null), false);
  });

  it("does not flag AVG alone as a violation (it's a ratio, not a counting stat)", () => {
    // last5y AVG higher than career AVG is completely normal (recent hot streak) and must never trigger rejection.
    const career = { pa: 100, h: 20, avg: 0.2, hr: 2 };
    const last5y = { pa: 20, h: 8, avg: 0.4, hr: 1 };
    assert.equal(violatesCareerInvariant(career, last5y), false);
  });

  it("flags a violation on H alone even when PA and HR are consistent", () => {
    const career = { pa: 20, h: 3, avg: 0.15, hr: 1 };
    const last5y = { pa: 10, h: 5, avg: 0.5, hr: 1 };
    assert.equal(violatesCareerInvariant(career, last5y), true);
  });

  it("flags a violation on HR alone even when PA and H are consistent", () => {
    const career = { pa: 20, h: 5, avg: 0.25, hr: 1 };
    const last5y = { pa: 10, h: 3, avg: 0.3, hr: 2 };
    assert.equal(violatesCareerInvariant(career, last5y), true);
  });
});
