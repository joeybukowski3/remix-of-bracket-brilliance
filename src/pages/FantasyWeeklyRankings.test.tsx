import type { ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { weeklyFantasyProjectionProductionArtifactSchema } from "@/lib/fantasy/weekly/projections/production/artifactContract";
import { weeklyFantasyResearchArtifactSchema } from "@/lib/fantasy/weekly/researchArtifact";
import { joinWeeklyFantasyResearchRows } from "@/lib/fantasy/weekly/researchJoin";
import { mobilePlayerLastName } from "@/lib/fantasy/weekly/mobilePlayerName";

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
 * Trimmed to the top 10 per position (ranks stay 1..N, so positionRank
 * invariants hold). This is real production data, just fewer rows -- the
 * component under test never depends on the full-size roster, and rendering
 * up to 188 real WR rows twice per test made this file's slowest tests flirt
 * with the default vitest timeout under full-suite parallel load.
 */
const artifact = {
  ...fullArtifact,
  rows: {
    QB: fullArtifact.rows.QB.slice(0, 10),
    RB: fullArtifact.rows.RB.slice(0, 10),
    WR: fullArtifact.rows.WR.slice(0, 10),
    TE: fullArtifact.rows.TE.slice(0, 10),
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
  afterEach(() => vi.unstubAllGlobals());

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
    expect(screen.getAllByRole("columnheader").slice(0, 3).map((header) => header.textContent)).toEqual(["RK", "PLAYER", "OPP"]);
    expect(screen.getByRole("columnheader", { name: "PROJ. PTS" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "SEASON PPG" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "MATCHUP" })).toBeInTheDocument();
    expect(screen.queryByText("ROS Proj PPG")).not.toBeInTheDocument();
  });

  it("exposes the projected points value matching the artifact, ranked correctly", () => {
    renderPage();
    const top = artifact.rows.QB[0];
    expect(screen.getAllByRole("row")[1]).toHaveTextContent(top.projectedFantasyPoints.toFixed(1));
  });

  it("places a collapsed, reversible stat glossary between the Week status bar and position tabs", () => {
    renderPage();
    const metadata = screen.getByRole("region", { name: "Projection metadata" });
    const glossary = screen.getByRole("region", { name: "Weekly Rankings stat glossary" });
    const positionTabs = screen.getByRole("group", { name: "Select position" });
    const toggle = within(glossary).getByRole("button", { name: "What do these stats mean?" });
    const content = document.getElementById(toggle.getAttribute("aria-controls")!);

    expect(metadata.compareDocumentPosition(glossary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(glossary.compareDocumentPosition(positionTabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(content).not.toBeVisible();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(content).toBeVisible();
    for (const definition of ["Rank", "Projected Points", "Season PPG", "EPA Advantage", "Touches", "Target Share", "Targets/Game"]) {
      expect(within(glossary).getByText(definition, { exact: true })).toBeVisible();
    }
    expect(within(glossary).getByText(/#1 is best or most favorable within the metric's comparison pool/)).toBeVisible();
    expect(within(glossary).getByText(/underlying raw statistic while retaining the same heat color/)).toBeVisible();
    expect(within(glossary).getByText(/Gold = elite · Green = favorable · Neutral = middle · Red = unfavorable/)).toBeVisible();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(content).not.toBeVisible();
  });

  it("derives mobile last names without treating common suffixes as surnames", () => {
    expect(mobilePlayerLastName("Patrick Mahomes II")).toBe("Mahomes");
    expect(mobilePlayerLastName("Michael Penix Jr.")).toBe("Penix");
    expect(mobilePlayerLastName("Anthony Richardson Sr.")).toBe("Richardson");
    expect(mobilePlayerLastName("Joe Milton III")).toBe("Milton");
    expect(mobilePlayerLastName("Stetson Bennett IV")).toBe("Bennett");
  });

  it("defaults to Rank View while projected points remain raw in both views", () => {
    const { container } = renderPage();
    const board = screen.getByRole("region", { name: "QB weekly fantasy research board" });
    const statButton = screen.getByRole("button", { name: "Stat View" });
    const rankButton = screen.getByRole("button", { name: "Rank View" });
    const tuples = () => [...container.querySelectorAll("tr[data-player-id]")].map((row) => [
      row.getAttribute("data-player-id"),
      row.querySelector("[data-projected-fantasy-points]")?.getAttribute("data-projected-fantasy-points"),
    ]);
    const before = tuples();

    expect(statButton).toHaveAttribute("aria-pressed", "false");
    expect(rankButton).toHaveAttribute("aria-pressed", "true");
    expect(board).toHaveAttribute("data-display-mode", "rank");
    const projectionCell = screen.getAllByRole("row")[1].querySelectorAll("td")[3];
    const projectionTone = projectionCell.getAttribute("data-heat-tone");
    expect(projectionCell).toHaveTextContent(artifact.rows.QB[0].projectedFantasyPoints.toFixed(1));
    expect(projectionCell).not.toHaveTextContent(`#${artifact.rows.QB[0].positionRank}`);
    expect(projectionTone).toMatch(/gold|green/);
    expect(screen.getAllByRole("row")[1].querySelectorAll("td")[4]).toHaveTextContent(/^#\d+$/);

    fireEvent.click(statButton);
    const statBoard = screen.getByRole("region", { name: "QB weekly fantasy research board" });
    expect(statBoard).toHaveAttribute("data-display-mode", "stat");
    expect(statButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("row")[1].querySelectorAll("td")[3]).toHaveTextContent(artifact.rows.QB[0].projectedFantasyPoints.toFixed(1));
    expect(screen.getAllByRole("row")[1].querySelectorAll("td")[3]).toHaveAttribute("data-heat-tone", projectionTone);
    expect(tuples()).toEqual(before);
  });

  it("uses the shared light grid, player-first identity, compact opponent, and projected-points heat", () => {
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
    expect(firstRow.querySelector("[data-player-team-abbreviation]")).not.toBeInTheDocument();
    expect(firstRow.querySelector("[data-opponent-logo]")).not.toBeInTheDocument();
    expect(cells[2]).toHaveTextContent(new RegExp(artifact.rows.QB[0].homeAway === "away" ? `@${artifact.rows.QB[0].opponent}` : `vs${artifact.rows.QB[0].opponent}`, "i"));
    expect(cells[3].className).toContain("weekly-heat-");
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
    expect(screen.getByRole("heading", { name: "Samples / evidence" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Projection context" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Matchup details" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Projection context" })).toBeInTheDocument();
    expect(screen.getByText(/Team pass block · \d+(st|nd|rd|th)/i)).toBeInTheDocument();
    expect(screen.getByText(/Opponent pass rush · \d+(st|nd|rd|th)/i)).toBeInTheDocument();
    expect(screen.getAllByText((_, element) => Boolean(element?.textContent?.match(/^\d+(st|nd|rd|th) of \d+$/i)))).toHaveLength(3);
    const evidenceCards = [...document.querySelectorAll<HTMLElement>("[data-evidence-card]")];
    expect(evidenceCards.length).toBeGreaterThan(0);
    expect(evidenceCards.every((card) => !card.hasAttribute("data-heat-tone"))).toBe(true);
    expect(evidenceCards.every((card) => card.querySelector("svg"))).toBe(true);
    const matchupCategories = [...document.querySelectorAll<HTMLElement>("[data-matchup-category]")];
    expect(matchupCategories.map((card) => card.dataset.matchupCategory)).toEqual(["trenches", "epa", "success"]);
    expect(new Set(matchupCategories.map((card) => card.className))).toHaveLength(3);
    for (const category of matchupCategories) {
      expect(category.querySelectorAll("[data-matchup-detail-value]")).toHaveLength(4);
      expect([...category.querySelectorAll("[data-quality-tone]")].every((value) => value.getAttribute("data-quality-tone"))).toBe(true);
    }
  });

  it("renders an opaque sticky desktop header below the site nav", () => {
    const { container } = renderPage();
    const header = container.querySelector("[data-weekly-desktop-sticky-header]");
    expect(header).toBeInTheDocument();
    const cells = [...header!.querySelectorAll("th")];
    expect(cells.every((cell) => cell.className.includes("sticky") && cell.className.includes("top-[73px]") && cell.className.includes("z-30"))).toBe(true);
    expect(cells.every((cell) => cell.className.includes("bg-slate-100") || cell.className.includes("bg-sky-100"))).toBe(true);
  });

  it("renders the approved position-specific edge and evidence columns", () => {
    renderPage();
    expect(screen.queryByRole("columnheader", { name: "TOUCHES RK" })).not.toBeInTheDocument();
    for (const header of ["TRENCHES", "EPA ADV.", "SUCCESS ADV."]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("button", { name: "RB" }));
    for (const header of ["TRENCHES", "TOUCHES RK", "YPC RK", "REC TARGETS RK"]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "RK", "PLAYER", "OPP", "PROJ. PTS", "SEASON PPG", "L5 TREND", "MATCHUP", "OPP ALLOWED SZN", "OPP ALLOWED L5",
      "TRENCHES", "TOUCHES RK", "YPC RK", "REC TARGETS RK",
    ]);
    expect(screen.queryByRole("columnheader", { name: "EPA ADV." })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "SUCCESS ADV." })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "RZ TOUCHES RK" })).not.toBeInTheDocument();
    expect(screen.queryByText("RZ Touches", { exact: true })).not.toBeInTheDocument();

    const recTargetsIndex = screen.getAllByRole("columnheader").findIndex((header) => header.textContent === "REC TARGETS RK");
    const recTargetCells = screen.getAllByRole("row").slice(1).map((row) => row.querySelectorAll("td")[recTargetsIndex]).filter(Boolean);
    expect(recTargetCells.some((cell) => cell.className.includes("weekly-heat-gold"))).toBe(true);
    expect(new Set(recTargetCells.map((cell) => cell.getAttribute("data-heat-tone"))).size).toBeGreaterThan(2);

    fireEvent.click(screen.getByRole("button", { name: "WR" }));
    for (const header of ["TRENCHES", "TARGET % RK", "AIR YARDS RK", "TARGETS/G RK"]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent).slice(-4)).toEqual(["TRENCHES", "TARGET % RK", "AIR YARDS RK", "TARGETS/G RK"]);

    fireEvent.click(screen.getByRole("button", { name: "TE" }));
    for (const header of ["TRENCHES", "TARGET % RK", "AIR YARDS RK", "TARGETS/G RK"]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    expect(screen.queryByRole("columnheader", { name: "TOUCHES RK" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent).slice(-4)).toEqual(["TRENCHES", "TARGET % RK", "AIR YARDS RK", "TARGETS/G RK"]);
  }, 15_000);

  it("renders the exact QB column order and keeps matchup transparency in details", () => {
    renderPage();
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "RK", "PLAYER", "OPP", "PROJ. PTS", "SEASON PPG", "L5 TREND", "MATCHUP", "OPP ALLOWED SZN", "OPP ALLOWED L5",
      "TRENCHES", "EPA ADV.", "SUCCESS ADV.",
    ]);
    for (const absent of ["RZ TOUCHES RK", "TOUCHES RK", "TARGET % RK"]) {
      expect(screen.queryByRole("columnheader", { name: absent })).not.toBeInTheDocument();
    }

    fireEvent.click(screen.getAllByRole("button", { name: /Show details for/ })[0]);
    const details = screen.getByRole("heading", { name: "Matchup details" }).closest("section");
    expect(details).toHaveTextContent("Trenches");
    expect(details).toHaveTextContent("EPA advantage");
    expect(details).toHaveTextContent("Success advantage");
  });

  it("uses the matchup cell tone without rendering a nested badge", () => {
    const { container } = renderPage();
    const cell = container.querySelector("[data-matchup-grade-cell]");
    expect(cell).toBeInTheDocument();
    expect(cell).toHaveTextContent(/Great|Good|Neutral|Tough|Very Tough/);
    expect(cell).toHaveAttribute("data-heat-tone");
    expect(cell?.querySelector("span, [class*='rounded'], [class*='border-current']")).not.toBeInTheDocument();
  });

  it("sorts every common desktop column with useful first-click and reversible directions", () => {
    const { container } = renderPage();
    const rows = () => [...container.querySelectorAll<HTMLTableRowElement>("tr[data-player-id]")];
    const numbers = (cellIndex: number) => rows().map((row) => Number(row.cells[cellIndex].textContent?.replace("#", "")));
    const text = (cellIndex: number) => rows().map((row) => row.cells[cellIndex].textContent?.trim().toUpperCase() ?? "");
    const expectAscending = (values: readonly (number | string)[]) => {
      expect(values).toEqual([...values].sort((left, right) => typeof left === "string" ? left.localeCompare(String(right)) : Number(left) - Number(right)));
    };

    expect(numbers(0)).toEqual(artifact.rows.QB.map((row) => row.positionRank));
    fireEvent.click(screen.getByRole("button", { name: "RK" }));
    expect(numbers(0)).toEqual(artifact.rows.QB.map((row) => row.positionRank));
    fireEvent.click(screen.getByRole("button", { name: "RK" }));
    expectAscending([...numbers(0)].reverse());

    fireEvent.click(screen.getByRole("button", { name: "PLAYER" }));
    const playersAscending = text(1);
    expectAscending(playersAscending);
    fireEvent.click(screen.getByRole("button", { name: "PLAYER" }));
    expect(text(1)).toEqual([...playersAscending].reverse());

    fireEvent.click(screen.getByRole("button", { name: "OPP" }));
    expectAscending(text(2).map((value) => value.replace(/^(@|VS)/, "")));

    fireEvent.click(screen.getByRole("button", { name: "PROJ. PTS" }));
    expectAscending([...numbers(3)].reverse());
    fireEvent.click(screen.getByRole("button", { name: "PROJ. PTS" }));
    expectAscending(numbers(3));

    const strength = new Map([["GREAT", 1], ["GOOD", 2], ["NEUTRAL", 3], ["TOUGH", 4], ["VERY TOUGH", 5]]);
    fireEvent.click(screen.getByRole("button", { name: "MATCHUP" }));
    expectAscending(text(6).map((grade) => strength.get(grade) ?? 99));
    fireEvent.click(screen.getByRole("button", { name: "MATCHUP" }));
    expectAscending([...text(6).map((grade) => strength.get(grade) ?? -1)].reverse());

    for (const name of ["SEASON PPG", "L5 TREND", "OPP ALLOWED SZN", "OPP ALLOWED L5"]) {
      fireEvent.click(screen.getByRole("button", { name }));
      expect(screen.getByRole("columnheader", { name })).toHaveAttribute("aria-sort", "ascending");
    }
    for (const name of ["TRENCHES", "EPA ADV.", "SUCCESS ADV."]) {
      fireEvent.click(screen.getByRole("button", { name }));
      expect(screen.getByRole("columnheader", { name })).toHaveAttribute("aria-sort", "ascending");
    }
  }, 30_000);

  it("sorts research by view semantics, keeps N/A last and heat stable, and resets on position change", () => {
    const { container } = renderPage();
    const rows = () => [...container.querySelectorAll<HTMLTableRowElement>("tr[data-player-id]")];
    const values = (cellIndex: number) => rows().map((row) => row.cells[cellIndex].textContent?.trim() ?? "");
    const numericPresent = (cellIndex: number) => values(cellIndex).filter((value) => value !== "N/A").map((value) => Number(value.replace("#", "")));
    const expectDescending = (items: readonly number[]) => expect(items).toEqual([...items].sort((left, right) => right - left));
    const expectAscending = (items: readonly number[]) => expect(items).toEqual([...items].sort((left, right) => left - right));
    const expectMissingLast = (cellIndex: number) => {
      const items = values(cellIndex);
      const firstMissing = items.indexOf("N/A");
      if (firstMissing >= 0) expect(items.slice(firstMissing).every((value) => value === "N/A")).toBe(true);
    };
    const authorityBefore = new Map(rows().map((row) => [row.dataset.playerId, [row.cells[0].textContent, row.querySelector("[data-projected-fantasy-points]")?.getAttribute("data-projected-fantasy-points")]]));
    const heatBefore = new Map(rows().map((row) => [row.dataset.playerId, row.cells[4].getAttribute("data-heat-tone")]));

    fireEvent.click(screen.getByRole("button", { name: "SEASON PPG" }));
    expectAscending(numericPresent(4));
    expectMissingLast(4);
    fireEvent.click(screen.getByRole("button", { name: "SEASON PPG" }));
    expectDescending(numericPresent(4));
    expectMissingLast(4);

    fireEvent.click(screen.getByRole("button", { name: "PLAYER" }));
    for (const row of rows()) {
      expect([row.cells[0].textContent, row.querySelector("[data-projected-fantasy-points]")?.getAttribute("data-projected-fantasy-points")]).toEqual(authorityBefore.get(row.dataset.playerId));
      expect(row.cells[4].getAttribute("data-heat-tone")).toBe(heatBefore.get(row.dataset.playerId));
    }

    fireEvent.click(screen.getByRole("button", { name: "Stat View" }));
    fireEvent.click(screen.getByRole("button", { name: "SEASON PPG" }));
    expectDescending(numericPresent(4));
    expectMissingLast(4);

    fireEvent.click(screen.getByRole("button", { name: "Rank View" }));
    fireEvent.click(screen.getByRole("button", { name: "RB" }));
    expect(values(0).map(Number)).toEqual(artifact.rows.RB.map((row) => row.positionRank));
    fireEvent.click(screen.getByRole("button", { name: "TOUCHES RK" }));
    expectAscending(numericPresent(10));
    expectMissingLast(10);
    fireEvent.click(screen.getByRole("button", { name: "TOUCHES RK" }));
    expectDescending(numericPresent(10));
    expectMissingLast(10);
  }, 30_000);

  it("renders a single-row scrollable mobile grid with frozen identity columns and expandable written details", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: true,
      media: "(max-width: 1023px)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
    const { container } = renderPage();
    const board = screen.getByRole("region", { name: "QB weekly fantasy research board" });
    expect(board).toHaveAttribute("data-display-mode", "rank");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const mobileHeader = container.querySelector<HTMLElement>("[data-mobile-weekly-header]")!;
    expect(mobileHeader.textContent).toBe("RKPLRPROJSZNL5MUOAO5TREPASR");
    expect(within(mobileHeader).getAllByRole("columnheader").map((header) => header.getAttribute("aria-label"))).toEqual([
      "Rank", "Team logo", "Player", "Projected Points", "Season PPG", "Last 5 Trend", "Matchup",
      "Opp Allowed SZN", "Opp Allowed L5", "Trenches", "EPA Advantage", "Success Rate Advantage",
    ]);
    expect(container.querySelectorAll("[data-mobile-weekly-header]")).toHaveLength(1);
    expect(container.querySelector("[data-mobile-table-scroll]")?.className).toContain("overflow-x-auto");
    expect(container.querySelectorAll('[data-mobile-weekly-header] [data-mobile-sticky="rank"], [data-mobile-weekly-header] [data-mobile-sticky="logo"], [data-mobile-weekly-header] [data-mobile-sticky="last-name"]')).toHaveLength(3);

    const first = container.querySelector<HTMLElement>("[data-mobile-weekly-row]")!;
    expect(mobileHeader.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(mobileHeader.style.gridTemplateColumns).toBe(first.querySelector<HTMLElement>("button")?.style.gridTemplateColumns);
    expect(mobileHeader.style.gridTemplateColumns).toBe("30px 28px 88px 52px repeat(8, 54px)");
    expect(first.querySelector("[data-team-logo]")).toBeInTheDocument();
    expect(first.querySelectorAll('[data-mobile-sticky="rank"], [data-mobile-sticky="logo"], [data-mobile-sticky="last-name"]')).toHaveLength(3);
    expect(first.className).toContain("border-b-2");
    expect(first.querySelector("[data-player-team-abbreviation]")).not.toBeInTheDocument();
    expect(first.querySelector("[data-player-name]")).toHaveTextContent(artifact.rows.QB[0].playerName.trim().split(/\s+/).at(-1)!);
    expect(first.querySelector("[data-projected-fantasy-points]")).toHaveTextContent(/^\d+\.\d$/);
    expect(first.querySelector("[data-display-rank]")).toHaveTextContent(/^#\d+$/);

    fireEvent.click(first.querySelector("button")!);
    expect(screen.getByRole("heading", { name: artifact.rows.QB[0].playerName })).toBeInTheDocument();
    for (const label of ["Season PPG", "Last 5 Trend", "Matchup", "Opponent Allowed Season", "Opponent Allowed Last 5", "Trenches", "EPA Advantage", "Success Advantage"]) {
      expect(screen.getAllByText(label, { exact: true }).length).toBeGreaterThan(0);
    }
    fireEvent.click(screen.getByRole("button", { name: "Stat View" }));
    expect(screen.getByRole("region", { name: "QB weekly fantasy research board" })).toHaveAttribute("data-display-mode", "stat");
    fireEvent.click(screen.getByRole("button", { name: "RB" }));
    expect(container.querySelector("[data-mobile-weekly-header]")?.textContent).toBe("RKPLRPROJSZNL5MUOAO5TRTCHYPCTGT");
    fireEvent.click(screen.getByRole("button", { name: "WR" }));
    expect(container.querySelector("[data-mobile-weekly-header]")?.textContent).toBe("RKPLRPROJSZNL5MUOAO5TRT%AYT/G");
    fireEvent.click(screen.getByRole("button", { name: "TE" }));
    expect(container.querySelector("[data-mobile-weekly-header]")?.textContent).toBe("RKPLRPROJSZNL5MUOAO5TRT%AYT/G");
  });
});
