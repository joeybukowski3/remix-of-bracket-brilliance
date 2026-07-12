import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { normalizeHrDashboardPayload } from "@/pages/MlbHrProps";

/**
 * Phase 1 canonical-identity passthrough.
 *
 * The HR generator emits numeric MLB ids (`playerId`, `gameId`,
 * `opposingPitcherId`) plus lineup context (`lineupStatus`, `battingOrder`,
 * `starterConfirmed`, `position`). These are the canonical history keys —
 * `gameKey` ("MIL@PIT") is a display alias only. The frontend normalizer
 * previously dropped them; these tests pin the passthrough contract.
 */

function makeBatterEntry(overrides: Record<string, unknown> = {}) {
  return {
    gameKey: "HOU@TEX",
    playerId: 607043,
    gameId: 822876,
    lineupStatus: "confirmed",
    battingOrder: 4,
    starterConfirmed: true,
    position: "RF",
    player: "Test Slugger",
    team: "HOU",
    opponent: "TEX",
    opposingPitcher: "Test Starter",
    opposingPitcherId: 543243,
    barrelRate: 14.2,
    hardHitRate: 48.9,
    xba: 0.271,
    whiffRate: 24.1,
    last7HR: 2,
    last30HR: 6,
    opposingPitcherHrVs: 61.3,
    weatherBoost: 3.1,
    parkFactor: 1.05,
    hrScore: 71.4,
    hrScoreRank: 3,
    angleTags: [],
    ...overrides,
  };
}

function normalizeSingle(entry: Record<string, unknown>) {
  const payload = normalizeHrDashboardPayload({
    date: "2026-07-12",
    generatedAt: "2026-07-12T12:00:00Z",
    games: [],
    pitchers: [],
    batters: [entry],
  });
  return payload?.batters[0] ?? null;
}

describe("canonical identity passthrough", () => {
  it("preserves playerId, gameId, and opposingPitcherId through normalization", () => {
    const row = normalizeSingle(makeBatterEntry());
    expect(row).not.toBeNull();
    expect(row?.playerId).toBe(607043);
    expect(row?.gameId).toBe(822876);
    expect(row?.opposingPitcherId).toBe(543243);
  });

  it("preserves lineup context fields", () => {
    const row = normalizeSingle(makeBatterEntry());
    expect(row?.lineupStatus).toBe("confirmed");
    expect(row?.battingOrder).toBe(4);
    expect(row?.starterConfirmed).toBe(true);
    expect(row?.position).toBe("RF");
  });

  it("keeps gameKey as a display alias alongside the numeric gameId", () => {
    const row = normalizeSingle(makeBatterEntry());
    expect(row?.gameKey).toBe("HOU@TEX");
    expect(typeof row?.gameId).toBe("number");
    // The display alias must never masquerade as the canonical id.
    expect(row?.gameId).not.toBe(row?.gameKey as unknown);
  });

  it("never fabricates ids: invalid values become null and the row survives", () => {
    const row = normalizeSingle(
      makeBatterEntry({ playerId: "not-a-number", gameId: -5, opposingPitcherId: 3.7 }),
    );
    expect(row).not.toBeNull();
    expect(row?.playerId).toBeNull();
    expect(row?.gameId).toBeNull();
    expect(row?.opposingPitcherId).toBeNull();
  });

  it("treats zero as an invalid canonical id", () => {
    const row = normalizeSingle(makeBatterEntry({ playerId: 0, gameId: 0 }));
    expect(row?.playerId).toBeNull();
    expect(row?.gameId).toBeNull();
  });

  it("normalizes older payload rows that predate identity fields", () => {
    const legacy = makeBatterEntry();
    delete (legacy as Record<string, unknown>).playerId;
    delete (legacy as Record<string, unknown>).gameId;
    delete (legacy as Record<string, unknown>).lineupStatus;
    delete (legacy as Record<string, unknown>).battingOrder;
    delete (legacy as Record<string, unknown>).starterConfirmed;
    delete (legacy as Record<string, unknown>).position;
    const row = normalizeSingle(legacy);
    expect(row).not.toBeNull();
    expect(row?.playerId).toBeNull();
    expect(row?.gameId).toBeNull();
    expect(row?.lineupStatus).toBe("unknown");
    expect(row?.battingOrder).toBeNull();
    expect(row?.starterConfirmed).toBeNull();
    expect(row?.position).toBeNull();
  });

  it("coerces unexpected lineupStatus values to \"unknown\" and clamps battingOrder to 1-9", () => {
    const row = normalizeSingle(
      makeBatterEntry({ lineupStatus: "SCRATCHED?", battingOrder: 12 }),
    );
    expect(row?.lineupStatus).toBe("unknown");
    expect(row?.battingOrder).toBeNull();
  });

  it("preserves identity on every row of the checked-in production payload", () => {
    const raw = JSON.parse(
      readFileSync(resolve(process.cwd(), "public/data/mlb/hr-props-raw.json"), "utf8"),
    );
    const payload = normalizeHrDashboardPayload(raw);
    expect(payload).not.toBeNull();
    expect(payload!.batters.length).toBeGreaterThan(0);
    const missingIds = payload!.batters.filter((b) => b.playerId == null || b.gameId == null);
    expect(missingIds).toHaveLength(0);
    const badLineup = payload!.batters.filter(
      (b) => !["confirmed", "projected", "unknown"].includes(b.lineupStatus),
    );
    expect(badLineup).toHaveLength(0);
  });
});
