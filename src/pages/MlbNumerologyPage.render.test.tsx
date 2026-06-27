import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import MlbNumerologyPage from "./MlbNumerologyPage";
import type { NumerologyDailyData } from "@/types/mlbNumerology";

vi.mock("@/components/layout/SiteShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/mlb/MlbPlayerHeadshot", () => ({
  default: ({ playerName }: { playerName: string }) => <div aria-label={`${playerName} headshot`} />,
}));

vi.mock("@/hooks/usePageSeo", () => ({
  usePageSeo: vi.fn(),
}));

const numerologyData: NumerologyDailyData & {
  exactNumberMatches: Array<Record<string, unknown>>;
  rootNumberMatches: Array<Record<string, unknown>>;
} = {
  date: "2026-06-27",
  timezone: "America/New_York",
  methodologyVersion: "2.1.0",
  scheduledFor: "09:36 America/New_York",
  generatedAt: "2026-06-27T12:00:00.000Z",
  generationMode: "live",
  narrativeSource: "fallback",
  dataStatus: "morning_projected",
  dailyProfile: {
    universalDayRawSum: 25,
    universalDayCompound: 25,
    universalDayMaster: null,
    universalDayRoot: 7,
    universalDayTrace: ["2 + 0 + 2 + 6 + 0 + 6 + 2 + 7 = 25"],
    calendarDayCompound: 27,
    calendarDayRoot: 9,
    universalYear: 1,
    universalMonth: 7,
    structuralEcho: "17/8",
    primaryFamily: [1, 4, 7],
    secondaryFamily: [3, 6, 9],
    balancingComplement: 3,
    countercurrent: 2,
    repeatedDigits: [],
    interpretation: "Test interpretation.",
  },
  featuredPlays: [
    {
      rank: 1,
      playerId: 100,
      playerName: "Featured Hitter",
      team: "NYY",
      opponent: "BOS",
      lineupStatus: "projected",
      recommendedMarket: "Home run",
      numerologyScore: 62,
      baseballScore: 41,
      finalScore: 62,
      confidence: "medium",
      positiveSignals: [],
      counterSignals: [],
    },
  ],
  watchlist: [],
  countercurrents: [],
  exactNumberMatches: [
    {
      playerId: 101,
      playerName: "Exact Hitter",
      team: "ATL",
      opponent: "NYM",
      lineupStatus: "projected",
      numerologyScore: 72,
      baseballScore: 55,
      matches: [{ field: "jersey", value: 25, label: "Jersey #25" }],
    },
  ],
  rootNumberMatches: [
    {
      playerId: 102,
      playerName: "Root Hitter",
      team: "LAD",
      opponent: "SF",
      lineupStatus: "projected",
      numerologyScore: 58,
      baseballScore: 48,
      matches: [{ field: "expression", value: 34, root: 7, label: "Expression 34 -> 7" }],
    },
  ],
};

vi.mock("@/hooks/useMLBNumerology", () => ({
  useMLBNumerology: () => ({
    data: numerologyData,
    loading: false,
    error: null,
    isStale: false,
  }),
}));

describe("MlbNumerologyPage", () => {
  it("renders exact matches, root matches, and player explorer rows", () => {
    render(<MlbNumerologyPage />);

    expect(screen.getByRole("heading", { name: "Exact Matches" })).toBeInTheDocument();
    expect(screen.getAllByText("Exact Hitter").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("heading", { name: "Reduced-Root Matches" })).toBeInTheDocument();
    expect(screen.getAllByText("Root Hitter").length).toBeGreaterThanOrEqual(2);

    const explorer = screen.getByRole("heading", { name: "Player Explorer" }).closest("section");
    expect(explorer).not.toBeNull();
    expect(within(explorer as HTMLElement).getByText("Exact Hitter")).toBeInTheDocument();
    expect(within(explorer as HTMLElement).getByText("Root Hitter")).toBeInTheDocument();
    expect(within(explorer as HTMLElement).getByText("Featured Hitter")).toBeInTheDocument();
  });
});
