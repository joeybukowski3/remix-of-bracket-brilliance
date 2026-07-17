/**
 * MlbNavHero.test.tsx
 * Focused tests for the shared MLB Hub nav-tile strip: the Vulnerable
 * Pitchers pill and its interaction with the existing tile set.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MlbNavHero from "./MlbNavHero";

const EXISTING_TILE_LABELS = [
  "HR Props",
  "Strikeout Props",
  "Batter vs Pitcher",
  "Game Matchups",
  "Props Hub",
  "Power Rankings",
  "Sin City",
];

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MlbNavHero />
    </MemoryRouter>,
  );
}

describe("MlbNavHero — Vulnerable Pitchers pill", () => {
  it("renders a Vulnerable Pitchers pill", () => {
    renderAt("/mlb");
    expect(screen.getByRole("link", { name: /Vulnerable Pitchers/ })).toBeInTheDocument();
  });

  it("links to /mlb/vulnerable-pitchers", () => {
    renderAt("/mlb");
    expect(screen.getByRole("link", { name: /Vulnerable Pitchers/ })).toHaveAttribute("href", "/mlb/vulnerable-pitchers");
  });

  it("is marked active (ring styling) on /mlb/vulnerable-pitchers", () => {
    renderAt("/mlb/vulnerable-pitchers");
    const link = screen.getByRole("link", { name: /Vulnerable Pitchers/ });
    expect(link.className).toMatch(/ring-2/);
  });

  it("is not marked active on a different route", () => {
    renderAt("/mlb/power-rankings");
    const link = screen.getByRole("link", { name: /Vulnerable Pitchers/ });
    expect(link.className).not.toMatch(/ring-2/);
  });

  it("preserves every existing MLB Hub pill", () => {
    renderAt("/mlb");
    for (const label of EXISTING_TILE_LABELS) {
      expect(screen.getByRole("link", { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it("keeps the strip wrapping (flex-wrap), never forcing horizontal overflow, with the new tile added", () => {
    renderAt("/mlb");
    const tileStrip = screen.getByRole("link", { name: /Vulnerable Pitchers/ }).parentElement;
    expect(tileStrip?.className).toMatch(/flex-wrap/);
  });

  it("uses a background color distinct from every other tile", () => {
    renderAt("/mlb");
    const links = screen.getAllByRole("link");
    const bgClasses = links.map((link) => {
      const match = link.className.match(/bg-\w+-500/);
      return match?.[0];
    });
    expect(new Set(bgClasses).size).toBe(bgClasses.length);
  });
});
