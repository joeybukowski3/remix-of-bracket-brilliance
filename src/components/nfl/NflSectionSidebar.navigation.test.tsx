import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import NflPlatformLayout from "@/components/nfl/NflPlatformLayout";
import { NFL_SECTION_NAV_ITEMS } from "@/lib/nfl/sectionNav";

vi.mock("@/components/layout/SiteShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/nfl" element={<NflPlatformLayout />}>
          <Route index element={<h1>Weekly Command Center</h1>} />
          <Route path="power-ratings" element={<h1>Power Ratings</h1>} />
          <Route path="standings" element={<h1>Standings</h1>} />
          <Route path="guide" element={<h1>Guide</h1>} />
          <Route path="guide/team/:teamSlug" element={<h1>Team</h1>} />
        </Route>
        <Route path="/fantasy-football" element={<h1>Fantasy</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("NFL navigation architecture", () => {
  it("renders exactly one navigation component for the section", () => {
    renderAt("/nfl/standings");
    // Desktop rail and mobile drawer trigger — one sitemap, two entry points.
    expect(screen.getAllByRole("navigation", { name: "NFL sitemap" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Open NFL menu/i })).toBeTruthy();
  });

  it("names the current destination on the mobile menu trigger", () => {
    renderAt("/nfl/standings");
    const trigger = screen.getByRole("button", { name: /Open NFL menu/i });
    expect(within(trigger).getByText("Standings by Division")).toBeTruthy();
  });

  it("names the team guide on a team detail route", () => {
    renderAt("/nfl/guide/team/seattle-seahawks");
    const trigger = screen.getByRole("button", { name: /Open NFL menu/i });
    expect(within(trigger).getByText("2026 Team Guide")).toBeTruthy();
  });

  it("marks the active destination with aria-current, not colour alone", () => {
    renderAt("/nfl/standings");
    const nav = screen.getByRole("navigation", { name: "NFL sitemap" });
    const active = within(nav).getByRole("link", { name: /Standings by Division/i });
    expect(active.getAttribute("aria-current")).toBe("page");
  });

  it("keeps Power Ratings directly accessible at its dedicated route", () => {
    renderAt("/nfl/power-ratings");
    expect(screen.getByRole("heading", { name: "Power Ratings" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Power Ratings/i }).getAttribute("aria-current")).toBe("page");
  });

  it("opens the mobile drawer and closes it after navigating", () => {
    renderAt("/nfl");
    fireEvent.click(screen.getByRole("button", { name: /Open NFL menu/i }));

    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("link", { name: /Standings by Division/i }));

    expect(screen.getByRole("heading", { name: "Standings" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers Fantasy Football from the NFL sitemap", () => {
    renderAt("/nfl");
    const nav = screen.getByRole("navigation", { name: "NFL sitemap" });
    expect(within(nav).getByRole("link", { name: /Fantasy Football/i }).getAttribute("href")).toBe("/fantasy-football");
  });

  it("introduces no dead navigation links", () => {
    renderAt("/nfl");
    const nav = screen.getByRole("navigation", { name: "NFL sitemap" });
    const hrefs = Array.from(nav.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    const declared = new Set(NFL_SECTION_NAV_ITEMS.map((item) => item.to));
    expect(hrefs.length).toBe(NFL_SECTION_NAV_ITEMS.length);
    for (const href of hrefs) {
      expect(declared.has(href ?? ""), `undeclared nav target: ${href}`).toBe(true);
    }
  });

  it("keeps every category header a keyboard-operable button", () => {
    renderAt("/nfl");
    const nav = screen.getByRole("navigation", { name: "NFL sitemap" });
    const buttons = within(nav).getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button.getAttribute("aria-expanded")).toBeTruthy();
      expect(button.getAttribute("aria-controls")).toBeTruthy();
      button.focus();
      expect(document.activeElement).toBe(button);
    }
  });
});
