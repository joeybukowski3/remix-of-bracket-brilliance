import { describe, expect, it } from "vitest";
// @ts-expect-error The production identity resolver is an intentional Node ESM module.
import {
  buildHistoryIndex,
  buildHistoryLookup,
  buildParticipantIndex,
  buildParticipantLookup,
  computeClearingKeys,
  resolveById,
  resolveUnifiedIdentity,
  resolveScopeUnified,
} from "../../../scripts/lib/pga-player-identity-resolution.mjs";
// @ts-expect-error The production metadata helper is an intentional Node ESM module.
import { mergeRefreshMetadata, toPublicFailure } from "../../../scripts/lib/pga-player-history-metadata.mjs";

function history(players: Array<{ player: string; playerId: string }>) {
  return { version: 1, source: "pga-tour-player-profile-results", generatedAt: "2026-07-13T00:00:00.000Z", startYear: 2016, players, errors: [] };
}

function currentField(playerDetails: Array<{ id: string; name: string }>) {
  return { tournament: "Genesis Scottish Open", tournamentId: "R2026541", validated: true, playerDetails };
}

describe("identity reconciliation across runs (name-only failure later resolves)", () => {
  it("clears a prior unresolved name-only failure once the participant file gains that player's ID", () => {
    // Run 1: Keita isn't in the field yet, so she fails identity resolution
    // with no canonical ID and is keyed by name.
    const historyAfterRun1 = history([{ player: "Scottie Scheffler", playerId: "46046" }]);
    const fieldRun1 = currentField([{ id: "46046", name: "Scottie Scheffler" }]);
    const run1Resolved = resolveScopeUnified(["Scottie Scheffler", "Keita Nakajima"], history([]), fieldRun1);
    const keitaFailureRun1 = toPublicFailure(run1Resolved.find((entry: { scopeName: string }) => entry.scopeName === "Keita Nakajima"));
    expect(keitaFailureRun1).toMatchObject({ player: "Keita Nakajima", playerId: null });

    const metadataRun1 = mergeRefreshMetadata(null, {
      attemptedAt: "2026-07-13T10:00:00.000Z",
      asOfDate: "2026-07-13",
      scopeKeys: ["46046", "name:keita nakajima"],
      clearingKeys: [],
      failedPlayers: [keitaFailureRun1],
      cacheHitCount: 0,
      requestCount: 1,
    });
    expect(metadataRun1).toMatchObject({ scopeCount: 2, successCount: 1, failureCount: 1, status: "partial" });

    // Run 2: the participant file now lists Keita with ID 49228; she resolves
    // and succeeds. computeClearingKeys must recognize her old name-only
    // failure as the same player.
    const fieldRun2 = currentField([{ id: "46046", name: "Scottie Scheffler" }, { id: "49228", name: "Keita Nakajima" }]);
    const keitaSuccess = { status: "success", scopeName: "Keita Nakajima", player: "Keita Nakajima", playerId: "49228", results: [] };
    const clearingKeys = computeClearingKeys([keitaSuccess], {
      historyPayload: historyAfterRun1,
      participantPayload: fieldRun2,
      priorFailedPlayers: metadataRun1.failedPlayers,
    });
    expect(clearingKeys).toEqual(expect.arrayContaining(["49228", "name:keita nakajima"]));

    const metadataRun2 = mergeRefreshMetadata(metadataRun1, {
      attemptedAt: "2026-07-14T10:00:00.000Z",
      asOfDate: "2026-07-13",
      scopeKeys: ["49228"],
      clearingKeys,
      failedPlayers: [],
      cacheHitCount: 1,
      requestCount: 0,
    });

    expect(metadataRun2.failedPlayers).toEqual([]);
    // Canonicalized: two logical players (Scottie, Keita), not three keys.
    expect(metadataRun2).toMatchObject({ scopeCount: 2, successCount: 2, failureCount: 0, status: "complete" });
    expect(metadataRun2.trackedKeys).toEqual(["46046", "49228"]);
    expect(metadataRun2.trackedKeys).not.toContain("name:keita nakajima");
  });

  it("a targeted rerun by player ID also clears the old name-only failure", () => {
    const before = history([{ player: "Scottie Scheffler", playerId: "46046" }]);
    const field = currentField([{ id: "46046", name: "Scottie Scheffler" }, { id: "49228", name: "Keita Nakajima" }]);
    const priorFailure = toPublicFailure({ scopeName: "Keita Nakajima", player: "Keita Nakajima", playerId: null, stage: "identity-resolution", errorCode: "IDENTITY_UNRESOLVED", message: "boom" });

    const historyIndex = buildHistoryIndex(before);
    const participantIndex = buildParticipantIndex(field);
    const idResult = resolveById("49228", historyIndex, participantIndex);
    expect(idResult).toMatchObject({ status: "resolved", scopeName: "49228", player: "Keita Nakajima", playerId: "49228" });

    const successResult = { status: "success", scopeName: idResult.scopeName, player: idResult.player, playerId: idResult.playerId, results: [] };
    const clearingKeys = computeClearingKeys([successResult], { historyPayload: before, participantPayload: field, priorFailedPlayers: [priorFailure] });
    expect(clearingKeys).toContain("name:keita nakajima");

    const previous = mergeRefreshMetadata(null, { attemptedAt: "2026-07-13T10:00:00.000Z", asOfDate: "2026-07-13", scopeKeys: ["46046", "name:keita nakajima"], clearingKeys: [], failedPlayers: [priorFailure], cacheHitCount: 0, requestCount: 1 });
    const rerun = mergeRefreshMetadata(previous, { attemptedAt: "2026-07-14T10:00:00.000Z", asOfDate: "2026-07-13", scopeKeys: ["49228"], clearingKeys, failedPlayers: [], cacheHitCount: 1, requestCount: 0 });

    expect(rerun.failedPlayers).toEqual([]);
    expect(rerun.status).toBe("complete");
    expect(rerun.trackedKeys).toEqual(["46046", "49228"]);
  });

  it("a targeted rerun by player name also clears the old name-only failure", () => {
    const before = history([{ player: "Scottie Scheffler", playerId: "46046" }]);
    const field = currentField([{ id: "46046", name: "Scottie Scheffler" }, { id: "49228", name: "Keita Nakajima" }]);
    const priorFailure = toPublicFailure({ scopeName: "Keita Nakajima", player: "Keita Nakajima", playerId: null, stage: "identity-resolution", errorCode: "IDENTITY_UNRESOLVED", message: "boom" });

    const nameResult = resolveUnifiedIdentity("Keita Nakajima", {
      historyLookup: buildHistoryLookup(before),
      historyIndex: buildHistoryIndex(before),
      participantLookup: buildParticipantLookup(field),
    });
    expect(nameResult).toMatchObject({ status: "resolved", playerId: "49228" });

    const successResult = { status: "success", scopeName: "Keita Nakajima", player: nameResult.player, playerId: nameResult.playerId, results: [] };
    const clearingKeys = computeClearingKeys([successResult], { historyPayload: before, participantPayload: field, priorFailedPlayers: [priorFailure] });

    const previous = mergeRefreshMetadata(null, { attemptedAt: "2026-07-13T10:00:00.000Z", asOfDate: "2026-07-13", scopeKeys: ["46046", "name:keita nakajima"], clearingKeys: [], failedPlayers: [priorFailure], cacheHitCount: 0, requestCount: 1 });
    const rerun = mergeRefreshMetadata(previous, { attemptedAt: "2026-07-14T10:00:00.000Z", asOfDate: "2026-07-13", scopeKeys: ["49228"], clearingKeys, failedPlayers: [], cacheHitCount: 1, requestCount: 0 });

    expect(rerun.failedPlayers).toEqual([]);
    expect(rerun.status).toBe("complete");
  });

  it("does not clear an unrelated player's failure just because another player succeeds", () => {
    const before = history([]);
    const field = currentField([{ id: "1", name: "John Doe" }]);
    const unrelatedFailure = toPublicFailure({ scopeName: "Sam Smith", player: "Sam Smith", playerId: null, stage: "identity-resolution", errorCode: "IDENTITY_UNRESOLVED", message: "boom" });

    const successResult = { status: "success", scopeName: "John Doe", player: "John Doe", playerId: "1", results: [] };
    const clearingKeys = computeClearingKeys([successResult], { historyPayload: before, participantPayload: field, priorFailedPlayers: [unrelatedFailure] });
    expect(clearingKeys).not.toContain("name:sam smith");

    const previous = mergeRefreshMetadata(null, { attemptedAt: "2026-07-13T10:00:00.000Z", asOfDate: "2026-07-13", scopeKeys: ["name:sam smith"], clearingKeys: [], failedPlayers: [unrelatedFailure], cacheHitCount: 0, requestCount: 0 });
    const rerun = mergeRefreshMetadata(previous, { attemptedAt: "2026-07-14T10:00:00.000Z", asOfDate: "2026-07-13", scopeKeys: ["1"], clearingKeys, failedPlayers: [], cacheHitCount: 0, requestCount: 1 });

    expect(rerun.failedPlayers.map((f: { player: string }) => f.player)).toEqual(["Sam Smith"]);
    expect(rerun.status).toBe("partial");
  });

  it("does not clear a genuinely ambiguous prior failure", () => {
    const before = history([]);
    const field = currentField([
      { id: "4", name: "Sam A. Smith" },
      { id: "5", name: "Sam A Smith" },
      { id: "1", name: "John Doe" },
    ]);
    const ambiguousFailure = toPublicFailure({ scopeName: "Sam A.Smith", player: "Sam A.Smith", playerId: null, stage: "identity-resolution", errorCode: "IDENTITY_UNRESOLVED", message: "boom" });

    const successResult = { status: "success", scopeName: "John Doe", player: "John Doe", playerId: "1", results: [] };
    const clearingKeys = computeClearingKeys([successResult], { historyPayload: before, participantPayload: field, priorFailedPlayers: [ambiguousFailure] });
    expect(clearingKeys.some((key: string) => key.startsWith("name:sam"))).toBe(false);

    const previous = mergeRefreshMetadata(null, { attemptedAt: "2026-07-13T10:00:00.000Z", asOfDate: "2026-07-13", scopeKeys: ["name:sam a smith"], clearingKeys: [], failedPlayers: [ambiguousFailure], cacheHitCount: 0, requestCount: 0 });
    const rerun = mergeRefreshMetadata(previous, { attemptedAt: "2026-07-14T10:00:00.000Z", asOfDate: "2026-07-13", scopeKeys: ["1"], clearingKeys, failedPlayers: [], cacheHitCount: 0, requestCount: 1 });

    expect(rerun.failedPlayers).toHaveLength(1);
    expect(rerun.failedPlayers[0].player).toBe("Sam A.Smith");
  });

  it("still clears a plain ID-keyed failure the same way as before", () => {
    const before = history([{ player: "Existing Fail Player", playerId: "99999" }]);
    const field = currentField([{ id: "99999", name: "Existing Fail Player" }]);
    const idFailure = toPublicFailure({ scopeName: "Existing Fail Player", player: "Existing Fail Player", playerId: "99999", stage: "history-fetch", errorCode: "PGA_HISTORY_FETCH_FAILED", message: "boom" });

    const successResult = { status: "success", scopeName: "Existing Fail Player", player: "Existing Fail Player", playerId: "99999", results: [] };
    const clearingKeys = computeClearingKeys([successResult], { historyPayload: before, participantPayload: field, priorFailedPlayers: [idFailure] });

    const previous = mergeRefreshMetadata(null, { attemptedAt: "2026-07-13T10:00:00.000Z", asOfDate: "2026-07-13", scopeKeys: ["99999"], clearingKeys: [], failedPlayers: [idFailure], cacheHitCount: 0, requestCount: 1 });
    const rerun = mergeRefreshMetadata(previous, { attemptedAt: "2026-07-14T10:00:00.000Z", asOfDate: "2026-07-13", scopeKeys: ["99999"], clearingKeys, failedPlayers: [], cacheHitCount: 1, requestCount: 0 });

    expect(rerun.failedPlayers).toEqual([]);
    expect(rerun.status).toBe("complete");
    expect(rerun.trackedKeys).toEqual(["99999"]);
  });
});
