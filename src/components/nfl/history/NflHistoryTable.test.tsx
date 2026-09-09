import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NflHistoryTable, type NflHistoryColumn, type NflHistoryMobileColumn } from "./NflHistoryTable";

type Row = { id: string; label: string; value: number };
const rows: Row[] = [
  { id: "r1", label: "Game 1", value: 10 },
  { id: "r2", label: "Game 2", value: 20 },
];
const columns: NflHistoryColumn<Row>[] = [
  { key: "label", header: "Label", render: (row) => row.label },
  { key: "value", header: "Value", render: (row) => row.value, footer: <>15</> },
];

describe("NflHistoryTable", () => {
  it("renders configured columns and rows in order", () => {
    render(<NflHistoryTable rows={rows} rowKey={(row) => row.id} columns={columns} scrollLabel="Test table" />);
    const region = screen.getByRole("region", { name: "Test table" });
    expect(within(region).getAllByRole("columnheader").map((th) => th.textContent)).toEqual(["Label", "Value"]);
    expect(within(region).getByText("Game 1")).toBeInTheDocument();
    expect(within(region).getByText("Game 2")).toBeInTheDocument();
  });

  it("renders a configured footer row only when footerLabel is provided", () => {
    const { rerender } = render(<NflHistoryTable rows={rows} rowKey={(row) => row.id} columns={columns} scrollLabel="Test table" />);
    expect(screen.queryByText("15")).not.toBeInTheDocument();
    rerender(<NflHistoryTable rows={rows} rowKey={(row) => row.id} columns={columns} scrollLabel="Test table" footerLabel="Avg" />);
    expect(screen.getByText("Avg")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
  });

  it("renders an optional compact mobile table alongside the desktop table", () => {
    const mobileColumns: NflHistoryMobileColumn<Row>[] = [{ key: "label", header: "L", width: "w-1/2", render: (row) => row.label }];
    render(<NflHistoryTable rows={rows} rowKey={(row) => row.id} columns={columns} mobileColumns={mobileColumns} scrollLabel="Test table" />);
    expect(screen.getAllByText("Game 1")).toHaveLength(2);
  });

  it("shows an empty-state message and renders no table when there are no rows", () => {
    render(<NflHistoryTable rows={[]} rowKey={(row) => (row as Row).id} columns={columns} scrollLabel="Test table" emptyMessage="Nothing here" />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("DFS and Yardage history consumers share one table implementation", () => {
  it("both import NflHistoryTable, and neither hand-rolls its own <table> shell", () => {
    const root = join(process.cwd(), "src", "components", "nfl");
    const dfs = readFileSync(join(root, "dfs", "NflDfsHistory.tsx"), "utf8");
    const player = readFileSync(join(root, "yardage-review", "NflYardagePlayerLast10Table.tsx"), "utf8");
    const opponent = readFileSync(join(root, "yardage-review", "NflYardageOpponentLast10Table.tsx"), "utf8");
    for (const [name, source] of [["NflDfsHistory", dfs], ["NflYardagePlayerLast10Table", player], ["NflYardageOpponentLast10Table", opponent]] as const) {
      expect(source, `${name} should import the shared table`).toContain("NflHistoryTable");
      expect(source, `${name} should not render its own <table> element`).not.toMatch(/<table[\s>]/);
    }
  });
});
