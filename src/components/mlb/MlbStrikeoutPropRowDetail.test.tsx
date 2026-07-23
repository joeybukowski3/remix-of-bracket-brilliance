// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import MlbStrikeoutPropRowDetail from "@/components/mlb/MlbStrikeoutPropRowDetail";
import type { StrikeoutPropDetail } from "@/hooks/useMlbStrikeoutPropDetails";
import type { KPropsV2ShadowArtifact, KPropsV2ShadowRow } from "@/hooks/useMlbKPropsV2Shadow";

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
  it("uses canonical recent summaries for AVG rows and baseball innings display", () => {
    render(<MlbStrikeoutPropRowDetail detail={detail} shadowRow={shadowRow} shadowArtifact={artifact} showV2Shadow publicSlateDate="2026-07-23" />);
    const detailPanel = screen.getByTestId("strikeout-prop-detail");
    expect(within(detailPanel).getAllByText("AVG").length).toBeGreaterThan(0);
    expect(within(detailPanel).getAllByText("5.1").length).toBeGreaterThan(0);
    expect(within(detailPanel).getAllByText("N/A").length).toBeGreaterThan(0);
    expect(detailPanel.textContent).not.toMatch(/NaN|Infinity/);
  });

  it("renders internal projection comparison, labels V2 as shadow experimental, and avoids accuracy claims", () => {
    render(<MlbStrikeoutPropRowDetail detail={detail} shadowRow={shadowRow} shadowArtifact={artifact} showV2Shadow publicSlateDate="2026-07-23" />);
    const panels = screen.getByTestId("strikeout-v2-debug-panels");
    expect(within(panels).getByText("Projection Comparison")).toBeInTheDocument();
    expect(within(panels).getAllByText(/V2 Shadow/i).length).toBeGreaterThan(0);
    expect(within(panels).getAllByText(/Experimental/i).length).toBeGreaterThan(0);
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
    expect(screen.queryByText(/V2 Shadow/i)).not.toBeInTheDocument();
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

describe("pitcher Home/Away split K%/Hit%", () => {
  const venueDetail: StrikeoutPropDetail = {
    ...detail,
    pitcherVenueSplits: {
      home: {
        site: "home",
        season: { gamesUsed: 6, totalOuts: 104, inningsPitched: "34.2", strikeouts: 38, hitsAllowed: 29, battersFaced: 144, strikeoutRate: (38 / 144) * 100, hitRate: (29 / 144) * 100 },
        lastFiveAtSite: { gamesUsed: 5, totalOuts: 90, inningsPitched: "30.0", strikeouts: 35, hitsAllowed: 22, battersFaced: 120, strikeoutRate: (35 / 120) * 100, hitRate: (22 / 120) * 100 },
      },
      away: {
        site: "away",
        season: { gamesUsed: 2, totalOuts: 26, inningsPitched: "8.2", strikeouts: 7, hitsAllowed: 12, battersFaced: 43, strikeoutRate: (7 / 43) * 100, hitRate: (12 / 43) * 100 },
        lastFiveAtSite: { gamesUsed: 2, totalOuts: 26, inningsPitched: "8.2", strikeouts: 7, hitsAllowed: 12, battersFaced: 43, strikeoutRate: (7 / 43) * 100, hitRate: (12 / 43) * 100 },
      },
    },
  };

  it("renders season Home/Away K% and Hit%", () => {
    render(<MlbStrikeoutPropRowDetail detail={venueDetail} />);
    const detailPanel = screen.getByTestId("strikeout-prop-detail");
    expect(within(detailPanel).getAllByText("26.4%").length).toBeGreaterThan(0); // home season K%: 38/144
    expect(within(detailPanel).getAllByText("20.1%").length).toBeGreaterThan(0); // home season Hit%: 29/144
    // Away has only 2 starts total, so season and last-5-at-site are identical samples (appears in both desktop + mobile, twice over).
    expect(within(detailPanel).getAllByText("16.3%").length).toBeGreaterThan(0); // away season + last-5 K%: 7/43
    expect(within(detailPanel).getAllByText("27.9%").length).toBeGreaterThan(0); // away season + last-5 Hit%: 12/43
  });

  it("renders last-five-at-site K% and Hit%", () => {
    render(<MlbStrikeoutPropRowDetail detail={venueDetail} />);
    const detailPanel = screen.getByTestId("strikeout-prop-detail");
    expect(within(detailPanel).getAllByText("29.2%").length).toBeGreaterThan(0); // home last-5 K%: 35/120
    expect(within(detailPanel).getAllByText("18.3%").length).toBeGreaterThan(0); // home last-5 Hit%: 22/120
  });

  it("keeps fewer-than-five-starts samples visible (away has only 2 starts)", () => {
    render(<MlbStrikeoutPropRowDetail detail={venueDetail} />);
    const detailPanel = screen.getByTestId("strikeout-prop-detail");
    expect(within(detailPanel).getAllByText("16.3%").length).toBeGreaterThan(0);
  });

  it("shows N/A for K%/Hit% when batters faced is zero", () => {
    const zeroBfDetail: StrikeoutPropDetail = {
      ...detail,
      pitcherVenueSplits: {
        home: { site: "home", season: { gamesUsed: 1, totalOuts: 18, inningsPitched: "6.0", strikeouts: 6, hitsAllowed: 3, battersFaced: 0, strikeoutRate: null, hitRate: null }, lastFiveAtSite: { gamesUsed: 1, totalOuts: 18, inningsPitched: "6.0", strikeouts: 6, hitsAllowed: 3, battersFaced: 0, strikeoutRate: null, hitRate: null } },
        away: { site: "away", season: { gamesUsed: 0, totalOuts: null, inningsPitched: null, strikeouts: null, hitsAllowed: null, battersFaced: null, strikeoutRate: null, hitRate: null }, lastFiveAtSite: { gamesUsed: 0, totalOuts: null, inningsPitched: null, strikeouts: null, hitsAllowed: null, battersFaced: null, strikeoutRate: null, hitRate: null } },
      },
    };
    render(<MlbStrikeoutPropRowDetail detail={zeroBfDetail} />);
    const detailPanel = screen.getByTestId("strikeout-prop-detail");
    expect(within(detailPanel).getAllByText("N/A").length).toBeGreaterThan(0);
    expect(detailPanel.textContent).not.toMatch(/NaN|Infinity/);
  });

  it("shows N/A for K%/Hit% when batters faced is missing (undefined)", () => {
    const missingBfDetail: StrikeoutPropDetail = {
      ...detail,
      pitcherVenueSplits: {
        home: { site: "home", season: { gamesUsed: 1, totalOuts: 18, inningsPitched: "6.0", strikeouts: 6, hitsAllowed: 3 }, lastFiveAtSite: { gamesUsed: 1, totalOuts: 18, inningsPitched: "6.0", strikeouts: 6, hitsAllowed: 3 } },
        away: { site: "away", season: { gamesUsed: 0, totalOuts: null, inningsPitched: null, strikeouts: null, hitsAllowed: null }, lastFiveAtSite: { gamesUsed: 0, totalOuts: null, inningsPitched: null, strikeouts: null, hitsAllowed: null } },
      },
    };
    render(<MlbStrikeoutPropRowDetail detail={missingBfDetail} />);
    const detailPanel = screen.getByTestId("strikeout-prop-detail");
    expect(within(detailPanel).getAllByText("6").length).toBeGreaterThan(0);
    expect(within(detailPanel).getAllByText("N/A").length).toBeGreaterThan(0);
    expect(detailPanel.textContent).not.toMatch(/NaN|Infinity/);
  });

  it("colors K%/Hit% red when above league average (desktop + mobile match)", () => {
    render(<MlbStrikeoutPropRowDetail detail={venueDetail} />);
    // Home season K% 26.4% is above the ~22.2% league average.
    const cells = screen.getAllByText("26.4%");
    expect(cells.length).toBeGreaterThanOrEqual(2); // desktop td + mobile card
    for (const cell of cells) expect(cell.style.backgroundColor).toContain("220, 38, 38");
  });

  it("colors K%/Hit% blue when below league average", () => {
    render(<MlbStrikeoutPropRowDetail detail={venueDetail} />);
    // Away season K% 16.3% is well below the ~22.2% league average.
    const cells = screen.getAllByText("16.3%");
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) expect(cell.style.backgroundColor).toContain("37, 99, 235");
  });

  it("uses a neutral tint (not red or blue) when a rate is near league average", () => {
    const nearAverageDetail: StrikeoutPropDetail = {
      ...detail,
      pitcherVenueSplits: {
        home: { site: "home", season: { gamesUsed: 6, totalOuts: 104, inningsPitched: "34.2", strikeouts: 32, hitsAllowed: 32, battersFaced: 144, strikeoutRate: 22.4, hitRate: 22.2 }, lastFiveAtSite: { gamesUsed: 6, totalOuts: 104, inningsPitched: "34.2", strikeouts: 32, hitsAllowed: 32, battersFaced: 144, strikeoutRate: 22.4, hitRate: 22.2 } },
        away: { site: "away", season: { gamesUsed: 0, totalOuts: null, inningsPitched: null, strikeouts: null, hitsAllowed: null, battersFaced: null, strikeoutRate: null, hitRate: null }, lastFiveAtSite: { gamesUsed: 0, totalOuts: null, inningsPitched: null, strikeouts: null, hitsAllowed: null, battersFaced: null, strikeoutRate: null, hitRate: null } },
      },
    };
    render(<MlbStrikeoutPropRowDetail detail={nearAverageDetail} />);
    const kCells = screen.getAllByText("22.4%");
    expect(kCells.length).toBeGreaterThan(0);
    for (const cell of kCells) {
      expect(cell.style.backgroundColor).toContain("100, 116, 139");
      expect(cell.style.backgroundColor).not.toContain("220, 38, 38");
      expect(cell.style.backgroundColor).not.toContain("37, 99, 235");
    }
  });

  it("applies no gradient (no background color) to N/A K%/Hit% cells", () => {
    const zeroBfDetail: StrikeoutPropDetail = {
      ...detail,
      pitcherVenueSplits: {
        home: { site: "home", season: { gamesUsed: 1, totalOuts: 18, inningsPitched: "6.0", strikeouts: 6, hitsAllowed: 3, battersFaced: 0, strikeoutRate: null, hitRate: null }, lastFiveAtSite: { gamesUsed: 1, totalOuts: 18, inningsPitched: "6.0", strikeouts: 6, hitsAllowed: 3, battersFaced: 0, strikeoutRate: null, hitRate: null } },
        away: { site: "away", season: { gamesUsed: 0, totalOuts: null, inningsPitched: null, strikeouts: null, hitsAllowed: null, battersFaced: null, strikeoutRate: null, hitRate: null }, lastFiveAtSite: { gamesUsed: 0, totalOuts: null, inningsPitched: null, strikeouts: null, hitsAllowed: null, battersFaced: null, strikeoutRate: null, hitRate: null } },
      },
    };
    render(<MlbStrikeoutPropRowDetail detail={zeroBfDetail} />);
    const detailPanel = screen.getByTestId("strikeout-prop-detail");
    const naCells = within(detailPanel).getAllByText("N/A");
    expect(naCells.length).toBeGreaterThan(0);
    for (const cell of naCells) expect(cell.style.backgroundColor).toBe("");
  });
});
