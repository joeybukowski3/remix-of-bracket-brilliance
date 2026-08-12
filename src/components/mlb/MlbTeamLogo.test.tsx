import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MlbTeamLogo from "./MlbTeamLogo";

describe("MlbTeamLogo", () => {
  it("renders the Diamondbacks logo image for the AZ abbreviation used in generated data", () => {
    render(<MlbTeamLogo team="AZ" size={32} />);
    const img = screen.getByRole("img", { name: "AZ logo" });
    expect(img).toHaveAttribute("src", "/logos/mlb/ari.svg");
    expect(img).toHaveStyle({ width: "32px", height: "32px" });
  });

  it("renders the Diamondbacks logo image for the ARI abbreviation", () => {
    render(<MlbTeamLogo team="ARI" size={32} />);
    const img = screen.getByRole("img", { name: "ARI logo" });
    expect(img).toHaveAttribute("src", "/logos/mlb/ari.svg");
  });

  it("renders a working logo image for another representative team", () => {
    render(<MlbTeamLogo team="NYY" size={32} />);
    const img = screen.getByRole("img", { name: "NYY logo" });
    expect(img.getAttribute("src")).toContain("nyy.png");
  });

  it("falls back to an initials badge (not a broken-image icon) for an unresolvable team", () => {
    render(<MlbTeamLogo team="ZZZ" size={32} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("ZZ")).toBeInTheDocument();
  });

  it("preserves layout dimensions in the fallback badge", () => {
    render(<MlbTeamLogo team="ZZZ" size={40} />);
    const badge = screen.getByText("ZZ");
    expect(badge).toHaveStyle({ width: "40px", height: "40px" });
  });
});
