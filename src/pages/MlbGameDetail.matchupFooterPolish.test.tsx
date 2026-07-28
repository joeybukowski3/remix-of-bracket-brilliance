/**
 * MlbGameDetail.matchupFooterPolish.test.tsx
 * Top Model Drivers + Market Summary footer alignment. Presentation-only:
 * verifies the fixed-column grid structure that keeps driver rows, bar
 * tracks, and market values aligned — not the underlying calculations.
 */
import { describe, expect, it, vi } from "vitest";
import { render, within } from "@testing-library/react";
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

const MODEL_EDGE = {
  pick: "home" as const,
  awayAbbr: GAME_A.away.abbreviation,
  homeAbbr: GAME_A.home.abbreviation,
  confidence: 68,
  differential: 12,
  factors: [
    { label: "Pitcher Quality", awayScore: 55, homeScore: 70, weight: 0.3, weightedDifference: -4.5, description: "ERA, K/9, BB%, HR/9" },
    { label: "Recent Form", awayScore: 60, homeScore: 62, weight: 0.15, weightedDifference: -0.3, description: "Last 5 games" },
    { label: "Matchup Edge", awayScore: 58, homeScore: 61, weight: 0.25, weightedDifference: -0.75, description: "Lineup OPS vs hand" },
  ],
  topFactor: "Pitcher Quality",
  summary: "",
};

function renderCard() {
  const { container } = render(
    <MemoryRouter initialEntries={["/mlb"]}>
      <HomeSchedule
        games={[GAME_A]}
        detailPreviews={{ [GAME_A.gamePk]: DETAIL }}
        onOpenGame={() => {}}
        pitcherRegressionData={[]}
        regressionLoading={false}
        mlbOdds={null}
      />
    </MemoryRouter>,
  );
  return container.querySelector(`#mlb-game-${GAME_A.gamePk}`) as HTMLElement;
}

describe("Game Matchup Analyzer — Top Model Drivers / Market Summary footer alignment", () => {
  it("gives every driver row the same fixed grid-column template (consistent row height, aligned label/bar/value columns)", () => {
    computeModelEdgeMock.mockReturnValue(MODEL_EDGE);
    const card = renderCard();

    const driverLabel = within(card).getByText("Pitcher Quality");
    const rows = within(card).getAllByText(/Pitcher Quality|Recent Form|Matchup Edge/).map((el) => el.closest("div"));
    expect(rows.length).toBe(3);
    const templates = rows.map((row) => row?.className);
    // Every driver row shares the same grid template and fixed height class.
    for (const className of templates) {
      expect(className).toContain("grid-cols-[68px_16px_minmax(0,1fr)_16px_54px]");
      expect(className).toContain("h-6");
    }
    expect(driverLabel).toBeInTheDocument();
  });

  it("right-aligns the driver edge value into its own fixed-width column", () => {
    computeModelEdgeMock.mockReturnValue(MODEL_EDGE);
    const card = renderCard();

    const value = within(card).getByText(/BOS \+4\.5|NYY \+4\.5/);
    expect(value.className).toContain("justify-self-end");
  });

  it("both home and away team abbreviations appear on the bar for every driver row", () => {
    computeModelEdgeMock.mockReturnValue(MODEL_EDGE);
    const card = renderCard();

    const driversSection = within(card).getByText("Top Model Drivers").parentElement as HTMLElement;
    expect(within(driversSection).getAllByText(GAME_A.home.abbreviation).length).toBeGreaterThanOrEqual(3);
    expect(within(driversSection).getAllByText(GAME_A.away.abbreviation).length).toBeGreaterThanOrEqual(3);
  });

  it("lays out Market Summary as a two-column grid with labels left and values right-aligned", () => {
    computeModelEdgeMock.mockReturnValue(MODEL_EDGE);
    const card = renderCard();

    const marketWrapper = within(card).getByText("Market Summary").parentElement as HTMLElement;
    const marketSection = within(card).getByText("Market Summary").nextElementSibling as HTMLElement;
    expect(marketSection.className).toContain("grid-cols-[auto_1fr]");

    expect(within(marketWrapper).getByText("Total")).toBeInTheDocument();
    const polymarketValue = within(marketSection).getByText("Polymarket").nextElementSibling as HTMLElement;
    expect(polymarketValue.className).toContain("justify-self-end");
  });

  it("does not wrap or duplicate the Edge Strength row now that it uses a display-contents grouping wrapper", () => {
    computeModelEdgeMock.mockReturnValue(MODEL_EDGE);
    const card = renderCard();

    const marketSection = within(card).getByText("Market Summary").parentElement as HTMLElement;
    const edgeStrengthLabel = within(marketSection).getByText("Edge Strength");
    expect(edgeStrengthLabel.closest("div")?.className).toContain("hidden");
    expect(edgeStrengthLabel.closest("div")?.className).toContain("md:contents");
  });
});
