import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MatchupUnitBattles from "@/components/nfl/matchups/MatchupUnitBattles";
import { unavailableMetricResolver } from "@/lib/nfl/matchupMetrics";
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
  week: 1, away: AWAY, home: HOME, spread: null,
} as unknown as NflMatchup;

function renderBattles() {
  return render(
    <MemoryRouter>
      <MatchupUnitBattles matchup={MATCHUP} resolver={unavailableMetricResolver} />
    </MemoryRouter>
  );
}

describe("MatchupUnitLever (NE OFFENSE / SEA OFFENSE toggle)", () => {
  it("labels both sides as OFFENSE rather than BALL", () => {
    renderBattles();
    expect(screen.getByRole("tab", { name: "NE Offense" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "SEA Offense" })).toBeInTheDocument();
  });

  it("defaults to the away team's offense selected", () => {
    renderBattles();
    expect(screen.getByRole("tab", { name: "NE Offense" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "SEA Offense" })).toHaveAttribute("aria-selected", "false");
  });

  it("switches the active side when the other team's tab is activated", () => {
    renderBattles();
    fireEvent.click(screen.getByRole("tab", { name: "SEA Offense" }));
    expect(screen.getByRole("tab", { name: "SEA Offense" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "NE Offense" })).toHaveAttribute("aria-selected", "false");
  });
});
