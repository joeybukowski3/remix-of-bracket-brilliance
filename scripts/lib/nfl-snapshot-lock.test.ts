import { describe, expect, it } from "vitest";
import { canCreatePregameSnapshot, isPregameStreamLocked } from "./nfl-snapshot-lock";
import { FIXTURE_POST_KICKOFF_ATTEMPT, FIXTURE_SNAPSHOT_KICKOFF_UTC } from "./__fixtures__/nfl-snapshot-fixtures";

describe("isPregameStreamLocked", () => {
  it("is unlocked before kickoff", () => {
    expect(isPregameStreamLocked(FIXTURE_SNAPSHOT_KICKOFF_UTC, () => new Date("2026-09-12T00:00:00.000Z"))).toBe(false);
  });

  it("is locked at or after kickoff", () => {
    expect(isPregameStreamLocked(FIXTURE_SNAPSHOT_KICKOFF_UTC, () => new Date(FIXTURE_SNAPSHOT_KICKOFF_UTC))).toBe(true);
    expect(isPregameStreamLocked(FIXTURE_SNAPSHOT_KICKOFF_UTC, () => new Date("2026-09-13T19:00:00.000Z"))).toBe(true);
  });
});

describe("canCreatePregameSnapshot", () => {
  it("allows a snapshot whose researchCutoff is before kickoff and the stream is not yet locked", () => {
    const result = canCreatePregameSnapshot({
      kickoffUtc: FIXTURE_SNAPSHOT_KICKOFF_UTC,
      researchCutoff: "2026-09-11T11:00:00.000Z",
      snapshotType: "daily_update",
      now: () => new Date("2026-09-11T12:00:00.000Z"),
    });
    expect(result.ok).toBe(true);
  });

  it("20. rejects creation once the stream is locked (now >= kickoff), regardless of snapshotType", () => {
    const result = canCreatePregameSnapshot(FIXTURE_POST_KICKOFF_ATTEMPT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/locked/);
  });

  it("rejects a researchCutoff after kickoff even if 'now' is still before kickoff", () => {
    const result = canCreatePregameSnapshot({
      kickoffUtc: FIXTURE_SNAPSHOT_KICKOFF_UTC,
      researchCutoff: "2026-09-13T18:00:00.000Z", // after kickoff
      snapshotType: "gameday",
      now: () => new Date("2026-09-13T16:00:00.000Z"), // before kickoff
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/after kickoff/);
  });

  it("21. supports a final 'gameday' pregame snapshot right up to (but not after) kickoff", () => {
    const result = canCreatePregameSnapshot({
      kickoffUtc: FIXTURE_SNAPSHOT_KICKOFF_UTC,
      researchCutoff: "2026-09-13T16:45:00.000Z",
      snapshotType: "gameday",
      now: () => new Date("2026-09-13T16:50:00.000Z"),
    });
    expect(result.ok).toBe(true);
  });
});
