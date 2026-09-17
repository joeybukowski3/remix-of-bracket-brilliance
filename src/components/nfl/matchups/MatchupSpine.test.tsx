import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MatchupSpine from "@/components/nfl/matchups/MatchupSpine";
import type { MatchupDisplayMetric } from "@/components/nfl/matchups/matchupDisplayMetrics";
import type { NflMatchup } from "@/lib/nfl/matchups";

const MATCHUP = {
  slug: "away-club-at-home-club",
  away: { slug: "away-club", abbr: "awy", teamName: "Away Club", color: "#031635" },
  home: { slug: "home-club", abbr: "hme", teamName: "Home Club", color: "#006778" },
} as NflMatchup;

const POWER_RATING: MatchupDisplayMetric = {
  key: "team.overallRating",
  label: "JKB Power Rating",
  shortLabel: "Power Rating",
  direction: "higher-is-better",
  comparison: "away",
  away: { value: 79.2, rank: 2, formatted: "79.2" },
  home: { value: 60.1, rank: 18, formatted: "60.1" },
};

describe("MatchupSpine", () => {
  it("renders production ranks and values on a centered bilateral rail", () => {
    const { container } = render(
      <MatchupSpine matchup={MATCHUP} categoryMetrics={{ overall: [POWER_RATING] }} />
    );

    expect(screen.getByRole("heading", { name: "The Spine" })).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
    expect(screen.getByText("79.2")).toBeInTheDocument();
    expect(screen.getByText("AWAY +16")).toBeInTheDocument();
    expect(container.querySelectorAll(".matchup-spine__track-half")).toHaveLength(2);
    expect(container.querySelector(".matchup-spine__pivot")).toBeInTheDocument();
    expect(container.querySelector(".matchup-spine__fill.is-away")).toHaveStyle({ width: "96.7741935483871%" });
  });
});
