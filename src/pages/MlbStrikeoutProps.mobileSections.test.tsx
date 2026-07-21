/**
 * MlbStrikeoutProps.mobileSections.test.tsx
 *
 * Focused tests for the mobile-first Strikeout Props redesign, mirroring
 * MlbHrProps.mobileSections.test.tsx: incremental top-50 loading, collapsed
 * secondary sections below `lg` (Park Factors, Low Confidence, How to use
 * this page / Understanding Edge), and the compact expandable pitcher rows
 * with a "K Model Metrics" expand grid. Follows the mocking pattern
 * established in MlbStrikeoutProps.sorting.test.tsx: useMlbPropsData is
 * mocked directly so `strikeoutDetailRows`/`games` are fixed fixtures.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import type { HrDashboardGame, PitcherStrikeoutTeamRow } from "@/pages/MlbHrProps";

vi.mock("@/components/layout/SiteShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: vi.fn() }));
vi.mock("@/components/mlb/MlbNavHero", () => ({ default: () => <nav data-testid="nav-hero" /> }));
vi.mock("@/hooks/usePitcherRegression", () => ({ usePitcherRegression: () => ({ data: [], loading: false }) }));
vi.mock("@/hooks/useMlbStrikeoutPropDetails", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useMlbStrikeoutPropDetails")>("@/hooks/useMlbStrikeoutPropDetails");
  return {
    ...actual,
    useMlbStrikeoutPropDetails: () => ({ loading: false, fileUnavailable: false, detailsByKey: new Map(), detailsDate: "2026-07-09" }),
  };
});

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
  stadium: "Fenway Park", roofType: "Open", temperature: 70, precipitation: 0,
  windSpeed: 10, windDirection: "SW", conditions: "Clear", parkFactor: 0.92,
};

function makeRow(overrides: Partial<PitcherStrikeoutTeamRow> = {}): PitcherStrikeoutTeamRow {
  return {
    rank: 1,
    gameKey: "BAL@CHC",
    pitcher: "Base Pitcher",
    team: "BAL",
    opponent: "CHC",
    park: "Wrigley Field",
    parkFactor: 1.0,
    pitcherKRate: 28,
    pitcherWhiffRate: 31,
    pitcherKVs: 75,
    opponentTeamKRate: 25,
    opponentTeamWhiffRate: 28,
    opponentTeamXba: 0.24,
    pitcherKSkillScore: 74,
    opponentTeamStrikeoutScore: 66,
    strikeoutMatchupScore: 72,
    whyItRanksWell: "Strong K matchup",
    projectedIP: 6,
    projectedK9: 9,
    projectedKs: 6,
    kLine: 5.5,
    kOddsOver: "-115",
    kOddsUnder: "-115",
    kOddsBook: "draftkings",
    workloadRole: "starter",
    ...overrides,
  };
}

// 60 ordinary VALID pitchers with strictly descending K score, so the
// default sort makes rank order == index and "Pitcher 51"+ is unambiguously
// past the first page of 50.
const paginationRows = Array.from({ length: 60 }, (_, i) =>
  makeRow({
    rank: i + 1,
    pitcher: `Pitcher ${String(i + 1).padStart(2, "0")}`,
    strikeoutMatchupScore: 90 - i * 0.5,
  }),
);

// Insufficient-data row -- lands in Low Confidence (see kPropStatus.ts).
const lowConfidenceRow = makeRow({
  rank: 200,
  pitcher: "Uncertain Arm",
  team: "BOS",
  opponent: "NYY",
  gameKey: "NYY@BOS",
  pitcherKRate: null,
  pitcherWhiffRate: null,
  projectedIP: null,
  projectedK9: null,
  projectedKs: null,
  workloadConfidenceGrade: "D",
  workloadConfidenceScore: 0.3,
  workloadFlags: ["NO_STARTS_AVAILABLE", "PITCHER_RECENT_K_RATE_MISSING"],
});

const dashboardFixture = { date: "2026-07-09", generatedAt: "2026-07-09T12:00:00.000Z", games: [gameA, gameB], batters: [] };

function mockPropsData(rows: PitcherStrikeoutTeamRow[]) {
  vi.doMock("@/hooks/useMlbPropsData", () => ({
    useMlbPropsData: () => ({
      dashboard: dashboardFixture,
      games: [gameA, gameB],
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

function mainSection() {
  return within(document.querySelector('[data-x-export="mlb-strikeout-props"]') as HTMLElement);
}

describe("Main table incremental loading", () => {
  it("shows only the first 50 pitchers initially", async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData(paginationRows);
    await renderPage();

    await screen.findAllByText("Pitcher 01");
    const main = mainSection();
    expect(main.getByText("Pitcher 50")).toBeInTheDocument();
    expect(main.queryByText("Pitcher 51")).not.toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it('"Show 50 more" reveals the rest and then hides itself once every row is visible', async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData(paginationRows);
    await renderPage();

    await screen.findAllByText("Pitcher 01");
    fireEvent.click(screen.getByRole("button", { name: "Show 50 more" }));

    const main = mainSection();
    expect(main.getByText("Pitcher 51")).toBeInTheDocument();
    expect(main.getByText("Pitcher 60")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show 50 more" })).not.toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("resets the visible count back to 50 when the search filter materially changes", async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData(paginationRows);
    await renderPage();

    await screen.findAllByText("Pitcher 01");
    fireEvent.click(screen.getByRole("button", { name: "Show 50 more" }));
    expect(mainSection().getByText("Pitcher 60")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search pitcher, team, park"), { target: { value: "Pitcher" } });

    const main = mainSection();
    expect(main.getByText("Pitcher 01")).toBeInTheDocument();
    expect(main.queryByText("Pitcher 51")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show 50 more" })).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("does not change ranking order -- rows stay sorted after expanding", async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData(paginationRows);
    const { container } = await renderPage();

    await screen.findAllByText("Pitcher 01");
    fireEvent.click(screen.getByRole("button", { name: "Show 50 more" }));

    const names = Array.from(container.querySelectorAll('[data-x-export="mlb-strikeout-props"] table tbody tr td:nth-child(2)'))
      .map((el) => el.textContent?.trim())
      .filter((text): text is string => !!text && text.includes("Pitcher"));
    const indices = names.map((name) => Number(name.match(/Pitcher (\d+)/)?.[1]));
    expect(indices.length).toBe(60);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  }, SLOW_RENDER_TIMEOUT_MS);
});

describe("Mobile compact rows -- collapsed header and K Model Metrics expand grid", () => {
  it("shows logo/name/opponent/line/score in the collapsed row and moves secondary metrics into the expand grid", async () => {
    stubMatchMedia(true);
    vi.resetModules();
    mockPropsData([makeRow({ pitcher: "Compact Guy", strikeoutMatchupScore: 71 })]);
    await renderPage();

    const collapsedRow = await screen.findByRole("button", { name: /Show recent strikeout details for Compact Guy/ });
    expect(within(collapsedRow).getByText("Compact Guy")).toBeInTheDocument();
    expect(within(collapsedRow).getByText("vs CHC")).toBeInTheDocument();
    // Secondary metrics are not in the collapsed row.
    expect(within(collapsedRow).queryByText(/K VS/)).not.toBeInTheDocument();

    fireEvent.click(collapsedRow);
    expect(await screen.findByText("K Model Metrics")).toBeInTheDocument();
    expect(screen.getByText("K VS")).toBeInTheDocument();
    expect(screen.getByText("Recent Starts")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("renders no page-level table markup below lg for the main section", async () => {
    stubMatchMedia(true);
    vi.resetModules();
    mockPropsData([makeRow()]);
    const { container } = await renderPage();

    await screen.findAllByText("Base Pitcher");
    expect(container.querySelector('[data-x-export="mlb-strikeout-props"] table')).toBeNull();
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

    // Pitcher-friendly order: Fenway Park (0.92) leads Wrigley Field (1.0).
    const compactGrid = screen.getByTestId("park-factors-compact-grid");
    expect(within(compactGrid).getByText("Fenway Park")).toBeInTheDocument();
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
    expect(within(compactGrid).getByText("Fenway Park")).toBeInTheDocument();
    expect(within(compactGrid).getByText("Wrigley Field")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);
});

describe("Low Confidence -- collapsed by default, JS-conditional mobile/desktop", () => {
  it("is collapsed by default and expands on click, showing rows underneath", async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData([makeRow(), lowConfidenceRow]);
    await renderPage();

    const heading = await screen.findByText("Low Confidence", { exact: false });
    const details = heading.closest("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(within(details).getByText("Uncertain Arm")).toBeInTheDocument();

    const summary = details.querySelector("summary") as HTMLElement;
    fireEvent.click(summary);
    expect(details.open).toBe(true);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("renders compact rows below lg with metrics moved into the expand grid", async () => {
    stubMatchMedia(true);
    vi.resetModules();
    mockPropsData([makeRow(), lowConfidenceRow]);
    await renderPage();

    const heading = await screen.findByText("Low Confidence", { exact: false });
    const details = heading.closest("details") as HTMLElement;
    expect(details.querySelector("table")).toBeNull();
    expect(within(details).getByText("Uncertain Arm")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("renders a table at lg and above (desktop unchanged)", async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData([makeRow(), lowConfidenceRow]);
    await renderPage();

    const heading = await screen.findByText("Low Confidence", { exact: false });
    const details = heading.closest("details") as HTMLElement;
    expect(details.querySelector("table")).not.toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);
});

describe("How to use this page / Understanding Edge -- collapsed by default below lg", () => {
  it("is collapsed by default below lg and expands on click", async () => {
    stubMatchMedia(true);
    vi.resetModules();
    mockPropsData([makeRow()]);
    await renderPage();

    await screen.findByText("How to use this page");
    expect(screen.queryByText(/This board ranks today's probable starters by K Score/)).not.toBeInTheDocument();
    expect(screen.queryByText("Edge compares our projected strikeouts to the sportsbook line.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Click to expand" }));
    expect(screen.getByText(/This board ranks today's probable starters by K Score/)).toBeInTheDocument();
    expect(screen.getByText("Edge compares our projected strikeouts to the sportsbook line.")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("is expanded by default at lg and above with no collapse control", async () => {
    stubMatchMedia(false);
    vi.resetModules();
    mockPropsData([makeRow()]);
    await renderPage();

    await screen.findByText("How to use this page");
    expect(screen.getByText(/This board ranks today's probable starters by K Score/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Click to expand" })).not.toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);
});

describe("Compact row accessibility -- aria-controls, visible expand label, keyboard, single-open", () => {
  it("main table: aria-controls points to an existing element once expanded", async () => {
    stubMatchMedia(true);
    vi.resetModules();
    mockPropsData([makeRow({ pitcher: "Aria Guy" })]);
    await renderPage();

    const trigger = await screen.findByRole("button", { name: /Show recent strikeout details for Aria Guy/ });
    const panelId = trigger.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    // Collapsed: the id is declared but the panel isn't mounted yet (a valid ARIA disclosure pattern).
    expect(document.getElementById(panelId as string)).toBeNull();

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-controls")).toBe(panelId);
    expect(document.getElementById(panelId as string)).not.toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("main table: shows a visible 'Click to expand' label that becomes 'Show less' once expanded", async () => {
    stubMatchMedia(true);
    vi.resetModules();
    mockPropsData([makeRow({ pitcher: "Label Guy" })]);
    await renderPage();

    const trigger = await screen.findByRole("button", { name: /Show recent strikeout details for Label Guy/ });
    expect(within(trigger).getByText("Click to expand")).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(within(trigger).getByText("Show less")).toBeInTheDocument();
    expect(within(trigger).queryByText("Click to expand")).not.toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("main table: preserves aria-expanded and keyboard activation still works (real <button>, focusable, native Enter/Space semantics apply)", async () => {
    stubMatchMedia(true);
    vi.resetModules();
    mockPropsData([makeRow({ pitcher: "Keyboard Guy" })]);
    await renderPage();

    const trigger = await screen.findByRole("button", { name: /Show recent strikeout details for Keyboard Guy/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    // A native <button> (not a div/span with an onClick) is inherently keyboard-operable --
    // real browsers fire a click on Enter/Space automatically, which jsdom does not simulate.
    // Asserting it's a genuine, focusable button element is what actually proves keyboard
    // activation works for a user, rather than faking a keydown-to-click bridge in the test.
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger).not.toHaveAttribute("tabindex", "-1");
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(within(trigger).getByText("Show less")).toBeInTheDocument();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("main table: only one pitcher is expanded at a time", async () => {
    stubMatchMedia(true);
    vi.resetModules();
    mockPropsData([makeRow({ pitcher: "First Guy" }), makeRow({ pitcher: "Second Guy", team: "NYY", opponent: "BOS", gameKey: "NYY@BOS" })]);
    await renderPage();

    const firstTrigger = await screen.findByRole("button", { name: /Show recent strikeout details for First Guy/ });
    const secondTrigger = screen.getByRole("button", { name: /Show recent strikeout details for Second Guy/ });

    fireEvent.click(firstTrigger);
    expect(firstTrigger).toHaveAttribute("aria-expanded", "true");
    expect(secondTrigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(secondTrigger);
    expect(firstTrigger).toHaveAttribute("aria-expanded", "false");
    expect(secondTrigger).toHaveAttribute("aria-expanded", "true");
  }, SLOW_RENDER_TIMEOUT_MS);

  it("main table: does not overflow the viewport at 320px", async () => {
    stubMatchMedia(true);
    vi.resetModules();
    mockPropsData([makeRow({ pitcher: "Narrow Viewport Guy" })]);
    const { container } = await renderPage();

    const trigger = await screen.findByRole("button", { name: /Show recent strikeout details for Narrow Viewport Guy/ });
    fireEvent.click(trigger);

    const label = within(trigger).getByText("Show less");
    expect(label.className).not.toMatch(/whitespace-nowrap/);
    // The row stays a block-level flex column (chevron/logo/name/odds row, then the label on its own line)
    // rather than forcing the label onto the same horizontal line as the odds/score content.
    expect(trigger.className).toMatch(/flex-col/);
    expect(container.querySelector('[data-x-export="mlb-strikeout-props"]')?.className).not.toMatch(/overflow-x-auto/);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("Low Confidence: aria-controls points to an existing element once expanded, with a visible label", async () => {
    stubMatchMedia(true);
    vi.resetModules();
    mockPropsData([makeRow(), lowConfidenceRow]);
    await renderPage();

    const trigger = await screen.findByRole("button", { name: new RegExp(`Show recent strikeout details for ${lowConfidenceRow.pitcher}`) });
    expect(within(trigger).getByText("Click to expand")).toBeInTheDocument();

    const panelId = trigger.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId as string)).toBeNull();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(within(trigger).getByText("Show less")).toBeInTheDocument();
    expect(document.getElementById(panelId as string)).not.toBeNull();
  }, SLOW_RENDER_TIMEOUT_MS);

  it("Low Confidence: only one row is expanded at a time, independent of the main table", async () => {
    stubMatchMedia(true);
    vi.resetModules();
    const secondLowConfidence = makeRow({
      rank: 201,
      pitcher: "Second Uncertain Arm",
      team: "PHI",
      opponent: "ATL",
      gameKey: "ATL@PHI",
      pitcherKRate: null,
      pitcherWhiffRate: null,
      workloadConfidenceGrade: "D",
      workloadConfidenceScore: 0.2,
      workloadFlags: ["NO_STARTS_AVAILABLE"],
    });
    mockPropsData([makeRow(), lowConfidenceRow, secondLowConfidence]);
    await renderPage();

    // Expand the Low Confidence <details> so its compact rows are in the DOM.
    const summary = screen.getByText("Low Confidence", { exact: false }).closest("summary") as HTMLElement;
    fireEvent.click(summary);

    const firstTrigger = await screen.findByRole("button", { name: new RegExp(`Show recent strikeout details for ${lowConfidenceRow.pitcher}`) });
    const secondTrigger = screen.getByRole("button", { name: /Show recent strikeout details for Second Uncertain Arm/ });

    fireEvent.click(firstTrigger);
    expect(firstTrigger).toHaveAttribute("aria-expanded", "true");
    expect(secondTrigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(secondTrigger);
    expect(firstTrigger).toHaveAttribute("aria-expanded", "false");
    expect(secondTrigger).toHaveAttribute("aria-expanded", "true");
  }, SLOW_RENDER_TIMEOUT_MS);
});
