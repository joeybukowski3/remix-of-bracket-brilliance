import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { getAllTeams } from "@/data/cfb";
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

  it("filters by conference", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "SEC" }));
    const secCount = getAllTeams().filter((t) => t.conference === "sec").length;
    expect(screen.getByText(new RegExp(`Showing ${secCount} teams`))).toBeInTheDocument();
  }, 20_000);
});
