import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CFB_RATING_TIERS } from "@/lib/cfb/ratingPresentation";
import CollegeFootballRatingLegend from "./CollegeFootballRatingLegend";

describe("CollegeFootballRatingLegend", () => {
  it("renders all shared rating tiers and the SOS direction key", () => {
    render(<CollegeFootballRatingLegend />);
    const legend = screen.getByLabelText("College Football rating color key");
    expect(legend.firstElementChild).toHaveClass("flex-wrap");

    for (const tier of CFB_RATING_TIERS) {
      expect(screen.getByText(tier.label, { exact: false })).toHaveClass(...tier.className.split(" "));
    }
    expect(screen.getByText("#1 Hardest")).toBeInTheDocument();
    expect(screen.getByText("#138 Easiest")).toBeInTheDocument();
  });
});
