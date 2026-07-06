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
} from "./mlb-numerology-tracking.mjs";

const rawPayload = {
  date: "2026-07-06",
  generatedAt: "2026-07-06T12:00:00Z",
  modelVersion: "fixture",
  games: [
    { gameKey: "NYY@TB", matchup: "NYY @ TB" },
  ],
  batters: [
    {
      player: "Ben Rice",
      playerId: 700250,
      gameId: 822958,
      team: "NYY",
      opponent: "TB",
      gameKey: "NYY@TB",
      battingOrder: 2,
      position: "1B",
      opposingPitcher: "Griffin Jax",
      ballpark: "Tropicana Field",
      hrScore: 88,
      hrScoreRank: 1,
      last7HR: 2,
      last30HR: 6,
      hrOddsYes: "+300",
      explanation: "Power profile.",
    },
    {
      player: "Aaron Judge",
      playerId: 592450,
      gameId: 822958,
      team: "NYY",
      opponent: "TB",
      gameKey: "NYY@TB",
      battingOrder: 3,
      position: "RF",
      opposingPitcher: "Griffin Jax",
      ballpark: "Tropicana Field",
      hrScore: 66,
      hrScoreRank: 2,
      last7HR: 1,
      last30HR: 4,
      hrOddsYes: "+250",
      explanation: "Strong HR score.",
    },
    {
      player: "Low Signal",
      playerId: 111111,
      gameId: 822958,
      team: "AAA",
      opponent: "BBB",
      gameKey: "AAA@BBB",
      battingOrder: 9,
      position: "DH",
      opposingPitcher: "Pitcher",
      ballpark: "Test Park",
      hrScore: 41,
      hrScoreRank: 99,
      last7HR: 0,
      last30HR: 0,
      hrOddsYes: "+900",
    },
  ],
};

describe("MLB numerology tracking", () => {
  it("computes deterministic numerology scores", () => {
    const result = computeNumerologyScore(rawPayload.batters[0], "2026-07-06");
    expect(result.dailyNumber).toBe(5);
    expect(result.numerologyScore).toBeGreaterThan(50);
    expect(result.matchedSignals.length).toBeGreaterThan(0);
  });

  it("selects the top play and filters plays over 50", () => {
    const card = buildDailyNumerologyCard(rawPayload, { date: "2026-07-06" });
    expect(card.topPlay.player).toBe("Ben Rice");
    expect(card.allQualifiedPlaysOver50.length).toBeGreaterThan(0);
    expect(card.allQualifiedPlaysOver50.every((play) => play.numerologyScore > 50)).toBe(true);
  });

  it("builds pending tracking records for top play and over-50 plays", () => {
    const card = buildDailyNumerologyCard(rawPayload, { date: "2026-07-06" });
    const records = buildTrackingRecordsFromCard(card);
    expect(records.some((record) => record.selectionType === "top-play")).toBe(true);
    expect(records.some((record) => record.selectionType === "over-50")).toBe(true);
    expect(records.every((record) => record.resultStatus === "pending")).toBe(true);
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

  it("renders preview email text without implying locks", () => {
    const card = buildDailyNumerologyCard(rawPayload, { date: "2026-07-06" });
    const performance = mergePerformanceRecords({ records: [] }, buildTrackingRecordsFromCard(card));
    const summary = summarizePerformance(performance, "2026-07-06");
    const text = renderEmailText(card, summary);
    expect(text).toContain("MLB Numerology Plays");
    expect(text).toContain("Experimental numerology/model signals only");
    expect(text.toLowerCase()).not.toContain("lock");
    expect(text.toLowerCase()).not.toContain("guaranteed");
  });
});
