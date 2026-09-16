/**
 * WU5 -- "AI Picks" tab. Grokowski (Grok) and Chatty Ice (ChatGPT) are two
 * fully independent handicappers: these tests check both cards render, PASS
 * is shown as a first-class state (never a fabricated confidence), a
 * missing provider degrades to "analysis_unavailable" without crashing, and
 * that nothing on the page computes a consensus, average, or winner between
 * the two.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import MatchupAiPicksPanel from "@/components/nfl/matchups/MatchupAiPicksPanel";
import type { NflAiHandicapPresentation } from "@/lib/nfl/aiHandicapPresentation";

const BASE_PRESENTATION: NflAiHandicapPresentation = {
  schemaVersion: "nfl-ai-handicap-presentation-v1",
  gameId: "2026_01_BAL_IND",
  season: 2026,
  week: 1,
  kickoff: "2026-09-13T17:00:00.000Z",
  homeTeam: "ind",
  awayTeam: "bal",
  generatedAt: "2026-09-12T15:00:00.000Z",
  handicappers: {
    grokowski: {
      status: "ok",
      provider: "grok",
      displayName: "Grokowski",
      analysisSnapshotId: "grok-fixture",
      analyzedAt: "2026-09-11T20:52:14.601Z",
      prediction: { fairSpread: { team: "ind", line: -1.5 }, projectedTotal: 46.5 },
      market: { spread: { homeLine: 3.5, awayLine: -3.5 }, total: 47.5 },
      edges: { sidePoints: 5, totalPoints: -1 },
      side: { lean: "home", team: "ind", line: 3.5, confidence: 4, rationale: null },
      total: { lean: "pass", line: null, confidence: null, rationale: null },
      centralThesis: "Grok's thesis.",
      keyFactors: [{ area: "quarterback", finding: "A finding.", supports: "home", importance: "major" }],
      failureModes: [{ scenario: "A scenario.", whyItMatters: "It matters." }],
      evidenceQualitySummary: { strengths: ["A strength."], limitations: ["A limitation."] },
    },
    chattyIce: {
      status: "ok",
      provider: "chatgpt",
      displayName: "Chatty Ice",
      analysisSnapshotId: "chatgpt-fixture",
      analyzedAt: "2026-09-12T14:58:02.222Z",
      prediction: { fairSpread: { team: "ind", line: -0.5 }, projectedTotal: 49 },
      market: { spread: { homeLine: 3.5, awayLine: -3.5 }, total: 47.5 },
      edges: { sidePoints: 4, totalPoints: 1.5 },
      side: { lean: "home", team: "ind", line: 3.5, confidence: 6, rationale: null },
      total: { lean: "over", line: 47.5, confidence: 5, rationale: null },
      centralThesis: "Chatty Ice's thesis.",
      keyFactors: [],
      failureModes: [],
      evidenceQualitySummary: null,
    },
  },
};

describe("MatchupAiPicksPanel", () => {
  it("13/14. renders both handicapper cards in a grid that stacks on mobile and sits side by side from sm: up", () => {
    const { container } = render(<MatchupAiPicksPanel presentation={BASE_PRESENTATION} loading={false} error={null} />);
    expect(screen.getByText("Grokowski")).toBeInTheDocument();
    expect(screen.getByText("Chatty Ice")).toBeInTheDocument();
    const grid = container.querySelector(".grid");
    expect(grid).toHaveClass("grid-cols-1");
    expect(grid).toHaveClass("sm:grid-cols-2");
  });

  it("shows the side/total picks and confidence for each handicapper", () => {
    render(<MatchupAiPicksPanel presentation={BASE_PRESENTATION} loading={false} error={null} />);
    // both handicappers happen to agree on the side pick (IND +3.5), and both also show IND +3.5 as
    // the baseline line next to their (differing) fair lines -- 4 total occurrences of this exact text.
    expect(screen.getAllByText("IND +3.5")).toHaveLength(4);
    expect(screen.getByText("Confidence 4/10")).toBeInTheDocument();
    expect(screen.getByText("Confidence 6/10")).toBeInTheDocument();
    expect(screen.getByText("Over 47.5")).toBeInTheDocument();
    expect(screen.getByText("Confidence 5/10")).toBeInTheDocument();
  });

  it("WU7.7: labels the frozen sportsbook line as a baseline, never as the current/live market", () => {
    render(<MatchupAiPicksPanel presentation={BASE_PRESENTATION} loading={false} error={null} />);
    expect(screen.getAllByText("Baseline Spread")).toHaveLength(2);
    expect(screen.getAllByText("Baseline Total")).toHaveLength(2);
    expect(screen.queryAllByText("Market", { exact: true })).toHaveLength(0);
    expect(screen.queryAllByText("Market total", { exact: true })).toHaveLength(0);
    // the baseline is stamped with when the analysis actually ran, not a live "now".
    expect(screen.getAllByText(/Analysis Baseline/)).toHaveLength(2);
  });

  it("WU4.5: shows each handicapper's own independent fair line and projected total, distinct from the market", () => {
    render(<MatchupAiPicksPanel presentation={BASE_PRESENTATION} loading={false} error={null} />);
    expect(screen.getByText("IND -1.5")).toBeInTheDocument(); // Grokowski's fair line
    expect(screen.getByText("IND -0.5")).toBeInTheDocument(); // Chatty Ice's fair line
    expect(screen.getByText("46.5")).toBeInTheDocument(); // Grokowski's projected total
    expect(screen.getByText("49")).toBeInTheDocument(); // Chatty Ice's projected total
  });

  it("WU4.6: shows the mechanically-computed edge, named toward the actual favored team", () => {
    render(<MatchupAiPicksPanel presentation={BASE_PRESENTATION} loading={false} error={null} />);
    expect(screen.getByText("5.0 pts IND")).toBeInTheDocument(); // Grokowski's sideEdgePoints=5 (positive -> home team IND)
    expect(screen.getByText("4.0 pts IND")).toBeInTheDocument(); // Chatty Ice's sideEdgePoints=4 (positive -> home team IND)
  });

  it("9. renders PASS as a first-class state, never a fabricated confidence", () => {
    render(<MatchupAiPicksPanel presentation={BASE_PRESENTATION} loading={false} error={null} />);
    const passLabels = screen.getAllByText("PASS");
    expect(passLabels).toHaveLength(1); // Grokowski's total
  });

  it("10. degrades a missing provider to an unavailable state without crashing", () => {
    const withMissingChatgpt: NflAiHandicapPresentation = {
      ...BASE_PRESENTATION,
      handicappers: {
        ...BASE_PRESENTATION.handicappers,
        chattyIce: { status: "analysis_unavailable", provider: "chatgpt", displayName: "Chatty Ice" },
      },
    };
    render(<MatchupAiPicksPanel presentation={withMissingChatgpt} loading={false} error={null} />);
    expect(screen.getByText("Grokowski")).toBeInTheDocument();
    expect(screen.getByText("No handicap opinion available yet for this game.")).toBeInTheDocument();
  });

  it("renders an unavailable message, not a crash, when no artifact has been generated at all", () => {
    render(<MatchupAiPicksPanel presentation={null} loading={false} error={null} />);
    expect(screen.getByText("AI handicaps have not been generated for this game yet.")).toBeInTheDocument();
  });

  it("15. never computes or renders a merged/averaged confidence -- each handicapper's own confidence stands alone", () => {
    render(<MatchupAiPicksPanel presentation={BASE_PRESENTATION} loading={false} error={null} />);
    // Grokowski=4, Chatty Ice=6 -- if anything merged them (e.g. averaged to 5) this would fail.
    expect(screen.getByText("Confidence 4/10")).toBeInTheDocument();
    expect(screen.getByText("Confidence 6/10")).toBeInTheDocument();
    expect(screen.queryByTestId("ai-picks-consensus")).toBeNull();
  });
});
