import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SiteFooter from "@/components/layout/SiteFooter";
import SeoFooterBlock from "@/components/SeoFooterBlock";

describe("Batter vs Pitcher terminology on shared footer surfaces", () => {
  it("SiteFooter labels the /mlb/batter-vs-pitcher link 'Batter vs Pitcher Model' and never 'Hit Props'", () => {
    render(
      <MemoryRouter>
        <SiteFooter />
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", { name: "Batter vs Pitcher Model" });
    expect(link).toHaveAttribute("href", "/mlb/batter-vs-pitcher");
    expect(screen.queryByText(/Hit Props/i)).toBeNull();
  });

  it("SeoFooterBlock labels the /mlb/batter-vs-pitcher link 'Batter vs Pitcher' and never 'Hit Props'", () => {
    render(
      <MemoryRouter>
        <SeoFooterBlock />
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", { name: "Batter vs Pitcher" });
    expect(link).toHaveAttribute("href", "/mlb/batter-vs-pitcher");
    expect(screen.queryByText(/Hit Props/i)).toBeNull();
  });
});
