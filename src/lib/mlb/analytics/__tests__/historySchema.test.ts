import { describe, expect, it } from "vitest";
import {
  createPendingSettlement,
  HISTORY_RECORD_VERSION,
  historyObservationKey,
  SNAPSHOT_TYPES,
  validateHistoryObservation,
  type HrHistoryObservation,
} from "../historySchema";
import { InMemoryHistoryStore } from "../historyStore";

function makeObservation(
  overrides: Partial<HrHistoryObservation> = {},
): HrHistoryObservation {
  return {
    recordVersion: HISTORY_RECORD_VERSION,
    snapshotType: "PUBLICATION",
    playerId: 607043,
    gameId: 822876,
    teamId: 117,
    opposingPitcherId: 543243,
    market: "hr",
    side: "yes",
    line: 0.5,
    slateDate: "2026-07-12",
    capturedAt: "2026-07-12T15:30:00Z",
    modelId: "jkb-hr-bridge",
    modelVersion: "1.0.0",
    scoreVersion: "hr-bridge-abs@1",
    registryVersion: "mlb-metrics@1",
    generatorCommitSha: "bd3f18dd58ed3c6530e82866c9a045e034e66804",
    registryArtifactHash: "sha256:registry",
    modelArtifactHash: "sha256:model",
    rangeArtifactHash: "sha256:ranges",
    rawMetrics: { "batter-barrel-pct": 14.5 },
    normalizedMetrics: { "batter-barrel-pct": 67.65 },
    contributions: [],
    finalScore: 62.4,
    slateRank: 5,
    completenessPercent: 100,
    confidencePercent: 100,
    lineupStatus: "confirmed",
    battingOrder: 4,
    starterConfirmed: true,
    sourceFreshness: "generation-run",
    oddsObservations: [
      { bookmaker: "fanduel", priceAmerican: 320, capturedAt: "2026-07-12T15:30:00Z" },
    ],
    consensusQuote: null,
    settlement: createPendingSettlement(),
    ...overrides,
  };
}

describe("history observation schema", () => {
  it("accepts a valid publication observation", () => {
    const result = validateHistoryObservation(makeObservation());
    expect(result.errors).toEqual([]);
  });

  it("declares all six snapshot types centrally", () => {
    expect(SNAPSHOT_TYPES).toEqual([
      "OPENING_OBSERVED",
      "PUBLICATION",
      "T_MINUS_60",
      "FINAL_PRE_LOCK",
      "CLOSING_CONFIRMED",
      "SETTLEMENT",
    ]);
    for (const snapshotType of SNAPSHOT_TYPES) {
      expect(validateHistoryObservation(makeObservation({ snapshotType })).valid).toBe(true);
    }
  });

  it("rejects unknown snapshot types (never inferred from array order)", () => {
    const result = validateHistoryObservation(
      makeObservation({ snapshotType: "FIRST_IN_ARRAY" as never }),
    );
    expect(result.errors.join()).toContain("snapshotType");
  });

  it("requires canonical numeric ids — a gameKey is not an id", () => {
    expect(
      validateHistoryObservation(makeObservation({ playerId: 0 })).errors.join(),
    ).toContain("playerId");
    expect(
      validateHistoryObservation(
        makeObservation({ gameId: "MIL@PIT" as unknown as number }),
      ).errors.join(),
    ).toContain("gameId");
  });

  it("rejects records that smuggle a gameKey display alias", () => {
    const withAlias = { ...makeObservation(), gameKey: "MIL@PIT" };
    const result = validateHistoryObservation(withAlias);
    expect(result.errors.join()).toContain("display alias");
  });

  it("requires exact line and side", () => {
    expect(
      validateHistoryObservation(
        makeObservation({ line: Number.NaN }),
      ).errors.join(),
    ).toContain("line");
    expect(
      validateHistoryObservation(makeObservation({ side: "maybe" as never })).errors.join(),
    ).toContain("side");
  });

  it("requires full replay pins", () => {
    const result = validateHistoryObservation(
      makeObservation({ scoreVersion: "" as never, registryVersion: "" as never }),
    );
    expect(result.errors.join()).toContain("scoreVersion");
    expect(result.errors.join()).toContain("registryVersion");
  });

  it("keys observations by market/slate/snapshot/player/game/side/line/model", () => {
    const a = historyObservationKey(makeObservation());
    expect(historyObservationKey(makeObservation({ line: 1.5 }))).not.toBe(a);
    expect(historyObservationKey(makeObservation({ side: "no" }))).not.toBe(a);
    expect(historyObservationKey(makeObservation({ snapshotType: "T_MINUS_60" }))).not.toBe(a);
    expect(historyObservationKey(makeObservation())).toBe(a);
  });
});

describe("in-memory history store (append-only contract)", () => {
  it("appends valid records and rejects duplicates instead of overwriting", async () => {
    const store = new InMemoryHistoryStore();
    const first = await store.append([makeObservation()]);
    expect(first).toEqual({ appended: 1, duplicateKeys: [] });

    const changed = makeObservation({ finalScore: 99 });
    const second = await store.append([changed]);
    expect(second.appended).toBe(0);
    expect(second.duplicateKeys).toHaveLength(1);

    const stored = await store.listSlate("hr", "2026-07-12", "PUBLICATION");
    expect(stored).toHaveLength(1);
    expect(stored[0].finalScore).toBe(62.4); // original record untouched
  });

  it("stores records immutably (caller mutation cannot leak in)", async () => {
    const store = new InMemoryHistoryStore();
    const record = makeObservation();
    await store.append([record]);
    record.finalScore = 0;
    const [stored] = await store.listSlate("hr", "2026-07-12");
    expect(stored.finalScore).toBe(62.4);
    stored.finalScore = 1;
    const [reread] = await store.listSlate("hr", "2026-07-12");
    expect(reread.finalScore).toBe(62.4);
  });

  it("rejects invalid records at the append boundary", async () => {
    const store = new InMemoryHistoryStore();
    await expect(
      store.append([makeObservation({ playerId: -1 })]),
    ).rejects.toThrow(/invalid record/);
  });

  it("separates snapshots of the same market observation", async () => {
    const store = new InMemoryHistoryStore();
    await store.append([
      makeObservation({ snapshotType: "PUBLICATION" }),
      makeObservation({ snapshotType: "FINAL_PRE_LOCK" }),
      makeObservation({ snapshotType: "SETTLEMENT" }),
    ]);
    expect(store.size).toBe(3);
    expect(await store.listSlate("hr", "2026-07-12", "FINAL_PRE_LOCK")).toHaveLength(1);
    expect(await store.listSlate("hr", "2026-07-12")).toHaveLength(3);
  });
});
