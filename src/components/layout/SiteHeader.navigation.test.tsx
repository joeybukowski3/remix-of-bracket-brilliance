import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import SiteHeader from "./SiteHeader";

const EXPECTED_ITEMS = ["Home", "MLB", "NCAA Football", "NFL", "NBA", "PGA"];

function renderHeader() {
  return render(
    <MemoryRouter initialEntries={["/pga"]}>
      <SiteHeader />
    </MemoryRouter>,
  );
}

describe("SiteHeader navigation", () => {
  it("no longer offers the expired The Open 2026 item", () => {
    renderHeader();

    expect(screen.queryByText("The Open 2026")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /The Open 2026/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps PGA in the navigation", () => {
    renderHeader();

    const pgaLinks = screen.getAllByRole("link", { name: "PGA" });
    expect(pgaLinks.length).toBeGreaterThan(0);
    expect(pgaLinks[0]).toHaveAttribute("href", "/pga");
  });

  it("preserves the remaining primary navigation items", () => {
    const { container } = renderHeader();

    EXPECTED_ITEMS.forEach((label) => {
      expect(within(container).getAllByRole("link", { name: label }).length).toBeGreaterThan(0);
    });
  });

  it("does not link anywhere to the expired Open route from the header", () => {
    const { container } = renderHeader();

    const openLinks = Array.from(container.querySelectorAll("a")).filter((link) =>
      link.getAttribute("href")?.includes("the-open-2026-picks-best-bets-odds"),
    );
    expect(openLinks).toHaveLength(0);
  });
});
