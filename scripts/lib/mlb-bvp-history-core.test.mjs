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
import {
  buildBvpHistoryEntry,
  buildBvpHistoryKey,
  filterCacheForSlate,
  isCachedEntryFullyValid,
  parseVsPlayerSplit,
  resolveWindow,
  violatesCareerInvariant,
} from "./mlb-bvp-history-core.mjs";

describe("buildBvpHistoryKey", () => {
  it("joins batter id and pitcher id with a pipe when both are positive finite integers", () => {
    assert.equal(buildBvpHistoryKey(665742, 605400), "665742|605400");
  });

  it("is order-sensitive (batter first, pitcher second)", () => {
    assert.notEqual(buildBvpHistoryKey(1, 2), buildBvpHistoryKey(2, 1));
  });

  it("returns null when either id is null or undefined", () => {
    assert.equal(buildBvpHistoryKey(null, 2), null);
    assert.equal(buildBvpHistoryKey(1, null), null);
    assert.equal(buildBvpHistoryKey(undefined, undefined), null);
  });

  it("returns null when either id is zero or negative", () => {
    assert.equal(buildBvpHistoryKey(0, 2), null);
    assert.equal(buildBvpHistoryKey(1, 0), null);
    assert.equal(buildBvpHistoryKey(-5, 2), null);
    assert.equal(buildBvpHistoryKey(1, -5), null);
  });

  it("returns null when either id is a non-integer", () => {
    assert.equal(buildBvpHistoryKey(1.5, 2), null);
    assert.equal(buildBvpHistoryKey(1, 2.5), null);
  });

  it("returns null when either id is NaN or Infinity", () => {
    assert.equal(buildBvpHistoryKey(NaN, 2), null);
    assert.equal(buildBvpHistoryKey(1, Infinity), null);
  });

  it("returns null when either id is not a number at all (string, object)", () => {
    assert.equal(buildBvpHistoryKey("665742", 605400), null);
    assert.equal(buildBvpHistoryKey(665742, {}), null);
  });
});

function vsPlayerResponse(typeDisplayName, splits) {
  return { stats: [{ type: { displayName: typeDisplayName }, group: { displayName: "hitting" }, splits }] };
}

describe("parseVsPlayerSplit", () => {
  it("extracts pa/h/avg/hr when the stats[] block's type.displayName matches expectedStatsType", () => {
    const json = vsPlayerResponse("vsPlayerTotal", [{ stat: { plateAppearances: 9, hits: 3, avg: ".375", homeRuns: 1 } }]);
    assert.deepEqual(parseVsPlayerSplit(json, "vsPlayerTotal"), { pa: 9, h: 3, avg: 0.375, hr: 1 });
  });

  it("finds the matching block regardless of its position when multiple stats[] blocks are present (reordering)", () => {
    const json = {
      stats: [
        vsPlayerResponse("vsPlayer5Y", [{ stat: { plateAppearances: 4, hits: 1, avg: ".250", homeRuns: 0 } }]).stats[0],
        vsPlayerResponse("vsPlayerTotal", [{ stat: { plateAppearances: 9, hits: 3, avg: ".375", homeRuns: 1 } }]).stats[0],
      ],
    };
    assert.deepEqual(parseVsPlayerSplit(json, "vsPlayerTotal"), { pa: 9, h: 3, avg: 0.375, hr: 1 });
    assert.deepEqual(parseVsPlayerSplit(json, "vsPlayer5Y"), { pa: 4, h: 1, avg: 0.25, hr: 0 });
  });

  it("returns null (mismatched response) when no block's type.displayName matches expectedStatsType", () => {
    const json = vsPlayerResponse("vsPlayer5Y", [{ stat: { plateAppearances: 9, hits: 3, avg: ".375", homeRuns: 1 } }]);
    assert.equal(parseVsPlayerSplit(json, "vsPlayerTotal"), null);
  });

  it("returns null (ambiguous response) when more than one block claims the same expectedStatsType", () => {
    const block = vsPlayerResponse("vsPlayerTotal", [{ stat: { plateAppearances: 9, hits: 3, avg: ".375", homeRuns: 1 } }]).stats[0];
    const json = { stats: [block, block] };
    assert.equal(parseVsPlayerSplit(json, "vsPlayerTotal"), null);
  });

  it("returns null when the matched block has zero splits (no data on record for this pair)", () => {
    const json = vsPlayerResponse("vsPlayerTotal", []);
    assert.equal(parseVsPlayerSplit(json, "vsPlayerTotal"), null);
  });

  it("returns null (ambiguous) when the matched block has more than one split", () => {
    const json = vsPlayerResponse("vsPlayerTotal", [
      { stat: { plateAppearances: 9, hits: 3, avg: ".375", homeRuns: 1 } },
      { stat: { plateAppearances: 2, hits: 1, avg: ".500", homeRuns: 0 } },
    ]);
    assert.equal(parseVsPlayerSplit(json, "vsPlayerTotal"), null);
  });

  it("returns null when stats/splits are entirely absent", () => {
    assert.equal(parseVsPlayerSplit({}, "vsPlayerTotal"), null);
    assert.equal(parseVsPlayerSplit(null, "vsPlayerTotal"), null);
    assert.equal(parseVsPlayerSplit(undefined, "vsPlayerTotal"), null);
  });

  it("returns null when plateAppearances is missing", () => {
    const json = vsPlayerResponse("vsPlayerTotal", [{ stat: { hits: 1, avg: ".250", homeRuns: 0 } }]);
    assert.equal(parseVsPlayerSplit(json, "vsPlayerTotal"), null);
  });

  it("returns null when plateAppearances is zero", () => {
    const json = vsPlayerResponse("vsPlayerTotal", [{ stat: { plateAppearances: 0, hits: 0, avg: ".000", homeRuns: 0 } }]);
    assert.equal(parseVsPlayerSplit(json, "vsPlayerTotal"), null);
  });

  it("returns null when plateAppearances is negative", () => {
    const json = vsPlayerResponse("vsPlayerTotal", [{ stat: { plateAppearances: -1, hits: 0, avg: ".000", homeRuns: 0 } }]);
    assert.equal(parseVsPlayerSplit(json, "vsPlayerTotal"), null);
  });

  it("returns null when plateAppearances is non-finite/invalid", () => {
    const json = vsPlayerResponse("vsPlayerTotal", [{ stat: { plateAppearances: "not-a-number", hits: 0, avg: ".000", homeRuns: 0 } }]);
    assert.equal(parseVsPlayerSplit(json, "vsPlayerTotal"), null);
  });

  it("returns null when hits is missing or negative", () => {
    const missingHits = vsPlayerResponse("vsPlayerTotal", [{ stat: { plateAppearances: 5, avg: ".250", homeRuns: 0 } }]);
    assert.equal(parseVsPlayerSplit(missingHits, "vsPlayerTotal"), null);
    const negativeHits = vsPlayerResponse("vsPlayerTotal", [{ stat: { plateAppearances: 5, hits: -1, avg: ".250", homeRuns: 0 } }]);
    assert.equal(parseVsPlayerSplit(negativeHits, "vsPlayerTotal"), null);
  });

  it("returns null when homeRuns is missing or negative", () => {
    const missingHr = vsPlayerResponse("vsPlayerTotal", [{ stat: { plateAppearances: 5, hits: 1, avg: ".250" } }]);
    assert.equal(parseVsPlayerSplit(missingHr, "vsPlayerTotal"), null);
    const negativeHr = vsPlayerResponse("vsPlayerTotal", [{ stat: { plateAppearances: 5, hits: 1, avg: ".250", homeRuns: -1 } }]);
    assert.equal(parseVsPlayerSplit(negativeHr, "vsPlayerTotal"), null);
  });

  it("returns null when avg is missing or non-finite", () => {
    const missingAvg = vsPlayerResponse("vsPlayerTotal", [{ stat: { plateAppearances: 5, hits: 1, homeRuns: 0 } }]);
    assert.equal(parseVsPlayerSplit(missingAvg, "vsPlayerTotal"), null);
  });

  it("accepts hits and home runs of exactly zero (a valid, real result -- 0-for-N)", () => {
    const json = vsPlayerResponse("vsPlayerTotal", [{ stat: { plateAppearances: 4, hits: 0, avg: ".000", homeRuns: 0 } }]);
    assert.deepEqual(parseVsPlayerSplit(json, "vsPlayerTotal"), { pa: 4, h: 0, avg: 0, hr: 0 });
  });

  it("parses a leading-dot average string as a number", () => {
    const json = vsPlayerResponse("vsPlayerTotal", [{ stat: { plateAppearances: 1, hits: 0, avg: ".000", homeRuns: 0 } }]);
    assert.equal(parseVsPlayerSplit(json, "vsPlayerTotal").avg, 0);
  });

  it("never zero-fills a rejected window -- a missing field yields null for the whole split, not partial defaults", () => {
    const json = vsPlayerResponse("vsPlayerTotal", [{ stat: { plateAppearances: 5, hits: 1 } }]);
    assert.equal(parseVsPlayerSplit(json, "vsPlayerTotal"), null);
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

  it("produces a null key when the ids are invalid, rather than a garbage key string", () => {
    const entry = buildBvpHistoryEntry({ batterId: null, pitcherId: 2 });
    assert.equal(entry.key, null);
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

describe("isCachedEntryFullyValid", () => {
  const split = { pa: 10, h: 3, avg: 0.3, hr: 1 };

  it("returns true when both windows are non-null", () => {
    assert.equal(isCachedEntryFullyValid({ career: split, last5y: split }), true);
  });

  it("returns false when either window is null", () => {
    assert.equal(isCachedEntryFullyValid({ career: split, last5y: null }), false);
    assert.equal(isCachedEntryFullyValid({ career: null, last5y: split }), false);
    assert.equal(isCachedEntryFullyValid({ career: null, last5y: null }), false);
  });

  it("returns false for a missing/undefined entry", () => {
    assert.equal(isCachedEntryFullyValid(undefined), false);
    assert.equal(isCachedEntryFullyValid(null), false);
  });
});

describe("resolveWindow", () => {
  const fresh = { pa: 10, h: 3, avg: 0.3, hr: 1 };
  const cached = { pa: 8, h: 2, avg: 0.25, hr: 0 };

  it("uses the fresh value when the fetch succeeded, even when it differs from cache", () => {
    assert.deepEqual(resolveWindow(fresh, false, cached), fresh);
  });

  it("uses a clean fresh null (no data) when the fetch succeeded but found nothing -- never falls back to cache on a real no-data result", () => {
    assert.equal(resolveWindow(null, false, cached), null);
  });

  it("falls back to the cached value when the fetch errored", () => {
    assert.deepEqual(resolveWindow(null, true, cached), cached);
  });

  it("falls back to null (never a fabricated value) when the fetch errored and there was nothing cached", () => {
    assert.equal(resolveWindow(null, true, null), null);
    assert.equal(resolveWindow(null, true, undefined), null);
  });
});

describe("filterCacheForSlate", () => {
  const entryA = { key: "1|2", batterId: 1, pitcherId: 2, batter: "A", pitcher: "P", career: { pa: 10, h: 3, avg: 0.3, hr: 1 }, last5y: null };
  const entryB = { key: "3|4", batterId: 3, pitcherId: 4, batter: "B", pitcher: "P", career: null, last5y: null };

  it("reuses entries when the payload's date matches the requested slate date", () => {
    const map = filterCacheForSlate({ date: "2026-07-17", history: [entryA, entryB] }, "2026-07-17");
    assert.equal(map.size, 2);
    assert.deepEqual(map.get("1|2"), entryA);
    assert.deepEqual(map.get("3|4"), entryB);
  });

  it("discards everything when the payload's date is from a prior slate", () => {
    const map = filterCacheForSlate({ date: "2026-07-16", history: [entryA, entryB] }, "2026-07-17");
    assert.equal(map.size, 0);
  });

  it("discards everything when the payload has no date at all", () => {
    const map = filterCacheForSlate({ history: [entryA] }, "2026-07-17");
    assert.equal(map.size, 0);
  });

  it("returns an empty map for a null/undefined payload (cold start), never throwing", () => {
    assert.equal(filterCacheForSlate(null, "2026-07-17").size, 0);
    assert.equal(filterCacheForSlate(undefined, "2026-07-17").size, 0);
  });

  it("returns an empty map when history is missing or not an array (malformed payload), never throwing", () => {
    assert.equal(filterCacheForSlate({ date: "2026-07-17" }, "2026-07-17").size, 0);
    assert.equal(filterCacheForSlate({ date: "2026-07-17", history: "not-an-array" }, "2026-07-17").size, 0);
  });

  it("skips entries with no key rather than including an unlookupable entry", () => {
    const map = filterCacheForSlate({ date: "2026-07-17", history: [entryA, { ...entryB, key: null }] }, "2026-07-17");
    assert.equal(map.size, 1);
    assert.ok(map.has("1|2"));
  });
});
