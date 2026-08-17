import assert from "node:assert/strict";
import test from "node:test";
import { sumRecentHrPa } from "./generate-mlb-hr-props.mjs";

function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

test("sums real per-game HR and PA within the calendar window", () => {
  const gameLogs = [
    { date: daysAgo(1), homeRuns: 1, plateAppearances: 4 },
    { date: daysAgo(5), homeRuns: 0, plateAppearances: 5 },
    { date: daysAgo(20), homeRuns: 2, plateAppearances: 4 }, // outside a 14-day window
  ];
  assert.deepEqual(sumRecentHrPa(gameLogs, 14), { homeRuns: 1, plateAppearances: 9 });
});

test("a real populated 0-HR window returns zero, not null", () => {
  const gameLogs = [
    { date: daysAgo(2), homeRuns: 0, plateAppearances: 3 },
    { date: daysAgo(8), homeRuns: 0, plateAppearances: 4 },
  ];
  assert.deepEqual(sumRecentHrPa(gameLogs, 14), { homeRuns: 0, plateAppearances: 7 });
});

test("returns nulls (not zeros) when no games fall inside the window", () => {
  const gameLogs = [{ date: daysAgo(60), homeRuns: 3, plateAppearances: 10 }];
  assert.deepEqual(sumRecentHrPa(gameLogs, 14), { homeRuns: null, plateAppearances: null });
});

test("returns nulls for an empty game log (no proxy PA is invented)", () => {
  assert.deepEqual(sumRecentHrPa([], 30), { homeRuns: null, plateAppearances: null });
});

test("does not use AB or games-played as a PA proxy", () => {
  const gameLogs = [{ date: daysAgo(1), homeRuns: 1, plateAppearances: 0, atBats: 4 }];
  const result = sumRecentHrPa(gameLogs, 14);
  assert.equal(result.plateAppearances, 0);
  assert.notEqual(result.plateAppearances, gameLogs[0].atBats);
});
