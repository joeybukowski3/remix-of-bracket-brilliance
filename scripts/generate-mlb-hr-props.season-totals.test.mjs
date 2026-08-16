import assert from "node:assert/strict";
import test from "node:test";
import { extractAuthoritativeSeasonTotals } from "./generate-mlb-hr-props.mjs";

test("extracts StatsAPI season HR and PA without using AB", () => {
  assert.deepEqual(
    extractAuthoritativeSeasonTotals({ homeRuns: 16, plateAppearances: 449, atBats: 384 }),
    { seasonHomeRuns: 16, seasonPlateAppearances: 449 },
  );
});

test("keeps a true zero-HR season when PA exists", () => {
  assert.deepEqual(
    extractAuthoritativeSeasonTotals({ homeRuns: 0, plateAppearances: 200, atBats: 180 }),
    { seasonHomeRuns: 0, seasonPlateAppearances: 200 },
  );
});

test("returns nulls when season hitting totals are missing", () => {
  assert.deepEqual(extractAuthoritativeSeasonTotals(null), {
    seasonHomeRuns: null,
    seasonPlateAppearances: null,
  });
  assert.deepEqual(extractAuthoritativeSeasonTotals({ atBats: 300 }), {
    seasonHomeRuns: null,
    seasonPlateAppearances: null,
  });
});
