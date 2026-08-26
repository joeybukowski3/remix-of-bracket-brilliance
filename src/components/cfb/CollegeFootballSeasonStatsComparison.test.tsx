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
 * tabbed pair (CSS-hidden below `lg`) and a mobile tabbed single-card view
 * (CSS-hidden at `lg`+) — each with its own tab-button group driving the
 * same shared `tab` state. Tests scope to the desktop tree by default (it
 * always shows exactly one Offense/Defense card, or both Matchup cards).
 */
function renderAndGetScopes(context: CfbMatchupSeasonStatsContext) {
  const { container, ...rest } = render(
    <CollegeFootballSeasonStatsComparison
      awayShortName="AWAY"
      homeShortName="HOME"
      context={context}
      awayColor={AWAY_COLOR}
      homeColor={HOME_COLOR}
    />,
  );
  const desktopScope = container.querySelector(".hidden.lg\\:block") as HTMLElement;
  const mobileScope = container.querySelector(".lg\\:hidden") as HTMLElement;
  expect(desktopScope).not.toBeNull();
  expect(mobileScope).not.toBeNull();
  return { container, desktopScope, mobileScope, ...rest };
}

function clickTab(scope: HTMLElement, label: string) {
  fireEvent.click(within(scope).getByRole("button", { name: label }));
}

describe("CollegeFootballSeasonStatsComparison", () => {
  it("defaults to the Offense tab and renders all 7 offense metric rows", () => {
    const { desktopScope } = renderAndGetScopes(FULL_CONTEXT);
    const offenseLabels = ["Points/Game", "Yards/Play", "Points/Play", "3rd Down %", "Completion %", "Rush Yards/Att", "Pass Yards/Att"];
    for (const label of offenseLabels) {
      expect(within(desktopScope).getByText(label)).toBeInTheDocument();
    }
    expect(within(desktopScope).queryByText("Opp Points/Game")).not.toBeInTheDocument();
  });

  it("switching to the Defense tab renders all 7 defense metric rows", () => {
    const { desktopScope } = renderAndGetScopes(FULL_CONTEXT);
    clickTab(desktopScope, "Defense");
    const defenseLabels = [
      "Opp Points/Game",
      "Opp Yards/Play",
      "Opp Points/Play",
      "Opp 3rd Down %",
      "Opp Completion %",
      "Opp Rush Yards/Att",
      "Opp Pass Yards/Att",
    ];
    for (const label of defenseLabels) {
      expect(within(desktopScope).getByText(label)).toBeInTheDocument();
    }
    expect(within(desktopScope).queryByText("Points/Game")).not.toBeInTheDocument();
  });

  it("formats each metric with its specified precision (Offense tab)", () => {
    const { desktopScope } = renderAndGetScopes(FULL_CONTEXT);
    expect(within(desktopScope).getByText("31.2")).toBeInTheDocument(); // pointsPerGame, 1 decimal
    expect(within(desktopScope).getByText("0.45")).toBeInTheDocument(); // pointsPerPlay, 2 decimals
    expect(within(desktopScope).getByText("41.7%")).toBeInTheDocument(); // thirdDownPct, 1 decimal + %
    expect(within(desktopScope).getByText("65.5%")).toBeInTheDocument(); // completionPct
    expect(within(desktopScope).getByText("4.20")).toBeInTheDocument(); // yardsPerRush, 2 decimals
    expect(within(desktopScope).getByText("8.13")).toBeInTheDocument(); // yardsPerPass, 2 decimals
  });

  it("displays the generated rank as a muted badge beside the value", () => {
    const { desktopScope } = renderAndGetScopes(FULL_CONTEXT);
    expect(within(desktopScope).getByText("#22")).toBeInTheDocument();
    expect(within(desktopScope).getByText("#91")).toBeInTheDocument();
  });

  it("omits the rank badge for metrics absent from the ranks map, without a fake dash", () => {
    const { desktopScope } = renderAndGetScopes(FULL_CONTEXT);
    // FULL_CONTEXT only supplies an away rank for thirdDownPct within the Offense tab
    // (plus pointsPerGame on both sides) — every other offense row has no "#N" badge.
    const allRankBadges = within(desktopScope).getAllByText(/^#\d+$/);
    expect(allRankBadges.map((el) => el.textContent).sort()).toEqual(["#22", "#31", "#91"]);
  });

  it("marks the correct stronger side for a higher-is-better metric (Points/Game), in each team's own color", () => {
    const { desktopScope } = renderAndGetScopes(FULL_CONTEXT);
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
    const { desktopScope } = renderAndGetScopes(FULL_CONTEXT);
    clickTab(desktopScope, "Defense");
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
    const { desktopScope } = renderAndGetScopes(context);
    expect(within(desktopScope).getAllByText("—").length).toBeGreaterThan(0);
    // Only away's ranks should appear; no fabricated rank for the null home side.
    expect(within(desktopScope).queryByText("#91")).not.toBeInTheDocument();
  });

  it("defaults the mobile tab view to Offense, and switching tabs swaps which card is shown", () => {
    const { mobileScope } = renderAndGetScopes(FULL_CONTEXT);
    expect(within(mobileScope).getByText("Points/Game")).toBeInTheDocument();
    expect(within(mobileScope).queryByText("Opp Points/Game")).not.toBeInTheDocument();

    clickTab(mobileScope, "Defense");
    expect(within(mobileScope).getByText("Opp Points/Game")).toBeInTheDocument();
    expect(within(mobileScope).queryByText("Points/Game")).not.toBeInTheDocument();
  });

  it("Matchup tab renders per-side Away Defense/Home Offense and Away Offense/Home Defense descriptors, with away always on the left", () => {
    const { desktopScope } = renderAndGetScopes(FULL_CONTEXT);
    clickTab(desktopScope, "Matchup");

    expect(within(desktopScope).getByText("Away Defense")).toBeInTheDocument();
    expect(within(desktopScope).getByText("Home Offense")).toBeInTheDocument();
    expect(within(desktopScope).getByText("Away Offense")).toBeInTheDocument();
    expect(within(desktopScope).getByText("Home Defense")).toBeInTheDocument();

    // Both matchup cards reuse the shared offense/defense-paired row labels.
    expect(within(desktopScope).getAllByText("Points/Game").length).toBe(2);

    // Card 1 (Away Defense vs Home Offense): left = away.pointsAllowedPerGame (19.2), right = home.pointsPerGame (24.1).
    expect(within(desktopScope).getByText("19.2")).toBeInTheDocument();
    expect(within(desktopScope).getByText("24.1")).toBeInTheDocument();
    // Card 2 (Away Offense vs Home Defense): left = away.pointsPerGame (31.2), right = home.pointsAllowedPerGame (29.7).
    expect(within(desktopScope).getByText("31.2")).toBeInTheDocument();
    expect(within(desktopScope).getByText("29.7")).toBeInTheDocument();

    // Orientation rule: AWAY renders before HOME in each matchup card header.
    const header = within(desktopScope).getByText("Away Defense").closest("div")
      ?.parentElement?.parentElement as HTMLElement;
    const headerText = header.textContent ?? "";
    expect(headerText.indexOf("AWAY")).toBeGreaterThanOrEqual(0);
    expect(headerText.indexOf("AWAY")).toBeLessThan(headerText.indexOf("HOME"));
  });

  it("Matchup header: away block left-aligned, home block right-aligned, larger logo than Offense/Defense headers, with the descriptor secondary to the team name", () => {
    const { desktopScope } = renderAndGetScopes(FULL_CONTEXT);
    clickTab(desktopScope, "Matchup");

    const matchupHeader = within(desktopScope).getByText("Away Defense").closest(".grid") as HTMLElement;
    const leftBlock = within(matchupHeader).getByText("AWAY").closest("div")?.parentElement as HTMLElement;
    const rightBlock = within(matchupHeader).getByText("HOME").closest("div")?.parentElement as HTMLElement;
    expect(leftBlock.className).toContain("items-end");
    expect(rightBlock.className).toContain("items-start");

    // Matchup logos are the "md" size (h-7 w-7); Offense header logos stay "sm" (h-5 w-5).
    const matchupLogo = within(matchupHeader).getByText("AWAY").parentElement?.querySelector("img, span.rounded-full") as HTMLElement;
    expect(matchupLogo.className).toContain("h-7");

    clickTab(desktopScope, "Offense");
    const offenseHeader = within(desktopScope).getByText("Points/Game").closest(".overflow-hidden")!
      .querySelector(".grid") as HTMLElement;
    const offenseLogo = within(offenseHeader).getByText("AWAY").parentElement?.querySelector("img, span.rounded-full") as HTMLElement;
    expect(offenseLogo.className).toContain("h-5");

    // Descriptor renders, but visually secondary (smaller, muted text) to the team name.
    clickTab(desktopScope, "Matchup");
    const descriptor = within(desktopScope).getByText("Away Defense");
    expect(descriptor.className).toContain("text-[9px]");
  });

  it("Matchup edge comes from national RANK, not raw value: away defense #12 beats home offense #40 even though the raw numbers point the other way", () => {
    // Card 1 (Away Defense vs Home Offense) keys off yardsPerPlayAllowed (away)
    // vs yardsPerPlay (home). Raw values are deliberately "confusing" —
    // away's allowed-YPP raw number is higher than home's gained-YPP raw
    // number, which would hand the edge to home under a raw-value comparison.
    // The away defense's rank (#12) is nonetheless far better than the home
    // offense's rank (#40), so away must win.
    const context: CfbMatchupSeasonStatsContext = {
      ...FULL_CONTEXT,
      away: stats("away", { yardsPerPlayAllowed: 6.0 }),
      home: stats("home", { yardsPerPlay: 3.0 }),
      awayRanks: { yardsPerPlayAllowed: 12 },
      homeRanks: { yardsPerPlay: 40 },
    };
    const { desktopScope } = renderAndGetScopes(context);
    clickTab(desktopScope, "Matchup");

    const card1Row = within(desktopScope).getAllByText("Yards/Play")[0].closest("div")?.parentElement as HTMLElement;
    expect(card1Row.textContent).toContain("6.0");
    expect(card1Row.textContent).toContain("#12");
    const marker = card1Row.querySelector('[data-testid="stronger-badge"]') as HTMLElement;
    expect(marker).not.toBeNull();
    const awaySwatch = document.createElement("div");
    awaySwatch.style.background = AWAY_COLOR;
    expect(marker.style.background).toBe(awaySwatch.style.background);
  });

  it("Matchup edge from rank: away offense #20 beats home defense #55", () => {
    // Card 2 (Away Offense vs Home Defense) keys off yardsPerPlay (away) vs
    // yardsPerPlayAllowed (home). Away's offense rank (#20) beats home's
    // defense rank (#55), so away wins regardless of raw magnitude.
    const context: CfbMatchupSeasonStatsContext = {
      ...FULL_CONTEXT,
      away: stats("away", { yardsPerPlay: 3.0 }),
      home: stats("home", { yardsPerPlayAllowed: 6.0 }),
      awayRanks: { yardsPerPlay: 20 },
      homeRanks: { yardsPerPlayAllowed: 55 },
    };
    const { desktopScope } = renderAndGetScopes(context);
    clickTab(desktopScope, "Matchup");

    const card2Row = within(desktopScope).getAllByText("Yards/Play")[1].closest("div")?.parentElement as HTMLElement;
    expect(card2Row.textContent).toContain("#20");
    const marker = card2Row.querySelector('[data-testid="stronger-badge"]') as HTMLElement;
    expect(marker).not.toBeNull();
    const awaySwatch = document.createElement("div");
    awaySwatch.style.background = AWAY_COLOR;
    expect(marker.style.background).toBe(awaySwatch.style.background);
  });

  it("equal rank yields no edge marker", () => {
    const context: CfbMatchupSeasonStatsContext = {
      ...FULL_CONTEXT,
      away: stats("away", { yardsPerPlayAllowed: 6.0 }),
      home: stats("home", { yardsPerPlay: 3.0 }),
      awayRanks: { yardsPerPlayAllowed: 30 },
      homeRanks: { yardsPerPlay: 30 },
    };
    const { desktopScope } = renderAndGetScopes(context);
    clickTab(desktopScope, "Matchup");

    const card1Row = within(desktopScope).getAllByText("Yards/Play")[0].closest("div")?.parentElement as HTMLElement;
    expect(card1Row.querySelector('[data-testid="stronger-badge"]')).toBeNull();
  });

  it("null rank handling is honest: both null shows no edge, and a single valid side wins by default", () => {
    // Both sides missing a rank for this metric -> no edge, no fabricated marker.
    const bothNullContext: CfbMatchupSeasonStatsContext = {
      ...FULL_CONTEXT,
      away: stats("away", { yardsPerPlayAllowed: 6.0 }),
      home: stats("home", { yardsPerPlay: 3.0 }),
      awayRanks: {},
      homeRanks: {},
    };
    const { desktopScope: bothNullScope } = renderAndGetScopes(bothNullContext);
    clickTab(bothNullScope, "Matchup");
    const bothNullRow = within(bothNullScope).getAllByText("Yards/Play")[0].closest("div")?.parentElement as HTMLElement;
    expect(bothNullRow.querySelector('[data-testid="stronger-badge"]')).toBeNull();

    // Only home has a usable rank -> home wins by default (nothing to compare away against).
    const oneNullContext: CfbMatchupSeasonStatsContext = {
      ...FULL_CONTEXT,
      away: stats("away", { yardsPerPlayAllowed: 6.0 }),
      home: stats("home", { yardsPerPlay: 3.0 }),
      awayRanks: {},
      homeRanks: { yardsPerPlay: 45 },
    };
    const { desktopScope: oneNullScope } = renderAndGetScopes(oneNullContext);
    clickTab(oneNullScope, "Matchup");
    const oneNullRow = within(oneNullScope).getAllByText("Yards/Play")[0].closest("div")?.parentElement as HTMLElement;
    const marker = oneNullRow.querySelector('[data-testid="stronger-badge"]') as HTMLElement;
    expect(marker).not.toBeNull();
    const homeSwatch = document.createElement("div");
    homeSwatch.style.background = HOME_COLOR;
    expect(marker.style.background).toBe(homeSwatch.style.background);
  });

  it("UNC/TCU matchup (real fixture): rank-derived winner, not the raw-value winner (regression for the reported discrepancy)", async () => {
    const {
      CFB_SEASON,
      CFB_STATS_PREVIOUS_SEASON_BY_TEAM,
      CFB_STATS_PREVIOUS_SEASON_RANKS_BY_TEAM,
      CFB_STATS_PREVIOUS_SEASON_YEAR,
      CFB_STATS_RANKS_BY_TEAM,
      getGameById,
      getTeamById,
    } = await import("@/data/cfb");
    const { selectMatchupSeasonStatsContext } = await import("@/lib/cfb/seasonStatsPresentation");

    const game = getGameById("401856766")!; // TCU @ North Carolina — real Week 1 fixture
    const awayTeam = getTeamById(game.awayTeamId)!;
    const homeTeam = getTeamById(game.homeTeamId)!;

    const context = selectMatchupSeasonStatsContext({
      currentSeason: CFB_SEASON,
      previousSeason: CFB_STATS_PREVIOUS_SEASON_YEAR,
      away: {
        current: awayTeam.stats,
        currentRanks: CFB_STATS_RANKS_BY_TEAM[awayTeam.id] ?? {},
        previous: CFB_STATS_PREVIOUS_SEASON_BY_TEAM[awayTeam.id],
        previousRanks: CFB_STATS_PREVIOUS_SEASON_RANKS_BY_TEAM[awayTeam.id],
      },
      home: {
        current: homeTeam.stats,
        currentRanks: CFB_STATS_RANKS_BY_TEAM[homeTeam.id] ?? {},
        previous: CFB_STATS_PREVIOUS_SEASON_BY_TEAM[homeTeam.id],
        previousRanks: CFB_STATS_PREVIOUS_SEASON_RANKS_BY_TEAM[homeTeam.id],
      },
    })!;

    // Real data: away (UNC) yardsPerPlayAllowed rank #25, raw 4.95.
    // Real data: home (TCU) yardsPerPlay rank #33, raw 6.14 (the higher raw number).
    // Raw-value comparison would (wrongly) hand this to home; rank #25 beats #33, so away must win.
    expect(context.awayRanks.yardsPerPlayAllowed).toBe(25);
    expect(context.homeRanks.yardsPerPlay).toBe(33);
    expect(context.away.yardsPerPlayAllowed).toBeLessThan(context.home.yardsPerPlay as number);

    const { container } = render(
      <CollegeFootballSeasonStatsComparison
        awayShortName={awayTeam.shortName}
        homeShortName={homeTeam.shortName}
        context={context}
        awayColor={awayTeam.primaryColor}
        homeColor={homeTeam.primaryColor}
      />,
    );
    const desktopScope = container.querySelector(".hidden.lg\\:block") as HTMLElement;
    clickTab(desktopScope, "Matchup");

    const card1Row = within(desktopScope).getAllByText("Yards/Play")[0].closest("div")?.parentElement as HTMLElement;
    const marker = card1Row.querySelector('[data-testid="stronger-badge"]') as HTMLElement;
    expect(marker).not.toBeNull();
    const awaySwatch = document.createElement("div");
    awaySwatch.style.background = awayTeam.primaryColor;
    // Away (UNC defense, rank #25) beats home (TCU offense, rank #33) -> away wins.
    expect(marker.style.background).toBe(awaySwatch.style.background);
  });

  it("desktop: Offense and Defense each render exactly one full-width card, Matchup renders two cards side by side", () => {
    const { desktopScope } = renderAndGetScopes(FULL_CONTEXT);
    const CARD_SELECTOR = ":scope > .grid > .overflow-hidden.rounded-md.border.border-slate-300.bg-white.shadow-sm";

    // Offense (default tab): exactly one card, and the grid must not reserve
    // a second (empty) lg:grid-cols-2 track when only one card is active.
    let grid = desktopScope.querySelector(":scope > .grid") as HTMLElement;
    expect(grid.className).toContain("lg:grid-cols-1");
    expect(grid.className).not.toContain("lg:grid-cols-2");
    expect(desktopScope.querySelectorAll(CARD_SELECTOR).length).toBe(1);

    // Defense: still exactly one full-width card.
    clickTab(desktopScope, "Defense");
    grid = desktopScope.querySelector(":scope > .grid") as HTMLElement;
    expect(grid.className).toContain("lg:grid-cols-1");
    expect(desktopScope.querySelectorAll(CARD_SELECTOR).length).toBe(1);

    // Matchup: exactly two cards, laid out side by side via lg:grid-cols-2.
    clickTab(desktopScope, "Matchup");
    grid = desktopScope.querySelector(":scope > .grid") as HTMLElement;
    expect(grid.className).toContain("lg:grid-cols-2");
    expect(desktopScope.querySelectorAll(CARD_SELECTOR).length).toBe(2);
  });

  it("never renders NaN or undefined", () => {
    const { container, desktopScope } = renderAndGetScopes(FULL_CONTEXT);
    clickTab(desktopScope, "Matchup");
    expect(container.textContent ?? "").not.toMatch(/\bNaN\b/);
    expect(container.textContent ?? "").not.toMatch(/\bundefined\b/);
  });
});
