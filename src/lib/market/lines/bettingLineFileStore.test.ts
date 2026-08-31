import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBettingLineFileStore } from "./bettingLineFileStore";
import { storeBettingLineSnapshot } from "./bettingLineStore";
import { BETTING_LINE_SCHEMA_VERSION, type BettingLineSnapshot } from "./bettingLineTypes";

let root: string;
let idCounter = 0;
const nextId = () => `id-${(idCounter += 1)}`;

beforeEach(async () => {
  idCounter = 0;
  root = await mkdtemp(join(tmpdir(), "betting-lines-store-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function snapshot(overrides: Partial<BettingLineSnapshot> = {}): BettingLineSnapshot {
  return {
    schemaVersion: BETTING_LINE_SCHEMA_VERSION,
    league: "nfl",
    season: 2026,
    week: 1,
    jkbGameId: "2026_01_NE_SEA",
    provider: "the-odds-api",
    providerEventId: "evt-1",
    sportsbook: "draftkings",
    capturedAt: "2026-09-01T06:00:00.000Z",
    providerUpdatedAt: "2026-09-01T05:55:00.000Z",
    homeTeamId: "sea",
    awayTeamId: "ne",
    kickoffUtc: "2026-09-07T17:00:00.000Z",
    spread: { homeLine: -2.5, awayLine: 2.5, homePrice: -110, awayPrice: -110 },
    total: { line: 44.5, overPrice: -108, underPrice: -112 },
    moneyline: { homePrice: -140, awayPrice: 120 },
    contentHash: null,
    firstObservedAt: "2026-09-01T06:00:00.000Z",
    lastObservedAt: "2026-09-01T06:00:00.000Z",
    ...overrides,
  };
}

const put = (store: ReturnType<typeof createBettingLineFileStore>, s: BettingLineSnapshot) =>
  storeBettingLineSnapshot({ adapter: store, snapshot: s, idFactory: nextId });

describe("betting-line file store dedup", () => {
  it("first state inserts one history row", async () => {
    const store = createBettingLineFileStore({ rootDir: root });
    const result = await put(store, snapshot());
    expect(result.outcome).toBe("inserted");
    const rows = await store.listSnapshotsForGame({
      league: "nfl",
      season: 2026,
      jkbGameId: "2026_01_NE_SEA",
    });
    expect(rows).toHaveLength(1);
  });

  it("an unchanged next-day observation extends the row instead of appending", async () => {
    const store = createBettingLineFileStore({ rootDir: root });
    await put(store, snapshot());
    const again = await put(
      store,
      snapshot({
        capturedAt: "2026-09-02T06:00:00.000Z",
        lastObservedAt: "2026-09-02T06:00:00.000Z",
        providerUpdatedAt: "2026-09-02T05:00:00.000Z",
      }),
    );
    expect(again.outcome).toBe("extended");
    const rows = await store.listSnapshotsForGame({
      league: "nfl",
      season: 2026,
      jkbGameId: "2026_01_NE_SEA",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].lastObservedAt).toBe("2026-09-02T06:00:00.000Z");
  });

  it("a changed line appends a new row", async () => {
    const store = createBettingLineFileStore({ rootDir: root });
    await put(store, snapshot());
    const changed = await put(
      store,
      snapshot({ spread: { homeLine: -3, awayLine: 3, homePrice: -110, awayPrice: -110 } }),
    );
    expect(changed.outcome).toBe("inserted");
    expect(
      await store.listSnapshotsForGame({
        league: "nfl",
        season: 2026,
        jkbGameId: "2026_01_NE_SEA",
      }),
    ).toHaveLength(2);
  });

  it("A -> B -> A preserves three rows", async () => {
    const store = createBettingLineFileStore({ rootDir: root });
    const b = { homeLine: -3, awayLine: 3, homePrice: -110, awayPrice: -110 };
    await put(store, snapshot());
    await put(store, snapshot({ spread: b }));
    await put(store, snapshot());
    const rows = await store.listSnapshotsForGame({
      league: "nfl",
      season: 2026,
      jkbGameId: "2026_01_NE_SEA",
    });
    expect(rows.map((row) => row.spread?.homeLine)).toEqual([-2.5, -3, -2.5]);
  });

  it("keeps sportsbooks and leagues isolated", async () => {
    const store = createBettingLineFileStore({ rootDir: root });
    await put(store, snapshot());
    await put(store, snapshot({ sportsbook: "fanduel" }));
    await put(
      store,
      snapshot({ league: "cfb", jkbGameId: "cfb-game-1", homeTeamId: "ala", awayTeamId: "aub" }),
    );
    const all = await store.listAllSnapshots();
    expect(all).toHaveLength(3);
    const nfl = await store.listSnapshotsForGame({
      league: "nfl",
      season: 2026,
      jkbGameId: "2026_01_NE_SEA",
    });
    expect(nfl.map((row) => row.sportsbook).sort()).toEqual(["draftkings", "fanduel"]);
  });
});
