import { describe, expect, it } from "vitest";
import { decodeTheOddsApiOdds, TheOddsApiWireError } from "./theOddsApiWire";
import {
  THE_ODDS_API_CFB_ODDS_FIXTURE,
  THE_ODDS_API_NFL_ODDS_FIXTURE,
} from "./__fixtures__/theOddsApiWireFixtures";

describe("decodeTheOddsApiOdds", () => {
  it("emits one row per (event, bookmaker) across multiple events and books", () => {
    const rows = decodeTheOddsApiOdds(THE_ODDS_API_NFL_ODDS_FIXTURE);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => `${row.providerEventId}/${row.sportsbook}`)).toEqual([
      "evt-nfl-1/draftkings",
      "evt-nfl-1/fanduel",
      "evt-nfl-2/draftkings",
    ]);
  });

  it("decodes h2h, spreads and totals for a book that carries all three", () => {
    const [dk] = decodeTheOddsApiOdds(THE_ODDS_API_NFL_ODDS_FIXTURE);
    expect(dk.moneyline).toEqual({ homePrice: -140, awayPrice: 120 });
    expect(dk.spread).toEqual({
      homeLine: -2.5,
      awayLine: 2.5,
      homePrice: -110,
      awayPrice: -110,
    });
    expect(dk.total).toEqual({ line: 44.5, overPrice: -108, underPrice: -112 });
  });

  it("leaves absent markets null rather than fabricating them", () => {
    const rows = decodeTheOddsApiOdds(THE_ODDS_API_NFL_ODDS_FIXTURE);
    const fanduel = rows.find((row) => row.sportsbook === "fanduel");
    expect(fanduel?.moneyline).toBeNull();
    expect(fanduel?.total).toBeNull();
    expect(fanduel?.spread).not.toBeNull();
  });

  it("keeps american prices verbatim and does not build a consensus", () => {
    const rows = decodeTheOddsApiOdds(THE_ODDS_API_NFL_ODDS_FIXTURE);
    const event1 = rows.filter((row) => row.providerEventId === "evt-nfl-1");
    expect(event1.map((row) => row.spread?.homeLine)).toEqual([-2.5, -3]);
  });

  it("carries the bookmaker last_update as providerUpdatedAt (ISO)", () => {
    const [dk] = decodeTheOddsApiOdds(THE_ODDS_API_NFL_ODDS_FIXTURE);
    expect(dk.providerUpdatedAt).toBe("2026-09-01T06:02:11.000Z");
  });

  it("decodes college full team names for the CFB fixture", () => {
    const [row] = decodeTheOddsApiOdds(THE_ODDS_API_CFB_ODDS_FIXTURE);
    expect(row.homeTeamName).toBe("Alabama Crimson Tide");
    expect(row.awayTeamName).toBe("Auburn Tigers");
    expect(row.total?.line).toBe(52.5);
  });

  it("throws a wire error on a payload that is not Event[]", () => {
    expect(() => decodeTheOddsApiOdds({ nope: true })).toThrow(TheOddsApiWireError);
  });
});
