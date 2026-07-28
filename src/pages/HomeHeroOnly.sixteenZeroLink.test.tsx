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
    </MemoryRouter>
  );
}

describe("HomeHeroOnly 16-0 tile", () => {
  it("links to /16-0 for internal, client-side navigation", () => {
    renderHome();
    const link = screen.getByRole("link", { name: /play 16-0 fantasy draft/i });
    expect(link.getAttribute("href")).toBe("/16-0");
  });

  it("does not render a duplicate 16-0 tile", () => {
    renderHome();
    expect(screen.getAllByRole("link", { name: /play 16-0 fantasy draft/i })).toHaveLength(1);
  });

  it("still renders the existing NFL league tile alongside the new tile", () => {
    renderHome();
    const links = screen.getAllByRole("link");
    const nflTile = links.find((link) => link.getAttribute("href") === "/nfl/guide");
    expect(nflTile).toBeTruthy();
  });
});
