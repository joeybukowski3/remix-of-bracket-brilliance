import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PositionMatchupTable, { POSITION_MATCHUP_STICKY_TOP } from "./PositionMatchupTable";
import { POSITION_MATCHUP_COLUMN_WIDTH, POSITION_MATCHUP_OPPONENT_LEFT, POSITION_MATCHUP_TABLE_WIDTH } from "./columnGeometry";
import type { PositionMatchupSortState } from "./types";
import type { PositionMatchupTableRow } from "@/lib/nfl/positionMatchups/presentation";

function cell(overrides: Partial<PositionMatchupTableRow["cells"]["qb"]> = {}): PositionMatchupTableRow["cells"]["qb"] {
  return {
    forRank: null,
    forRaw: null,
    forDisplay: null,
    allowedRank: null,
    allowedRaw: null,
    allowedDisplay: null,
    edge: null,
    rating: null,
    ...overrides,
  };
}

function row(overrides: Partial<PositionMatchupTableRow> & { team: string }): PositionMatchupTableRow {
  return {
    id: overrides.team,
    opponent: null,
    location: null,
    cells: { qb: cell(), rb: cell(), wr: cell(), te: cell() },
    ...overrides,
  };
}

const rows: readonly PositionMatchupTableRow[] = [
  row({ team: "kc", cells: { qb: cell({ forRank: 5, edge: 12, rating: "strong" }), rb: cell(), wr: cell(), te: cell() } }),
  row({ team: "buf", cells: { qb: cell({ forRank: 20, edge: -8, rating: "weak" }), rb: cell(), wr: cell(), te: cell() } }),
];

function renderTable(sort: PositionMatchupSortState) {
  const onSortChange = vi.fn();
  return {
    ...render(<PositionMatchupTable rows={rows} sort={sort} onSortChange={onSortChange} scrollLabel="test table" displayMode="rank" renderTeam={(r) => r.team.toUpperCase()} />),
    onSortChange,
  };
}

describe("PositionMatchupTable column geometry", () => {
  it("defines every column width once, on the colgroup, and nowhere else", () => {
    renderTable({ key: "team", direction: "asc" });
    const table = screen.getAllByRole("columnheader")[0].closest("table") as HTMLTableElement;
    const cols = table.querySelectorAll("colgroup > col");
    // Team, Opp, then 4 positions x 3 sub-columns.
    expect(cols).toHaveLength(2 + 4 * 3);
    // `data-col-width` mirrors the inline `style` width (see component) -- jsdom's CSSOM
    // doesn't parse `clamp()` and silently drops it from `style`/`getAttribute("style")`,
    // so it can't be read back the way a real browser would allow.
    expect((cols[0] as HTMLElement).dataset.colWidth).toBe(POSITION_MATCHUP_COLUMN_WIDTH.team);
    expect((cols[1] as HTMLElement).dataset.colWidth).toBe(POSITION_MATCHUP_COLUMN_WIDTH.opponent);
    expect((cols[2] as HTMLElement).dataset.colWidth).toBe(POSITION_MATCHUP_COLUMN_WIDTH.sub);
    expect((cols[3] as HTMLElement).dataset.colWidth).toBe(POSITION_MATCHUP_COLUMN_WIDTH.sub);
    expect((cols[4] as HTMLElement).dataset.colWidth).toBe(POSITION_MATCHUP_COLUMN_WIDTH.edge);

    // No header or body cell carries its own width/min-width -- the colgroup is the only source.
    for (const cellEl of [...screen.getAllByRole("columnheader"), ...screen.getAllByRole("cell")]) {
      expect((cellEl as HTMLElement).className).not.toMatch(/(^|\s)w-\d/);
      expect((cellEl as HTMLElement).className).not.toMatch(/min-w-/);
    }
  });

  it("keeps the sticky Opp column's left offset equal to the Team column's width", () => {
    renderTable({ key: "team", direction: "asc" });
    const headerCells = screen.getAllByRole("columnheader");
    const oppHeader = headerCells[1] as HTMLElement;
    expect(oppHeader.dataset.stickyLeft).toBe(POSITION_MATCHUP_OPPONENT_LEFT);
    expect(POSITION_MATCHUP_OPPONENT_LEFT).toBe(POSITION_MATCHUP_COLUMN_WIDTH.team);

    const kcRow = screen.getByText("KC").closest("tr") as HTMLElement;
    const oppBodyCell = within(kcRow).getAllByRole("cell")[1] as HTMLElement;
    expect(oppBodyCell.dataset.stickyLeft).toBe(POSITION_MATCHUP_OPPONENT_LEFT);
  });

  it("makes each group span exactly its three colgroup widths without a competing cell width", () => {
    renderTable({ key: "team", direction: "asc" });
    const table = screen.getAllByRole("columnheader")[0].closest("table") as HTMLTableElement;
    // jsdom rewrites nested clamp() inside calc(), so read the mirrored source value.
    expect(table.dataset.tableWidth).toBe(POSITION_MATCHUP_TABLE_WIDTH);
    const cols = [...table.querySelectorAll("colgroup > col")] as HTMLElement[];
    for (const [index, position] of ["qb", "rb", "wr", "te"].entries()) {
      const group = table.querySelector(`th[data-position-group="${position}"]`) as HTMLTableCellElement;
      expect(group.colSpan).toBe(3);
      expect(group.getAttribute("style")).toBeNull();
      expect(group.className).not.toMatch(/(^|\s)px-/);
      expect(cols.slice(2 + index * 3, 5 + index * 3).map((col) => col.dataset.colWidth)).toEqual([
        POSITION_MATCHUP_COLUMN_WIDTH.sub, POSITION_MATCHUP_COLUMN_WIDTH.sub, POSITION_MATCHUP_COLUMN_WIDTH.edge,
      ]);
    }
    expect(POSITION_MATCHUP_TABLE_WIDTH.match(/clamp\(/g)).toHaveLength(cols.length);
  });

  it("keeps the same colgroup widths and cell classes whether sorted by team, FOR, ALLOWED, or EDGE, ascending or descending", () => {
    const states: PositionMatchupSortState[] = [
      { key: "team", direction: "asc" },
      { key: "qb-for", direction: "asc" },
      { key: "qb-for", direction: "desc" },
      { key: "qb-allowed", direction: "asc" },
      { key: "qb-allowed", direction: "desc" },
      { key: "qb-edge", direction: "asc" },
      { key: "qb-edge", direction: "desc" },
    ];

    let baselineWidths: string[] | null = null;
    for (const sort of states) {
      const { unmount } = renderTable(sort);
      const table = screen.getAllByRole("columnheader")[0].closest("table") as HTMLTableElement;
      const widths = [...table.querySelectorAll("colgroup > col")].map((c) => (c as HTMLElement).dataset.colWidth as string);
      expect(widths.every((w) => w.includes("clamp("))).toBe(true);
      if (baselineWidths == null) baselineWidths = widths;
      else expect(widths).toEqual(baselineWidths);
      unmount();
    }
  });
});

describe("PositionMatchupTable position-group borders", () => {
  it("gives every group's first sub-column a strong divider, on the group header, the field subheader, and every body row", () => {
    renderTable({ key: "team", direction: "asc" });
    const headerCells = screen.getAllByRole("columnheader");
    // headerCells: [0]=Team, [1]=Opp, [2]=QB group header, [3..5]=QB For/Allow/Edge, [6]=RB group header...
    const qbGroupHeader = headerCells.find((el) => el.getAttribute("data-position-group") === "qb") as HTMLElement;
    expect(qbGroupHeader.className).toContain("border-l-2");
    expect(qbGroupHeader.className).toContain("border-l-slate-400");

    const qbForSubHeader = screen.getByRole("button", { name: "Sort by QB For" }).closest("th") as HTMLElement;
    expect(qbForSubHeader.className).toContain("border-l-2");
    expect(qbForSubHeader.className).toContain("border-l-slate-400");

    const qbAllowSubHeader = screen.getByRole("button", { name: "Sort by QB Allowed" }).closest("th") as HTMLElement;
    expect(qbAllowSubHeader.className).not.toContain("border-l-2");
    expect(qbAllowSubHeader.className).toContain("border-l-slate-200");

    for (const teamName of ["KC", "BUF"]) {
      const bodyRow = screen.getByText(teamName).closest("tr") as HTMLElement;
      const groupCells = within(bodyRow)
        .getAllByRole("cell")
        .filter((c) => c.getAttribute("data-position-group") === "qb");
      // groupCells[0] is the FOR cell (the only one tagged with data-position-group).
      expect(groupCells[0].className).toContain("border-l-2");
      expect(groupCells[0].className).toContain("border-l-slate-400");
    }
  });
});

describe("PositionMatchupTable responsive scaling", () => {
  it("scales header and body font size with clamp() instead of a fixed pixel size", () => {
    renderTable({ key: "team", direction: "asc" });
    const forButton = screen.getByRole("button", { name: "Sort by QB For" });
    expect(forButton.className).toMatch(/text-\[clamp\(/);

    const kcRow = screen.getByText("KC").closest("tr") as HTMLElement;
    const teamCell = within(kcRow).getAllByRole("cell")[0] as HTMLElement;
    expect(teamCell.className).toMatch(/text-\[clamp\(/);
  });

  it("scales cell horizontal padding with clamp()", () => {
    renderTable({ key: "team", direction: "asc" });
    const headerCells = screen.getAllByRole("columnheader");
    expect(headerCells[0].className).toMatch(/px-\[clamp\(/);
  });
});

describe("PositionMatchupTable sticky header and sort", () => {
  it("pins both header rows under the site header and preserves frozen intersections", async () => {
    const { container, onSortChange } = renderTable({ key: "qb-edge", direction: "desc" });
    const head = container.querySelector("thead") as HTMLElement;
    const wrap = container.firstElementChild as HTMLElement;
    const scroller = screen.getByRole("region", { name: "test table" });
    head.getBoundingClientRect = () => ({ top: 20, bottom: 80, height: 60 } as DOMRect);
    wrap.getBoundingClientRect = () => ({ bottom: 500 } as DOMRect);
    scroller.getBoundingClientRect = () => ({ left: 16, width: 360 } as DOMRect);
    (head.querySelector("tr") as HTMLElement).getBoundingClientRect = () => ({ height: 28 } as DOMRect);
    fireEvent.scroll(window);
    const clone = await waitFor(() => screen.getByTestId("position-matchup-sticky-header"));
    expect(clone).toHaveAttribute("aria-hidden", "true");
    expect(clone).toHaveClass("fixed", "z-20", "overflow-hidden", "bg-slate-100");
    expect(clone.style.top).toBe(`${POSITION_MATCHUP_STICKY_TOP}px`);
    expect(clone.style.height).toBe("60px");
    expect(clone.querySelectorAll("thead tr")).toHaveLength(2);
    expect((clone.querySelector('[data-header-row="group"]') as HTMLElement).style.height).toBe("28px");
    expect(clone.querySelectorAll("thead th.sticky.z-30")).toHaveLength(2);
    expect([...clone.querySelectorAll("button")].every((button) => button.tabIndex === -1)).toBe(true);
    fireEvent.click(within(clone).getByRole("button", { name: "Sort by QB Edge", hidden: true }));
    expect(onSortChange).toHaveBeenCalledWith({ key: "qb-edge", direction: "asc" });
    expect(clone.querySelector("thead")?.className).toContain("bg-slate-100");
  });

  it("keeps EDGE badges one line and body cells at a consistent height", () => {
    render(<PositionMatchupTable rows={[
      row({ team: "kc", cells: { qb: cell({ edge: 15, rating: "very-strong" }), rb: cell(), wr: cell(), te: cell() } }),
      row({ team: "buf", cells: { qb: cell({ edge: -21, rating: "very-weak" }), rb: cell(), wr: cell(), te: cell() } }),
    ]} sort={{ key: "team", direction: "asc" }} onSortChange={vi.fn()} scrollLabel="test table" displayMode="rank" renderTeam={(r) => r.team.toUpperCase()} />);
    for (const label of ["VERY STRONG (+15)", "VERY WEAK (-21)"]) {
      const pill = screen.getByText((_, element) => element?.tagName === "SPAN" && element.textContent?.toUpperCase() === label);
      expect(pill).toHaveClass("whitespace-nowrap", "h-4", "leading-none", "px-0.5", "py-0");
      expect(pill.className).toMatch(/text-\[clamp\(/);
      const bodyCells = (pill.closest("tr") as HTMLElement).querySelectorAll("td");
      expect([...bodyCells].every((bodyCell) => bodyCell.className.includes("py-1.5"))).toBe(true);
    }
  });

  it("sorts rows by QB edge while preserving column count and order", () => {
    renderTable({ key: "qb-edge", direction: "desc" });
    const table = screen.getAllByRole("columnheader")[0].closest("table") as HTMLTableElement;
    const bodyRows = [...table.querySelectorAll("tbody tr")];
    const teamNames = bodyRows.map((r) => r.querySelector("td")?.textContent);
    expect(teamNames).toEqual(["KC", "BUF"]);
  });
});
