import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import HomeHeroOnly from "@/pages/HomeHeroOnly";

vi.mock("@/components/layout/SiteShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/usePageSeo", () => ({
  usePageSeo: vi.fn(),
  CANONICAL_BASE: "https://example.com",
}));

function renderHome() {
  return render(
    <MemoryRouter>
      <HomeHeroOnly />
    </MemoryRouter>,
  );
}

describe("HomeHeroOnly league grid", () => {
  it("does not render a World Cup tile", () => {
    renderHome();
    expect(screen.queryByText("World Cup")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /world cup/i })).not.toBeInTheDocument();
  });

  it("keeps MLB, College Football, NFL, NBA, and PGA tiles in the same logical order", () => {
    renderHome();
    const heading = screen.getByRole("heading", { name: "Select a League" });
    const grid = heading.nextElementSibling as HTMLElement;
    const cardNames = Array.from(grid.children).map((card) =>
      card.querySelector("img")?.getAttribute("alt")?.replace(" logo", ""),
    );
    expect(cardNames).toEqual(["MLB", "College Football", "NFL", "NBA", "PGA"]);
  });

  it("links College Football to /college-football", () => {
    renderHome();
    const link = screen.getAllByRole("link").find((node) => node.getAttribute("href") === "/college-football");
    expect(link).toBeTruthy();
  });

  it("still links the NFL tile to its route", () => {
    renderHome();
    const link = screen.getAllByRole("link").find((node) => node.getAttribute("href") === "/nfl/guide");
    expect(link).toBeTruthy();
  });

  it("renders the 16-0 promo exactly once, linking to /16-0", () => {
    renderHome();
    const links = screen.getAllByRole("link", { name: /play 16-0 fantasy draft/i });
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("/16-0");
  });
});
