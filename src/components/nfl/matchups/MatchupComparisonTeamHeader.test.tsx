import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MatchupComparisonTeamHeader from "./MatchupComparisonTeamHeader";
import type { NflMatchup } from "@/lib/nfl/matchups";

const matchup = {
  away: { slug: "away", abbr: "ne", teamName: "New England" },
  home: { slug: "home", abbr: "sea", teamName: "Seattle" },
} as NflMatchup;

describe("MatchupComparisonTeamHeader", () => {
  it("renders both team abbreviations and full names", () => {
    render(<MatchupComparisonTeamHeader matchup={matchup} />);
    expect(screen.getByText("NE")).toBeTruthy();
    expect(screen.getByText("SEA")).toBeTruthy();
    expect(screen.getByText("New England")).toBeTruthy();
    expect(screen.getByText("Seattle")).toBeTruthy();
  });

  it("renders a labelled crest for each side", () => {
    render(<MatchupComparisonTeamHeader matchup={matchup} />);
    expect(screen.getByRole("img", { name: "New England (away)" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Seattle (home)" })).toBeTruthy();
  });
});
