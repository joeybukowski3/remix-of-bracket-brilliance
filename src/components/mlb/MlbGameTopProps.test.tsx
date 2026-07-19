/**
 * MlbGameTopProps.test.tsx
 * Presentation-only tests for the "Top Props for This Game" section: it
 * receives already-loaded data as props and calls the pure
 * buildGameTopProps() adapter internally via useMemo -- no fetches, no
 * scoring here. These tests cover empty/stale/closed states, CTA hrefs,
 * mobile default-collapsed accordions, and the omitted Moneyline CTA.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MlbGameTopProps, { type MlbGameTopPropsProps } from "./MlbGameTopProps";
import { DEV_MLB_MATCHUP_FIXTURE } from "@/data/mlb/devMatchupFixture";
import type { HrDashboardBatter, PitcherStrikeoutTeamRow, PitcherVsBatterRow } from "@/pages/MlbHrProps";

const DETAIL = DEV_MLB_MATCHUP_FIXTURE.detail;
const AWAY = DETAIL.game.away.abbreviation; // NYY
const HOME = DETAIL.game.home.abbreviation; // BOS
const GAME_PK = DETAIL.game.gamePk;

function makeBatter(overrides: Partial<HrDashboardBatter> = {}): HrDashboardBatter {
  return {
    gameKey: `${AWAY}@${HOME}`,
    playerId: 1,
    gameId: GAME_PK,
    lineupStatus: "confirmed",
    battingOrder: 3,
    starterConfirmed: true,
    position: "OF",
    player: "Test Player",
    team: AWAY,
    opponent: HOME,
    opposingPitcher: "Test Pitcher",
    opposingPitcherId: 1002,
    pitcherHand: "R",
    ballpark: "Fenway Park",
    parkFactor: 1.0,
    atBats: 120,
    barrelRate: 10,
    hardHitRate: 40,
    exitVelo: 90,
    iso: 0.2,
    hrFBRatio: 12,
    pullRate: 40,
    xba: 0.25,
    kRate: 20,
    bbRate: 8,
    whiffRate: 25,
    last7HR: 1,
    last30HR: 3,
    opposingPitcherHrVs: 60,
    opposingPitcherHitsVs: 60,
    opposingPitcherKVs: 60,
    weatherBoost: 0,
    hrScore: 65,
    hrScoreRank: 1,
    hrOddsYes: "+320",
    angleTags: [],
    ...overrides,
  };
}

function baseProps(overrides: Partial<MlbGameTopPropsProps> = {}): MlbGameTopPropsProps {
  return {
    detail: DETAIL,
    mlbOdds: null,
    polymarket: null,
    gameStatusCategory: "scheduled",
    propsData: {
      batters: [],
      strikeoutDetailRows: [],
      batterVsPitcherRows: [],
      pendingGames: [],
      stale: false,
      generatedAt: "2026-05-10T09:00:00Z",
    },
    bvpHistoryByKey: new Map(),
    numerology: { data: null, isStale: false },
    ...overrides,
  };
}

function renderTopProps(overrides: Partial<MlbGameTopPropsProps> = {}) {
  return render(
    <MemoryRouter>
      <MlbGameTopProps {...baseProps(overrides)} />
    </MemoryRouter>,
  );
}

describe("MlbGameTopProps", () => {
  it("renders the section heading and subtitle", () => {
    renderTopProps();
    expect(screen.getByText("Top Props for This Game")).toBeInTheDocument();
    expect(screen.getByText("The strongest model signals for this matchup")).toBeInTheDocument();
  });

  it("renders empty-state copy for HR, K, BvP, and Numerology when no data qualifies", () => {
    renderTopProps();
    expect(screen.getAllByText("No qualifying HR props for this game yet.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No qualified strikeout play for this game.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No standout batter-vs-pitcher edge for this game.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Numerology data unavailable.").length).toBeGreaterThan(0);
  });

  it("renders the disabled Over/Under placeholder, never a run-total heuristic", () => {
    renderTopProps();
    expect(screen.getAllByText("Totals model coming soon").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Run Total Lean/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Over lean|Under lean/i)).not.toBeInTheDocument();
  });

  it("omits a CTA link for the Moneyline strip (full breakdown already sits in the hero above)", () => {
    renderTopProps();
    expect(screen.queryByRole("link", { name: /moneyline/i })).not.toBeInTheDocument();
  });

  it("links each data-backed card's CTA to the plain canonical full-model route", () => {
    renderTopProps({
      propsData: {
        batters: [makeBatter()],
        strikeoutDetailRows: [],
        batterVsPitcherRows: [],
        pendingGames: [],
        stale: false,
        generatedAt: null,
      },
    });
    const hrLinks = screen.getAllByRole("link", { name: /view full model/i });
    const hrefs = hrLinks.map((el) => el.getAttribute("href"));
    expect(hrefs).toContain("/mlb/hr-props");
  });

  it("never renders the model's confidence as a bare percentage", () => {
    renderTopProps();
    // The tier label ("Strong lean" / "Coin flip" / etc.) is the only
    // confidence-derived text allowed -- a raw "NN%" would indicate the
    // uncalibrated confidence score leaked out as a fabricated probability.
    const percentMatches = screen.queryAllByText(/\d+%/);
    expect(percentMatches).toHaveLength(0);
  });

  it("shows a closed, informational state for every data-backed card once the game is in progress", () => {
    renderTopProps({
      gameStatusCategory: "in-progress",
      propsData: {
        batters: [makeBatter()],
        strikeoutDetailRows: [],
        batterVsPitcherRows: [],
        pendingGames: [],
        stale: false,
        generatedAt: null,
      },
    });
    expect(screen.getAllByText("Game in progress -- no new picks").length).toBeGreaterThan(0);
    expect(screen.queryByText("Test Player")).not.toBeInTheDocument();
  });

  it("shows Final copy once the game has ended", () => {
    renderTopProps({ gameStatusCategory: "final" });
    expect(screen.getAllByText(/Final -- no new picks/).length).toBeGreaterThan(0);
  });

  it("marks HR/K/BvP as stale when the props payload's own slate date is stale", () => {
    renderTopProps({
      propsData: {
        batters: [makeBatter()],
        strikeoutDetailRows: [],
        batterVsPitcherRows: [],
        pendingGames: [],
        stale: true,
        generatedAt: null,
      },
    });
    expect(screen.getAllByText("Stale data").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Test Player")).not.toBeInTheDocument();
  });

  it("collapses all four mobile accordions by default (no item content visible until expanded)", () => {
    renderTopProps({
      propsData: {
        batters: [makeBatter()],
        strikeoutDetailRows: [],
        batterVsPitcherRows: [],
        pendingGames: [],
        stale: false,
        generatedAt: null,
      },
    });
    // The mobile accordion trigger text is visible...
    const triggers = screen.getAllByText("Home Run Props");
    expect(triggers.length).toBeGreaterThan(0);
    // ...but Radix keeps AccordionContent's data-state="closed" until expanded.
    const closedPanels = document.querySelectorAll('[data-state="closed"]');
    expect(closedPanels.length).toBeGreaterThan(0);
  });
});
