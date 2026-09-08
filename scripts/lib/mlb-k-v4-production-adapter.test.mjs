/**
 * mlb-k-v4-production-adapter.test.mjs
 * Run via: node --test scripts/lib/mlb-k-v4-production-adapter.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildV4Projection, buildOpponentObservations, buildSeasonOverride, inningsTextToOuts } from "./mlb-k-v4-production-adapter.mjs";
import { validateV4ForProduction, V4_REJECTION_REASON } from "./mlb-k-v4-projection-validator.mjs";
import { resolveKProjection, K_PROJECTION_SOURCE, V3_IS_PRODUCTION_AUTHORITY } from "./mlb-k-production-projection.mjs";
import { extractStarts, mergeStarts } from "../update-mlb-k-start-log.mjs";

const SLATE = "2026-09-07";

function detailFixture(overrides = {}) {
  const starts = Array.from({ length: 10 }, (unused, index) => ({
    gamePk: 900000 + index,
    date: `2026-08-${String(10 + index).padStart(2, "0")}`,
    opponentAbbr: "CLE",
    outsRecorded: 18,
    strikeouts: 6,
    battersFaced: 24,
    pitchCount: 92,
  }));
  return {
    key: "test pitcher|det|min|2026-09-07",
    pitcherId: 111,
    pitcher: "Test Pitcher",
    team: "DET",
    opponent: "MIN",
    pitcherHand: "R",
    pitcherLast10Starts: starts,
    pitcherVenueSplits: {
      home: { season: { gamesUsed: 9, totalOuts: 162, strikeouts: 54, battersFaced: 216 } },
      away: { season: { gamesUsed: 8, totalOuts: 144, strikeouts: 48, battersFaced: 192 } },
    },
    opponentContext: { last10: { kRate: 0.19 } },
    opponentLastFiveVsStartersSummary: {
      rows: Array.from({ length: 10 }, (unused, index) => ({
        date: `2026-08-${String(20 + index).padStart(2, "0")}`,
        opposingStartingPitcher: `Opposing Arm ${index}`,
        opposingStarterOuts: 12,
        opposingStarterStrikeouts: 3,
        valid: true,
      })),
    },
    ...overrides,
  };
}

const v2RowFixture = () => ({
  pitcher: { opponent: "MIN", handedness: "R" },
  v2: { projectedStrikeouts: 5, projectedInnings: 5.2, projectedBattersFaced: 22, projectedKRate: 0.22, confidence: "high", modelVersion: "mlb-k-projection-v2-production" },
  v3: { projectedKs: 5.4, finalProjectedIP: 5.8, projectedBF: 24, projectedKRate: 0.225, leagueKRate: 0.2187, inputs: { leagueIPPerStart: 5.0, leagueBFPerIP: 4.3 } },
  inputs: { v2Input: { opponent: { projectedLineupKRate: 19.5, recentKRate: 0.19, vsLhpKRate: null, vsRhpKRate: null } } },
});

/** Baselines for the ten opposing arms: each normally goes 6 IP at 1.0 K/IP. */
const startLogFixture = () =>
  Array.from({ length: 10 }, (unused, index) =>
    Array.from({ length: 6 }, (u2, j) => ({
      date: `2026-07-${String(10 + j).padStart(2, "0")}`,
      pitcher: `Opposing Arm ${index}`,
      outs: 18,
      strikeouts: 6,
      opponent: "TOR",
    })),
  ).flat();

describe("V4 production adapter", () => {
  it("builds a complete projection from production-shaped artifacts", () => {
    const v4 = buildV4Projection({
      detail: detailFixture(),
      v2Row: v2RowFixture(),
      workloadRow: { role: "starter" },
      startLog: startLogFixture(),
      wrcTable: { teams: [{ abbreviation: "MIN", recentRank: 7, seasonRank: 10 }] },
      slateDate: SLATE,
    });
    assert.ok(v4.projectedKs > 0);
    assert.ok(Math.abs(v4.projectedKs - v4.finalProjectedIP * v4.finalProjectedKPerIP) < 2e-3);
    assert.strictEqual(v4.opponentWrcPlusRankRecent, 7);
    assert.ok(v4.opponentUsableGames > 0, "opponent context must resolve from the start log");
  });

  it("detects the seeded opponent suppression: 4.0 IP against a 6.0 baseline", () => {
    const v4 = buildV4Projection({
      detail: detailFixture(),
      v2Row: v2RowFixture(),
      workloadRow: { role: "starter" },
      startLog: startLogFixture(),
      wrcTable: null,
      slateDate: SLATE,
    });
    assert.ok(v4.rawOpponentIPFactor < 0.75, `raw ${v4.rawOpponentIPFactor}`);
    assert.ok(v4.shrunkOpponentIPFactor < 1);
    assert.ok(v4.shrunkOpponentKFactor < 1, "0.75 K/IP against a 1.0 baseline is suppression");
  });

  it("stays neutral, not absent, when the start log has no baselines", () => {
    const v4 = buildV4Projection({
      detail: detailFixture(),
      v2Row: v2RowFixture(),
      workloadRow: { role: "starter" },
      startLog: [],
      wrcTable: null,
      slateDate: SLATE,
    });
    assert.strictEqual(v4.shrunkOpponentIPFactor, 1);
    assert.strictEqual(v4.shrunkOpponentKFactor, 1);
    assert.ok(v4.projectedKs > 0, "a missing start log must degrade, not fail");
  });

  it("declines openers and relievers", () => {
    for (const role of ["opener", "reliever"]) {
      const v4 = buildV4Projection({
        detail: detailFixture(),
        v2Row: v2RowFixture(),
        workloadRow: { role },
        startLog: startLogFixture(),
        slateDate: SLATE,
      });
      assert.strictEqual(v4.projectedKs, null);
    }
  });

  it("never reads the market, even when the row carries one", () => {
    const base = { detail: detailFixture(), v2Row: v2RowFixture(), workloadRow: { role: "starter" }, startLog: startLogFixture(), slateDate: SLATE };
    const clean = buildV4Projection(base);
    const polluted = buildV4Projection({
      ...base,
      detail: { ...detailFixture(), kLine: 9.5, kOddsOver: "-5000" },
      v2Row: { ...v2RowFixture(), market: { kLine: 9.5, oddsOver: "-5000", oddsUnder: "+2000" } },
    });
    assert.strictEqual(polluted.projectedKs, clean.projectedKs);
  });

  it("drops opponent observations dated on or after the slate", () => {
    const detail = detailFixture({
      opponentLastFiveVsStartersSummary: {
        rows: [
          { date: SLATE, opposingStartingPitcher: "Today Arm", opposingStarterOuts: 15, opposingStarterStrikeouts: 5, valid: true },
          { date: "2026-09-20", opposingStartingPitcher: "Future Arm", opposingStarterOuts: 15, opposingStarterStrikeouts: 5, valid: true },
          { date: "2026-08-30", opposingStartingPitcher: "Past Arm", opposingStarterOuts: 15, opposingStarterStrikeouts: 5, valid: true },
        ],
      },
    });
    const observations = buildOpponentObservations(detail, SLATE);
    assert.strictEqual(observations.length, 1);
    assert.strictEqual(observations[0].date, "2026-08-30");
  });

  it("reads whole-season workload from the venue splits", () => {
    const season = buildSeasonOverride(detailFixture());
    assert.strictEqual(season.starts, 17);
    assert.ok(Math.abs(season.ipPerStart - 306 / 3 / 17) < 1e-9);
    assert.ok(Math.abs(season.kPerIP - 102 / (306 / 3)) < 1e-9);
  });

  it("parses baseball fractional innings, not decimals", () => {
    assert.strictEqual(inningsTextToOuts("5.1"), 16);
    assert.strictEqual(inningsTextToOuts("5.2"), 17);
    assert.strictEqual(inningsTextToOuts("6"), 18);
  });
});

describe("V4 production validator", () => {
  const ok = { projectedKs: 5, finalProjectedIP: 5.4, finalProjectedKPerIP: 0.93, confidence: "high", warnings: [] };

  it("accepts a well-formed starter projection", () => {
    assert.deepStrictEqual(validateV4ForProduction(ok), { ok: true, reason: null });
  });

  it("rejects a missing block, a declined role, and a low confidence row", () => {
    assert.strictEqual(validateV4ForProduction(null).reason, V4_REJECTION_REASON.MISSING_V4_BLOCK);
    assert.strictEqual(
      validateV4ForProduction({ ...ok, warnings: ["ROLE_OUT_OF_V4_SCOPE_RELIEVER"] }).reason,
      V4_REJECTION_REASON.ROLE_OUT_OF_SCOPE,
    );
    assert.strictEqual(validateV4ForProduction({ ...ok, confidence: "low" }).reason, V4_REJECTION_REASON.LOW_CONFIDENCE);
  });

  it("rejects a strikeout total whose components are unusable", () => {
    assert.strictEqual(validateV4ForProduction({ ...ok, finalProjectedIP: 0 }).reason, V4_REJECTION_REASON.INVALID_COMPONENTS);
    assert.strictEqual(validateV4ForProduction({ ...ok, projectedKs: 0 }).reason, V4_REJECTION_REASON.INVALID_PROJECTION);
    assert.strictEqual(validateV4ForProduction({ ...ok, projectedKs: 40 }).reason, V4_REJECTION_REASON.IMPLAUSIBLE_PROJECTION);
  });
});

describe("production resolver after V4 promotion", () => {
  const artifactWith = (row) => ({ slateDate: SLATE, rows: [row] });
  const baseRow = {
    slateDate: SLATE,
    key: "test",
    game: { gameId: 5 },
    pitcher: { id: 111, team: "DET", opponent: "MIN" },
    v2: { projectedStrikeouts: 5, projectedInnings: 5.2, projectedBattersFaced: 22, projectedKRate: 0.22, confidence: "high", modelVersion: "mlb-k-projection-v2-production" },
    v3: { projectedKs: 6.1, finalProjectedIP: 6.2, projectedBF: 26, projectedKRate: 0.23, confidence: "high", warnings: [] },
    v4: { projectedKs: 4.3, finalProjectedIP: 5.1, finalProjectedKPerIP: 0.84, projectedBattersFaced: 21, projectedKRate: 0.2, confidence: "high", warnings: [] },
  };
  const legacyRow = { pitcherId: 111, gameId: 5, team: "DET", opponent: "MIN", pitcher: "Test Pitcher", projectedKs: 4.9, kLine: 4.5 };

  it("publishes V4 when the row passes its gate", () => {
    const resolved = resolveKProjection({ legacyRow, artifact: artifactWith(baseRow), publicSlateDate: SLATE });
    assert.strictEqual(resolved.source, K_PROJECTION_SOURCE.V4);
    assert.strictEqual(resolved.effectiveProjectedKs, 4.3);
    assert.strictEqual(resolved.projectedInnings, 5.1, "V4's innings must travel with V4's strikeouts");
    assert.strictEqual(resolved.modelVersion, "mlb-k-projection-v4");
  });

  it("falls back to V2 -- NOT V3 -- when V4 declines the row", () => {
    const row = { ...baseRow, v4: { ...baseRow.v4, warnings: ["ROLE_OUT_OF_V4_SCOPE_RELIEVER"] } };
    const resolved = resolveKProjection({ legacyRow, artifact: artifactWith(row), publicSlateDate: SLATE });
    assert.strictEqual(resolved.source, K_PROJECTION_SOURCE.V2, "V3 must not be the first fallback");
    assert.strictEqual(resolved.effectiveProjectedKs, 5);
    assert.strictEqual(resolved.v4RejectionReason, V4_REJECTION_REASON.ROLE_OUT_OF_SCOPE);
    assert.strictEqual(V3_IS_PRODUCTION_AUTHORITY, false);
  });

  it("falls back to legacy when the whole V2 path fails", () => {
    const row = { ...baseRow, v2: { ...baseRow.v2, confidence: "low" } };
    const resolved = resolveKProjection({ legacyRow, artifact: artifactWith(row), publicSlateDate: SLATE });
    assert.strictEqual(resolved.source, K_PROJECTION_SOURCE.LEGACY_FALLBACK);
    assert.strictEqual(resolved.effectiveProjectedKs, 4.9);
  });

  it("falls back when the artifact is for a different slate", () => {
    const resolved = resolveKProjection({
      legacyRow,
      artifact: { slateDate: "2026-09-06", rows: [baseRow] },
      publicSlateDate: SLATE,
    });
    assert.strictEqual(resolved.source, K_PROJECTION_SOURCE.LEGACY_FALLBACK);
  });
});

describe("rolling start log updater", () => {
  const details = {
    date: SLATE,
    details: [
      {
        pitcherId: 111,
        pitcher: "Test Pitcher",
        pitcherLast10Starts: [
          { gamePk: 1, date: "2026-09-01", opponentAbbr: "MIN", outsRecorded: 18, strikeouts: 6, battersFaced: 24 },
          { gamePk: 2, date: "2026-08-26", opponentAbbr: "TB", inningsPitched: "5.1", strikeouts: 4, battersFaced: 22 },
          { gamePk: 3, date: "2026-08-20", opponentAbbr: "KC", strikeouts: 3 },
        ],
      },
    ],
  };

  it("extracts readable starts and drops unreadable ones", () => {
    const starts = extractStarts(details);
    assert.strictEqual(starts.length, 2, "the start with no innings must be dropped, not zeroed");
    assert.strictEqual(starts[1].outs, 16, "5.1 innings is 16 outs");
  });

  it("union-merges idempotently and deterministically", () => {
    const incoming = extractStarts(details);
    const first = mergeStarts([], incoming);
    const second = mergeStarts(first.starts, incoming);
    assert.strictEqual(second.added, 0, "re-running must add nothing");
    assert.deepStrictEqual(second.starts, first.starts);
    assert.deepStrictEqual(
      first.starts.map((s) => s.date),
      [...first.starts.map((s) => s.date)].sort(),
      "output must be date-sorted",
    );
  });
});
