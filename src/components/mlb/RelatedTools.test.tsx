import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RelatedTools from "./RelatedTools";

function renderRelatedTools(currentToolId: Parameters<typeof RelatedTools>[0]["currentToolId"]) {
  return render(
    <MemoryRouter>
      <RelatedTools currentToolId={currentToolId} />
    </MemoryRouter>,
  );
}

const BANNED_TERMS = ["K Props", "Hit Props", "Prop Optimizer"];

describe("RelatedTools", () => {
  it("renders exactly six related links for HR Props", () => {
    renderRelatedTools("hr-props");
    const nav = screen.getByRole("navigation", { name: "Related MLB tools" });
    expect(within(nav).getAllByRole("link")).toHaveLength(6);
  });

  it("renders exactly six related links for Strikeout Props", () => {
    renderRelatedTools("strikeout-props");
    const nav = screen.getByRole("navigation", { name: "Related MLB tools" });
    expect(within(nav).getAllByRole("link")).toHaveLength(6);
  });

  it("renders exactly six related links for Batter vs Pitcher", () => {
    renderRelatedTools("batter-vs-pitcher");
    const nav = screen.getByRole("navigation", { name: "Related MLB tools" });
    expect(within(nav).getAllByRole("link")).toHaveLength(6);
  });

  it("never links back to the current page (HR Props)", () => {
    renderRelatedTools("hr-props");
    const nav = screen.getByRole("navigation", { name: "Related MLB tools" });
    expect(within(nav).queryByRole("link", { name: "HR Props" })).toBeNull();
  });

  it("never links back to the current page (Strikeout Props)", () => {
    renderRelatedTools("strikeout-props");
    const nav = screen.getByRole("navigation", { name: "Related MLB tools" });
    expect(within(nav).queryByRole("link", { name: "Strikeout Props" })).toBeNull();
  });

  it("never links back to the current page (Batter vs Pitcher)", () => {
    renderRelatedTools("batter-vs-pitcher");
    const nav = screen.getByRole("navigation", { name: "Related MLB tools" });
    expect(within(nav).queryByRole("link", { name: "Batter vs Pitcher" })).toBeNull();
  });

  it("never renders Numerology for any of the three migrated tools", () => {
    for (const toolId of ["hr-props", "strikeout-props", "batter-vs-pitcher"] as const) {
      const { unmount } = renderRelatedTools(toolId);
      const nav = screen.getByRole("navigation", { name: "Related MLB tools" });
      expect(within(nav).queryByRole("link", { name: "Numerology" })).toBeNull();
      unmount();
    }
  });

  it("uses canonical names and routes for HR Props' related tools, preserving registry order", () => {
    renderRelatedTools("hr-props");
    const nav = screen.getByRole("navigation", { name: "Related MLB tools" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Game Matchups",
      "Strikeout Props",
      "Batter vs Pitcher",
      "Props Hub",
      "Power Rankings",
      "Sin City",
    ]);
    expect(within(nav).getByRole("link", { name: "Game Matchups" })).toHaveAttribute("href", "/mlb");
    expect(within(nav).getByRole("link", { name: "Strikeout Props" })).toHaveAttribute("href", "/mlb/strikeout-props");
    expect(within(nav).getByRole("link", { name: "Batter vs Pitcher" })).toHaveAttribute("href", "/mlb/batter-vs-pitcher");
    expect(within(nav).getByRole("link", { name: "Props Hub" })).toHaveAttribute("href", "/mlb/props");
    expect(within(nav).getByRole("link", { name: "Power Rankings" })).toHaveAttribute("href", "/mlb/power-rankings");
    expect(within(nav).getByRole("link", { name: "Sin City" })).toHaveAttribute("href", "/mlb/sin-city");
  });

  it("uses canonical names and routes for Strikeout Props' related tools, preserving registry order", () => {
    renderRelatedTools("strikeout-props");
    const nav = screen.getByRole("navigation", { name: "Related MLB tools" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Game Matchups",
      "HR Props",
      "Batter vs Pitcher",
      "Props Hub",
      "Power Rankings",
      "Sin City",
    ]);
  });

  it("uses canonical names and routes for Batter vs Pitcher's related tools, preserving registry order", () => {
    renderRelatedTools("batter-vs-pitcher");
    const nav = screen.getByRole("navigation", { name: "Related MLB tools" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Game Matchups",
      "HR Props",
      "Strikeout Props",
      "Props Hub",
      "Power Rankings",
      "Sin City",
    ]);
  });

  it("renders a semantic navigation landmark labeled 'Related MLB tools'", () => {
    renderRelatedTools("hr-props");
    expect(screen.getByRole("navigation", { name: "Related MLB tools" })).toBeTruthy();
  });

  it("renders a visible heading connected to the section", () => {
    renderRelatedTools("hr-props");
    expect(screen.getByRole("heading", { name: "More MLB tools" })).toBeTruthy();
  });

  it("accepts a custom heading via the heading prop", () => {
    render(
      <MemoryRouter>
        <RelatedTools currentToolId="hr-props" heading="Explore more tools" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Explore more tools" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "More MLB tools" })).toBeNull();
  });

  it("renders nothing for a tool with no curated relationships yet", () => {
    const { container } = renderRelatedTools("power-rankings");
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("navigation", { name: "Related MLB tools" })).toBeNull();
  });

  it("renders nothing for game-matchups, sin-city, and numerology (uncurated)", () => {
    for (const toolId of ["game-matchups", "sin-city", "numerology"] as const) {
      const { container, unmount } = renderRelatedTools(toolId);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it("does not render any banned terminology", () => {
    for (const toolId of ["hr-props", "strikeout-props", "batter-vs-pitcher"] as const) {
      const { container, unmount } = renderRelatedTools(toolId);
      for (const banned of BANNED_TERMS) {
        expect(container.textContent).not.toContain(banned);
      }
      unmount();
    }
  });

  it("applies a custom className to the wrapping section when provided", () => {
    const { container } = render(
      <MemoryRouter>
        <RelatedTools currentToolId="hr-props" className="my-custom-class" />
      </MemoryRouter>,
    );
    expect(container.querySelector("section.my-custom-class")).toBeTruthy();
  });
});
