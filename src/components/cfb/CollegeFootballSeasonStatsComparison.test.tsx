import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CfbSeasonStats } from "@/data/cfb/types";
import type { CfbMatchupSeasonStatsContext } from "@/lib/cfb/seasonStatsPresentation";
import CollegeFootballSeasonStatsComparison from "./CollegeFootballSeasonStatsComparison";

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

describe("CollegeFootballSeasonStatsComparison", () => {
  it("renders all 14 metric rows across offense and defense", () => {
    render(<CollegeFootballSeasonStatsComparison awayShortName="AWAY" homeShortName="HOME" context={FULL_CONTEXT} />);
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
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("formats each metric with its specified precision", () => {
    render(<CollegeFootballSeasonStatsComparison awayShortName="AWAY" homeShortName="HOME" context={FULL_CONTEXT} />);
    expect(screen.getByText("31.2")).toBeInTheDocument(); // pointsPerGame, 1 decimal
    expect(screen.getByText("0.45")).toBeInTheDocument(); // pointsPerPlay, 2 decimals
    expect(screen.getByText("41.7%")).toBeInTheDocument(); // thirdDownPct, 1 decimal + %
    expect(screen.getByText("65.5%")).toBeInTheDocument(); // completionPct
    expect(screen.getByText("4.20")).toBeInTheDocument(); // yardsPerRush, 2 decimals
    expect(screen.getByText("8.13")).toBeInTheDocument(); // yardsPerPass, 2 decimals
  });

  it("displays the generated rank as a muted badge beside the value", () => {
    render(<CollegeFootballSeasonStatsComparison awayShortName="AWAY" homeShortName="HOME" context={FULL_CONTEXT} />);
    expect(screen.getByText("#22")).toBeInTheDocument();
    expect(screen.getByText("#91")).toBeInTheDocument();
  });

  it("omits the rank badge for metrics absent from the ranks map, without a fake dash", () => {
    render(<CollegeFootballSeasonStatsComparison awayShortName="AWAY" homeShortName="HOME" context={FULL_CONTEXT} />);
    // FULL_CONTEXT only supplies ranks for pointsPerGame (both sides) and
    // thirdDownPct/opponentThirdDownPct (away only) — every other metric row
    // must render its value with no "#N" badge at all.
    const allRankBadges = screen.getAllByText(/^#\d+$/);
    expect(allRankBadges.map((el) => el.textContent).sort()).toEqual(["#22", "#31", "#40", "#91"]);
  });

  it("marks the correct stronger side for a higher-is-better metric (Points/Game)", () => {
    const { container } = render(
      <CollegeFootballSeasonStatsComparison awayShortName="AWAY" homeShortName="HOME" context={FULL_CONTEXT} />,
    );
    // away.pointsPerGame (31.2) > home.pointsPerGame (24.1) -> away should carry the edge marker.
    const pointsRow = screen.getByText("Points/Game").closest("div")?.parentElement;
    expect(pointsRow?.querySelector(".text-emerald-800")?.textContent).toContain("31.2");
    expect(container.querySelectorAll(".text-emerald-600").length).toBeGreaterThan(0);
  });

  it("marks the correct stronger side for a lower-is-better metric (Opp Points/Game)", () => {
    render(<CollegeFootballSeasonStatsComparison awayShortName="AWAY" homeShortName="HOME" context={FULL_CONTEXT} />);
    // away.pointsAllowedPerGame (19.2) < home.pointsAllowedPerGame (29.7) -> away has the (defensive) edge.
    const oppPointsRow = screen.getByText("Opp Points/Game").closest("div")?.parentElement;
    expect(oppPointsRow?.querySelector(".text-emerald-800")?.textContent).toContain("19.2");
  });

  it("shows the existing null treatment and no rank when a value is null (NDSU-like missing side)", () => {
    const context: CfbMatchupSeasonStatsContext = {
      ...FULL_CONTEXT,
      home: stats("home", { gamesPlayed: 0 }),
      homeRanks: {},
    };
    render(<CollegeFootballSeasonStatsComparison awayShortName="AWAY" homeShortName="HOME" context={context} />);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    // Only away's ranks should appear; no fabricated rank for the null home side.
    expect(screen.queryByText("#91")).not.toBeInTheDocument();
  });

  it("never renders NaN or undefined", () => {
    const { container } = render(
      <CollegeFootballSeasonStatsComparison awayShortName="AWAY" homeShortName="HOME" context={FULL_CONTEXT} />,
    );
    expect(container.textContent ?? "").not.toMatch(/\bNaN\b/);
    expect(container.textContent ?? "").not.toMatch(/\bundefined\b/);
  });
});
