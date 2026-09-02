import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildLeagueAsOf,
  buildPitcherAsOf,
  buildTeamOffenseAsOf,
  buildWorkloadDataShape,
  eligiblePitchingRows,
  isBeforeCutoff,
} from "./mlb-k-backtest-asof.mjs";

function pitchRow(date, overrides = {}) {
  return {
    date,
    gamePk: Number(date.replace(/-/g, "")),
    season: Number(date.slice(0, 4)),
    isHome: true,
    gamesStarted: 1,
    inningsPitched: "6.0",
    strikeOuts: 7,
    battersFaced: 24,
    baseOnBalls: 2,
    numberOfPitches: 95,
    hits: 4,
    ...overrides,
  };
}

function teamRow(date, overrides = {}) {
  return {
    date,
    gamePk: Number(date.replace(/-/g, "")),
    strikeOuts: 9,
    plateAppearances: 38,
    numberOfPitches: 150,
    ...overrides,
  };
}

describe("isBeforeCutoff — the leakage gate", () => {
  it("is a strict before; the cutoff date itself is excluded", () => {
    assert.equal(isBeforeCutoff("2025-05-03", "2025-05-04"), true);
    assert.equal(isBeforeCutoff("2025-05-04", "2025-05-04"), false);
    assert.equal(isBeforeCutoff("2025-05-05", "2025-05-04"), false);
    assert.equal(isBeforeCutoff(null, "2025-05-04"), false);
    assert.equal(isBeforeCutoff("", "2025-05-04"), false);
  });
});

describe("buildPitcherAsOf — no lookahead", () => {
  const rows = [
    pitchRow("2025-04-05", { strikeOuts: 5 }),
    pitchRow("2025-04-11", { strikeOuts: 8 }),
    pitchRow("2025-04-17", { strikeOuts: 6 }),
    pitchRow("2025-04-23", { strikeOuts: 10 }), // the start being projected
    pitchRow("2025-04-29", { strikeOuts: 12 }), // future — must never be used
  ];

  it("excludes the projected start and every later start", () => {
    const asOf = buildPitcherAsOf({ currentSeasonRows: rows, cutoffDate: "2025-04-23", excludeGamePk: 20250423 });
    assert.equal(asOf.seasonStarts, 3);
    assert.equal(asOf.seasonStrikeOuts, 5 + 8 + 6);
    assert.equal(asOf.recentStartCount, 3);
    // future 12-K start absent from recent form
    assert.ok(asOf.recentStarts.every((start) => start.date < "2025-04-23"));
  });

  it("same-day start is excluded even without an explicit excludeGamePk", () => {
    const asOf = buildPitcherAsOf({ currentSeasonRows: rows, cutoffDate: "2025-04-23" });
    assert.equal(asOf.seasonStarts, 3);
  });

  it("recent starts are the last 5 before cutoff, oldest→newest (slice(-5)==slice(0,5))", () => {
    const many = Array.from({ length: 12 }, (_, index) => {
      const day = String(3 + index).padStart(2, "0");
      return pitchRow(`2025-05-${day}`, { strikeOuts: index });
    });
    const asOf = buildPitcherAsOf({ currentSeasonRows: many, cutoffDate: "2025-06-01" });
    assert.equal(asOf.recentStarts.length, 5);
    assert.deepEqual(asOf.recentStarts.map((s) => s.strikeouts), [7, 8, 9, 10, 11]);
  });

  it("first start of the season yields null season rates and firstStartOfSeason", () => {
    const asOf = buildPitcherAsOf({ currentSeasonRows: [pitchRow("2025-04-23")], cutoffDate: "2025-04-23", excludeGamePk: 20250423 });
    assert.equal(asOf.firstStartOfSeason, true);
    assert.equal(asOf.seasonKRate, null);
    assert.equal(asOf.seasonKPer9, null);
  });
});

describe("eligiblePitchingRows — previous-season fallback", () => {
  it("prepends prior season rows only when current starts are sparse", () => {
    const current = [pitchRow("2025-04-05"), pitchRow("2025-04-11")];
    const prior = [pitchRow("2024-09-01"), pitchRow("2024-09-08"), pitchRow("2024-09-15")];
    const eligible = eligiblePitchingRows({ currentSeasonRows: current, priorSeasonRows: prior, cutoffDate: "2025-04-20" });
    assert.equal(eligible.usedPriorSeason, true);
    assert.equal(eligible.combinedStartsBeforeCutoff.length, 5);
  });

  it("does not use prior season once the pitcher has a full current sample", () => {
    const current = Array.from({ length: 8 }, (_, index) => pitchRow(`2025-05-0${index + 1}`));
    const prior = [pitchRow("2024-09-01")];
    const eligible = eligiblePitchingRows({ currentSeasonRows: current, priorSeasonRows: prior, cutoffDate: "2025-06-01" });
    assert.equal(eligible.usedPriorSeason, false);
  });
});

describe("buildTeamOffenseAsOf / buildLeagueAsOf", () => {
  const teamRows = [
    teamRow("2025-04-01", { strikeOuts: 10, plateAppearances: 40 }),
    teamRow("2025-04-15", { strikeOuts: 8, plateAppearances: 38 }),
    teamRow("2025-04-20", { strikeOuts: 12, plateAppearances: 39 }), // within recent-14 of 2025-04-25
    teamRow("2025-04-25", { strikeOuts: 99, plateAppearances: 99 }), // cutoff day — excluded
  ];

  it("season K% uses only pre-cutoff games; recent-14 windows correctly", () => {
    const asOf = buildTeamOffenseAsOf({ teamRows, cutoffDate: "2025-04-25" });
    assert.equal(asOf.gamesBeforeCutoff, 3);
    assert.equal(round(asOf.seasonKRate), round((10 + 8 + 12) / (40 + 38 + 39)));
    // recent 14d before 2025-04-25 => 2025-04-11..2025-04-24 => the 04-15 and 04-20 games
    assert.equal(round(asOf.recent14KRate), round((8 + 12) / (38 + 39)));
  });

  it("league aggregates every team before the cutoff", () => {
    const league = buildLeagueAsOf({ teamRowsByTeam: new Map([[1, teamRows], [2, teamRows]]), cutoffDate: "2025-04-25" });
    assert.equal(round(league.kRate), round((10 + 8 + 12) * 2 / ((40 + 38 + 39) * 2)));
    assert.equal(league.whiffRate, null);
  });
});

describe("buildWorkloadDataShape", () => {
  it("produces the fetchPitcherWorkloadData-compatible shape", () => {
    const rows = Array.from({ length: 6 }, (_, index) => pitchRow(`2025-05-0${index + 1}`));
    const asOf = buildPitcherAsOf({ currentSeasonRows: rows, cutoffDate: "2025-06-01" });
    const shape = buildWorkloadDataShape(asOf, { season: 2025, cutoffDate: "2025-06-01" });
    assert.ok(Array.isArray(shape.starts));
    assert.ok(shape.completeness && shape.completeness.counts);
    assert.equal(shape.targetDate, "2025-06-01");
    assert.ok(shape.starts.every((start) => start.date < "2025-06-01"));
  });
});

function round(value) {
  return value == null ? null : Math.round(value * 1e6) / 1e6;
}
