import { describe, expect, it } from "vitest";
// @ts-expect-error The production identity resolver is an intentional Node ESM module.
import {
  resolveScopeUnified,
  resolveUnifiedIdentity,
  buildHistoryLookup,
  buildHistoryIndex,
  buildParticipantLookup,
} from "../../../scripts/lib/pga-player-identity-resolution.mjs";
// @ts-expect-error The production merge helper is an intentional Node ESM module.
import { mergePartialScopedHistory } from "../../../scripts/lib/pga-player-history-refresh.mjs";

function history(players: Array<{ player: string; playerId: string }>) {
  return { version: 1, source: "pga-tour-player-profile-results", generatedAt: "2026-07-13T00:00:00.000Z", startYear: 2016, players, errors: [] };
}

function currentField(playerDetails: Array<{ id: string; name: string }>) {
  return { tournament: "Genesis Scottish Open", tournamentId: "R2026541", validated: true, playerDetails };
}

function context(historyPayload: unknown, participantPayload: unknown) {
  return {
    historyLookup: buildHistoryLookup(historyPayload),
    historyIndex: buildHistoryIndex(historyPayload),
    participantLookup: buildParticipantLookup(participantPayload),
  };
}

describe("unified PGA player identity resolution", () => {
  it("resolves Keita Nakajima from current-field.json.playerDetails to canonical ID 49228", () => {
    const before = history([]);
    const field = currentField([{ id: "49228", name: "Keita Nakajima" }]);
    const result = resolveUnifiedIdentity("Keita Nakajima", context(before, field));
    expect(result).toMatchObject({ status: "resolved", playerId: "49228", source: "participant-field", isNewPlayer: true });
  });

  it("resolves an exact official-field match when history has no record", () => {
    const before = history([]);
    const field = currentField([{ id: "1", name: "Rookie Player" }]);
    const result = resolveUnifiedIdentity("Rookie Player", context(before, field));
    expect(result).toMatchObject({ status: "resolved", playerId: "1", resolutionMethod: "participant-exact" });
  });

  it("resolves a canonical normalized official-field match (accents, punctuation, suffixes)", () => {
    const before = history([]);
    const field = currentField([{ id: "2", name: "Ludvig Aberg" }]);
    const result = resolveUnifiedIdentity("Ludvig Åberg", context(before, field));
    expect(result).toMatchObject({ status: "resolved", playerId: "2", resolutionMethod: "participant-canonical" });
  });

  it("resolves an alias-based official-field match", () => {
    const before = history([]);
    const field = currentField([{ id: "3", name: "Matt McCarty" }]);
    const result = resolveUnifiedIdentity("Matthew McCarty", context(before, field));
    expect(result).toMatchObject({ status: "resolved", playerId: "3", resolutionMethod: "participant-alias" });
  });

  it("rejects ambiguous official-field matches instead of guessing", () => {
    const before = history([]);
    const field = currentField([
      { id: "4", name: "Sam A. Smith" },
      { id: "5", name: "Sam A Smith" },
    ]);
    const result = resolveUnifiedIdentity("Sam A.Smith", context(before, field));
    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe("IDENTITY_UNRESOLVED");
  });

  it("prefers an existing history ID when the official field agrees", () => {
    const before = history([{ player: "Jon Rahm", playerId: "111" }]);
    const field = currentField([{ id: "111", name: "Jon Rahm" }]);
    const result = resolveUnifiedIdentity("Jon Rahm", context(before, field));
    expect(result).toMatchObject({ status: "resolved", playerId: "111", source: "history", isNewPlayer: false });
    expect(result.resolutionMethod).toMatch(/^history-/);
  });

  it("fails safely when history and the official field disagree on a player's ID", () => {
    const before = history([{ player: "Jon Rahm", playerId: "111" }]);
    const field = currentField([{ id: "222", name: "Jon Rahm" }]);
    const result = resolveUnifiedIdentity("Jon Rahm", context(before, field));
    expect(result).toMatchObject({ status: "failed", errorCode: "IDENTITY_CONFLICT" });
  });

  it("resolves through the official field by ID when the player already exists in history under a different name", () => {
    const before = history([{ player: "Keita Nakajima (Amateur)", playerId: "49228" }]);
    const field = currentField([{ id: "49228", name: "Keita Nakajima" }]);
    const result = resolveUnifiedIdentity("Keita Nakajima", context(before, field));
    expect(result).toMatchObject({ status: "resolved", playerId: "49228", player: "Keita Nakajima (Amateur)", isNewPlayer: false });
  });

  it("bootstraps a successful new player exactly once and reruns do not duplicate", () => {
    const before = history([{ player: "Scottie Scheffler", playerId: "46046" }]);
    const field = currentField([{ id: "49228", name: "Keita Nakajima" }]);
    const resolved = resolveScopeUnified(["Keita Nakajima"], before, field);
    expect(resolved).toMatchObject([{ status: "resolved", playerId: "49228", isNewPlayer: true }]);

    const successResult = { status: "success", scopeName: "Keita Nakajima", player: "Keita Nakajima", playerId: "49228", resolutionMethod: "participant-exact", results: [] };
    const firstRun = mergePartialScopedHistory(before, [successResult], { asOfDate: "2026-07-13" });
    expect(firstRun.payload.players.map((player: { player: string }) => player.player)).toEqual(["Scottie Scheffler", "Keita Nakajima"]);

    const secondResolved = resolveScopeUnified(["Keita Nakajima"], firstRun.payload, field);
    expect(secondResolved).toMatchObject([{ status: "resolved", playerId: "49228", source: "history", isNewPlayer: false }]);

    const secondRun = mergePartialScopedHistory(firstRun.payload, [{ ...successResult, results: [] }], { asOfDate: "2026-07-13" });
    const keitaRecords = secondRun.payload.players.filter((player: { playerId: string }) => player.playerId === "49228");
    expect(keitaRecords).toHaveLength(1);
  });

  it("rejects duplicate resolved IDs within the same scope", () => {
    const before = history([]);
    const field = currentField([{ id: "6", name: "Duplicate Player" }]);
    const resolved = resolveScopeUnified(["Duplicate Player", "Duplicate Player"], before, field);
    expect(resolved[0].status).toBe("resolved");
    expect(resolved[1]).toMatchObject({ status: "failed", errorCode: "DUPLICATE_RESOLVED_ID" });
  });
});
