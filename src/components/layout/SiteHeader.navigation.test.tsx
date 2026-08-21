import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import SiteHeader from "./SiteHeader";

const EXPECTED_ITEMS = ["Home", "MLB", "College Football", "NFL", "Fantasy", "NBA", "PGA", "Support the Site"];

function renderHeader(path = "/pga") {
  return render(
    <MemoryRouter initialEntries={[path]}>
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

  it("points NFL navigation to the Weekly Command Center landing page", () => {
    renderHeader("/nfl");

    const nflLinks = screen.getAllByRole("link", { name: "NFL" });
    expect(nflLinks.length).toBeGreaterThan(0);
    expect(nflLinks.every((link) => link.getAttribute("href") === "/nfl")).toBe(true);
  });

  it("preserves the remaining primary navigation items", () => {
    const { container } = renderHeader();

    EXPECTED_ITEMS.forEach((label) => {
      expect(within(container).getAllByRole("link", { name: label }).length).toBeGreaterThan(0);
    });
  });

  it("keeps Support the Site visible in the desktop primary navigation", () => {
    const { container } = renderHeader();
    const desktopNavigation = container.querySelector("nav");

    expect(desktopNavigation).not.toBeNull();
    expect(within(desktopNavigation as HTMLElement).getByRole("link", { name: "Support the Site" })).toHaveAttribute(
      "href",
      "/support",
    );
  });

  it("includes Support the Site in the mobile navigation", () => {
    const { container } = renderHeader();

    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    const navigations = container.querySelectorAll("nav");
    const mobileNavigation = navigations[navigations.length - 1];

    expect(within(mobileNavigation).getByRole("link", { name: "Support the Site" })).toHaveAttribute(
      "href",
      "/support",
    );
  });

  it("uses the existing active-link treatment on the support route", () => {
    renderHeader("/support");

    expect(screen.getByRole("link", { name: "Support the Site" })).toHaveClass("bg-[#f0f0f0]", "font-semibold");
  });

  it("does not link anywhere to the expired Open route from the header", () => {
    const { container } = renderHeader();

    const openLinks = Array.from(container.querySelectorAll("a")).filter((link) =>
      link.getAttribute("href")?.includes("the-open-2026-picks-best-bets-odds"),
    );
    expect(openLinks).toHaveLength(0);
  });
});
