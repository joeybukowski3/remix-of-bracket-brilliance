import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import NflPlatformLayout from "@/components/nfl/NflPlatformLayout";

vi.mock("@/components/layout/SiteShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div data-testid="site-shell">{children}</div>,
}));

function renderNflRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/nfl" element={<NflPlatformLayout />}>
          <Route index element={<h1>Power Ratings Page</h1>} />
          <Route path="standings" element={<h1>Standings Page</h1>} />
          <Route path="schedule" element={<h1>Schedule Page</h1>} />
          <Route path="super-bowl" element={<h1>Super Bowl Page</h1>} />
          <Route path="coach-of-year" element={<h1>Coach Page</h1>} />
          <Route path="guide" element={<h1>Guide Page</h1>} />
          <Route path="guide/regression" element={<h1>Regression Page</h1>} />
          <Route path="guide/team/:teamSlug" element={<h1>Team Page</h1>} />
        </Route>
        <Route path="/mlb" element={<h1>MLB Page</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("NflPlatformLayout", () => {
  it.each([
    ["/nfl", "Power Ratings Page"],
    ["/nfl/standings", "Standings Page"],
    ["/nfl/schedule", "Schedule Page"],
    ["/nfl/super-bowl", "Super Bowl Page"],
    ["/nfl/coach-of-year", "Coach Page"],
    ["/nfl/guide", "Guide Page"],
    ["/nfl/guide/regression", "Regression Page"],
  ])("renders the shared NFL sidebar on %s", (path, heading) => {
    renderNflRoute(path);
    expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "NFL sitemap" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /NFL Menu/i })).toBeTruthy();
    expect(screen.queryByText("Explore the NFL section")).toBeNull();
  });

  it("opens the active route category automatically and marks the active link", () => {
    renderNflRoute("/nfl/guide/regression");
    expect(screen.getByRole("button", { name: /Team Intelligence/i }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: /Fluke or Real/i }).getAttribute("aria-current")).toBe("page");
  });

  it("highlights the team guide area for team detail routes", () => {
    renderNflRoute("/nfl/guide/team/seattle-seahawks");
    expect(screen.getByRole("button", { name: /Team Intelligence/i }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: /2026 Team Guide/i }).getAttribute("aria-current")).toBe("page");
  });

  it("lets categories expand and collapse", () => {
    renderNflRoute("/nfl/standings");
    const season = screen.getByRole("button", { name: /Season/i });
    expect(season.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(season);
    expect(season.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(season);
    expect(season.getAttribute("aria-expanded")).toBe("true");
  });

  it("does not render the NFL sidebar on non-NFL routes", () => {
    renderNflRoute("/mlb");
    expect(screen.getByRole("heading", { name: "MLB Page" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "NFL sitemap" })).toBeNull();
  });
});
