import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import NFL from "@/pages/NFL";

const useDashboard = vi.hoisted(() => vi.fn(() => ({
  dashboard: { week: 2 },
  weekSelection: { week: 2, availableWeeks: [1, 2, 3], invalidQuery: false },
  season: { loading: false, error: null, data: { gamesMeta: null } },
  market: { error: null },
  projections: { error: null },
  ratings: { error: null },
  fantasy: { contextErrors: [] },
})));

vi.mock("@/hooks/useNflWeeklyDashboard", () => ({ useNflWeeklyDashboard: useDashboard }));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: vi.fn() }));
vi.mock("@/components/nfl/weekly-dashboard/WeeklyCommandCenter", () => ({
  default: ({ dashboard, onWeekChange }: { dashboard: { week: number }; onWeekChange: (week: number) => void }) => (
    <div>
      <h1>NFL Week {dashboard.week}</h1>
      <button type="button" onClick={() => onWeekChange(3)}>Choose Week 3</button>
    </div>
  ),
}));

function LocationProbe() {
  return <output>{useLocation().search}</output>;
}

describe("NFL Weekly Command Center page", () => {
  it("passes the explicit query to orchestration and keeps week selection in the URL", () => {
    render(
      <MemoryRouter initialEntries={["/nfl?week=2"]}>
        <NFL />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(useDashboard).toHaveBeenCalledWith("?week=2");
    expect(screen.getByRole("heading", { name: "NFL Week 2" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Choose Week 3" }));
    expect(screen.getByText("?week=3")).toBeTruthy();
  });
});
