import { describe, expect, it } from "vitest";
import {
  CFB_BETTING_SPLIT_FIXTURE,
  NFL_BETTING_SPLIT_FIXTURE,
  PARTIAL_BETTING_SPLIT_FIXTURE,
} from "./__fixtures__/bettingSplitsFixtures";
import {
  getBettingSplitHistoryForGame,
  getCurrentMoneylineForTeam,
  getCurrentSpreadForTeam,
  getLatestBettingSplitSnapshot,
  getMoneylineMoneyMinusBets,
  getSpreadMoneyMinusBets,
  getTotalMoneyMinusBets,
  isBettingSplitSnapshotStale,
  sortBettingSplitHistory,
} from "./bettingSplitsSelectors";

describe("betting split selectors", () => {
  it("calculates money-minus-bets without persisting the derived value", () => {
    expect(getSpreadMoneyMinusBets(NFL_BETTING_SPLIT_FIXTURE, "away")).toBe(26);
    expect(getTotalMoneyMinusBets(NFL_BETTING_SPLIT_FIXTURE, "over")).toBe(8);
    expect(getMoneylineMoneyMinusBets(NFL_BETTING_SPLIT_FIXTURE, "home")).toBe(-8);
    expect("moneyMinusBets" in NFL_BETTING_SPLIT_FIXTURE.spread!).toBe(false);
  });

  it("returns null for a delta when either source percentage is missing", () => {
    expect(getTotalMoneyMinusBets(PARTIAL_BETTING_SPLIT_FIXTURE, "under")).toBeNull();
    expect(getMoneylineMoneyMinusBets(PARTIAL_BETTING_SPLIT_FIXTURE, "home")).toBeNull();
  });

  it("selects current team-specific spreads and moneylines", () => {
    expect(getCurrentSpreadForTeam(NFL_BETTING_SPLIT_FIXTURE, "SEA")).toBe(-7.5);
    expect(getCurrentSpreadForTeam(NFL_BETTING_SPLIT_FIXTURE, "NE")).toBe(7.5);
    expect(getCurrentMoneylineForTeam(NFL_BETTING_SPLIT_FIXTURE, "SEA")).toBe(-325);
    expect(getCurrentMoneylineForTeam(NFL_BETTING_SPLIT_FIXTURE, "NE")).toBe(260);
    expect(getCurrentSpreadForTeam(NFL_BETTING_SPLIT_FIXTURE, "UNKNOWN")).toBeNull();
  });

  it("sorts historical snapshots chronologically without mutating the input", () => {
    const earlier = {
      ...NFL_BETTING_SPLIT_FIXTURE,
      capturedAt: "2026-09-09T16:00:00.000Z",
      lastObservedAt: "2026-09-09T16:00:00.000Z",
      contentHash: "earlier",
    };
    const input = [NFL_BETTING_SPLIT_FIXTURE, earlier];

    const sorted = sortBettingSplitHistory(input);

    expect(sorted.map((snapshot) => snapshot.contentHash)).toEqual(["earlier", "fixture-nfl-hash-001"]);
    expect(input[0]).toBe(NFL_BETTING_SPLIT_FIXTURE);
  });

  it("selects the latest snapshot deterministically, including timestamp ties", () => {
    const tiedA = { ...NFL_BETTING_SPLIT_FIXTURE, provider: "provider-a", contentHash: "a" };
    const tiedB = { ...NFL_BETTING_SPLIT_FIXTURE, provider: "provider-b", contentHash: "b" };

    expect(getLatestBettingSplitSnapshot([tiedB, tiedA])).toEqual(tiedB);
    expect(getLatestBettingSplitSnapshot([tiedA, tiedB])).toEqual(tiedB);
    expect(getLatestBettingSplitSnapshot([])).toBeNull();
  });

  it("evaluates staleness against an explicit reference time and threshold", () => {
    const threshold = 60 * 60 * 1000;
    expect(isBettingSplitSnapshotStale(NFL_BETTING_SPLIT_FIXTURE, {
      referenceTime: "2026-09-10T16:58:00.000Z",
      staleAfterMs: threshold,
    })).toBe(false);
    expect(isBettingSplitSnapshotStale(NFL_BETTING_SPLIT_FIXTURE, {
      referenceTime: "2026-09-10T16:58:00.001Z",
      staleAfterMs: threshold,
    })).toBe(true);
  });

  it("falls back to lastObservedAt when the provider has no last-seen timestamp", () => {
    expect(isBettingSplitSnapshotStale(PARTIAL_BETTING_SPLIT_FIXTURE, {
      referenceTime: "2026-09-07T17:00:00.000Z",
      staleAfterMs: 60 * 60 * 1000,
    })).toBe(false);
  });

  it("does not mix games or leagues in game history", () => {
    const sameTextIdDifferentLeague = {
      ...CFB_BETTING_SPLIT_FIXTURE,
      jkbGameId: NFL_BETTING_SPLIT_FIXTURE.jkbGameId,
    };
    const history = getBettingSplitHistoryForGame(
      [CFB_BETTING_SPLIT_FIXTURE, PARTIAL_BETTING_SPLIT_FIXTURE, sameTextIdDifferentLeague, NFL_BETTING_SPLIT_FIXTURE],
      { league: "nfl", jkbGameId: NFL_BETTING_SPLIT_FIXTURE.jkbGameId },
    );

    expect(history).toEqual([NFL_BETTING_SPLIT_FIXTURE]);
  });

  it("keeps providers and sportsbooks distinguishable when filtering history", () => {
    const providerB = {
      ...NFL_BETTING_SPLIT_FIXTURE,
      provider: "provider-b",
      providerGameId: "provider-b-game-1",
    };
    const bookB = {
      ...NFL_BETTING_SPLIT_FIXTURE,
      sportsbook: "sportsbook-b",
      contentHash: "sportsbook-b-hash",
    };
    const snapshots = [NFL_BETTING_SPLIT_FIXTURE, providerB, bookB];

    expect(getBettingSplitHistoryForGame(snapshots, {
      league: "nfl",
      jkbGameId: NFL_BETTING_SPLIT_FIXTURE.jkbGameId,
      provider: "fixture-provider",
      sportsbook: "consensus",
    })).toEqual([NFL_BETTING_SPLIT_FIXTURE]);
    expect(getBettingSplitHistoryForGame(snapshots, {
      league: "nfl",
      jkbGameId: NFL_BETTING_SPLIT_FIXTURE.jkbGameId,
      provider: "provider-b",
    })).toEqual([providerB]);
  });
});
