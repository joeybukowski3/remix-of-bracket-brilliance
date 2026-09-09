import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "@/App";

/**
 * Fantasy Football pages (`/fantasy-football*`) are NFL-section pages but
 * live outside the `/nfl` URL prefix. They must still render inside
 * `NflPlatformLayout` so the desktop NFL sidebar is always visible -- see
 * `src/lib/nfl/sectionNav.ts`, which already lists Fantasy Football under
 * the "Fantasy" category with `match: "prefix"`.
 */
const FANTASY_ROUTES = [
  ["/fantasy-football?view=ros", "2026 Rest-of-Season Rankings"],
  ["/fantasy-football/points-allowed", "Points Allowed by Position"],
  ["/fantasy-football/draft-preview", "Fantasy Draft Preview"],
] as const;

// These routes render large research boards (250+ rows), so the full app
// mount is slower than the default 5s test timeout -- see the same pattern
// in FantasyFootball.test.tsx.
vi.setConfig({ testTimeout: 30000 });

afterEach(() => window.history.pushState({}, "", "/"));

describe("NFL sidebar on Fantasy routes", () => {
  it.each(FANTASY_ROUTES)("renders the shared NFL sidebar on %s", async (path, heading) => {
    window.history.pushState({}, "", path);
    render(<App />);
    expect(await screen.findByRole("heading", { name: heading })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "NFL sitemap" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /NFL Menu/i })).toBeTruthy();
  });

  it.each(FANTASY_ROUTES)("does not duplicate the desktop sidebar on %s", async (path) => {
    window.history.pushState({}, "", path);
    render(<App />);
    await screen.findByRole("navigation", { name: "NFL sitemap" });
    // Desktop rail renders unconditionally (hidden via CSS below `xl`), the
    // mobile drawer only mounts its own copy once opened -- so exactly one
    // "NFL sitemap" nav should exist per fantasy route.
    expect(screen.getAllByRole("navigation", { name: "NFL sitemap" })).toHaveLength(1);
  });

  it("keeps the Fantasy Football weekly/ROS mode tabs functional inside the shared layout", async () => {
    window.history.pushState({}, "", "/fantasy-football");
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Weekly Fantasy Rankings" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "NFL sitemap" })).toBeTruthy();
  });
});
