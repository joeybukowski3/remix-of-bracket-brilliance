import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createBettingSplitFileStore,
  type BettingSplitFileStore,
} from "./bettingSplitsFileStore";
import { storeBettingSplitSnapshot } from "./bettingSplitsStore";
import {
  buildBettingSplitsCurrentArtifact,
  buildBettingSplitsHistoryArtifact,
  publishBettingSplitsArtifacts,
} from "./bettingSplitsPublicArtifacts";
import { NFL_BETTING_SPLIT_FIXTURE } from "./__fixtures__/bettingSplitsFixtures";
import type { BettingSplitSnapshot } from "./bettingSplitsTypes";

let rootDir: string;
let publicRoot: string;
let store: BettingSplitFileStore;

const GENERATED_AT = "2026-09-12T00:00:00.000Z";

beforeEach(() => {
  rootDir = mkdtempSync(path.join(tmpdir(), "jkb-betting-splits-pub-src-"));
  publicRoot = mkdtempSync(path.join(tmpdir(), "jkb-betting-splits-pub-out-"));
  store = createBettingSplitFileStore({ rootDir });
});

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true });
  rmSync(publicRoot, { recursive: true, force: true });
});

function nfl(overrides: Partial<BettingSplitSnapshot> = {}): BettingSplitSnapshot {
  return { ...NFL_BETTING_SPLIT_FIXTURE, contentHash: null, ...overrides };
}

function spreadAt(currentHomeLine: number): BettingSplitSnapshot["spread"] {
  return { ...NFL_BETTING_SPLIT_FIXTURE.spread!, currentHomeLine, currentAwayLine: -currentHomeLine };
}

async function seedAbaMove() {
  await storeBettingSplitSnapshot(store, nfl({ capturedAt: "2026-09-10T10:00:00.000Z", spread: spreadAt(-6) }));
  await storeBettingSplitSnapshot(store, nfl({ capturedAt: "2026-09-10T11:00:00.000Z", spread: spreadAt(-7) }));
  await storeBettingSplitSnapshot(store, nfl({ capturedAt: "2026-09-10T12:00:00.000Z", spread: spreadAt(-6) }));
}

describe("buildBettingSplitsCurrentArtifact", () => {
  it("30. contains only the latest record per game/provider/sportsbook", async () => {
    await seedAbaMove();
    const artifact = buildBettingSplitsCurrentArtifact({
      snapshots: await store.listAllSnapshots(),
      generatedAt: GENERATED_AT,
    });
    expect(artifact.games).toHaveLength(1);
    expect(artifact.games[0].books).toHaveLength(1);
    expect(artifact.games[0].books[0].spread?.currentHomeLine).toBe(-6);
    expect(artifact.games[0].books[0].firstObservedAt).toBe("2026-09-10T12:00:00.000Z");
  });

  it("31. output ordering is deterministic across snapshot input order", async () => {
    const late = nfl({
      jkbGameId: "2026_01_NE_SEA",
      kickoffUtc: "2026-09-14T20:00:00.000Z",
      provider: "vsin",
    });
    const early = nfl({
      jkbGameId: "2026_01_DAL_PHI",
      awayTeamId: "DAL",
      homeTeamId: "PHI",
      kickoffUtc: "2026-09-11T00:20:00.000Z",
      provider: "actionnetwork",
    });

    const forward = buildBettingSplitsCurrentArtifact({
      snapshots: [{ ...late, contentHash: "h1" }, { ...early, contentHash: "h2" }],
      generatedAt: GENERATED_AT,
    });
    const reverse = buildBettingSplitsCurrentArtifact({
      snapshots: [{ ...early, contentHash: "h2" }, { ...late, contentHash: "h1" }],
      generatedAt: GENERATED_AT,
    });

    expect(JSON.stringify(forward)).toBe(JSON.stringify(reverse));
    expect(forward.games.map((game) => game.jkbGameId)).toEqual([
      "2026_01_DAL_PHI",
      "2026_01_NE_SEA",
    ]);
  });

  it("32. generatedAt is passed through verbatim and is publication-only", async () => {
    await seedAbaMove();
    const artifact = buildBettingSplitsCurrentArtifact({
      snapshots: await store.listAllSnapshots(),
      generatedAt: GENERATED_AT,
    });
    expect(artifact.generatedAt).toBe(GENERATED_AT);
    // Market provenance is untouched by publication time.
    expect(artifact.games[0].books[0].lastObservedAt).toBe("2026-09-10T12:00:00.000Z");
  });

  it("33. never emits history duplicates for a repeated (A) state", async () => {
    await seedAbaMove();
    const artifact = buildBettingSplitsCurrentArtifact({
      snapshots: await store.listAllSnapshots(),
      generatedAt: GENERATED_AT,
    });
    expect(artifact.games[0].books).toHaveLength(1);
  });

  it("36. excludes private-only routing fields", async () => {
    await seedAbaMove();
    const artifact = buildBettingSplitsCurrentArtifact({
      snapshots: await store.listAllSnapshots(),
      generatedAt: GENERATED_AT,
    });
    const book = artifact.games[0].books[0] as Record<string, unknown>;
    expect(book.providerGameId).toBeUndefined();
    expect(book.schemaVersion).toBeUndefined();
    expect(book.id).toBeUndefined();
  });
});

describe("buildBettingSplitsHistoryArtifact", () => {
  it("34. contains the complete chronological set of state periods", async () => {
    await seedAbaMove();
    const artifact = buildBettingSplitsHistoryArtifact({
      league: "nfl",
      season: 2026,
      jkbGameId: "2026_01_NE_SEA",
      snapshots: await store.listAllSnapshots(),
      generatedAt: GENERATED_AT,
    });
    expect(artifact.series.map((entry) => entry.spread?.currentHomeLine)).toEqual([-6, -7, -6]);
  });

  it("35. retains provider and sportsbook provenance", async () => {
    await storeBettingSplitSnapshot(store, nfl({ provider: "vsin", sportsbook: "fanduel" }));
    const artifact = buildBettingSplitsHistoryArtifact({
      league: "nfl",
      season: 2026,
      jkbGameId: "2026_01_NE_SEA",
      snapshots: await store.listAllSnapshots(),
      generatedAt: GENERATED_AT,
    });
    expect(artifact.series[0].provider).toBe("vsin");
    expect(artifact.series[0].sportsbook).toBe("fanduel");
    expect(artifact.series[0].capturedAt).toBe(NFL_BETTING_SPLIT_FIXTURE.capturedAt);
  });

  it("37. serialization is deterministic", async () => {
    await seedAbaMove();
    const snapshots = await store.listAllSnapshots();
    const first = JSON.stringify(
      buildBettingSplitsHistoryArtifact({
        league: "nfl",
        season: 2026,
        jkbGameId: "2026_01_NE_SEA",
        snapshots,
        generatedAt: GENERATED_AT,
      }),
    );
    const second = JSON.stringify(
      buildBettingSplitsHistoryArtifact({
        league: "nfl",
        season: 2026,
        jkbGameId: "2026_01_NE_SEA",
        snapshots: [...snapshots].reverse(),
        generatedAt: GENERATED_AT,
      }),
    );
    expect(first).toBe(second);
  });
});

describe("publishBettingSplitsArtifacts", () => {
  it("writes the current artifact and one history file per game", async () => {
    await seedAbaMove();
    await storeBettingSplitSnapshot(
      store,
      nfl({ jkbGameId: "2026_01_DAL_PHI", awayTeamId: "DAL", homeTeamId: "PHI" }),
    );

    const result = await publishBettingSplitsArtifacts({
      store,
      publicRoot,
      generatedAt: GENERATED_AT,
    });

    const current = JSON.parse(
      readFileSync(path.join(publicRoot, "betting-splits-current.json"), "utf8"),
    );
    expect(current.schemaVersion).toBe("jkb-betting-splits-current-v1");
    expect(current.games).toHaveLength(2);
    expect(result.historyArtifactPaths).toHaveLength(2);

    const history = JSON.parse(
      readFileSync(
        path.join(publicRoot, "betting-splits-history", "nfl", "2026_01_NE_SEA.json"),
        "utf8",
      ),
    );
    expect(history.series).toHaveLength(3);
  });

  it("is byte-deterministic across repeated publishes", async () => {
    await seedAbaMove();
    await publishBettingSplitsArtifacts({ store, publicRoot, generatedAt: GENERATED_AT });
    const firstPass = readFileSync(
      path.join(publicRoot, "betting-splits-current.json"),
      "utf8",
    );
    await publishBettingSplitsArtifacts({ store, publicRoot, generatedAt: GENERATED_AT });
    const secondPass = readFileSync(
      path.join(publicRoot, "betting-splits-current.json"),
      "utf8",
    );
    expect(secondPass).toBe(firstPass);
  });
});
