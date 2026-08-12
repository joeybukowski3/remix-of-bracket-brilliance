import { describe, expect, it } from "vitest";
import { mergeTopHrRecords, summarizeTopHrPerformance } from "./mlb-top-hr-tracking.mjs";

describe("mergeTopHrRecords", () => {
  const baseRecord = (overrides = {}) => ({
    date: "2026-08-12", playerId: 1, gameId: 100, slot: 1, resultStatus: "pending",
    ...overrides,
  });

  it("adds new records that don't exist yet", () => {
    const result = mergeTopHrRecords({ records: [] }, [baseRecord()]);
    expect(result.records).toHaveLength(1);
  });

  it("does not duplicate a record with the same date+playerId+gameId on rerun", () => {
    const existing = { records: [baseRecord()] };
    const result = mergeTopHrRecords(existing, [baseRecord({ slot: 2 })]);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].slot).toBe(2);
  });

  it("never overwrites an already-graded record", () => {
    const existing = { records: [baseRecord({ resultStatus: "hit" })] };
    const result = mergeTopHrRecords(existing, [baseRecord({ resultStatus: "pending" })]);
    expect(result.records[0].resultStatus).toBe("hit");
  });
});

describe("summarizeTopHrPerformance", () => {
  it("computes hit rate and coverage only from graded (hit/miss) records", () => {
    const performanceFile = {
      records: [
        { date: "2026-08-10", resultStatus: "hit", odds: "+300" },
        { date: "2026-08-10", resultStatus: "miss", odds: "+200" },
        { date: "2026-08-11", resultStatus: "pending", odds: "+150" },
      ],
    };
    const summary = summarizeTopHrPerformance(performanceFile, "2026-08-10");
    expect(summary.overall.picks).toBe(3);
    expect(summary.overall.hrHits).toBe(1);
    expect(summary.overall.hrHitRate).toBe(50);
    expect(summary.overall.oddsCoveragePercent).toBe(100);
  });

  it("returns null ROI/rate when nothing is graded yet", () => {
    const summary = summarizeTopHrPerformance({ records: [{ date: "2026-08-12", resultStatus: "pending", odds: null }] }, "2026-08-12");
    expect(summary.overall.hrHitRate).toBeNull();
    expect(summary.overall.flatBetRoi).toBeNull();
  });
});
