import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import CollegeFootballMatchup from "./CollegeFootballMatchup";

vi.mock("@/hooks/usePageSeo", () => ({
  usePageSeo: vi.fn(),
}));

function renderMatchup(gameId: string) {
  return render(
    <MemoryRouter initialEntries={[`/college-football/matchup/${gameId}`]}>
      <Routes>
        <Route path="/college-football/matchup/:gameId" element={<CollegeFootballMatchup />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CollegeFootballMatchup", () => {
  it("renders side-by-side comparison for a known game", () => {
    renderMatchup("401856766");
    expect(screen.getAllByText("North Carolina").length).toBeGreaterThan(0);
    expect(screen.getAllByText("TCU").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Model projections coming soon").length).toBeGreaterThan(0);
    expect(screen.queryByText(/projected spread:/i)).not.toBeInTheDocument();
  });

  it("shows the real 2025 'Last Season' comparison while 2026 has no completed games, never labeled as current", () => {
    renderMatchup("401856766");
    expect(screen.getByText("Last Season · 2025")).toBeInTheDocument();
    expect(screen.queryByText("2026 Season")).not.toBeInTheDocument();
    // Season Stats defaults to the Offense tab; Defense/Matchup are exercised in
    // CollegeFootballSeasonStatsComparison's own test suite.
    expect(screen.getAllByText("Points/Game").length).toBeGreaterThan(0);
  });

  it("does not fabricate a win probability", () => {
    renderMatchup("401856766");
    expect(screen.queryByText(/win probability:\s*\d/i)).not.toBeInTheDocument();
  });

  it("shows not found for unknown game", () => {
    renderMatchup("does-not-exist");
    expect(screen.getByText("Matchup not found")).toBeInTheDocument();
  });

  it("does not render NaN or undefined for partial stats", () => {
    const { container } = renderMatchup("401856766");
    const body = container.textContent ?? "";
    expect(body).not.toMatch(/\bNaN\b/);
    expect(body).not.toMatch(/\bundefined\b/);
  });
});
