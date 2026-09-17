import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attachSecondDivisionalMeetingContext,
  buildPhase2bVariant,
  doubleDigitClassification,
  doubleDigitMarginBand,
  favoriteSpreadBand,
  homeUnderdog,
  isMondayNight,
  isOvertimeValue,
  isSundayNight,
  priorUpsetClassification,
  previousScoreBand,
  roadFavorite,
  underdogSpreadBand,
  windowAssignments,
} from "./nfl-situational-trends-phase2b-core.mjs";

function row(overrides = {}) {
  return {
    rowId: "g1:buf",
    gameId: "g1",
    season: 2025,
    week: 1,
    kickoffUtc: "2025-09-07T17:00:00.000Z",
    team: "buf",
    opponent: "mia",
    venue: "home",
    divisional: true,
    teamSpread: 3,
    pointMargin: 7,
    atsCoverMargin: 10,
    atsResult: "W",
    suResult: "W",
    teamScore: 40,
    opponentScore: 33,
    ...overrides,
  };
}

describe("NFL situational trends Phase 2B market classifications", () => {
  it("detects home underdogs and road favorites while excluding pick'em", () => {
    assert.equal(homeUnderdog(row({ venue: "home", teamSpread: 0.5 })), true);
    assert.equal(homeUnderdog(row({ venue: "home", teamSpread: 0 })), false);
    assert.equal(homeUnderdog(row({ venue: "away", teamSpread: 3 })), false);
    assert.equal(roadFavorite(row({ venue: "away", teamSpread: -0.5 })), true);
    assert.equal(roadFavorite(row({ venue: "away", teamSpread: 0 })), false);
    assert.equal(roadFavorite(row({ venue: "home", teamSpread: -3 })), false);
  });

  it("uses only the predefined spread bands", () => {
    assert.equal(underdogSpreadBand(0.5), "underdog-0.5-to-3");
    assert.equal(underdogSpreadBand(3), "underdog-0.5-to-3");
    assert.equal(underdogSpreadBand(3.5), "underdog-3.5-to-6.5");
    assert.equal(underdogSpreadBand(6.5), "underdog-3.5-to-6.5");
    assert.equal(underdogSpreadBand(7), "underdog-7-plus");
    assert.equal(favoriteSpreadBand(-0.5), "favorite-0.5-to-3");
    assert.equal(favoriteSpreadBand(-3), "favorite-0.5-to-3");
    assert.equal(favoriteSpreadBand(-3.5), "favorite-3.5-to-6.5");
    assert.equal(favoriteSpreadBand(-6.5), "favorite-3.5-to-6.5");
    assert.equal(favoriteSpreadBand(-7), "favorite-7-plus");
  });

  it("classifies double-digit roles and only the 10-13.5 / 14+ bands", () => {
    assert.equal(doubleDigitClassification(-9.5), null);
    assert.equal(doubleDigitClassification(-10), "favorite");
    assert.equal(doubleDigitClassification(10), "underdog");
    assert.equal(doubleDigitMarginBand(-10), "10-to-13.5");
    assert.equal(doubleDigitMarginBand(13.5), "10-to-13.5");
    assert.equal(doubleDigitMarginBand(-14), "14-plus");
    assert.equal(doubleDigitMarginBand(14), "14-plus");
  });
});

describe("NFL situational trends Phase 2B prior-game classifications", () => {
  it("detects outright upset wins and favorite losses from the prior game", () => {
    assert.equal(priorUpsetClassification({ pointMargin: 1, teamSpread: 0.5 }), "upset-win");
    assert.equal(priorUpsetClassification({ pointMargin: -1, teamSpread: -0.5 }), "upset-loss");
    assert.equal(priorUpsetClassification({ pointMargin: 1, teamSpread: -3 }), null);
    assert.equal(priorUpsetClassification({ pointMargin: -1, teamSpread: 3 }), null);
    assert.equal(priorUpsetClassification({ pointMargin: 1, teamSpread: 0 }), null);
  });

  it("uses the reliable binary overtime value and never score inference", () => {
    assert.equal(isOvertimeValue(1), true);
    assert.equal(isOvertimeValue("1"), true);
    assert.equal(isOvertimeValue(0), false);
    assert.equal(isOvertimeValue("0"), false);
    assert.equal(isOvertimeValue(99), false);
  });

  it("detects Monday and Sunday night from Eastern weekday and kickoff", () => {
    assert.equal(isMondayNight("2025-09-09T00:15:00.000Z"), true);
    assert.equal(isMondayNight("2025-09-08T17:00:00.000Z"), false);
    assert.equal(isSundayNight("2025-09-15T00:20:00.000Z"), true);
    assert.equal(isSundayNight("2025-09-14T20:25:00.000Z"), false);
    assert.equal(isSundayNight("2025-09-16T00:15:00.000Z"), false);
  });

  it("classifies the fixed scoring/allowing 40+ boundary and only the requested bands", () => {
    assert.equal(previousScoreBand(39), null);
    assert.equal(previousScoreBand(40), "40-to-49");
    assert.equal(previousScoreBand(49), "40-to-49");
    assert.equal(previousScoreBand(50), "50-plus");
  });
});

describe("NFL situational trends Phase 2B chronology and windows", () => {
  it("attaches the second divisional meeting and the current team's first-meeting result", () => {
    const rows = [
      row({ rowId: "late:buf", gameId: "late", team: "buf", opponent: "mia", kickoffUtc: "2025-12-07T18:00:00.000Z", suResult: "L" }),
      row({ rowId: "late:mia", gameId: "late", team: "mia", opponent: "buf", kickoffUtc: "2025-12-07T18:00:00.000Z", suResult: "W" }),
      row({ rowId: "early:buf", gameId: "early", team: "buf", opponent: "mia", kickoffUtc: "2025-09-07T17:00:00.000Z", suResult: "W" }),
      row({ rowId: "early:mia", gameId: "early", team: "mia", opponent: "buf", kickoffUtc: "2025-09-07T17:00:00.000Z", suResult: "L" }),
    ];
    const annotated = attachSecondDivisionalMeetingContext(rows);
    const lateBuf = annotated.find((item) => item.rowId === "late:buf");
    const lateMia = annotated.find((item) => item.rowId === "late:mia");
    assert.equal(lateBuf.divisionalMeetingNumber, 2);
    assert.equal(lateBuf.firstMeetingGameId, "early");
    assert.equal(lateBuf.firstMeetingSuResult, "W");
    assert.equal(lateMia.firstMeetingSuResult, "L");
  });

  it("assigns the fixed full, recent, and era windows at exact boundaries", () => {
    assert.deepEqual(windowAssignments(2010), { fullHistory: false, recentForm: false, olderEra: false, newerEra: false });
    assert.deepEqual(windowAssignments(2011), { fullHistory: true, recentForm: false, olderEra: true, newerEra: false });
    assert.deepEqual(windowAssignments(2018), { fullHistory: true, recentForm: false, olderEra: true, newerEra: false });
    assert.deepEqual(windowAssignments(2019), { fullHistory: true, recentForm: false, olderEra: false, newerEra: true });
    assert.deepEqual(windowAssignments(2021), { fullHistory: true, recentForm: true, olderEra: false, newerEra: true });
    assert.deepEqual(windowAssignments(2025), { fullHistory: true, recentForm: true, olderEra: false, newerEra: true });
    assert.deepEqual(windowAssignments(2026), { fullHistory: false, recentForm: false, olderEra: false, newerEra: false });
  });

  it("reports all required metric, evidence, and stability fields", () => {
    const rows = [];
    for (let season = 2011; season <= 2025; season += 1) {
      rows.push(row({ rowId: `${season}:w`, gameId: `${season}:w`, season, atsResult: "W", suResult: "W" }));
      rows.push(row({ rowId: `${season}:l`, gameId: `${season}:l`, season, atsResult: "L", suResult: "L" }));
    }
    const result = buildPhase2bVariant({ trendId: "test", id: "overall", label: "Overall", definition: "test", rows, overlapPolicy: "base" });
    assert.equal(result.fullHistoryMetrics.qualifyingTeamGames, 30);
    assert.equal(result.recentFormMetrics.qualifyingTeamGames, 10);
    assert.equal(result.eraMetrics.olderEra.qualifyingTeamGames, 16);
    assert.equal(result.eraMetrics.newerEra.qualifyingTeamGames, 14);
    assert.equal(result.fullHistoryMetrics.sampleSizeLabel, "VERY SMALL");
    assert.equal(result.evidenceClassification, "INSUFFICIENT DATA");
    assert.equal(result.confidence, "Low");
    assert.equal(result.stabilityFlags.recentChange, "STABLE");
  });
});
