import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MatchupComparisonTeamHeader from "./MatchupComparisonTeamHeader";
import { nflTeamColor } from "@/lib/nfl/nflTeamColor";
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

  it("keeps the away side left and the home side right in the split header", () => {
    const { container } = render(<MatchupComparisonTeamHeader matchup={matchup} />);
    const sides = Array.from(container.querySelectorAll(".matchup-team-split__side"));
    expect(sides[0].className).toContain("matchup-team-split__side--away");
    expect(sides[1].className).toContain("matchup-team-split__side--home");
  });

  it("injects each team's canonical colour as the split-header tint variable", () => {
    const { container } = render(<MatchupComparisonTeamHeader matchup={matchup} />);
    const root = container.querySelector(".matchup-team-split") as HTMLElement;
    expect(root.style.getPropertyValue("--team-away")).toBe(nflTeamColor("ne"));
    expect(root.style.getPropertyValue("--team-home")).toBe(nflTeamColor("sea"));
  });

  it("defaults the sub-labels to Away / Home", () => {
    render(<MatchupComparisonTeamHeader matchup={matchup} />);
    expect(screen.getByText("Away")).toBeTruthy();
    expect(screen.getByText("Home")).toBeTruthy();
  });

  it("uses Attacking / Defending and the unit name when a possession is given", () => {
    render(
      <MatchupComparisonTeamHeader
        matchup={matchup}
        unit={{ away: "Offense", home: "Defense" }}
        possession="New England has the ball"
      />
    );
    expect(screen.getByText("New England Offense")).toBeTruthy();
    expect(screen.getByText("Seattle Defense")).toBeTruthy();
    expect(screen.getByText("Attacking")).toBeTruthy();
    expect(screen.getByText("Defending")).toBeTruthy();
    expect(screen.getByText("New England has the ball")).toBeTruthy();
  });

  it("reverses the roles for the other possession without swapping sides", () => {
    const { container } = render(
      <MatchupComparisonTeamHeader matchup={matchup} unit={{ away: "Defense", home: "Offense" }} />
    );
    const sides = Array.from(container.querySelectorAll(".matchup-team-split__side"));
    expect(sides[0].className).toContain("--away");
    expect(sides[0].textContent).toContain("New England Defense");
    expect(sides[1].textContent).toContain("Seattle Offense");
  });
});
