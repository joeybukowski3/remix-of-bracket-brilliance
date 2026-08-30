import { describe, expect, it } from "vitest";
import {
  decodeSportsDataIoBettingSplitsWire,
  SportsDataIoWireDecodeError,
} from "./sportsDataIoBettingSplitsWire";
import { normalizeSportsDataIoBettingSplits } from "./sportsDataIoBettingSplits";
import {
  NFL_GAME_BETTING_SPLIT_18001,
  NFL_GAME_BETTING_SPLIT_18002,
} from "./__fixtures__/sportsDataIoWireFixtures";

describe("decodeSportsDataIoBettingSplitsWire", () => {
  it("throws on a structurally invalid payload", () => {
    expect(() => decodeSportsDataIoBettingSplitsWire([], { league: "nfl" })).toThrow(
      SportsDataIoWireDecodeError,
    );
    expect(() =>
      decodeSportsDataIoBettingSplitsWire({ BettingMarketSplits: [] }, { league: "nfl" }),
    ).toThrow(/missing ScoreId/i);
  });

  it("decodes full-game spread/moneyline/total rows and skips props and non-full-game", () => {
    const { rows, skipped } = decodeSportsDataIoBettingSplitsWire(
      NFL_GAME_BETTING_SPLIT_18001,
      { league: "nfl" },
    );
    expect(rows).toHaveLength(6); // 2 spread + 2 moneyline + 2 total
    expect(new Set(rows.map((r) => r.MarketType))).toEqual(
      new Set(["Spread", "Moneyline", "Total"]),
    );
    expect(skipped.map((s) => s.code).sort()).toEqual(["NOT_FULL_GAME", "PLAYER_PROP"]);
  });

  it("emits percent unit, null sportsbook, and null line/price", () => {
    const { rows } = decodeSportsDataIoBettingSplitsWire(NFL_GAME_BETTING_SPLIT_18001, {
      league: "nfl",
    });
    for (const row of rows) {
      expect(row.PercentageUnit).toBe("percent");
      expect(row.Sportsbook).toBeNull();
      expect(row.Line).toBeNull();
      expect(row.Price).toBeNull();
      expect(row.BetPercentage).toBeGreaterThanOrEqual(0);
      expect(row.BetPercentage).toBeLessThanOrEqual(100);
    }
    expect(rows.find((r) => r.MarketType === "Spread")?.SpreadLineConvention).toBe(
      "team-relative",
    );
  });

  it("converts Eastern Created/LastSeen/Date to UTC", () => {
    const { rows } = decodeSportsDataIoBettingSplitsWire(NFL_GAME_BETTING_SPLIT_18001, {
      league: "nfl",
    });
    // 2026-09-08 10:00 ET (EDT) -> 14:00Z ; 2026-09-10 11:58 ET -> 15:58Z
    expect(rows[0].Created).toBe("2026-09-08T14:00:00.000Z");
    expect(rows[0].LastSeen).toBe("2026-09-10T15:58:00.000Z");
    // Date 2026-09-13 16:25 ET -> 20:25Z
    expect(rows[0].KickoffUtc).toBe("2026-09-13T20:25:00.000Z");
  });

  it("skips a split row with a malformed timestamp (fail closed) without dropping the rest", () => {
    const payload = structuredClone(NFL_GAME_BETTING_SPLIT_18002);
    payload.BettingMarketSplits[0].BettingSplits[0].Created = "not-a-timestamp";
    const { rows, skipped } = decodeSportsDataIoBettingSplitsWire(payload, { league: "nfl" });
    expect(skipped.some((s) => s.code === "MALFORMED_TIMESTAMP")).toBe(true);
    expect(rows.length).toBe(3); // 1 spread survivor + 2 total
  });

  it("skips an unsupported outcome type safely", () => {
    const payload = structuredClone(NFL_GAME_BETTING_SPLIT_18002);
    payload.BettingMarketSplits[0].BettingSplits[0].BettingOutcomeType = "Draw";
    const { skipped } = decodeSportsDataIoBettingSplitsWire(payload, { league: "nfl" });
    expect(skipped.some((s) => s.code === "UNSUPPORTED_OUTCOME")).toBe(true);
  });

  it("feeds cleanly into the WU2 normalizer", () => {
    const { rows } = decodeSportsDataIoBettingSplitsWire(NFL_GAME_BETTING_SPLIT_18001, {
      league: "nfl",
    });
    const result = normalizeSportsDataIoBettingSplits(rows, {
      capturedAt: "2026-09-10T16:00:00.000Z",
    });
    expect(result.rejected).toEqual([]);
    expect(result.normalized).toHaveLength(1);
    const event = result.normalized[0];
    expect(event.provider).toBe("sportsdataio");
    expect(event.providerGameId).toBe("18001");
    expect(event.sportsbook).toBeNull();
    expect(event.spread?.homeBetPct).toBe(64);
    expect(event.total?.overMoneyPct).toBe(61);
    expect(event.moneyline?.awayBetPct).toBe(37);
    // No line/price fabricated.
    expect(event.spread?.currentHomeLine).toBeNull();
    expect(event.moneyline?.currentHomePrice).toBeNull();
  });
});
