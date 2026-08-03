// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import MlbStrikeoutPropRowDetail from "@/components/mlb/MlbStrikeoutPropRowDetail";
import type { StrikeoutPropDetail } from "@/hooks/useMlbStrikeoutPropDetails";
import type { KPropsV2ShadowArtifact, KPropsV2ShadowRow } from "@/hooks/useMlbKPropsV2Shadow";
import type { PitcherStrikeoutTeamRow } from "@/pages/MlbHrProps";

const detail: StrikeoutPropDetail = {
  key: "shane-bieber|tor|tb|2026-07-23",
  pitcher: "Shane Bieber",
  team: "TOR",
  opponent: "TB",
  gameDate: "2026-07-23",
  pitcherLastFiveStarts: [
    { date: "2026-07-18", opponent: "CWS", inningsPitched: "6.0", strikeouts: 6 },
    { date: "2026-07-10", opponent: "SD", inningsPitched: "4.2", strikeouts: 4 },
  ],
  opponentLastFiveGames: [
    { date: "2026-07-22", opponent: "TOR", opposingStartingPitcher: "Braydon Fisher", opposingStarterInningsPitched: "1.1", opposingStarterStrikeouts: 1, teamTotalStrikeouts: 9 },
  ],
  generatedAt: "2026-07-23T13:00:00.000Z",
  source: "test",
};

const shadowRow: KPropsV2ShadowRow = {
  key: detail.key,
  slateDate: "2026-07-23",
  game: { gameId: 822785, gameKey: "TB@TOR", gameDate: "2026-07-23T19:07:00Z", venue: "Rogers Centre", pitcherIsHome: true },
  pitcher: { id: 669456, name: "Shane Bieber", team: "TOR", opponent: "TB", handedness: "R" },
  market: { kLine: 4.5, oddsOver: "+121", oddsUnder: "-155", book: "draftkings", slateDate: "2026-07-23" },
  legacy: { projectedIP: 4.7, projectedK9: 7.2, projectedKs: 3.8, projectionSource: "legacy", projectionFallbackReason: "MODE_SHADOW_COMPARISON" },
  v2: {
    modelVersion: "mlb-k-projection-v2-shadow",
    projectedStrikeouts: 4,
    projectedKRate: 0.1768,
    projectedBattersFaced: 22.626,
    projectedInnings: 5.085,
    pitcherSkillRate: 0.1868,
    opponentEnvironmentRate: 0.1887,
    matchupAdjustment: -0.01,
    confidence: "high",
    components: [
      { key: "pitcher.seasonSkillRate", label: "Pitcher season K skill", group: "pitcher", value: 0.177, weight: 0.44, normalizedWeight: 0.49, contribution: 0.087, source: "derived" },
      { key: "opponent.seasonKRate", label: "Opponent season K%", group: "opponent", value: 0.189, weight: 0.32, normalizedWeight: 0.5, contribution: 0.095, source: "provided" },
    ],
    fallbacks: ["projectedBattersFaced derived from projected innings"],
    warnings: ["recent whiff unavailable"],
  },
  comparison: { v2MinusLegacyKs: 0.2, legacyEdgeToLine: -0.7, v2EdgeToLine: -0.5 },
  inputs: {
    v2Input: {
      pitcher: { seasonKRate: 17.6, seasonWhiffRate: 26.3, homeKRate: null, awayKRate: null, homeWhiffRate: null, awayWhiffRate: null },
      opponent: { seasonKRate: 0.189, seasonWhiffRate: null, homeKRate: null, awayKRate: null, homeWhiffRate: null, awayWhiffRate: null, vsLhpKRate: null, vsRhpKRate: null },
    },
    details: {
      pitcherLastFiveSummary: {
        gamesUsed: 2,
        totalOuts: 32,
        averageStrikeouts: 5,
        recentK9: 8.4375,
        recentKRate: null,
        averageBattersFaced: null,
        averagePitchCount: null,
        rows: [
          { index: 0, date: "2026-07-18", opponent: "CWS", outs: 18, innings: 6, strikeouts: 6, battersFaced: null, pitchCount: null, valid: true },
          { index: 1, date: "2026-07-10", opponent: "SD", outs: 14, innings: 4.6667, strikeouts: 4, battersFaced: null, pitchCount: null, valid: true },
        ],
      },
      opponentLastFiveVsStartersSummary: {
        gamesUsed: 1,
        averageOpposingStarterInnings: 1.3333,
        averageOpposingStarterStrikeouts: 1,
        averageTeamStrikeouts: 9,
        recentTeamKRate: null,
        recentWhiffRate: null,
        rows: [
          { index: 0, date: "2026-07-22", opponent: "TOR", opposingStartingPitcher: "Braydon Fisher", opposingStarterOuts: 4, opposingStarterInnings: 1.3333, opposingStarterStrikeouts: 1, teamStrikeouts: 9, plateAppearances: null, whiffRate: null, valid: true },
        ],
      },
    },
  },
};

const artifact: KPropsV2ShadowArtifact = {
  schemaVersion: 1,
  slateDate: "2026-07-23",
  generatedAt: "2026-07-23T13:17:06.284Z",
  sourceDates: { "hr-props-raw.json": "2026-07-23", "mlb-odds.json": "NO_TRUSTWORTHY_DATE" },
  modelVersion: "mlb-k-projection-v2-shadow",
  projectionMode: "shadow",
  rows: [shadowRow],
  diagnostics: { totalRows: 1, v2ComputedRows: 1, legacyOnlyRows: 0, warnings: ["mlb-odds.json has no trustworthy date field."] },
};

describe("MlbStrikeoutPropRowDetail", () => {
  it("renders compact detail sections as independent, accessible, closed-by-default accordions", () => {
    render(<MlbStrikeoutPropRowDetail detail={detail} compactLayout />);

    const sections = [
      "Recent Performance",
      "Home / Away Splits",
      "Opponent Last 10 Games vs SP",
      "Opponent Data Sources",
    ];
    for (const section of sections) {
      const trigger = screen.getByRole("button", { name: section });
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(trigger).toHaveAttribute("aria-controls");
      expect(document.getElementById(trigger.getAttribute("aria-controls") as string)).toBeNull();
    }
    expect(screen.getByRole("button", { name: "Recent Performance" }).className).toContain("border-sky-200");
    expect(screen.getByRole("button", { name: "Home / Away Splits" }).className).toContain("border-amber-200");
    expect(screen.getByRole("button", { name: "Opponent Last 10 Games vs SP" }).className).toContain("border-violet-200");
    expect(screen.getByRole("button", { name: "Opponent Data Sources" }).className).toContain("border-slate-200");
    expect(screen.queryByText("Shane Bieber — Last 5 Starts")).not.toBeInTheDocument();
    expect(screen.queryByText("TB — Last 10 Games vs SP")).not.toBeInTheDocument();

    const recentTrigger = screen.getByRole("button", { name: "Recent Performance" });
    fireEvent.click(recentTrigger);
    expect(recentTrigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Shane Bieber — Last 5 Starts")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Home / Away Splits" })).toHaveAttribute("aria-expanded", "false");

    const opponentTrigger = screen.getByRole("button", { name: "Opponent Last 10 Games vs SP" });
    fireEvent.click(opponentTrigger);
    expect(opponentTrigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("TB — Last 10 Games vs SP")).toBeInTheDocument();
    expect(recentTrigger).toHaveAttribute("aria-expanded", "true");

    const splitsTrigger = screen.getByRole("button", { name: "Home / Away Splits" });
    fireEvent.click(splitsTrigger);
    expect(splitsTrigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("No venue splits available.")).toBeInTheDocument();

    const sourcesTrigger = screen.getByRole("button", { name: "Opponent Data Sources" });
    fireEvent.click(sourcesTrigger);
    expect(sourcesTrigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("No opponent source diagnostics available.")).toBeInTheDocument();
    expect(recentTrigger).toHaveAttribute("aria-expanded", "true");
  });

  it("uses canonical recent summaries for AVG rows and baseball innings display", () => {
    render(<MlbStrikeoutPropRowDetail detail={detail} shadowRow={shadowRow} shadowArtifact={artifact} showV2Shadow publicSlateDate="2026-07-23" />);
    const detailPanel = screen.getByTestId("strikeout-prop-detail");
    expect(within(detailPanel).getAllByText("AVG").length).toBeGreaterThan(0);
    expect(within(detailPanel).getAllByText("5.1").length).toBeGreaterThan(0);
    expect(within(detailPanel).getAllByText("N/A").length).toBeGreaterThan(0);
    expect(detailPanel.textContent).not.toMatch(/NaN|Infinity/);
  });

  it("renders the projection comparison with the resolved production block and avoids accuracy claims", () => {
    render(<MlbStrikeoutPropRowDetail detail={detail} shadowRow={shadowRow} shadowArtifact={artifact} showV2Shadow publicSlateDate="2026-07-23" />);
    const panels = screen.getByTestId("strikeout-v2-debug-panels");
    expect(within(panels).getByText("Projection Comparison")).toBeInTheDocument();
    expect(within(panels).getByTestId("k-v2-resolved-production")).toBeInTheDocument();
    expect(panels.textContent).toMatch(/Public resolved/);
    expect(panels.textContent).toMatch(/Fallback reason/);
    expect(panels.textContent).not.toMatch(/more accurate|recommended/i);
  });

  it("renders model components, fallbacks, warnings, split availability, and source metadata", () => {
    render(<MlbStrikeoutPropRowDetail detail={detail} shadowRow={shadowRow} shadowArtifact={artifact} showV2Shadow publicSlateDate="2026-07-23" />);
    expect(screen.getByText("Pitcher season K skill")).toBeInTheDocument();
    expect(screen.getByText("Opponent season K%")).toBeInTheDocument();
    expect(screen.getByText("projectedBattersFaced derived from projected innings")).toBeInTheDocument();
    expect(screen.getByText("recent whiff unavailable")).toBeInTheDocument();
    expect(screen.getByText("Split Availability")).toBeInTheDocument();
    expect(screen.getByText("Source Integrity")).toBeInTheDocument();
    expect(screen.getByText("mlb-odds.json has no trustworthy date field.")).toBeInTheDocument();
    expect(screen.queryByText("oddsOver")).not.toBeInTheDocument();
  });

  it("does not render V2 debug panels outside shadow mode", () => {
    render(<MlbStrikeoutPropRowDetail detail={detail} />);
    expect(screen.queryByTestId("strikeout-v2-debug-panels")).not.toBeInTheDocument();
    expect(screen.queryByTestId("k-v2-resolved-production")).not.toBeInTheDocument();
  });
});

describe("opponent AVG footer", () => {
  const fiveGameDetail: StrikeoutPropDetail = {
    ...detail,
    opponentLastFiveGames: [
      { date: "2026-07-22", opponent: "TOR", opposingStartingPitcher: "Braydon Fisher", opposingStarterInningsPitched: "1.1", opposingStarterStrikeouts: 1, teamTotalStrikeouts: 9 },
      { date: "2026-07-21", opponent: "TOR", opposingStartingPitcher: "Kevin Gausman", opposingStarterInningsPitched: "3.1", opposingStarterStrikeouts: 1, teamTotalStrikeouts: 7 },
      { date: "2026-07-20", opponent: "TOR", opposingStartingPitcher: "Dylan Cease", opposingStarterInningsPitched: "6.0", opposingStarterStrikeouts: 7, teamTotalStrikeouts: 9 },
      { date: "2026-07-19", opponent: "BOS", opposingStartingPitcher: "Sonny Gray", opposingStarterInningsPitched: "6.0", opposingStarterStrikeouts: 5, teamTotalStrikeouts: 8 },
      { date: "2026-07-18", opponent: "BOS", opposingStartingPitcher: "Patrick Sandoval", opposingStarterInningsPitched: "5.0", opposingStarterStrikeouts: 5, teamTotalStrikeouts: 7 },
    ],
    // 65 total outs / 5 games = 13 outs avg = "4.1"; SP K avg (1+1+7+5+5)/5 = 3.8; Game K avg (9+7+9+8+7)/5 = 8.0
    opponentLastFiveVsStartersSummary: {
      gamesAvailable: 5,
      gamesUsed: 5,
      totalOpposingStarterOuts: 65,
      averageOpposingStarterInnings: 4.333333333333334,
      averageOpposingStarterStrikeouts: 3.8,
      averageTeamStrikeouts: 8,
      recentTeamKRate: null,
      recentWhiffRate: null,
    },
  };

  it("renders the canonical detail-level summary (not the V2-debug-only path) with no shadowRow present", () => {
    render(<MlbStrikeoutPropRowDetail detail={fiveGameDetail} />);
    const detailPanel = screen.getByTestId("strikeout-prop-detail");
    expect(within(detailPanel).getAllByText("5 used").length).toBeGreaterThan(0);
    expect(within(detailPanel).getAllByText("4.1").length).toBeGreaterThan(0);
    expect(within(detailPanel).getAllByText("3.8").length).toBeGreaterThan(0);
    expect(within(detailPanel).getAllByText("8.0").length).toBeGreaterThan(0);
    expect(detailPanel.textContent).not.toMatch(/NaN|Infinity/);
  });

  it("falls back to the row-derived summary when the canonical field is entirely absent (older artifacts)", () => {
    const olderDetail: StrikeoutPropDetail = { ...detail, opponentLastFiveVsStartersSummary: undefined };
    render(<MlbStrikeoutPropRowDetail detail={olderDetail} />);
    const detailPanel = screen.getByTestId("strikeout-prop-detail");
    // No summary at all (no canonical field, no shadowRow) -- gamesUsed cell must show plain N/A, never "N/A used".
    expect(within(detailPanel).queryAllByText("N/A used")).toHaveLength(0);
    expect(within(detailPanel).getAllByText("N/A").length).toBeGreaterThan(0);
  });

  it("does not invalidate SP IP/K averages when Game K is missing on one row, or vice versa", () => {
    const partialDetail: StrikeoutPropDetail = {
      ...detail,
      opponentLastFiveGames: [
        { date: "2026-07-22", opponent: "TOR", opposingStartingPitcher: "A", opposingStarterInningsPitched: "6.0", opposingStarterStrikeouts: 6, teamTotalStrikeouts: null },
        { date: "2026-07-21", opponent: "TOR", opposingStartingPitcher: "B", opposingStarterInningsPitched: "5.0", opposingStarterStrikeouts: 5, teamTotalStrikeouts: 8 },
      ],
      opponentLastFiveVsStartersSummary: {
        gamesAvailable: 2,
        gamesUsed: 2,
        totalOpposingStarterOuts: 33,
        averageOpposingStarterInnings: 5.5,
        averageOpposingStarterStrikeouts: 5.5,
        averageTeamStrikeouts: 8,
        recentTeamKRate: null,
        recentWhiffRate: null,
      },
    };
    render(<MlbStrikeoutPropRowDetail detail={partialDetail} />);
    const detailPanel = screen.getByTestId("strikeout-prop-detail");
    expect(within(detailPanel).getAllByText("2 used").length).toBeGreaterThan(0);
    expect(within(detailPanel).getAllByText("5.5").length).toBeGreaterThan(0);
    expect(within(detailPanel).getAllByText("8.0").length).toBeGreaterThan(0);
    expect(detailPanel.textContent).not.toMatch(/NaN|Infinity/);
  });

  it("prefers the canonical detail-level summary over an older shadow-debug-only copy when both are present", () => {
    render(<MlbStrikeoutPropRowDetail detail={fiveGameDetail} shadowRow={shadowRow} shadowArtifact={artifact} showV2Shadow publicSlateDate="2026-07-23" />);
    const detailPanel = screen.getByTestId("strikeout-prop-detail");
    // shadowRow's inputs.details.opponentLastFiveVsStartersSummary says gamesUsed: 1 -- the canonical detail-level
    // summary (gamesUsed: 5) must win.
    expect(within(detailPanel).getAllByText("5 used").length).toBeGreaterThan(0);
    expect(within(detailPanel).queryAllByText("1 used")).toHaveLength(0);
  });

  it("leaves the Opposing SP AVG cell blank instead of showing N/A", () => {
    render(<MlbStrikeoutPropRowDetail detail={fiveGameDetail} />);
    const avgCards = screen.getAllByTestId("strikeout-recent-avg-row");
    const opponentAvgCard = avgCards[avgCards.length - 1];
    const opposingSpLabel = within(opponentAvgCard).getByText("Opposing SP");
    const opposingSpValue = opposingSpLabel.nextElementSibling;
    expect(opposingSpValue).not.toBeNull();
    expect(opposingSpValue?.textContent).toBe("");
    expect(within(opponentAvgCard).queryByText("N/A")).not.toBeInTheDocument();
  });
});

describe("opponent Last 10 games", () => {
  const tenGames = Array.from({ length: 10 }, (_, i) => ({
    date: `2026-07-${String(22 - i).padStart(2, "0")}`,
    opponent: i % 2 === 0 ? "TOR" : "BOS",
    opposingStartingPitcher: `Pitcher ${i}`,
    opposingStarterInningsPitched: "6.0",
    opposingStarterStrikeouts: 5,
    teamTotalStrikeouts: 8,
  }));
  const tenGameDetail: StrikeoutPropDetail = {
    ...detail,
    opponentLastFiveGames: tenGames,
    opponentLastFiveVsStartersSummary: {
      gamesAvailable: 10,
      gamesUsed: 10,
      totalOpposingStarterOuts: 180,
      averageOpposingStarterInnings: 6,
      averageOpposingStarterStrikeouts: 5,
      averageTeamStrikeouts: 8,
      recentTeamKRate: null,
      recentWhiffRate: null,
    },
  };

  it('renders the "Last 10 Games vs SP" heading', () => {
    render(<MlbStrikeoutPropRowDetail detail={tenGameDetail} />);
    expect(screen.getAllByText("TB — Last 10 Games vs SP").length).toBeGreaterThan(0);
  });

  it("shows the correct games-used count and averages for a full 10-game sample", () => {
    render(<MlbStrikeoutPropRowDetail detail={tenGameDetail} />);
    const detailPanel = screen.getByTestId("strikeout-prop-detail");
    expect(within(detailPanel).getAllByText("10 used").length).toBeGreaterThan(0);
    expect(within(detailPanel).getAllByText("6.0").length).toBeGreaterThan(0); // 180 outs / 10 games = 18 outs = 6.0 IP
    expect(within(detailPanel).getAllByText("5.0").length).toBeGreaterThan(0); // avg SP K
    expect(within(detailPanel).getAllByText("8.0").length).toBeGreaterThan(0); // avg Game K
  });

  it("shows the actual sample count when fewer than 10 games exist", () => {
    const fewerGamesDetail: StrikeoutPropDetail = {
      ...detail,
      opponentLastFiveGames: tenGames.slice(0, 3),
      opponentLastFiveVsStartersSummary: {
        gamesAvailable: 3,
        gamesUsed: 3,
        totalOpposingStarterOuts: 54,
        averageOpposingStarterInnings: 6,
        averageOpposingStarterStrikeouts: 5,
        averageTeamStrikeouts: 8,
        recentTeamKRate: null,
        recentWhiffRate: null,
      },
    };
    render(<MlbStrikeoutPropRowDetail detail={fewerGamesDetail} />);
    const detailPanel = screen.getByTestId("strikeout-prop-detail");
    expect(within(detailPanel).getAllByText("3 used").length).toBeGreaterThan(0);
    expect(within(detailPanel).queryAllByText("10 used")).toHaveLength(0);
  });
});

describe("pitcher Home/Away split K/Inning and H/9", () => {
  const venueDetail: StrikeoutPropDetail = {
    ...detail,
    pitcherVenueSplits: {
      home: {
        site: "home",
        season: { gamesUsed: 6, totalOuts: 108, inningsPitched: "36.0", strikeouts: 36, hitsAllowed: 24, battersFaced: 150, strikeoutRate: 24, hitRate: 16 },
        lastFiveAtSite: { gamesUsed: 5, totalOuts: 90, inningsPitched: "30.0", strikeouts: 32, hitsAllowed: 20, battersFaced: 125, strikeoutRate: 25.6, hitRate: 16 },
      },
      away: {
        site: "away",
        season: { gamesUsed: 4, totalOuts: 72, inningsPitched: "24.0", strikeouts: 16, hitsAllowed: 24, battersFaced: 105, strikeoutRate: 15.2, hitRate: 22.9 },
        lastFiveAtSite: { gamesUsed: 3, totalOuts: 45, inningsPitched: "15.0", strikeouts: 8, hitsAllowed: 15, battersFaced: 65, strikeoutRate: 12.3, hitRate: 23.1 },
      },
    },
  };

  it("renders both sites and the exact grouped metric contract", () => {
    render(<MlbStrikeoutPropRowDetail detail={venueDetail} />);
    const splitTable = screen.getByText("Shane Bieber — Home/Away Splits").parentElement as HTMLElement;
    expect(within(splitTable).getAllByText("Season").length).toBeGreaterThan(0);
    expect(within(splitTable).getAllByText("Last 5 at Site").length).toBeGreaterThan(0);
    expect(within(splitTable).getAllByText("Home").length).toBeGreaterThan(0);
    expect(within(splitTable).getAllByText("Away").length).toBeGreaterThan(0);
    expect(within(splitTable).getAllByText("K/Inning").length).toBeGreaterThanOrEqual(2);
    expect(within(splitTable).getAllByText("K/Inning +/-").length).toBeGreaterThanOrEqual(2);
    expect(within(splitTable).queryByText("K/9")).not.toBeInTheDocument();
    expect(within(splitTable).getAllByText("H/9").length).toBeGreaterThanOrEqual(2);
    expect(within(splitTable).getAllByText("Hit Avg +/-").length).toBeGreaterThanOrEqual(2);
  });

  it("uses combined season totals for K/Inning and H/9 baselines and all four deltas", () => {
    render(<MlbStrikeoutPropRowDetail detail={venueDetail} />);
    const detailPanel = screen.getByTestId("strikeout-prop-detail");
    expect(within(detailPanel).getAllByText("+0.13").length).toBeGreaterThan(0);
    expect(within(detailPanel).getAllByText("-0.20").length).toBeGreaterThan(0);
    expect(within(detailPanel).getAllByText("+0.20").length).toBeGreaterThan(0);
    expect(within(detailPanel).getAllByText("-0.33").length).toBeGreaterThan(0);
    expect(within(detailPanel).getAllByText("-17%").length).toBeGreaterThan(0);
    expect(within(detailPanel).getAllByText("+25%").length).toBeGreaterThan(0);
  });

  it("uses green/red K/Inning direction and the intentionally reversed Hit Avg direction", () => {
    render(<MlbStrikeoutPropRowDetail detail={venueDetail} />);
    const kDiffs = screen.getAllByTestId("k-inning-difference");
    expect(kDiffs.some((cell) => cell.textContent === "+0.13" && cell.className.includes("text-emerald"))).toBe(true);
    expect(kDiffs.some((cell) => cell.textContent === "-0.20" && cell.className.includes("text-red"))).toBe(true);
    const hitDiffs = screen.getAllByTestId("hit-difference");
    expect(hitDiffs.some((cell) => cell.textContent === "-17%" && cell.className.includes("text-emerald"))).toBe(true);
    expect(hitDiffs.some((cell) => cell.textContent === "+25%" && cell.className.includes("text-red"))).toBe(true);
  });

  it("marks only the short site's Last 5 sample and renders the footnote", () => {
    render(<MlbStrikeoutPropRowDetail detail={venueDetail} />);
    const splitTable = screen.getByText("Shane Bieber — Home/Away Splits").parentElement as HTMLElement;
    const shortSampleMarkers = within(splitTable).getAllByText("*", { selector: "sup" });
    expect(shortSampleMarkers.length).toBeGreaterThan(0);
    expect(shortSampleMarkers.every((marker) => marker.parentElement?.textContent === "15.0 (3 starts)*")).toBe(true);
    expect(screen.getByText("* fewer than 5 starts available")).toBeInTheDocument();
  });

  it("does not render the short-sample footnote when both sites have five starts", () => {
    const fullSampleDetail: StrikeoutPropDetail = {
      ...venueDetail,
      pitcherVenueSplits: {
        ...venueDetail.pitcherVenueSplits!,
        away: {
          ...venueDetail.pitcherVenueSplits!.away,
          lastFiveAtSite: { ...venueDetail.pitcherVenueSplits!.away.lastFiveAtSite, gamesUsed: 5 },
        },
      },
    };
    render(<MlbStrikeoutPropRowDetail detail={fullSampleDetail} />);
    expect(screen.queryByText("* fewer than 5 starts available")).not.toBeInTheDocument();
  });

  it("highlights HOME as today's site and keeps the short-sample marker independent", () => {
    const todayRow = { gameKey: "TB@TOR", team: "TOR" } as PitcherStrikeoutTeamRow;
    render(<MlbStrikeoutPropRowDetail detail={venueDetail} row={todayRow} />);
    const splitPanel = screen.getByText("Shane Bieber — Home/Away Splits").parentElement as HTMLElement;
    const desktopRows = splitPanel.querySelectorAll("table tbody tr");
    expect(desktopRows[0].className).toMatch(/bg-amber-50/);
    expect(desktopRows[0].className).toMatch(/border-amber-300/);
    expect(desktopRows[0].className).toMatch(/font-bold/);
    expect(within(desktopRows[0] as HTMLElement).getByText("Today")).toBeInTheDocument();
    expect(within(desktopRows[1] as HTMLElement).queryByText("Today")).not.toBeInTheDocument();
    expect(desktopRows[1].className).not.toMatch(/bg-amber-50|font-bold/);
    expect(within(desktopRows[1] as HTMLElement).getByText("*", { selector: "sup" })).toBeInTheDocument();
  });

  it("highlights AWAY as today's site and marks only that split row", () => {
    const todayRow = { gameKey: "TB@TOR", team: "TB" } as PitcherStrikeoutTeamRow;
    render(<MlbStrikeoutPropRowDetail detail={venueDetail} row={todayRow} />);
    const splitPanel = screen.getByText("Shane Bieber — Home/Away Splits").parentElement as HTMLElement;
    const desktopTable = splitPanel.querySelector("table") as HTMLElement;
    const desktopRows = desktopTable.querySelectorAll("tbody tr");
    expect(desktopRows[1].className).toMatch(/bg-amber-50/);
    expect(desktopRows[1].className).toMatch(/border-amber-300/);
    expect(desktopRows[1].className).toMatch(/font-bold/);
    expect(within(desktopRows[1] as HTMLElement).getByText("Today")).toBeInTheDocument();
    expect(within(desktopRows[0] as HTMLElement).queryByText("Today")).not.toBeInTheDocument();
    expect(desktopRows[0].className).not.toMatch(/bg-amber-50|font-bold/);
    expect(within(desktopTable).getAllByText("Today")).toHaveLength(1);
  });

  it("centers the Season and Last 5 groups over aligned numeric columns", () => {
    render(<MlbStrikeoutPropRowDetail detail={venueDetail} />);
    const splitPanel = screen.getByText("Shane Bieber — Home/Away Splits").parentElement as HTMLElement;
    const seasonHeader = within(splitPanel).getByText("Season");
    const lastFiveHeader = within(splitPanel).getByText("Last 5 at Site");
    expect(seasonHeader.className).toContain("text-center");
    expect(lastFiveHeader.className).toContain("text-center");
    expect(splitPanel.querySelectorAll('col[style="width: 13%;"]')).toHaveLength(2);
    expect(splitPanel.querySelectorAll('col[style="width: 8%;"]')).toHaveLength(5);
  });
});

it("surfaces opponent source samples and warnings only inside expanded detail", () => {
  const warningDetail: StrikeoutPropDetail = {
    ...detail,
    opponentContext: {
      home: { kPerNine: 8.2, xba: null },
      away: { kPerNine: 7.8, xba: null },
      last10: { kPerNine: 8, xba: null },
      samples: { season: 100, last10: 10 },
      sources: { strikeouts: "mlb_stats_api", xba: "baseball_savant_statcast" },
      warnings: ["OPPONENT_XBA_CONTEXT_FAILED:timeout"],
    },
  };
  render(<MlbStrikeoutPropRowDetail detail={warningDetail} />);
  const sourceDetails = screen.getByTestId("opponent-context-source-details");
  expect(within(sourceDetails).getByText("Opponent data sources")).toBeInTheDocument();
  expect(sourceDetails.textContent).toContain("mlb_stats_api");
  expect(sourceDetails.textContent).toContain("last10: 10");
  expect(sourceDetails.textContent).toContain("OPPONENT_XBA_CONTEXT_FAILED:timeout");
});

it("preserves mobile collapsible recent-game behavior", () => {
  render(<MlbStrikeoutPropRowDetail detail={detail} />);
  const buttons = screen.getAllByRole("button");
  expect(buttons.length).toBeGreaterThan(0);
  expect(buttons[0]).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(buttons[0]);
  expect(buttons[0]).toHaveAttribute("aria-expanded", "true");
});
