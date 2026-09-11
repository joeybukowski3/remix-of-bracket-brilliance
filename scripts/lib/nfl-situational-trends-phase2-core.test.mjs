import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attachDivisionalMeetingOrder,
  attachPregameQuality,
  buildSplitRecord,
  currentRestDaysBucket,
  marketRole,
  qualityBucket,
  restAdvantageSource,
  restDifferentialBucket,
  restStructureFlags,
  sampleSizeLabel,
  shortRestCadence,
  spreadBucket,
  travelDistanceBucket,
} from "./nfl-situational-trends-phase2-core.mjs";

function row(overrides) {
  return {
    rowId: `${overrides.gameId}:${overrides.team}`,
    season: 2025,
    week: 1,
    kickoffUtc: "2025-09-07T17:00:00.000Z",
    team: "buf",
    opponent: "mia",
    divisional: true,
    suResult: "W",
    pointMargin: 7,
    atsResult: "W",
    teamSpread: -3,
    atsCoverMargin: 4,
    ...overrides,
  };
}

describe("NFL situational trends Phase 2 spread and sample buckets", () => {
  it("assigns every fixed conventional spread boundary", () => {
    assert.equal(spreadBucket(-7), "favorite-7-plus");
    assert.equal(spreadBucket(-6.5), "favorite-3.5-to-6.5");
    assert.equal(spreadBucket(-3), "favorite-0.5-to-3");
    assert.equal(spreadBucket(0), "pickem");
    assert.equal(spreadBucket(0.5), "underdog-0.5-to-3");
    assert.equal(spreadBucket(3.5), "underdog-3.5-to-6.5");
    assert.equal(spreadBucket(7), "underdog-7-plus");
    assert.equal(spreadBucket(null), "unavailable");
    assert.equal(marketRole(-0.5), "favorite");
    assert.equal(marketRole(0), "pickem");
    assert.equal(marketRole(0.5), "underdog");
  });

  it("uses the declared descriptive sample-size labels", () => {
    assert.equal(sampleSizeLabel(49), "VERY SMALL");
    assert.equal(sampleSizeLabel(50), "LIMITED");
    assert.equal(sampleSizeLabel(99), "LIMITED");
    assert.equal(sampleSizeLabel(100), "MODERATE");
    assert.equal(sampleSizeLabel(199), "MODERATE");
    assert.equal(sampleSizeLabel(200), "LARGER");
  });

  it("assigns the fixed full, recent, and era windows without optimizing cutoffs", () => {
    const rows = [2011, 2018, 2019, 2020, 2021, 2025, 2026].map((season, index) => row({
      gameId: `window-${season}`,
      season,
      atsResult: index % 2 ? "L" : "W",
      suResult: index % 2 ? "L" : "W",
      teamPregameQuality: { winPct: 0.5, averagePointDifferential: 0 },
      opponentPregameQuality: { winPct: 0.5, averagePointDifferential: 0 },
    }));
    const split = buildSplitRecord({ trendId: "test", parentRule: "test", splitId: "test/all", splitLabel: "All", splitDefinition: "test", rows });
    assert.equal(split.fullHistoryMetrics.qualifyingTeamGames, 6);
    assert.equal(split.recentFormMetrics.qualifyingTeamGames, 2);
    assert.equal(split.eraMetrics.olderEra.qualifyingTeamGames, 2);
    assert.equal(split.eraMetrics.newerEra.qualifyingTeamGames, 4);
  });
});

describe("NFL situational trends Phase 2 pregame quality", () => {
  it("uses only prior same-season games and joins the opponent's matching pregame state", () => {
    const rows = [
      row({ gameId: "g1", team: "buf", opponent: "mia", kickoffUtc: "2025-09-07T17:00:00.000Z", suResult: "W", pointMargin: 7 }),
      row({ gameId: "g1", team: "mia", opponent: "buf", kickoffUtc: "2025-09-07T17:00:00.000Z", suResult: "L", pointMargin: -7 }),
      row({ gameId: "g2", team: "buf", opponent: "nyj", kickoffUtc: "2025-09-14T17:00:00.000Z", suResult: "L", pointMargin: -3 }),
      row({ gameId: "g2", team: "nyj", opponent: "buf", kickoffUtc: "2025-09-14T17:00:00.000Z", suResult: "W", pointMargin: 3 }),
      row({ gameId: "g3", team: "buf", opponent: "ne", kickoffUtc: "2026-09-13T17:00:00.000Z", season: 2026, suResult: "W", pointMargin: 30 }),
      row({ gameId: "g3", team: "ne", opponent: "buf", kickoffUtc: "2026-09-13T17:00:00.000Z", season: 2026, suResult: "L", pointMargin: -30 }),
    ];
    const annotated = attachPregameQuality(rows);
    const first = annotated.find((item) => item.rowId === "g1:buf");
    const second = annotated.find((item) => item.rowId === "g2:buf");
    const newSeason = annotated.find((item) => item.rowId === "g3:buf");
    assert.deepEqual(first.teamPregameQuality, { gamesPlayed: 0, wins: 0, losses: 0, ties: 0, winPct: null, averagePointDifferential: null, bucket: "no-prior-games" });
    assert.equal(second.teamPregameQuality.winPct, 1);
    assert.equal(second.teamPregameQuality.averagePointDifferential, 7);
    assert.equal(second.opponentPregameQuality.gamesPlayed, 0);
    assert.equal(newSeason.teamPregameQuality.gamesPlayed, 0);
  });

  it("classifies quality without end-of-season leakage", () => {
    assert.equal(qualityBucket({ gamesPlayed: 2, winPct: 1 }), "winning-record");
    assert.equal(qualityBucket({ gamesPlayed: 2, winPct: 0.5 }), "even-record");
    assert.equal(qualityBucket({ gamesPlayed: 2, winPct: 0 }), "losing-record");
    assert.equal(qualityBucket({ gamesPlayed: 0, winPct: null }), "no-prior-games");
  });
});

describe("NFL situational trends Phase 2 divisional chronology", () => {
  it("assigns first and second meetings by kickoff within the same season", () => {
    const rows = [
      row({ gameId: "late", team: "buf", opponent: "mia", kickoffUtc: "2025-12-07T18:00:00.000Z" }),
      row({ gameId: "late", team: "mia", opponent: "buf", kickoffUtc: "2025-12-07T18:00:00.000Z" }),
      row({ gameId: "early", team: "buf", opponent: "mia", kickoffUtc: "2025-09-07T17:00:00.000Z" }),
      row({ gameId: "early", team: "mia", opponent: "buf", kickoffUtc: "2025-09-07T17:00:00.000Z" }),
      row({ gameId: "next-season", team: "buf", opponent: "mia", season: 2026, kickoffUtc: "2026-10-01T17:00:00.000Z" }),
      row({ gameId: "next-season", team: "mia", opponent: "buf", season: 2026, kickoffUtc: "2026-10-01T17:00:00.000Z" }),
    ];
    const annotated = attachDivisionalMeetingOrder(rows);
    assert.ok(annotated.filter((item) => item.gameId === "early").every((item) => item.divisionalMeetingNumber === 1));
    assert.ok(annotated.filter((item) => item.gameId === "late").every((item) => item.divisionalMeetingNumber === 2));
    assert.ok(annotated.filter((item) => item.gameId === "next-season").every((item) => item.divisionalMeetingNumber === 1));
  });
});

describe("NFL situational trends Phase 2 rest structures", () => {
  it("classifies schedule structures and differential bands deterministically", () => {
    const thursday = row({
      kickoffUtc: "2025-09-12T00:15:00.000Z",
      previousGame: { kickoffUtc: "2025-09-07T17:00:00.000Z" },
      restDays: 4,
      opponentRestDays: 7,
      restDifferential: -3,
    });
    assert.equal(restStructureFlags(thursday).thursdayAfterSunday, true);
    assert.equal(shortRestCadence(thursday), "thursday-after-sunday");
    assert.equal(restDifferentialBucket(-3), "meaningful-disadvantage");

    const monday = row({
      kickoffUtc: "2025-09-14T17:00:00.000Z",
      previousGame: { kickoffUtc: "2025-09-09T00:15:00.000Z" },
      restDays: 6,
      opponentRestDays: 7,
      restDifferential: -1,
    });
    assert.equal(restStructureFlags(monday).mondayToSunday, true);
    assert.equal(shortRestCadence(monday), "monday-to-sunday");
    assert.equal(restDifferentialBucket(-1), "small-disadvantage");

    const miniBye = row({
      kickoffUtc: "2025-09-21T17:00:00.000Z",
      previousGame: { kickoffUtc: "2025-09-12T00:15:00.000Z" },
      restDays: 10,
      opponentRestDays: 7,
      restDifferential: 3,
      postBye: false,
    });
    assert.equal(restStructureFlags(miniBye).miniByeRestEdge, true);
    assert.equal(restAdvantageSource(miniBye), "mini-bye-edge");
    assert.equal(restDifferentialBucket(3), "meaningful-advantage");
  });

  it("keeps fixed current-rest and travel-distance buckets", () => {
    assert.equal(currentRestDaysBucket(6), "short-6-or-fewer");
    assert.equal(currentRestDaysBucket(7), "normal-7");
    assert.equal(currentRestDaysBucket(9), "extended-8-to-9");
    assert.equal(currentRestDaysBucket(17), "bye-range-10-to-17");
    assert.equal(currentRestDaysBucket(18), "very-extended-18-plus");
    assert.equal(travelDistanceBucket(1999.9), "under-2000");
    assert.equal(travelDistanceBucket(2000), "2000-to-2499");
    assert.equal(travelDistanceBucket(2500), "2500-plus");
  });
});
