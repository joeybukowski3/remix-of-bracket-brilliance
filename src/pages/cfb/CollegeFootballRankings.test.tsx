import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { CFB_AP_RANKS_2026, getAllTeams } from "@/data/cfb";
import CollegeFootballRankings from "./CollegeFootballRankings";

vi.mock("@/hooks/usePageSeo", () => ({
  usePageSeo: vi.fn(),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <CollegeFootballRankings />
    </MemoryRouter>,
  );
}

describe("CollegeFootballRankings", () => {
  it("shows all FBS teams by default", () => {
    renderPage();
    const total = getAllTeams().length;
    expect(screen.getByText(new RegExp(`Showing ${total} teams`))).toBeInTheDocument();
  }, 20_000);

  it("shows the AP comparison column from the official poll, never fabricating ranks", () => {
    const { container } = renderPage();
    expect(screen.getByRole("columnheader", { name: "AP" })).toBeInTheDocument();
    // Only officially ranked teams get a number; everyone else renders an em
    // dash. Asserted against the live artifact so this holds both before a poll
    // is published and after each weekly refresh.
    const teams = getAllTeams();
    const ranked = teams.filter((team) => team.ratings.apRank !== null);
    expect(ranked).toHaveLength(Object.keys(CFB_AP_RANKS_2026).length);
    for (const team of ranked) {
      expect(team.ratings.apRank).toBe(CFB_AP_RANKS_2026[team.id]);
    }
    // Unranked teams must still show an em dash, never a fabricated 26+.
    expect(teams.some((team) => team.ratings.apRank === null)).toBe(true);
    expect(container.textContent).toContain("—");
  }, 20_000);

  it("filters by conference", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "SEC" }));
    const secCount = getAllTeams().filter((t) => t.conference === "sec").length;
    expect(screen.getByText(new RegExp(`Showing ${secCount} teams`))).toBeInTheDocument();
  }, 20_000);
});
