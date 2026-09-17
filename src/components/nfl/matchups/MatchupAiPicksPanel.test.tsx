/**
 * WU5 -- "AI Picks" tab. Grokowski (Grok) and Chatty Ice (ChatGPT) are two
 * fully independent handicappers: these tests check both cards render, PASS
 * is shown as a first-class state (never a fabricated confidence), a
 * missing provider degrades to "analysis_unavailable" without crashing, and
 * that nothing on the page computes a consensus, average, or winner between
 * the two.
 *
 * WU7.9 -- split into a compact "AI Handicap Comparison" row (both providers
 * always visible, scoped by data-testid="ai-handicap-summary-<provider>")
 * and a "Full Analysis" section that shows ONE provider's long-form article
 * at a time behind tabs (scoped by data-testid="ai-handicap-article-<provider>").
 * Tests below query within these scopes rather than the whole document so
 * they do not depend on which tab happens to be active.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import MatchupAiPicksPanel from "@/components/nfl/matchups/MatchupAiPicksPanel";
import type { AiHandicapEditorialArticle, NflAiHandicapPresentation } from "@/lib/nfl/aiHandicapPresentation";

const GROKOWSKI_EDITORIAL: AiHandicapEditorialArticle = {
  isLegacyPreview: false,
  headline: "Colts Lean on the Ground Against Baltimore",
  dek: "Indianapolis has the trench edge; Baltimore has the bigger ceiling.",
  openingRead: ["Synthetic opening paragraph."],
  awayOffenseVsHomeDefense: { heading: "When Baltimore Has the Ball", paragraphs: ["Synthetic away-offense paragraph."] },
  homeOffenseVsAwayDefense: { heading: "When Indianapolis Has the Ball", paragraphs: ["Synthetic home-offense paragraph."] },
  trenchesAndGameControl: ["Synthetic trenches paragraph."],
  personnelAndAvailability: null,
  gameScript: ["Synthetic game-script paragraph."],
  matchupKeys: [{ title: "Can Indianapolis control the clock?", analysis: "Synthetic matchup key analysis." }],
  swingFactors: [{ title: "Quarterback availability", analysis: "Synthetic swing factor analysis." }],
  sideAnalysis: ["Synthetic side analysis paragraph."],
  totalAnalysis: null,
  finalWord: ["Synthetic closing paragraph."],
};

const CHATTY_ICE_EDITORIAL: AiHandicapEditorialArticle = {
  ...GROKOWSKI_EDITORIAL,
  headline: "Ravens Favored Behind an Efficient Passing Game",
};

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
      editorial: GROKOWSKI_EDITORIAL,
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
      editorial: CHATTY_ICE_EDITORIAL,
    },
  },
};

describe("MatchupAiPicksPanel -- AI Handicap Comparison (compact, both providers always visible)", () => {
  it("13/14. renders both handicapper summary cards in a grid that stacks on mobile and sits side by side from sm: up", () => {
    render(<MatchupAiPicksPanel presentation={BASE_PRESENTATION} loading={false} error={null} />);
    const grokCard = screen.getByTestId("ai-handicap-summary-grok");
    const chatgptCard = screen.getByTestId("ai-handicap-summary-chatgpt");
    expect(within(grokCard).getByText("Grokowski")).toBeInTheDocument();
    expect(within(chatgptCard).getByText("Chatty Ice")).toBeInTheDocument();
    const grid = grokCard.parentElement;
    expect(grid).toHaveClass("grid-cols-1");
    expect(grid).toHaveClass("sm:grid-cols-2");
  });

  it("shows the side/total picks and confidence for each handicapper", () => {
    render(<MatchupAiPicksPanel presentation={BASE_PRESENTATION} loading={false} error={null} />);
    const grokCard = screen.getByTestId("ai-handicap-summary-grok");
    const chatgptCard = screen.getByTestId("ai-handicap-summary-chatgpt");
    expect(within(grokCard).getByText("Confidence 4/10")).toBeInTheDocument();
    expect(within(chatgptCard).getByText("Confidence 6/10")).toBeInTheDocument();
    expect(within(chatgptCard).getByText("Over 47.5")).toBeInTheDocument();
  });

  it("WU7.7: labels the frozen sportsbook line as a baseline, never as the current/live market", () => {
    render(<MatchupAiPicksPanel presentation={BASE_PRESENTATION} loading={false} error={null} />);
    const grokCard = screen.getByTestId("ai-handicap-summary-grok");
    expect(within(grokCard).getByText("Baseline Spread")).toBeInTheDocument();
    expect(within(grokCard).getByText("Baseline Total")).toBeInTheDocument();
    expect(screen.queryAllByText("Market", { exact: true })).toHaveLength(0);
    expect(screen.queryAllByText("Market total", { exact: true })).toHaveLength(0);
    // the baseline is stamped with when the analysis actually ran, not a live "now".
    expect(within(grokCard).getByText(/Analysis Baseline/)).toBeInTheDocument();
  });

  it("WU4.5: shows each handicapper's own independent fair line and projected total, distinct from the market", () => {
    render(<MatchupAiPicksPanel presentation={BASE_PRESENTATION} loading={false} error={null} />);
    const grokCard = screen.getByTestId("ai-handicap-summary-grok");
    const chatgptCard = screen.getByTestId("ai-handicap-summary-chatgpt");
    expect(within(grokCard).getByText("IND -1.5")).toBeInTheDocument();
    expect(within(chatgptCard).getByText("IND -0.5")).toBeInTheDocument();
    expect(within(grokCard).getByText("46.5")).toBeInTheDocument();
    expect(within(chatgptCard).getByText("49")).toBeInTheDocument();
  });

  it("WU4.6: shows the mechanically-computed edge, named toward the actual favored team", () => {
    render(<MatchupAiPicksPanel presentation={BASE_PRESENTATION} loading={false} error={null} />);
    const grokCard = screen.getByTestId("ai-handicap-summary-grok");
    const chatgptCard = screen.getByTestId("ai-handicap-summary-chatgpt");
    expect(within(grokCard).getByText("5.0 pts IND")).toBeInTheDocument();
    expect(within(chatgptCard).getByText("4.0 pts IND")).toBeInTheDocument();
  });

  it("9. renders PASS as a first-class state, never a fabricated confidence", () => {
    render(<MatchupAiPicksPanel presentation={BASE_PRESENTATION} loading={false} error={null} />);
    const grokCard = screen.getByTestId("ai-handicap-summary-grok");
    expect(within(grokCard).getByText("PASS")).toBeInTheDocument();
    expect(within(grokCard).queryByText(/Confidence.*\/10/)).toHaveTextContent("Confidence 4/10"); // side only, never a fabricated total confidence
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
    expect(within(screen.getByTestId("ai-handicap-summary-grok")).getByText("Grokowski")).toBeInTheDocument();
    expect(within(screen.getByTestId("ai-handicap-summary-chatgpt")).getByText("No handicap opinion available yet for this game.")).toBeInTheDocument();
  });

  it("renders an unavailable message, not a crash, when no artifact has been generated at all", () => {
    render(<MatchupAiPicksPanel presentation={null} loading={false} error={null} />);
    expect(screen.getByText("AI handicaps have not been generated for this game yet.")).toBeInTheDocument();
  });

  it("15. never computes or renders a merged/averaged confidence -- each handicapper's own confidence stands alone", () => {
    render(<MatchupAiPicksPanel presentation={BASE_PRESENTATION} loading={false} error={null} />);
    // Grokowski=4, Chatty Ice=6 -- if anything merged them (e.g. averaged to 5) this would fail.
    expect(within(screen.getByTestId("ai-handicap-summary-grok")).getByText("Confidence 4/10")).toBeInTheDocument();
    expect(within(screen.getByTestId("ai-handicap-summary-chatgpt")).getByText("Confidence 6/10")).toBeInTheDocument();
    expect(screen.queryByTestId("ai-picks-consensus")).toBeNull();
  });
});

describe("MatchupAiPicksPanel -- Full Analysis (one long-form article at a time, provider tabs)", () => {
  it("shows Grokowski's article by default, not both providers' articles at once", () => {
    render(<MatchupAiPicksPanel presentation={BASE_PRESENTATION} loading={false} error={null} />);
    expect(screen.getByTestId("ai-handicap-article-grok")).toBeInTheDocument();
    expect(screen.queryByTestId("ai-handicap-article-chatgpt")).toBeNull();
    expect(screen.getByText(GROKOWSKI_EDITORIAL.headline)).toBeInTheDocument();
    expect(screen.queryByText(CHATTY_ICE_EDITORIAL.headline)).toBeNull();
  });

  it("switches to Chatty Ice's article, and only Chatty Ice's, when its tab is clicked -- never sent the other provider's article", () => {
    render(<MatchupAiPicksPanel presentation={BASE_PRESENTATION} loading={false} error={null} />);
    fireEvent.click(screen.getByRole("tab", { name: "Chatty Ice" }));
    expect(screen.getByTestId("ai-handicap-article-chatgpt")).toBeInTheDocument();
    expect(screen.queryByTestId("ai-handicap-article-grok")).toBeNull();
    expect(screen.getByText(CHATTY_ICE_EDITORIAL.headline)).toBeInTheDocument();
    expect(screen.queryByText(GROKOWSKI_EDITORIAL.headline)).toBeNull();
  });

  it("betting numbers/baseline in the article match the summary card exactly -- Stage B cannot have altered them", () => {
    render(<MatchupAiPicksPanel presentation={BASE_PRESENTATION} loading={false} error={null} />);
    const article = screen.getByTestId("ai-handicap-article-grok");
    expect(within(article).getByText("IND -1.5")).toBeInTheDocument(); // fair spread, unchanged from Stage A
    // baseline spread and side pick both render as "IND +3.5" here, unchanged from the frozen market.
    expect(within(article).getAllByText("IND +3.5").length).toBeGreaterThan(0);
    expect(within(article).getByText("46.5")).toBeInTheDocument(); // projected total, unchanged from Stage A
  });

  it("renders Matchup Keys and Swing Factors sections when the article supplies them", () => {
    render(<MatchupAiPicksPanel presentation={BASE_PRESENTATION} loading={false} error={null} />);
    const article = screen.getByTestId("ai-handicap-article-grok");
    expect(within(article).getByText("Matchup Keys")).toBeInTheDocument();
    expect(within(article).getByText(GROKOWSKI_EDITORIAL.matchupKeys[0].title)).toBeInTheDocument();
    expect(within(article).getByText("What Could Flip the Handicap")).toBeInTheDocument();
    expect(within(article).getByText(GROKOWSKI_EDITORIAL.swingFactors[0].title)).toBeInTheDocument();
  });

  it("omits a section entirely when its data is null, rather than fabricating placeholder prose", () => {
    render(<MatchupAiPicksPanel presentation={BASE_PRESENTATION} loading={false} error={null} />);
    const article = screen.getByTestId("ai-handicap-article-grok");
    // personnelAndAvailability is null on this fixture.
    expect(within(article).queryByText("Personnel, Injuries and Context")).toBeNull();
    // totalAnalysis is null on this fixture.
    expect(within(article).queryByText("Total Analysis")).toBeNull();
  });

  it("shows a legacy-preview notice when the article was assembled by the deterministic adapter, never silently presenting it as the provider's own finished article", () => {
    const withLegacyPreview: NflAiHandicapPresentation = {
      ...BASE_PRESENTATION,
      handicappers: {
        ...BASE_PRESENTATION.handicappers,
        grokowski: { ...BASE_PRESENTATION.handicappers.grokowski, editorial: { ...GROKOWSKI_EDITORIAL, isLegacyPreview: true } } as typeof BASE_PRESENTATION.handicappers.grokowski,
      },
    };
    render(<MatchupAiPicksPanel presentation={withLegacyPreview} loading={false} error={null} />);
    expect(screen.getByText(/Layout preview/)).toBeInTheDocument();
  });

  it("Research & Sources is collapsed by default, and still exposes the raw matchup factors/failure modes/evidence quality for auditability", () => {
    render(<MatchupAiPicksPanel presentation={BASE_PRESENTATION} loading={false} error={null} />);
    const article = screen.getByTestId("ai-handicap-article-grok");
    const trigger = within(article).getByRole("button", { name: /Research & Sources/ });
    // Collapsed by default.
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    // The raw content is still present for auditability even while collapsed -- never deleted.
    expect(within(article).getByText("A finding.")).toBeInTheDocument();
    expect(within(article).getByText("A scenario.")).toBeInTheDocument();
    expect(within(article).getByText("A strength.")).toBeInTheDocument();
    expect(within(article).getByText("A limitation.")).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("never exposes banned machine/internal language (FACT:, INTERPRETATION:, snake_case, schema/pipeline/validator/artifact) in the primary article UI", () => {
    render(<MatchupAiPicksPanel presentation={BASE_PRESENTATION} loading={false} error={null} />);
    const article = screen.getByTestId("ai-handicap-article-grok");
    const text = article.textContent ?? "";
    expect(text).not.toMatch(/FACT:/);
    expect(text).not.toMatch(/INTERPRETATION:/);
    expect(text).not.toMatch(/SOURCE_UNAVAILABLE/);
    expect(text).not.toMatch(/schema|pipeline|validator|artifact/i);
    expect(text).not.toMatch(/[a-z]_[a-z]/); // snake_case token
  });

  it("degrades the Full Analysis tab to an unavailable message, without crashing, when the active provider has no opinion", async () => {
    const withMissingChatgpt: NflAiHandicapPresentation = {
      ...BASE_PRESENTATION,
      handicappers: {
        ...BASE_PRESENTATION.handicappers,
        chattyIce: { status: "analysis_unavailable", provider: "chatgpt", displayName: "Chatty Ice" },
      },
    };
    render(<MatchupAiPicksPanel presentation={withMissingChatgpt} loading={false} error={null} />);
    fireEvent.click(screen.getByRole("tab", { name: "Chatty Ice" }));
    expect(screen.getAllByText("No handicap opinion available yet for this game.").length).toBeGreaterThan(0);
  });
});

describe("MatchupAiPicksPanel -- WU7.10 provider visual identity", () => {
  it("stamps each summary card with a distinct data-provider hook, never the same for both", () => {
    render(<MatchupAiPicksPanel presentation={BASE_PRESENTATION} loading={false} error={null} />);
    const grokCard = screen.getByTestId("ai-handicap-summary-grok");
    const chatgptCard = screen.getByTestId("ai-handicap-summary-chatgpt");
    expect(grokCard).toHaveAttribute("data-provider", "grok");
    expect(chatgptCard).toHaveAttribute("data-provider", "chatgpt");
  });

  it("gives Grokowski and Chatty Ice visually distinct masthead background classes -- not the same treatment with different labels", () => {
    render(<MatchupAiPicksPanel presentation={BASE_PRESENTATION} loading={false} error={null} />);
    const grokMasthead = screen.getByTestId("ai-handicap-masthead-grok");
    const chatgptMasthead = screen.getByTestId("ai-handicap-masthead-chatgpt");
    expect(grokMasthead.className).toContain("bg-slate-950");
    expect(grokMasthead.className).toContain("border-red-600");
    expect(chatgptMasthead.className).toContain("bg-blue-950");
    expect(chatgptMasthead.className).toContain("border-cyan-400");
    expect(grokMasthead.className).not.toBe(chatgptMasthead.className);
  });

  it("each summary card masthead carries the provider name and a fixed tagline, distinct per provider", () => {
    render(<MatchupAiPicksPanel presentation={BASE_PRESENTATION} loading={false} error={null} />);
    const grokCard = screen.getByTestId("ai-handicap-summary-grok");
    const chatgptCard = screen.getByTestId("ai-handicap-summary-chatgpt");
    expect(within(grokCard).getByText("Grokowski")).toBeInTheDocument();
    expect(within(grokCard).getByText("Independent Handicap")).toBeInTheDocument();
    expect(within(chatgptCard).getByText("Chatty Ice")).toBeInTheDocument();
    expect(within(chatgptCard).getByText("Independent Handicap")).toBeInTheDocument();
  });

  it("the unavailable-state summary card still carries its own provider masthead identity", () => {
    const withMissingChatgpt: NflAiHandicapPresentation = {
      ...BASE_PRESENTATION,
      handicappers: {
        ...BASE_PRESENTATION.handicappers,
        chattyIce: { status: "analysis_unavailable", provider: "chatgpt", displayName: "Chatty Ice" },
      },
    };
    render(<MatchupAiPicksPanel presentation={withMissingChatgpt} loading={false} error={null} />);
    const chatgptCard = screen.getByTestId("ai-handicap-summary-chatgpt");
    expect(chatgptCard).toHaveAttribute("data-provider", "chatgpt");
    expect(within(chatgptCard).getByText("Chatty Ice")).toBeInTheDocument();
    expect(within(chatgptCard).getByText("Independent Handicap")).toBeInTheDocument();
  });

  it("the active Full Analysis tab adopts the selected provider's masthead treatment, and only the active one", () => {
    render(<MatchupAiPicksPanel presentation={BASE_PRESENTATION} loading={false} error={null} />);
    const grokTab = screen.getByRole("tab", { name: "Grokowski" });
    const chatgptTab = screen.getByRole("tab", { name: "Chatty Ice" });
    expect(grokTab).toHaveAttribute("aria-selected", "true");
    expect(grokTab.className).toContain("bg-slate-950");
    expect(chatgptTab).toHaveAttribute("aria-selected", "false");
    expect(chatgptTab.className).not.toContain("bg-blue-950");

    fireEvent.click(chatgptTab);
    expect(chatgptTab).toHaveAttribute("aria-selected", "true");
    expect(chatgptTab.className).toContain("bg-blue-950");
    expect(grokTab).toHaveAttribute("aria-selected", "false");
    expect(grokTab.className).not.toContain("bg-slate-950");
  });

  it("the full-analysis article masthead matches the active provider's identity (Grokowski by default)", () => {
    render(<MatchupAiPicksPanel presentation={BASE_PRESENTATION} loading={false} error={null} />);
    const article = screen.getByTestId("ai-handicap-article-grok");
    expect(article).toHaveAttribute("data-provider", "grok");
    expect(within(article).getByText("NFL Game Analysis")).toBeInTheDocument();
  });

  it("switching to Chatty Ice swaps the article masthead identity to Chatty Ice, never mixing the two", () => {
    render(<MatchupAiPicksPanel presentation={BASE_PRESENTATION} loading={false} error={null} />);
    fireEvent.click(screen.getByRole("tab", { name: "Chatty Ice" }));
    const article = screen.getByTestId("ai-handicap-article-chatgpt");
    expect(article).toHaveAttribute("data-provider", "chatgpt");
    expect(screen.queryByTestId("ai-handicap-article-grok")).toBeNull();
  });

  it("WU7.10: exact CAR_ATL numeric values are unchanged by the visual restyle (presentation only, no analysis-logic change)", () => {
    const carAtlPresentation: NflAiHandicapPresentation = {
      ...BASE_PRESENTATION,
      homeTeam: "atl",
      awayTeam: "car",
      handicappers: {
        grokowski: { ...BASE_PRESENTATION.handicappers.grokowski, prediction: { fairSpread: { team: "atl", line: -1.5 }, projectedTotal: 42.5 }, market: { spread: { homeLine: 2.5, awayLine: -2.5 }, total: 43.5 }, edges: { sidePoints: 4, totalPoints: -1 }, side: { lean: "home", team: "atl", line: 2.5, confidence: 5, rationale: null }, total: { lean: "pass", line: null, confidence: null, rationale: null } },
        chattyIce: { ...BASE_PRESENTATION.handicappers.chattyIce, prediction: { fairSpread: { team: "atl", line: -3 }, projectedTotal: 44 }, market: { spread: { homeLine: 2.5, awayLine: -2.5 }, total: 43.5 }, edges: { sidePoints: 5.5, totalPoints: 0.5 }, side: { lean: "home", team: "atl", line: 2.5, confidence: 5, rationale: null }, total: { lean: "over", line: 43.5, confidence: 5, rationale: null } },
      },
    };
    render(<MatchupAiPicksPanel presentation={carAtlPresentation} loading={false} error={null} />);
    const grokCard = screen.getByTestId("ai-handicap-summary-grok");
    const chatgptCard = screen.getByTestId("ai-handicap-summary-chatgpt");

    expect(within(grokCard).getByText("ATL -1.5")).toBeInTheDocument();
    expect(within(grokCard).getAllByText("ATL +2.5").length).toBeGreaterThan(0); // baseline spread + side pick
    expect(within(grokCard).getByText("4.0 pts ATL")).toBeInTheDocument();
    expect(within(grokCard).getByText("42.5")).toBeInTheDocument();
    expect(within(grokCard).getByText("43.5")).toBeInTheDocument();
    expect(within(grokCard).getByText("1.0 pts Under")).toBeInTheDocument();
    expect(within(grokCard).getByText("Confidence 5/10")).toBeInTheDocument();
    expect(within(grokCard).getByText("PASS")).toBeInTheDocument();

    expect(within(chatgptCard).getByText("ATL -3")).toBeInTheDocument();
    expect(within(chatgptCard).getAllByText("ATL +2.5").length).toBeGreaterThan(0);
    expect(within(chatgptCard).getByText("5.5 pts ATL")).toBeInTheDocument();
    expect(within(chatgptCard).getByText("44")).toBeInTheDocument();
    expect(within(chatgptCard).getByText("43.5")).toBeInTheDocument();
    expect(within(chatgptCard).getByText("0.5 pts Over")).toBeInTheDocument();
    expect(within(chatgptCard).getByText("Over 43.5")).toBeInTheDocument();
    expect(within(chatgptCard).getAllByText("Confidence 5/10").length).toBeGreaterThan(0);
  });
});
