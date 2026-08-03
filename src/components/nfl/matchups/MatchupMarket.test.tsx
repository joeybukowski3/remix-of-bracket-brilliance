import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MatchupMarketProfile from "@/components/nfl/matchups/MatchupMarketProfile";
import MatchupCurrentMarket from "@/components/nfl/matchups/MatchupCurrentMarket";
import { createMarketResolver, type MarketArtifact, type MarketCurrentGame } from "@/lib/nfl/marketData";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";
import type { NflGuideTeamNormalized } from "@/lib/nfl/guideData";

function makeTeam(overrides: Partial<NflGuideTeamNormalized>): NflMatchupTeam {
  return {
    slug: "team-a", abbr: "taa", teamName: "Team A", division: "AFC East", conference: "AFC",
    color: "#000000", projectedWins: 8.5, marketWinTotal: 8.5, modelVsMarketGap: 0,
    recommendationLabel: "Pass", confidenceLabel: "Low", regressionGap: 0,
    regressionSignal: "Neutral", powerRank: 16, offenseRank: 16, defenseRank: 16,
    scheduleRank: 16, scheduleLabel: "Average", record2025: "8-9", overallPct: 0,
    offensePct: 0, defensePct: 0, headline: "", editorialSummary: "",
    strengths: [], concerns: [], keyQuestions: [],
    ...overrides,
  };
}

const AWAY = makeTeam({ slug: "new-england-patriots", abbr: "ne", teamName: "New England Patriots" });
const HOME = makeTeam({ slug: "seattle-seahawks", abbr: "sea", teamName: "Seattle Seahawks" });

const MATCHUP: NflMatchup = {
  gameId: "2026_01_NE_SEA",
  slug: "new-england-patriots-at-seattle-seahawks",
  week: 1,
  away: AWAY,
  home: HOME,
  spread: null,
} as unknown as NflMatchup;

function market(overrides: Partial<MarketCurrentGame> = {}): MarketCurrentGame {
  return {
    gameId: "2026_01_NE_SEA", season: 2026, week: 1, seasonType: "REG",
    homeAbbr: "sea", awayAbbr: "ne", neutralSite: false,
    spread: { home: -3.5, away: 3.5 },
    moneyline: { home: -198, away: 164 },
    total: 44.5,
    rawSpreadLine: 3.5,
    ...overrides,
  };
}

function renderCurrent(m: MarketCurrentGame | null) {
  return render(
    <MemoryRouter>
      <MatchupCurrentMarket matchup={MATCHUP} market={m} />
    </MemoryRouter>
  );
}

const SLUGS = new Map([
  ["new-england-patriots", "ne"],
  ["seattle-seahawks", "sea"],
]);

function profile(overrides: Record<string, unknown> = {}) {
  return {
    games: 17, gameIds: [],
    record: { W: 12, L: 5, T: 0 },
    pointDifferential: 11.24,
    ats: { W: 12, L: 5, P: 0 },
    atsDifferential: 6.91,
    overUnder: { O: 9, U: 8, P: 0 },
    homeAts: { W: 4, L: 4, P: 0 },
    awayAts: { W: 8, L: 1, P: 0 },
    homeAtsDifferential: 5.1,
    awayAtsDifferential: 8.4,
    homeGames: 8, awayGames: 9, neutralGames: 0,
    favoriteAts: { W: 10, L: 4, P: 0 },
    underdogAts: { W: 2, L: 1, P: 0 },
    favoriteGames: 14, underdogGames: 3, pickemGames: 0,
    ranks: { atsDifferential: 1, pointDifferential: 1 },
    ...overrides,
  };
}

const ARTIFACT = {
  schemaVersion: "nfl-matchup-market-v1",
  attribution: "Market data: nflverse / nfldata",
  currentSeason: 2026, priorSeason: 2025,
  completedGames: { "2025": { ne: 17, sea: 17 }, "2026": { ne: 0, sea: 0 } },
  periods: {
    "2025-season": { season: 2025, lastN: null, teams: { ne: profile({ ats: { W: 12, L: 5, P: 0 } }), sea: profile() } },
    "2025-last8": { season: 2025, lastN: 8, teams: { ne: profile({ games: 8, ats: { W: 6, L: 2, P: 0 } }), sea: profile({ games: 8, ats: { W: 5, L: 3, P: 0 } }) } },
    "2026-season": { season: 2026, lastN: null, teams: {} },
    "2026-last5": { season: 2026, lastN: 5, teams: {} },
  },
  currentMarket: { "2026_01_NE_SEA": market() },
  provenance: {},
} as unknown as MarketArtifact;

function renderProfile(periods: ("2025-season" | "2025-last8")[] = ["2025-season", "2025-last8"]) {
  const resolvers = Object.fromEntries(
    periods.map((p) => [p, createMarketResolver(ARTIFACT, SLUGS, p)])
  );
  return render(
    <MemoryRouter>
      <MatchupMarketProfile
        matchup={MATCHUP}
        market={{ periods, resolvers, current: market(), note: "Test note." }}
      />
    </MemoryRouter>
  );
}

describe("current market", () => {
  it("shows both sides with the correct orientation", () => {
    renderCurrent(market());
    const section = screen.getByRole("region", { name: /current market/i });
    // SEA is home and favoured: -3.5 with a negative moneyline.
    expect(within(section).getByText("SEA")).toBeTruthy();
    expect(within(section).getByText("−3.5")).toBeTruthy();
    expect(within(section).getByText("−198")).toBeTruthy();
    // NE is the away underdog: the plus sign must be visible.
    expect(within(section).getByText("NE")).toBeTruthy();
    expect(within(section).getByText("+3.5")).toBeTruthy();
    expect(within(section).getByText("+164")).toBeTruthy();
    expect(within(section).getByText("44.5")).toBeTruthy();
  });

  it("labels the source without naming a sportsbook", () => {
    renderCurrent(market());
    const section = screen.getByRole("region", { name: /current market/i });
    expect(within(section).getByText(/market line.*source: nflverse/i)).toBeTruthy();
    expect(section.textContent).not.toMatch(/draftkings|fanduel|betmgm|caesars|pinnacle/i);
    expect(section.textContent).not.toMatch(/consensus/i);
  });

  it("renders N/A for a missing moneyline while keeping spread and total", () => {
    renderCurrent(market({ moneyline: { home: null, away: null } }));
    const section = screen.getByRole("region", { name: /current market/i });
    expect(within(section).getAllByText("N/A")).toHaveLength(2);
    expect(within(section).getByText("−3.5")).toBeTruthy();
    expect(within(section).getByText("44.5")).toBeTruthy();
  });

  it("renders N/A for a missing spread without deriving one from the moneyline", () => {
    renderCurrent(market({ spread: { home: null, away: null }, rawSpreadLine: null }));
    const section = screen.getByRole("region", { name: /current market/i });
    expect(within(section).getAllByText("N/A")).toHaveLength(2);
    // The moneylines are still shown and were not converted into a spread.
    expect(within(section).getByText("−198")).toBeTruthy();
    expect(section.textContent).not.toContain("−3.5");
  });

  it("renders N/A for a missing total", () => {
    renderCurrent(market({ total: null }));
    const section = screen.getByRole("region", { name: /current market/i });
    expect(within(section).getByText("N/A")).toBeTruthy();
    expect(within(section).getByText("−3.5")).toBeTruthy();
  });

  it("states plainly when no market exists at all", () => {
    renderCurrent(
      market({ spread: { home: null, away: null }, moneyline: { home: null, away: null }, total: null, rawSpreadLine: null })
    );
    expect(screen.getByText(/no market line published for this game yet/i)).toBeTruthy();
  });

  it("handles a completely absent market object", () => {
    renderCurrent(null);
    expect(screen.getByText(/no market line published for this game yet/i)).toBeTruthy();
  });

  it("renders a pick'em as PK rather than a signed zero", () => {
    renderCurrent(market({ spread: { home: 0, away: 0 }, rawSpreadLine: 0 }));
    const section = screen.getByRole("region", { name: /current market/i });
    expect(within(section).getAllByText("PK")).toHaveLength(2);
    expect(section.textContent).not.toContain("+0");
  });
});

describe("team market profile", () => {
  it("separates the current market from the historical profile", () => {
    renderProfile();
    expect(screen.getByRole("region", { name: /current market/i })).toBeTruthy();
    expect(screen.getByText("Team Market Profile")).toBeTruthy();
  });

  it("renders ATS, O/U, home and away records with pushes visible", () => {
    renderProfile();
    expect(screen.getAllByText("12-5-0").length).toBeGreaterThan(0);
    expect(screen.getAllByText("9-8-0").length).toBeGreaterThan(0);
    expect(screen.getAllByText("4-4-0").length).toBeGreaterThan(0);
    expect(screen.getAllByText("8-1-0").length).toBeGreaterThan(0);
  });

  it("shows one line per visible period", () => {
    renderProfile(["2025-season", "2025-last8"]);
    expect(screen.getAllByText("2025 Season").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2025 Last 8").length).toBeGreaterThan(0);
    // Last 8 values appear alongside season values.
    expect(screen.getAllByText("6-2-0").length).toBeGreaterThan(0);
  });

  it("shows the ATS differential split as two values", () => {
    renderProfile();
    expect(screen.getAllByText(/\+5\.1 \/ \+8\.4/).length).toBeGreaterThan(0);
  });

  it("labels ATS metrics as the historical market spread, not a closing spread", () => {
    const { container } = renderProfile();
    expect(container.textContent).not.toMatch(/closing spread/i);
  });

  it("renders no projected line, edge, pick or probability", () => {
    const { container } = renderProfile();
    expect(container.textContent).not.toMatch(
      /projected spread|fair spread|model edge|win probability|recommendation|expected value/i
    );
    expect(screen.getByText(/descriptive only/i)).toBeTruthy();
  });

  it("falls back to a plain unavailable state with no periods", () => {
    render(
      <MemoryRouter>
        <MatchupMarketProfile matchup={MATCHUP} market={{ periods: [], resolvers: {}, current: null }} />
      </MemoryRouter>
    );
    expect(screen.getByText(/market profile not connected/i)).toBeTruthy();
  });

  it("renders without a market prop at all", () => {
    render(
      <MemoryRouter>
        <MatchupMarketProfile matchup={MATCHUP} />
      </MemoryRouter>
    );
    expect(screen.getByText(/market profile not connected/i)).toBeTruthy();
    expect(screen.getByText(/no market line published/i)).toBeTruthy();
  });

  it("keeps the Joe Knows Ball season block clearly separate", () => {
    renderProfile();
    expect(screen.getByText(/joe knows ball season context/i)).toBeTruthy();
    expect(screen.getByText(/describe the season, not this matchup/i)).toBeTruthy();
  });
});
