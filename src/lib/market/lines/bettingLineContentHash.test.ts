import { describe, expect, it } from "vitest";
import { buildBettingLineContentHash } from "./bettingLineContentHash";
import { BETTING_LINE_SCHEMA_VERSION, type BettingLineSnapshot } from "./bettingLineTypes";

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

describe("buildBettingLineContentHash", () => {
  it("is stable across observation-metadata-only changes", () => {
    const base = buildBettingLineContentHash(snapshot());
    expect(
      buildBettingLineContentHash(
        snapshot({
          capturedAt: "2026-09-02T06:00:00.000Z",
          providerUpdatedAt: "2026-09-02T05:00:00.000Z",
          lastObservedAt: "2026-09-02T06:00:00.000Z",
        }),
      ),
    ).toBe(base);
  });

  it("changes when a market number changes", () => {
    const base = buildBettingLineContentHash(snapshot());
    expect(
      buildBettingLineContentHash(
        snapshot({ spread: { homeLine: -3, awayLine: 3, homePrice: -110, awayPrice: -110 } }),
      ),
    ).not.toBe(base);
  });

  it("changes when the sportsbook changes", () => {
    expect(buildBettingLineContentHash(snapshot({ sportsbook: "fanduel" }))).not.toBe(
      buildBettingLineContentHash(snapshot()),
    );
  });
});
