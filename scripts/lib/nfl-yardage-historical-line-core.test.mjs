import { describe, expect, it } from "vitest";
import {
  resolveFinalPreKickoffLine,
  parseMarketArchiveJsonl,
  indexArchiveByTarget,
  resolveFinalPreKickoffLineFromIndex,
} from "./nfl-yardage-historical-line-core.mjs";

const BASE = { playerId: "gsis:00-0039851", canonicalMarket: "passingYards", gameId: "2026_01_NE_SEA" };
const KICKOFF = "2026-08-30T17:00:00.000Z";

function obs(overrides) {
  return {
    observedAt: "2026-08-29T10:00:00.000Z",
    canonicalMarket: BASE.canonicalMarket,
    playerId: BASE.playerId,
    gameId: BASE.gameId,
    bookmaker: "draftkings",
    point: 229.5,
    ...overrides,
  };
}

describe("resolveFinalPreKickoffLine", () => {
  it("picks the latest pre-kickoff observation when the line moved", () => {
    const observations = [
      obs({ observedAt: "2026-08-26T10:00:00.000Z", point: 220.5 }),
      obs({ observedAt: "2026-08-29T09:00:00.000Z", point: 225.5 }),
      obs({ observedAt: "2026-08-30T16:59:00.000Z", point: 229.5 }),
    ];
    const result = resolveFinalPreKickoffLine(observations, { ...BASE, kickoffIso: KICKOFF });
    expect(result).toEqual({ point: 229.5, bookmaker: "draftkings", observedAt: "2026-08-30T16:59:00.000Z" });
  });

  it("excludes post-kickoff observations even if they are the latest", () => {
    const observations = [
      obs({ observedAt: "2026-08-30T16:00:00.000Z", point: 225.5 }),
      obs({ observedAt: "2026-08-30T18:00:00.000Z", point: 300.5 }), // after kickoff -- must never win
    ];
    const result = resolveFinalPreKickoffLine(observations, { ...BASE, kickoffIso: KICKOFF });
    expect(result?.point).toBe(225.5);
  });

  it("resolves to null with zero observations from any approved book", () => {
    const observations = [obs({ bookmaker: "prizepicks" }), obs({ bookmaker: "novig" })];
    const result = resolveFinalPreKickoffLine(observations, { ...BASE, kickoffIso: KICKOFF });
    expect(result).toBeNull();
  });

  it("resolves to null when playerId/market/gameId do not match", () => {
    const observations = [obs({ playerId: "gsis:00-0000000" }), obs({ canonicalMarket: "rushingYards" }), obs({ gameId: "other" })];
    const result = resolveFinalPreKickoffLine(observations, { ...BASE, kickoffIso: KICKOFF });
    expect(result).toBeNull();
  });

  it("resolves to null when kickoffIso is missing or unparseable -- fails closed, never assumes pre-kickoff", () => {
    const observations = [obs({})];
    expect(resolveFinalPreKickoffLine(observations, { ...BASE, kickoffIso: null })).toBeNull();
    expect(resolveFinalPreKickoffLine(observations, { ...BASE, kickoffIso: "not-a-date" })).toBeNull();
  });

  it("breaks ties at the same observedAt using approved-sportsbook priority order", () => {
    const observations = [
      obs({ observedAt: "2026-08-30T16:00:00.000Z", bookmaker: "bovada", point: 224.5 }),
      obs({ observedAt: "2026-08-30T16:00:00.000Z", bookmaker: "draftkings", point: 229.5 }),
    ];
    const result = resolveFinalPreKickoffLine(observations, { ...BASE, kickoffIso: KICKOFF });
    expect(result?.bookmaker).toBe("draftkings");
  });

  it("resolves to null for a pre-archive historical game with no observations at all", () => {
    expect(resolveFinalPreKickoffLine([], { ...BASE, kickoffIso: KICKOFF })).toBeNull();
  });
});

describe("parseMarketArchiveJsonl", () => {
  it("parses valid lines and skips malformed ones without throwing", () => {
    const text = `${JSON.stringify(obs({}))}\nnot json\n\n${JSON.stringify(obs({ point: 10 }))}\n`;
    const parsed = parseMarketArchiveJsonl(text);
    expect(parsed).toHaveLength(2);
  });
});

describe("indexArchiveByTarget + resolveFinalPreKickoffLineFromIndex", () => {
  it("resolves the same result as the unindexed function", () => {
    const observations = [obs({ observedAt: "2026-08-29T09:00:00.000Z", point: 225.5 })];
    const index = indexArchiveByTarget(observations);
    const result = resolveFinalPreKickoffLineFromIndex(index, { ...BASE, kickoffIso: KICKOFF });
    expect(result?.point).toBe(225.5);
  });

  it("returns null for a target with no indexed observations", () => {
    const index = indexArchiveByTarget([obs({})]);
    const result = resolveFinalPreKickoffLineFromIndex(index, { ...BASE, gameId: "no-such-game", kickoffIso: KICKOFF });
    expect(result).toBeNull();
  });
});
