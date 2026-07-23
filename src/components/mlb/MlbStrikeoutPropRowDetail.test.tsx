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
