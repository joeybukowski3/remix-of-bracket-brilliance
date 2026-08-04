import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import MatchupModelAnalysis from "@/components/nfl/matchups/MatchupModelAnalysis";
import type { GameProjection } from "@/lib/nfl/projectionData";
import type { MarketCurrentGame } from "@/lib/nfl/marketData";

const side = {
  offAdj: 0.1,
  defAdj: -0.05,
  pdgAdj: 4,
  compositeZ: 0,
  sampleGames: 17,
  lastSampleGameId: "2025_18_MIA_NE",
  priorSeason: 2025,
  priorWeight: 1,
  currentSeasonGames: 0,
  priorSeasonGames: 17,
};

function projection(overrides: Partial<GameProjection> = {}): GameProjection {
  return {
    gameId: "2026_01_NE_SEA",
    season: 2026,
    week: 1,
    kickoff: "2026-09-10T00:20:00.000Z",
    awayTeam: "ne",
    homeTeam: "sea",
    neutralSite: false,
    beta: 4.63,
    away: { ...side },
    home: { ...side, compositeZ: 0.2934 },
    strengthDiff: 0.2934,
    neutralMargin: 1.3586,
    homeFieldAdvantage: 2,
    projectedHomeMargin: 3.3586,
    projectedSpread: { favoriteTeam: "sea", line: -3.4, display: "SEA −3.4" },
    ...overrides,
  };
}

function market(homeSpread: number | null): MarketCurrentGame {
  return {
    gameId: "2026_01_NE_SEA",
    season: 2026,
    week: 1,
    seasonType: "REG",
    homeAbbr: "sea",
    awayAbbr: "ne",
    neutralSite: false,
    spread: { home: homeSpread, away: homeSpread == null ? null : -homeSpread },
    moneyline: { home: null, away: null },
    total: null,
    rawSpreadLine: null,
  };
}

function renderSection(props: Partial<React.ComponentProps<typeof MatchupModelAnalysis>> = {}) {
  return render(
    <MatchupModelAnalysis
      projection={projection()}
      market={market(-2.5)}
      awayTeamName="New England Patriots"
      homeTeamName="Seattle Seahawks"
      modelVersion="nfl-spread-v0.1.0"
      loading={false}
      error={null}
      {...props}
    />
  );
}

/** The section body, so assertions never collide with copy elsewhere on the page. */
const section = () => document.getElementById("model-analysis") as HTMLElement;

describe("MatchupModelAnalysis headline", () => {
  it("leads with the JKB projected spread", () => {
    renderSection();
    expect(within(section()).getByText("JKB Projected Spread")).toBeInTheDocument();
    expect(within(section()).getByText("SEA −3.4")).toBeInTheDocument();
  });

  it("shows the market spread beside it", () => {
    renderSection();
    expect(within(section()).getByText("Market Spread")).toBeInTheDocument();
    expect(within(section()).getByText("SEA −2.5")).toBeInTheDocument();
  });

  it("labels the difference Model vs Market, never Model Edge", () => {
    renderSection();
    expect(within(section()).getByText("Model vs Market")).toBeInTheDocument();
    expect(within(section()).queryByText(/model edge/i)).not.toBeInTheDocument();
  });

  it("signs the difference toward the team the model prefers", () => {
    // Model SEA by 3.36 against a market of SEA by 2.5 leans home by +0.9.
    renderSection();
    expect(within(section()).getByText("+0.9")).toBeInTheDocument();
  });

  it("leans toward the away team when the model is lower on the home side", () => {
    renderSection({ market: market(-7.5) });
    const body = within(section());
    expect(body.getByText("−4.1")).toBeInTheDocument();
    expect(body.getByText("ne")).toBeInTheDocument();
  });

  it("reports N/A for the market when no line exists, and still projects", () => {
    renderSection({ market: market(null) });
    const body = within(section());
    expect(body.getByText("SEA −3.4")).toBeInTheDocument();
    expect(body.getAllByText("N/A").length).toBeGreaterThanOrEqual(2);
  });

  it("states plainly that the difference is not a recommendation", () => {
    renderSection();
    expect(within(section()).getByText(/not a recommendation/i)).toBeInTheDocument();
  });
});

describe("MatchupModelAnalysis explanation", () => {
  it("shows exactly the three terms behind the projection", () => {
    renderSection();
    const body = within(section());
    expect(body.getByText("Team Strength Difference")).toBeInTheDocument();
    expect(body.getByText("Home Field")).toBeInTheDocument();
    expect(body.getByText("Projected Margin")).toBeInTheDocument();
  });

  it("credits a fixed 2.0-point home field", () => {
    renderSection();
    expect(within(section()).getByText("+2.0")).toBeInTheDocument();
  });

  it("applies no home field at a neutral site", () => {
    renderSection({
      projection: projection({
        neutralSite: true,
        homeFieldAdvantage: 0,
        projectedHomeMargin: 1.3586,
        projectedSpread: { favoriteTeam: "sea", line: -1.4, display: "SEA -1.4" },
      }),
    });
    // The phrase appears in the subtitle too; the breakdown row is what matters.
    expect(within(section()).getAllByText(/neutral site/i).length).toBeGreaterThan(0);
    expect(within(section()).getByText("0.0")).toBeInTheDocument();
  });
});

describe("MatchupModelAnalysis product boundary", () => {
  const banned = [
    /best bet/i,
    /value bet/i,
    /strong edge/i,
    /confidence/i,
    /kelly/i,
    /expected value/i,
    /units?\b/i,
    /lock/i,
    /win probability/i,
  ];

  it("renders no betting recommendation of any kind", () => {
    renderSection();
    // The closing disclaimer is excluded on purpose: it names the things this
    // section does not offer, so matching it would flag the very sentence that
    // guarantees their absence.
    const paragraphs = [...section().querySelectorAll("p")];
    const disclaimer = paragraphs[paragraphs.length - 1]?.textContent ?? "";
    const text = (section().textContent ?? "").replace(disclaimer, "");
    for (const pattern of banned) {
      expect(text).not.toMatch(pattern);
    }
  });

  it("says the model uses no market input and has not beaten the market", () => {
    renderSection();
    const text = section().textContent ?? "";
    expect(text).toMatch(/no sportsbook line/i);
    expect(text).toMatch(/not shown this model beating the market/i);
  });
});

describe("MatchupModelAnalysis unavailable states", () => {
  it("says so while loading rather than showing a placeholder number", () => {
    renderSection({ loading: true, projection: null });
    expect(screen.getByText(/loading the jkb projected spread/i)).toBeInTheDocument();
  });

  it("estimates nothing when the artifact is missing", () => {
    renderSection({ projection: null, error: "Projection data unavailable (404)." });
    expect(screen.getByText(/no figure is estimated/i)).toBeInTheDocument();
  });

  it("estimates nothing when this matchup has no projection", () => {
    renderSection({ projection: null });
    expect(screen.getByText(/unavailable for this matchup/i)).toBeInTheDocument();
  });
});
