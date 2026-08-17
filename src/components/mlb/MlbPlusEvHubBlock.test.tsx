import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MlbPlusEvHubBlock from "@/components/mlb/MlbPlusEvHubBlock";

describe("MlbPlusEvHubBlock", () => {
  it("renders the +EV Props feature block with HR +EV and Pitcher K +EV CTAs", () => {
    render(
      <MemoryRouter>
        <MlbPlusEvHubBlock />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "+EV Props" })).toBeInTheDocument();
    expect(screen.getByText(/Compare JKB fair prices with sportsbook odds/i)).toBeInTheDocument();

    const hrCta = screen.getByRole("link", { name: "HR +EV" });
    expect(hrCta).toHaveAttribute("href", "/mlb/hr-props?view=ev");

    const kCta = screen.getByRole("link", { name: "Pitcher K +EV" });
    expect(kCta).toHaveAttribute("href", "/mlb/strikeout-props?view=ev");
  });
});
