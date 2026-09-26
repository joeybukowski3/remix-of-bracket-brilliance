/**
 * AI Picks v2 UI -- v2 preferred over v1, v1 fallback, both providers render
 * (real live LAC @ BUF output as fixtures), badges, probabilities, fair
 * score/total, prose without legacy section headings, and source handling.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import MatchupAiPicksPanel from "@/components/nfl/matchups/MatchupAiPicksPanel";
import type { AiHandicapV2Card, NflAiHandicapPresentation } from "@/lib/nfl/aiHandicapPresentation";
import { CHATGPT_V2_LAC_BUF, GROK_V2_LAC_BUF, LAC_BUF_AWAY, LAC_BUF_HOME } from "@/lib/nfl/__fixtures__/aiHandicapV2LacBuf";
import { parseV2AnalysisMarkdown } from "@/lib/nfl/aiHandicapV2Format";

const UNAVAILABLE = (provider: "grok" | "chatgpt", displayName: string) => ({ status: "analysis_unavailable" as const, provider, displayName, reason: "no_analysis_yet" as const });

function presentation(v2?: NflAiHandicapPresentation["handicapV2"]): NflAiHandicapPresentation {
  return {
    schemaVersion: "nfl-ai-handicap-presentation-v1",
    gameId: "2026_03_LAC_BUF",
    season: 2026,
    week: 3,
    kickoff: "2026-09-27T17:00:00.000Z",
    homeTeam: LAC_BUF_HOME,
    awayTeam: LAC_BUF_AWAY,
    generatedAt: "2026-09-25T21:30:00.000Z",
    handicappers: { grokowski: UNAVAILABLE("grok", "Grokowski"), chattyIce: UNAVAILABLE("chatgpt", "Chatty Ice") },
    ...(v2 ? { handicapV2: v2 } : {}),
  };
}

const BOTH = presentation({ grokowski: GROK_V2_LAC_BUF, chattyIce: CHATGPT_V2_LAC_BUF });
const renderPanel = (p: NflAiHandicapPresentation) => render(<MatchupAiPicksPanel presentation={p} loading={false} error={null} />);

describe("v2 summary cards", () => {
  it("3/4/5/6/7. ChatGPT and Grok v2 render verdict, pick, cover %, fair spread, fair score and total", () => {
    renderPanel(BOTH);
    const c = screen.getByTestId("ai-handicap-summary-chatgpt");
    expect(c).toHaveAttribute("data-handicap-version", "v2");
    expect(within(c).getByTestId("ai-handicap-verdict-chatgpt")).toHaveTextContent("LEAN");
    expect(within(c).getByTestId("ai-handicap-pick-chatgpt")).toHaveTextContent("BUF -7");
    expect(within(c).getByTestId("ai-handicap-cover-chatgpt")).toHaveTextContent("56%");
    expect(within(c).getByTestId("ai-handicap-fair-spread-chatgpt")).toHaveTextContent("BUF -8.5");
    expect(within(c).getByTestId("ai-handicap-fair-score-chatgpt")).toHaveTextContent("LAC 21 – BUF 29");
    expect(within(c).getByTestId("ai-handicap-total-chatgpt")).toHaveTextContent("50");
    expect(within(c).getByTestId("ai-handicap-confidence-chatgpt")).toHaveTextContent("Medium");

    const g = screen.getByTestId("ai-handicap-summary-grok");
    expect(within(g).getByTestId("ai-handicap-verdict-grok")).toHaveTextContent("LEAN");
    expect(within(g).getByTestId("ai-handicap-pick-grok")).toHaveTextContent("BUF -7");
    expect(within(g).getByTestId("ai-handicap-cover-grok")).toHaveTextContent("55%");
    expect(within(g).getByTestId("ai-handicap-fair-spread-grok")).toHaveTextContent("BUF -9.5");
    expect(within(g).getByTestId("ai-handicap-fair-score-grok")).toHaveTextContent("LAC 19 – BUF 29");
    expect(within(g).getByTestId("ai-handicap-total-grok")).toHaveTextContent("47.5");
  });

  it("5. BET / LEAN / PASS badges render their own labels", () => {
    for (const verdict of ["BET", "LEAN", "PASS"] as const) {
      const card: AiHandicapV2Card = { ...GROK_V2_LAC_BUF, verdict };
      const { unmount } = renderPanel(presentation({ grokowski: card, chattyIce: null }));
      expect(screen.getByTestId("ai-handicap-verdict-grok")).toHaveTextContent(verdict);
      unmount();
    }
  });

  it("shows a neutral agreement note that ranks neither provider", () => {
    renderPanel(BOTH);
    const note = screen.getByTestId("ai-handicap-v2-agreement");
    expect(note).toHaveTextContent("Both handicappers prefer BUF -7");
    expect(note).toHaveTextContent("neither is presumed correct");
  });
});

describe("v2 analysis", () => {
  it("8. renders analysisMarkdown as prose plus a final-read block, with no legacy section headings", () => {
    renderPanel(BOTH);
    fireEvent.click(screen.getByRole("tab", { name: "Chatty Ice" }));
    const article = screen.getByTestId("ai-handicap-article-chatgpt");
    expect(article).toHaveAttribute("data-handicap-version", "v2");
    const finalRead = within(article).getByTestId("ai-handicap-final-read-chatgpt");
    expect(finalRead).toHaveTextContent("Bills -7: ~56% cover probability");
    expect(finalRead).toHaveTextContent("Chargers +7: ~38%");
    expect(finalRead).toHaveTextContent("Fair-ish score: Chargers 21, Bills 29");
    expect(finalRead).toHaveTextContent("Projected total: ~50");
    expect(finalRead.textContent).not.toContain("**");
    expect(within(article).getByText(/So at the exact line I would choose Bills -7/)).toBeInTheDocument();
    for (const legacy of ["Opening Read", "Matchup Keys", "What Could Flip the Handicap", "Final Word"]) {
      expect(within(article).queryByText(legacy)).toBeNull();
    }
    expect(within(article).getAllByRole("heading")).toHaveLength(1);
  });

  it("parses the live markdown into paragraphs, one final-read block and a closing paragraph", () => {
    const blocks = parseV2AnalysisMarkdown(CHATGPT_V2_LAC_BUF.analysisMarkdown);
    expect(blocks.filter((b) => b.kind === "finalRead")).toHaveLength(1);
    expect(blocks[blocks.length - 1].kind).toBe("paragraph");
    expect(blocks.filter((b) => b.kind === "paragraph").length).toBeGreaterThanOrEqual(4);
  });

  it("Grokowski analysis renders when selected", () => {
    renderPanel(BOTH);
    const article = screen.getByTestId("ai-handicap-article-grok");
    expect(within(article).getByTestId("ai-handicap-final-read-grok")).toHaveTextContent("Chargers 19, Bills 29");
  });

  it("9/10. sources come only from the public list; url sources are links, internal ones are plain text", () => {
    renderPanel(BOTH);
    const sources = screen.getByTestId("ai-handicap-sources-grok");
    expect(sources.tagName).toBe("DETAILS");
    expect(sources).not.toHaveAttribute("open");
    const links = within(sources).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(GROK_V2_LAC_BUF.sources.filter((s) => s.url).map((s) => s.url));
    const internal = GROK_V2_LAC_BUF.sources.filter((s) => !s.url);
    expect(internal.length).toBeGreaterThan(0);
    for (const s of internal) {
      const el = within(sources).getByText(s.label);
      expect(el.closest("a")).toBeNull();
      expect(el).toHaveAttribute("data-internal-source", "true");
    }
    expect(within(sources).getAllByRole("listitem")).toHaveLength(GROK_V2_LAC_BUF.sources.length);
  });
});

describe("selection and fallback", () => {
  it("1. v2 is preferred over an available v1 card for the same provider", () => {
    const p = presentation({ grokowski: GROK_V2_LAC_BUF, chattyIce: null });
    p.handicappers.grokowski = {
      status: "ok",
      provider: "grok",
      displayName: "Grokowski",
      analysisSnapshotId: "s",
      analyzedAt: "2026-09-20T00:00:00.000Z",
      prediction: null,
      market: { spread: { homeLine: -7, awayLine: 7 }, total: 50.5 },
      edges: { sidePoints: null, totalPoints: null },
      side: { lean: "home", team: "buf", line: -7, confidence: 3, rationale: null },
      total: { lean: "pass", line: null, confidence: null, rationale: null },
      centralThesis: "LEGACY THESIS",
      keyFactors: [],
      failureModes: [],
      evidenceQualitySummary: null,
      editorial: {
        isLegacyPreview: false,
        headline: "LEGACY HEADLINE",
        dek: "d",
        openingRead: ["o"],
        awayOffenseVsHomeDefense: null,
        homeOffenseVsAwayDefense: null,
        trenchesAndGameControl: null,
        personnelAndAvailability: null,
        gameScript: null,
        matchupKeys: [],
        swingFactors: [],
        sideAnalysis: null,
        totalAnalysis: null,
        finalWord: ["f"],
      },
    };
    renderPanel(p);
    expect(screen.getByTestId("ai-handicap-summary-grok")).toHaveAttribute("data-handicap-version", "v2");
    expect(screen.queryByText("LEGACY HEADLINE")).toBeNull();
  });

  it("2/11. a provider without v2 falls back to v1 (unavailable here) while the other renders v2", () => {
    renderPanel(presentation({ grokowski: GROK_V2_LAC_BUF, chattyIce: null }));
    expect(screen.getByTestId("ai-handicap-summary-grok")).toHaveAttribute("data-handicap-version", "v2");
    const chatty = screen.getByTestId("ai-handicap-summary-chatgpt");
    expect(chatty).not.toHaveAttribute("data-handicap-version");
    expect(within(chatty).getByText("No handicap opinion available yet for this game.")).toBeInTheDocument();
    expect(screen.queryByTestId("ai-handicap-v2-agreement")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Chatty Ice" }));
    expect(screen.queryByTestId("ai-handicap-article-chatgpt")).toBeNull();
  });

  it("a presentation with no v2 at all keeps the pre-v2 behavior", () => {
    renderPanel(presentation());
    expect(screen.getAllByText("No handicap opinion available yet for this game.").length).toBeGreaterThan(0);
    expect(screen.getByText("Full Analysis")).toBeInTheDocument();
  });
});

describe("12. mobile layout guards (jsdom cannot measure overflow; real 390px/1440px overflow is checked in a browser)", () => {
  it("cards stack on mobile, prose and links wrap, and nothing has a fixed pixel width", () => {
    const { container } = renderPanel(BOTH);
    expect(screen.getByTestId("ai-handicap-summary-grok").parentElement).toHaveClass("grid-cols-1", "sm:grid-cols-2");
    expect(screen.getByTestId("ai-handicap-summary-grok")).toHaveClass("min-w-0");
    const article = screen.getByTestId("ai-handicap-article-grok");
    expect(article).toHaveClass("min-w-0");
    for (const p of article.querySelectorAll("p")) expect(p).toHaveClass("break-words");
    for (const a of within(article).getAllByRole("link")) expect(a).toHaveClass("break-all");
    expect(container.innerHTML).not.toMatch(/\bw-\[\d+px\]|\bmin-w-\[\d+px\]/);
  });
});
