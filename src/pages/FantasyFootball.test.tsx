import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import FantasyFootball from "@/pages/FantasyFootball";
import App from "@/App";
import {
  FANTASY_OPTIONAL_COLUMNS,
  FANTASY_POSITION_FILTERS,
  FANTASY_RANKINGS,
  countByPosition,
  filterFantasyRankings,
  getPopulatedColumns,
} from "@/lib/fantasy/rankings";

vi.mock("@/components/layout/SiteShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: vi.fn() }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/fantasy-football"]}>
      <Routes>
        <Route path="/fantasy-football" element={<FantasyFootball />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("/fantasy-football", () => {
  it("renders the section header and rankings shell", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: /Fantasy Football Rankings/i })).toBeTruthy();
    expect(screen.getByRole("region", { name: /overall rankings/i })).toBeTruthy();
  });

  it("shows an intentional empty state instead of invented player rows", () => {
    renderPage();
    expect(screen.getByText(/have not been published yet/i)).toBeTruthy();
    // No rankings table is rendered while the list is empty, so there is no
    // chance of a placeholder row reading as a real ranking.
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("exposes the position filter architecture with Overall selected", () => {
    renderPage();
    const group = screen.getByRole("group", { name: "Filter by position" });
    for (const label of ["Overall", "QB", "RB", "WR", "TE"]) {
      expect(within(group).getByRole("button", { name: label })).toBeTruthy();
    }
    expect(within(group).getByRole("button", { name: "Overall" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("changes the selected position on click", () => {
    renderPage();
    const group = screen.getByRole("group", { name: "Filter by position" });
    fireEvent.click(within(group).getByRole("button", { name: "RB" }));
    expect(within(group).getByRole("button", { name: "RB" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(group).getByRole("button", { name: "Overall" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("disables player search while there is nothing to search", () => {
    renderPage();
    expect(screen.getByLabelText(/Search rankings/i)).toHaveProperty("disabled", true);
  });

  it("introduces no dead links — every link targets a live route", () => {
    const { container } = renderPage();
    const live = new Set(["/16-0", "/nfl", "/nfl/schedule", "/nfl/guide"]);
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(live.has(href ?? ""), `unexpected link target: ${href}`).toBe(true);
    }
  });

  it("is reachable at /fantasy-football through the app router", async () => {
    // App owns its own BrowserRouter, so the route is exercised through history
    // rather than by nesting a second router.
    window.history.pushState({}, "", "/fantasy-football");
    try {
      render(<App />);
      expect(
        await screen.findByRole("heading", { level: 1, name: /Fantasy Football Rankings/i }),
      ).toBeTruthy();
    } finally {
      window.history.pushState({}, "", "/");
    }
  });
});

describe("fantasy ranking schema", () => {
  it("ships with no invented rankings", () => {
    expect(FANTASY_RANKINGS.rows).toHaveLength(0);
    expect(FANTASY_RANKINGS.updatedAt).toBeNull();
    expect(FANTASY_RANKINGS.source).toBe("JoeKnowsBall");
  });

  it("offers Overall plus the four skill positions", () => {
    expect(FANTASY_POSITION_FILTERS).toEqual(["ALL", "QB", "RB", "WR", "TE"]);
  });

  it("renders only the optional columns a dataset actually populates", () => {
    expect(getPopulatedColumns([])).toHaveLength(0);
    expect(
      getPopulatedColumns([
        { overallRank: 1, player: "A", team: "kc", position: "QB", adp: 2.4 },
      ]).map((column) => column.key),
    ).toEqual(["adp"]);
  });

  it("anticipates the full field set without requiring any of it", () => {
    const keys = FANTASY_OPTIONAL_COLUMNS.map((column) => column.key);
    for (const expected of ["positionRank", "byeWeek", "customScore", "adp", "consensusRank", "projectedPoints", "priorSeasonRank", "lateSeasonRank", "strengthOfSchedule", "tier", "notes"]) {
      expect(keys, expected).toContain(expected);
    }
  });

  it("filters by position and by player or team text", () => {
    const rows = [
      { overallRank: 1, player: "Alpha Back", team: "kc", position: "RB" as const },
      { overallRank: 2, player: "Beta Wide", team: "sf", position: "WR" as const },
    ];
    expect(filterFantasyRankings(rows, "RB", "")).toHaveLength(1);
    expect(filterFantasyRankings(rows, "ALL", "beta")).toHaveLength(1);
    expect(filterFantasyRankings(rows, "ALL", "sf")).toHaveLength(1);
    expect(filterFantasyRankings(rows, "QB", "")).toHaveLength(0);
  });

  it("counts each position plus the overall total", () => {
    const counts = countByPosition([
      { overallRank: 1, player: "A", team: "kc", position: "RB" },
      { overallRank: 2, player: "B", team: "sf", position: "RB" },
      { overallRank: 3, player: "C", team: "buf", position: "QB" },
    ]);
    expect(counts.ALL).toBe(3);
    expect(counts.RB).toBe(2);
    expect(counts.QB).toBe(1);
    expect(counts.TE).toBe(0);
  });
});
