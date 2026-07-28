/**
 * MlbGameDetail.matchupCardCompact.test.tsx
 * Game Matchup Analyzer cards: collapsed-by-default with an accessible
 * disclosure control that reveals the Season / Last 14 / Home-Away Context
 * comparison rows on demand, while Top Model Drivers and Market Summary
 * remain visible in the collapsed state. Presentation/interaction only —
 * these tests assert structure and data fidelity, not model calculations.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HomeSchedule } from "./MlbGameDetail";
import { DEV_MLB_MATCHUP_FIXTURE } from "@/data/mlb/devMatchupFixture";

vi.mock("@/hooks/useMlbPropsData", () => ({
  useMlbPropsData: () => ({
    dashboard: undefined,
    batters: [],
    batterVsPitcherRows: [],
    strikeoutRows: [],
    strikeoutDetailRows: [],
    pitchers: [],
    games: [],
    pendingGames: [],
    propDate: "2026-07-19",
    nextRunAt: null,
    loading: false,
  }),
}));

vi.mock("@/hooks/usePolymarketMlbMoneylines", () => ({
  usePolymarketMlbMoneylines: () => ({ data: null, isLoading: false, isError: false }),
}));

vi.mock("@/hooks/usePitcherRegression", () => ({
  usePitcherRegression: () => ({ data: [] }),
}));

const { computeModelEdgeMock } = vi.hoisted(() => ({
  computeModelEdgeMock: vi.fn(),
}));

vi.mock("@/lib/mlb/mlbModelEdge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mlb/mlbModelEdge")>();
  return { ...actual, computeModelEdge: computeModelEdgeMock };
});

const GAME_A = DEV_MLB_MATCHUP_FIXTURE.schedule[0];
const DETAIL = DEV_MLB_MATCHUP_FIXTURE.detail;
const GAME_B = {
  ...GAME_A,
  gamePk: GAME_A.gamePk + 1,
  away: { ...GAME_A.away, abbreviation: "TB" },
  home: { ...GAME_A.home, abbreviation: "BAL" },
};

const MODEL_EDGE = {
  pick: "home" as const,
  awayAbbr: GAME_A.away.abbreviation,
  homeAbbr: GAME_A.home.abbreviation,
  confidence: 68,
  differential: 12,
  factors: [
    { label: "Pitcher Quality", awayScore: 55, homeScore: 70, weight: 0.3, weightedDifference: -4.5, description: "ERA, K/9, BB%, HR/9" },
    { label: "Recent Form", awayScore: 60, homeScore: 62, weight: 0.15, weightedDifference: -0.3, description: "Last 5 games" },
  ],
  topFactor: "Pitcher Quality",
  summary: "",
};

function renderGames(games: typeof DEV_MLB_MATCHUP_FIXTURE.schedule, detailPreviews: Record<number, typeof DETAIL>) {
  return render(
    <MemoryRouter initialEntries={["/mlb"]}>
      <HomeSchedule
        games={games}
        detailPreviews={detailPreviews}
        onOpenGame={() => {}}
        pitcherRegressionData={[]}
        regressionLoading={false}
        mlbOdds={null}
      />
    </MemoryRouter>,
  );
}

function getToggle(container: HTMLElement, gamePk: number) {
  const card = container.querySelector(`#mlb-game-${gamePk}`)!;
  return within(card as HTMLElement).getByRole("button", { name: /matchup comparison/i });
}

describe("Game Matchup Analyzer — compact/expandable cards", () => {
  it("renders collapsed by default with the expand control visible", () => {
    computeModelEdgeMock.mockReturnValue(MODEL_EDGE);
    const { container } = renderGames([GAME_A], { [GAME_A.gamePk]: DETAIL });

    const toggle = getToggle(container, GAME_A.gamePk);
    expect(toggle).toHaveTextContent("Expand to show matchup comparison");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("hides the Season / Last 14 / Home-Away Context comparison rows initially", () => {
    computeModelEdgeMock.mockReturnValue(MODEL_EDGE);
    renderGames([GAME_A], { [GAME_A.gamePk]: DETAIL });

    expect(screen.queryAllByText("Season")).toHaveLength(0);
    expect(screen.queryAllByText("Last 14")).toHaveLength(0);
  });

  it("reveals the comparison rows when the control is clicked", () => {
    computeModelEdgeMock.mockReturnValue(MODEL_EDGE);
    const { container } = renderGames([GAME_A], { [GAME_A.gamePk]: DETAIL });

    fireEvent.click(getToggle(container, GAME_A.gamePk));

    const card = container.querySelector(`#mlb-game-${GAME_A.gamePk}`) as HTMLElement;
    expect(within(card).getAllByText("Season").length).toBeGreaterThan(0);
    expect(within(card).getAllByText("Last 14").length).toBeGreaterThan(0);
    expect(getToggle(container, GAME_A.gamePk)).toHaveTextContent("Collapse matchup comparison");
    expect(getToggle(container, GAME_A.gamePk)).toHaveAttribute("aria-expanded", "true");
  });

  it("collapses the comparison rows again on a second click", () => {
    computeModelEdgeMock.mockReturnValue(MODEL_EDGE);
    const { container } = renderGames([GAME_A], { [GAME_A.gamePk]: DETAIL });

    const toggle = getToggle(container, GAME_A.gamePk);
    fireEvent.click(toggle);
    fireEvent.click(getToggle(container, GAME_A.gamePk));

    expect(screen.queryAllByText("Season")).toHaveLength(0);
    expect(getToggle(container, GAME_A.gamePk)).toHaveAttribute("aria-expanded", "false");
    expect(getToggle(container, GAME_A.gamePk)).toHaveTextContent("Expand to show matchup comparison");
  });

  it("expands each card independently — expanding one does not expand the other", () => {
    computeModelEdgeMock.mockReturnValue(MODEL_EDGE);
    const { container } = renderGames([GAME_A, GAME_B], {
      [GAME_A.gamePk]: DETAIL,
      [GAME_B.gamePk]: DETAIL,
    });

    fireEvent.click(getToggle(container, GAME_A.gamePk));

    expect(getToggle(container, GAME_A.gamePk)).toHaveAttribute("aria-expanded", "true");
    expect(getToggle(container, GAME_B.gamePk)).toHaveAttribute("aria-expanded", "false");
  });

  it("wires aria-controls on the toggle to the id of the revealed comparison panel", () => {
    computeModelEdgeMock.mockReturnValue(MODEL_EDGE);
    const { container } = renderGames([GAME_A], { [GAME_A.gamePk]: DETAIL });

    const toggle = getToggle(container, GAME_A.gamePk);
    const controlsId = toggle.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();

    fireEvent.click(toggle);
    expect(document.getElementById(controlsId!)).not.toBeNull();
  });

  it("still displays Top Model Drivers values in the collapsed card", () => {
    computeModelEdgeMock.mockReturnValue(MODEL_EDGE);
    const { container } = renderGames([GAME_A], { [GAME_A.gamePk]: DETAIL });

    const card = container.querySelector(`#mlb-game-${GAME_A.gamePk}`) as HTMLElement;
    expect(within(card).getByText("Top Model Drivers")).toBeInTheDocument();
    expect(within(card).getByText("Pitcher Quality")).toBeInTheDocument();
    expect(within(card).getByText("Recent Form")).toBeInTheDocument();
  });

  it("still displays Market Summary values in the collapsed card", () => {
    computeModelEdgeMock.mockReturnValue(MODEL_EDGE);
    const { container } = renderGames([GAME_A], { [GAME_A.gamePk]: DETAIL });

    const card = container.querySelector(`#mlb-game-${GAME_A.gamePk}`) as HTMLElement;
    expect(within(card).getByText("Market Summary")).toBeInTheDocument();
    expect(within(card).getByText("Total")).toBeInTheDocument();
    expect(within(card).getByText("Polymarket")).toBeInTheDocument();
  });

  it("renders a scheduled game safely with the collapsed structure", () => {
    computeModelEdgeMock.mockReturnValue(MODEL_EDGE);
    const scheduled = { ...GAME_A, status: "Scheduled" };
    const { container } = renderGames([scheduled], { [scheduled.gamePk]: DETAIL });
    expect(getToggle(container, scheduled.gamePk)).toBeInTheDocument();
  });

  it("renders an in-progress (live) game safely, still collapsed by default", () => {
    computeModelEdgeMock.mockReturnValue(MODEL_EDGE);
    const live = { ...GAME_A, status: "In Progress", currentInning: 4, inningHalf: "top" as const };
    const { container } = renderGames([live], { [live.gamePk]: DETAIL });
    expect(getToggle(container, live.gamePk)).toHaveAttribute("aria-expanded", "false");
  });

  it("renders a completed (final) game safely, still collapsed by default", () => {
    computeModelEdgeMock.mockReturnValue(MODEL_EDGE);
    const final = {
      ...GAME_A,
      status: "Final",
      away: { ...GAME_A.away, score: 4 },
      home: { ...GAME_A.home, score: 2 },
    };
    const { container } = renderGames([final], { [final.gamePk]: DETAIL });
    expect(getToggle(container, final.gamePk)).toHaveAttribute("aria-expanded", "false");
  });

  it("uses the same collapsed-by-default disclosure regardless of viewport (no separate mobile card path)", () => {
    computeModelEdgeMock.mockReturnValue(MODEL_EDGE);
    const { container } = renderGames([GAME_A], { [GAME_A.gamePk]: DETAIL });

    // There is a single rendered card (not a duplicated desktop/mobile pair),
    // and its disclosure control is not gated behind a responsive-only class.
    const toggle = getToggle(container, GAME_A.gamePk);
    expect(toggle.className).not.toMatch(/\bhidden\b/);
    expect(container.querySelectorAll(`#mlb-game-${GAME_A.gamePk}`)).toHaveLength(1);
  });
});
