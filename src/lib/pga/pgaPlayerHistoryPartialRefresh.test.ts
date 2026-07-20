import { describe, expect, it } from "vitest";
// @ts-expect-error The production refresh helper is an intentional Node ESM module.
import {
  mergePartialScopedHistory,
  refreshScopedPlayer,
  validateScopedRefresh,
} from "../../../scripts/lib/pga-player-history-refresh.mjs";
// @ts-expect-error The production metadata helper is an intentional Node ESM module.
import { mergeRefreshMetadata, resolveMetadataForWrite, toPublicFailure } from "../../../scripts/lib/pga-player-history-metadata.mjs";

function history(players: unknown[]) {
  return { version: 1, source: "pga-tour-player-profile-results", generatedAt: "2026-07-13T00:00:00.000Z", startYear: 2016, players, errors: [] };
}

function player(name: string, id: string, recentResults: unknown[] = []) {
  return { player: name, playerId: id, sourcePlayerName: name, recentResults, eventHistory: {} };
}

function scottish(finishText: string) {
  return {
    season: 2026,
    eventId: "R2026541",
    eventSlug: "genesis-scottish-open",
    eventName: "Genesis Scottish Open",
    courseName: "The Renaissance Club",
    eventDate: "2026-07-12",
    majorType: null,
    finishText,
    finishPosition: Number(finishText.replace(/\D/g, "")) || null,
    madeCut: true,
    status: "finished",
  };
}

describe("per-player fault isolation (refreshScopedPlayer)", () => {
  it("turns a fetch rejection into a failed result instead of throwing", async () => {
    const result = await refreshScopedPlayer(
      { scopeName: "Keita Nakajima", player: "Keita Nakajima", playerId: "49228", resolutionMethod: "participant-exact" },
      { fetchProfile: async () => { throw new Error("network unreachable"); }, startYear: 2016 },
    );
    expect(result).toMatchObject({ status: "failed", stage: "history-fetch", errorCode: "PGA_HISTORY_FETCH_FAILED", playerId: "49228" });
  });

  it("classifies a structurally malformed GraphQL response as response-normalization", async () => {
    const result = await refreshScopedPlayer(
      { scopeName: "Keita Nakajima", player: "Keita Nakajima", playerId: "49228", resolutionMethod: "participant-exact" },
      { fetchProfile: async () => ({ data: { unexpected: true }, requestSource: "api" }), startYear: 2016 },
    );
    expect(result).toMatchObject({ status: "failed", stage: "response-normalization", errorCode: "PGA_MALFORMED_RESPONSE" });
  });

  it("returns a success result for a well-formed response, including cache-hit request source", async () => {
    const result = await refreshScopedPlayer(
      { scopeName: "Scottie Scheffler", player: "Scottie Scheffler", playerId: "46046", resolutionMethod: "history-exact" },
      { fetchProfile: async () => ({ data: { playerProfileTournamentResults: { tournaments: [] } }, requestSource: "cache" }), startYear: 2016 },
    );
    expect(result).toMatchObject({ status: "success", requestSource: "cache", results: [] });
  });
});

describe("partial merge (mergePartialScopedHistory)", () => {
  it("applies successes and silently leaves failed players untouched by never receiving them", () => {
    const before = history([player("Scottie Scheffler", "46046"), player("Rory McIlroy", "2222")]);
    const merged = mergePartialScopedHistory(before, [
      { status: "success", player: "Scottie Scheffler", playerId: "46046", results: [scottish("T4")] },
    ], { asOfDate: "2026-07-13" });
    expect(merged.successPlayerIds).toEqual(["46046"]);
    const rory = merged.payload.players.find((p: { playerId: string }) => p.playerId === "2222");
    expect(rory).toEqual(player("Rory McIlroy", "2222"));
  });

  it("bootstraps a new player with an empty starter record and appends after existing players", () => {
    const before = history([player("Scottie Scheffler", "46046")]);
    const merged = mergePartialScopedHistory(before, [
      { status: "success", player: "Keita Nakajima", playerId: "49228", results: [] },
    ], { asOfDate: "2026-07-13" });
    expect(merged.payload.players).toHaveLength(2);
    expect(merged.payload.players[1]).toMatchObject({ player: "Keita Nakajima", playerId: "49228", recentResults: [], eventHistory: {} });
  });
});

describe("validateScopedRefresh allows bootstrap and preserves failed players", () => {
  it("accepts a grown roster when the new player is in the success scope, appended and alphabetical", () => {
    const before = history([player("Zach Zed", "9")]);
    const after = history([player("Zach Zed", "9"), player("Amy Alpha", "10"), player("Beth Beta", "11")]);
    expect(() => validateScopedRefresh(before, after, {
      scopePlayerIds: ["10", "11"],
      refreshedByPlayerId: new Map(),
      expectedEvent: null,
    })).not.toThrow();
  });

  it("rejects a new player who was not part of the successful scope", () => {
    const before = history([player("Zach Zed", "9")]);
    const after = history([player("Zach Zed", "9"), player("Sneaky Player", "99")]);
    expect(() => validateScopedRefresh(before, after, {
      scopePlayerIds: [],
      refreshedByPlayerId: new Map(),
      expectedEvent: null,
    })).toThrow(/without a successful scoped refresh/);
  });

  it("requires a failed existing player to remain byte-identical", () => {
    const before = history([player("Failed Player", "50", [scottish("T4")])]);
    const tampered = history([player("Failed Player", "50", [])]);
    expect(() => validateScopedRefresh(before, tampered, {
      scopePlayerIds: [],
      refreshedByPlayerId: new Map(),
      expectedEvent: null,
    })).toThrow(/Out-of-scope or failed player/);
  });

  it("rejects a duplicate canonical player identity with a different ID", () => {
    const before = history([player("Sam Player", "60")]);
    const after = history([player("Sam Player", "60"), player("Sam Player", "61")]);
    expect(() => validateScopedRefresh(before, after, {
      scopePlayerIds: ["61"],
      refreshedByPlayerId: new Map(),
      expectedEvent: null,
    })).toThrow(/Duplicate canonical player identity/);
  });
});

describe("refresh metadata merge and clearing (Part 5/6)", () => {
  it("computes scopeCount/successCount/failureCount for a first full-field run", () => {
    const failed = toPublicFailure({ player: "Keita Nakajima", playerId: "49228", stage: "history-fetch", errorCode: "PGA_HISTORY_FETCH_FAILED", message: "boom" });
    const metadata = mergeRefreshMetadata(null, {
      attemptedAt: "2026-07-20T12:34:00.000Z",
      asOfDate: "2026-07-20",
      scopeKeys: [...Array.from({ length: 155 }, (_, index) => String(index + 1)), "49228"],
      failedPlayers: [failed],
      cacheHitCount: 0,
      requestCount: 155,
    });
    expect(metadata).toMatchObject({ scopeCount: 156, successCount: 155, failureCount: 1, status: "partial" });
    expect(metadata.failedPlayers).toEqual([{ player: "Keita Nakajima", playerId: "49228", stage: "history-fetch", errorCode: "PGA_HISTORY_FETCH_FAILED", message: "Recent player history could not be refreshed." }]);
  });

  it("clears a player from failedPlayers after a successful targeted rerun and recomputes status to complete when no failures remain", () => {
    const previous = mergeRefreshMetadata(null, {
      attemptedAt: "2026-07-20T12:34:00.000Z",
      asOfDate: "2026-07-20",
      scopeKeys: ["1", "49228"],
      failedPlayers: [toPublicFailure({ player: "Keita Nakajima", playerId: "49228", stage: "history-fetch", errorCode: "PGA_HISTORY_FETCH_FAILED", message: "boom" })],
      cacheHitCount: 0,
      requestCount: 1,
    });
    const rerun = mergeRefreshMetadata(previous, {
      attemptedAt: "2026-07-21T09:00:00.000Z",
      asOfDate: "2026-07-20",
      scopeKeys: ["49228"],
      failedPlayers: [],
      cacheHitCount: 0,
      requestCount: 1,
    });
    expect(rerun).toMatchObject({ scopeCount: 2, successCount: 2, failureCount: 0, status: "complete" });
    expect(rerun.failedPlayers).toEqual([]);
  });

  it("does not falsely claim a whole field complete: a targeted rerun preserves unrelated outstanding failures", () => {
    const previous = mergeRefreshMetadata(null, {
      attemptedAt: "2026-07-20T12:34:00.000Z",
      asOfDate: "2026-07-20",
      scopeKeys: ["1", "49228", "77"],
      failedPlayers: [
        toPublicFailure({ player: "Keita Nakajima", playerId: "49228", stage: "history-fetch", errorCode: "PGA_HISTORY_FETCH_FAILED", message: "boom" }),
        toPublicFailure({ player: "Other Player", playerId: "77", stage: "history-fetch", errorCode: "PGA_HISTORY_FETCH_FAILED", message: "boom" }),
      ],
      cacheHitCount: 0,
      requestCount: 1,
    });
    const targetedRerun = mergeRefreshMetadata(previous, {
      attemptedAt: "2026-07-21T09:00:00.000Z",
      asOfDate: "2026-07-20",
      scopeKeys: ["49228"],
      failedPlayers: [],
      cacheHitCount: 0,
      requestCount: 1,
    });
    expect(targetedRerun.status).not.toBe("complete");
    expect(targetedRerun).toMatchObject({ scopeCount: 3, successCount: 2, failureCount: 1 });
    expect(targetedRerun.failedPlayers.map((f: { player: string }) => f.player)).toEqual(["Other Player"]);
  });

  it("reports status failed when a full run resolves zero players successfully", () => {
    const metadata = mergeRefreshMetadata(null, {
      attemptedAt: "2026-07-20T12:34:00.000Z",
      asOfDate: "2026-07-20",
      scopeKeys: ["1"],
      failedPlayers: [toPublicFailure({ player: "Only Player", playerId: "1", stage: "history-fetch", errorCode: "PGA_HISTORY_FETCH_FAILED", message: "boom" })],
      cacheHitCount: 0,
      requestCount: 1,
    });
    expect(metadata.status).toBe("failed");
  });

  it("sanitizes public failure messages instead of leaking raw error detail", () => {
    const failed = toPublicFailure({ player: "Keita Nakajima", playerId: "49228", stage: "history-fetch", errorCode: "PGA_HISTORY_FETCH_FAILED", message: "x-api-key=super-secret-value leaked in stack trace" });
    expect(failed.message).toBe("Recent player history could not be refreshed.");
    expect(failed.message).not.toContain("secret");
  });

  it("skips a rewrite (keeps the same object) when nothing meaningful changed besides attemptedAt", () => {
    const previous = mergeRefreshMetadata(null, {
      attemptedAt: "2026-07-20T12:34:00.000Z",
      asOfDate: "2026-07-20",
      scopeKeys: ["1"],
      failedPlayers: [],
      cacheHitCount: 0,
      requestCount: 1,
    });
    const candidate = mergeRefreshMetadata(previous, {
      attemptedAt: "2026-07-21T09:00:00.000Z",
      asOfDate: "2026-07-20",
      scopeKeys: ["1"],
      failedPlayers: [],
      cacheHitCount: 0,
      requestCount: 1,
    });
    const resolved = resolveMetadataForWrite(previous, candidate);
    expect(resolved).toBe(previous);
    expect(resolved.attemptedAt).toBe("2026-07-20T12:34:00.000Z");
  });
});
