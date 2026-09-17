import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AllowedByPositionTable, { type RankTone } from "./AllowedByPositionTable";
import type { AllowedByPositionColumn, AllowedByPositionRow, AllowedByPositionSortState } from "./types";

type Col = "qb" | "rb";

const columns: readonly AllowedByPositionColumn<Col>[] = [
  { key: "qb", label: "QB" },
  { key: "rb", label: "RB" },
];

function row(id: string, qb: AllowedByPositionRow<Col>["cells"]["qb"]): AllowedByPositionRow<Col> {
  return { id, team: id, opponent: null, location: null, cells: { qb, rb: { rank: null } } };
}

const sort: AllowedByPositionSortState = { key: "team", direction: "asc" };

// Distinguishable per rank so a test can assert the tone is rank-driven, not raw-value-driven.
const rankTone: (rank: number | null) => RankTone = (rank) =>
  rank == null ? {} : { style: { backgroundColor: `tone-${rank}` } };

function renderTable(rows: readonly AllowedByPositionRow<Col>[], displayMode?: "rank" | "raw") {
  return render(
    <AllowedByPositionTable
      columns={columns}
      rows={rows}
      sort={sort}
      onSortChange={vi.fn()}
      scrollLabel="test table"
      rankTone={rankTone}
      renderTeam={(r) => r.team.toUpperCase()}
      displayMode={displayMode}
    />,
  );
}

describe("AllowedByPositionTable display modes", () => {
  it("defaults to rank display when displayMode is omitted", () => {
    renderTable([row("kc", { rank: 5, rawValue: 22.3, rawDisplay: "22.3" })]);
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.queryByText("22.3")).not.toBeInTheDocument();
  });

  it("rank mode renders the rank only", () => {
    renderTable([row("kc", { rank: 5, rawValue: 22.3, rawDisplay: "22.3" })], "rank");
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.queryByText("22.3")).not.toBeInTheDocument();
    expect(screen.queryByText("(5)")).not.toBeInTheDocument();
  });

  it("raw mode renders the raw value with rank in parentheses", () => {
    renderTable([row("kc", { rank: 5, rawValue: 22.3, rawDisplay: "22.3" })], "raw");
    expect(screen.getByText("22.3")).toBeInTheDocument();
    expect(screen.getByText("(5)")).toBeInTheDocument();
  });

  it("raw mode renders a bare em dash for a null raw value, never '— (—)'", () => {
    renderTable([row("kc", { rank: null, rawValue: null, rawDisplay: null })], "raw");
    // Opponent cell also renders "—" for this row, so assert on the QB position cell specifically.
    const bodyCells = within(screen.getByText("KC").closest("tr") as HTMLElement).getAllByRole("cell");
    expect(bodyCells[2]).toHaveTextContent("—");
    expect(bodyCells[2].textContent).not.toMatch(/—\s*\(—\)/);
  });

  it("rank mode renders a bare em dash for a null rank", () => {
    renderTable([row("kc", { rank: null })], "rank");
    const bodyCells = within(screen.getByText("KC").closest("tr") as HTMLElement).getAllByRole("cell");
    expect(bodyCells[2]).toHaveTextContent("—");
  });

  it("heat tone stays rank-driven in raw mode: same rank, different raw value, same tone", () => {
    renderTable(
      [row("kc", { rank: 31, rawValue: 24.8, rawDisplay: "24.8" }), row("buf", { rank: 31, rawValue: 40.1, rawDisplay: "40.1" })],
      "raw",
    );
    const kcRow = screen.getByText("KC").closest("tr") as HTMLElement;
    const bufRow = screen.getByText("BUF").closest("tr") as HTMLElement;
    const kcCell = within(kcRow).getByText("24.8").closest("td") as HTMLElement;
    const bufCell = within(bufRow).getByText("40.1").closest("td") as HTMLElement;
    expect(kcCell.style.backgroundColor).toBe(bufCell.style.backgroundColor);
  });

  it("applies a position-divider class to every position column's header and body cells", () => {
    renderTable([row("kc", { rank: 5 })], "rank");
    const headerCells = screen.getAllByRole("columnheader");
    // headerCells[0]=Team, [1]=Opp, [2]=QB (pronounced Opp->QB divider), [3]=RB (thinner divider).
    expect(headerCells[2].className).toContain("border-l-4");
    expect(headerCells[3].className).toContain("border-l-2");
    expect(headerCells[3].className).not.toContain("border-l-4");

    const kcRow = screen.getByText("KC").closest("tr") as HTMLElement;
    const bodyCells = within(kcRow).getAllByRole("cell");
    // bodyCells[0]=Team, [1]=Opp, [2]=QB (pronounced divider), [3]=RB (thinner divider).
    expect(bodyCells[2].className).toContain("border-l-2");
    expect(bodyCells[3].className).toContain("border-l");
    expect(bodyCells[3].className).not.toContain("border-l-2");
  });
});

describe("AllowedByPositionTable responsive column widths and sticky header", () => {
  it("gives every position column header and body cell the same width classes", () => {
    renderTable([row("kc", { rank: 5 })], "rank");
    const headerCells = screen.getAllByRole("columnheader");
    const qbHeader = headerCells[2];
    const rbHeader = headerCells[3];
    // Both columns must share the exact same width/min-width utility classes so neither absorbs extra space.
    expect(qbHeader.className).toContain("w-[46px]");
    expect(qbHeader.className).toContain("sm:w-20");
    expect(rbHeader.className).toContain("w-[46px]");
    expect(rbHeader.className).toContain("sm:w-20");

    const kcRow = screen.getByText("KC").closest("tr") as HTMLElement;
    const bodyCells = within(kcRow).getAllByRole("cell");
    expect(bodyCells[2].className).toContain("w-[46px]");
    expect(bodyCells[3].className).toContain("w-[46px]");
  });

  it("gives the table a shrink-to-fit width instead of stretching to fill the scroller", () => {
    renderTable([row("kc", { rank: 5 })], "rank");
    const table = screen.getAllByRole("columnheader")[0].closest("table") as HTMLElement;
    expect(table.className).toContain("w-fit");
    expect(table.className).not.toContain("w-full");
  });

  it("overrides the scroller's overflow-x-auto so sticky positioning is relative to the page, not the scroller", () => {
    renderTable([row("kc", { rank: 5 })], "rank");
    const scroller = screen.getByRole("region", { name: "test table" });
    expect(scroller.className).toContain("overflow-visible");
  });

  it("allows position header labels to wrap instead of forcing nowrap", () => {
    renderTable([row("kc", { rank: 5 })], "rank");
    const qbButton = screen.getByRole("button", { name: "Sort by QB" });
    expect(qbButton.className).toContain("whitespace-normal");
    expect(qbButton.className).not.toContain("whitespace-nowrap");
  });

  it("keeps the Team column compact on mobile and unchanged on desktop, with Opponent's sticky offset matching it", () => {
    renderTable([row("kc", { rank: 5 })], "rank");
    const headerCells = screen.getAllByRole("columnheader");
    const teamHeader = headerCells[0];
    const oppHeader = headerCells[1];
    expect(teamHeader.className).toContain("w-11");
    expect(teamHeader.className).toContain("sm:w-[92px]");
    // Opponent's sticky `left` must equal the Team column's width at every breakpoint.
    expect(oppHeader.className).toContain("left-11");
    expect(oppHeader.className).toContain("sm:left-[92px]");
  });

  it("makes the header row sticky, offset below the site header, and above the frozen body columns", () => {
    renderTable([row("kc", { rank: 5 })], "rank");
    const thead = screen.getAllByRole("columnheader")[0].closest("thead") as HTMLElement;
    expect(thead.className).toContain("sticky");
    expect(thead.className).toContain("top-[72px]");
    expect(thead.className).toContain("z-20");
  });

  it("layers the Team/Opp header intersection above the sticky header and above the frozen body column", () => {
    renderTable([row("kc", { rank: 5 })], "rank");
    const headerCells = screen.getAllByRole("columnheader");
    const teamHeader = headerCells[0];
    const oppHeader = headerCells[1];
    // Team/Opp header cells sit at the top-left intersection: highest layer (z-30), above the
    // sticky header row itself (z-20) and above the ordinary frozen body column (z-10).
    expect(teamHeader.className).toContain("z-30");
    expect(oppHeader.className).toContain("z-30");

    const kcRow = screen.getByText("KC").closest("tr") as HTMLElement;
    const bodyCells = within(kcRow).getAllByRole("cell");
    expect(bodyCells[0].className).toContain("z-10");
    expect(bodyCells[1].className).toContain("z-10");
  });
});
