import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MatchupComparisonTeamHeader from "./MatchupComparisonTeamHeader";
import type { NflMatchup } from "@/lib/nfl/matchups";

const matchup = {
  away: { slug: "away", abbr: "ne", teamName: "New England" },
  home: { slug: "home", abbr: "sea", teamName: "Seattle" },
} as NflMatchup;

describe("MatchupComparisonTeamHeader", () => {
  it("renders the Overview team identity in away/home order", () => {
    const { container } = render(<MatchupComparisonTeamHeader matchup={matchup} />);
    const text = container.textContent ?? "";
    expect(text.indexOf("NE")).toBeLessThan(text.indexOf("SEA"));
    expect(screen.getByText("New England")).toBeTruthy();
    expect(screen.getByText("Seattle")).toBeTruthy();
    expect(screen.getByRole("img", { name: "New England (away)" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Seattle (home)" })).toBeTruthy();
  });

  it("adds possession roles without changing the compact structure", () => {
    const { container } = render(
      <MatchupComparisonTeamHeader
        matchup={matchup}
        unit={{ away: "Offense", home: "Defense" }}
        possession="New England has the ball"
      />
    );
    expect(container.querySelector(".matchup-comparison-card__team-header")).toBeTruthy();
    expect(screen.getByText("NE Off")).toBeTruthy();
    expect(screen.getByText("SEA Def")).toBeTruthy();
    expect(screen.getByText("Attacking")).toBeTruthy();
    expect(screen.getByText("Defending")).toBeTruthy();
    expect(screen.getByText("New England has the ball")).toBeTruthy();
  });

  it("reverses roles without swapping team order", () => {
    const { container } = render(
      <MatchupComparisonTeamHeader matchup={matchup} unit={{ away: "Defense", home: "Offense" }} />
    );
    const text = container.textContent ?? "";
    expect(text.indexOf("NE Def")).toBeLessThan(text.indexOf("SEA Off"));
  });
});
