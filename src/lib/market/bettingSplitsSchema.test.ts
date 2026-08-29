import { describe, expect, it } from "vitest";
import {
  CFB_BETTING_SPLIT_FIXTURE,
  NFL_BETTING_SPLIT_FIXTURE,
  PARTIAL_BETTING_SPLIT_FIXTURE,
} from "./__fixtures__/bettingSplitsFixtures";
import {
  parseBettingSplitSnapshot,
  safeParseBettingSplitSnapshot,
} from "./bettingSplitsSchema";

describe("bettingSplitSnapshotSchema", () => {
  it("parses valid NFL and CFB snapshots", () => {
    expect(parseBettingSplitSnapshot(NFL_BETTING_SPLIT_FIXTURE)).toEqual(NFL_BETTING_SPLIT_FIXTURE);
    expect(parseBettingSplitSnapshot(CFB_BETTING_SPLIT_FIXTURE)).toEqual(CFB_BETTING_SPLIT_FIXTURE);
  });

  it("keeps percentages on the 0-100 scale", () => {
    const parsed = parseBettingSplitSnapshot(NFL_BETTING_SPLIT_FIXTURE);
    expect(parsed.spread?.awayBetPct).toBe(35);
    expect(parsed.spread?.awayMoneyPct).toBe(61);
  });

  it.each([-0.01, 100.01])("rejects an out-of-range percentage: %s", (homeBetPct) => {
    const candidate = {
      ...NFL_BETTING_SPLIT_FIXTURE,
      spread: { ...NFL_BETTING_SPLIT_FIXTURE.spread!, homeBetPct },
    };
    expect(safeParseBettingSplitSnapshot(candidate).success).toBe(false);
  });

  it("preserves conventional team-specific spread orientation", () => {
    const parsed = parseBettingSplitSnapshot(NFL_BETTING_SPLIT_FIXTURE);
    expect(parsed.spread).toMatchObject({
      openingHomeLine: -6.5,
      openingAwayLine: 6.5,
      currentHomeLine: -7.5,
      currentAwayLine: 7.5,
    });
  });

  it("preserves missing percentages and market sections as null", () => {
    const parsed = parseBettingSplitSnapshot(PARTIAL_BETTING_SPLIT_FIXTURE);
    expect(parsed.total?.underBetPct).toBeNull();
    expect(parsed.total?.underMoneyPct).toBeNull();
    expect(parsed.moneyline).toBeNull();
  });

  it("keeps provider opening values separate from current and first-observed metadata", () => {
    const parsed = parseBettingSplitSnapshot(NFL_BETTING_SPLIT_FIXTURE);
    expect(parsed.spread?.openingHomeLine).toBe(-6.5);
    expect(parsed.spread?.currentHomeLine).toBe(-7.5);
    expect(parsed.total?.openingLine).toBe(44.5);
    expect(parsed.total?.currentLine).toBe(46);
    expect(parsed.moneyline?.openingHomePrice).toBe(-280);
    expect(parsed.moneyline?.currentHomePrice).toBe(-325);
    expect(parsed.firstObservedAt).toBe("2026-09-08T14:05:00.000Z");

    const withoutProviderOpeners = parseBettingSplitSnapshot(PARTIAL_BETTING_SPLIT_FIXTURE);
    expect(withoutProviderOpeners.spread?.openingHomeLine).toBeNull();
    expect(withoutProviderOpeners.firstObservedAt).not.toBeNull();
  });

  it("does not fabricate a missing complementary percentage", () => {
    const parsed = parseBettingSplitSnapshot(PARTIAL_BETTING_SPLIT_FIXTURE);
    expect(parsed.total?.overBetPct).toBe(57);
    expect(parsed.total?.underBetPct).toBeNull();
  });

  it("rejects invalid timestamps", () => {
    expect(safeParseBettingSplitSnapshot({
      ...NFL_BETTING_SPLIT_FIXTURE,
      capturedAt: "September 10, 2026",
    }).success).toBe(false);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects a non-finite market number: %s",
    (currentLine) => {
      const candidate = {
        ...NFL_BETTING_SPLIT_FIXTURE,
        total: { ...NFL_BETTING_SPLIT_FIXTURE.total!, currentLine },
      };
      expect(safeParseBettingSplitSnapshot(candidate).success).toBe(false);
    },
  );

  it("rejects malformed nested market objects", () => {
    const { currentLine: _missing, ...malformedTotal } = NFL_BETTING_SPLIT_FIXTURE.total!;
    expect(safeParseBettingSplitSnapshot({
      ...NFL_BETTING_SPLIT_FIXTURE,
      total: malformedTotal,
    }).success).toBe(false);

    expect(safeParseBettingSplitSnapshot({
      ...NFL_BETTING_SPLIT_FIXTURE,
      spread: { ...NFL_BETTING_SPLIT_FIXTURE.spread!, unexpected: true },
    }).success).toBe(false);
  });
});
