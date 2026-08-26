import { fireEvent, render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CfbSeasonStats } from "@/data/cfb/types";
import type { CfbMatchupSeasonStatsContext } from "@/lib/cfb/seasonStatsPresentation";
import CollegeFootballSeasonStatsComparison from "./CollegeFootballSeasonStatsComparison";

const AWAY_COLOR = "#4b9cd3";
const HOME_COLOR = "#4d1979";

function stats(teamId: string, overrides: Partial<CfbSeasonStats> = {}): CfbSeasonStats {
  return {
    teamId,
    gamesPlayed: 12,
    pointsPerGame: null,
    yardsPerPlay: null,
    pointsPerPlay: null,
    rushYardsPerGame: null,
    yardsPerRush: null,
    passYardsPerGame: null,
    yardsPerPass: null,
    thirdDownPct: null,
    completionPct: null,
    turnovers: null,
    pointsAllowedPerGame: null,
    yardsPerPlayAllowed: null,
    opponentPointsPerPlay: null,
    rushYardsAllowedPerGame: null,
    yardsPerRushAllowed: null,
    passYardsAllowedPerGame: null,
    yardsPerPassAllowed: null,
    opponentThirdDownPct: null,
    opponentCompletionPct: null,
    takeaways: null,
    ...overrides,
  };
}

const FULL_AWAY = stats("away", {
  pointsPerGame: 31.234,
  yardsPerPlay: 6.4,
  pointsPerPlay: 0.451,
  thirdDownPct: 0.417,
  completionPct: 0.655,
  yardsPerRush: 4.2,
  yardsPerPass: 8.13,
  pointsAllowedPerGame: 19.2,
  yardsPerPlayAllowed: 4.9,
  opponentPointsPerPlay: 0.318,
  opponentThirdDownPct: 0.373,
  opponentCompletionPct: 0.621,
  yardsPerRushAllowed: 3.7,
  yardsPerPassAllowed: 6.44,
});

const FULL_HOME = stats("home", {
  pointsPerGame: 24.1,
  yardsPerPlay: 5.4,
  pointsPerPlay: 0.34,
  thirdDownPct: 0.328,
  completionPct: 0.589,
  yardsPerRush: 4.07,
  yardsPerPass: 6.56,
  pointsAllowedPerGame: 29.7,
  yardsPerPlayAllowed: 5.79,
  opponentPointsPerPlay: 0.413,
  opponentThirdDownPct: 0.424,
  opponentCompletionPct: 0.634,
  yardsPerRushAllowed: 4.14,
  yardsPerPassAllowed: 7.45,
});

const FULL_CONTEXT: CfbMatchupSeasonStatsContext = {
  seasonLabel: "Last Season · 2025",
  season: 2025,
  isCurrentSeason: false,
  away: FULL_AWAY,
  home: FULL_HOME,
  awayRanks: { pointsPerGame: 22, thirdDownPct: 31, opponentThirdDownPct: 40 },
  homeRanks: { pointsPerGame: 91 },
};

/**
 * The component renders two structurally-identical trees — a desktop
 * side-by-side pair (always mounted, CSS-hidden below `lg`) and a mobile
 * tabbed single-card view (CSS-hidden at `lg`+) — so unit tests that need
 * exactly one match per row scope their queries to the desktop tree, which
 * always shows both Offense and Defense regardless of tab state.
 */
function renderAndGetDesktopScope(context: CfbMatchupSeasonStatsContext) {
  const { container, ...rest } = render(
    <CollegeFootballSeasonStatsComparison
      awayShortName="AWAY"
      homeShortName="HOME"
      context={context}
      awayColor={AWAY_COLOR}
      homeColor={HOME_COLOR}
    />,
  );
  const desktopScope = container.querySelector(".hidden.lg\\:grid") as HTMLElement;
  expect(desktopScope).not.toBeNull();
  return { container, desktopScope, ...rest };
}

describe("CollegeFootballSeasonStatsComparison", () => {
  it("renders all 14 metric rows across offense and defense", () => {
    const { desktopScope } = renderAndGetDesktopScope(FULL_CONTEXT);
    const offenseLabels = ["Points/Game", "Yards/Play", "Points/Play", "3rd Down %", "Completion %", "Rush Yards/Att", "Pass Yards/Att"];
    const defenseLabels = [
      "Opp Points/Game",
      "Opp Yards/Play",
      "Opp Points/Play",
      "Opp 3rd Down %",
      "Opp Completion %",
      "Opp Rush Yards/Att",
      "Opp Pass Yards/Att",
    ];
    for (const label of [...offenseLabels, ...defenseLabels]) {
      expect(within(desktopScope).getByText(label)).toBeInTheDocument();
    }
  });

  it("formats each metric with its specified precision", () => {
    const { desktopScope } = renderAndGetDesktopScope(FULL_CONTEXT);
    expect(within(desktopScope).getByText("31.2")).toBeInTheDocument(); // pointsPerGame, 1 decimal
    expect(within(desktopScope).getByText("0.45")).toBeInTheDocument(); // pointsPerPlay, 2 decimals
    expect(within(desktopScope).getByText("41.7%")).toBeInTheDocument(); // thirdDownPct, 1 decimal + %
    expect(within(desktopScope).getByText("65.5%")).toBeInTheDocument(); // completionPct
    expect(within(desktopScope).getByText("4.20")).toBeInTheDocument(); // yardsPerRush, 2 decimals
    expect(within(desktopScope).getByText("8.13")).toBeInTheDocument(); // yardsPerPass, 2 decimals
  });

  it("displays the generated rank as a muted badge beside the value", () => {
    const { desktopScope } = renderAndGetDesktopScope(FULL_CONTEXT);
    expect(within(desktopScope).getByText("#22")).toBeInTheDocument();
    expect(within(desktopScope).getByText("#91")).toBeInTheDocument();
  });

  it("omits the rank badge for metrics absent from the ranks map, without a fake dash", () => {
    const { desktopScope } = renderAndGetDesktopScope(FULL_CONTEXT);
    // FULL_CONTEXT only supplies ranks for pointsPerGame (both sides) and
    // thirdDownPct/opponentThirdDownPct (away only) — every other metric row
    // must render its value with no "#N" badge at all.
    const allRankBadges = within(desktopScope).getAllByText(/^#\d+$/);
    expect(allRankBadges.map((el) => el.textContent).sort()).toEqual(["#22", "#31", "#40", "#91"]);
  });

  it("marks the correct stronger side for a higher-is-better metric (Points/Game), in each team's own color", () => {
    const { desktopScope } = renderAndGetDesktopScope(FULL_CONTEXT);
    // away.pointsPerGame (31.2) > home.pointsPerGame (24.1) -> away should carry the edge marker.
    const pointsRow = within(desktopScope).getByText("Points/Game").closest("div")?.parentElement;
    expect(pointsRow).not.toBeNull();
    expect(pointsRow?.textContent).toContain("31.2");
    const marker = pointsRow?.querySelector('[data-testid="stronger-badge"]') as HTMLElement | null;
    expect(marker).not.toBeNull();
    const swatch = document.createElement("div");
    swatch.style.background = AWAY_COLOR;
    expect(marker?.style.background).toBe(swatch.style.background);
  });

  it("marks the correct stronger side for a lower-is-better metric (Opp Points/Game)", () => {
    const { desktopScope } = renderAndGetDesktopScope(FULL_CONTEXT);
    // away.pointsAllowedPerGame (19.2) < home.pointsAllowedPerGame (29.7) -> away has the (defensive) edge.
    const oppPointsRow = within(desktopScope).getByText("Opp Points/Game").closest("div")?.parentElement;
    expect(oppPointsRow).not.toBeNull();
    expect(oppPointsRow?.textContent).toContain("19.2");
    expect(oppPointsRow?.querySelector('[data-testid="stronger-badge"]')).not.toBeNull();
  });

  it("shows the existing null treatment and no rank when a value is null (NDSU-like missing side)", () => {
    const context: CfbMatchupSeasonStatsContext = {
      ...FULL_CONTEXT,
      home: stats("home", { gamesPlayed: 0 }),
      homeRanks: {},
    };
    const { desktopScope } = renderAndGetDesktopScope(context);
    expect(within(desktopScope).getAllByText("—").length).toBeGreaterThan(0);
    // Only away's ranks should appear; no fabricated rank for the null home side.
    expect(within(desktopScope).queryByText("#91")).not.toBeInTheDocument();
  });

  it("defaults the mobile tab view to Offense, and switching tabs swaps which card is shown", () => {
    const { container } = renderAndGetDesktopScope(FULL_CONTEXT);
    const mobileScope = container.querySelector(".lg\\:hidden") as HTMLElement;
    expect(mobileScope).not.toBeNull();
    expect(within(mobileScope).getByText("Points/Game")).toBeInTheDocument();
    expect(within(mobileScope).queryByText("Opp Points/Game")).not.toBeInTheDocument();

    fireEvent.click(within(mobileScope).getByRole("button", { name: "Defense" }));
    expect(within(mobileScope).getByText("Opp Points/Game")).toBeInTheDocument();
    expect(within(mobileScope).queryByText("Points/Game")).not.toBeInTheDocument();

    fireEvent.click(within(mobileScope).getByRole("button", { name: "Off vs Def" }));
    expect(within(mobileScope).getByText("Points/Game")).toBeInTheDocument();
    expect(within(mobileScope).getByText("Opp Points/Game")).toBeInTheDocument();
  });

  it("never renders NaN or undefined", () => {
    const { container } = renderAndGetDesktopScope(FULL_CONTEXT);
    expect(container.textContent ?? "").not.toMatch(/\bNaN\b/);
    expect(container.textContent ?? "").not.toMatch(/\bundefined\b/);
  });
});
