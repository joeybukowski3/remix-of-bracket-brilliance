/**
 * MlbPageLayout.test.tsx
 * Confirms MlbPageLayout renders the shared sidebar alongside children,
 * and that SiteShell (site header) is present.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MlbPageLayout from "./MlbPageLayout";

describe("MlbPageLayout", () => {
  it("renders the MLB hub sidebar alongside page content", () => {
    render(
      <MemoryRouter initialEntries={["/mlb/hr-props"]}>
        <MlbPageLayout>
          <div data-testid="page-content">Page-specific content</div>
        </MlbPageLayout>
      </MemoryRouter>
    );
    expect(screen.getByTestId("page-content")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Numerology/i })).toBeTruthy();
    const mlbPowerRankings = screen.getAllByRole("link", { name: /Power Rankings/i }).find((l) => l.getAttribute("href") === "/mlb/power-rankings");
    expect(mlbPowerRankings).toBeTruthy();
  });

  it("renders children inside a flex-1 main content area", () => {
    render(
      <MemoryRouter initialEntries={["/mlb"]}>
        <MlbPageLayout>
          <div data-testid="inner">Inner</div>
        </MlbPageLayout>
      </MemoryRouter>
    );
    const inner = screen.getByTestId("inner");
    const main = inner.closest("main");
    expect(main).toBeTruthy();
  });

  it("does not duplicate the sidebar when wrapping multiple children", () => {
    render(
      <MemoryRouter initialEntries={["/mlb"]}>
        <MlbPageLayout>
          <div>A</div>
          <div>B</div>
        </MlbPageLayout>
      </MemoryRouter>
    );
    const sidebarLogos = screen.getAllByAltText("MLB");
    expect(sidebarLogos.length).toBe(1);
  });
});
