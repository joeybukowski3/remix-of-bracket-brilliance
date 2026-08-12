/**
 * Focused coverage for the new "Results Tracker" cross-page link added to
 * the Numerology page's desktop sidebar nav and mobile nav grid, pointing
 * to /mlb/performance-preview. Mirrors the existing "MLB Home" link pattern.
 */
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { NumerologyDailyData } from "@/types/mlbNumerology";

vi.mock("@/components/layout/SiteShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/mlb/MlbPlayerHeadshot", () => ({
  default: ({ playerName }: { playerName: string }) => <div aria-label={`${playerName} headshot`} />,
}));

vi.mock("@/components/mlb/MlbTeamLogo", () => ({
  default: ({ team }: { team: string }) => <span data-testid="team-logo">{team}</span>,
}));

vi.mock("@/hooks/usePageSeo", () => ({
  usePageSeo: vi.fn(),
}));

vi.mock("@/hooks/useMlbLiveLineups", () => ({
  useMlbLiveLineups: () => ({ lineups: {}, loading: false }),
}));

vi.mock("@/hooks/useMlbPropsData", () => ({
  useMlbPropsData: () => ({ batters: [] }),
}));

vi.mock("@/hooks/useMLBNumerology", () => ({
  useMLBNumerology: () => ({
    data: {
      date: "2026-08-12",
      timezone: "America/New_York",
      methodologyVersion: "3.0.0",
      scheduledFor: "09:00 America/New_York",
      generatedAt: "2026-08-12T12:00:00.000Z",
      generationMode: "live",
      narrativeSource: "fallback",
      dataStatus: "morning_projected",
      dailyProfile: {
        universalDayRawSum: 18, universalDayCompound: 18, universalDayMaster: null, universalDayRoot: 9,
        universalDayTrace: [], calendarDayCompound: 1, calendarDayRoot: 1, universalYear: 1, universalMonth: 8,
        structuralEcho: "9/9", primaryFamily: [3, 6, 9], secondaryFamily: [1, 4, 7], balancingComplement: 1,
        countercurrent: 8, repeatedDigits: [], interpretation: "test",
      },
      featuredPlays: [],
      watchlist: [],
      countercurrents: [],
      exactNumberMatches: [],
      rootNumberMatches: [],
    } as unknown as NumerologyDailyData,
    loading: false,
    error: null,
    isStale: false,
  }),
}));

global.fetch = vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response));

const { default: MlbNumerologyPageEnhanced } = await import("./MlbNumerologyPageEnhanced");

describe("MlbNumerologyPageEnhanced — Results Tracker link", () => {
  it("renders a Results Tracker link pointing to /mlb/performance-preview", () => {
    render(<MlbNumerologyPageEnhanced />);
    const links = screen.getAllByRole("link", { name: "Results Tracker" });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/mlb/performance-preview");
    }
  });

  it("preserves the existing MLB Home link in the mobile nav grid", () => {
    render(<MlbNumerologyPageEnhanced />);
    expect(screen.getByRole("link", { name: "MLB Home" })).toHaveAttribute("href", "/mlb");
  });

  it("preserves the existing hash-anchor section nav", () => {
    render(<MlbNumerologyPageEnhanced />);
    const overviewLinks = screen.getAllByRole("link", { name: /Overview/ });
    expect(overviewLinks.some((link) => link.getAttribute("href") === "#overview")).toBe(true);
    const explorerLinks = screen.getAllByRole("link", { name: /Explorer/ });
    expect(explorerLinks.some((link) => link.getAttribute("href") === "#explorer")).toBe(true);
  });
});
