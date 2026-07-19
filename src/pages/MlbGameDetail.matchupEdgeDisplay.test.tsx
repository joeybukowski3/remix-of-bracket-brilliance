/**
 * MlbGameDetail.matchupEdgeDisplay.test.tsx
 * Game Matchup Analyzer tiles: the new mobile-only "MODEL EDGE" element
 * must show only the categorical team + tier label (never a percentage
 * or bare confidence number), support neutral/push and missing-data
 * fallbacks, and not duplicate the desktop "Edge Strength" row.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HomeSchedule } from "./MlbGameDetail";
import { DEV_MLB_MATCHUP_FIXTURE } from "@/data/mlb/devMatchupFixture";
import { getEdgeTierLabel } from "@/lib/mlb/mlbModelEdge";

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

const { computeModelEdgeMock, getEdgeTierLabelMock } = vi.hoisted(() => ({
  computeModelEdgeMock: vi.fn(),
  getEdgeTierLabelMock: vi.fn(),
}));

vi.mock("@/lib/mlb/mlbModelEdge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mlb/mlbModelEdge")>();
  getEdgeTierLabelMock.mockImplementation(actual.getEdgeTierLabel);
  return { ...actual, computeModelEdge: computeModelEdgeMock, getEdgeTierLabel: getEdgeTierLabelMock };
});

const GAME = DEV_MLB_MATCHUP_FIXTURE.schedule[0];
const DETAIL = DEV_MLB_MATCHUP_FIXTURE.detail;

function renderWithDetail(detailPreviews: Record<number, typeof DETAIL>) {
  return render(
    <MemoryRouter initialEntries={["/mlb"]}>
      <HomeSchedule
        games={[GAME]}
        detailPreviews={detailPreviews}
        onOpenGame={() => {}}
        pitcherRegressionData={[]}
        regressionLoading={false}
        mlbOdds={null}
      />
    </MemoryRouter>,
  );
}

function getModelEdgeRow() {
  const label = screen.getByText("Model Edge");
  return label.closest("div")!;
}

describe("Game Matchup Analyzer — mobile MODEL EDGE display", () => {
  it("shows the team + categorical tier label for a leaned game, never a percentage", () => {
    computeModelEdgeMock.mockReturnValue({
      pick: "home",
      awayAbbr: GAME.away.abbreviation,
      homeAbbr: GAME.home.abbreviation,
      confidence: 68,
      differential: 12,
      factors: [],
      topFactor: "",
      summary: "",
    });
    renderWithDetail({ [GAME.gamePk]: DETAIL });

    const row = getModelEdgeRow();
    expect(row).toHaveTextContent(GAME.home.abbreviation);
    expect(row).toHaveTextContent(getEdgeTierLabel(68));
    expect(row.textContent).not.toMatch(/%/);
    expect(row.textContent).not.toMatch(/\b68\b/);
    expect(row.textContent).not.toMatch(/win probability|implied probability|chance to win/i);
    // No dangling separator after the team abbreviation or tier label
    expect(row.textContent).not.toMatch(/[·—-]\s*$/);
    expect(row.textContent).not.toContain(`${GAME.home.abbreviation} —`);
  });

  it("shows 'Even' for a push (neutral) game", () => {
    computeModelEdgeMock.mockReturnValue({
      pick: "push",
      awayAbbr: GAME.away.abbreviation,
      homeAbbr: GAME.home.abbreviation,
      confidence: 50,
      differential: 0,
      factors: [],
      topFactor: "",
      summary: "",
    });
    renderWithDetail({ [GAME.gamePk]: DETAIL });

    const row = getModelEdgeRow();
    expect(row).toHaveTextContent("Even");
    expect(row.textContent).not.toMatch(/%/);
  });

  it("shows 'Edge pending' when there is no detail/model data for the game yet", () => {
    renderWithDetail({});
    const row = getModelEdgeRow();
    expect(row).toHaveTextContent("Edge pending");
  });

  it("shows the bare team abbreviation with no trailing separator if a tier label is ever unavailable", () => {
    computeModelEdgeMock.mockReturnValue({
      pick: "home",
      awayAbbr: GAME.away.abbreviation,
      homeAbbr: GAME.home.abbreviation,
      confidence: 68,
      differential: 12,
      factors: [],
      topFactor: "",
      summary: "",
    });
    getEdgeTierLabelMock.mockReturnValueOnce("");
    renderWithDetail({ [GAME.gamePk]: DETAIL });

    const row = getModelEdgeRow();
    expect(row.textContent?.trim()).toBe(`Model Edge${GAME.home.abbreviation}`);
    expect(row.textContent).not.toMatch(/[·—-]/);
  });

  it("keeps the desktop Edge Strength row separate (hidden on mobile, not duplicating the label)", () => {
    computeModelEdgeMock.mockReturnValue({
      pick: "home",
      awayAbbr: GAME.away.abbreviation,
      homeAbbr: GAME.home.abbreviation,
      confidence: 68,
      differential: 12,
      factors: [],
      topFactor: "",
      summary: "",
    });
    renderWithDetail({ [GAME.gamePk]: DETAIL });

    // Distinct eyebrow labels: "Model Edge" (new, mobile) vs "Edge Strength" (existing, desktop-only)
    expect(screen.getByText("Model Edge")).toBeInTheDocument();
    const desktopLabel = screen.getByText("Edge Strength");
    expect(desktopLabel.closest("div")?.className).toMatch(/hidden/);
    expect(desktopLabel.closest("div")?.className).toMatch(/md:flex/);
  });

  it("the mobile MODEL EDGE row is gated to mobile only (md:hidden)", () => {
    computeModelEdgeMock.mockReturnValue({
      pick: "home",
      awayAbbr: GAME.away.abbreviation,
      homeAbbr: GAME.home.abbreviation,
      confidence: 68,
      differential: 12,
      factors: [],
      topFactor: "",
      summary: "",
    });
    renderWithDetail({ [GAME.gamePk]: DETAIL });
    const row = getModelEdgeRow();
    expect(row.className).toMatch(/md:hidden/);
  });
});
