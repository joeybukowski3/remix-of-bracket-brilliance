import { describe, expect, it } from "vitest";
import { joinNflBettingSplitToGame } from "../nfl/bettingSplitsGameJoin";
import { safeParseBettingSplitSnapshot } from "./bettingSplitsSchema";
import { nflGame, providerSplit } from "./__fixtures__/bettingSplitsGameJoinFixtures";

describe("shared betting-splits canonical game join", () => {
  it("uses an existing verified crosswalk before an otherwise ambiguous schedule match", () => {
    const games = [
      nflGame({ gameId: "2026_01_NE_SEA_A" }),
      nflGame({ gameId: "2026_01_NE_SEA_B" }),
    ];
    const result = joinNflBettingSplitToGame(providerSplit(), games, {
      crosswalks: [{
        league: "nfl",
        provider: "fixture-provider",
        providerGameId: "provider-game-1",
        jkbGameId: "2026_01_NE_SEA_B",
      }],
    });

    expect(result.status).toBe("matched");
    expect(result.status === "matched" && result.snapshot.jkbGameId).toBe("2026_01_NE_SEA_B");
    expect(result.evidence.usedCrosswalk).toBe(true);
  });

  it.each([
    ["provider", { provider: "another-provider", league: "nfl" as const }],
    ["league", { provider: "fixture-provider", league: "cfb" as const }],
  ])("isolates crosswalk lookup by %s", (_label, identity) => {
    const result = joinNflBettingSplitToGame(providerSplit(), [nflGame()], {
      crosswalks: [{
        ...identity,
        providerGameId: "provider-game-1",
        jkbGameId: "missing-target",
      }],
    });
    expect(result.status).toBe("matched");
    expect(result.evidence.usedCrosswalk).toBe(false);
  });

  it("rejects a stale crosswalk whose target is absent", () => {
    const result = joinNflBettingSplitToGame(providerSplit(), [nflGame()], {
      crosswalks: [{
        league: "nfl",
        provider: "fixture-provider",
        providerGameId: "provider-game-1",
        jkbGameId: "missing-target",
      }],
    });
    expect(result).toMatchObject({ status: "rejected", reason: "CROSSWALK_TARGET_NOT_FOUND" });
  });

  it("rejects a crosswalk target that is structurally incompatible", () => {
    const result = joinNflBettingSplitToGame(providerSplit(), [nflGame({ season: 2025 })], {
      crosswalks: [{
        league: "nfl",
        provider: "fixture-provider",
        providerGameId: "provider-game-1",
        jkbGameId: "2026_01_NE_SEA",
      }],
    });
    expect(result).toMatchObject({ status: "rejected", reason: "CROSSWALK_IDENTITY_MISMATCH" });
  });

  it("emits a future-persistence crosswalk candidate after an inferred match", () => {
    const result = joinNflBettingSplitToGame(providerSplit(), [nflGame()]);
    expect(result.status).toBe("matched");
    expect(result.status === "matched" && result.crosswalkCandidate).toEqual({
      league: "nfl",
      provider: "fixture-provider",
      providerGameId: "provider-game-1",
      jkbGameId: "2026_01_NE_SEA",
    });
  });

  it("returns unmatched for zero candidates and ambiguous for multiple candidates", () => {
    const unmatched = joinNflBettingSplitToGame(providerSplit(), [
      nflGame({ awayAbbr: "dal", homeAbbr: "phi" }),
    ]);
    expect(unmatched).toMatchObject({ status: "unmatched", reason: "UNMATCHED_GAME" });

    const ambiguous = joinNflBettingSplitToGame(providerSplit(), [
      nflGame({ gameId: "z-game" }),
      nflGame({ gameId: "a-game" }),
    ]);
    expect(ambiguous).toMatchObject({
      status: "ambiguous",
      reason: "AMBIGUOUS_GAME",
      candidateGameIds: ["a-game", "z-game"],
    });
  });

  it.each([
    ["exact", "2026-09-13T20:25:00.000Z", "matched"],
    ["small drift", "2026-09-13T22:25:00.000Z", "matched"],
    ["edge inclusive", "2026-09-14T02:25:00.000Z", "matched"],
    ["outside", "2026-09-14T02:25:00.001Z", "unmatched"],
  ])("applies the explicit six-hour kickoff tolerance: %s", (_label, kickoffUtc, status) => {
    const result = joinNflBettingSplitToGame(providerSplit({ kickoffUtc }), [nflGame()]);
    expect(result.status).toBe(status);
    if (status === "unmatched") {
      expect(result).toMatchObject({ reason: "KICKOFF_OUTSIDE_TOLERANCE" });
    }
  });

  it("fails a season mismatch closed", () => {
    const result = joinNflBettingSplitToGame(providerSplit({ season: 2025 }), [nflGame()]);
    expect(result).toMatchObject({ status: "unmatched", reason: "UNMATCHED_GAME" });
  });

  it("allows a provider week mismatch while recording it and using canonical week", () => {
    const result = joinNflBettingSplitToGame(providerSplit({ week: 2 }), [nflGame({ week: 1 })]);
    expect(result.status).toBe("matched");
    if (result.status !== "matched") return;
    expect(result.snapshot.week).toBe(1);
    expect(result.evidence.weekMismatch).toBe(true);
  });

  it("constructs a WU1-valid snapshot while preserving source fields and generating no hash", () => {
    const input = providerSplit();
    const result = joinNflBettingSplitToGame(input, [nflGame()]);
    expect(result.status).toBe("matched");
    if (result.status !== "matched") return;
    expect(safeParseBettingSplitSnapshot(result.snapshot).success).toBe(true);
    expect(result.snapshot).toMatchObject({
      provider: input.provider,
      providerGameId: input.providerGameId,
      sportsbook: input.sportsbook,
      capturedAt: input.capturedAt,
      providerCreatedAt: input.providerCreatedAt,
      providerLastSeenAt: input.providerLastSeenAt,
      spread: input.spread,
      total: input.total,
      moneyline: input.moneyline,
      contentHash: null,
      firstObservedAt: input.capturedAt,
      lastObservedAt: input.capturedAt,
    });
  });

  it("returns INVALID_FINAL_SNAPSHOT rather than throwing", () => {
    const result = joinNflBettingSplitToGame(providerSplit({ capturedAt: "not-a-timestamp" }), [nflGame()]);
    expect(result).toMatchObject({ status: "rejected", reason: "INVALID_FINAL_SNAPSHOT" });
  });

  it("is deterministic when schedule ordering changes", () => {
    const games = [nflGame({ gameId: "z-game" }), nflGame({ gameId: "a-game" })];
    const forward = joinNflBettingSplitToGame(providerSplit(), games);
    const reverse = joinNflBettingSplitToGame(providerSplit(), [...games].reverse());
    expect(reverse).toEqual(forward);
  });

  it("rejects duplicate canonical game IDs instead of depending on schedule order", () => {
    const result = joinNflBettingSplitToGame(providerSplit(), [nflGame(), nflGame()]);
    expect(result).toMatchObject({
      status: "rejected",
      reason: "DUPLICATE_CANONICAL_GAME_ID",
    });
  });
});
