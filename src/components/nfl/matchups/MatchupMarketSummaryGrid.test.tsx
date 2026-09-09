import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MatchupMarketSummaryGrid from "@/components/nfl/matchups/MatchupMarketSummaryGrid";
import type { MarketCurrentGame } from "@/lib/nfl/marketData";
import type { NflGuideTeamNormalized } from "@/lib/nfl/guideData";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";
import type { GameProjection } from "@/lib/nfl/projectionData";
import type { TeamTotalProjection } from "@/lib/nfl/totalsProjectionData";

function makeTeam(overrides: Partial<NflGuideTeamNormalized>): NflMatchupTeam {
  return {
    slug: "team-a", abbr: "ne", teamName: "New England Patriots", division: "AFC East", conference: "AFC",
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
  season: 2026,
  week: 1,
  seasonType: "REG",
  kickoffUtc: "2026-09-13T20:05:00Z",
  stadium: "Test Field",
  away: AWAY,
  home: HOME,
  neutralSite: false,
  spread: null,
};

function market(overrides: Partial<MarketCurrentGame> = {}): MarketCurrentGame {
  return {
    gameId: "2026_01_NE_SEA", season: 2026, week: 1, seasonType: "REG",
    homeAbbr: "sea", awayAbbr: "ne", neutralSite: false,
    spread: { home: -3.5, away: 3.5 },
    moneyline: { home: -198, away: 164 },
    total: 44.5,
    rawSpreadLine: -3.5,
    ...overrides,
  };
}

function projection(overrides: Partial<GameProjection> = {}): GameProjection {
  return {
    gameId: "2026_01_NE_SEA",
    week: 1,
    kickoff: "2026-09-13T20:05:00Z",
    awayTeam: "ne",
    homeTeam: "sea",
    homeCurrentOVR: 55.65,
    awayCurrentOVR: 44.35,
    leagueAverageOVR: 50,
    homePowerNumber: 1.356,
    awayPowerNumber: -1.356,
    neutralSite: false,
    homeFieldAdvantage: 2,
    neutralProjectedMargin: 2.7,
    projectedHomeMargin: 3.8,
    formattedJkbSpread: "SEA −3.8",
    ...overrides,
  };
}

function totalProjection(overrides: Partial<TeamTotalProjection> = {}): TeamTotalProjection {
  return {
    gameId: "2026_01_NE_SEA",
    season: 2026,
    week: 1,
    kickoffUtc: "2026-09-13T20:05:00Z",
    homeTeam: "sea",
    awayTeam: "ne",
    homeExpectedPoints: 24.9,
    awayExpectedPoints: 24.0,
    projectedGameTotal: 48.9,
    modelVersion: "jkb-nfl-total-ridge-v1.0.0",
    predictionTimestamp: "2026-09-04T17:58:46.030Z",
    status: "projected",
    ...overrides,
  };
}

describe("MatchupMarketSummaryGrid", () => {
  it("renders spread, total and moneyline as one aligned grid with market and JKB values", () => {
    render(
      <MatchupMarketSummaryGrid
        matchup={MATCHUP}
        market={market()}
        projection={projection()}
        totalProjection={totalProjection()}
      />
    );
    expect(screen.getByText("Spread")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("Moneyline")).toBeInTheDocument();
    expect(screen.getByText("SEA −3.5")).toBeInTheDocument();
    expect(screen.getByText("SEA −3.8")).toBeInTheDocument();
    expect(screen.getByText("44.5")).toBeInTheDocument();
    expect(screen.getByText("48.9")).toBeInTheDocument();
  });

  it("shows a positive spread difference with a plus sign", () => {
    render(
      <MatchupMarketSummaryGrid
        matchup={MATCHUP}
        market={market()}
        projection={projection({ projectedHomeMargin: 3.8 })}
        totalProjection={totalProjection()}
      />
    );
    // market home margin is 3.5 (SEA -3.5 -> home margin +3.5), model home margin 3.8 -> diff +0.3
    expect(screen.getByText("+0.3")).toBeInTheDocument();
  });

  it("shows a negative total difference in red-toned styling", () => {
    render(
      <MatchupMarketSummaryGrid
        matchup={MATCHUP}
        market={market({ total: 48.5 })}
        projection={projection()}
        totalProjection={totalProjection({ projectedGameTotal: 46.0 })}
      />
    );
    const diff = screen.getByText("−2.5");
    expect(diff.className).toContain("matchup-market-col__diff--negative");
  });

  it("shows the strong-lean indicator compactly beneath the total difference", () => {
    render(
      <MatchupMarketSummaryGrid
        matchup={MATCHUP}
        market={market({ total: 48.5 })}
        projection={projection()}
        totalProjection={totalProjection({ projectedGameTotal: 51.1 })}
      />
    );
    expect(screen.getByText("Strong Lean Over")).toBeInTheDocument();
  });

  it("shows the JKB ML Pick as the team favoured by the JKB projected spread, with its crest", () => {
    render(
      <MatchupMarketSummaryGrid
        matchup={MATCHUP}
        market={market()}
        projection={projection({ projectedHomeMargin: 3.8 })}
        totalProjection={totalProjection()}
      />
    );
    expect(screen.getByText("JKB ML Pick")).toBeInTheDocument();
    // SEA is home and the model favours the home team (positive home margin).
    expect(screen.getByText("SEA")).toBeInTheDocument();
  });

  it("never implies a separate ML prediction model", () => {
    render(
      <MatchupMarketSummaryGrid
        matchup={MATCHUP}
        market={market()}
        projection={projection()}
        totalProjection={totalProjection()}
      />
    );
    const text = document.body.textContent?.toLowerCase() ?? "";
    expect(text).not.toContain("moneyline model");
    expect(text).not.toContain("win probability");
  });

  it("removes the standalone projected-total detail card content in favor of the unified grid", () => {
    render(
      <MatchupMarketSummaryGrid
        matchup={MATCHUP}
        market={market()}
        projection={projection()}
        totalProjection={totalProjection()}
      />
    );
    expect(screen.queryByText("JKB Projected Total")).not.toBeInTheDocument();
    expect(screen.queryByText("Market Total")).not.toBeInTheDocument();
  });

  it("shows N/A market values and an explanatory note when nothing is priced, without hiding JKB figures", () => {
    render(
      <MatchupMarketSummaryGrid
        matchup={MATCHUP}
        market={null}
        projection={projection()}
        totalProjection={totalProjection()}
      />
    );
    expect(screen.getByText(/No market line published for this game yet/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing is estimated in their place/)).toBeInTheDocument();
  });
});
