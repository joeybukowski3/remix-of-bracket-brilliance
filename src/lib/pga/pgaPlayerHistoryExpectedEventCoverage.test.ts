import { describe, expect, it } from "vitest";
// @ts-expect-error The production refresh helper is an intentional Node ESM module.
import {
  MIN_EXPECTED_EVENT_COVERAGE,
  assertExpectedEventCoverage,
  mergePartialScopedHistory,
  partitionExpectedEventCoverage,
  validateScopedRefresh,
} from "../../../scripts/lib/pga-player-history-refresh.mjs";
// @ts-expect-error The production metadata helper is an intentional Node ESM module.
import { mergeRefreshMetadata, toPublicFailure } from "../../../scripts/lib/pga-player-history-metadata.mjs";

const EVENT_ID = "R2026013";
const EVENT_DATE = "2026-08-09";
const AS_OF_DATE = "2026-08-10";

function history(players: unknown[]) {
  return { version: 1, source: "pga-tour-player-profile-results", generatedAt: "2026-07-13T00:00:00.000Z", startYear: 2016, players, errors: [] };
}

function player(name: string, id: string, recentResults: unknown[] = []) {
  return { player: name, playerId: id, sourcePlayerName: name, recentResults, eventHistory: {} };
}

function wyndham(finishText: string) {
  return {
    season: 2026,
    eventId: EVENT_ID,
    eventSlug: "wyndham-championship",
    eventName: "Wyndham Championship",
    courseName: "Sedgefield Country Club",
    eventDate: EVENT_DATE,
    majorType: null,
    finishText,
    finishPosition: Number(finishText.replace(/\D/g, "")) || null,
    madeCut: true,
    status: "finished",
  };
}

function success(name: string, id: string, results: unknown[]) {
  return { status: "success", scopeName: name, player: name, playerId: id, resolutionMethod: "history-exact", results, requestSource: "api" };
}

function expectedEvent(requiredParticipantIds: string[]) {
  return {
    eventId: EVENT_ID,
    eventName: "Wyndham Championship",
    eventDate: EVENT_DATE,
    season: 2026,
    asOfDate: AS_OF_DATE,
    maxAgeDays: 14,
    requiredParticipantIds,
  };
}

function buildPool(count: number, missingIds: string[]) {
  const missing = new Set(missingIds.map(String));
  const before = history([]);
  const results: unknown[] = [];
  const players: unknown[] = [];
  const ids: string[] = [];
  for (let index = 1; index <= count; index += 1) {
    const id = String(index);
    const name = `Player ${index}`;
    ids.push(id);
    players.push(player(name, id));
    results.push(missing.has(id) ? success(name, id, []) : success(name, id, [wyndham("T20")]));
  }
  return { before: history(players), results, ids };
}

describe("expected-event coverage partition (isolated missing result continues)", () => {
  it("reclassifies one missing expected event as a player failure with a warning while coverage stays at 90%", () => {
    const { before, results, ids } = buildPool(10, ["10"]);
    const event = expectedEvent(ids);

    const partitioned = partitionExpectedEventCoverage(results, { requiredParticipantIds: ids, expectedEvent: event });
    expect(partitioned.coverage).toBe(MIN_EXPECTED_EVENT_COVERAGE);
    expect(partitioned.successResults).toHaveLength(9);
    expect(partitioned.expectedEventFailures).toHaveLength(1);
    expect(partitioned.expectedEventFailures[0]).toMatchObject({
      status: "failed",
      player: "Player 10",
      playerId: "10",
      stage: "expected-event-validation",
      errorCode: "EXPECTED_EVENT_MISSING",
    });
    expect(() => assertExpectedEventCoverage(partitioned, EVENT_ID)).not.toThrow();

    const publicFailure = toPublicFailure(partitioned.expectedEventFailures[0]);
    expect(publicFailure.message).toBe("A completed-event result is missing from this player's refreshed history.");

    const merged = mergePartialScopedHistory(before, partitioned.successResults, {
      asOfDate: AS_OF_DATE,
      allowedEventIdentities: [`2026:${EVENT_ID}`],
    });
    expect(merged.successPlayerIds).not.toContain("10");
    expect(merged.payload.players.find((p: { playerId: string }) => p.playerId === "10")).toEqual(player("Player 10", "10"));
    expect(() => validateScopedRefresh(before, merged.payload, {
      scopePlayerIds: merged.successPlayerIds,
      refreshedByPlayerId: new Map(partitioned.successResults.map((result) => [String(result.playerId), result.results])),
      expectedEvent: event,
    })).not.toThrow();

    const metadata = mergeRefreshMetadata(null, {
      attemptedAt: `${AS_OF_DATE}T12:00:00.000Z`,
      asOfDate: AS_OF_DATE,
      scopeKeys: [...merged.successPlayerIds, ...partitioned.expectedEventFailures.map((failure) => String(failure.playerId))],
      failedPlayers: partitioned.expectedEventFailures.map(toPublicFailure),
      cacheHitCount: 0,
      requestCount: 9,
    });
    expect(metadata).toMatchObject({ scopeCount: 10, successCount: 9, failureCount: 1, status: "partial" });
  });

  it("succeeds when usable coverage is at or above 90%", () => {
    const { results, ids } = buildPool(20, ["20"]);
    const partitioned = partitionExpectedEventCoverage(results, { requiredParticipantIds: ids, expectedEvent: expectedEvent(ids) });

    expect(partitioned.covered).toBe(19);
    expect(partitioned.missing).toBe(1);
    expect(partitioned.required).toBe(20);
    expect(partitioned.coverage).toBeGreaterThanOrEqual(MIN_EXPECTED_EVENT_COVERAGE);
    expect(() => assertExpectedEventCoverage(partitioned, EVENT_ID)).not.toThrow();
  });

  it("fails the run when usable coverage drops below 90%", () => {
    const { results, ids } = buildPool(20, ["18", "19", "20"]);
    const partitioned = partitionExpectedEventCoverage(results, { requiredParticipantIds: ids, expectedEvent: expectedEvent(ids) });

    expect(partitioned.covered).toBe(17);
    expect(partitioned.missing).toBe(3);
    expect(partitioned.coverage).toBe(0.85);
    expect(partitioned.coverage).toBeLessThan(MIN_EXPECTED_EVENT_COVERAGE);
    expect(() => assertExpectedEventCoverage(partitioned, EVENT_ID)).toThrow(/coverage/);
  });

  it("ignores the expected event when it is not supplied (targeted rerun)", () => {
    const { results, ids } = buildPool(3, ["3"]);
    const partitioned = partitionExpectedEventCoverage(results, { requiredParticipantIds: ids, expectedEvent: null });

    expect(partitioned.expectedEventFailures).toHaveLength(0);
    expect(partitioned.successResults).toHaveLength(3);
    expect(partitioned.coverage).toBe(1);
    expect(() => assertExpectedEventCoverage(partitioned, EVENT_ID)).not.toThrow();
  });
});
