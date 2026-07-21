/**
 * MlbBatterVsPitcher.mobileSections.test.tsx
 *
 * Focused tests for the mobile-first Batter vs Pitcher redesign, mirroring
 * MlbHrProps.mobileSections.test.tsx and MlbStrikeoutProps.mobileSections.test.tsx:
 * incremental top-50 loading, collapsed secondary sections below `lg` (Park
 * Factors, "How to read this page"), and compact expandable matchup rows
 * with "Career vs Pitcher" + "Matchup Metrics" expand grids, including the
 * aria-controls/visible-label/keyboard/single-open accessibility pattern
 * established on the Strikeout Props follow-up.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import type { HrDashboardGame, PitcherVsBatterRow } from "@/pages/MlbHrProps";

vi.mock("@/components/layout/SiteShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: vi.fn() }));
vi.mock("@/components/mlb/MlbNavHero", () => ({ default: () => <nav data-testid="nav-hero" /> }));

type MatchMediaStub = { matches: boolean; media: string; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn>; addListener: ReturnType<typeof vi.fn>; removeListener: ReturnType<typeof vi.fn> };

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string): MatchMediaStub => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const gameA: HrDashboardGame = {
  gameKey: "BAL@CHC", matchup: "BAL @ CHC", awayTeam: "BAL", homeTeam: "CHC",
  stadium: "Wrigley Field", roofType: "Open", temperature: 78, precipitation: 0,
  windSpeed: 6, windDirection: "SW", conditions: "Clear", parkFactor: 1.0,
};
const gameB: HrDashboardGame = {
  gameKey: "NYY@BOS", matchup: "NYY @ BOS", awayTeam: "NYY", homeTeam: "BOS",
  stadium: "Yankee Stadium", roofType: "Open", temperature: 82, precipitation: 0,
  windSpeed: 8, windDirection: "SW", conditions: "Clear", parkFactor: 1.15,
};

function makeRow(overrides: Partial<PitcherVsBatterRow> = {}): PitcherVsBatterRow {
  return {
    rank: 1,
    gameKey: "BAL@CHC",
    gameId: 1,
    player: "Base Batter",
    playerId: 1,
    team: "BAL",
    opposingPitcher: "Justin Steele",
    opposingPitcherId: 1,
    park: "Wrigley Field",
    parkFactor: 1.0,
    hrScore: 60,
    opposingPitcherHrVs: 55,
    opposingPitcherHitsVs: 62,
    opposingPitcherKVs: 50,
    hrTargetScore: 58,
    bestMatchupScore: 61.5,
    strikeoutMatchupScore: 45,
    batterPowerScore: 57,
    pitcherVulnerabilityScore: 53,
    contextScore: 50,
    barrelRate: 9.5,
    hardHitRate: 44,
    xba: 0.26,
    kRate: 18,
    whiffRate: 24,
    pitcherBarrelRate: 7,
    pitcherHardHitRate: 40,
    pitcherKRate: 22,
    pitcherFlyBallRate: 35,
    windBlowingOut: false,
    angleTags: [],
    ...overrides,
  };
}

// 60 ordinary batters with strictly descending Matchup Score, so the default
// sort makes rank order == index and "Batter 51"+ is unambiguously past the
// first page of 50.
const paginationRows = Array.from({ length: 60 }, (_, i) =>
  makeRow({
    rank: i + 1,
    playerId: 100 + i,
    player: `Batter ${String(i + 1).padStart(2, "0")}`,
    bestMatchupScore: 90 - i * 0.5,
  }),
);

const dashboardFixture = { date: "2026-07-21", generatedAt: "2026-07-21T09:00:00.000Z", games: [gameA, gameB], batters: [] };

function mockPropsData(rows: PitcherVsBatterRow[]) {
  vi.doMock("@/hooks/useMlbPropsData", () => ({
    useMlbPropsData: () => ({
      dashboard: dashboardFixture,
      games: [gameA, gameB],
      batterVsPitcherRows: rows,
      pitchers: [],
      status: { kind: "current", slateDate: dashboardFixture.date, generatedAt: dashboardFixture.generatedAt },
    }),
  }));
}

async function renderPage() {
  const { default: MlbBatterVsPitcher } = await import("@/pages/MlbBatterVsPitcher");
  return render(
    <MemoryRouter>
      <MlbBatterVsPitcher />
    </MemoryRouter>,
  );
}

const SLOW_RENDER_TIMEOUT_MS = 15000;

describe("Main table incremental loading", () => {
  it("shows only the first 50 matchups initially", async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData(paginationRows);
    await renderPage();

    expect(await screen.findByText("Batter 01")).toBeInTheDocument();
    expect(screen.getByText("Batter 50")).toBeInTheDocument();
    expect(screen.queryByText("Batter 51")).not.toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it('"Show 50 more" reveals the rest and then hides itself once every row is visible', async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData(paginationRows);
    await renderPage();

    await screen.findByText("Batter 01");
    fireEvent.click(screen.getByRole("button", { name: "Show 50 more" }));

    expect(screen.getByText("Batter 51")).toBeInTheDocument();
    expect(screen.getByText("Batter 60")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show 50 more" })).not.toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("resets the visible count back to 50 when the search filter materially changes", async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData(paginationRows);
    await renderPage();

    await screen.findByText("Batter 01");
    fireEvent.click(screen.getByRole("button", { name: "Show 50 more" }));
    expect(screen.getByText("Batter 60")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search batter, pitcher, park"), { target: { value: "Batter" } });

    expect(screen.getByText("Batter 01")).toBeInTheDocument();
    expect(screen.queryByText("Batter 51")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show 50 more" })).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("does not change ranking order -- rows stay sorted after expanding", async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData(paginationRows);
    const { container } = await renderPage();

    await screen.findByText("Batter 01");
    fireEvent.click(screen.getByRole("button", { name: "Show 50 more" }));

    const names = Array.from(container.querySelectorAll("table tbody tr td:nth-child(2)"))
      .map((el) => el.textContent?.trim())
      .filter((text): text is string => !!text && text.includes("Batter"));
    const indices = names.map((name) => Number(name.match(/Batter (\d+)/)?.[1]));
    expect(indices.length).toBe(60);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  }, SLOW_RENDER_TIMEOUT_MS);
});

describe("Park Factors -- collapsed top-row preview below lg", () => {
  it("shows only the top park in the compact preview below lg, expands with the required copy", async () => {
    stubMatchMedia(true);
    vi.resetModules();
    mockPropsData([makeRow()]);
    await renderPage();

    const heading = await screen.findByText("🏟️ Park Factors");
    const section = within(heading.closest("section") as HTMLElement);
    expect(section.getByText("Click to expand")).toBeInTheDocument();

    // Hitter-friendly order: Yankee Stadium (1.15) leads Wrigley Field (1.0).
    const compactGrid = screen.getByTestId("park-factors-compact-grid");
    expect(within(compactGrid).getByText("Yankee Stadium")).toBeInTheDocument();
    expect(within(compactGrid).queryByText("Wrigley Field")).not.toBeInTheDocument();

    fireEvent.click(section.getByText("Click to expand"));
    expect(section.getByText("Show less")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("shows every park at lg and above (desktop unchanged)", async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData([makeRow()]);
    await renderPage();

    await screen.findByText("🏟️ Park Factors");
    const compactGrid = screen.getByTestId("park-factors-compact-grid");
    expect(within(compactGrid).getByText("Yankee Stadium")).toBeInTheDocument();
    expect(within(compactGrid).getByText("Wrigley Field")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);
});

describe("How to read this page -- collapsed by default below lg, relocated", () => {
  it("is collapsed by default below lg and expands on click", async () => {
    stubMatchMedia(true);
    vi.resetModules();
    mockPropsData([makeRow()]);
    await renderPage();

    const heading = await screen.findByText("How to read this page");
    const section = within(heading.closest("section") as HTMLElement);
    expect(section.queryByText(/Matchup Score ranks today's batter vs\. pitcher matchups/)).not.toBeInTheDocument();

    fireEvent.click(section.getByRole("button", { name: "Click to expand" }));
    expect(section.getByText(/Matchup Score ranks today's batter vs\. pitcher matchups/)).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("is expanded by default at lg and above with no collapse control", async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData([makeRow()]);
    await renderPage();

    const heading = await screen.findByText("How to read this page");
    const section = within(heading.closest("section") as HTMLElement);
    expect(section.getByText(/Matchup Score ranks today's batter vs\. pitcher matchups/)).toBeInTheDocument();
    expect(section.queryByRole("button")).not.toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("renders after the Signal legend section (relocated toward the bottom of the page)", async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData([makeRow()]);
    await renderPage();

    const legend = await screen.findByText("Signal legend");
    const howToRead = screen.getByText("How to read this page");
    expect(legend.compareDocumentPosition(howToRead) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }, SLOW_RENDER_TIMEOUT_MS);
});

describe("Mobile compact rows -- collapsed header, Career vs Pitcher + Matchup Metrics expand grids", () => {
  it("shows logo/name/opponent/score in the collapsed row and moves secondary metrics into the expand grids", async () => {
    stubMatchMedia(true);
    vi.resetModules();
    mockPropsData([makeRow({ player: "Compact Guy", bestMatchupScore: 71 })]);
    await renderPage();

    const trigger = await screen.findByRole("button", { name: /Show batter-vs-pitcher history for Compact Guy/ });
    expect(within(trigger).getByText("Compact Guy")).toBeInTheDocument();
    expect(within(trigger).getByText("vs Justin Steele")).toBeInTheDocument();
    expect(within(trigger).queryByText(/Barrel%/)).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(await screen.findByText("Career vs Pitcher")).toBeInTheDocument();
    expect(screen.getByText("Matchup Metrics")).toBeInTheDocument();
    expect(screen.getByText("Barrel%")).toBeInTheDocument();
    expect(screen.getByText("Batter Quality")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("renders no table markup below lg", async () => {
    stubMatchMedia(true);
    vi.resetModules();
    mockPropsData([makeRow()]);
    const { container } = await renderPage();

    await screen.findAllByText("Base Batter");
    expect(container.querySelector("table")).toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);
});

describe("Compact row accessibility -- aria-controls, visible expand label, keyboard, single-open", () => {
  it("aria-controls points to an existing element once expanded (absent while collapsed)", async () => {
    stubMatchMedia(true);
    vi.resetModules();
    mockPropsData([makeRow({ player: "Aria Guy" })]);
    await renderPage();

    const trigger = await screen.findByRole("button", { name: /Show batter-vs-pitcher history for Aria Guy/ });
    const panelId = trigger.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId as string)).toBeNull();

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-controls")).toBe(panelId);
    expect(document.getElementById(panelId as string)).not.toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("shows a visible 'Click to expand' label that becomes 'Show less' once expanded", async () => {
    stubMatchMedia(true);
    vi.resetModules();
    mockPropsData([makeRow({ player: "Label Guy" })]);
    await renderPage();

    const trigger = await screen.findByRole("button", { name: /Show batter-vs-pitcher history for Label Guy/ });
    expect(within(trigger).getByText("Click to expand")).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(within(trigger).getByText("Show less")).toBeInTheDocument();
    expect(within(trigger).queryByText("Click to expand")).not.toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("preserves aria-expanded and keyboard activation still works (real focusable <button>)", async () => {
    stubMatchMedia(true);
    vi.resetModules();
    mockPropsData([makeRow({ player: "Keyboard Guy" })]);
    await renderPage();

    const trigger = await screen.findByRole("button", { name: /Show batter-vs-pitcher history for Keyboard Guy/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger).not.toHaveAttribute("tabindex", "-1");
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(within(trigger).getByText("Show less")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("only one matchup is expanded at a time", async () => {
    stubMatchMedia(true);
    vi.resetModules();
    mockPropsData([
      makeRow({ player: "First Guy" }),
      makeRow({ player: "Second Guy", playerId: 2, team: "NYY", opposingPitcher: "Gerrit Cole", opposingPitcherId: 2, gameKey: "NYY@BOS" }),
    ]);
    await renderPage();

    const firstTrigger = await screen.findByRole("button", { name: /Show batter-vs-pitcher history for First Guy/ });
    const secondTrigger = screen.getByRole("button", { name: /Show batter-vs-pitcher history for Second Guy/ });

    fireEvent.click(firstTrigger);
    expect(firstTrigger).toHaveAttribute("aria-expanded", "true");
    expect(secondTrigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(secondTrigger);
    expect(firstTrigger).toHaveAttribute("aria-expanded", "false");
    expect(secondTrigger).toHaveAttribute("aria-expanded", "true");
  }, SLOW_RENDER_TIMEOUT_MS);

  it("does not overflow the viewport at 320px (label wraps onto its own line, no whitespace-nowrap)", async () => {
    stubMatchMedia(true);
    vi.resetModules();
    mockPropsData([makeRow({ player: "Narrow Viewport Guy" })]);
    await renderPage();

    const trigger = await screen.findByRole("button", { name: /Show batter-vs-pitcher history for Narrow Viewport Guy/ });
    fireEvent.click(trigger);

    const label = within(trigger).getByText("Show less");
    expect(label.className).not.toMatch(/whitespace-nowrap/);
    expect(trigger.className).toMatch(/flex-col/);
  }, SLOW_RENDER_TIMEOUT_MS);
});
