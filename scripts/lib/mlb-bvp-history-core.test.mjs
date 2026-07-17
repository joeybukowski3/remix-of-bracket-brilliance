/**
 * mlb-bvp-history-core.test.mjs
 * Run via: node --test scripts/lib/mlb-bvp-history-core.test.mjs
 *
 * See mlb-bvp-history-invariant.test.mjs for the real-world, fixture-backed
 * regression coverage of violatesCareerInvariant / buildBvpHistoryEntry's
 * rejection behavior -- the cases here use synthetic values only.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildBvpHistoryEntry, buildBvpHistoryKey, parseVsPlayerSplit, violatesCareerInvariant } from "./mlb-bvp-history-core.mjs";

describe("buildBvpHistoryKey", () => {
  it("joins batter id and pitcher id with a pipe", () => {
    assert.equal(buildBvpHistoryKey(665742, 605400), "665742|605400");
  });

  it("is order-sensitive (batter first, pitcher second)", () => {
    assert.notEqual(buildBvpHistoryKey(1, 2), buildBvpHistoryKey(2, 1));
  });
});

describe("parseVsPlayerSplit", () => {
  it("extracts pa/h/avg/hr from a real-shaped MLB StatsAPI vsPlayer response", () => {
    const json = {
      stats: [{ splits: [{ stat: { plateAppearances: 9, hits: 3, avg: ".375", homeRuns: 1 } }] }],
    };
    assert.deepEqual(parseVsPlayerSplit(json), { pa: 9, h: 3, avg: 0.375, hr: 1 });
  });

  it("parses a leading-dot average string as a number", () => {
    const json = { stats: [{ splits: [{ stat: { plateAppearances: 1, hits: 0, avg: ".000", homeRuns: 0 } }] }] };
    assert.equal(parseVsPlayerSplit(json).avg, 0);
  });

  it("returns null when there are no splits (batter has never faced this pitcher)", () => {
    assert.equal(parseVsPlayerSplit({ stats: [{ splits: [] }] }), null);
  });

  it("returns null when stats/splits are entirely absent", () => {
    assert.equal(parseVsPlayerSplit({}), null);
    assert.equal(parseVsPlayerSplit(null), null);
    assert.equal(parseVsPlayerSplit(undefined), null);
  });

  it("never fabricates a value: a missing individual field stays null instead of becoming 0", () => {
    const json = { stats: [{ splits: [{ stat: { plateAppearances: 5, hits: 1 } }] }] };
    const result = parseVsPlayerSplit(json);
    assert.equal(result.pa, 5);
    assert.equal(result.h, 1);
    assert.equal(result.avg, null);
    assert.equal(result.hr, null);
  });
});

describe("buildBvpHistoryEntry", () => {
  it("assembles a full record with the key derived from the ids", () => {
    const entry = buildBvpHistoryEntry({
      batterId: 665742,
      pitcherId: 605400,
      batter: "Juan Soto",
      pitcher: "Aaron Nola",
      career: { pa: 59, h: 11, avg: 0.262, hr: 5 },
      last5y: { pa: 27, h: 7, avg: 0.412, hr: 3 },
    });
    assert.deepEqual(entry, {
      key: "665742|605400",
      batterId: 665742,
      pitcherId: 605400,
      batter: "Juan Soto",
      pitcher: "Aaron Nola",
      career: { pa: 59, h: 11, avg: 0.262, hr: 5 },
      last5y: { pa: 27, h: 7, avg: 0.412, hr: 3 },
    });
  });

  it("defaults missing career/last5y/batter/pitcher to null rather than undefined", () => {
    const entry = buildBvpHistoryEntry({ batterId: 1, pitcherId: 2 });
    assert.equal(entry.batter, null);
    assert.equal(entry.pitcher, null);
    assert.equal(entry.career, null);
    assert.equal(entry.last5y, null);
  });

  it("never includes score, rank, recommendation, or confidence fields (display-only isolation)", () => {
    const entry = buildBvpHistoryEntry({
      batterId: 1,
      pitcherId: 2,
      career: { pa: 1, h: 1, avg: 1, hr: 1 },
      last5y: { pa: 1, h: 1, avg: 1, hr: 1 },
    });
    const keys = Object.keys(entry);
    for (const forbidden of ["hrScore", "matchupScore", "rank", "recommendation", "confidence", "eligible", "bestBet"]) {
      assert.equal(keys.includes(forbidden), false, `entry must not contain "${forbidden}"`);
    }
  });

  it("nulls both windows, never zero-fills, when the pair violates the career/last5y invariant", () => {
    const entry = buildBvpHistoryEntry({
      batterId: 1,
      pitcherId: 2,
      batter: "Test Batter",
      pitcher: "Test Pitcher",
      career: { pa: 2, h: 0, avg: 0, hr: 0 },
      last5y: { pa: 5, h: 1, avg: 0.25, hr: 0 },
    });
    assert.equal(entry.career, null);
    assert.equal(entry.last5y, null);
    // Identity fields survive rejection -- only the untrustworthy stats are dropped.
    assert.equal(entry.batter, "Test Batter");
    assert.equal(entry.pitcher, "Test Pitcher");
  });
});

describe("violatesCareerInvariant", () => {
  it("returns false for a valid pair where last5y is a true subset of career", () => {
    assert.equal(
      violatesCareerInvariant({ pa: 59, h: 11, avg: 0.262, hr: 5 }, { pa: 27, h: 7, avg: 0.412, hr: 3 }),
      false,
    );
  });

  it("returns true when last5y.pa exceeds career.pa", () => {
    assert.equal(violatesCareerInvariant({ pa: 2, h: 0, avg: 0, hr: 0 }, { pa: 5, h: 1, avg: 0.25, hr: 0 }), true);
  });

  it("returns true when last5y.h exceeds career.h, independent of pa", () => {
    assert.equal(violatesCareerInvariant({ pa: 20, h: 3, avg: 0.15, hr: 1 }, { pa: 10, h: 5, avg: 0.5, hr: 1 }), true);
  });

  it("returns true when last5y.hr exceeds career.hr, independent of pa/h", () => {
    assert.equal(violatesCareerInvariant({ pa: 20, h: 5, avg: 0.25, hr: 1 }, { pa: 10, h: 3, avg: 0.3, hr: 2 }), true);
  });

  it("ignores AVG entirely -- a higher recent average is normal and never a violation", () => {
    assert.equal(violatesCareerInvariant({ pa: 100, h: 20, avg: 0.2, hr: 2 }, { pa: 20, h: 8, avg: 0.4, hr: 1 }), false);
  });

  it("returns false when either window is null", () => {
    const split = { pa: 10, h: 3, avg: 0.3, hr: 1 };
    assert.equal(violatesCareerInvariant(null, split), false);
    assert.equal(violatesCareerInvariant(split, null), false);
    assert.equal(violatesCareerInvariant(null, null), false);
  });
});
