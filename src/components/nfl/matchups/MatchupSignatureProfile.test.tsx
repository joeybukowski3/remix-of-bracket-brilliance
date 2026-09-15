import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MatchupSignatureProfile from "@/components/nfl/matchups/MatchupSignatureProfile";
import type { MatchupVisualMetric } from "@/lib/nfl/matchupVisualizationModel";
import type { NflMatchupTeam } from "@/lib/nfl/matchups";

const AWAY = { slug: "away-club", abbr: "awy", teamName: "Away Club" } as NflMatchupTeam;
const HOME = { slug: "home-club", abbr: "hme", teamName: "Home Club" } as NflMatchupTeam;

const METRICS: MatchupVisualMetric[] = [
  {
    id: "off.epaPerPlay",
    label: "EPA / Play",
    shortLabel: "EPA / Play",
    categoryId: "offense",
    comparison: "away",
    leader: "away",
    isChartEligible: true,
    away: { value: 0.2, rank: 1, formatted: "+0.20", percentile: 0 },
    home: { value: -0.1, rank: 19, formatted: "-0.10", percentile: 18 / 31 },
    rankGap: 18,
  },
  {
    id: "off.successRate",
    label: "Success Rate",
    shortLabel: "Success Rate",
    categoryId: "offense",
    comparison: "missing",
    leader: "none",
    isChartEligible: true,
    away: { value: 0.51, rank: 5, formatted: "51.0%", percentile: 4 / 31 },
    home: { value: null, rank: null, formatted: "N/A", percentile: null },
    rankGap: null,
  },
];

describe("MatchupSignatureProfile", () => {
  it("renders labelled rank tiers, team markers, and an internal minimum-width plot", () => {
    const { container } = render(
      <MatchupSignatureProfile
        metrics={METRICS}
        away={AWAY}
        home={HOME}
        awayColor="#031635"
        homeColor="#006778"
      />
    );

    expect(screen.getByRole("heading", { name: "Signature Profile" })).toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute("width", "250");
    expect(container.querySelectorAll(".matchup-signature-profile__tier-band")).toHaveLength(4);
    expect(screen.getByText("Top 8")).toBeInTheDocument();
    expect(screen.getByText("Bottom 8")).toBeInTheDocument();
    expect(container.querySelectorAll(".matchup-signature-profile__missing-marker")).toHaveLength(1);
    expect(container.querySelector(".matchup-signature-profile__annotation text")).toHaveTextContent("AWY +18");
  });

  it("keeps click detail in document flow with the production metric values", () => {
    render(
      <MatchupSignatureProfile
        metrics={METRICS}
        away={AWAY}
        home={HOME}
        awayColor="#031635"
        homeColor="#006778"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /EPA \/ Play: Away Club \+0\.20/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Rank 1 of 32");
    expect(screen.getByRole("status")).toHaveTextContent("Rank differential: 18 spots");
  });
});
