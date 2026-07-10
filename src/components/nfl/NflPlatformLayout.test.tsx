import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import NflPlatformLayout from "@/components/nfl/NflPlatformLayout";
import { NFL_SECTION_NAV_CATEGORIES } from "@/lib/nfl/sectionNav";

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
          <Route path="matchups" element={<h1>Matchups Page</h1>} />
          <Route path="matchups/:gameSlug" element={<h1>Matchup Detail Page</h1>} />
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

const CATEGORY_LABELS = NFL_SECTION_NAV_CATEGORIES.map((category) => category.label);

describe("NflPlatformLayout", () => {
  it.each([
    ["/nfl", "Power Ratings Page"],
    ["/nfl/standings", "Standings Page"],
    ["/nfl/schedule", "Schedule Page"],
    ["/nfl/matchups", "Matchups Page"],
    ["/nfl/matchups/dallas-cowboys-at-ny-giants", "Matchup Detail Page"],
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

  it("highlights Weekly Matchups on the matchups index and a matchup detail route", () => {
    renderNflRoute("/nfl/matchups");
    const nav = screen.getByRole("navigation", { name: "NFL sitemap" });
    expect(within(nav).getByRole("link", { name: /Weekly Matchups/i }).getAttribute("aria-current")).toBe("page");

    renderNflRoute("/nfl/matchups/dallas-cowboys-at-ny-giants");
    const nav2 = screen.getAllByRole("navigation", { name: "NFL sitemap" }).slice(-1)[0];
    expect(within(nav2).getByRole("link", { name: /Weekly Matchups/i }).getAttribute("aria-current")).toBe("page");
  });

  describe("default-expanded categories", () => {
    it("expands every category on initial render", () => {
      renderNflRoute("/nfl");
      for (const label of CATEGORY_LABELS) {
        expect(screen.getByRole("button", { name: new RegExp(label, "i") }).getAttribute("aria-expanded")).toBe("true");
      }
    });

    it("shows every current nav destination immediately, with no click required", () => {
      renderNflRoute("/nfl");
      const destinations = [
        "Power Ratings",
        "Standings by Division",
        "Schedule by Week",
        "Weekly Matchups",
        "Super Bowl Odds",
        "Coach of the Year",
        "2026 Team Guide",
        "Fluke or Real",
      ];
      for (const label of destinations) {
        expect(screen.getByRole("link", { name: new RegExp(label, "i") })).toBeTruthy();
      }
    });

    it("collapsing one category does not collapse the others", () => {
      renderNflRoute("/nfl");
      const overview = screen.getByRole("button", { name: /NFL Overview/i });
      fireEvent.click(overview);
      expect(overview.getAttribute("aria-expanded")).toBe("false");
      for (const label of CATEGORY_LABELS.filter((l) => l !== "NFL Overview")) {
        expect(screen.getByRole("button", { name: new RegExp(label, "i") }).getAttribute("aria-expanded")).toBe("true");
      }
    });

    it("a collapsed category can be reopened", () => {
      renderNflRoute("/nfl");
      const markets = screen.getByRole("button", { name: /Markets & Predictions/i });
      fireEvent.click(markets);
      expect(markets.getAttribute("aria-expanded")).toBe("false");
      fireEvent.click(markets);
      expect(markets.getAttribute("aria-expanded")).toBe("true");
    });

    it("active-route sync adds the active category without reopening a category the user collapsed", () => {
      renderNflRoute("/nfl");
      // User manually collapses Markets & Predictions.
      const markets = screen.getByRole("button", { name: /Markets & Predictions/i });
      fireEvent.click(markets);
      expect(markets.getAttribute("aria-expanded")).toBe("false");

      // Navigate to a Season-category page via an in-sidebar link.
      fireEvent.click(screen.getByRole("link", { name: /Standings by Division/i }));

      expect(screen.getByRole("heading", { name: "Standings Page" })).toBeTruthy();
      expect(screen.getByRole("button", { name: /Season/i }).getAttribute("aria-expanded")).toBe("true");
      // The collapsed category must stay collapsed — sync must add, not replace.
      expect(screen.getByRole("button", { name: /Markets & Predictions/i }).getAttribute("aria-expanded")).toBe("false");
    });
  });

  it("desktop sidebar and mobile drawer render the same expanded category structure", () => {
    renderNflRoute("/nfl");
    // Desktop instance renders unconditionally (hidden via CSS class, not unmounted).
    for (const label of CATEGORY_LABELS) {
      expect(screen.getByRole("button", { name: new RegExp(label, "i") }).getAttribute("aria-expanded")).toBe("true");
    }

    fireEvent.click(screen.getByRole("button", { name: /NFL Menu/i }));

    // The Sheet mounts its own NflSectionSidebar instance and correctly marks
    // background content aria-hidden while open, so scope to the dialog to
    // confirm the drawer has the identical expanded-by-default structure.
    const dialog = screen.getByRole("dialog");
    for (const label of CATEGORY_LABELS) {
      expect(within(dialog).getByRole("button", { name: new RegExp(label, "i") }).getAttribute("aria-expanded")).toBe("true");
    }
  });

  it("does not render the NFL sidebar on non-NFL routes", () => {
    renderNflRoute("/mlb");
    expect(screen.getByRole("heading", { name: "MLB Page" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "NFL sitemap" })).toBeNull();
  });

  it("renders the reused NFL logo in the sidebar header", () => {
    renderNflRoute("/nfl");
    const logos = screen.getAllByRole("img", { name: "NFL" });
    expect(logos.length).toBeGreaterThan(0);
    for (const logo of logos) {
      expect(logo.getAttribute("src")).toBe("/logos/nfl.svg");
    }
  });

  it("no longer renders abbreviation badge markers for navigation items", () => {
    renderNflRoute("/nfl/guide");
    for (const marker of ["PR", "ST", "SC", "SB", "CY", "TG", "FR"]) {
      expect(screen.queryByText(marker, { selector: "span" })).toBeNull();
    }
  });
});
