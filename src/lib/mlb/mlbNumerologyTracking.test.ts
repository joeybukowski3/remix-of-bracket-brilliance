import { describe, expect, it } from "vitest";
import {
  applyStatLineToRecord,
  buildDailyNumerologyCard,
  buildTrackingRecordsFromCard,
  computeNumerologyScore,
  extractBattingStatLine,
  mergePerformanceRecords,
  renderEmailText,
  summarizePerformance,
} from "../../../scripts/lib/mlb-numerology-tracking.mjs";

const liveBoardPayload = {
  date: "2026-07-06",
  generatedAt: "2026-07-06T12:00:00Z",
  methodologyVersion: "3.0.0",
  generationMode: "live",
  dataStatus: "confirmed",
  dailyProfile: {
    universalDayCompound: 23,
    universalDayRoot: 5,
  },
  exactNumberMatches: [
    {
      playerId: 1001,
      playerName: "Live Board Leader",
      team: "NYY",
      opponent: "TB",
      opposingPitcher: "Pitcher A",
      lineupStatus: "confirmed",
      battingOrder: 2,
      jerseyNumber: 23,
      numerologyScore: 72,
      baseballScore: 44,
      recommendedMarket: "Home run",
      matches: [{ field: "jersey", value: 23, label: "Jersey #23" }],
      scoreBreakdown: {
        signals: [{ field: "jersey", label: "Jersey 23 — Exact Target", type: "primary_exact_root", points: 22, description: "Exact target." }],
      },
      recentActivity: { qualifiesDefault: true, atBatsPrevious2: 4, atBatsPrevious5: 10 },
    },
    {
      playerId: 1002,
      playerName: "No HR Match Qualifier",
      team: "BOS",
      opponent: "TOR",
      opposingPitcher: "Pitcher B",
      lineupStatus: "projected",
      battingOrder: 4,
      jerseyNumber: 5,
      numerologyScore: 61,
      baseballScore: 60,
      recommendedMarket: "Home run",
      matches: [{ field: "birthDay", value: 23, label: "Born on day 23" }],
      recentActivity: { atBatsPrevious2: 3, atBatsPrevious5: 9 },
    },
    {
      playerId: 1003,
      playerName: "Inactive Qualifier",
      team: "LAD",
      opponent: "COL",
      numerologyScore: 90,
      baseballScore: 90,
      recommendedMarket: "Home run",
      matches: [{ field: "jersey", value: 23, label: "Jersey #23" }],
      recentActivity: { qualifiesDefault: false, atBatsPrevious2: 1, atBatsPrevious5: 1 },
    },
  ],
  rootNumberMatches: [
    {
      playerId: 1004,
      playerName: "Root Qualifier",
      team: "SEA",
      opponent: "OAK",
      opposingPitcher: "Pitcher C",
      lineupStatus: "unknown",
      battingOrder: null,
      jerseyNumber: 14,
      numerologyScore: 55,
      baseballScore: 88,
      recommendedMarket: "Home run",
      matches: [{ field: "expression", value: 5, label: "Expression root 5" }],
    },
    {
      playerId: 1005,
      playerName: "Below Threshold",
      team: "KC",
      opponent: "PHI",
      numerologyScore: 49,
      baseballScore: 99,
      recommendedMarket: "Home run",
      matches: [{ field: "age", value: 5, label: "Age root 5" }],
      recentActivity: { atBats: 3 },
    },
  ],
};

const hrPropsPayload = {
  date: "2026-07-06",
  generatedAt: "2026-07-06T12:30:00Z",
  modelVersion: "hr-fixture",
  batters: [
    {
      player: "Live Board Leader",
      playerId: 1001,
      gameId: 9001,
      gameKey: "NYY@TB",
      team: "NYY",
      opponent: "TB",
      opposingPitcher: "Pitcher A",
      pitcherHand: "R",
      ballpark: "Test Park",
      hrScore: 30,
      hrScoreRank: 12,
      hrOddsYes: "+450",
      hrOddsBook: "draftkings",
      marketImpliedProbability: 0.1818,
      barrelRate: 12.3,
      hardHitRate: 48.1,
      iso: 0.251,
      last7HR: 1,
      last30HR: 6,
      opposingPitcherHrVs: 61.2,
      explanation: "HR enrichment should attach to the live-board leader.",
    },
    {
      player: "HR Props Darling",
      playerId: 9999,
      gameId: 9002,
      gameKey: "LAD@COL",
      team: "LAD",
      opponent: "COL",
      hrScore: 99,
      hrScoreRank: 1,
      hrOddsYes: "+200",
    },
    {
      player: "Root Qualifier",
      playerId: 1004,
      gameId: 9003,
      gameKey: "SEA@OAK",
      team: "SEA",
      opponent: "OAK",
      hrScore: 82,
      hrScoreRank: 2,
      hrOddsYes: "+330",
      hrOddsBook: "fanduel",
    },
  ],
};

const oldHrRow = {
  player: "Ben Rice",
  playerId: 700250,
  gameId: 822958,
  team: "NYY",
  opponent: "TB",
  gameKey: "NYY@TB",
  battingOrder: 2,
  hrScore: 88,
  last7HR: 2,
  last30HR: 6,
};

describe("MLB numerology tracking", () => {
  it("keeps the legacy standalone score helper deterministic for compatibility", () => {
    const result = computeNumerologyScore(oldHrRow, "2026-07-06");
    expect(result.dailyNumber).toBe(5);
    expect(result.numerologyScore).toBeGreaterThan(50);
    expect(result.matchedSignals.length).toBeGreaterThan(0);
  });

  it("selects the top play from numerology-daily live board, not HR props", () => {
    const card = buildDailyNumerologyCard(liveBoardPayload, { date: "2026-07-06", hrPayload: hrPropsPayload });
    expect(card.source.primary).toBe("numerology-daily.json");
    expect(card.topPlay?.player).toBe("Live Board Leader");
    expect(card.topPlay?.numerologyScore).toBe(72);
    expect(card.plays.some((play) => play.player === "HR Props Darling")).toBe(false);
    expect(card.plays.some((play) => play.player === "Inactive Qualifier")).toBe(false);
  });

  it("filters all plays over 50 from the mock live-board payload", () => {
    const card = buildDailyNumerologyCard(liveBoardPayload, { date: "2026-07-06", hrPayload: hrPropsPayload });
    expect(card.allQualifiedPlaysOver50.map((play) => play.player)).toEqual([
      "Live Board Leader",
      "No HR Match Qualifier",
      "Root Qualifier",
    ]);
    expect(card.allQualifiedPlaysOver50.every((play) => play.numerologyScore > 50)).toBe(true);
  });

  it("adds HR props enrichment without changing live-board numerologyScore", () => {
    const card = buildDailyNumerologyCard(liveBoardPayload, { date: "2026-07-06", hrPayload: hrPropsPayload });
    const top = card.topPlay;
    expect(top?.hrEnrichmentStatus).toBe("enriched");
    expect(top?.gameId).toBe(9001);
    expect(top?.hrOddsYes).toBe("+450");
    expect(top?.marketImpliedProbability).toBe(0.1818);
    expect(top?.numerologyScore).toBe(72);
  });

  it("keeps qualifying live-board players when there is no HR props match", () => {
    const card = buildDailyNumerologyCard(liveBoardPayload, { date: "2026-07-06", hrPayload: hrPropsPayload });
    const play = card.allQualifiedPlaysOver50.find((item) => item.player === "No HR Match Qualifier");
    expect(play).toBeTruthy();
    expect(play?.hrEnrichmentStatus).toBe("no-hr-match");
    expect(play?.numerologyScore).toBe(61);
  });

  it("builds tracking records with pending and missing-game-id statuses", () => {
    const card = buildDailyNumerologyCard(liveBoardPayload, { date: "2026-07-06", hrPayload: hrPropsPayload });
    const records = buildTrackingRecordsFromCard(card);
    expect(records.some((record) => record.selectionType === "top-play")).toBe(true);
    expect(records.some((record) => record.selectionType === "over-50")).toBe(true);
    expect(records.find((record) => record.player === "No HR Match Qualifier")?.resultStatus).toBe("missing-data");
    expect(records.find((record) => record.player === "No HR Match Qualifier")?.source).toBe("missing-game-id");
  });

  it("extracts and grades a finalized batting stat line", () => {
    const statLine = extractBattingStatLine({
      stats: {
        batting: {
          atBats: 4,
          hits: 2,
          runs: 1,
          rbi: 3,
          baseOnBalls: 1,
          strikeOuts: 1,
          totalBases: 5,
          homeRuns: 1,
          stolenBases: 0,
        },
      },
    });
    const record = applyStatLineToRecord({ id: "record-1" }, statLine);
    expect(record.resultStatus).toBe("final");
    expect(record.hitHomeRun).toBe(true);
    expect(record.stats.totalBases).toBe(5);
  });

  it("summarizes top-play and over-50 performance", () => {
    const payload = mergePerformanceRecords({ records: [] }, [
      {
        id: "top|1",
        date: "2026-07-06",
        selectionType: "top-play",
        resultStatus: "final",
        hitHomeRun: true,
        stats: { hits: 2, totalBases: 5, rbi: 3, runs: 1, atBats: 4 },
      },
      {
        id: "over|1",
        date: "2026-07-06",
        selectionType: "over-50",
        resultStatus: "final",
        hitHomeRun: false,
        stats: { hits: 1, totalBases: 1, rbi: 0, runs: 0, atBats: 4 },
      },
    ]);
    const summary = summarizePerformance(payload, "2026-07-06");
    expect(summary.topPlay.hrHits).toBe(1);
    expect(summary.over50.hrHits).toBe(0);
    expect(summary.allTime.finalized).toBe(2);
  });

  it("renders preview email text with live link, relevant stats, and safety framing", () => {
    const card = buildDailyNumerologyCard(liveBoardPayload, { date: "2026-07-06", hrPayload: hrPropsPayload });
    const performance = mergePerformanceRecords({ records: [] }, buildTrackingRecordsFromCard(card));
    const summary = summarizePerformance(performance, "2026-07-06");
    const text = renderEmailText(card, summary);
    expect(text).toContain("https://www.joeknowsball.com/mlb/numerology");
    expect(text).toContain("TOP PLAY");
    expect(text).toContain("Live Board Leader");
    expect(text).toContain("ALL PLAYS OVER 50");
    expect(text).toContain("No HR Match Qualifier");
    expect(text).toContain("Jersey 23");
    expect(text).toContain("4 AB previous 2 games");
    expect(text).toContain("Experimental numerology/model signals only");
    expect(text).toContain("Not guaranteed");
    expect(text).toContain("Not validated betting edges");
  });
});
