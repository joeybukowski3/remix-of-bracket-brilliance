import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render as rtlRender, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import PositionParBoard from "@/components/fantasy/PositionParBoard";
import { POSITION_BOARD_CONFIGS } from "@/lib/fantasy/positionBoardConfig";
import { PAR_POSITIONS, PAR_POSITION_LIMITS } from "@/lib/fantasy/parRankings";

/** The board links to the points-allowed reference, so it needs a router. */
function render(ui: ReactElement) {
  return rtlRender(<MemoryRouter>{ui}</MemoryRouter>);
}

/** Forces the board's `(max-width: 767px)` branch on or off. */
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

afterEach(() => vi.unstubAllGlobals());

describe.each(PAR_POSITIONS)("%s wide layout", (position) => {
  beforeEach(() => stubCompactViewport(false));
  const config = POSITION_BOARD_CONFIGS[position];

  it("renders the sportsbook-style grid with the shared column groups", () => {
    render(<PositionParBoard position={position} query="" />);
    const table = screen.getByRole("table");
    for (const group of ["Season", "Position evidence", "Team context / playoffs"]) {
      expect(within(table).getByText(group)).toBeTruthy();
    }
    expect(within(table).queryByText("AVG Rk")).toBeNull();
  });

  it("labels the three evidence columns for this position", () => {
    render(<PositionParBoard position={position} query="" />);
    const table = screen.getByRole("table");
    for (const label of config.metricLabels) {
      expect(within(table).getByText(label)).toBeTruthy();
    }
  });

  it("labels rank as the position abbreviation, sorted PAR/G descending", () => {
    render(<PositionParBoard position={position} query="" />);
    const table = screen.getByRole("table");
    const ranks = within(table)
      .getAllByText(new RegExp(`^${position}\\d+$`))
      .map((node) => Number(node.textContent!.slice(position.length)));
    expect(ranks).toHaveLength(PAR_POSITION_LIMITS[position]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it("shows the approved baseline and keeps the outside pool section", () => {
    render(<PositionParBoard position={position} query="" />);
    expect(screen.getByText(new RegExp(`PAR baseline: ${config.baselineLabel}`))).toBeTruthy();
    expect(screen.getByText("Outside Draft Pool")).toBeTruthy();
  });

  it("reports an empty state when nothing matches the search", () => {
    render(<PositionParBoard position={position} query="zzz-no-player" />);
    expect(screen.getByText(/No players match/i)).toBeTruthy();
  });
});

describe("Season PAR stack across positions", () => {
  beforeEach(() => stubCompactViewport(false));

  it.each([
    ["QB" as const, "josh allen", "+90.2", "+69.5"],
    ["RB" as const, "jahmyr gibbs", "+159.6", "+160.7"],
    ["WR" as const, "puka nacua", "+132.4", "+203.1"],
    ["TE" as const, "trey mcbride", "+83.6", "+137.1"],
  ])("stacks both years for %s", (position, query, proj, actual) => {
    render(<PositionParBoard position={position} query={query} />);
    const row = screen.getAllByRole("row").at(-1)!;
    expect(within(row).getByText("'26 proj")).toBeTruthy();
    expect(within(row).getByText(proj)).toBeTruthy();
    expect(within(row).getByText("'25 actual")).toBeTruthy();
    expect(within(row).getByText(actual)).toBeTruthy();
  });

  it("omits the 2025 line for a tiered rookie with no 2025 stats", () => {
    render(<PositionParBoard position="RB" query="jeremiyah love" />);
    const row = screen.getAllByRole("row").at(-1)!;
    expect(within(row).getByText("'26 proj")).toBeTruthy();
    expect(within(row).queryByText("'25 actual")).toBeNull();
  });

  it("omits both lines for outside-pool rows, which have no PAR row", () => {
    render(<PositionParBoard position="RB" query="devin singletary" />);
    const row = screen.getAllByRole("row").at(-1)!;
    expect(within(row).queryByText("'26 proj")).toBeNull();
    expect(within(row).queryByText("'25 actual")).toBeNull();
  });

  it("gives each position exactly its joined-row count a 2025 line", () => {
    for (const [position, expected] of [
      ["QB", 18],
      ["RB", 59],
      ["WR", 70],
      ["TE", 18],
    ] as const) {
      const { unmount } = render(<PositionParBoard position={position} query="" />);
      expect(screen.getAllByText("'25 actual")).toHaveLength(expected);
      unmount();
    }
  });
});

describe("borrowed team context", () => {
  beforeEach(() => stubCompactViewport(false));

  it("fills SOS, o-line and playoff weeks for a player with no workbook row", () => {
    render(<PositionParBoard position="WR" query="kayshon boutte" />);
    const row = screen.getAllByRole("row").at(-1)!;
    // Borrowed from A.J. Brown (NE): SOS 28, o-line 15, @KC / @NYJ / DEN.
    for (const value of ["28", "15", "@KC", "@NYJ", "DEN"]) {
      expect(within(row).getByText(value)).toBeTruthy();
    }
  });

  it("takes positional SOS from a same-position teammate, not the team donor", () => {
    render(<PositionParBoard position="WR" query="tyquan thornton" />);
    const row = screen.getAllByRole("row").at(-1)!;
    // O-line/weeks from Kenneth Walker (KC), SOS 15 from Rashee Rice (KC WR).
    for (const value of ["15", "23", "NE", "SF", "@LAC"]) {
      expect(within(row).getByText(value)).toBeTruthy();
    }
  });

  it("leaves the three player-level evidence metrics blank", () => {
    render(<PositionParBoard position="WR" query="kayshon boutte" />);
    const row = screen.getAllByRole("row").at(-1)!;
    // Tier, rank, PAR/G, proj PPG, Season PAR are populated; the 3 metrics are not.
    expect(within(row).getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  it("shows Kyle Pitts' own metrics, resolved through the alias list", () => {
    render(<PositionParBoard position="TE" query="kyle pitts" />);
    const cells = [...screen.getAllByRole("row").at(-1)!.querySelectorAll("td")].map(
      (cell) => cell.textContent!.trim(),
    );
    // Tier, rank, player, PAR/G, proj PPG, Season PAR, then the 3 evidence
    // metrics (his own), Last 8, SOS, o-line, and the three playoff weeks.
    expect(cells.slice(6, 12)).toEqual(["3", "14", "10", "3", "6", "10"]);
    expect(cells.slice(12, 15)).toEqual(["@WAS", "TB", "NO"]);
    expect(cells).not.toContain("—");
  });
});

describe("Last 8 Rk column", () => {
  beforeEach(() => stubCompactViewport(false));

  it("renders inside the Position evidence group on every position", () => {
    for (const position of PAR_POSITIONS) {
      const { unmount } = render(<PositionParBoard position={position} query="" />);
      expect(within(screen.getByRole("table")).getByText("Last 8 Rk")).toBeTruthy();
      unmount();
    }
  }, 20000);

  it("shades the value on its own scale and bolds it", () => {
    render(<PositionParBoard position="RB" query="jahmyr gibbs" />);
    const cells = [...screen.getAllByRole("row").at(-1)!.querySelectorAll("td")];
    const lastEight = cells[9];
    expect(lastEight.textContent).toBe("3");
    expect(lastEight.className).toContain("font-bold");
    expect(lastEight.style.backgroundColor).not.toBe("");
  });

  it("renders a dash, never a zero, when the field is missing", () => {
    // Boutte has no workbook row at all, so no late-season rank exists. It is
    // player level, so it is never borrowed from a teammate either.
    render(<PositionParBoard position="WR" query="kayshon boutte" />);
    const cells = [...screen.getAllByRole("row").at(-1)!.querySelectorAll("td")];
    expect(cells[9].textContent).toBe("—");
    expect(cells[9].style.backgroundColor).toBe("");
  });
});

describe("cell typography and borders", () => {
  beforeEach(() => stubCompactViewport(false));

  it("bolds every secondary rank value at 11px", () => {
    render(<PositionParBoard position="RB" query="jahmyr gibbs" />);
    const cells = [...screen.getAllByRole("row").at(-1)!.querySelectorAll("td")];
    // Evidence x3, Last 8, SOS, O-line, and the three playoff weeks.
    for (const index of [6, 7, 8, 9, 10, 11, 12, 13, 14]) {
      expect(cells[index].className).toContain("font-bold");
      expect(cells[index].className).toContain("text-[11px]");
    }
  });

  it("puts a light separator on body cells, distinct from the tier divider", () => {
    render(<PositionParBoard position="RB" query="" />);
    const rows = screen.getAllByRole("row");
    const cell = rows.at(-1)!.querySelector("td")!;
    expect(cell.className).toContain("border-slate-100");

    // The tier rule must target cells: CSS ignores <tr> borders under
    // border-separate, which is how this silently failed to render before.
    const tierStart = rows.find((row) => row.className.includes("border-t-2"))!;
    expect(tierStart.className).toContain("[&>td]:border-t-2");
    expect(tierStart.className).toContain("[&>td]:border-t-slate-300");
  }, 15000);
});

describe("tier display toggle", () => {
  beforeEach(() => stubCompactViewport(false));

  it("defaults to compact chips with a thin rule and no break rows", () => {
    render(<PositionParBoard position="RB" query="" />);
    expect(screen.getByRole("button", { name: "Compact tiers" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByText(/^Tier 1$/)).toBeNull();
    expect(screen.getAllByText("T1").length).toBeGreaterThan(0);
  }, 15000);

  it("switches to full-width tier break rows showing the PAR/G span", () => {
    render(<PositionParBoard position="RB" query="" />);
    fireEvent.click(screen.getByRole("button", { name: "Full tier breaks" }));

    expect(screen.getByText("Tier 1")).toBeTruthy();
    expect(screen.getByText("Tier 2")).toBeTruthy();
    expect(screen.getByText(/PAR\/G \+10\.72 to \+9\.94/)).toBeTruthy();
    // Tier chips stay on each row; only the divider style changes.
    expect(screen.getAllByText("T1").length).toBeGreaterThan(0);
  }, 15000);

  it("drops the thin rule in full mode so the two do not double up", () => {
    render(<PositionParBoard position="RB" query="" />);
    fireEvent.click(screen.getByRole("button", { name: "Full tier breaks" }));
    expect(screen.getAllByRole("row").some((r) => r.className.includes("border-t-2"))).toBe(false);
  }, 15000);

  it("uses the same tier data in both modes", () => {
    render(<PositionParBoard position="TE" query="" />);
    const compactChips = screen.getAllByText(/^T\d+$/).length;

    fireEvent.click(screen.getByRole("button", { name: "Full tier breaks" }));
    expect(screen.getAllByText(/^T\d+$/).length).toBe(compactChips);
  }, 15000);
});

describe("row click to expand", () => {
  beforeEach(() => stubCompactViewport(false));

  it("toggles when any cell in the row is clicked", () => {
    render(<PositionParBoard position="RB" query="jahmyr gibbs" />);
    const row = screen.getAllByRole("row").at(-1)!;
    expect(screen.queryByText(/2025 finish/i)).toBeNull();

    fireEvent.click(row.querySelectorAll("td")[2]); // the player-name cell
    expect(screen.getByText(/2025 finish/i)).toBeTruthy();

    fireEvent.click(row.querySelectorAll("td")[6]); // an evidence cell
    expect(screen.queryByText(/2025 finish/i)).toBeNull();
  });

  it("keeps the row as a table row and the chevron as the keyboard control", () => {
    render(<PositionParBoard position="RB" query="jahmyr gibbs" />);
    const row = screen.getAllByRole("row").at(-1)!;
    // Overriding the row's role would drop the grid structure for screen readers.
    expect(row.getAttribute("role")).toBeNull();
    expect(row.className).toContain("cursor-pointer");

    const control = screen.getByRole("button", { name: "Show details for Jahmyr Gibbs" });
    expect(control.tagName).toBe("BUTTON");
    expect(control).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(control);
    expect(screen.getByRole("button", { name: "Hide details for Jahmyr Gibbs" })).toBeTruthy();
  });

  it("does not double-toggle when the chevron itself is clicked", () => {
    render(<PositionParBoard position="RB" query="jahmyr gibbs" />);
    fireEvent.click(screen.getByRole("button", { name: "Show details for Jahmyr Gibbs" }));
    expect(screen.getByText(/2025 finish/i)).toBeTruthy();
  });
});

describe("2025 finish in the expanded detail", () => {
  beforeEach(() => stubCompactViewport(false));

  it("shows both ranking bases with the pool size", () => {
    render(<PositionParBoard position="RB" query="jahmyr gibbs" />);
    fireEvent.click(screen.getByRole("button", { name: "Show details for Jahmyr Gibbs" }));
    // Gibbs finished RB3 on both bases, so the label appears twice.
    expect(screen.getAllByText("RB3")).toHaveLength(2);
    expect(screen.getByText(/by total points/)).toBeTruthy();
    expect(screen.getByText(/by PPG/)).toBeTruthy();
    expect(screen.getByText(/of 166 ranked RBs/)).toBeTruthy();
  });

  it("separates the two bases for a player who missed games", () => {
    render(<PositionParBoard position="TE" query="brock bowers" />);
    fireEvent.click(screen.getByRole("button", { name: "Show details for Brock Bowers" }));
    // 12 games: 11th in total points, 2nd in points per game.
    expect(screen.getByText("TE11")).toBeTruthy();
    expect(screen.getByText("TE2")).toBeTruthy();
  });

  it("omits the block entirely for a player with no 2025 season", () => {
    render(<PositionParBoard position="RB" query="jeremiyah love" />);
    fireEvent.click(screen.getByRole("button", { name: "Show details for Jeremiyah Love" }));
    expect(screen.queryByText(/2025 finish/i)).toBeNull();
    // The rest of the PAR detail still renders.
    expect(screen.getByText(/PAR rank/i)).toBeTruthy();
  });
});

describe("2025 matchup shading on playoff weeks", () => {
  beforeEach(() => stubCompactViewport(false));

  it("labels the playoff-week columns as 2025 points allowed", () => {
    render(<PositionParBoard position="WR" query="" />);
    const table = screen.getByRole("table");
    expect(within(table).getAllByText("2025 PA")).toHaveLength(3);
    expect(screen.getByText(/Playoff weeks shaded by 2025 fantasy points allowed to WR/i)).toBeTruthy();
  });

  it("shades an opponent cell by that defense's points allowed to the row's position", () => {
    render(<PositionParBoard position="WR" query="khalil shakir" />);
    // Buffalo's W15 opponent is CHI, which allowed the 3rd-most WR points.
    const cell = screen.getAllByTitle(/Chicago Bears allowed .* WR pts\/gm in 2025/)[0];
    expect(cell.getAttribute("title")).toContain("30.2");
    expect(cell.getAttribute("title")).toContain("3 of 32");
    expect(cell.style.backgroundColor).not.toBe("");
  });

  it("uses the row's own position, so the same opponent shades differently", () => {
    const { unmount } = render(<PositionParBoard position="QB" query="josh allen" />);
    const qbTitle = screen.getAllByTitle(/Chicago Bears allowed/)[0].getAttribute("title")!;
    unmount();

    render(<PositionParBoard position="TE" query="dalton kincaid" />);
    const teTitle = screen.getAllByTitle(/Chicago Bears allowed/)[0].getAttribute("title")!;

    expect(qbTitle).toContain("QB pts/gm");
    expect(qbTitle).toContain("5 of 32");
    expect(teTitle).toContain("TE pts/gm");
    expect(teTitle).toContain("14 of 32");
  });

  it("keeps Strength of Schedule as a separate column", () => {
    render(<PositionParBoard position="WR" query="" />);
    const table = screen.getByRole("table");
    expect(within(table).getByText("Strength of Schedule")).toBeTruthy();
    expect(within(table).getAllByText("2025 PA")).toHaveLength(3);
  });

  it("leaves an unresolved opponent unshaded rather than guessing", () => {
    render(<PositionParBoard position="RB" query="devin singletary" />);
    const row = screen.getAllByRole("row").at(-1)!;
    const dashes = [...row.querySelectorAll("td")].filter((td) => td.textContent === "—");
    for (const cell of dashes) expect(cell.style.backgroundColor).toBe("");
  });
});

describe.each(PAR_POSITIONS)("%s compact layout", (position) => {
  beforeEach(() => stubCompactViewport(true));

  it("renders two-line cards instead of a scrolling table", () => {
    render(<PositionParBoard position={position} query="" />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(
      PAR_POSITION_LIMITS[position] - 1,
    );
  });

  it("offers no column-group toggle", () => {
    render(<PositionParBoard position={position} query="" />);
    for (const group of ["Metrics", "Model", "Context", "Playoffs"]) {
      expect(screen.queryByRole("button", { name: group })).toBeNull();
    }
  });
});

describe("compact card detail", () => {
  beforeEach(() => stubCompactViewport(true));

  it("keeps tier, rank, player, PAR/G and projected PPG on the collapsed card", () => {
    render(<PositionParBoard position="RB" query="jahmyr gibbs" />);
    const card = screen.getAllByRole("listitem")[0];
    expect(within(card).getByText("T1")).toBeTruthy();
    expect(within(card).getByText("RB1")).toBeTruthy();
    expect(within(card).getByText("Jahmyr Gibbs")).toBeTruthy();
    expect(within(card).getByText(/proj PPG/)).toBeTruthy();
  });

  it("moves evidence, context and playoff fields behind tap-to-expand", () => {
    render(<PositionParBoard position="WR" query="puka nacua" />);
    expect(screen.queryByText("Strength of Schedule")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show details for Puka Nacua" }));

    for (const label of [
      "Season PAR",
      ...POSITION_BOARD_CONFIGS.WR.metricLabels,
      "Strength of Schedule",
      "O-Line Rank",
      "W15",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText("'26 proj")).toBeTruthy();
    expect(screen.getByText("'25 actual")).toBeTruthy();
  });
});
