import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Every artifact is served from the real committed fixture so the page renders
// synchronously and jsdom never issues a fetch. require() is deliberate: these
// factories are hoisted above the ESM imports below.
function fixture(relativePath: string) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require("node:path") as typeof import("node:path");
  return JSON.parse(readFileSync(join(process.cwd(), relativePath), "utf-8"));
}

vi.mock("@/hooks/useNflSeasonData", () => ({
  useNflSeasonData: () => {
    const games = fixture("public/data/nfl/2026/games.json");
    const teams = fixture("public/data/nfl/teams.json");
    return {
      loading: false,
      error: null,
      data: {
        teams: teams.teams,
        games: games.games,
        results: [],
        gamesMeta: games._meta ?? null,
        resultsMeta: null,
      },
    };
  },
}));

vi.mock("@/hooks/useNflMatchupEpa", () => ({
  useNflMatchupEpa: () => ({
    loading: false,
    error: null,
    artifact: fixture("public/data/nfl/matchup-epa.json"),
  }),
}));

vi.mock("@/hooks/useNflMatchupMetrics", () => ({
  useNflMatchupMetrics: () => ({
    loading: false,
    error: null,
    artifact: fixture("public/data/nfl/matchup-metrics.json"),
  }),
}));

vi.mock("@/hooks/useNflSuccessRates", () => ({
  useNflSuccessRates: () => ({
    loading: false,
    error: null,
    artifact: fixture("public/data/nfl/matchup-success-rates.json"),
  }),
}));

vi.mock("@/components/layout/SiteShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: vi.fn() }));

import App from "@/App";
import FantasyWeeklyRankings from "@/pages/FantasyWeeklyRankings";
import { getPointsAllowedTeam } from "@/lib/fantasy/pointsAllowed2025";
import { getPercentileGradientColor } from "@/lib/fantasy/parPresentation";

const ROUTE = "/fantasy-football/weekly-rankings";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[ROUTE]}>
      <Routes>
        <Route path={ROUTE} element={<FantasyWeeklyRankings />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Forces the table's `(max-width: 767px)` branch on or off. */
function stubCompactViewport(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  );
}

function positionTab(position: string) {
  return within(screen.getByRole("group", { name: "Select position" })).getByRole("button", {
    name: position,
  });
}

function displayTab(mode: string) {
  return within(screen.getByRole("group", { name: "Stat display" })).getByRole("button", {
    name: mode,
  });
}

function dataRows() {
  return within(screen.getByRole("table")).getAllByRole("row").slice(1);
}

function cells(row: HTMLElement) {
  return Array.from(row.querySelectorAll("td"));
}

/** The first position-specific stat column sits directly after FPA Rk. */
const FIRST_STAT_CELL = 8;

function sortHeader(label: string) {
  return within(screen.getByRole("table")).getByRole("button", { name: new RegExp(`^${label}`) });
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, "", "/");
});

describe("Week 1 Fantasy Rankings — page shell", () => {
  beforeEach(() => stubCompactViewport(false));

  it("renders the page with its Week 1 title", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { level: 1, name: "Week 1 Fantasy Rankings" }),
    ).toBeTruthy();
  });

  it("is reachable through the app route", async () => {
    window.history.pushState({}, "", ROUTE);
    render(<App />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Week 1 Fantasy Rankings" }),
    ).toBeTruthy();
  }, 30000);

  // The page sits outside NflPlatformLayout, so it applies the shared gutter
  // token itself rather than rendering flush against the viewport edge.
  it("wraps its content in the shared site container", () => {
    renderPage();
    const main = document.querySelector("main");
    expect(main).toBeTruthy();
    expect(main!.className).toContain("site-container");
    expect(main!.contains(screen.getByRole("heading", { level: 1 }))).toBe(true);
    expect(main!.contains(screen.getByRole("table"))).toBe(true);
    expect(main!.contains(screen.getByRole("group", { name: "Select position" }))).toBe(true);
  });

  it("keeps the table capped rather than full-bleed", () => {
    renderPage();
    const section = screen.getByRole("table").closest("section");
    expect(section?.className).toContain("max-w-5xl");
  });
});

describe("Week 1 Fantasy Rankings — projected PPG labelling", () => {
  beforeEach(() => stubCompactViewport(false));

  it("labels the ranking column Proj PPG", () => {
    renderPage();
    expect(sortHeader("Proj PPG")).toBeTruthy();
    expect(within(screen.getByRole("table")).queryByRole("button", { name: /^PPG$/ })).toBeNull();
  });

  it("states in the supporting copy that the order is 2026 projected PPG", () => {
    renderPage();
    expect(screen.getByText(/Ranked by 2026 projected PPG only/i)).toBeTruthy();
    expect(screen.getByText(/they do not change the order/i)).toBeTruthy();
    expect(screen.getByText(/Ranked by 2026 projected PPG · matchup columns are 2025 actual data/i))
      .toBeTruthy();
  });

  it("keeps the value itself unchanged", () => {
    renderPage();
    expect(cells(dataRows()[0])[4].textContent).toBe("23.3");
  });
});

describe("Week 1 Fantasy Rankings — percentile / raw toggle", () => {
  beforeEach(() => stubCompactViewport(false));

  it("defaults to Percentile", () => {
    renderPage();
    expect(displayTab("Percentile")).toHaveAttribute("aria-pressed", "true");
    expect(displayTab("Raw")).toHaveAttribute("aria-pressed", "false");
  });

  it("shows a 0-100 percentile in the stat columns by default", () => {
    renderPage();
    for (const row of dataRows().slice(0, 5)) {
      const value = Number(cells(row)[FIRST_STAT_CELL].textContent);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it("switches the stat columns to raw values", () => {
    renderPage();
    fireEvent.click(displayTab("Raw"));
    expect(displayTab("Raw")).toHaveAttribute("aria-pressed", "true");

    const row = cells(dataRows()[0]);
    // Pass EPA / Rush EPA are signed 3dp; YPA is 2dp.
    expect(row[8].textContent).toMatch(/^[+-]\d\.\d{3}$/);
    expect(row[9].textContent).toMatch(/^[+-]\d\.\d{3}$/);
    expect(row[10].textContent).toMatch(/^\d+\.\d{2}$/);
  });

  it("leaves projected PPG, ranking and matchup columns untouched", () => {
    renderPage();
    const before = dataRows().map((row) => {
      const c = cells(row);
      return [c[0].textContent, c[1].textContent, c[4].textContent, c[6].textContent, c[7].textContent];
    });

    fireEvent.click(displayTab("Raw"));

    const after = dataRows().map((row) => {
      const c = cells(row);
      return [c[0].textContent, c[1].textContent, c[4].textContent, c[6].textContent, c[7].textContent];
    });
    expect(after).toEqual(before);
  });

  it("persists the display mode across a position change", () => {
    renderPage();
    fireEvent.click(displayTab("Raw"));
    fireEvent.click(positionTab("WR"));
    expect(displayTab("Raw")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Week 1 Fantasy Rankings — stat gradients", () => {
  beforeEach(() => stubCompactViewport(false));

  it("runs the ramp emerald at 100, slate at 50 and rose at 0", () => {
    expect(getPercentileGradientColor(100)).toBe("rgb(209, 250, 229)");
    expect(getPercentileGradientColor(50)).toBe("rgb(241, 245, 249)");
    expect(getPercentileGradientColor(0)).toBe("rgb(255, 228, 230)");
    expect(getPercentileGradientColor(null)).toBeUndefined();
  });

  it("shades each stat cell by its own team percentile, best-first down the column", () => {
    renderPage();
    fireEvent.click(sortHeader("Pass EPA"));

    const rows = dataRows();
    const cellAt = (index: number) =>
      cells(rows[index])[FIRST_STAT_CELL].querySelector("span")!;

    const best = cellAt(0);
    const worst = cellAt(rows.length - 1);

    // The QB board carries 18 of the 32 teams, and percentiles are computed over
    // all 32 — so the board's weakest QB team is not the league's weakest, and
    // its percentile is correctly above 0. That gap is the whole point of
    // ranking against teams rather than against the rows on screen.
    expect(Number(best.textContent)).toBeGreaterThan(Number(worst.textContent));
    expect(best.style.backgroundColor).toBe(
      getPercentileGradientColor(Number(best.textContent)),
    );
    expect(worst.style.backgroundColor).toBe(
      getPercentileGradientColor(Number(worst.textContent)),
    );

    // Strongest reads green, weakest on the board reads red.
    expect(best.style.backgroundColor).toBe("rgb(209, 250, 229)");
    expect(worst.style.backgroundColor).toMatch(/^rgb\(25[0-5], 2\d\d, 2\d\d\)$/);
  });

  it("keeps the percentile-driven background in Raw mode", () => {
    renderPage();
    const percentileCell = () =>
      cells(dataRows()[0])[FIRST_STAT_CELL].querySelector("span")!;

    const before = percentileCell();
    const backgroundBefore = before.style.backgroundColor;
    const textBefore = before.textContent;

    fireEvent.click(displayTab("Raw"));

    const after = percentileCell();
    expect(after.style.backgroundColor).toBe(backgroundBefore);
    expect(after.textContent).not.toBe(textBefore);
    expect(backgroundBefore).toBeTruthy();
  });
});

describe("Week 1 Fantasy Rankings — sorting", () => {
  beforeEach(() => stubCompactViewport(false));

  const ppgOf = (row: HTMLElement) => Number(cells(row)[4].textContent);
  const rankOf = (row: HTMLElement) => Number(cells(row)[0].textContent);
  const statOf = (row: HTMLElement) => Number(cells(row)[FIRST_STAT_CELL].textContent);
  const fpaRankOf = (row: HTMLElement) => Number(cells(row)[7].textContent);

  it("opens on projected PPG descending", () => {
    renderPage();
    const values = dataRows().map(ppgOf);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i - 1]).toBeGreaterThanOrEqual(values[i]);
    }
    expect(dataRows().map(rankOf)).toEqual(dataRows().map((_, i) => i + 1));
  });

  it("sorts a stat column best-first on the first click", () => {
    renderPage();
    fireEvent.click(sortHeader("Pass EPA"));
    const values = dataRows().map(statOf);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i - 1]).toBeGreaterThanOrEqual(values[i]);
    }
  });

  it("reverses on the second click", () => {
    renderPage();
    fireEvent.click(sortHeader("Pass EPA"));
    fireEvent.click(sortHeader("Pass EPA"));
    const values = dataRows().map(statOf);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i - 1]).toBeLessThanOrEqual(values[i]);
    }
  });

  it("marks the active header for assistive technology", () => {
    renderPage();
    const header = () =>
      within(screen.getByRole("table"))
        .getAllByRole("columnheader")
        .find((cell) => cell.textContent?.startsWith("Pass EPA"))!;

    expect(header()).toHaveAttribute("aria-sort", "none");
    fireEvent.click(sortHeader("Pass EPA"));
    expect(header()).toHaveAttribute("aria-sort", "descending");
    fireEvent.click(sortHeader("Pass EPA"));
    expect(header()).toHaveAttribute("aria-sort", "ascending");
  });

  it("sorts the FPA columns", () => {
    renderPage();
    fireEvent.click(sortHeader("FPA Rk"));
    const ranks = dataRows().map(fpaRankOf);
    expect(ranks[0]).toBe(1);
    for (let i = 1; i < ranks.length; i += 1) {
      expect(ranks[i - 1]).toBeLessThanOrEqual(ranks[i]);
    }

    fireEvent.click(sortHeader("2025 FPA/G"));
    const allowed = dataRows().map((row) => Number(cells(row)[6].textContent));
    for (let i = 1; i < allowed.length; i += 1) {
      expect(allowed[i - 1]).toBeGreaterThanOrEqual(allowed[i]);
    }
  });

  it("restores projected PPG order when that header is clicked", () => {
    renderPage();
    fireEvent.click(sortHeader("Pass EPA"));
    expect(dataRows().map(rankOf)).not.toEqual(dataRows().map((_, i) => i + 1));

    fireEvent.click(sortHeader("Proj PPG"));
    expect(dataRows().map(rankOf)).toEqual(dataRows().map((_, i) => i + 1));
  });

  it("keeps RK as the fantasy rank while an exploratory sort is active", () => {
    renderPage();
    fireEvent.click(sortHeader("FPA Rk"));

    const ranks = dataRows().map(rankOf);
    // Every fantasy rank is still present exactly once, just reordered.
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks.map((_, i) => i + 1));
    expect(ranks).not.toEqual(ranks.map((_, i) => i + 1));
    expect(screen.getByText(/RK stays the 2026 projected PPG fantasy rank/i)).toBeTruthy();
  });

  it("resets to projected PPG when the position tab changes", () => {
    renderPage();
    fireEvent.click(sortHeader("Pass EPA"));
    expect(dataRows().map(rankOf)).not.toEqual(dataRows().map((_, i) => i + 1));

    fireEvent.click(positionTab("WR"));
    expect(dataRows().map(rankOf)).toEqual(dataRows().map((_, i) => i + 1));
  });

  it("is unaffected by the percentile/raw toggle", () => {
    renderPage();
    fireEvent.click(sortHeader("Pass EPA"));
    const before = dataRows().map((row) => cells(row)[1].textContent);

    fireEvent.click(displayTab("Raw"));
    expect(dataRows().map((row) => cells(row)[1].textContent)).toEqual(before);
  });
});

describe("Week 1 Fantasy Rankings — positions and matchup context", () => {
  beforeEach(() => stubCompactViewport(false));

  it("defaults to QB", () => {
    renderPage();
    expect(positionTab("QB")).toHaveAttribute("aria-pressed", "true");
    for (const other of ["RB", "WR", "TE"]) {
      expect(positionTab(other)).toHaveAttribute("aria-pressed", "false");
    }
    expect(screen.getByRole("heading", { level: 2, name: /Week 1 QB/ })).toBeTruthy();
  });

  it("offers QB, RB, WR and TE only — no K or DST", () => {
    renderPage();
    const tabs = within(screen.getByRole("group", { name: "Select position" })).getAllByRole(
      "button",
    );
    expect(tabs.map((tab) => tab.textContent)).toEqual(["QB", "RB", "WR", "TE"]);
  });

  it("switches the board between every position", () => {
    renderPage();
    for (const position of ["RB", "WR", "TE", "QB"]) {
      fireEvent.click(positionTab(position));
      expect(positionTab(position)).toHaveAttribute("aria-pressed", "true");
      expect(
        screen.getByRole("heading", { level: 2, name: new RegExp(`Week 1 ${position}`) }),
      ).toBeTruthy();
    }
  });

  it("uses each position's own stat columns", () => {
    renderPage();
    const headers = () =>
      within(screen.getByRole("table"))
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent);

    expect(headers()).toEqual([
      "Rk",
      "Player",
      "Team",
      "Opp",
      "Proj PPG",
      "Matchup",
      "2025 FPA/G",
      "FPA Rk",
      "Pass EPA",
      "Rush EPA",
      "YPA",
    ]);

    fireEvent.click(positionTab("RB"));
    expect(headers().slice(-3)).toEqual(["Rush EPA", "Y/C", "Rush Succ%"]);

    fireEvent.click(positionTab("WR"));
    expect(headers().slice(-3)).toEqual(["Pass EPA", "YPA", "Pass Y/G"]);

    fireEvent.click(positionTab("TE"));
    expect(headers().slice(-2)).toEqual(["Pass EPA", "YPA"]);
  });

  it("labels the fantasy points allowed columns as 2025 data", () => {
    renderPage();
    expect(sortHeader("2025 FPA/G")).toBeTruthy();
    expect(screen.getByText(/matchup columns are 2025 actual data/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: "2025 fantasy points allowed" })).toHaveAttribute(
      "href",
      "/fantasy-football/points-allowed",
    );
  });

  it("renders the top QB row with its real Week 1 matchup", () => {
    renderPage();
    const row = cells(dataRows()[0]);
    const houston = getPointsAllowedTeam("hou")!.byPosition.QB;

    expect(row[1].textContent).toBe("Josh Allen");
    expect(row[2].textContent).toBe("buf");
    expect(row[3].textContent).toBe("@ HOU");
    expect(row[4].textContent).toBe("23.3");
    expect(row[6].textContent).toBe(houston.pointsAllowed.toFixed(1));
    expect(row[7].textContent).toBe(String(houston.rank));
  });

  it("renders home, away and neutral-site opponent notation", () => {
    renderPage();
    const table = within(screen.getByRole("table"));
    expect(table.getByText("@ HOU")).toBeTruthy();
    expect(table.getByText("vs TB")).toBeTruthy();

    // 2026_01_SF_LA is played at a neutral site (Melbourne).
    fireEvent.click(positionTab("WR"));
    expect(within(screen.getByRole("table")).getAllByText("N SF").length).toBeGreaterThan(0);
  });

  it("shades an easy matchup green and a hard one red", () => {
    renderPage();
    const rows = dataRows();

    const great = rows.find((row) => within(row).queryByText("Great"));
    const veryTough = rows.find((row) => within(row).queryByText("Very Tough"));
    expect(great, "expected at least one Great matchup").toBeTruthy();
    expect(veryTough, "expected at least one Very Tough matchup").toBeTruthy();

    expect(within(great!).getByText("Great").className).toContain("emerald");
    expect(within(veryTough!).getByText("Very Tough").className).toContain("rose");

    expect(Number(cells(great!)[7].textContent)).toBeLessThanOrEqual(6);
    expect(Number(cells(veryTough!)[7].textContent)).toBeGreaterThanOrEqual(27);
  });

  it("reports no unresolved players for the current universe", () => {
    renderPage();
    expect(screen.queryByText(/no resolvable Week 1 matchup/i)).toBeNull();
  });
});

describe("Week 1 Fantasy Rankings — compact layout", () => {
  beforeEach(() => stubCompactViewport(true));

  it("drops the wide table for stacked rows", () => {
    renderPage();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0);
  });

  it("keeps rank, player, team, opponent, projected PPG, matchup and FPA rank", () => {
    renderPage();
    const first = screen.getAllByRole("listitem")[0];
    const houston = getPointsAllowedTeam("hou")!.byPosition.QB;

    expect(within(first).getByText("1")).toBeTruthy();
    expect(within(first).getByText("Josh Allen")).toBeTruthy();
    expect(within(first).getByText("buf")).toBeTruthy();
    expect(within(first).getByText("@ HOU")).toBeTruthy();
    expect(within(first).getByText("23.3")).toBeTruthy();
    expect(within(first).getByText(`FPA #${houston.rank}`)).toBeTruthy();
    expect(first.textContent).toMatch(/Great|Good|Neutral|Tough|Very Tough/);
  });

  // The toggle only drives the stat columns, which the compact list does not
  // render — showing it there would be a control with no visible effect.
  it("hides the stat display toggle", () => {
    renderPage();
    expect(screen.queryByRole("group", { name: "Stat display" })).toBeNull();
    expect(screen.getByRole("group", { name: "Select position" })).toBeTruthy();
  });

  it("stays in fantasy-rank order and still switches positions", () => {
    renderPage();
    fireEvent.click(positionTab("TE"));
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]).getByText("Brock Bowers")).toBeTruthy();
    expect(within(items[0]).getByText("vs MIA")).toBeTruthy();
    expect(within(items[0]).getByText("1")).toBeTruthy();
  });

  it("keeps the shared site container", () => {
    renderPage();
    expect(document.querySelector("main")?.className).toContain("site-container");
  });
});
