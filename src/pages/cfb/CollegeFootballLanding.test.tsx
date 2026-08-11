import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import CollegeFootballLanding from "./CollegeFootballLanding";

vi.mock("@/hooks/usePageSeo", () => ({
  usePageSeo: vi.fn(),
}));

function renderLanding() {
  return render(
    <MemoryRouter>
      <CollegeFootballLanding />
    </MemoryRouter>,
  );
}

describe("CollegeFootballLanding", () => {
  it("defaults to Top 25 with exactly 25 unique team routes", () => {
    const { container } = renderLanding();
    expect(
      screen.getByRole("heading", { name: /Top 25/i }),
    ).toBeInTheDocument();

    const hrefs = new Set(
      Array.from(container.querySelectorAll('a[href^="/college-football/team/"]')).map((a) =>
        a.getAttribute("href"),
      ),
    );
    expect(hrefs.size).toBe(25);
  }, 15_000);

  it("links team rows to correct team routes", () => {
    const { container } = renderLanding();
    const first = container.querySelector('a[href^="/college-football/team/"]');
    expect(first?.getAttribute("href")).toMatch(/^\/college-football\/team\//);
  }, 15_000);

  it("uses current market-informed ratings copy without stale v1 wording", () => {
    const { container } = renderLanding();
    expect(container.textContent).toContain("JKB Preseason Power");
    expect(container.textContent).toContain("Market-informed preseason ratings adjusted by JoeKnowsBall efficiency data");
    expect(container.textContent).toContain("team-strength ratings, not projected spreads or picks");
    expect(container.textContent).not.toContain("JKB Preseason Power Ratings v1:");
    expect(container.textContent).not.toMatch(/sample preseason|placeholder/i);
  }, 15_000);

  it("links View All FBS Rankings", () => {
    const { container } = renderLanding();
    const link = Array.from(container.querySelectorAll("a")).find((a) =>
      (a.textContent ?? "").toLowerCase().includes("view all fbs rankings"),
    );
    expect(link?.getAttribute("href")).toBe("/college-football/rankings");
  }, 15_000);

  it("switches to conferences view and keeps selection", () => {
    renderLanding();
    fireEvent.click(screen.getByRole("button", { name: "Conferences" }));
    expect(screen.getByRole("heading", { name: "Conference Standings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Conferences" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("heading", { name: /Top 25/i })).not.toBeInTheDocument();
  }, 20_000);

  it("links conference team rows to team pages", () => {
    const { container } = renderLanding();
    fireEvent.click(screen.getByRole("button", { name: "Conferences" }));
    const teamLinks = container.querySelectorAll('a[href^="/college-football/team/"]');
    expect(teamLinks.length).toBeGreaterThan(0);
  }, 20_000);
});
