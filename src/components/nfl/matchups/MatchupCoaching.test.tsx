/**
 * Coaching Rating v1 on the matchup analyzer. It sits in the comparison tab
 * beside the other context sections and reads the current-season ratings
 * artifact through the same shared contract the Performance Center uses.
 */
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import MatchupCoaching from "@/components/nfl/matchups/MatchupCoaching";
import type { CoachingRatingsArtifact } from "@/lib/nfl/coachingRatingsView";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";
import type { NflGuideTeamNormalized } from "@/lib/nfl/guideData";

function makeTeam(o: Partial<NflGuideTeamNormalized>): NflMatchupTeam {
  return {
    slug: "t", abbr: "tt", teamName: "Team", division: "AFC East", conference: "AFC", color: "#000",
    projectedWins: 8.5, marketWinTotal: 8.5, modelVsMarketGap: 0, recommendationLabel: "Pass",
    confidenceLabel: "Low", regressionGap: 0, regressionSignal: "Neutral", powerRank: 16,
    offenseRank: 16, defenseRank: 16, scheduleRank: 16, scheduleLabel: "Average", record2025: "8-9",
    overallPct: 0, offensePct: 0, defensePct: 0, headline: "", editorialSummary: "",
    strengths: [], concerns: [], keyQuestions: [], ...o,
  };
}

const MATCHUP: NflMatchup = {
  slug: "san-francisco-49ers-at-los-angeles-rams",
  gameId: "2026_01_SF_LAR",
  season: 2026,
  week: 1,
  seasonType: "REG",
  kickoffUtc: "2026-09-13T20:05:00Z",
  stadium: "SoFi Stadium",
  away: makeTeam({ slug: "san-francisco-49ers", abbr: "sf", teamName: "San Francisco 49ers", conference: "NFC" }),
  home: makeTeam({ slug: "los-angeles-rams", abbr: "lar", teamName: "Los Angeles Rams", conference: "NFC" }),
  neutralSite: false,
  spread: null,
};

const ARTIFACT: CoachingRatingsArtifact = {
  ratingVersion: "coaching-v1.0.0",
  sourceCutoff: "completed games through 2025 season",
  _meta: { generatedAt: "2026-09-06T15:38:21.304Z" },
  coaches: [
    {
      coach_id: "sean-mcvay", coach: "Sean McVay", team: "lar", coaching_rating: 59,
      career_wl: "102-63", career_ats: "89-72-4", last17_ats: "9-8", tenure_year: 9,
      small_sample: false, first_year: false, interim: false,
    },
    {
      coach_id: "kyle-shanahan", coach: "Kyle Shanahan", team: "sf", coaching_rating: 51,
      career_wl: "91-72", career_ats: "83-79-1", last17_ats: "8-9", tenure_year: 10,
      small_sample: false, first_year: false, interim: false,
    },
  ],
};

describe("MatchupCoaching", () => {
  it("renders as a labelled comparison section with both coaches", () => {
    render(<MatchupCoaching matchup={MATCHUP} artifact={ARTIFACT} />);
    const section = screen.getByRole("region", { name: "Coaching" });
    expect(within(section).getByText("Sean McVay")).toBeInTheDocument();
    expect(within(section).getByText("Kyle Shanahan")).toBeInTheDocument();
    expect(screen.getByTestId("nfl-coaching-advantage")).toHaveTextContent("LAR +8");
  });

  it("states that the rating is context, not a model input", () => {
    render(<MatchupCoaching matchup={MATCHUP} artifact={ARTIFACT} />);
    expect(
      screen.getByText(/not an input to the JKB spread or total/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId("nfl-coaching-ats-note")).toBeInTheDocument();
  });

  it("degrades to the unavailable state when the artifact did not load", () => {
    render(<MatchupCoaching matchup={MATCHUP} artifact={null} />);
    expect(screen.getByText("Coaching context unavailable")).toBeInTheDocument();
  });

  it("shows a loading placeholder without rendering a fabricated rating", () => {
    render(<MatchupCoaching matchup={MATCHUP} artifact={null} loading />);
    expect(screen.getByText("Loading coaching context…")).toBeInTheDocument();
    expect(screen.queryByTestId("nfl-coaching-home")).not.toBeInTheDocument();
  });
});
