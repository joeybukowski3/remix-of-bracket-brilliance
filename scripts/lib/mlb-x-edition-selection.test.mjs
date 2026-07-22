/**
 * mlb-x-edition-selection.test.mjs
 * Run via: node --test scripts/lib/mlb-x-edition-selection.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildHrEditionSelection, buildKEditionSelection } from "./mlb-x-edition-selection.mjs";
import { selectHrPropsAnyLineupStatus } from "./mlb-hr-x-selection-core.mjs";

const RAW_FIXTURE = JSON.parse(
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "__fixtures__", "mlb-x-hr-lineup-2026-07-21.json"), "utf8"),
);
// The lineup fixture was built to test confirmation promotion and carries no
// odds field. buildHrEditionSelection (via selectHrPropsAnyLineupStatus)
// correctly refuses to select a row with no usable price, so real odds are
// added here -- this is a test-data gap, not a behavior under test.
const FIXTURE = { ...RAW_FIXTURE, batters: RAW_FIXTURE.batters.map((b) => ({ ...b, hrOddsYes: "+300" })) };

const kRow = (overrides = {}) => ({
  pitcher: "Test Pitcher", team: "NYY", opponent: "BOS", status: "VALID",
  kLine: 5.5, oddsOver: "-110", oddsUnder: "-110", side: "over",
  projectedKs: 6.5, projectionEdge: 1.0, projectedIP: 5.5,
  isCurrentStarter: true, gameStarted: false, opposingLineupConfirmed: false, gameId: 1,
  ...overrides,
});

describe("buildKEditionSelection", () => {
  it("includes an own-starter-confirmed pitcher regardless of opposing-lineup status", () => {
    const { selectedRows } = buildKEditionSelection({ rows: [kRow({ opposingLineupConfirmed: false })] });
    assert.equal(selectedRows.length, 1, "morning must not require the opposing lineup");
  });

  it("builds selectedLineupStatus from each row's opposingLineupConfirmed flag", () => {
    const { selectedLineupStatus } = buildKEditionSelection({
      rows: [kRow({ gameId: 1, opposingLineupConfirmed: true }), kRow({ gameId: 2, opposingLineupConfirmed: false, pitcher: "Other" })],
    });
    assert.equal(selectedLineupStatus.selectedPickCount, 2);
    assert.equal(selectedLineupStatus.confirmedPickCount, 1);
    assert.equal(selectedLineupStatus.fullyConfirmed, false);
  });

  it("reports fullyConfirmed true when every selected pitcher's opposing lineup is confirmed", () => {
    const { selectedLineupStatus } = buildKEditionSelection({
      rows: [kRow({ gameId: 1, opposingLineupConfirmed: true }), kRow({ gameId: 2, opposingLineupConfirmed: true, pitcher: "Other" })],
    });
    assert.equal(selectedLineupStatus.fullyConfirmed, true);
  });

  it("still excludes a pitcher who is not confirmed as today's starter -- a market-validity requirement, not a lineup gate", () => {
    const { selectedRows } = buildKEditionSelection({ rows: [kRow({ isCurrentStarter: false })] });
    assert.equal(selectedRows.length, 0);
  });

  it("respects maxTableSize", () => {
    const rows = Array.from({ length: 8 }, (_, i) => kRow({ gameId: i, pitcher: `P${i}`, projectionEdge: 8 - i }));
    assert.equal(buildKEditionSelection({ rows, maxTableSize: 5 }).selectedRows.length, 5);
  });
});

describe("buildHrEditionSelection", () => {
  it("selects hitters regardless of lineup status for the morning edition", () => {
    const { selectedRows } = buildHrEditionSelection({ batters: FIXTURE.batters, liveConfirm: () => null });
    assert.equal(selectedRows.length, FIXTURE.batters.length > 5 ? 5 : FIXTURE.batters.length);
    assert.ok(selectedRows.length > 0, "the 2026-07-21 fixture (all projected) must still select rows");
  });

  it("marks confirmed via the same live-promotion rule as selectConfirmedHrProps", () => {
    const liveConfirm = (row) => {
      const game = FIXTURE.games.find((g) => g.gamePk === row.gameId);
      if (!game) return null;
      const side = game.homeAbbr === row.team ? game.homeLineup : game.awayAbbr === row.team ? game.awayLineup : null;
      if (!side?.confirmed) return null;
      return side.batters.some((b) => b.id === row.playerId);
    };
    const { selectedRows, selectedLineupStatus } = buildHrEditionSelection({ batters: FIXTURE.batters, liveConfirm, maxTableSize: 10 });
    const cleRows = selectedRows.filter((r) => r.team === "CLE");
    assert.ok(cleRows.length > 0, "CLE hitters must be selected");
    assert.ok(selectedLineupStatus.confirmedPickCount > 0, "CLE hitters must show as confirmed via live promotion");
    assert.ok(selectedLineupStatus.promotedFromLiveCount > 0);
  });

  it("does not mark an unconfirmed team's hitters as confirmed", () => {
    const liveConfirm = () => null;
    const { selectedLineupStatus } = buildHrEditionSelection({ batters: FIXTURE.batters, liveConfirm, maxTableSize: 10 });
    assert.equal(selectedLineupStatus.confirmedPickCount, 0);
    assert.equal(selectedLineupStatus.fullyConfirmed, false);
  });

  it("excludes a game that has started", () => {
    const started = new Set([FIXTURE.batters[0].gameId]);
    const { selectedRows } = buildHrEditionSelection({
      batters: FIXTURE.batters, isGameStarted: (row) => started.has(row.gameId), liveConfirm: () => null,
    });
    assert.ok(selectedRows.every((r) => r.gameId !== FIXTURE.batters[0].gameId));
  });
});

// Blocker 2: canonical HR category is stamped onto every selected row here --
// the same +350 price threshold hrPropBestBets.ts (the website's HR Best
// Bets cards) uses, via hrCategoryOf (mlb-x-artifact-caption.mjs), reused
// rather than reimplemented. See buildHrEditionSelection's docstring.
describe("buildHrEditionSelection: canonical HR category", () => {
  const hrBatter = (player, gameId, hrOddsYes, overrides = {}) => ({
    player, team: "NYY", opponent: "BOS", gameId, hrOddsYes, hrScore: 60, hrScoreRank: 1, ...overrides,
  });

  it("stamps an explicit category on every selected row of a normal current-shaped plan (no category on the raw feed)", () => {
    const { selectedRows } = buildHrEditionSelection({
      batters: [hrBatter("A", 1, "-150"), hrBatter("B", 2, "+450")],
      liveConfirm: () => null,
    });
    assert.ok(selectedRows.length > 0);
    assert.ok(selectedRows.every((row) => row.category === "model" || row.category === "longshot"));
  });

  it("classifies a short-priced pick as a model play", () => {
    const { selectedRows } = buildHrEditionSelection({ batters: [hrBatter("A", 1, "-150")], liveConfirm: () => null });
    assert.equal(selectedRows[0].category, "model");
  });

  it("classifies a +350-or-longer pick as a longshot", () => {
    const { selectedRows } = buildHrEditionSelection({ batters: [hrBatter("A", 1, "+400")], liveConfirm: () => null });
    assert.equal(selectedRows[0].category, "longshot");
  });

  it("an explicit longshot category overrides a short price that would otherwise heuristically read as a model play", () => {
    const { selectedRows } = buildHrEditionSelection({
      batters: [hrBatter("A", 1, "-150", { category: "longshot" })], liveConfirm: () => null,
    });
    assert.equal(selectedRows[0].category, "longshot", "a low-priced longshot stays a longshot when canonically classified that way");
  });

  it("an explicit model category overrides a long price that would otherwise heuristically read as a longshot", () => {
    const { selectedRows } = buildHrEditionSelection({
      batters: [hrBatter("A", 1, "+500", { category: "model" })], liveConfirm: () => null,
    });
    assert.equal(selectedRows[0].category, "model", "a high-priced model play stays a model play when canonically classified that way");
  });

  it("does not change which players qualify or their order -- only stamps category onto the same rows selectHrPropsAnyLineupStatus already chose", () => {
    const batters = FIXTURE.batters;
    const direct = selectHrPropsAnyLineupStatus({ batters, maxTableSize: 10 });
    const { selectedRows } = buildHrEditionSelection({ batters, liveConfirm: () => null, maxTableSize: 10 });
    assert.deepEqual(selectedRows.map((r) => r.player), direct.selected.map((r) => r.player));
    assert.equal(selectedRows.length, direct.selected.length);
    // Every field the deterministic core produced survives untouched; category is additive.
    for (let i = 0; i < selectedRows.length; i += 1) {
      const { category, ...rest } = selectedRows[i];
      assert.deepEqual(rest, direct.selected[i]);
    }
  });
});
