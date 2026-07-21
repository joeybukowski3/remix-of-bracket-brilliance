/**
 * mlb-x-selection-artifact.test.mjs
 * Run via: node --test scripts/lib/mlb-x-selection-artifact.test.mjs
 *
 * Covers the Numerology addition (buildNumerologyArtifact + the numerology
 * case of getRowIdentity/validateArtifact) added alongside the existing HR/K
 * builders -- see mlb-numerology-x-selection-core.mjs / plan-mlb-numerology-
 * delivery.mjs for how this artifact is produced and consumed.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildNumerologyArtifact, getRowIdentity, validateArtifact } from "./mlb-x-selection-artifact.mjs";

function snapshot({ asOf = new Date().toISOString(), phase = "POLLING", minutesUntilFirstPitch = 90, earliestGameTime = null } = {}) {
  return { asOf, timing: { phase, minutesUntilFirstPitch, earliestGameTime } };
}

describe("buildNumerologyArtifact", () => {
  it("freezes contentType, slate metadata, and a 1-based rank on each row", () => {
    const artifact = buildNumerologyArtifact({
      slateDate: "2026-07-20",
      snapshot: snapshot(),
      selectedRows: [
        { player: "First", team: "NYY", opponent: "BOS", playerId: 1, gameId: 100 },
        { player: "Second", team: "LAD", opponent: "SF", playerId: 2, gameId: 101 },
      ],
      selectionStatus: "READY_CONFIRMED_SELECTIONS",
    });
    assert.equal(artifact.contentType, "numerology");
    assert.equal(artifact.slateDate, "2026-07-20");
    assert.equal(artifact.selectionStatus, "READY_CONFIRMED_SELECTIONS");
    assert.deepEqual(artifact.rows.map((r) => [r.rank, r.player]), [[1, "First"], [2, "Second"]]);
  });

  it("never reorders the given selectedRows -- rank only annotates existing order", () => {
    const artifact = buildNumerologyArtifact({
      slateDate: "2026-07-20",
      snapshot: snapshot(),
      selectedRows: [
        { player: "Lower Score But First", team: "NYY", opponent: "BOS", playerId: 1, gameId: 100, numerologyScore: 55 },
        { player: "Higher Score But Second", team: "LAD", opponent: "SF", playerId: 2, gameId: 101, numerologyScore: 90 },
      ],
      selectionStatus: "READY_CONFIRMED_SELECTIONS",
    });
    assert.deepEqual(artifact.rows.map((r) => r.player), ["Lower Score But First", "Higher Score But Second"]);
  });

  it("preserves every field from the source play object (email + X both need the full shape)", () => {
    const play = { player: "Full Shape", team: "NYY", opponent: "BOS", playerId: 1, gameId: 100, numerologyScore: 72, matchType: "Exact Match", chips: ["Age Match"] };
    const artifact = buildNumerologyArtifact({ slateDate: "2026-07-20", snapshot: snapshot(), selectedRows: [play], selectionStatus: "READY_CONFIRMED_SELECTIONS" });
    assert.equal(artifact.rows[0].numerologyScore, 72);
    assert.equal(artifact.rows[0].matchType, "Exact Match");
    assert.deepEqual(artifact.rows[0].chips, ["Age Match"]);
  });
});

describe("getRowIdentity (numerology)", () => {
  it("uses playerId|gameId, the same generic identity HR uses", () => {
    const id = getRowIdentity("numerology", { playerId: 42, gameId: 777 });
    assert.equal(id, "42|777");
  });

  it("falls back to a lowercased player name when playerId is missing", () => {
    const id = getRowIdentity("numerology", { player: "Mike Trout", gameId: 777 });
    assert.equal(id, "mike trout|777");
  });
});

describe("validateArtifact (numerology)", () => {
  it("rejects an artifact with a duplicate player identity", () => {
    const artifact = buildNumerologyArtifact({
      slateDate: "2026-07-20",
      snapshot: snapshot(),
      selectedRows: [
        { player: "Dup", team: "NYY", opponent: "BOS", playerId: 1, gameId: 100 },
        { player: "Dup", team: "NYY", opponent: "BOS", playerId: 1, gameId: 100 },
      ],
      selectionStatus: "READY_CONFIRMED_SELECTIONS",
    });
    const error = validateArtifact(artifact, { slateDate: "2026-07-20" });
    assert.match(error, /duplicate row identity/i);
  });

  it("rejects a stale confirmation snapshot", () => {
    const staleAsOf = new Date(Date.now() - 60 * 60_000).toISOString(); // 60 min old
    const artifact = buildNumerologyArtifact({
      slateDate: "2026-07-20",
      snapshot: snapshot({ asOf: staleAsOf }),
      selectedRows: [{ player: "One", team: "NYY", opponent: "BOS", playerId: 1, gameId: 100 }],
      selectionStatus: "READY_CONFIRMED_SELECTIONS",
    });
    const error = validateArtifact(artifact, { slateDate: "2026-07-20" });
    assert.match(error, /stale/i);
  });

  it("accepts a fresh artifact with distinct player identities", () => {
    const artifact = buildNumerologyArtifact({
      slateDate: "2026-07-20",
      snapshot: snapshot(),
      selectedRows: [
        { player: "One", team: "NYY", opponent: "BOS", playerId: 1, gameId: 100 },
        { player: "Two", team: "LAD", opponent: "SF", playerId: 2, gameId: 101 },
      ],
      selectionStatus: "READY_CONFIRMED_SELECTIONS",
    });
    const error = validateArtifact(artifact, { slateDate: "2026-07-20" });
    assert.equal(error, "");
  });
});
