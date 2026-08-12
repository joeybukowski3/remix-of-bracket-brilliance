import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SinCityPerformanceSummaryFile, SinCityPickRecord } from "@/types/mlbSinCity";
import SinCitySection from "./SinCitySection";

const REFERENCE_DATE = "2026-08-12";

const level = { qualifiedPlays: 3, hrHits: 1, hrHitRate: 33.3, averageOdds: 250, oddsCoveragePercent: 100, flatBetRoi: 12 };

function summary(): SinCityPerformanceSummaryFile {
  return {
    generatedAt: "2026-08-12T00:00:00Z", trackingModelVersion: "sin-city-tracking-v1", trackingStartDate: "2026-08-01",
    totalTrackedDates: 5, mostRecentGradedDate: "2026-08-11", fiveOfFive: level, fourOfFive: level,
  };
}

function record(overrides: Partial<SinCityPickRecord> = {}, index = 0): SinCityPickRecord {
  return {
    trackingModelVersion: "sin-city-tracking-v1", date: "2026-08-11", persistedAt: "2026-08-11T00:00:00Z",
    playerId: 4000 + index, playerName: `Player ${index}`, team: "NYY", teamId: 1, opponent: "BOS", opponentId: 2,
    gameId: 900 + index, qualificationLevel: "4/5", matchCount: 4,
    factors: [{ name: "Barrel%", value: 15, threshold: 12, pass: true }],
    hrOddsYes: "+250", hrOddsBook: "book", resultStatus: "hit",
    battingLine: { atBats: 4, hits: 2, doubles: 1, homeRuns: 1, totalBases: 6, rbi: 2, runs: 1, baseOnBalls: 0, strikeOuts: 1 },
    gradedAt: "2026-08-12T00:00:00Z",
    ...overrides,
  };
}

describe("SinCitySection", () => {
  it("keeps 5/5 and 4/5 clearly separated", () => {
    render(<SinCitySection summary={summary()} records={[]} referenceDate={REFERENCE_DATE} />);
    expect(screen.getByText("5/5 Picks")).toBeInTheDocument();
    expect(screen.getByText("4/5 Picks")).toBeInTheDocument();
    expect(screen.getByText("Sin City 5/5 Results")).toBeInTheDocument();
    expect(screen.getByText("Sin City 4/5 Results")).toBeInTheDocument();
  });

  it("renders a time-window toggle and updates on selection", () => {
    render(<SinCitySection summary={summary()} records={[record({}, 0)]} referenceDate={REFERENCE_DATE} />);
    expect(screen.getByRole("button", { name: "Last 30 Days", pressed: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yesterday" }));
    expect(screen.getByRole("button", { name: "Yesterday", pressed: true })).toBeInTheDocument();
  });

  it("does not break with an empty records array", () => {
    expect(() => render(<SinCitySection summary={summary()} records={[]} referenceDate={REFERENCE_DATE} />)).not.toThrow();
  });
});
