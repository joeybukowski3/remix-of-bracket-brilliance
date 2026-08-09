import { describe, expect, it, vi, afterEach } from "vitest";
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
vi.mock("@/hooks/usePageSeo", async () => ({
  ...(await vi.importActual<typeof import("@/hooks/usePageSeo")>("@/hooks/usePageSeo")),
  usePageSeo: vi.fn(),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/fantasy-football"]}>
      <Routes>
        <Route path="/fantasy-football" element={<FantasyFootball />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  window.history.pushState({}, "", "/");
});

describe("/fantasy-football", () => {
  it("renders the section header and rankings shell", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: /Fantasy Football Rankings/i })).toBeTruthy();
    expect(screen.getByRole("region", { name: /Overall rankings/i })).toBeTruthy();
  });

  it("renders the published 250-row rankings instead of an empty state", () => {
    renderPage();
    const table = screen.getByRole("table");
    const playerRows = within(table)
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-label")?.startsWith("Show details for"));
    expect(playerRows.length).toBe(250);
    expect(screen.getByText("Jahmyr Gibbs")).toBeTruthy();
    expect(screen.getByText("Devin Singletary")).toBeTruthy();
    expect(screen.queryByText(/No matching players/i)).toBeNull();
  }, 30000);

  it("exposes the position filter architecture with Overall selected", () => {
    renderPage();
    const group = screen.getByRole("group", { name: "Position" });
    expect(group).toBeTruthy();
    expect(within(group).getByRole("button", { name: "Overall" })).toHaveAttribute("aria-pressed", "true");
    for (const name of ["QB", "RB", "WR", "TE"]) {
      expect(within(group).getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
    }
    expect(FANTASY_POSITION_FILTERS).toEqual(["ALL", "QB", "RB", "WR", "TE"]);
  });

  it("keeps the primary view compact with draft-context columns", () => {
    renderPage();
    const table = screen.getByRole("table");
    const headerCells = within(table).getAllByRole("columnheader");
    const headerLabels = headerCells.map((cell) => cell.textContent ?? "");
    expect(headerLabels).toContain("Pos Rank");
    expect(headerLabels).toContain("Rd/Pick");
    expect(headerLabels).toContain("AVG");
    // Deeper workbook fields are not default columns; they live in the expandable row.
    expect(headerLabels).not.toContain("SOS");
    expect(headerLabels).not.toContain("Late");
    expect(headerLabels).not.toContain("Vegas");
    expect(headerLabels).not.toContain("Notes");
    expect(headerLabels).not.toContain("Bye");
    expect(headerLabels).not.toContain("ADP");
  });

  it("expands a player row to reveal metrics, ranks and playoff schedule", () => {
    renderPage();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search players" }), {
      target: { value: "gibbs" },
    });
    const expander = screen.getByRole("button", { name: "Show details for Jahmyr Gibbs" });
    fireEvent.click(expander);
    expect(screen.getByText("RB Metrics")).toBeTruthy();
    expect(screen.getByText("Touches")).toBeTruthy();
    expect(screen.getByText("Red Zone Touches")).toBeTruthy();
    expect(screen.getByText("YPC")).toBeTruthy();
    expect(screen.getByText("WAR")).toBeTruthy();
    expect(screen.getByText("Vegas")).toBeTruthy();
    expect(screen.getByText("Playoff Schedule")).toBeTruthy();
    expect(screen.getByText("Week 15")).toBeTruthy();
    expect(screen.getByText("@MIN")).toBeTruthy();
  });

  it("collapses the expanded row when the expander is clicked again", () => {
    renderPage();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search players" }), {
      target: { value: "gibbs" },
    });
    const expander = screen.getByRole("button", { name: "Show details for Jahmyr Gibbs" });
    fireEvent.click(expander);
    expect(screen.getByText("RB Metrics")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hide details for Jahmyr Gibbs" }));
    expect(screen.queryByText("RB Metrics")).toBeNull();
  });

  it("filters the table by free-text query and shows the empty state for no matches", () => {
    renderPage();
    const search = screen.getByRole("searchbox", { name: "Search players" });
    fireEvent.change(search, { target: { value: "mahomes" } });
    expect(screen.getByText("Patrick Mahomes")).toBeTruthy();
    expect(screen.queryByText("Jahmyr Gibbs")).toBeNull();
    fireEvent.change(search, { target: { value: "zzz-no-player" } });
    expect(screen.getByText(/No matching players/i)).toBeTruthy();
  });

  it("counts by position across the full ranking set", () => {
    expect(countByPosition(FANTASY_RANKINGS.rows)).toEqual({ QB: 31, RB: 85, WR: 100, TE: 34 });
    expect(Object.values(countByPosition(FANTASY_RANKINGS.rows)).reduce((a, b) => a + b, 0)).toBe(250);
  });

  it("filters the ranking set by position and free-text query", () => {
    const te = filterFantasyRankings(FANTASY_RANKINGS.rows, "TE", "");
    expect(te.length).toBe(34);
    expect(te.every((row) => row.position === "TE")).toBe(true);
    expect(filterFantasyRankings(FANTASY_RANKINGS.rows, "ALL", "mahomes").map((row) => row.player)).toEqual([
      "Patrick Mahomes",
    ]);
  });

  it("reports which optional columns a dataset actually populates", () => {
    const populated = getPopulatedColumns(FANTASY_RANKINGS.rows);
    expect(populated).toContain("positionRank");
    expect(populated).toContain("warRank");
    expect(populated).toContain("vegasRank");
    expect(populated).toContain("strengthOfSchedule");
    expect(populated).toContain("offensiveLineRank");
    expect(populated).not.toContain("adp");
    expect(populated).not.toContain("byeWeek");
    expect(populated).not.toContain("notes");
  });

  it("is reachable at /fantasy-football through the app router", async () => {
    window.history.pushState({}, "", "/fantasy-football");
    render(<App />);
    expect(await screen.findByText(/Fantasy Football Rankings/i)).toBeTruthy();
  });

  it("anticipates the full field set without requiring any of it", () => {
    const keys = FANTASY_OPTIONAL_COLUMNS.map((column) => column.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "positionRank",
        "byeWeek",
        "customScore",
        "adp",
        "consensusRank",
        "projectedPoints",
        "priorSeasonRank",
        "lateSeasonRank",
        "strengthOfSchedule",
        "tier",
        "notes",
      ]),
    );
  });
});
