import { describe, expect, it } from "vitest";
import { createInMemoryBettingSplitPersistence } from "./bettingSplitsPersistence";
import {
  BettingSplitValidationError,
  storeBettingSplitSnapshot,
  upsertBettingProviderGameCrosswalk,
} from "./bettingSplitsStore";
import { buildBettingSplitContentHash } from "./bettingSplitsContentHash";
import { NFL_BETTING_SPLIT_FIXTURE } from "./__fixtures__/bettingSplitsFixtures";
import type { BettingSplitSnapshot } from "./bettingSplitsTypes";
import type { BettingProviderGameCrosswalk } from "./gameJoinTypes";

function snapshot(overrides: Partial<BettingSplitSnapshot> = {}): BettingSplitSnapshot {
  return { ...NFL_BETTING_SPLIT_FIXTURE, contentHash: null, ...overrides };
}

function crosswalk(
  overrides: Partial<BettingProviderGameCrosswalk> = {},
): BettingProviderGameCrosswalk {
  return {
    league: "nfl",
    provider: "actionnetwork",
    providerGameId: "an-1001",
    jkbGameId: "2026_01_NE_SEA",
    ...overrides,
  };
}

describe("storeBettingSplitSnapshot dedup", () => {
  it("14. first state inserts a new observation", async () => {
    const db = createInMemoryBettingSplitPersistence();
    const result = await storeBettingSplitSnapshot(db, snapshot({ capturedAt: "2026-09-10T10:00:00.000Z" }));
    expect(result.action).toBe("inserted");
    expect(db.snapshots).toHaveLength(1);
    expect(db.snapshots[0].firstObservedAt).toBe("2026-09-10T10:00:00.000Z");
    expect(db.snapshots[0].lastObservedAt).toBe("2026-09-10T10:00:00.000Z");
  });

  it("15. identical later state extends lastObservedAt without a new row", async () => {
    const db = createInMemoryBettingSplitPersistence();
    await storeBettingSplitSnapshot(db, snapshot({ capturedAt: "2026-09-10T10:00:00.000Z" }));
    const result = await storeBettingSplitSnapshot(db, snapshot({ capturedAt: "2026-09-10T11:00:00.000Z" }));
    expect(result.action).toBe("extended");
    expect(db.snapshots).toHaveLength(1);
    expect(db.snapshots[0].firstObservedAt).toBe("2026-09-10T10:00:00.000Z");
    expect(db.snapshots[0].lastObservedAt).toBe("2026-09-10T11:00:00.000Z");
  });

  it("16. a changed state inserts a second observation", async () => {
    const db = createInMemoryBettingSplitPersistence();
    await storeBettingSplitSnapshot(db, snapshot({ capturedAt: "2026-09-10T10:00:00.000Z" }));
    const moved = snapshot({
      capturedAt: "2026-09-10T12:00:00.000Z",
      spread: { ...NFL_BETTING_SPLIT_FIXTURE.spread!, currentHomeLine: -8, homeBetPct: 58, awayBetPct: 42 },
    });
    const result = await storeBettingSplitSnapshot(db, moved);
    expect(result.action).toBe("inserted");
    expect(db.snapshots).toHaveLength(2);
    expect(db.snapshots[1].firstObservedAt).toBe("2026-09-10T12:00:00.000Z");
  });

  it("17. the same hash for a different sportsbook does not extend the wrong row", async () => {
    const db = createInMemoryBettingSplitPersistence();
    await storeBettingSplitSnapshot(db, snapshot({ sportsbook: "draftkings" }));
    const result = await storeBettingSplitSnapshot(db, snapshot({ sportsbook: "fanduel" }));
    expect(result.action).toBe("inserted");
    expect(db.snapshots).toHaveLength(2);
  });

  it("18. the same hash for a different provider does not extend the wrong row", async () => {
    const db = createInMemoryBettingSplitPersistence();
    await storeBettingSplitSnapshot(db, snapshot({ provider: "vsin" }));
    const result = await storeBettingSplitSnapshot(db, snapshot({ provider: "actionnetwork" }));
    expect(result.action).toBe("inserted");
    expect(db.snapshots).toHaveLength(2);
  });

  it("16b. A -> B -> A produces three chronological state periods; the final A is a new row", async () => {
    const db = createInMemoryBettingSplitPersistence();
    const stateA = (capturedAt: string): BettingSplitSnapshot =>
      snapshot({ capturedAt, spread: { ...NFL_BETTING_SPLIT_FIXTURE.spread!, currentHomeLine: -6, currentAwayLine: 6 } });
    const stateB = (capturedAt: string): BettingSplitSnapshot =>
      snapshot({ capturedAt, spread: { ...NFL_BETTING_SPLIT_FIXTURE.spread!, currentHomeLine: -6.5, currentAwayLine: 6.5 } });

    const first = await storeBettingSplitSnapshot(db, stateA("2026-09-10T10:00:00.000Z"));
    const middle = await storeBettingSplitSnapshot(db, stateB("2026-09-10T11:00:00.000Z"));
    const last = await storeBettingSplitSnapshot(db, stateA("2026-09-10T12:00:00.000Z"));

    expect([first.action, middle.action, last.action]).toEqual(["inserted", "inserted", "inserted"]);
    expect(db.snapshots).toHaveLength(3);
    // Final A is a distinct row, not an extension of the original A.
    expect(last.snapshotId).not.toBe(first.snapshotId);
    expect(db.snapshots[0].lastObservedAt).toBe("2026-09-10T10:00:00.000Z");
    expect(db.snapshots.map((row) => row.firstObservedAt)).toEqual([
      "2026-09-10T10:00:00.000Z",
      "2026-09-10T11:00:00.000Z",
      "2026-09-10T12:00:00.000Z",
    ]);
    // The two A periods share a content hash but are separate observations.
    expect(db.snapshots[0].contentHash).toBe(db.snapshots[2].contentHash);
    expect(db.snapshots[0].contentHash).not.toBe(db.snapshots[1].contentHash);
  });

  it("19. historical rows remain chronologically usable", async () => {
    const db = createInMemoryBettingSplitPersistence();
    await storeBettingSplitSnapshot(db, snapshot({ capturedAt: "2026-09-10T10:00:00.000Z" }));
    await storeBettingSplitSnapshot(db, snapshot({
      capturedAt: "2026-09-10T12:00:00.000Z",
      spread: { ...NFL_BETTING_SPLIT_FIXTURE.spread!, currentHomeLine: -8 },
    }));
    const times = db.snapshots.map((row) => Date.parse(row.firstObservedAt));
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("26. a missing contentHash is generated from canonical state", async () => {
    const db = createInMemoryBettingSplitPersistence();
    const result = await storeBettingSplitSnapshot(db, snapshot({ contentHash: null }));
    expect(result.contentHash).toBe(buildBettingSplitContentHash(snapshot()));
    expect(db.snapshots[0].contentHash).toBe(result.contentHash);
  });

  it("27. a caller-supplied incorrect hash is not trusted", async () => {
    const db = createInMemoryBettingSplitPersistence();
    const result = await storeBettingSplitSnapshot(db, snapshot({ contentHash: "deadbeef" }));
    expect(result.contentHash).not.toBe("deadbeef");
    expect(db.snapshots[0].contentHash).toBe(buildBettingSplitContentHash(snapshot()));
  });

  it("25. an invalid snapshot is rejected before any write", async () => {
    const db = createInMemoryBettingSplitPersistence();
    const invalid = { ...snapshot(), season: 1900 } as unknown as BettingSplitSnapshot;
    await expect(storeBettingSplitSnapshot(db, invalid)).rejects.toBeInstanceOf(
      BettingSplitValidationError,
    );
    expect(db.snapshots).toHaveLength(0);
  });
});

describe("upsertBettingProviderGameCrosswalk", () => {
  it("20. a new mapping inserts", async () => {
    const db = createInMemoryBettingSplitPersistence();
    const result = await upsertBettingProviderGameCrosswalk(db, {
      ...crosswalk(),
      verifiedAt: "2026-09-01T00:00:00.000Z",
    });
    expect(result.action).toBe("inserted");
    expect(db.crosswalks).toHaveLength(1);
  });

  it("21. the same mapping is idempotent (verified, no duplicate)", async () => {
    const db = createInMemoryBettingSplitPersistence();
    await upsertBettingProviderGameCrosswalk(db, { ...crosswalk(), verifiedAt: "2026-09-01T00:00:00.000Z" });
    const result = await upsertBettingProviderGameCrosswalk(db, { ...crosswalk(), verifiedAt: "2026-09-02T00:00:00.000Z" });
    expect(result.action).toBe("verified");
    expect(db.crosswalks).toHaveLength(1);
    expect(db.crosswalks[0].firstVerifiedAt).toBe("2026-09-01T00:00:00.000Z");
    expect(db.crosswalks[0].lastVerifiedAt).toBe("2026-09-02T00:00:00.000Z");
  });

  it("22. the same provider event mapped to a different JKB id conflicts and writes nothing", async () => {
    const db = createInMemoryBettingSplitPersistence();
    await upsertBettingProviderGameCrosswalk(db, crosswalk());
    const result = await upsertBettingProviderGameCrosswalk(db, crosswalk({ jkbGameId: "2026_01_DAL_PHI" }));
    expect(result.action).toBe("conflict");
    expect(result.existingJkbGameId).toBe("2026_01_NE_SEA");
    expect(db.crosswalks).toHaveLength(1);
    expect(db.crosswalks[0].jkbGameId).toBe("2026_01_NE_SEA");
  });

  it("23. different providers may reuse the same providerGameId safely", async () => {
    const db = createInMemoryBettingSplitPersistence();
    await upsertBettingProviderGameCrosswalk(db, crosswalk({ provider: "actionnetwork" }));
    const result = await upsertBettingProviderGameCrosswalk(db, crosswalk({ provider: "vsin", jkbGameId: "2026_01_DAL_PHI" }));
    expect(result.action).toBe("inserted");
    expect(db.crosswalks).toHaveLength(2);
  });

  it("24. NFL and CFB identities remain isolated", async () => {
    const db = createInMemoryBettingSplitPersistence();
    await upsertBettingProviderGameCrosswalk(db, crosswalk({ league: "nfl" }));
    const result = await upsertBettingProviderGameCrosswalk(db, crosswalk({ league: "cfb", jkbGameId: "401752123" }));
    expect(result.action).toBe("inserted");
    expect(db.crosswalks).toHaveLength(2);
  });
});
