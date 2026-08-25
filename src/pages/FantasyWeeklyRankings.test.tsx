import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { weeklyFantasyProjectionProductionArtifactSchema } from "@/lib/fantasy/weekly/projections/production/artifactContract";
import { weeklyFantasyResearchArtifactSchema } from "@/lib/fantasy/weekly/researchArtifact";
import { joinWeeklyFantasyResearchRows } from "@/lib/fantasy/weekly/researchJoin";

function fixture(relativePath: string) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require("node:path") as typeof import("node:path");
  return JSON.parse(readFileSync(join(process.cwd(), relativePath), "utf-8"));
}

const fullArtifact = weeklyFantasyProjectionProductionArtifactSchema.parse(fixture("public/data/fantasy/projections/2026/week-01.json"));
const fullResearchArtifact = weeklyFantasyResearchArtifactSchema.parse(fixture("public/data/fantasy/weekly-research/2026/week-01.json"));

/**
 * Trimmed to the top 20 per position (ranks stay 1..N, so positionRank
 * invariants hold). This is real production data, just fewer rows -- the
 * component under test never depends on the full-size roster, and rendering
 * up to 188 real WR rows twice per test made this file's slowest tests flirt
 * with the default vitest timeout under full-suite parallel load.
 */
const artifact = {
  ...fullArtifact,
  rows: {
    QB: fullArtifact.rows.QB.slice(0, 20),
    RB: fullArtifact.rows.RB.slice(0, 20),
    WR: fullArtifact.rows.WR.slice(0, 20),
    TE: fullArtifact.rows.TE.slice(0, 20),
  },
};
const mockWeekly = vi.hoisted(() => vi.fn());
const mockResearch = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useWeeklyFantasyProjectionArtifact", () => ({ useWeeklyFantasyProjectionArtifact: mockWeekly }));
vi.mock("@/hooks/useWeeklyFantasyResearchRows", () => ({ useWeeklyFantasyResearchRows: mockResearch }));
vi.mock("@/hooks/useNflSeasonData", () => ({
  useNflSeasonData: () => {
    const games = fixture("public/data/nfl/2026/games.json");
    return { loading: false, error: null, data: { teams: [], games: games.games, results: [], gamesMeta: games._meta ?? null, resultsMeta: null } };
  },
}));
vi.mock("@/components/layout/SiteShell", () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: vi.fn() }));

import FantasyWeeklyRankings from "@/pages/FantasyWeeklyRankings";

const ROUTE = "/fantasy-football/weekly-rankings";
const ready = { status: "ready" as const, artifact, rows: artifact.rows, freshness: { inputAsOf: artifact.inputAsOf, generatedAt: artifact.generatedAt } };

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Current route">{`${location.pathname}${location.search}`}</output>;
}

function renderPage(entry = `${ROUTE}?week=1`) {
  return render(<MemoryRouter initialEntries={[entry]}><Routes><Route path={ROUTE} element={<><FantasyWeeklyRankings /><LocationProbe /></>} /></Routes></MemoryRouter>);
}

describe("Weekly Rankings consumer", () => {
  beforeEach(() => {
    mockWeekly.mockReset();
    mockWeekly.mockReturnValue(ready);
    mockResearch.mockReset();
    mockResearch.mockImplementation((rows: typeof fullArtifact.rows.QB) => ({
      rows: joinWeeklyFantasyResearchRows(rows, fullResearchArtifact).rows,
      loading: false,
      errors: [],
    }));
  });

  it("uses the canonical projection artifact hook and preserves artifact QB order", () => {
    renderPage();
    expect(mockWeekly).toHaveBeenCalledWith(2026, 1);
    const rows = screen.getAllByRole("row").slice(1, 4);
    expect(rows[0]).toHaveTextContent(artifact.rows.QB[0].playerName);
    expect(rows[1]).toHaveTextContent(artifact.rows.QB[1].playerName);
    expect(rows[2]).toHaveTextContent(artifact.rows.QB[2].playerName);
  });

  it("keeps Weekly and Rest-of-Season as distinct modes", () => {
    renderPage();
    expect(screen.getByRole("link", { name: "Weekly Rankings" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Rest of Season" })).toHaveAttribute("href", "/fantasy-football?view=ros");
  });

  it("switches positions without changing artifact rank order", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "WR" }));
    expect(screen.getAllByRole("row")[1]).toHaveTextContent(artifact.rows.WR[0].playerName);
  });

  it("labels the primary number as a projection, never a bare ROS PPG", () => {
    renderPage();
    expect(screen.getByRole("columnheader", { name: "PROJ. PTS" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "SEASON PPG" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "MATCHUP GRADE" })).toBeInTheDocument();
    expect(screen.queryByText("ROS Proj PPG")).not.toBeInTheDocument();
  });

  it("exposes the projected points value matching the artifact, ranked correctly", () => {
    renderPage();
    const top = artifact.rows.QB[0];
    expect(screen.getAllByRole("row")[1]).toHaveTextContent(top.projectedFantasyPoints.toFixed(1));
  });

  it("defaults to Stat View and toggles display values without changing row order or projections", () => {
    const { container } = renderPage();
    const board = screen.getByRole("region", { name: "QB weekly fantasy research board" });
    const statButton = screen.getByRole("button", { name: "Stat View" });
    const rankButton = screen.getByRole("button", { name: "Rank View" });
    const tuples = () => [...container.querySelectorAll("tr[data-player-id]")].map((row) => [
      row.getAttribute("data-player-id"),
      row.querySelector("[data-projected-fantasy-points]")?.getAttribute("data-projected-fantasy-points"),
    ]);
    const before = tuples();

    expect(statButton).toHaveAttribute("aria-pressed", "true");
    expect(rankButton).toHaveAttribute("aria-pressed", "false");
    expect(board).toHaveAttribute("data-display-mode", "stat");
    expect(screen.getAllByRole("row")[1].querySelectorAll("td")[3]).toHaveTextContent(/\d+\.\d/);

    fireEvent.click(rankButton);
    expect(board).toHaveAttribute("data-display-mode", "rank");
    expect(rankButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("row")[1].querySelectorAll("td")[3]).toHaveTextContent(/^#\d+$/);
    expect(tuples()).toEqual(before);
  });

  it("uses the shared light grid, team identity, and projected-points emphasis", () => {
    renderPage();
    const table = screen.getByRole("table");
    const shell = table.closest("section");
    const headers = screen.getAllByRole("columnheader");
    const firstRow = screen.getAllByRole("row")[1];
    const cells = [...firstRow.querySelectorAll("td")];

    expect(shell?.className).toContain("border-slate-200");
    expect(shell?.className).toContain("bg-white");
    expect(headers.every((header) => header.className.includes("border-b"))).toBe(true);
    expect(headers.slice(0, -1).every((header) => header.className.includes("border-r"))).toBe(true);
    expect(cells.every((cell) => cell.className.includes("border-b"))).toBe(true);
    expect(cells.slice(0, -1).every((cell) => cell.className.includes("border-r"))).toBe(true);
    expect(firstRow.querySelector(`[data-team-logo="${artifact.rows.QB[0].team.toUpperCase()}"]`)).toBeInTheDocument();
    expect(headers[2].className).toContain("bg-sky-100");
    expect(cells[2].className).toContain("bg-sky-100");
  });

  it("uses the shared four-color position language for active and inactive tabs", () => {
    renderPage();
    const expectedColors = { QB: "sky", RB: "emerald", WR: "violet", TE: "orange" } as const;
    for (const [position, color] of Object.entries(expectedColors)) {
      const button = screen.getByRole("button", { name: position, exact: true });
      expect(button.className).toContain(color);
      expect(button.className).toContain("border");
    }
    expect(new Set(Object.values(expectedColors)).size).toBe(4);
    expect(screen.getByRole("button", { name: "QB", exact: true }).className).toContain("bg-sky-600");
    fireEvent.click(screen.getByRole("button", { name: "RB", exact: true }));
    expect(screen.getByRole("button", { name: "RB", exact: true }).className).toContain("bg-emerald-600");
  });

  it("does not intentionally ellipsize weekly player names", () => {
    const { container } = renderPage();
    const names = [...container.querySelectorAll("[data-player-name]")];
    expect(names.length).toBeGreaterThan(0);
    expect(names.every((name) => !name.className.includes("truncate") && !name.className.includes("text-ellipsis"))).toBe(true);
    expect(names.every((name) => name.className.includes("whitespace-normal"))).toBe(true);
  });

  it("shows the How JKB Projections Work methodology panel", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "How JKB Projections Work" })).toBeInTheDocument();
  });

  it("honours and updates the shared query-addressable week selection", () => {
    renderPage(`${ROUTE}?week=2`);
    expect(mockWeekly).toHaveBeenCalledWith(2026, 2);
    fireEvent.change(screen.getByRole("combobox", { name: "Select week" }), { target: { value: "3" } });
    expect(screen.getByLabelText("Current route")).toHaveTextContent(`${ROUTE}?week=3`);
    expect(mockWeekly).toHaveBeenLastCalledWith(2026, 3);
  });

  it("fails safely when the selected weekly artifact is missing, and never substitutes another week", () => {
    mockWeekly.mockReturnValue({ status: "missing", season: 2026, week: 2, error: new Error("missing") });
    renderPage(`${ROUTE}?week=2`);
    expect(screen.getByRole("heading", { name: "Week 2 rankings are not available yet" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("provides dense mobile-safe core columns and expandable context", () => {
    renderPage();
    const table = screen.getByRole("table");
    expect(table.className).toContain("table-fixed");
    fireEvent.click(screen.getAllByRole("button", { name: `Show details for ${artifact.rows.QB[0].playerName}` })[0]);
    expect(screen.getByText(/Pregame information only; research context does not alter/i)).toBeInTheDocument();
    expect(screen.getByText(/Team pass block Rank: \d+(st|nd|rd|th)/i)).toBeInTheDocument();
    expect(screen.getByText(/Opponent pass rush Rank: \d+(st|nd|rd|th)/i)).toBeInTheDocument();
    expect(screen.getAllByText((_, element) => Boolean(element?.textContent?.match(/^Weekly Matchup Edge Rank: \d+(st|nd|rd|th)$/i)))).toHaveLength(3);
  });

  it("renders an opaque sticky desktop header below the site nav", () => {
    const { container } = renderPage();
    const header = container.querySelector("[data-weekly-desktop-sticky-header]");
    expect(header).toBeInTheDocument();
    const cells = [...header!.querySelectorAll("th")];
    expect(cells.every((cell) => cell.className.includes("sticky") && cell.className.includes("top-[73px]") && cell.className.includes("z-30"))).toBe(true);
    expect(cells.every((cell) => cell.className.includes("bg-slate-100") || cell.className.includes("bg-sky-100"))).toBe(true);
  });

  it("renders only the approved position-specific evidence columns", () => {
    renderPage();
    expect(screen.queryByRole("columnheader", { name: "TOUCHES RK" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "RB" }));
    for (const header of ["TOUCHES", "YPC", "REC TARGETS"]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    expect(screen.queryByRole("columnheader", { name: "RZ TOUCHES RK" })).not.toBeInTheDocument();
    expect(screen.queryByText("RZ Touches", { exact: true })).not.toBeInTheDocument();

    const recTargetsIndex = screen.getAllByRole("columnheader").findIndex((header) => header.textContent === "REC TARGETS");
    const recTargetCells = screen.getAllByRole("row").slice(1).map((row) => row.querySelectorAll("td")[recTargetsIndex]).filter(Boolean);
    expect(recTargetCells.some((cell) => cell.className.includes("weekly-heat-gold"))).toBe(true);
    expect(new Set(recTargetCells.map((cell) => cell.getAttribute("data-heat-tone"))).size).toBeGreaterThan(2);

    fireEvent.click(screen.getByRole("button", { name: "TE" }));
    for (const header of ["TARGET %", "AIR YARDS", "TARGETS/G"]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    expect(screen.queryByRole("columnheader", { name: "TOUCHES RK" })).not.toBeInTheDocument();
  });
});
