import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import MlbLayout from "@/components/mlb/MlbLayout";
import { getMlbNavIconColorClass, MLB_NAV_ITEMS } from "@/lib/mlb/sectionNav";

vi.mock("@/components/layout/SiteShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div data-testid="site-shell">{children}</div>,
}));

function renderMlbRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/mlb" element={<MlbLayout />}>
          <Route index element={<h1>MLB Hub Page</h1>} />
          <Route path="hr-props" element={<h1>HR Props Page</h1>} />
          <Route path="strikeout-props" element={<h1>Strikeout Props Page</h1>} />
          <Route path="batter-vs-pitcher" element={<h1>Batter vs Pitcher Page</h1>} />
          <Route path="power-rankings" element={<h1>Power Rankings Page</h1>} />
          <Route path="props" element={<h1>Props Hub Page</h1>} />
          <Route path="sin-city" element={<h1>Sin City Page</h1>} />
          <Route path="numerology" element={<h1>Numerology Page</h1>} />
        </Route>
        <Route path="/nfl" element={<h1>NFL Page</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("MlbLayout", () => {
  it.each([
    ["/mlb", "MLB Hub Page"],
    ["/mlb/hr-props", "HR Props Page"],
    ["/mlb/strikeout-props", "Strikeout Props Page"],
    ["/mlb/batter-vs-pitcher", "Batter vs Pitcher Page"],
    ["/mlb/power-rankings", "Power Rankings Page"],
    ["/mlb/props", "Props Hub Page"],
    ["/mlb/sin-city", "Sin City Page"],
    ["/mlb/numerology", "Numerology Page"],
  ])("renders the shared MLB sidebar on %s", (path, heading) => {
    renderMlbRoute(path);
    expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "MLB sitemap" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /MLB Menu/i })).toBeTruthy();
  });

  it("renders exactly one nav sidebar instance per route (no duplication)", () => {
    renderMlbRoute("/mlb/hr-props");
    expect(screen.getAllByRole("navigation", { name: "MLB sitemap" }).length).toBe(1);
  });

  it("does not render the MLB sidebar on non-MLB routes", () => {
    renderMlbRoute("/nfl");
    expect(screen.getByRole("heading", { name: "NFL Page" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "MLB sitemap" })).toBeNull();
  });

  it("highlights HR Props as the active item on /mlb/hr-props", () => {
    renderMlbRoute("/mlb/hr-props");
    const nav = screen.getByRole("navigation", { name: "MLB sitemap" });
    expect(within(nav).getByRole("link", { name: /HR Props/i }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("link", { name: /Strikeout Props/i }).getAttribute("aria-current")).toBeNull();
  });

  it("highlights Strikeout Props as the active item on /mlb/strikeout-props", () => {
    renderMlbRoute("/mlb/strikeout-props");
    const nav = screen.getByRole("navigation", { name: "MLB sitemap" });
    expect(within(nav).getByRole("link", { name: /Strikeout Props/i }).getAttribute("aria-current")).toBe("page");
  });

  it("highlights Batter vs Pitcher as the active item on /mlb/batter-vs-pitcher", () => {
    renderMlbRoute("/mlb/batter-vs-pitcher");
    const nav = screen.getByRole("navigation", { name: "MLB sitemap" });
    expect(within(nav).getByRole("link", { name: /Batter vs Pitcher/i }).getAttribute("aria-current")).toBe("page");
  });

  it("highlights Props Hub as the active item on /mlb/props", () => {
    renderMlbRoute("/mlb/props");
    const nav = screen.getByRole("navigation", { name: "MLB sitemap" });
    expect(within(nav).getByRole("link", { name: /Props Hub/i }).getAttribute("aria-current")).toBe("page");
  });

  it("does not mark any nav item active on the plain /mlb home state", () => {
    renderMlbRoute("/mlb");
    const nav = screen.getByRole("navigation", { name: "MLB sitemap" });
    for (const item of MLB_NAV_ITEMS) {
      expect(within(nav).queryByRole("link", { name: new RegExp(item.label, "i") })?.getAttribute("aria-current")).toBeFalsy();
    }
  });

  it("highlights Game Matchups (parent item) for a nested game-detail hash route", () => {
    renderMlbRoute("/mlb#game-716463");
    const nav = screen.getByRole("navigation", { name: "MLB sitemap" });
    expect(within(nav).getByRole("link", { name: /Game Matchups/i }).getAttribute("aria-current")).toBe("page");
  });

  it("highlights Game Matchups for the #schedule anchor too", () => {
    renderMlbRoute("/mlb#schedule");
    const nav = screen.getByRole("navigation", { name: "MLB sitemap" });
    expect(within(nav).getByRole("link", { name: /Game Matchups/i }).getAttribute("aria-current")).toBe("page");
  });

  it("desktop sidebar and mobile drawer render the identical destination set", () => {
    renderMlbRoute("/mlb");
    // Only the desktop instance is mounted before the Sheet opens.
    for (const item of MLB_NAV_ITEMS) {
      expect(screen.getByRole("link", { name: new RegExp(item.label, "i") })).toBeTruthy();
    }

    fireEvent.click(screen.getByRole("button", { name: /MLB Menu/i }));
    const dialog = screen.getByRole("dialog");
    for (const item of MLB_NAV_ITEMS) {
      expect(within(dialog).getByRole("link", { name: new RegExp(item.label, "i") })).toBeTruthy();
    }
  });

  it("mobile drawer closes after navigating to a destination", () => {
    renderMlbRoute("/mlb");
    fireEvent.click(screen.getByRole("button", { name: /MLB Menu/i }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("link", { name: /HR Props/i }));
    expect(screen.getByRole("heading", { name: "HR Props Page" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each([
    ["/mlb", "max-w-[1720px]"],
    ["/mlb/props", "max-w-[1720px]"],
    ["/mlb/hr-props", "max-w-[1720px]"],
    ["/mlb/numerology", "max-w-[1720px]"],
    ["/mlb/strikeout-props", "max-w-[1440px]"],
    ["/mlb/batter-vs-pitcher", "max-w-[1440px]"],
    ["/mlb/power-rankings", "max-w-[1440px]"],
    ["/mlb/sin-city", "max-w-[1440px]"],
  ])("applies the expected contentWidth container class on %s", (path, expectedClass) => {
    renderMlbRoute(path);
    const nav = screen.getByRole("navigation", { name: "MLB sitemap" });
    // The grid container is the sidebar's grandparent (aside -> grid row).
    const gridContainer = nav.closest("aside")?.parentElement;
    expect(gridContainer?.className).toContain(expectedClass);
  });

  it.each([["/mlb"], ["/mlb/power-rankings"]])(
    "the sidebar stays the same fixed width regardless of the contentWidth variant (%s)",
    (path) => {
      renderMlbRoute(path);
      const aside = screen.getByRole("navigation", { name: "MLB sitemap" }).closest("aside");
      expect(aside?.className).toContain("w-56");
    }
  );

  it("renders the reused MLB logo in the sidebar header", () => {
    renderMlbRoute("/mlb");
    const logos = screen.getAllByRole("img", { name: "MLB" });
    expect(logos.length).toBeGreaterThan(0);
    for (const logo of logos) {
      expect(logo.getAttribute("src")).toBe("/logos/mlb.svg");
    }
  });

  it("includes the sportsbook partner block and does not reintroduce the removed Prop Optimizer CTA", () => {
    renderMlbRoute("/mlb");
    expect(screen.getByText("Bet with our partners")).toBeTruthy();
    for (const book of ["DraftKings", "FanDuel", "Fanatics", "BetMGM", "Caesars"]) {
      expect(screen.getAllByText(book).length).toBeGreaterThan(0);
    }
    expect(screen.queryByRole("link", { name: /Prop Optimizer/i })).toBeNull();
  });

  it("renders every sidebar icon with its coordinated color class, so the sidebar is not visually monochrome", () => {
    renderMlbRoute("/mlb");
    const nav = screen.getByRole("navigation", { name: "MLB sitemap" });
    for (const item of MLB_NAV_ITEMS) {
      const link = within(nav).getByRole("link", { name: new RegExp(item.label, "i") });
      const icon = link.querySelector("svg");
      expect(icon).toBeTruthy();
      expect(icon?.getAttribute("class")).toContain(getMlbNavIconColorClass(item.icon));
    }
  });

  it("Moneyline Edges points at the ML Edges social-table anchor, not the older #moneylines panel", () => {
    renderMlbRoute("/mlb");
    const nav = screen.getByRole("navigation", { name: "MLB sitemap" });
    const link = within(nav).getByRole("link", { name: /Moneyline Edges/i });
    expect(link.getAttribute("href")).toBe("/mlb#ml-edges-social");
  });
});
