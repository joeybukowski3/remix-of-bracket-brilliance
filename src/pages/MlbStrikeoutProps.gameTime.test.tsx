/**
 * Focused tests for the K Props "Game Time" column: rendering, chronological
 * sorting via the shared timestamp sort key, and missing-time handling.
 * Mirrors the mocking pattern established in MlbStrikeoutProps.sorting.test.tsx.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import type { PitcherStrikeoutTeamRow } from "@/pages/MlbHrProps";

vi.mock("@/components/layout/SiteShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: vi.fn() }));
vi.mock("@/components/mlb/MlbNavHero", () => ({ default: () => <nav data-testid="nav-hero" /> }));
vi.mock("@/components/mlb/MlbTeamLogo", () => ({ default: ({ team }: { team: string }) => <span data-testid="team-logo">{team}</span> }));
vi.mock("@/hooks/useMlbStrikeoutPropDetails", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useMlbStrikeoutPropDetails")>("@/hooks/useMlbStrikeoutPropDetails");
  return {
    ...actual,
    useMlbStrikeoutPropDetails: () => ({ loading: false, fileUnavailable: false, detailsByKey: new Map(), detailsDate: "2026-07-09" }),
  };
});
vi.mock("@/hooks/useIsCompactLayout", () => ({ useIsCompactLayout: () => false }));

const baseRow: PitcherStrikeoutTeamRow = {
  rank: 1,
  gameKey: "BAL@CHC",
  pitcher: "Dean Kremer",
  team: "BAL",
  opponent: "CHC",
  park: "Wrigley Field",
  parkFactor: 1.0,
  gameStartTime: "2026-07-09T23:10:00Z", // 7:10 PM ET
  pitcherKRate: 22,
  pitcherWhiffRate: 28,
  pitcherKVs: 60,
  opponentTeamKRate: 24,
  opponentTeamWhiffRate: 30,
  opponentTeamXba: 0.24,
  pitcherKSkillScore: 65,
  opponentTeamStrikeoutScore: 58,
  strikeoutMatchupScore: 62,
  whyItRanksWell: "Strong K matchup",
};

const earlyRow: PitcherStrikeoutTeamRow = {
  ...baseRow,
  rank: 2,
  pitcher: "Zac Gallen",
  team: "AZ",
  opponent: "SD",
  gameKey: "AZ@SD",
  gameStartTime: "2026-07-09T17:05:00Z", // 1:05 PM ET, earlier than baseRow
  strikeoutMatchupScore: 40,
};

const tbdRow: PitcherStrikeoutTeamRow = {
  ...baseRow,
  rank: 3,
  pitcher: "TBD Pitcher",
  team: "SEA",
  opponent: "OAK",
  gameKey: "SEA@OAK",
  gameStartTime: null,
  strikeoutMatchupScore: 30,
};

const dashboardFixture = { date: "2026-07-09", generatedAt: "2026-07-09T12:00:00.000Z", games: [], pitchers: [], batters: [] };

function mockPropsData(rows: PitcherStrikeoutTeamRow[]) {
  vi.doMock("@/hooks/useMlbPropsData", () => ({
    useMlbPropsData: () => ({
      dashboard: dashboardFixture,
      games: [],
      loading: false,
      strikeoutDetailRows: rows,
      status: { kind: "current", slateDate: dashboardFixture.date, generatedAt: dashboardFixture.generatedAt },
    }),
  }));
}

async function renderPage() {
  const { default: MlbStrikeoutProps } = await import("@/pages/MlbStrikeoutProps");
  return render(
    <MemoryRouter>
      <MlbStrikeoutProps />
    </MemoryRouter>,
  );
}

const SLOW_RENDER_TIMEOUT_MS = 15000;

describe("MlbStrikeoutProps — Game Time column", () => {
  it("renders a Game Time header and formatted times for each pitcher", async () => {
    vi.resetModules();
    mockPropsData([baseRow, earlyRow]);
    const { container } = await renderPage();

    const table = container.querySelector("table") as HTMLElement;
    expect(within(table).getByRole("button", { name: /Game Time/ })).toBeInTheDocument();
    expect(within(table).getByText("7:10 PM")).toBeInTheDocument();
    expect(within(table).getByText("1:05 PM")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("shows the TBD fallback for a missing start time, never 'Invalid Date'", async () => {
    vi.resetModules();
    mockPropsData([baseRow, tbdRow]);
    const { container } = await renderPage();

    const table = container.querySelector("table") as HTMLElement;
    expect(within(table).getAllByText("TBD").length).toBeGreaterThan(0);
    expect(table.textContent).not.toMatch(/Invalid Date/i);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("sorts chronologically ascending (earliest first), with TBD last, on first click", async () => {
    vi.resetModules();
    mockPropsData([baseRow, earlyRow, tbdRow]);
    const { container } = await renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: /Game Time/ })[0]);

    const table = container.querySelector("table") as HTMLElement;
    const names = Array.from(table.querySelectorAll("tbody tr td span.font-semibold.text-slate-900"))
      .map((el) => el.textContent?.trim())
      .filter((t): t is string => Boolean(t) && !t.startsWith("▶"));

    expect(names.indexOf("Zac Gallen")).toBeLessThan(names.indexOf("Dean Kremer"));
    expect(names.indexOf("TBD Pitcher")).toBe(names.length - 1);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("sorts descending (latest first) on second click, still with TBD last", async () => {
    vi.resetModules();
    mockPropsData([baseRow, earlyRow, tbdRow]);
    const { container } = await renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: /Game Time/ })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: /Game Time/ })[0]);

    const table = container.querySelector("table") as HTMLElement;
    const names = Array.from(table.querySelectorAll("tbody tr td span.font-semibold.text-slate-900"))
      .map((el) => el.textContent?.trim())
      .filter((t): t is string => Boolean(t) && !t.startsWith("▶"));

    expect(names.indexOf("Dean Kremer")).toBeLessThan(names.indexOf("Zac Gallen"));
    expect(names.indexOf("TBD Pitcher")).toBe(names.length - 1);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("does not break existing K Score sorting", async () => {
    vi.resetModules();
    mockPropsData([baseRow, earlyRow, tbdRow]);
    const { container } = await renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: /^K Score/ })[0]);

    const table = container.querySelector("table") as HTMLElement;
    const names = Array.from(table.querySelectorAll("tbody tr td span.font-semibold.text-slate-900"))
      .map((el) => el.textContent?.trim())
      .filter((t): t is string => Boolean(t) && !t.startsWith("▶"));
    // Default toggles to ascending (lowest K Score first): TBD Pitcher (30) < Zac Gallen (40) < Dean Kremer (62).
    expect(names).toEqual(["TBD Pitcher", "Zac Gallen", "Dean Kremer"]);
  }, SLOW_RENDER_TIMEOUT_MS);
});
