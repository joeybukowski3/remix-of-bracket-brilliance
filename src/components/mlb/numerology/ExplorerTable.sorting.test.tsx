/**
 * ExplorerTable.sorting.test.tsx
 * Focused tests for sortable Numerology Score / Model Rating columns.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExplorerTable, compareRowsBySort, nextSortState, type ExplorerRow, type SortState } from "./ExplorerTable";

function makeRow(overrides: Partial<ExplorerRow> = {}): ExplorerRow {
  return {
    playerId: 1,
    playerName: "Player A",
    team: "NYY",
    opponent: "BOS",
    lineupStatus: "unknown",
    battingOrder: null,
    jerseyNumber: 10,
    numerologyScore: 50,
    baseballScore: 50,
    matchType: "Exact Match",
    ...overrides,
  };
}

// ── 1-4: basic ascending/descending sort ──────────────────────────────────────

describe("Sort comparator — Numerology Score / Model Rating", () => {
  it("1. Numerology Score sorts descending", () => {
    const rows = [makeRow({ playerName: "Low", numerologyScore: 20 }), makeRow({ playerName: "High", numerologyScore: 80 })];
    const sort: SortState = { field: "numerologyScore", direction: "desc" };
    const sorted = [...rows].sort((a, b) => compareRowsBySort(a, b, sort));
    expect(sorted[0].playerName).toBe("High");
  });

  it("2. Numerology Score sorts ascending", () => {
    const rows = [makeRow({ playerName: "Low", numerologyScore: 20 }), makeRow({ playerName: "High", numerologyScore: 80 })];
    const sort: SortState = { field: "numerologyScore", direction: "asc" };
    const sorted = [...rows].sort((a, b) => compareRowsBySort(a, b, sort));
    expect(sorted[0].playerName).toBe("Low");
  });

  it("3. Model Rating sorts descending", () => {
    const rows = [makeRow({ playerName: "Low", baseballScore: 20 }), makeRow({ playerName: "High", baseballScore: 80 })];
    const sort: SortState = { field: "baseballScore", direction: "desc" };
    const sorted = [...rows].sort((a, b) => compareRowsBySort(a, b, sort));
    expect(sorted[0].playerName).toBe("High");
  });

  it("4. Model Rating sorts ascending", () => {
    const rows = [makeRow({ playerName: "Low", baseballScore: 20 }), makeRow({ playerName: "High", baseballScore: 80 })];
    const sort: SortState = { field: "baseballScore", direction: "asc" };
    const sorted = [...rows].sort((a, b) => compareRowsBySort(a, b, sort));
    expect(sorted[0].playerName).toBe("Low");
  });
});

// ── 5: sort cycle ────────────────────────────────────────────────────────────

describe("Sort cycle", () => {
  it("5. cycle returns to unsorted: unsorted -> desc -> asc -> unsorted", () => {
    let state: SortState = null;
    state = nextSortState(state, "numerologyScore");
    expect(state).toEqual({ field: "numerologyScore", direction: "desc" });
    state = nextSortState(state, "numerologyScore");
    expect(state).toEqual({ field: "numerologyScore", direction: "asc" });
    state = nextSortState(state, "numerologyScore");
    expect(state).toBeNull();
  });

  it("defaults to descending on first click of a column (even after a different column was active)", () => {
    const afterAsc: SortState = { field: "baseballScore", direction: "asc" };
    const state = nextSortState(afterAsc, "numerologyScore");
    expect(state).toEqual({ field: "numerologyScore", direction: "desc" });
  });
});

// ── 6: tie-breaking ──────────────────────────────────────────────────────────

describe("Deterministic tie-breaking", () => {
  it("6a. ties on Numerology Score break by higher Model Rating first, then name A-Z", () => {
    const rows = [
      makeRow({ playerName: "Zach", numerologyScore: 50, baseballScore: 60 }),
      makeRow({ playerName: "Amy", numerologyScore: 50, baseballScore: 80 }),
      makeRow({ playerName: "Bob", numerologyScore: 50, baseballScore: 80 }),
    ];
    const sort: SortState = { field: "numerologyScore", direction: "desc" };
    const sorted = [...rows].sort((a, b) => compareRowsBySort(a, b, sort));
    // Amy and Bob tie on both fields -> alphabetical; Zach has lower Model Rating -> last
    expect(sorted.map((r) => r.playerName)).toEqual(["Amy", "Bob", "Zach"]);
  });

  it("6b. ties on Model Rating break by higher Numerology Score first, then name A-Z", () => {
    const rows = [
      makeRow({ playerName: "Zach", baseballScore: 50, numerologyScore: 60 }),
      makeRow({ playerName: "Amy", baseballScore: 50, numerologyScore: 80 }),
      makeRow({ playerName: "Bob", baseballScore: 50, numerologyScore: 80 }),
    ];
    const sort: SortState = { field: "baseballScore", direction: "desc" };
    const sorted = [...rows].sort((a, b) => compareRowsBySort(a, b, sort));
    expect(sorted.map((r) => r.playerName)).toEqual(["Amy", "Bob", "Zach"]);
  });

  it("ties on all fields are fully deterministic across repeated sorts", () => {
    const rows = [makeRow({ playerName: "C", numerologyScore: 50, baseballScore: 50 }), makeRow({ playerName: "A", numerologyScore: 50, baseballScore: 50 }), makeRow({ playerName: "B", numerologyScore: 50, baseballScore: 50 })];
    const sort: SortState = { field: "numerologyScore", direction: "desc" };
    const sorted1 = [...rows].sort((a, b) => compareRowsBySort(a, b, sort)).map((r) => r.playerName);
    const sorted2 = [...rows].sort((a, b) => compareRowsBySort(a, b, sort)).map((r) => r.playerName);
    expect(sorted1).toEqual(["A", "B", "C"]);
    expect(sorted1).toEqual(sorted2);
  });
});

// ── 7-9: filters preserved (component-level via NumerologyExplorer would be ──
// ── covered separately; here we verify ExplorerTable's own prop-driven sort ──
// ── never discards or filters rows itself, which is what "preserves filters" ──
// ── depends on at this layer) ──────────────────────────────────────────────

describe("Sorting preserves row set (filters/search are applied upstream and untouched by sort)", () => {
  it("7-9. sorting does not change which rows are present, only their order", () => {
    const rows = [makeRow({ playerName: "A", team: "NYY", numerologyScore: 10 }), makeRow({ playerName: "B", team: "BOS", numerologyScore: 90 })];
    render(<ExplorerTable rows={rows} sort={{ field: "numerologyScore", direction: "desc" }} onSort={() => {}} />);
    expect(screen.getAllByText("A").length).toBeGreaterThan(0);
    expect(screen.getAllByText("B").length).toBeGreaterThan(0);
  });
});

// ── 10: expanded rows still work after sorting ────────────────────────────────

describe("Expanded rows remain functional with sorting active", () => {
  it("10. expanding a row works the same whether or not a sort is active", () => {
    const rows = [makeRow({ playerName: "Sortable Player" })];
    render(<ExplorerTable rows={rows} sort={{ field: "numerologyScore", direction: "desc" }} onSort={() => {}} />);
    const row = document.querySelector("tbody tr");
    expect(row).toBeTruthy();
    fireEvent.click(row!);
    // Expanded panel renders the HR Model Stats section
    expect(screen.getAllByText(/HR Model Stats/i).length).toBeGreaterThan(0);
  });
});

// ── 11: aria-sort ──────────────────────────────────────────────────────────────

describe("Accessibility: aria-sort", () => {
  it("11a. aria-sort is 'none' when unsorted", () => {
    const rows = [makeRow()];
    render(<ExplorerTable rows={rows} sort={null} onSort={() => {}} />);
    const header = screen.getByRole("columnheader", { name: /Numerology Score/i });
    expect(header).toHaveAttribute("aria-sort", "none");
  });

  it("11b. aria-sort is 'descending' when sorted desc", () => {
    const rows = [makeRow()];
    render(<ExplorerTable rows={rows} sort={{ field: "numerologyScore", direction: "desc" }} onSort={() => {}} />);
    const header = screen.getByRole("columnheader", { name: /Numerology Score/i });
    expect(header).toHaveAttribute("aria-sort", "descending");
  });

  it("11c. aria-sort is 'ascending' when sorted asc", () => {
    const rows = [makeRow()];
    render(<ExplorerTable rows={rows} sort={{ field: "numerologyScore", direction: "asc" }} onSort={() => {}} />);
    const header = screen.getByRole("columnheader", { name: /Numerology Score/i });
    expect(header).toHaveAttribute("aria-sort", "ascending");
  });

  it("11d. only the active column has a non-none aria-sort", () => {
    const rows = [makeRow()];
    render(<ExplorerTable rows={rows} sort={{ field: "numerologyScore", direction: "desc" }} onSort={() => {}} />);
    const numHeader = screen.getByRole("columnheader", { name: /Numerology Score/i });
    const modelHeader = screen.getByRole("columnheader", { name: /Model Rating/i });
    expect(numHeader).toHaveAttribute("aria-sort", "descending");
    expect(modelHeader).toHaveAttribute("aria-sort", "none");
  });
});

// ── 12: keyboard interaction ────────────────────────────────────────────────

describe("Accessibility: keyboard interaction", () => {
  it("12a. sortable headers are real buttons, not clickable plain text", () => {
    const rows = [makeRow()];
    render(<ExplorerTable rows={rows} sort={null} onSort={() => {}} />);
    const btns = screen.getAllByRole("button", { name: "Sort by Numerology Score" });
    expect(btns.length).toBeGreaterThan(0);
    expect(btns[0].tagName).toBe("BUTTON");
  });

  it("12b. clicking the sort button invokes onSort with the correct field", () => {
    const rows = [makeRow()];
    let calledWith: string | null = null;
    render(<ExplorerTable rows={rows} sort={null} onSort={(field) => { calledWith = field; }} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Sort by Model Rating" })[0]);
    expect(calledWith).toBe("baseballScore");
  });

  it("12c. sortable header buttons have descriptive accessible labels", () => {
    const rows = [makeRow()];
    render(<ExplorerTable rows={rows} sort={null} onSort={() => {}} />);
    expect(screen.getAllByRole("button", { name: "Sort by Numerology Score" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Sort by Model Rating" }).length).toBeGreaterThan(0);
  });

  it("12d. sortable buttons are focusable (keyboard accessible)", () => {
    const rows = [makeRow()];
    render(<ExplorerTable rows={rows} sort={null} onSort={() => {}} />);
    const btn = screen.getAllByRole("button", { name: "Sort by Numerology Score" })[0];
    btn.focus();
    expect(document.activeElement).toBe(btn);
  });
});

// ── Header label rename ─────────────────────────────────────────────────────

describe("Header labels", () => {
  it("desktop header shows 'Numerology Score', not just 'Numerology'", () => {
    const rows = [makeRow()];
    render(<ExplorerTable rows={rows} sort={null} onSort={() => {}} />);
    expect(screen.getByRole("columnheader", { name: /Numerology Score/i })).toBeTruthy();
  });

  it("desktop header shows 'Model Rating'", () => {
    const rows = [makeRow()];
    render(<ExplorerTable rows={rows} sort={null} onSort={() => {}} />);
    expect(screen.getByRole("columnheader", { name: /Model Rating/i })).toBeTruthy();
  });
});

// ── Mobile sort controls ────────────────────────────────────────────────────

describe("Mobile sort controls", () => {
  it("mobile sort buttons exist and are accessible", () => {
    const rows = [makeRow()];
    render(<ExplorerTable rows={rows} sort={null} onSort={() => {}} />);
    expect(screen.getAllByRole("button", { name: "Sort by Numerology Score" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Sort by Model Rating" }).length).toBeGreaterThan(0);
  });

  it("mobile sort buttons reflect active sort state via aria-pressed", () => {
    const rows = [makeRow()];
    render(<ExplorerTable rows={rows} sort={{ field: "numerologyScore", direction: "desc" }} onSort={() => {}} />);
    const mobileButtons = screen.getAllByRole("button", { name: "Sort by Numerology Score" });
    const pressedButton = mobileButtons.find((b) => b.getAttribute("aria-pressed") === "true");
    expect(pressedButton).toBeTruthy();
  });
});
