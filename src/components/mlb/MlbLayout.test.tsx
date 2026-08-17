import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import MlbLayout from "@/components/mlb/MlbLayout";
import { getMlbNavIconColorClass, MLB_NAV_ITEMS } from "@/lib/mlb/sectionNav";

/** Some nav labels (e.g. "HR +EV") contain regex-special characters -- escape before building a match RegExp so `+` etc. are treated literally instead of as quantifiers. */
function labelPattern(label: string): RegExp {
  return new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

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

  it("renders a PLUS EV sidebar section with HR +EV and Pitcher K +EV links", () => {
    renderMlbRoute("/mlb");
    const nav = screen.getByRole("navigation", { name: "MLB sitemap" });
    expect(within(nav).getByText("Plus EV")).toBeInTheDocument();
    const hrPlusEv = within(nav).getByRole("link", { name: labelPattern("HR +EV") });
    expect(hrPlusEv).toHaveAttribute("href", "/mlb/hr-props?view=ev");
    const kPlusEv = within(nav).getByRole("link", { name: labelPattern("Pitcher K +EV") });
    expect(kPlusEv).toHaveAttribute("href", "/mlb/strikeout-props?view=ev");
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
      expect(within(nav).queryByRole("link", { name: labelPattern(item.label) })?.getAttribute("aria-current")).toBeFalsy();
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

  // Explicit timeout: this test now walks MLB_NAV_ITEMS twice (desktop +
  // mobile drawer) across 15 items including the new Plus EV section, which
  // pushed it close to/over the 5000ms default on slower machines.
  it("desktop sidebar and mobile drawer render the identical destination set", { timeout: 15000 }, () => {
    renderMlbRoute("/mlb");
    // Only the desktop instance is mounted before the Sheet opens.
    for (const item of MLB_NAV_ITEMS) {
      expect(screen.getByRole("link", { name: labelPattern(item.label) })).toBeTruthy();
    }

    fireEvent.click(screen.getByRole("button", { name: /MLB Menu/i }));
    const dialog = screen.getByRole("dialog");
    for (const item of MLB_NAV_ITEMS) {
      expect(within(dialog).getByRole("link", { name: labelPattern(item.label) })).toBeTruthy();
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
    ["/mlb/strikeout-props", "max-w-[1720px]"],
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
      const link = within(nav).getByRole("link", { name: labelPattern(item.label) });
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

describe("MLB Mobile Menu — accessibility & affordance", () => {
  it("shows 'Tap to expand' helper text when closed", () => {
    renderMlbRoute("/mlb");
    const trigger = screen.getByRole("button", { name: /MLB Menu/i });
    expect(within(trigger).getByText("Tap to expand")).toBeTruthy();
  });

  it("switches helper text to 'Tap to collapse' once opened", () => {
    renderMlbRoute("/mlb");
    const trigger = screen.getByRole("button", { name: /MLB Menu/i });
    fireEvent.click(trigger);
    expect(within(trigger).getByText("Tap to collapse")).toBeTruthy();
    expect(within(trigger).queryByText("Tap to expand")).toBeNull();
  });

  it("toggles aria-expanded from false to true across open/close", () => {
    renderMlbRoute("/mlb");
    const trigger = screen.getByRole("button", { name: /MLB Menu/i });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("wires aria-controls on the trigger to the id of the opened dialog panel", () => {
    renderMlbRoute("/mlb");
    const trigger = screen.getByRole("button", { name: /MLB Menu/i });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog");
    expect(trigger.getAttribute("aria-controls")).toBe(dialog.id);
  });

  it("applies the brand-blue border and tinted background treatment", () => {
    renderMlbRoute("/mlb");
    const trigger = screen.getByRole("button", { name: /MLB Menu/i });
    expect(trigger.className).toMatch(/border-\[#1a2b4b\]/);
    expect(trigger.className).toMatch(/bg-\[#eff4ff\]/);
  });
});
