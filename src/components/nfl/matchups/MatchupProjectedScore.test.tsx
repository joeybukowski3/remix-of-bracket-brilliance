import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MatchupProjectedScore from "@/components/nfl/matchups/MatchupProjectedScore";
import type { MarketCurrentGame } from "@/lib/nfl/marketData";
import type { TeamTotalProjection } from "@/lib/nfl/totalsProjectionData";

function totalProjection(overrides: Partial<TeamTotalProjection> = {}): TeamTotalProjection {
  return {
    gameId: "2026_01_NE_SEA",
    season: 2026,
    week: 1,
    kickoffUtc: "2026-09-10T00:20:00.000Z",
    homeTeam: "sea",
    awayTeam: "ne",
    homeExpectedPoints: 22.1,
    awayExpectedPoints: 24.9,
    projectedGameTotal: 48.5,
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
    total: 48.5,
    rawSpreadLine: -3.5,
    ...overrides,
  };
}

function renderCard(props: Partial<React.ComponentProps<typeof MatchupProjectedScore>> = {}) {
  return render(
    <MatchupProjectedScore totalProjection={totalProjection()} market={market()} loading={false} {...props} />
  );
}

describe("MatchupProjectedScore", () => {
  it("labels the card JKB Projected Total and shows the combined total", () => {
    renderCard();
    expect(screen.getByText("JKB Projected Total")).toBeInTheDocument();
    expect(screen.getAllByText("48.5").length).toBeGreaterThanOrEqual(1);
  });

  it("never renders individual team projected scores", () => {
    renderCard({
      totalProjection: totalProjection({ homeExpectedPoints: 22.1, awayExpectedPoints: 24.9, projectedGameTotal: 47.0 }),
    });
    expect(screen.queryByText("22.1")).not.toBeInTheDocument();
    expect(screen.queryByText("24.9")).not.toBeInTheDocument();
    expect(screen.queryByText("NE")).not.toBeInTheDocument();
    expect(screen.queryByText("SEA")).not.toBeInTheDocument();
  });

  it("shows the market total", () => {
    renderCard({ market: market({ total: 47.5 }) });
    expect(screen.getByText("Market Total")).toBeInTheDocument();
    expect(screen.getByText("47.5")).toBeInTheDocument();
  });

  it("computes Slight Lean Over: JKB 48.9 vs market 48.5 => Slight Lean Over +0.4", () => {
    renderCard({ totalProjection: totalProjection({ projectedGameTotal: 48.9 }), market: market({ total: 48.5 }) });
    expect(screen.getByText("+0.4")).toBeInTheDocument();
    expect(screen.getByText("Slight Lean Over")).toBeInTheDocument();
  });

  it("computes Slight Lean Under: JKB 48.1 vs market 48.5 => Slight Lean Under -0.4", () => {
    renderCard({ totalProjection: totalProjection({ projectedGameTotal: 48.1 }), market: market({ total: 48.5 }) });
    expect(screen.getByText("−0.4")).toBeInTheDocument();
    expect(screen.getByText("Slight Lean Under")).toBeInTheDocument();
  });

  it("computes Moderate Lean Over: JKB 50.0 vs market 48.5 => Moderate Lean Over +1.5", () => {
    renderCard({ totalProjection: totalProjection({ projectedGameTotal: 50.0 }), market: market({ total: 48.5 }) });
    expect(screen.getByText("+1.5")).toBeInTheDocument();
    expect(screen.getByText("Moderate Lean Over")).toBeInTheDocument();
  });

  it("computes Moderate Lean Under: JKB 46.0 vs market 48.5 => Moderate Lean Under -2.5", () => {
    renderCard({ totalProjection: totalProjection({ projectedGameTotal: 46.0 }), market: market({ total: 48.5 }) });
    expect(screen.getByText("−2.5")).toBeInTheDocument();
    expect(screen.getByText("Moderate Lean Under")).toBeInTheDocument();
  });

  it("computes Strong Lean Over: JKB 51.1 vs market 48.5 => Strong Lean Over +2.6", () => {
    renderCard({ totalProjection: totalProjection({ projectedGameTotal: 51.1 }), market: market({ total: 48.5 }) });
    expect(screen.getByText("+2.6")).toBeInTheDocument();
    const indicator = screen.getByText("Strong Lean Over");
    expect(indicator).toBeInTheDocument();
    expect(indicator.className).toContain("emerald-700");
    expect(indicator.className).toContain("text-white");
  });

  it("computes Strong Lean Under: JKB 45.8 vs market 48.5 => Strong Lean Under -2.7", () => {
    renderCard({ totalProjection: totalProjection({ projectedGameTotal: 45.8 }), market: market({ total: 48.5 }) });
    expect(screen.getByText("−2.7")).toBeInTheDocument();
    const indicator = screen.getByText("Strong Lean Under");
    expect(indicator).toBeInTheDocument();
    expect(indicator.className).toContain("rose-700");
    expect(indicator.className).toContain("text-white");
  });

  it("uses progressively stronger shades for Slight vs Moderate Over, with the full label always visible", () => {
    const { rerender } = renderCard({
      totalProjection: totalProjection({ projectedGameTotal: 48.9 }),
      market: market({ total: 48.5 }),
    });
    expect(screen.getByText("Slight Lean Over").className).toContain("emerald-50");
    rerender(
      <MatchupProjectedScore
        totalProjection={totalProjection({ projectedGameTotal: 50.0 })}
        market={market({ total: 48.5 })}
        loading={false}
      />
    );
    expect(screen.getByText("Moderate Lean Over").className).toContain("emerald-100");
  });

  it("computes EVEN: JKB 48.5 vs market 48.5 => EVEN 0.0", () => {
    renderCard({ totalProjection: totalProjection({ projectedGameTotal: 48.5 }), market: market({ total: 48.5 }) });
    expect(screen.getByText("0.0")).toBeInTheDocument();
    expect(screen.getByText("EVEN")).toBeInTheDocument();
  });

  it("shows N/A for market total, difference and indicator when there is no market total, but still shows the JKB total", () => {
    renderCard({ market: market({ total: null }) });
    expect(screen.getByText("48.5")).toBeInTheDocument();
    const naValues = screen.getAllByText("N/A");
    expect(naValues.length).toBe(3); // Market Total, Difference, Indicator
  });

  it("never labels the comparison a bet, pick, edge, EV, confidence or recommendation", () => {
    renderCard();
    const text = document.body.textContent?.toLowerCase() ?? "";
    for (const banned of ["bet", "pick", "edge", "+ev", "confidence", "recommendation"]) {
      expect(text).not.toContain(banned);
    }
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
      expect(screen.getByText("JKB Projected Total")).toBeInTheDocument();
    });
  });
});
