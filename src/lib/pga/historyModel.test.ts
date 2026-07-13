import { describe, expect, it } from "vitest";
import {
  calculateCourseFit,
  calculateTournamentModelScore,
  calculateTrend,
  findEventHistory,
  finishToScore,
  normalizePlayerKey,
  parseFinishText,
  resolveMajorType,
  scoreFourResultHistory,
  scoreRecentResults,
  selectAllMajorHistory,
  selectSpecificMajorHistory,
  type PgaHistoryResult,
  type PgaPlayerHistoryRecord,
} from "./historyModel";

function result(finishText: string, overrides: Partial<PgaHistoryResult> = {}): PgaHistoryResult {
  const parsed = parseFinishText(finishText);
  if (!parsed) throw new Error(`Unable to parse ${finishText}`);
  return { ...parsed, ...overrides };
}

describe("PGA history model", () => {
  it("normalizes finish values", () => {
    expect(parseFinishText("CUT")?.finishText).toBe("MC");
    expect(parseFinishText("W/D")?.finishText).toBe("WD");
    expect(parseFinishText("T12")?.finishPosition).toBe(12);
    expect(parseFinishText("7.0")?.finishText).toBe("7");
    expect(parseFinishText("")).toBeNull();
  });

  it("assigns finish scores", () => {
    expect(finishToScore(result("1"))).toBe(100);
    expect(finishToScore(result("T5"))).toBe(90);
    expect(finishToScore(result("T10"))).toBe(80);
    expect(finishToScore(result("T20"))).toBe(68);
    expect(finishToScore(result("T35"))).toBe(45);
    expect(finishToScore(result("MC"))).toBe(5);
    expect(finishToScore(result("WD"))).toBe(0);
  });

  it("weights recent finishes newest first", () => {
    const goodFirst = ["1", "T4", "T8", "T12", "T18", "T25", "T30", "MC"].map((finish) => result(finish));
    const goodLast = [...goodFirst].reverse();
    expect(scoreRecentResults(goodFirst)!).toBeGreaterThan(scoreRecentResults(goodLast)!);
  });

  it("flows a newly completed result through recent form, JKB Trend, and the unchanged major formula", () => {
    const before = ["MC", "T50", "T40", "T30", "T20"].map((finish) => result(finish));
    const after = [result("1"), ...before].slice(0, 5);
    const beforeRecent = scoreRecentResults(before);
    const afterRecent = scoreRecentResults(after);
    const beforeTrend = calculateTrend(before);
    const afterTrend = calculateTrend(after);
    const courseFit = calculateCourseFit({ sgTotal: 80, sgApp: 60 }, { sgTotal: 0.5, sgApp: 0.5 });
    const fixed = {
      baseScore: 75,
      courseFit,
      eventHistoryScore: null,
      specificMajorScore: 70,
      allMajorScore: 65,
      isMajor: true,
    };
    const beforeModel = calculateTournamentModelScore({
      ...fixed,
      recentScore: beforeRecent,
      trendScore: beforeTrend.score,
    });
    const afterModel = calculateTournamentModelScore({
      ...fixed,
      recentScore: afterRecent,
      trendScore: afterTrend.score,
    });

    expect(after.map((row) => row.finishText)).toEqual(["1", "MC", "T50", "T40", "T30"]);
    expect({ beforeRecent, afterRecent }).toEqual({ beforeRecent: 40.4, afterRecent: 50 });
    expect({ beforeTrend: beforeTrend.score, afterTrend: afterTrend.score }).toEqual({ beforeTrend: 16.3, afterTrend: 40.5 });
    expect(courseFit).toBe(70);
    expect({ beforeModel, afterModel }).toEqual({ beforeModel: 61.2, afterModel: 65.1 });
    expect([beforeModel, 63].sort((left, right) => right - left)).toEqual([63, beforeModel]);
    expect([afterModel, 63].sort((left, right) => right - left)).toEqual([afterModel, 63]);
  });

  it("shrinks small same-event samples toward neutral", () => {
    const oneWin = scoreFourResultHistory([result("1")]);
    expect(oneWin).toBeGreaterThan(50);
    expect(oneWin).toBeLessThan(100);
  });

  it("calculates trend direction", () => {
    const improving = ["1", "T5", "T8", "T12", "T45", "MC", "MC", "T60"].map((finish) => result(finish));
    const declining = [...improving].reverse();
    expect(calculateTrend(improving).direction).toBe("up");
    expect(calculateTrend(declining).direction).toBe("down");
  });

  it("returns the latest four event starts", () => {
    const record: PgaPlayerHistoryRecord = {
      player: "Test Player",
      recentResults: [],
      eventHistory: {
        "travelers-championship": [
          result("T12", { season: 2022 }),
          result("T8", { season: 2025 }),
          result("MC", { season: 2024 }),
          result("T20", { season: 2023 }),
          result("T30", { season: 2021 }),
        ],
      },
    };
    expect(findEventHistory(record, "travelers-championship", "Travelers Championship").map((row) => row.season)).toEqual([2025, 2024, 2023, 2022]);
  });

  it("selects specific and all-major history", () => {
    const results: PgaHistoryResult[] = [
      result("T3", { season: 2025, eventDate: "2025-06-15", majorType: "us_open" }),
      result("T8", { season: 2025, eventDate: "2025-05-18", majorType: "pga_championship" }),
      result("T12", { season: 2025, eventDate: "2025-04-13", majorType: "masters" }),
      result("MC", { season: 2024, eventDate: "2024-06-16", majorType: "us_open" }),
      result("T20", { season: 2023, eventDate: "2023-06-18", majorType: "us_open" }),
      result("T6", { season: 2022, eventDate: "2022-06-19", majorType: "us_open" }),
      result("T9", { season: 2021, eventDate: "2021-07-18", majorType: "open_championship" }),
      result("T15", { season: 2021, eventDate: "2021-05-23", majorType: "pga_championship" }),
      result("T22", { season: 2020, eventDate: "2020-11-15", majorType: "masters" }),
    ];
    expect(selectSpecificMajorHistory(results, "us_open")).toHaveLength(4);
    expect(selectAllMajorHistory(results)).toHaveLength(8);
  });

  it("detects major type", () => {
    expect(resolveMajorType("Masters Tournament")).toBe("masters");
    expect(resolveMajorType("PGA Championship")).toBe("pga_championship");
    expect(resolveMajorType("U.S. Open")).toBe("us_open");
    expect(resolveMajorType("The Open Championship")).toBe("open_championship");
    expect(resolveMajorType("Travelers Championship")).toBeNull();
  });

  it("renormalizes score weights when data is missing", () => {
    const score = calculateTournamentModelScore({
      baseScore: 80,
      recentScore: 70,
      courseFit: 90,
      eventHistoryScore: null,
      specificMajorScore: null,
      allMajorScore: null,
      trendScore: 60,
      isMajor: false,
    });
    expect(score).toBeGreaterThan(70);
    expect(score).toBeLessThan(90);
  });

  it("normalizes player names", () => {
    expect(normalizePlayerKey("Ludvig Åberg")).toBe(normalizePlayerKey("Ludvig Aberg"));
    expect(normalizePlayerKey("Davis Thompson Jr.")).toBe(normalizePlayerKey("Davis Thompson"));
  });
});
