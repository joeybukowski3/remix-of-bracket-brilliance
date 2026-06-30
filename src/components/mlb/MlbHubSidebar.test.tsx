/**
 * MlbHubSidebar.test.tsx
 * Focused tests for the shared MLB hub sidebar: link order, the new
 * Numerology entry under Power Rankings, active-route highlighting, and
 * presence of the partner/glossary/regression-scale sections.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MlbHubSidebar, { MLB_HUB_LINKS } from "./MlbHubSidebar";

function renderSidebar(path = "/mlb") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MlbHubSidebar />
    </MemoryRouter>
  );
}

describe("MLB_HUB_LINKS — single source of truth", () => {
  it("Numerology sits directly under Power Rankings", () => {
    const labels = MLB_HUB_LINKS.map((l) => l.label);
    const powerIdx = labels.indexOf("Power Rankings");
    const numIdx = labels.indexOf("Numerology");
    expect(powerIdx).toBeGreaterThanOrEqual(0);
    expect(numIdx).toBe(powerIdx + 1);
  });

  it("Numerology links to /mlb/numerology", () => {
    const numerology = MLB_HUB_LINKS.find((l) => l.label === "Numerology");
    expect(numerology?.to).toBe("/mlb/numerology");
  });

  it("includes every link mentioned in the brief", () => {
    const required = [
      "Hit Props", "HR Props", "K Props", "Game Matchups", "Power Rankings",
      "Numerology", "Moneyline Edges", "Pitcher Regression", "Overdue Batters", "Biggest Mismatches",
    ];
    const labels = MLB_HUB_LINKS.map((l) => l.label);
    for (const label of required) {
      expect(labels).toContain(label);
    }
  });

  it("no duplicate labels", () => {
    const labels = MLB_HUB_LINKS.map((l) => l.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("MlbHubSidebar — rendering", () => {
  it("renders the Numerology nav link with visible text (not hidden/transparent)", () => {
    renderSidebar();
    const link = screen.getByRole("link", { name: /Numerology/i });
    expect(link).toBeTruthy();
    // Confirm it's not styled invisible like the old easter-egg link
    const style = window.getComputedStyle(link);
    expect(style.color).not.toBe("transparent");
  });

  it("renders all primary nav links", () => {
    renderSidebar();
    expect(screen.getByRole("link", { name: /Hit Props/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /HR Props/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /K Props/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Power Rankings/i })).toBeTruthy();
  });

  it("renders the Tables sub-heading and its links", () => {
    renderSidebar();
    expect(screen.getByText("Tables")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Moneyline Edges/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Pitcher Regression/i })).toBeTruthy();
  });

  it("renders the Prop Optimizer button linking to /mlb/props", () => {
    renderSidebar();
    const link = screen.getByRole("link", { name: /Prop Optimizer/i });
    expect(link).toHaveAttribute("href", "/mlb/props");
  });

  it("renders the partner sportsbook section", () => {
    renderSidebar();
    expect(screen.getByText("Bet with our partners")).toBeTruthy();
    expect(screen.getByText(/21\+/)).toBeTruthy();
  });

  it("renders the Stat Glossary section with known terms", () => {
    renderSidebar();
    expect(screen.getByText("Stat Glossary")).toBeTruthy();
    expect(screen.getByText("xERA")).toBeTruthy();
    expect(screen.getByText("xFIP")).toBeTruthy();
  });

  it("renders the Regression Scale legend", () => {
    renderSidebar();
    expect(screen.getByText("Regression Scale")).toBeTruthy();
    expect(screen.getByText("Blue = regress ↓")).toBeTruthy();
  });

  it("the MLB logo links back to /mlb", () => {
    renderSidebar();
    const logo = screen.getByAltText("MLB");
    const link = logo.closest("a");
    expect(link).toHaveAttribute("href", "/mlb");
  });
});

describe("MlbHubSidebar — active-route highlighting", () => {
  it("marks Power Rankings as the current page when on /mlb/power-rankings", () => {
    renderSidebar("/mlb/power-rankings");
    const link = screen.getByRole("link", { name: /Power Rankings/i });
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("marks Numerology as the current page when on /mlb/numerology", () => {
    renderSidebar("/mlb/numerology");
    const link = screen.getByRole("link", { name: /Numerology/i });
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("does not mark an inactive link as current", () => {
    renderSidebar("/mlb/power-rankings");
    const hrLink = screen.getByRole("link", { name: /HR Props/i });
    expect(hrLink).not.toHaveAttribute("aria-current");
  });

  it("does not falsely mark Power Rankings active when on /mlb (different page)", () => {
    renderSidebar("/mlb");
    const link = screen.getByRole("link", { name: /Power Rankings/i });
    expect(link).not.toHaveAttribute("aria-current");
  });

  it("hash-fragment links (e.g. Moneyline Edges -> /mlb#moneylines) do not falsely activate on every /mlb subpage", () => {
    renderSidebar("/mlb/hr-props");
    const link = screen.getByRole("link", { name: /Moneyline Edges/i });
    expect(link).not.toHaveAttribute("aria-current");
  });
});
