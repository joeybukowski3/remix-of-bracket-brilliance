import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { weeklyFantasyProjectionProductionArtifactSchema } from "@/lib/fantasy/weekly/projections/production/artifactContract";

function fixture(relativePath: string) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require("node:path") as typeof import("node:path");
  return JSON.parse(readFileSync(join(process.cwd(), relativePath), "utf-8"));
}

const fullArtifact = weeklyFantasyProjectionProductionArtifactSchema.parse(fixture("public/data/fantasy/projections/2026/week-01.json"));

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

vi.mock("@/hooks/useWeeklyFantasyProjectionArtifact", () => ({ useWeeklyFantasyProjectionArtifact: mockWeekly }));
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
    expect(screen.getByText("Projected Pts")).toBeInTheDocument();
    expect(screen.getByText("Confidence")).toBeInTheDocument();
    expect(screen.queryByText("ROS Proj PPG")).not.toBeInTheDocument();
  });

  it("exposes the projected points value matching the artifact, ranked correctly", () => {
    renderPage();
    const top = artifact.rows.QB[0];
    expect(screen.getAllByRole("row")[1]).toHaveTextContent(top.projectedFantasyPoints.toFixed(1));
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
    fireEvent.click(screen.getByRole("button", { name: `Show details for ${artifact.rows.QB[0].playerName}` }));
    expect(screen.getByText(/Pregame information only, no target-week results used/i)).toBeInTheDocument();
  });
});
