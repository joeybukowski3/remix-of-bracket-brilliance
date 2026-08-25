import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { CFB_AP_RANKS_2026 } from "@/data/cfb";
import CollegeFootballTeamPage from "./CollegeFootballTeamPage";

vi.mock("@/hooks/usePageSeo", () => ({
  usePageSeo: vi.fn(),
}));

function renderTeamPage() {
  return render(
    <MemoryRouter initialEntries={["/college-football/team/georgia"]}>
      <Routes>
        <Route path="/college-football/team/:teamSlug" element={<CollegeFootballTeamPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CollegeFootballTeamPage ratings and schedule", () => {
  it("shows the AP card from the official poll, or NR when the team is unranked", () => {
    renderTeamPage();
    const label = screen.getByText("AP Rank");
    // Derived from the live artifact rather than a hardcoded rank, so a weekly
    // poll refresh (or Georgia dropping out of the poll) does not break this.
    const apRank = CFB_AP_RANKS_2026["uga"] ?? null;
    expect(label.parentElement).toHaveTextContent(apRank === null ? "NR" : `#${apRank}`);
  });

  it("styles rating cards responsively and leaves null SOS Played neutral", () => {
    const { container } = renderTeamPage();
    const ratingsGrid = screen.getByText("AP Rank").parentElement?.parentElement;
    expect(ratingsGrid).toHaveClass("grid-cols-2", "sm:grid-cols-3", "lg:grid-cols-6");
    const sosPlayed = screen.getByText("SOS Played").parentElement;
    expect(sosPlayed).toHaveTextContent("—");
    expect(sosPlayed).toHaveClass("bg-white", "text-slate-500");
    expect(sosPlayed?.className).not.toMatch(/bg-(rose|orange|slate|emerald)/);
    expect(container.querySelector('[aria-label="Georgia schedule"]')).toHaveClass("overflow-x-auto");
  });

  it("renders compact schedule presentation from canonical team and game data", () => {
    const { container } = renderTeamPage();
    const schedule = container.querySelector('[aria-label="Georgia schedule"]');
    expect(screen.getByRole("columnheader", { name: "Opp Record" })).toBeInTheDocument();
    expect(schedule?.querySelector("tbody tr td:nth-child(3)")).toHaveTextContent(/^(0-0|—)$/);
    expect(schedule?.querySelector("tbody tr td:first-child")).toHaveTextContent(
      /^(August|September|October|November|December|January) \d{1,2}( · \d{1,2}:\d{2} (AM|PM) ET)?$/,
    );
    expect(schedule?.querySelector("tbody tr td:first-child")?.textContent).not.toMatch(/^2026-/);
    expect(schedule?.querySelector("tbody tr td:nth-child(4) span")).toHaveClass("uppercase");
  });

  it("shows missing market spreads as em dashes despite available JKB Power", () => {
    const { container } = renderTeamPage();
    const spreadCells = container.querySelectorAll('[aria-label="Georgia schedule"] tbody tr td:nth-child(6)');
    expect(spreadCells.length).toBeGreaterThan(0);
    for (const cell of spreadCells) {
      expect(cell).toHaveTextContent("—");
    }
  }, 20_000);
});
