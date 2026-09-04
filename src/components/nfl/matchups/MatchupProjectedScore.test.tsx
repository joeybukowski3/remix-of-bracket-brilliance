import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MatchupProjectedScore from "@/components/nfl/matchups/MatchupProjectedScore";
import type { MarketCurrentGame } from "@/lib/nfl/marketData";
import type { NflMatchup } from "@/lib/nfl/matchups";
import type { TeamTotalProjection } from "@/lib/nfl/totalsProjectionData";

const team = (abbr: string, teamName: string, slug: string) => ({
  abbr,
  teamName,
  slug,
  division: "AFC East",
  conference: "AFC",
  powerRank: 5,
  overallPct: 6.8,
});

const MATCHUP = {
  gameId: "2026_01_NE_SEA",
  slug: "new-england-patriots-at-seattle-seahawks",
  week: 1,
  season: 2026,
  kickoffUtc: "2026-09-10T00:20:00.000Z",
  stadium: "Lumen Field",
  spread: null,
  away: team("ne", "New England Patriots", "new-england-patriots"),
  home: team("sea", "Seattle Seahawks", "seattle-seahawks"),
} as unknown as NflMatchup;

function totalProjection(overrides: Partial<TeamTotalProjection> = {}): TeamTotalProjection {
  return {
    gameId: "2026_01_NE_SEA",
    season: 2026,
    week: 1,
    kickoffUtc: "2026-09-10T00:20:00.000Z",
    homeTeam: "sea",
    awayTeam: "ne",
    homeExpectedPoints: 22.122430036037450,
    awayExpectedPoints: 24.875959106783746,
    projectedGameTotal: 46.998389142821196,
    modelVersion: "jkb-nfl-total-ridge-v1.0.0",
    predictionTimestamp: "2026-09-04T17:58:46.030Z",
    status: "projected",
    ...overrides,
  };
}

function market(overrides: Partial<MarketCurrentGame> = {}): MarketCurrentGame {
  return {
    gameId: "2026_01_NE_SEA",
    season: 2026,
    week: 1,
    seasonType: "REG",
    homeAbbr: "sea",
    awayAbbr: "ne",
    neutralSite: false,
    spread: { home: -3.5, away: 3.5 },
    moneyline: { home: -198, away: 164 },
    total: 44.5,
    rawSpreadLine: -3.5,
    ...overrides,
  };
}

function renderCard(props: Partial<React.ComponentProps<typeof MatchupProjectedScore>> = {}) {
  return render(
    <MemoryRouter>
      <MatchupProjectedScore
        matchup={MATCHUP}
        totalProjection={totalProjection()}
        market={market()}
        loading={false}
        {...props}
      />
    </MemoryRouter>
  );
}

describe("MatchupProjectedScore", () => {
  it("labels the card as a JKB projection", () => {
    renderCard();
    expect(screen.getByText("JKB Projected Score")).toBeInTheDocument();
  });

  it("shows each team's expected points to one decimal place", () => {
    renderCard();
    expect(screen.getByText("24.9")).toBeInTheDocument(); // away (NE)
    expect(screen.getByText("22.1")).toBeInTheDocument(); // home (SEA)
  });

  it("shows both team abbreviations prominently, not only the combined total", () => {
    renderCard();
    expect(screen.getByText("NE")).toBeInTheDocument();
    expect(screen.getByText("SEA")).toBeInTheDocument();
  });

  it("shows the JKB projected game total to one decimal place, clearly labelled", () => {
    renderCard();
    expect(screen.getByText("JKB Projected Total")).toBeInTheDocument();
    expect(screen.getAllByText("47.0").length).toBeGreaterThanOrEqual(1);
  });

  it("never implies the figures are Vegas implied team totals", () => {
    renderCard();
    expect(screen.getByText(/not a vegas implied team total/i)).toBeInTheDocument();
  });

  describe("Vegas comparison", () => {
    it("shows Vegas Total, JKB Total and JKB Difference when a market total exists", () => {
      renderCard();
      expect(screen.getByText("Vegas Total")).toBeInTheDocument();
      expect(screen.getByText("44.5")).toBeInTheDocument();
      expect(screen.getByText("JKB Total")).toBeInTheDocument();
      expect(screen.getByText("JKB Difference")).toBeInTheDocument();
    });

    it("signs a positive difference and adds an OVER LEAN label past the threshold", () => {
      renderCard({ market: market({ total: 44.5 }) }); // 47.0 - 44.5 = +2.5
      expect(screen.getByText(/\+2\.5/)).toBeInTheDocument();
      expect(screen.getByText(/OVER LEAN/)).toBeInTheDocument();
    });

    it("signs a negative difference and adds an UNDER LEAN label past the threshold", () => {
      renderCard({
        totalProjection: totalProjection({ projectedGameTotal: 40, homeExpectedPoints: 20, awayExpectedPoints: 20 }),
        market: market({ total: 44.5 }),
      });
      expect(screen.getByText(/−4\.5/)).toBeInTheDocument();
      expect(screen.getByText(/UNDER LEAN/)).toBeInTheDocument();
    });

    it("never labels the comparison +EV, edge, confidence or probability", () => {
      renderCard();
      const text = document.body.textContent?.toLowerCase() ?? "";
      for (const banned of ["+ev", "edge %", "confidence", "probability"]) {
        expect(text).not.toContain(banned);
      }
    });

    it("hides the comparison entirely when there is no Vegas total", () => {
      renderCard({ market: market({ total: null }) });
      expect(screen.queryByText("Vegas Total")).not.toBeInTheDocument();
      expect(screen.queryByText("JKB Difference")).not.toBeInTheDocument();
    });

    it("hides the comparison entirely when there is no market at all", () => {
      renderCard({ market: null });
      expect(screen.queryByText("Vegas Total")).not.toBeInTheDocument();
    });
  });

  describe("missing/unavailable JKB projection", () => {
    it("shows a neutral unavailable message rather than a fabricated 0.0", () => {
      renderCard({ totalProjection: null, loading: false });
      expect(screen.getByText("JKB projection unavailable")).toBeInTheDocument();
      expect(screen.queryByText("0.0")).not.toBeInTheDocument();
    });

    it("shows a loading message rather than an unavailable message while loading", () => {
      renderCard({ totalProjection: null, loading: true });
      expect(screen.getByText(/loading jkb projection/i)).toBeInTheDocument();
      expect(screen.queryByText("JKB projection unavailable")).not.toBeInTheDocument();
    });

    it("still labels the card even when the projection is unavailable", () => {
      renderCard({ totalProjection: null });
      expect(screen.getByText("JKB Projected Score")).toBeInTheDocument();
    });
  });
});
