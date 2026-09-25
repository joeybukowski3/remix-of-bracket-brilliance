import { describe, expect, it } from "vitest";
import { assessNflDkSplitsAvailability, bettingSplitsForGame, moneyGap, NFL_DK_SPLITS_FRESH_MAX_MS, nflDkBettingSplitsSchema, publicGap } from "./bettingSplitsData";

const at = "2026-09-24T20:45:18.000Z";
const side = (name: string, team: string | undefined, line: number | null, handlePct: number, betsPct: number) => ({
  side: name, ...(team ? { team } : {}), line, odds: -110, handlePct, betsPct, capturedAt: at,
});
const artifact = {
  schemaVersion: "nfl-dk-betting-splits-v1",
  _meta: {
    generatedAt: "2026-09-24T20:46:00.000Z", sourceCapturedAt: at, captureEndAt: at,
    season: 2026, week: 3, source: "DraftKings Network / DraftKings Sportsbook",
    sourceUrls: { spread: "https://dknetwork.draftkings.com/spread", moneyline: "https://dknetwork.draftkings.com/moneyline", total: "https://dknetwork.draftkings.com/total" },
    diagnostics: { pagesFetched: 3, rowsSeen: 3, sidesSeen: 6, matchedGames: 1, unmatchedRows: 0, duplicateRows: 0, missingMarkets: 0, adjacentWeekRows: 0, adjacentWeekGames: 0, selectedWeekGamesSeen: 1, malformedRows: 0, canonicalWeekGames: 1, alreadyStartedGames: 0, eligiblePregameGames: 1, matchedEligibleGames: 1, missingEligibleGames: 0, missingEligibleGameIds: [], issues: [] },
  },
  games: [{
    gameId: "2026_03_ATL_GB", season: 2026, seasonType: "REG", week: 3, kickoffUtc: "2026-09-25T00:15:00.000Z", away: "atl", home: "gb",
    markets: {
      spread: [side("away", "atl", 4.5, 31, 30), side("home", "gb", -4.5, 69, 70)],
      moneyline: [side("away", "atl", null, 40, 45), side("home", "gb", null, 60, 55)],
      total: [side("over", undefined, 45.5, 51, 50), side("under", undefined, 45.5, 49, 50)],
    },
  }],
};

describe("NFL DK betting splits read contract", () => {
  it("accepts a complete current slate and finds a canonical game", () => {
    const parsed = nflDkBettingSplitsSchema.parse(artifact);
    expect(bettingSplitsForGame(parsed, "2026_03_ATL_GB")?.away).toBe("atl");
    expect(bettingSplitsForGame(parsed, "absent")).toBeNull();
  });

  it("rejects incomplete markets, invalid percentages, duplicate games, and timestamps", () => {
    const copy = () => structuredClone(artifact);
    const incomplete = copy(); incomplete.games[0].markets.total.pop();
    expect(nflDkBettingSplitsSchema.safeParse(incomplete).success).toBe(false);
    const percent = copy(); percent.games[0].markets.spread[0].handlePct = 101;
    expect(nflDkBettingSplitsSchema.safeParse(percent).success).toBe(false);
    const duplicate = copy(); duplicate.games.push(structuredClone(duplicate.games[0]));
    expect(nflDkBettingSplitsSchema.safeParse(duplicate).success).toBe(false);
    const times = copy(); times._meta.sourceCapturedAt = "2026-09-24T21:00:00.000Z";
    expect(nflDkBettingSplitsSchema.safeParse(times).success).toBe(false);
    const stale = copy(); stale._meta.sourceCapturedAt = "2026-09-25T12:10:15.000Z"; stale._meta.captureEndAt = stale._meta.sourceCapturedAt; stale._meta.generatedAt = stale._meta.sourceCapturedAt;
    expect(nflDkBettingSplitsSchema.safeParse(stale).success).toBe(false);
    const coverage = copy(); coverage._meta.diagnostics.missingEligibleGames = 1;
    expect(nflDkBettingSplitsSchema.safeParse(coverage).success).toBe(false);
  });

  it("derives gaps without persisting heuristic labels", () => {
    expect(moneyGap({ handlePct: 69, betsPct: 70 })).toBe(-1);
    expect(publicGap({ handlePct: 69, betsPct: 70 })).toBe(1);
    expect(moneyGap({ handlePct: 50, betsPct: 50 })).toBe(0);
  });

  it("classifies a valid current-week artifact from source capture age, not generation time", () => {
    const expected = { season: 2026, week: 3 };
    const at = Date.parse(artifact._meta.sourceCapturedAt);
    const fresh = assessNflDkSplitsAvailability(artifact, expected, at + NFL_DK_SPLITS_FRESH_MAX_MS);
    expect(fresh.freshness).toBe("fresh");
    expect(fresh.sourceCapturedAt).toBe(artifact._meta.sourceCapturedAt);
    expect(fresh.generatedAt).toBe(artifact._meta.generatedAt);
    expect(fresh.source).toBe(artifact._meta.source);
    expect(fresh.ageMs).toBe(NFL_DK_SPLITS_FRESH_MAX_MS);
    expect(fresh.season).toBe(2026);
    expect(fresh.week).toBe(3);
    const regenerated = structuredClone(artifact);
    regenerated._meta.generatedAt = new Date(at + 7 * 60 * 60 * 1000).toISOString();
    expect(assessNflDkSplitsAvailability(regenerated, expected, at + 7 * 60 * 60 * 1000).reason).toBe("age");
  });

  it("marks a previous-week artifact stale even if captured recently", () => {
    const result = assessNflDkSplitsAvailability(artifact, { season: 2026, week: 4 }, Date.parse(artifact._meta.sourceCapturedAt) + 60_000);
    expect(result.freshness).toBe("stale");
    expect(result.reason).toBe("week_mismatch");
    expect(result.artifact?.games).toHaveLength(1);
  });

  it("marks missing, malformed, and implausibly future artifacts unavailable", () => {
    const expected = { season: 2026, week: 3 };
    expect(assessNflDkSplitsAvailability(null, expected).freshness).toBe("unavailable");
    expect(assessNflDkSplitsAvailability({ schemaVersion: "wrong" }, expected).reason).toBe("invalid_artifact");
    const beforeCapture = Date.parse(artifact._meta.sourceCapturedAt) - 6 * 60_000;
    expect(assessNflDkSplitsAvailability(artifact, expected, beforeCapture).reason).toBe("future_timestamp");
    const futureGenerated = structuredClone(artifact);
    futureGenerated._meta.generatedAt = new Date(Date.parse(artifact._meta.generatedAt) + 10 * 60 * 1000).toISOString();
    expect(assessNflDkSplitsAvailability(futureGenerated, expected, Date.parse(artifact._meta.generatedAt)).reason).toBe("future_timestamp");
  });
});
