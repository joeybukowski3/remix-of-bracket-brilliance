import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ATS_BREAK_EVEN,
  FIXED_ERA_WINDOWS,
  REPORTING_WINDOWS,
  TREND_DEFINITIONS,
  atsCoverMargin,
  blowoutThresholds,
  buildReportingWindows,
  calculateRestDays,
  classifyEvidence,
  evaluateTeamRows,
  gradeTeamAts,
  isByeGap,
  isDivisionalMatchup,
  isWestToEastEarly,
  qualifiesLetdown,
  qualifiesLookAhead,
  qualifiesSandwich,
  roadSequenceAt,
  summarizeStability,
  teamRelativeSpread,
} from "./nfl-situational-trends-core.mjs";

function resultRows(season, wins, losses, pushes = 0) {
  return [
    ...Array.from({ length: wins }, () => "W"),
    ...Array.from({ length: losses }, () => "L"),
    ...Array.from({ length: pushes }, () => "P"),
  ].map((atsResult, index) => ({
    season,
    atsResult,
    suResult: atsResult === "P" ? "T" : atsResult,
    teamSpread: 0,
    atsCoverMargin: atsResult === "W" ? 1 : atsResult === "L" ? -1 : 0,
    rowId: `${season}:${index}:${atsResult}`,
    trendIds: ["look-ahead"],
  }));
}

describe("NFL situational trend deterministic primitives", () => {
  it("uses the correct -110 ATS break-even percentage", () => {
    assert.ok(Math.abs(ATS_BREAK_EVEN - 0.5238095238) < 1e-10);
  });

  it("grades ATS wins, losses, and pushes with a team-relative spread", () => {
    assert.equal(teamRelativeSpread(3.5, true), -3.5);
    assert.equal(teamRelativeSpread(3.5, false), 3.5);
    assert.equal(gradeTeamAts(3, -2.5), "W");
    assert.equal(atsCoverMargin(3, -2.5), 0.5);
    assert.equal(gradeTeamAts(3, -3.5), "L");
    assert.equal(gradeTeamAts(3, -3), "P");
    assert.equal(gradeTeamAts(-3, 3), "P");
  });

  it("calculates NFL rest by Eastern calendar days", () => {
    assert.equal(calculateRestDays("2025-09-09T00:15:00.000Z", "2025-09-14T17:00:00.000Z"), 6);
    assert.equal(calculateRestDays("2025-09-07T17:00:00.000Z", "2025-09-12T00:15:00.000Z"), 4);
  });

  it("detects a bye only for a one-week schedule gap with a plausible date gap", () => {
    const previous = { season: 2025, week: 6, kickoffUtc: "2025-10-12T17:00:00.000Z" };
    assert.equal(isByeGap(previous, { season: 2025, week: 8, kickoffUtc: "2025-10-26T17:00:00.000Z" }), true);
    assert.equal(isByeGap(previous, { season: 2025, week: 7, kickoffUtc: "2025-10-19T17:00:00.000Z" }), false);
  });

  it("counts consecutive true road games and lets neutral games break the streak", () => {
    assert.equal(roadSequenceAt([{ venue: "home" }, { venue: "away" }, { venue: "away" }], 2), 2);
    assert.equal(roadSequenceAt([{ venue: "away" }, { venue: "neutral" }, { venue: "away" }], 2), 1);
    assert.equal(roadSequenceAt([{ venue: "away" }, { venue: "away" }, { venue: "away" }], 2), 3);
  });

  it("detects divisional matchups from canonical division identity", () => {
    assert.equal(isDivisionalMatchup("AFC East", "AFC East"), true);
    assert.equal(isDivisionalMatchup("AFC East", "AFC North"), false);
  });

  it("classifies every predefined blowout threshold without selecting the best one", () => {
    assert.deepEqual(blowoutThresholds(18), { win14: true, win17: true, win20: false, loss14: false, loss17: false, loss20: false });
    assert.deepEqual(blowoutThresholds(-20), { win14: false, win17: false, win20: false, loss14: true, loss17: true, loss20: true });
  });

  it("applies the deterministic look-ahead and sandwich proxies", () => {
    assert.equal(qualifiesLookAhead({ lesserFavorite: true, nextMajorOpponent: true }), true);
    assert.equal(qualifiesLookAhead({ lesserFavorite: false, nextMajorOpponent: true }), false);
    assert.equal(qualifiesSandwich({ lesserFavorite: true, previousMajorOpponent: true, nextMajorOpponent: true }), true);
    assert.equal(qualifiesSandwich({ lesserFavorite: true, previousMajorOpponent: false, nextMajorOpponent: true }), false);
  });

  it("applies the broad letdown and narrow West-to-East early proxies", () => {
    assert.equal(qualifiesLetdown({ previousPointMargin: 7, previousTeamSpread: 3.5, previousMajorOpponent: false, previousPrimeTime: false }), true);
    assert.equal(qualifiesLetdown({ previousPointMargin: -7, previousTeamSpread: 7, previousMajorOpponent: true, previousPrimeTime: true }), false);
    assert.equal(isWestToEastEarly({ team: "sf", opponent: "phi", season: 2025, venue: "away", kickoffUtc: "2025-09-14T17:00:00.000Z" }), true);
    assert.equal(isWestToEastEarly({ team: "sf", opponent: "phi", season: 2025, venue: "away", kickoffUtc: "2025-09-15T00:20:00.000Z" }), false);
  });
});

describe("NFL situational trend reporting windows and evidence", () => {
  it("retains all approved common angles even when no rows qualify", () => {
    const results = evaluateTeamRows([]);
    assert.deepEqual(results.map((result) => result.id), TREND_DEFINITIONS.map((definition) => definition.id));
    assert.equal(results.length, 12);
    assert.ok(results.every((result) => result.commonAngleStatus === "COMMON/CLASSIC ANGLE"));
    assert.ok(results.every((result) => result.classification === "INSUFFICIENT DATA"));
  });

  it("uses the fixed 2011-2025 full-history and 2021-2025 recent windows", () => {
    assert.deepEqual(REPORTING_WINDOWS.fullHistory, { id: "full-history", label: "FULL HISTORY", startSeason: 2011, endSeason: 2025 });
    assert.deepEqual(REPORTING_WINDOWS.recentForm, { id: "recent-form", label: "RECENT FORM", startSeason: 2021, endSeason: 2025 });
    assert.deepEqual(FIXED_ERA_WINDOWS.olderEra, { id: "older-era", label: "OLDER ERA", startSeason: 2011, endSeason: 2018 });
    assert.deepEqual(FIXED_ERA_WINDOWS.newerEra, { id: "newer-era", label: "NEWER ERA", startSeason: 2019, endSeason: 2025 });

    const rows = [
      ...resultRows(2010, 10, 0),
      ...resultRows(2011, 2, 1),
      ...resultRows(2020, 1, 1),
      ...resultRows(2021, 1, 2),
      ...resultRows(2025, 2, 2, 1),
      ...resultRows(2026, 0, 10),
    ];
    const windows = buildReportingWindows(rows);
    assert.equal(windows.fullHistory.metrics.qualifyingTeamGames, 13);
    assert.equal(windows.fullHistory.metrics.atsWins, 6);
    assert.equal(windows.recentForm.metrics.qualifyingTeamGames, 8);
    assert.equal(windows.recentForm.metrics.atsPushes, 1);
  });

  it("emits deterministic era and recent-change stability flags", () => {
    const rows = [];
    for (let season = 2011; season <= 2018; season += 1) rows.push(...resultRows(season, 6, 4));
    for (let season = 2019; season <= 2025; season += 1) rows.push(...resultRows(season, 4, 6));
    const stability = summarizeStability(rows);
    assert.equal(stability.olderEra.metrics.atsWinPct, 0.6);
    assert.equal(stability.newerEra.metrics.atsWinPct, 0.4);
    assert.equal(stability.comparison.directionReverses, true);
    assert.equal(stability.comparison.recentMateriallyDiffersFromFullHistory, true);
    assert.equal(stability.comparison.recentChange, "WEAKENED");
  });

  it("uses full history, recent form, eras, effect size, and break-even uncertainty in classification", () => {
    const stablePositive = [];
    for (let season = 2011; season <= 2025; season += 1) stablePositive.push(...resultRows(season, 24, 16));
    const positiveWindows = buildReportingWindows(stablePositive);
    const positiveStability = summarizeStability(stablePositive);
    assert.equal(classifyEvidence(positiveWindows.fullHistory.metrics, positiveWindows.recentForm.metrics, positiveStability).classification, "HISTORICALLY MEANINGFUL");

    const neutral = [];
    for (let season = 2011; season <= 2025; season += 1) neutral.push(...resultRows(season, 20, 20));
    const neutralWindows = buildReportingWindows(neutral);
    const neutralStability = summarizeStability(neutral);
    assert.deepEqual(classifyEvidence(neutralWindows.fullHistory.metrics, neutralWindows.recentForm.metrics, neutralStability), {
      classification: "LITTLE/NO EVIDENCE",
      confidence: "High",
      explanation: "The fixed full-history and recent views remain broadly neutral: the sample does not reliably separate from 50% ATS or materially clear the 52.38% -110 break-even rate. The angle remains part of the reference library.",
    });

    const thin = resultRows(2025, 30, 20);
    const thinWindows = buildReportingWindows(thin);
    assert.equal(classifyEvidence(thinWindows.fullHistory.metrics, thinWindows.recentForm.metrics, summarizeStability(thin)).classification, "INSUFFICIENT DATA");
  });
});
