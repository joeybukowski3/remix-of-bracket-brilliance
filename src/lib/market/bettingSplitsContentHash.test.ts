import { describe, expect, it } from "vitest";
import {
  buildBettingSplitContentHash,
  serializeBettingSplitMarketState,
} from "./bettingSplitsContentHash";
import { NFL_BETTING_SPLIT_FIXTURE } from "./__fixtures__/bettingSplitsFixtures";
import type { BettingSplitSnapshot } from "./bettingSplitsTypes";

function snapshot(overrides: Partial<BettingSplitSnapshot> = {}): BettingSplitSnapshot {
  return { ...NFL_BETTING_SPLIT_FIXTURE, ...overrides };
}

describe("buildBettingSplitContentHash", () => {
  it("1. same market state produces the same hash", () => {
    expect(buildBettingSplitContentHash(snapshot())).toBe(
      buildBettingSplitContentHash(snapshot()),
    );
  });

  it("2. a different capturedAt alone does not change the hash", () => {
    expect(buildBettingSplitContentHash(snapshot({ capturedAt: "2026-09-11T09:00:00.000Z" }))).toBe(
      buildBettingSplitContentHash(snapshot()),
    );
  });

  it("3. a different providerLastSeenAt alone does not change the hash", () => {
    expect(
      buildBettingSplitContentHash(snapshot({ providerLastSeenAt: "2026-09-11T09:00:00.000Z" })),
    ).toBe(buildBettingSplitContentHash(snapshot()));
  });

  it("also ignores providerCreatedAt, firstObservedAt and lastObservedAt", () => {
    const base = buildBettingSplitContentHash(snapshot());
    expect(buildBettingSplitContentHash(snapshot({ providerCreatedAt: null }))).toBe(base);
    expect(buildBettingSplitContentHash(snapshot({ firstObservedAt: "2020-01-01T00:00:00.000Z" }))).toBe(base);
    expect(buildBettingSplitContentHash(snapshot({ lastObservedAt: "2030-01-01T00:00:00.000Z" }))).toBe(base);
  });

  it("4. a changed spread number changes the hash", () => {
    const changed = snapshot({
      spread: { ...NFL_BETTING_SPLIT_FIXTURE.spread!, currentHomeLine: -8 },
    });
    expect(buildBettingSplitContentHash(changed)).not.toBe(buildBettingSplitContentHash(snapshot()));
  });

  it("5. a changed total number changes the hash", () => {
    const changed = snapshot({
      total: { ...NFL_BETTING_SPLIT_FIXTURE.total!, currentLine: 47.5 },
    });
    expect(buildBettingSplitContentHash(changed)).not.toBe(buildBettingSplitContentHash(snapshot()));
  });

  it("6. a changed moneyline price changes the hash", () => {
    const changed = snapshot({
      moneyline: { ...NFL_BETTING_SPLIT_FIXTURE.moneyline!, currentHomePrice: -350 },
    });
    expect(buildBettingSplitContentHash(changed)).not.toBe(buildBettingSplitContentHash(snapshot()));
  });

  it("7. a changed bet percentage changes the hash", () => {
    const changed = snapshot({
      spread: { ...NFL_BETTING_SPLIT_FIXTURE.spread!, homeBetPct: 70, awayBetPct: 30 },
    });
    expect(buildBettingSplitContentHash(changed)).not.toBe(buildBettingSplitContentHash(snapshot()));
  });

  it("8. a changed money percentage changes the hash", () => {
    const changed = snapshot({
      moneyline: { ...NFL_BETTING_SPLIT_FIXTURE.moneyline!, homeMoneyPct: 60, awayMoneyPct: 40 },
    });
    expect(buildBettingSplitContentHash(changed)).not.toBe(buildBettingSplitContentHash(snapshot()));
  });

  it("9. a different sportsbook changes the hash", () => {
    expect(buildBettingSplitContentHash(snapshot({ sportsbook: "draftkings" }))).not.toBe(
      buildBettingSplitContentHash(snapshot({ sportsbook: "fanduel" })),
    );
  });

  it("10. a different provider changes the hash", () => {
    expect(buildBettingSplitContentHash(snapshot({ provider: "vsin" }))).not.toBe(
      buildBettingSplitContentHash(snapshot({ provider: "actionnetwork" })),
    );
  });

  it("11. a different game changes the hash", () => {
    expect(buildBettingSplitContentHash(snapshot({ jkbGameId: "2026_01_NE_SEA" }))).not.toBe(
      buildBettingSplitContentHash(snapshot({ jkbGameId: "2026_01_DAL_PHI" })),
    );
  });

  it("12. a null sportsbook hashes deterministically and does not collide with the string 'null'", () => {
    expect(buildBettingSplitContentHash(snapshot({ sportsbook: null }))).toBe(
      buildBettingSplitContentHash(snapshot({ sportsbook: null })),
    );
    expect(buildBettingSplitContentHash(snapshot({ sportsbook: null }))).not.toBe(
      buildBettingSplitContentHash(snapshot({ sportsbook: "null" })),
    );
  });

  it("13. object construction / key order cannot alter the hash", () => {
    const forward = snapshot();
    const reordered: BettingSplitSnapshot = {
      lastObservedAt: forward.lastObservedAt,
      firstObservedAt: forward.firstObservedAt,
      contentHash: forward.contentHash,
      moneyline: forward.moneyline && {
        awayMoneyPct: forward.moneyline.awayMoneyPct,
        homeMoneyPct: forward.moneyline.homeMoneyPct,
        awayBetPct: forward.moneyline.awayBetPct,
        homeBetPct: forward.moneyline.homeBetPct,
        currentAwayPrice: forward.moneyline.currentAwayPrice,
        currentHomePrice: forward.moneyline.currentHomePrice,
        openingAwayPrice: forward.moneyline.openingAwayPrice,
        openingHomePrice: forward.moneyline.openingHomePrice,
      },
      total: forward.total,
      spread: forward.spread,
      providerLastSeenAt: forward.providerLastSeenAt,
      providerCreatedAt: forward.providerCreatedAt,
      capturedAt: forward.capturedAt,
      sportsbook: forward.sportsbook,
      providerGameId: forward.providerGameId,
      provider: forward.provider,
      kickoffUtc: forward.kickoffUtc,
      homeTeamId: forward.homeTeamId,
      awayTeamId: forward.awayTeamId,
      jkbGameId: forward.jkbGameId,
      week: forward.week,
      season: forward.season,
      league: forward.league,
      schemaVersion: forward.schemaVersion,
    };
    expect(buildBettingSplitContentHash(reordered)).toBe(buildBettingSplitContentHash(forward));
  });

  it("serialization is stable JSON that excludes observation metadata", () => {
    const serialized = serializeBettingSplitMarketState(snapshot());
    expect(serialized).not.toContain("capturedAt");
    expect(serialized).not.toContain("Observed");
    expect(() => JSON.parse(serialized)).not.toThrow();
  });
});
