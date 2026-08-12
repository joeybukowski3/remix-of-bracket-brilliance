import { describe, expect, it } from "vitest";
import { buildDailyNumerologyCard, buildTrackingRecordsFromCard, mergePerformanceRecords } from "./mlb-numerology-tracking.mjs";

function rawPayload(overrides = {}) {
  return {
    date: "2026-08-12",
    generatedAt: "2026-08-12T08:00:00.000Z",
    methodologyVersion: "3.0.0",
    exactNumberMatches: [
      { playerName: "Player One", playerId: 111, team: "NYY", opponent: "BOS", gameId: 500, numerologyScore: 62, matches: [{ field: "jersey", label: "Jersey #12", points: 10 }] },
    ],
    rootNumberMatches: [
      { playerName: "Player Two", playerId: 222, team: "LAD", opponent: "SD", gameId: 501, numerologyScore: 55, matches: [{ field: "birthDay", label: "Born on 12", points: 8 }] },
    ],
    ...overrides,
  };
}

describe("buildTrackingRecordsFromCard + mergePerformanceRecords (generation persistence)", () => {
  it("persists new performance records from a freshly generated board", () => {
    const card = buildDailyNumerologyCard(rawPayload(), { date: "2026-08-12" });
    const incoming = buildTrackingRecordsFromCard(card);
    expect(incoming.length).toBeGreaterThan(0);

    const merged = mergePerformanceRecords({ records: [] }, incoming);
    expect(merged.records.length).toBe(incoming.length);
    expect(merged.records.every((r) => r.date === "2026-08-12")).toBe(true);
  });

  it("repeated same-day generation is idempotent (no duplicate records)", () => {
    const card = buildDailyNumerologyCard(rawPayload(), { date: "2026-08-12" });
    const incoming = buildTrackingRecordsFromCard(card);

    const firstPass = mergePerformanceRecords({ records: [] }, incoming);
    const secondPass = mergePerformanceRecords(firstPass, incoming);

    expect(secondPass.records.length).toBe(firstPass.records.length);
    const ids = secondPass.records.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("a lineup-confirmed refresh later the same day updates the still-pending record instead of duplicating it", () => {
    const morningCard = buildDailyNumerologyCard(rawPayload(), { date: "2026-08-12", generatedAt: "2026-08-12T08:00:00.000Z" });
    const morningRecords = buildTrackingRecordsFromCard(morningCard);
    const afterMorning = mergePerformanceRecords({ records: [] }, morningRecords);

    // Simulate the lineup-confirmed pass: same players, updated battingOrder/lineupStatus in the raw board.
    const confirmedPayload = rawPayload();
    confirmedPayload.exactNumberMatches[0].lineupStatus = "confirmed";
    confirmedPayload.exactNumberMatches[0].battingOrder = 3;
    const confirmedCard = buildDailyNumerologyCard(confirmedPayload, { date: "2026-08-12", generatedAt: "2026-08-12T18:00:00.000Z" });
    const confirmedRecords = buildTrackingRecordsFromCard(confirmedCard);
    const afterConfirmed = mergePerformanceRecords(afterMorning, confirmedRecords);

    expect(afterConfirmed.records.length).toBe(afterMorning.records.length);
  });

  it("does not overwrite an already-graded record on a later rerun", () => {
    const card = buildDailyNumerologyCard(rawPayload(), { date: "2026-08-12" });
    const incoming = buildTrackingRecordsFromCard(card);
    const graded = mergePerformanceRecords({ records: [] }, incoming);
    // Mark one record as already graded.
    graded.records[0].resultStatus = "final";
    graded.records[0].hitHomeRun = true;

    const rerun = mergePerformanceRecords(graded, incoming);
    const stillGraded = rerun.records.find((r) => r.id === graded.records[0].id);
    expect(stillGraded.resultStatus).toBe("final");
    expect(stillGraded.hitHomeRun).toBe(true);
  });
});
