import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import CollegeFootballSchedule from "./CollegeFootballSchedule";

vi.mock("@/hooks/usePageSeo", () => ({
  usePageSeo: vi.fn(),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <CollegeFootballSchedule />
    </MemoryRouter>,
  );
}

describe("CollegeFootballSchedule", () => {
  it("links games to matchup routes", () => {
    const { container } = renderPage();
    const matchupLinks = container.querySelectorAll('a[href^="/college-football/matchup/"]');
    expect(matchupLinks.length).toBeGreaterThan(0);
  }, 15_000);

  it("displays em dash for missing odds rather than NaN", () => {
    const { container } = renderPage();
    const body = container.textContent ?? "";
    expect(body).not.toMatch(/\bNaN\b/);
    expect(body).not.toMatch(/\bundefined\b/);
  }, 15_000);
});
