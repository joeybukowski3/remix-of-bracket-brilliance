import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import App from "@/App";
import FantasyPointsAllowed from "@/pages/FantasyPointsAllowed";
import { POINTS_ALLOWED_TEAM_COUNT } from "@/lib/fantasy/pointsAllowed2025";

vi.mock("@/components/layout/SiteShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/usePageSeo", async () => ({
  ...(await vi.importActual<typeof import("@/hooks/usePageSeo")>("@/hooks/usePageSeo")),
  usePageSeo: vi.fn(),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/fantasy-football/points-allowed"]}>
      <Routes>
        <Route path="/fantasy-football/points-allowed" element={<FantasyPointsAllowed />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => window.history.pushState({}, "", "/"));

describe("/fantasy-football/points-allowed", () => {
  it("defaults to 2025 and renders all 32 defenses", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Points Allowed by Position" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^2025/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("row")).toHaveLength(POINTS_ALLOWED_TEAM_COUNT + 2); // + 2 header rows
  });

  it("shows every position's rank and points-allowed column", () => {
    renderPage();
    const table = screen.getByRole("table");
    for (const position of ["QB", "RB", "WR", "TE", "K", "DST"]) {
      expect(within(table).getByText(position)).toBeTruthy();
    }
    expect(within(table).getAllByText("Rk")).toHaveLength(6);
    expect(within(table).getAllByText("PA/G")).toHaveLength(6);
  });

  it("labels the data as 2025, never as a 2026 projection", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /2025 fantasy points allowed/i })).toBeTruthy();
    expect(screen.getByText(/2025 actual season/i)).toBeTruthy();
    expect(screen.getByText(/not a\s+2026 projection/i)).toBeTruthy();
  });

  it("sorts by a position's rank, and by name when sorting by team", () => {
    renderPage();
    const firstTeam = () => screen.getAllByRole("row")[2].textContent ?? "";

    fireEvent.click(screen.getByRole("button", { name: "QB" }));
    expect(firstTeam()).toContain("Dallas Cowboys"); // QB rank 1

    fireEvent.click(screen.getByRole("button", { name: "TE" }));
    expect(firstTeam()).toContain("Cincinnati Bengals"); // TE rank 1

    fireEvent.click(screen.getByRole("button", { name: "Team" }));
    expect(firstTeam()).toContain("Arizona Cardinals");
  });

  it("marks 2026 as having no data and renders a placeholder instead of a table", () => {
    renderPage();
    const button2026 = screen.getByRole("button", { name: /^2026/ });
    expect(button2026).toHaveTextContent("(no data)");

    fireEvent.click(button2026);

    expect(button2026).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText(/No 2026 points-allowed data yet/i)).toBeTruthy();
    // The sort control is meaningless without data.
    expect(screen.queryByRole("group", { name: "Sort by position" })).toBeNull();
  });

  it("returns to the populated 2025 table after visiting 2026", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /^2026/ }));
    fireEvent.click(screen.getByRole("button", { name: /^2025/ }));
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.queryByText(/No 2026 points-allowed data yet/i)).toBeNull();
  });

  it("is reachable through the app route", async () => {
    window.history.pushState({}, "", "/fantasy-football/points-allowed");
    render(<App />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Points Allowed by Position" }),
    ).toBeTruthy();
  }, 30000);
});
