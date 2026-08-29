import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createBettingSplitFileStore,
  type BettingSplitFileStore,
} from "./bettingSplitsFileStore";
import { BettingSplitFileStoreError } from "./bettingSplitsFsUtils";
import {
  storeBettingSplitSnapshot,
  upsertBettingProviderGameCrosswalk,
} from "./bettingSplitsStore";
import { buildBettingSplitContentHash } from "./bettingSplitsContentHash";
import {
  CFB_BETTING_SPLIT_FIXTURE,
  NFL_BETTING_SPLIT_FIXTURE,
} from "./__fixtures__/bettingSplitsFixtures";
import type { BettingSplitSnapshot } from "./bettingSplitsTypes";

let rootDir: string;
let store: BettingSplitFileStore;

beforeEach(() => {
  rootDir = mkdtempSync(path.join(tmpdir(), "jkb-betting-splits-store-"));
  store = createBettingSplitFileStore({ rootDir });
});

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true });
});

function nfl(overrides: Partial<BettingSplitSnapshot> = {}): BettingSplitSnapshot {
  return { ...NFL_BETTING_SPLIT_FIXTURE, contentHash: null, ...overrides };
}

const NFL_HISTORY_FILE = path.join(
  "history",
  "nfl",
  "2026",
  "2026_01_NE_SEA.jsonl",
);

function readHistoryLines(relative: string): string[] {
  return readFileSync(path.join(rootDir, relative), "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0);
}

function spreadAt(currentHomeLine: number): BettingSplitSnapshot["spread"] {
  return { ...NFL_BETTING_SPLIT_FIXTURE.spread!, currentHomeLine, currentAwayLine: -currentHomeLine };
}

describe("file snapshot storage", () => {
  it("1. the first snapshot creates the league/season directory and file", async () => {
    await storeBettingSplitSnapshot(store, nfl({ capturedAt: "2026-09-10T10:00:00.000Z" }));
    expect(() => readHistoryLines(NFL_HISTORY_FILE)).not.toThrow();
  });

  it("2. the first snapshot writes exactly one JSONL row", async () => {
    await storeBettingSplitSnapshot(store, nfl({ capturedAt: "2026-09-10T10:00:00.000Z" }));
    expect(readHistoryLines(NFL_HISTORY_FILE)).toHaveLength(1);
  });

  it("3. an identical next state extends lastObservedAt without adding a row", async () => {
    await storeBettingSplitSnapshot(store, nfl({ capturedAt: "2026-09-10T10:00:00.000Z" }));
    const result = await storeBettingSplitSnapshot(
      store,
      nfl({ capturedAt: "2026-09-10T14:00:00.000Z" }),
    );

    expect(result.action).toBe("extended");
    const lines = readHistoryLines(NFL_HISTORY_FILE);
    expect(lines).toHaveLength(1);
    const row = JSON.parse(lines[0]);
    expect(row.firstObservedAt).toBe("2026-09-10T10:00:00.000Z");
    expect(row.lastObservedAt).toBe("2026-09-10T14:00:00.000Z");
  });

  it("4. a changed state appends a second row", async () => {
    await storeBettingSplitSnapshot(store, nfl({ capturedAt: "2026-09-10T10:00:00.000Z" }));
    const result = await storeBettingSplitSnapshot(
      store,
      nfl({ capturedAt: "2026-09-10T12:00:00.000Z", spread: spreadAt(-9) }),
    );

    expect(result.action).toBe("inserted");
    expect(readHistoryLines(NFL_HISTORY_FILE)).toHaveLength(2);
  });

  it("5. A -> B -> A creates three rows", async () => {
    await storeBettingSplitSnapshot(
      store,
      nfl({ capturedAt: "2026-09-10T10:00:00.000Z", spread: spreadAt(-6) }),
    );
    await storeBettingSplitSnapshot(
      store,
      nfl({ capturedAt: "2026-09-10T11:00:00.000Z", spread: spreadAt(-7) }),
    );
    await storeBettingSplitSnapshot(
      store,
      nfl({ capturedAt: "2026-09-10T12:00:00.000Z", spread: spreadAt(-6) }),
    );

    const rows = readHistoryLines(NFL_HISTORY_FILE).map((line) => JSON.parse(line));
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.firstObservedAt)).toEqual([
      "2026-09-10T10:00:00.000Z",
      "2026-09-10T11:00:00.000Z",
      "2026-09-10T12:00:00.000Z",
    ]);
    expect(rows[0].contentHash).toBe(rows[2].contentHash);
    expect(rows[0].contentHash).not.toBe(rows[1].contentHash);
  });

  it("6. the content hash is persisted from canonical market state", async () => {
    await storeBettingSplitSnapshot(store, nfl());
    const row = JSON.parse(readHistoryLines(NFL_HISTORY_FILE)[0]);
    expect(row.contentHash).toBe(buildBettingSplitContentHash(nfl()));
  });

  it("7. a caller-supplied bad content hash is ignored and recomputed", async () => {
    await storeBettingSplitSnapshot(store, nfl({ contentHash: "deadbeef" }));
    const row = JSON.parse(readHistoryLines(NFL_HISTORY_FILE)[0]);
    expect(row.contentHash).toBe(buildBettingSplitContentHash(nfl()));
  });

  it("8. providers are isolated within a game", async () => {
    await storeBettingSplitSnapshot(store, nfl({ provider: "actionnetwork" }));
    const result = await storeBettingSplitSnapshot(store, nfl({ provider: "vsin" }));
    expect(result.action).toBe("inserted");
    expect(readHistoryLines(NFL_HISTORY_FILE)).toHaveLength(2);
  });

  it("9. sportsbooks are isolated within a game", async () => {
    await storeBettingSplitSnapshot(store, nfl({ sportsbook: "draftkings" }));
    const result = await storeBettingSplitSnapshot(store, nfl({ sportsbook: "fanduel" }));
    expect(result.action).toBe("inserted");
    expect(readHistoryLines(NFL_HISTORY_FILE)).toHaveLength(2);
  });

  it("10. NFL and CFB history paths are isolated", async () => {
    await storeBettingSplitSnapshot(store, nfl());
    await storeBettingSplitSnapshot(store, {
      ...CFB_BETTING_SPLIT_FIXTURE,
      contentHash: null,
    });

    expect(readHistoryLines(NFL_HISTORY_FILE)).toHaveLength(1);
    expect(
      readHistoryLines(path.join("history", "cfb", "2026", "401752123.jsonl")),
    ).toHaveLength(1);
  });

  it("11. a malformed JSONL line fails closed with a deterministic error", async () => {
    await storeBettingSplitSnapshot(store, nfl());
    const filePath = path.join(rootDir, NFL_HISTORY_FILE);
    writeFileSync(filePath, `${readFileSync(filePath, "utf8")}not-json\n`);

    await expect(
      store.findLatestSnapshot({
        league: "nfl",
        jkbGameId: "2026_01_NE_SEA",
        provider: NFL_BETTING_SPLIT_FIXTURE.provider,
        sportsbook: NFL_BETTING_SPLIT_FIXTURE.sportsbook,
      }),
    ).rejects.toBeInstanceOf(BettingSplitFileStoreError);
  });

  it("12. a schema-invalid stored row fails closed", async () => {
    await storeBettingSplitSnapshot(store, nfl());
    const filePath = path.join(rootDir, NFL_HISTORY_FILE);
    const row = JSON.parse(readFileSync(filePath, "utf8").trim());
    writeFileSync(filePath, `${JSON.stringify({ ...row, season: 1900 })}\n`);

    await expect(
      store.listSnapshotsForGame({ league: "nfl", season: 2026, jkbGameId: "2026_01_NE_SEA" }),
    ).rejects.toBeInstanceOf(BettingSplitFileStoreError);
  });

  it("13. chronological append order is preserved on disk", async () => {
    for (const [captured, line] of [
      ["2026-09-10T10:00:00.000Z", -6],
      ["2026-09-10T11:00:00.000Z", -7],
      ["2026-09-10T12:00:00.000Z", -8],
    ] as const) {
      await storeBettingSplitSnapshot(store, nfl({ capturedAt: captured, spread: spreadAt(line) }));
    }
    const firstObserved = readHistoryLines(NFL_HISTORY_FILE).map(
      (l) => Date.parse(JSON.parse(l).firstObservedAt),
    );
    expect(firstObserved).toEqual([...firstObserved].sort((a, b) => a - b));
  });

  it("14. the adapter root path is configurable and honored", async () => {
    const otherRoot = mkdtempSync(path.join(tmpdir(), "jkb-betting-splits-alt-"));
    try {
      const otherStore = createBettingSplitFileStore({ rootDir: otherRoot });
      await storeBettingSplitSnapshot(otherStore, nfl());
      expect(() =>
        readFileSync(path.join(otherRoot, NFL_HISTORY_FILE), "utf8"),
      ).not.toThrow();
      expect(() => readFileSync(path.join(rootDir, NFL_HISTORY_FILE), "utf8")).toThrow();
    } finally {
      rmSync(otherRoot, { recursive: true, force: true });
    }
  });

  it("extends the latest row across a fresh store instance (id resolved by scan)", async () => {
    await storeBettingSplitSnapshot(store, nfl({ capturedAt: "2026-09-10T10:00:00.000Z" }));
    const fresh = createBettingSplitFileStore({ rootDir });
    const result = await storeBettingSplitSnapshot(
      fresh,
      nfl({ capturedAt: "2026-09-10T15:00:00.000Z" }),
    );
    expect(result.action).toBe("extended");
    expect(readHistoryLines(NFL_HISTORY_FILE)).toHaveLength(1);
  });
});

describe("crosswalk file", () => {
  const CROSSWALK_FILE = "provider-game-crosswalks.json";

  function readCrosswalk() {
    return JSON.parse(readFileSync(path.join(rootDir, CROSSWALK_FILE), "utf8"));
  }

  it("15. a new crosswalk persists", async () => {
    await upsertBettingProviderGameCrosswalk(store, {
      league: "nfl",
      provider: "actionnetwork",
      providerGameId: "an-1",
      jkbGameId: "2026_01_NE_SEA",
      verifiedAt: "2026-09-01T00:00:00.000Z",
    });
    expect(readCrosswalk().crosswalks).toHaveLength(1);
  });

  it("16. repeating the same mapping is idempotent", async () => {
    const input = {
      league: "nfl" as const,
      provider: "actionnetwork",
      providerGameId: "an-1",
      jkbGameId: "2026_01_NE_SEA",
    };
    await upsertBettingProviderGameCrosswalk(store, { ...input, verifiedAt: "2026-09-01T00:00:00.000Z" });
    const result = await upsertBettingProviderGameCrosswalk(store, {
      ...input,
      verifiedAt: "2026-09-05T00:00:00.000Z",
    });
    expect(result.action).toBe("verified");
    expect(readCrosswalk().crosswalks).toHaveLength(1);
    expect(readCrosswalk().crosswalks[0].lastVerifiedAt).toBe("2026-09-05T00:00:00.000Z");
  });

  it("17. a conflicting mapping is rejected and nothing is overwritten", async () => {
    const base = {
      league: "nfl" as const,
      provider: "actionnetwork",
      providerGameId: "an-1",
    };
    await upsertBettingProviderGameCrosswalk(store, { ...base, jkbGameId: "2026_01_NE_SEA" });
    const result = await upsertBettingProviderGameCrosswalk(store, {
      ...base,
      jkbGameId: "2026_01_DAL_PHI",
    });
    expect(result.action).toBe("conflict");
    expect(readCrosswalk().crosswalks[0].jkbGameId).toBe("2026_01_NE_SEA");

    await expect(
      store.insertCrosswalk({
        ...base,
        id: "forced",
        jkbGameId: "2026_01_DAL_PHI",
        providerHomeTeamId: null,
        providerAwayTeamId: null,
        canonicalHomeTeamId: null,
        canonicalAwayTeamId: null,
        firstVerifiedAt: "2026-09-01T00:00:00.000Z",
        lastVerifiedAt: "2026-09-01T00:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(BettingSplitFileStoreError);
  });

  it("18. providers are isolated for the same providerGameId", async () => {
    await upsertBettingProviderGameCrosswalk(store, {
      league: "nfl",
      provider: "actionnetwork",
      providerGameId: "shared-1",
      jkbGameId: "2026_01_NE_SEA",
    });
    await upsertBettingProviderGameCrosswalk(store, {
      league: "nfl",
      provider: "vsin",
      providerGameId: "shared-1",
      jkbGameId: "2026_01_DAL_PHI",
    });
    expect(readCrosswalk().crosswalks).toHaveLength(2);
  });

  it("19. leagues are isolated", async () => {
    await upsertBettingProviderGameCrosswalk(store, {
      league: "nfl",
      provider: "actionnetwork",
      providerGameId: "g-1",
      jkbGameId: "2026_01_NE_SEA",
    });
    await upsertBettingProviderGameCrosswalk(store, {
      league: "cfb",
      provider: "actionnetwork",
      providerGameId: "g-1",
      jkbGameId: "401752123",
    });
    expect(readCrosswalk().crosswalks).toHaveLength(2);
  });

  it("20. serialization is deterministic regardless of insertion order", async () => {
    const a = {
      league: "nfl" as const,
      provider: "vsin",
      providerGameId: "b-2",
      jkbGameId: "2026_01_DAL_PHI",
      verifiedAt: "2026-09-01T00:00:00.000Z",
    };
    const b = {
      league: "cfb" as const,
      provider: "actionnetwork",
      providerGameId: "a-1",
      jkbGameId: "401752123",
      verifiedAt: "2026-09-01T00:00:00.000Z",
    };

    // Row ordering (not the random per-row id) must be insertion-order-independent.
    const normalize = (blob: string): string =>
      blob.replace(/"id": "[^"]+"/g, '"id": "<id>"');

    await upsertBettingProviderGameCrosswalk(store, a);
    await upsertBettingProviderGameCrosswalk(store, b);
    const forward = normalize(readFileSync(path.join(rootDir, CROSSWALK_FILE), "utf8"));

    const otherRoot = mkdtempSync(path.join(tmpdir(), "jkb-betting-splits-xw-"));
    try {
      const otherStore = createBettingSplitFileStore({ rootDir: otherRoot });
      await upsertBettingProviderGameCrosswalk(otherStore, b);
      await upsertBettingProviderGameCrosswalk(otherStore, a);
      const reverse = normalize(readFileSync(path.join(otherRoot, CROSSWALK_FILE), "utf8"));
      expect(reverse).toBe(forward);
      // cfb/actionnetwork/a-1 sorts ahead of nfl/vsin/b-2 regardless of write order.
      expect(forward.indexOf('"a-1"')).toBeLessThan(forward.indexOf('"b-2"'));
    } finally {
      rmSync(otherRoot, { recursive: true, force: true });
    }
  });
});

describe("mkdir edge cases", () => {
  it("tolerates a pre-existing history directory tree", async () => {
    mkdirSync(path.join(rootDir, "history", "nfl", "2026"), { recursive: true });
    await storeBettingSplitSnapshot(store, nfl());
    expect(readHistoryLines(NFL_HISTORY_FILE)).toHaveLength(1);
  });
});
