import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
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
  it("shows the AP card as NR while the verified poll source is empty", () => {
    renderTeamPage();
    const label = screen.getByText("AP Rank");
    expect(label.parentElement).toHaveTextContent("NR");
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
