import { describe, expect, expectTypeOf, it } from "vitest";
import type { NormalizedProviderBettingSplit } from "./normalizedProviderBettingSplits";
import {
  normalizeSportsDataIoBettingSplits,
  type SportsDataIoBettingSplitRowDto,
} from "./sportsDataIoBettingSplits";
import {
  BAD_PERCENTAGE_SPORTSDATAIO_ROWS,
  COMPLETE_CFB_SPORTSDATAIO_ROWS,
  COMPLETE_NFL_SPORTSDATAIO_ROWS,
  CONFLICTING_TOTAL_LINE_SPORTSDATAIO_ROWS,
  DUPLICATE_CONFLICTING_SIDE_SPORTSDATAIO_ROWS,
  MISSING_COMPLEMENTARY_PERCENTAGE_ROWS,
  MULTIPLE_SPORTSBOOK_SPORTSDATAIO_ROWS,
  ONLY_SPREAD_SPORTSDATAIO_ROWS,
  PROVIDER_OPENING_VALUE_ABSENT_SPORTSDATAIO_ROWS,
  SPORTSDATAIO_FIXTURE_CAPTURED_AT,
  UNKNOWN_MARKET_SPORTSDATAIO_ROWS,
  UNKNOWN_OUTCOME_SPORTSDATAIO_ROWS,
} from "./__fixtures__/sportsDataIoBettingSplitsFixtures";

const normalize = (rows: readonly SportsDataIoBettingSplitRowDto[]) =>
  normalizeSportsDataIoBettingSplits(rows, { capturedAt: SPORTSDATAIO_FIXTURE_CAPTURED_AT });

describe("normalizeSportsDataIoBettingSplits", () => {
  it("normalizes a complete NFL event into the provider-neutral pre-join contract", () => {
    const result = normalize(COMPLETE_NFL_SPORTSDATAIO_ROWS);

    expect(result.rejected).toEqual([]);
    expect(result.normalized).toHaveLength(1);
    expect(result.normalized[0]).toMatchObject({
      schemaVersion: "jkb-normalized-provider-betting-splits-v1",
      league: "nfl",
      season: 2026,
      week: 1,
      provider: "sportsdataio",
      providerGameId: "1001",
      providerAwayTeamId: "7",
      providerHomeTeamId: "28",
      sportsbook: null,
    });
  });

  it("normalizes NCAA Football to CFB and tagged fractions to 0-100 percentages", () => {
    const result = normalize(COMPLETE_CFB_SPORTSDATAIO_ROWS);
    const snapshot = result.normalized[0];

    expect(result.rejected).toEqual([]);
    expect(snapshot.league).toBe("cfb");
    expect(snapshot.providerGameId).toBe("cfb-2001");
    expect(snapshot.spread).toMatchObject({
      homeBetPct: 54,
      awayBetPct: 46,
      homeMoneyPct: 63,
      awayMoneyPct: 37,
    });
    expect(snapshot.moneyline?.homeBetPct).toBe(57);
  });

  it("keeps an unidentified aggregate/source as null without inventing consensus", () => {
    const snapshot = normalize(COMPLETE_NFL_SPORTSDATAIO_ROWS).normalized[0];
    expect(snapshot.sportsbook).toBeNull();
    expect(JSON.stringify(snapshot)).not.toContain("consensus");
  });

  it.each([
    ["negative", -0.01, "percent"],
    ["over 100 percent", 100.01, "percent"],
    ["fraction over one", 1.01, "fraction"],
    ["NaN", Number.NaN, "percent"],
    ["infinity", Number.POSITIVE_INFINITY, "percent"],
  ] as const)("quarantines an invalid percentage: %s", (_label, BetPercentage, PercentageUnit) => {
    const row = { ...BAD_PERCENTAGE_SPORTSDATAIO_ROWS[0], BetPercentage, PercentageUnit };
    const result = normalize([row]);

    expect(result.normalized).toEqual([]);
    expect(result.rejected.map((item) => item.code)).toContain("INVALID_PERCENTAGE");
  });

  it("does not accept malformed numeric strings at runtime", () => {
    const malformed = {
      ...BAD_PERCENTAGE_SPORTSDATAIO_ROWS[0],
      BetPercentage: "63",
    } as unknown as SportsDataIoBettingSplitRowDto;
    const result = normalize([malformed]);

    expect(result.normalized).toEqual([]);
    expect(result.rejected.map((item) => item.code)).toContain("INVALID_PERCENTAGE");
  });

  it("does not fabricate complementary percentages", () => {
    const total = normalize(MISSING_COMPLEMENTARY_PERCENTAGE_ROWS).normalized[0].total;
    expect(total).toMatchObject({
      overBetPct: 57,
      underBetPct: null,
      overMoneyPct: 62,
      underMoneyPct: null,
    });
  });

  it("preserves home/away spread orientation and the team-relative favorite sign", () => {
    const spread = normalize(COMPLETE_NFL_SPORTSDATAIO_ROWS).normalized[0].spread;
    expect(spread).toMatchObject({
      currentHomeLine: -3.5,
      currentAwayLine: 3.5,
      homeBetPct: 64,
      awayBetPct: 36,
    });
  });

  it("converts an explicitly home-relative away row without inverting the favorite", () => {
    const rows = ONLY_SPREAD_SPORTSDATAIO_ROWS.map((row) => ({
      ...row,
      SpreadLineConvention: "home-relative" as const,
      Line: -3.5,
    }));
    const spread = normalize(rows).normalized[0].spread;

    expect(spread?.currentHomeLine).toBe(-3.5);
    expect(spread?.currentAwayLine).toBe(3.5);
  });

  it("rejects a spread row when its sign convention is not explicit", () => {
    const row: SportsDataIoBettingSplitRowDto = { ...ONLY_SPREAD_SPORTSDATAIO_ROWS[0] };
    delete row.SpreadLineConvention;
    const result = normalize([row]);
    expect(result.rejected.map((item) => item.code)).toContain("INVALID_LINE");
  });

  it("stores one total line with correctly oriented over/under splits", () => {
    const total = normalize(COMPLETE_NFL_SPORTSDATAIO_ROWS).normalized[0].total;
    expect(total).toEqual({
      openingLine: null,
      currentLine: 45.5,
      overBetPct: 57,
      underBetPct: 43,
      overMoneyPct: 61,
      underMoneyPct: 39,
    });
  });

  it("quarantines a total market when over and under lines conflict", () => {
    const result = normalize([
      ...ONLY_SPREAD_SPORTSDATAIO_ROWS,
      ...CONFLICTING_TOTAL_LINE_SPORTSDATAIO_ROWS,
    ]);

    expect(result.normalized[0].spread).not.toBeNull();
    expect(result.normalized[0].total).toBeNull();
    expect(result.rejected).toContainEqual(expect.objectContaining({
      code: "INCONSISTENT_TOTAL_LINE",
      market: "total",
    }));
  });

  it("preserves conventional American prices and moneyline orientation", () => {
    const moneyline = normalize(COMPLETE_NFL_SPORTSDATAIO_ROWS).normalized[0].moneyline;
    expect(moneyline).toMatchObject({
      currentHomePrice: -175,
      currentAwayPrice: 150,
      homeBetPct: 63,
      awayBetPct: 37,
    });
  });

  it("keeps unavailable markets null", () => {
    const snapshot = normalize(ONLY_SPREAD_SPORTSDATAIO_ROWS).normalized[0];
    expect(snapshot.spread).not.toBeNull();
    expect(snapshot.total).toBeNull();
    expect(snapshot.moneyline).toBeNull();
  });

  it("quarantines an unsupported market without contaminating supported markets", () => {
    const result = normalize(UNKNOWN_MARKET_SPORTSDATAIO_ROWS);
    expect(result.normalized[0].spread).not.toBeNull();
    expect(result.normalized[0].total).toBeNull();
    expect(result.rejected).toContainEqual(expect.objectContaining({ code: "UNSUPPORTED_MARKET" }));
  });

  it("quarantines an unknown outcome without fabricating a total", () => {
    const result = normalize(UNKNOWN_OUTCOME_SPORTSDATAIO_ROWS);
    expect(result.normalized[0].spread).not.toBeNull();
    expect(result.normalized[0].total).toBeNull();
    expect(result.rejected).toContainEqual(expect.objectContaining({ code: "UNKNOWN_OUTCOME" }));
  });

  it("maps collector and provider timestamps independently and deterministically", () => {
    const rows = COMPLETE_NFL_SPORTSDATAIO_ROWS.map((row, index) => ({
      ...row,
      Created: index === 0 ? "2026-09-08T13:00:00-01:00" : row.Created,
      LastSeen: index === 1 ? "2026-09-10T16:59:00+01:00" : row.LastSeen,
    }));
    const snapshot = normalize(rows).normalized[0];

    expect(snapshot.capturedAt).toBe("2026-09-10T16:00:00.000Z");
    expect(snapshot.providerCreatedAt).toBe("2026-09-08T14:00:00.000Z");
    expect(snapshot.providerLastSeenAt).toBe("2026-09-10T15:59:00.000Z");
  });

  it("never derives opening values when the boundary has no verified opening fields", () => {
    const snapshot = normalize(PROVIDER_OPENING_VALUE_ABSENT_SPORTSDATAIO_ROWS).normalized[0];
    expect(snapshot.spread).toMatchObject({ openingHomeLine: null, openingAwayLine: null });
    expect(snapshot.total).toBeNull();
    expect(snapshot.moneyline).toBeNull();
  });

  it("isolates multiple sportsbooks for the same provider game", () => {
    const result = normalize(MULTIPLE_SPORTSBOOK_SPORTSDATAIO_ROWS);

    expect(result.rejected).toEqual([]);
    expect(result.normalized).toHaveLength(2);
    expect(result.normalized.map((item) => item.sportsbook)).toEqual(["Book Alpha", "Book Beta"]);
    expect(result.normalized[0].spread?.homeBetPct).toBe(64);
    expect(result.normalized[1].spread?.homeBetPct).toBe(63);
  });

  it("quarantines a conflicting duplicate side without dropping other markets", () => {
    const result = normalize([
      ...DUPLICATE_CONFLICTING_SIDE_SPORTSDATAIO_ROWS,
      ...COMPLETE_NFL_SPORTSDATAIO_ROWS.slice(2, 4),
    ]);

    expect(result.normalized[0].spread).toBeNull();
    expect(result.normalized[0].total).not.toBeNull();
    expect(result.rejected).toContainEqual(expect.objectContaining({
      code: "DUPLICATE_CONFLICTING_OUTCOME",
      market: "spread",
    }));
  });

  it("is input-order independent for normalized records", () => {
    const forward = normalize(COMPLETE_NFL_SPORTSDATAIO_ROWS).normalized;
    const reverse = normalize([...COMPLETE_NFL_SPORTSDATAIO_ROWS].reverse()).normalized;
    expect(reverse).toEqual(forward);
  });

  it("fails unsupported sports and missing game IDs closed", () => {
    const unsupported = { ...ONLY_SPREAD_SPORTSDATAIO_ROWS[0], League: "NBA" };
    const missingId = { ...ONLY_SPREAD_SPORTSDATAIO_ROWS[1], GameId: "  " };
    const result = normalize([unsupported, missingId]);

    expect(result.normalized).toEqual([]);
    expect(result.rejected.map((item) => item.code)).toEqual(expect.arrayContaining([
      "UNSUPPORTED_LEAGUE",
      "MISSING_PROVIDER_GAME_ID",
    ]));
  });

  it("returns provider-neutral records rather than SportsDataIO DTOs", () => {
    const result = normalize(COMPLETE_NFL_SPORTSDATAIO_ROWS);
    expectTypeOf(result.normalized).toEqualTypeOf<NormalizedProviderBettingSplit[]>();
    expect(result.normalized[0]).not.toHaveProperty("MarketType");
    expect(result.normalized[0]).not.toHaveProperty("OutcomeType");
    expect(result.normalized[0]).not.toHaveProperty("BetPercentage");
  });
});
