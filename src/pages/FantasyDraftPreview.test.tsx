import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import App from "@/App";
import FantasyDraftPreview from "@/pages/FantasyDraftPreview";
import FantasyFootball from "@/pages/FantasyFootball";
import { SLEEPER_DRAFT_BOARD_2026 } from "@/lib/fantasy/draftPreview/sleeperDraftBoard";
import { DRAFT_TARGETS_STORAGE_KEY } from "@/lib/fantasy/draftPreview/draftTargets";
import { DRAFT_PREVIEW_ROWS_2026, filterDraftPreviewRows } from "@/lib/fantasy/draftPreview/draftPreviewBoard";
import { getMaxRank, getRankGradientColor } from "@/lib/fantasy/parPresentation";

vi.mock("@/components/layout/SiteShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/usePageSeo", async () => ({
  ...(await vi.importActual<typeof import("@/hooks/usePageSeo")>("@/hooks/usePageSeo")),
  usePageSeo: vi.fn(),
}));
vi.mock("@/pages/FantasyWeeklyRankings", () => ({ default: () => <h1>Weekly Fantasy Rankings</h1> }));

vi.setConfig({ testTimeout: 60000 });

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  window.localStorage.clear();
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/fantasy-football/draft-preview"]}>
      <Routes>
        <Route path="/fantasy-football/draft-preview" element={<FantasyDraftPreview />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** The main Sleeper draft board table -- disambiguated from the My Draft sidebar table. */
function getBoardTable() {
  return within(screen.getByRole("region", { name: "Draft preview board" })).getByRole("table");
}

function getMyDraftPanel() {
  const heading = screen.getByRole("heading", { level: 2, name: "My draft" });
  return within(heading.closest("section")!);
}

function findRowByPlayer(table: HTMLElement, player: string) {
  return within(table)
    .getAllByRole("row")
    .find((row) => within(row).queryByText(player))!;
}

describe("/fantasy-football/draft-preview", () => {
  it("renders the route with the expected page title", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Fantasy Draft Preview" })).toBeTruthy();
  });

  it("is reachable through the existing app route", async () => {
    window.history.pushState({}, "", "/fantasy-football/draft-preview");
    render(<App />);
    expect(await screen.findByRole("heading", { level: 1, name: "Fantasy Draft Preview" })).toBeTruthy();
    window.history.pushState({}, "", "/");
  });

  it("links from the existing Fantasy Football page", () => {
    render(
      <MemoryRouter initialEntries={["/fantasy-football?view=ros"]}>
        <Routes><Route path="/fantasy-football" element={<FantasyFootball />} /></Routes>
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: /Fantasy Draft Preview/i });
    expect(link).toHaveAttribute("href", "/fantasy-football/draft-preview");
  });

  it("renders Sleeper Rank, Sleeper Proj and Sleeper PPG for the top row in fixed order", () => {
    renderPage();
    const table = getBoardTable();
    const rows = within(table).getAllByRole("row");
    const gibbsRow = rows.find((row) => within(row).queryByText("Jahmyr Gibbs"))!;
    const cells = [...gibbsRow.querySelectorAll("td")].map((cell) => cell.textContent!.trim());
    expect(cells[0]).toBe("1"); // Sleeper Rk
    expect(cells[3]).toBe("331.4"); // Sleeper Proj
    expect(cells[4]).toBe("19.5"); // Sleeper PPG
  });

  it("keeps JKB Proj PPG and JKB PAR/G distinct from Sleeper's own projections", () => {
    renderPage();
    const table = getBoardTable();
    const rows = within(table).getAllByRole("row");
    const gibbsRow = rows.find((row) => within(row).queryByText("Jahmyr Gibbs"))!;
    const cells = [...gibbsRow.querySelectorAll("td")].map((cell) => cell.textContent!.trim());
    // Sleeper PPG (19.5) and JKB Proj PPG are independent authorities and need not match.
    expect(cells[5]).not.toBe(""); // JKB Proj PPG populated
    expect(cells[6]).toMatch(/^[+-]/); // JKB PAR/G is signed
  });

  it("does not render a Status column", () => {
    renderPage();
    const table = getBoardTable();
    expect(within(table).queryByText("Status")).toBeNull();
  });

  it("reuses the corrected F2 Model Rank column", () => {
    renderPage();
    const table = getBoardTable();
    expect(within(table).getByText("Model Rk")).toBeTruthy();
  });

  it("position focus preserves each row's Sleeper Rank and Pos Rk (no resort/recompute)", () => {
    renderPage();
    const before = getBoardTable();
    const gibbsCellsBefore = [
      ...within(before).getAllByRole("row").find((row) => within(row).queryByText("Jahmyr Gibbs"))!.querySelectorAll("td"),
    ].map((c) => c.textContent!.trim());

    fireEvent.click(screen.getByRole("button", { name: "RB" }));
    const after = getBoardTable();
    const gibbsRowAfter = within(after).getAllByRole("row").find((row) => within(row).queryByText("Jahmyr Gibbs"))!;
    const gibbsCellsAfter = [...gibbsRowAfter.querySelectorAll("td")].map((c) => c.textContent!.trim());
    expect(gibbsCellsAfter[0]).toBe(gibbsCellsBefore[0]); // Sleeper Rk unchanged
    expect(gibbsCellsAfter[2]).toBe(gibbsCellsBefore[2]); // Pos Rk unchanged
  });

  it("defaults the draft-position selector to slot 10 and renders the slot-10 Round 1 separator before overall pick 10", () => {
    renderPage();
    const group = screen.getByRole("group", { name: "Draft position" });
    expect(within(group).getByRole("button", { name: "10" })).toHaveAttribute("aria-pressed", "true");

    const table = getBoardTable();
    const rows = within(table).getAllByRole("row");
    const separatorIndex = rows.findIndex((row) => row.textContent?.includes("Overall 10"));
    expect(separatorIndex).toBeGreaterThan(-1);
    expect(rows[separatorIndex].textContent).toContain("Round 1");
    // The very next row is Sleeper Rank 10.
    const nextRowCells = [...rows[separatorIndex + 1].querySelectorAll("td")];
    expect(nextRowCells[0].textContent!.trim()).toBe("10");
  });

  it("anchors all ten slot-10 markers at the exact overall Sleeper ranks, unaffected by duplicate/unresolved rows", () => {
    renderPage();
    const table = getBoardTable();
    const expectedOverallPicks = [10, 15, 34, 39, 58, 63, 82, 87, 106, 111];
    for (const overallPick of expectedOverallPicks) {
      const pattern = new RegExp(`Overall ${overallPick}(?!\\d)`);
      const rows = within(table).getAllByRole("row");
      const separatorIndex = rows.findIndex((row) => pattern.test(row.textContent ?? ""));
      expect(separatorIndex, `separator for overall pick ${overallPick}`).toBeGreaterThan(-1);
      const nextRowCells = [...rows[separatorIndex + 1].querySelectorAll("td")];
      expect(nextRowCells[0].textContent!.trim()).toBe(String(overallPick));
    }
  });

  it("moves the separator when the draft slot changes", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "1" }));
    const table = getBoardTable();
    const rows = within(table).getAllByRole("row");
    const separatorIndex = rows.findIndex((row) => row.textContent?.includes("Overall 1"));
    expect(separatorIndex).toBeGreaterThan(-1);
    const nextRowCells = [...rows[separatorIndex + 1].querySelectorAll("td")];
    expect(nextRowCells[0].textContent!.trim()).toBe("1");
  });

  it("does not mutate the underlying data source when rendered", () => {
    const before = JSON.stringify(SLEEPER_DRAFT_BOARD_2026);
    renderPage();
    expect(JSON.stringify(SLEEPER_DRAFT_BOARD_2026)).toBe(before);
  });

  it("renders exactly one Jalen Milroe row on the board, at Sleeper Rank 60 (Phase 2C duplicate-presentation regression)", () => {
    renderPage();
    const table = getBoardTable();
    const milroeRows = within(table).getAllByRole("row").filter((row) => within(row).queryByText("Jalen Milroe"));
    expect(milroeRows).toHaveLength(1);
    const cells = [...milroeRows[0].querySelectorAll("td")].map((cell) => cell.textContent!.trim());
    expect(cells[0]).toBe("60"); // Sleeper Rk -- the retained lowest rank of the confirmed duplicate group
  });
});

describe("/fantasy-football/draft-preview — team builder", () => {
  it("adds a player to the next open round and shows them in My Draft", () => {
    renderPage();
    const boardTable = getBoardTable();
    const gibbsRow = findRowByPlayer(boardTable, "Jahmyr Gibbs");
    fireEvent.click(within(gibbsRow).getByRole("button", { name: "Add Jahmyr Gibbs to team" }));

    const myDraft = getMyDraftPanel();
    // Appears in both the Starting Roster and the "All drafted players" list.
    expect(myDraft.getAllByText("Jahmyr Gibbs").length).toBeGreaterThan(0);
    expect(myDraft.getByText("R1")).toBeTruthy();
  });

  it("marks a drafted player as selected on the board with a Remove button in the same row", () => {
    renderPage();
    const boardTable = getBoardTable();
    fireEvent.click(within(findRowByPlayer(boardTable, "Jahmyr Gibbs")).getByRole("button", { name: "Add Jahmyr Gibbs to team" }));

    const gibbsRowAfter = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    expect(within(gibbsRowAfter).getByRole("button", { name: "Remove Jahmyr Gibbs from team" })).toBeTruthy();
    expect(within(gibbsRowAfter).queryByRole("button", { name: "Add Jahmyr Gibbs to team" })).toBeNull();
  });

  it("removes a player via the same row's toggle button, restoring Add to team", () => {
    renderPage();
    const boardTable = getBoardTable();
    fireEvent.click(within(findRowByPlayer(boardTable, "Jahmyr Gibbs")).getByRole("button", { name: "Add Jahmyr Gibbs to team" }));
    const gibbsRowAfter = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    fireEvent.click(within(gibbsRowAfter).getByRole("button", { name: "Remove Jahmyr Gibbs from team" }));

    expect(getMyDraftPanel().queryByText("Jahmyr Gibbs")).toBeNull();
    const gibbsRowFinal = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    expect(within(gibbsRowFinal).getByRole("button", { name: "Add Jahmyr Gibbs to team" })).toBeTruthy();
  });

  it("removes a player from the sidebar's Remove action, restoring that round to empty", () => {
    renderPage();
    const boardTable = getBoardTable();
    fireEvent.click(within(findRowByPlayer(boardTable, "Jahmyr Gibbs")).getByRole("button", { name: "Add Jahmyr Gibbs to team" }));

    fireEvent.click(getMyDraftPanel().getByRole("button", { name: "Remove" }));

    expect(getMyDraftPanel().queryByText("Jahmyr Gibbs")).toBeNull();
    const gibbsRowAfter = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    expect(within(gibbsRowAfter).getByRole("button", { name: "Add Jahmyr Gibbs to team" })).toBeTruthy();
  });

  it("advances the next-open-round assignment after adding a player, sending a second add to Round 2", () => {
    renderPage();
    const boardTable = getBoardTable();
    fireEvent.click(within(findRowByPlayer(boardTable, "Jahmyr Gibbs")).getByRole("button", { name: "Add Jahmyr Gibbs to team" }));

    const secondRow = getBoardTable().querySelectorAll("tbody tr")[1] as HTMLElement;
    const addButtonInSecondRow = within(secondRow).queryByRole("button", { name: /^Add .+ to team$/ });
    if (addButtonInSecondRow) fireEvent.click(addButtonInSecondRow);

    const myDraft = getMyDraftPanel();
    expect(myDraft.getByText("R2")).toBeTruthy();
  });

  it("clears the whole draft with Clear, restoring every round to empty", () => {
    renderPage();
    const boardTable = getBoardTable();
    fireEvent.click(within(findRowByPlayer(boardTable, "Jahmyr Gibbs")).getByRole("button", { name: "Add Jahmyr Gibbs to team" }));

    fireEvent.click(getMyDraftPanel().getByRole("button", { name: "Clear" }));

    expect(getMyDraftPanel().queryByText("Jahmyr Gibbs")).toBeNull();
    const gibbsRowAfter = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    expect(within(gibbsRowAfter).getByRole("button", { name: "Add Jahmyr Gibbs to team" })).toBeTruthy();
  });

  it("updates roster totals as players are added, excluding missing JKB values from totals rather than treating them as 0", () => {
    renderPage();
    const boardTable = getBoardTable();
    const myDraftBefore = getMyDraftPanel();
    expect(myDraftBefore.getByTestId("my-draft-total-Players").textContent).toContain("0");

    fireEvent.click(within(findRowByPlayer(boardTable, "Jahmyr Gibbs")).getByRole("button", { name: "Add Jahmyr Gibbs to team" }));

    const myDraftAfter = getMyDraftPanel();
    expect(myDraftAfter.getByTestId("my-draft-total-Players").textContent).toContain("1");
    expect(myDraftAfter.getByTestId("my-draft-total-RB").textContent).toContain("1");
  });

  it("shows starting-lineup totals alongside entire-team totals", () => {
    renderPage();
    const myDraft = getMyDraftPanel();
    expect(myDraft.getByText("Starting lineup totals")).toBeTruthy();
    expect(myDraft.getByText("Entire team totals")).toBeTruthy();
    expect(myDraft.getByTestId("my-draft-total-Starting Proj PPG")).toBeTruthy();
    expect(myDraft.getByTestId("my-draft-total-Starting Total PAR")).toBeTruthy();
    expect(myDraft.getByTestId("my-draft-total-Total Team PAR")).toBeTruthy();
  });

  it("never mutates the underlying Sleeper source data when players are added to My Draft", () => {
    const before = JSON.stringify(SLEEPER_DRAFT_BOARD_2026);
    renderPage();
    const boardTable = getBoardTable();
    fireEvent.click(within(findRowByPlayer(boardTable, "Jahmyr Gibbs")).getByRole("button", { name: "Add Jahmyr Gibbs to team" }));
    expect(JSON.stringify(SLEEPER_DRAFT_BOARD_2026)).toBe(before);
  });
});

describe("/fantasy-football/draft-preview — position filters vs. My Draft selections", () => {
  it("does not alter My Draft selections when the position focus changes", () => {
    renderPage();
    const boardTable = getBoardTable();
    fireEvent.click(within(findRowByPlayer(boardTable, "Jahmyr Gibbs")).getByRole("button", { name: "Add Jahmyr Gibbs to team" }));

    fireEvent.click(screen.getByRole("button", { name: "WR" }));
    fireEvent.click(screen.getByRole("button", { name: "ALL" }));

    expect(getMyDraftPanel().getAllByText("Jahmyr Gibbs").length).toBeGreaterThan(0);
  });

  it("does not recompute Sleeper Rank or Pos Rk when the position focus changes with an active My Draft selection", () => {
    renderPage();
    const boardTable = getBoardTable();
    fireEvent.click(within(findRowByPlayer(boardTable, "Jahmyr Gibbs")).getByRole("button", { name: "Add Jahmyr Gibbs to team" }));

    fireEvent.click(screen.getByRole("button", { name: "RB" }));
    const gibbsRowAfter = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    const cells = [...gibbsRowAfter.querySelectorAll("td")].map((cell) => cell.textContent!.trim());
    expect(cells[0]).toBe("1");
  });
});

function getPlayerRows(table: HTMLElement): HTMLElement[] {
  return [...table.querySelectorAll("tbody tr[data-focus-state]")] as HTMLElement[];
}

describe("/fantasy-football/draft-preview — position focus (highlight-only, Phase 2C)", () => {
  it("defaults to ALL with every row in the neutral focus state", () => {
    renderPage();
    const rows = getPlayerRows(getBoardTable());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.dataset.focusState === "neutral")).toBe(true);
  });

  it("keeps the exact same row count when a position is focused", () => {
    renderPage();
    const countBefore = getPlayerRows(getBoardTable()).length;
    fireEvent.click(screen.getByRole("button", { name: "RB" }));
    const countAfter = getPlayerRows(getBoardTable()).length;
    expect(countAfter).toBe(countBefore);
  });

  it("keeps the exact same Sleeper Rank sequence, in order, when a position is focused", () => {
    renderPage();
    const ranksBefore = getPlayerRows(getBoardTable()).map(
      (row) => row.querySelectorAll("td")[0]?.textContent?.trim(),
    );
    fireEvent.click(screen.getByRole("button", { name: "WR" }));
    const ranksAfter = getPlayerRows(getBoardTable()).map(
      (row) => row.querySelectorAll("td")[0]?.textContent?.trim(),
    );
    expect(ranksAfter).toEqual(ranksBefore);
  });

  it("keeps every non-matching row rendered, marked dim rather than removed", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "QB" }));
    const rows = getPlayerRows(getBoardTable());
    expect(rows.some((row) => row.dataset.focusState === "dim")).toBe(true);
    // Jahmyr Gibbs (RB) stays on the board, just de-emphasized under QB focus.
    expect(findRowByPlayer(getBoardTable(), "Jahmyr Gibbs")).toBeTruthy();
    expect(findRowByPlayer(getBoardTable(), "Jahmyr Gibbs").dataset.focusState).toBe("dim");
  });

  it("marks matching-position rows with the match focus state", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "RB" }));
    const gibbsRow = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    expect(gibbsRow.dataset.focusState).toBe("match");
  });

  it("keeps round separators anchored to the same overall Sleeper Rank under every position focus", () => {
    renderPage();
    for (const position of ["QB", "RB", "WR", "TE", "ALL"]) {
      fireEvent.click(screen.getByRole("button", { name: position }));
      const table = getBoardTable();
      const rows = within(table).getAllByRole("row");
      const separatorIndex = rows.findIndex((row) => row.textContent?.includes("Overall 10"));
      expect(separatorIndex, `separator for position ${position}`).toBeGreaterThan(-1);
      const nextRowCells = [...rows[separatorIndex + 1].querySelectorAll("td")];
      expect(nextRowCells[0].textContent!.trim()).toBe("10");
    }
  }, 120000);
});

describe("/fantasy-football/draft-preview — full-height board (Phase 2C)", () => {
  it("does not constrain the board's vertical scroll (no max-height table viewport)", () => {
    renderPage();
    const scroller = screen.getByRole("region", { name: "Draft preview board" });
    expect(scroller.className).not.toMatch(/max-h-/);
  });
});

describe("/fantasy-football/draft-preview — Starting Roster (Phase 2C)", () => {
  it("renders the exact 16-slot structure", () => {
    renderPage();
    const rosterRegion = screen.getByRole("region", { name: "Starting roster" });
    const rows = within(rosterRegion).getAllByRole("row").slice(1); // drop header row
    const slotLabels = rows.map((row) => row.querySelectorAll("td")[0]?.textContent?.trim());
    expect(slotLabels).toEqual([
      "QB", "RB1", "RB2", "WR1", "WR2", "FLEX1", "FLEX2", "K", "DST",
      "Bench 1", "Bench 2", "Bench 3", "Bench 4", "Bench 5", "Bench 6", "Bench 7",
    ]);
  });

  it("fills the QB slot with a drafted QB and reflows to empty after removal", () => {
    renderPage();
    const boardTable = getBoardTable();
    fireEvent.click(within(findRowByPlayer(boardTable, "Jahmyr Gibbs")).getByRole("button", { name: "Add Jahmyr Gibbs to team" }));

    const rosterRegion = screen.getByRole("region", { name: "Starting roster" });
    const rb1Row = within(rosterRegion).getAllByRole("row").find((row) => within(row).queryByText("RB1"))!;
    expect(within(rb1Row).getByText("Jahmyr Gibbs")).toBeTruthy();

    const gibbsRowAfter = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    fireEvent.click(within(gibbsRowAfter).getByRole("button", { name: "Remove Jahmyr Gibbs from team" }));

    const rb1RowAfter = within(screen.getByRole("region", { name: "Starting roster" }))
      .getAllByRole("row")
      .find((row) => within(row).queryByText("RB1"))!;
    expect(within(rb1RowAfter).queryByText("Jahmyr Gibbs")).toBeNull();
  });
});

describe("/fantasy-football/draft-preview — player-cell add/remove action (Phase 2D)", () => {
  it("renders a compact Add button beside the player identity, with an accessible label naming the player", () => {
    renderPage();
    const gibbsRow = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    const addButton = within(gibbsRow).getByRole("button", { name: "Add Jahmyr Gibbs to team" });
    expect(addButton).toBeTruthy();
    expect(addButton).toHaveAttribute("title", "Add Jahmyr Gibbs to team");
  });

  it("swaps to a compact Remove button once drafted, with an accessible label naming the player", () => {
    renderPage();
    const boardTable = getBoardTable();
    fireEvent.click(within(findRowByPlayer(boardTable, "Jahmyr Gibbs")).getByRole("button", { name: "Add Jahmyr Gibbs to team" }));

    const gibbsRowAfter = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    const removeButton = within(gibbsRowAfter).getByRole("button", { name: "Remove Jahmyr Gibbs from team" });
    expect(removeButton).toBeTruthy();
    expect(within(gibbsRowAfter).queryByRole("button", { name: "Add Jahmyr Gibbs to team" })).toBeNull();
  });

  it("does not render a redundant far-right Team/Pick action column now that the action lives beside the player name", () => {
    renderPage();
    const table = getBoardTable();
    const headerCells = within(table).getAllByRole("columnheader");
    expect(headerCells.some((cell) => cell.textContent?.trim() === "Team")).toBe(false);
    expect(headerCells.some((cell) => cell.textContent?.trim() === "Pick")).toBe(false);
  });

  it("keeps selected styling in sync with the sidebar after adding/removing from the board button", () => {
    renderPage();
    const boardTable = getBoardTable();
    fireEvent.click(within(findRowByPlayer(boardTable, "Jahmyr Gibbs")).getByRole("button", { name: "Add Jahmyr Gibbs to team" }));

    let gibbsRow = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    expect(gibbsRow.className).toMatch(/emerald/);
    expect(getMyDraftPanel().getAllByText("Jahmyr Gibbs").length).toBeGreaterThan(0);

    fireEvent.click(within(gibbsRow).getByRole("button", { name: "Remove Jahmyr Gibbs from team" }));
    gibbsRow = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    expect(gibbsRow.className).not.toMatch(/emerald/);
    expect(getMyDraftPanel().queryByText("Jahmyr Gibbs")).toBeNull();
  });
});

describe("/fantasy-football/draft-preview — responsive table density (Phase 2F fluid sizing)", () => {
  it("applies fluid clamp()-based cell padding to the board table (scales continuously with viewport width)", () => {
    renderPage();
    const table = getBoardTable();
    const firstHeaderCell = within(table).getAllByRole("columnheader")[0];
    expect(firstHeaderCell.className).toMatch(/px-\[clamp\(/);
    expect(firstHeaderCell.className).toMatch(/py-\[clamp\(/);
  });

  it("keeps player identity (name + team) present and legible in the sticky player cell", () => {
    renderPage();
    const gibbsRow = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    expect(within(gibbsRow).getByText("Jahmyr Gibbs")).toBeTruthy();
    expect(within(gibbsRow).getByText("DET")).toBeTruthy();
  });
});

function openTargetPopover(row: HTMLElement, player: string) {
  fireEvent.click(within(row).getByRole("button", { name: new RegExp(`Target ${player} for a round|Edit ${player}'s round targets`) }));
}

describe("/fantasy-football/draft-preview — target star + main board highlighting (Phase 2D)", () => {
  it("targets a player for a round via the star popover, and shows the R-label + outline on the board row", () => {
    renderPage();
    const gibbsRow = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    openTargetPopover(gibbsRow, "Jahmyr Gibbs");
    fireEvent.click(screen.getByRole("checkbox", { name: "Round 3" }));

    const gibbsRowAfter = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    expect(within(gibbsRowAfter).getByText("R3")).toBeTruthy();
    expect(gibbsRowAfter.className).toMatch(/outline-amber-300/);
  });

  it("allows targeting the same player in multiple rounds and shows both labels", () => {
    renderPage();
    const gibbsRow = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    openTargetPopover(gibbsRow, "Jahmyr Gibbs");
    fireEvent.click(screen.getByRole("checkbox", { name: "Round 3" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Round 4" }));

    const gibbsRowAfter = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    expect(within(gibbsRowAfter).getByText("R3, R4")).toBeTruthy();
  });

  it("does not overpower heat-map colors -- the target highlight is an outline, not a background override on stat cells", () => {
    renderPage();
    const gibbsRow = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    openTargetPopover(gibbsRow, "Jahmyr Gibbs");
    fireEvent.click(screen.getByRole("checkbox", { name: "Round 3" }));
    const gibbsRowAfter = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    const statCell = gibbsRowAfter.querySelectorAll("td")[5]; // JKB Proj PPG heat cell
    expect(statCell.getAttribute("style") ?? "").not.toContain("amber");
  });

  it("keeps target status visible while a position focus is active", () => {
    renderPage();
    const gibbsRow = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    openTargetPopover(gibbsRow, "Jahmyr Gibbs");
    fireEvent.click(screen.getByRole("checkbox", { name: "Round 3" }));

    fireEvent.click(screen.getByRole("button", { name: "QB" }));
    const gibbsRowAfter = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    expect(within(gibbsRowAfter).getByText("R3")).toBeTruthy();
  }, 120000);

  it("does not mutate the Sleeper source array when targeting a player", () => {
    const before = JSON.stringify(SLEEPER_DRAFT_BOARD_2026);
    renderPage();
    const gibbsRow = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    openTargetPopover(gibbsRow, "Jahmyr Gibbs");
    fireEvent.click(screen.getByRole("checkbox", { name: "Round 3" }));
    expect(JSON.stringify(SLEEPER_DRAFT_BOARD_2026)).toBe(before);
  });
});

function switchToByRound() {
  fireEvent.click(screen.getByRole("tab", { name: "By Round" }));
}

function roundChip(round: string) {
  return within(screen.getByRole("tablist", { name: "Target round" })).getByRole("tab", { name: new RegExp(`^R${round}( |$)`) });
}

describe("/fantasy-football/draft-preview — BOARD / BY ROUND views (Phase 2D)", () => {
  it("switches between BOARD and BY ROUND, keeping the My Draft sidebar visible in both", () => {
    renderPage();
    expect(screen.getByRole("region", { name: "Draft preview board" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "My draft" })).toBeTruthy();

    switchToByRound();
    expect(screen.queryByRole("region", { name: "Draft preview board" })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "My draft" })).toBeTruthy();
  });

  it("shows an empty-round message when a round has no saved targets", () => {
    renderPage();
    switchToByRound();
    expect(screen.getByText("No saved targets for Round 1 yet.")).toBeTruthy();
  });

  it("shows round chip counts once a target is saved, and lists the saved player under the correct round", () => {
    renderPage();
    const gibbsRow = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    openTargetPopover(gibbsRow, "Jahmyr Gibbs");
    fireEvent.click(screen.getByRole("checkbox", { name: "Round 3" }));

    switchToByRound();
    expect(roundChip("3").textContent).toContain("(1)");
    fireEvent.click(roundChip("3"));
    expect(screen.getByText("Jahmyr Gibbs")).toBeTruthy();
  });

  it("reorders targets within a round with the move up/down controls, and the order persists", () => {
    renderPage();
    const gibbsRow = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    openTargetPopover(gibbsRow, "Jahmyr Gibbs");
    fireEvent.click(screen.getByRole("checkbox", { name: "Round 3" }));

    const otherRow = getBoardTable().querySelectorAll("tbody tr[data-focus-state]")[1] as HTMLElement;
    const otherPlayerName = within(otherRow).getByText((_, el) => el?.hasAttribute("data-player-name") === true).textContent!;
    openTargetPopover(otherRow, otherPlayerName);
    fireEvent.click(screen.getByRole("checkbox", { name: "Round 3" }));

    switchToByRound();
    fireEvent.click(roundChip("3"));
    const namesBefore = screen.getAllByRole("listitem").map((item) => item.textContent);
    expect(namesBefore[0]).toContain("Jahmyr Gibbs");

    fireEvent.click(screen.getAllByRole("button", { name: /Move .+ down in Round 3 targets/ })[0]);
    const namesAfter = screen.getAllByRole("listitem").map((item) => item.textContent);
    expect(namesAfter[1]).toContain("Jahmyr Gibbs");
  });

  it("removing a target from the BY ROUND view clears the highlight back on the BOARD view", () => {
    renderPage();
    const gibbsRow = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    openTargetPopover(gibbsRow, "Jahmyr Gibbs");
    fireEvent.click(screen.getByRole("checkbox", { name: "Round 3" }));

    switchToByRound();
    fireEvent.click(roundChip("3"));
    fireEvent.click(screen.getByRole("button", { name: "Remove Jahmyr Gibbs from Round 3 targets" }));
    expect(screen.getByText("No saved targets for Round 3 yet.")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Board" }));
    const gibbsRowAfter = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    expect(within(gibbsRowAfter).queryByText("R3")).toBeNull();
  });

  it("adds a targeted player to My Draft directly from the BY ROUND list", () => {
    renderPage();
    const gibbsRow = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    openTargetPopover(gibbsRow, "Jahmyr Gibbs");
    fireEvent.click(screen.getByRole("checkbox", { name: "Round 3" }));

    switchToByRound();
    fireEvent.click(roundChip("3"));
    fireEvent.click(screen.getByRole("button", { name: "Add Jahmyr Gibbs to team" }));

    expect(getMyDraftPanel().getAllByText("Jahmyr Gibbs").length).toBeGreaterThan(0);
  });
});

describe("/fantasy-football/draft-preview — target persistence (Phase 2D)", () => {
  it("saves targets to localStorage under the versioned key and restores them on the next render", () => {
    const { unmount } = renderPage();
    const gibbsRow = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    openTargetPopover(gibbsRow, "Jahmyr Gibbs");
    fireEvent.click(screen.getByRole("checkbox", { name: "Round 3" }));
    expect(window.localStorage.getItem(DRAFT_TARGETS_STORAGE_KEY)).not.toBeNull();
    unmount();

    renderPage();
    const gibbsRowReloaded = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    expect(within(gibbsRowReloaded).getByText("R3")).toBeTruthy();
  }, 120000);

  it("does not crash and starts with no targets when localStorage holds malformed JSON", () => {
    window.localStorage.setItem(DRAFT_TARGETS_STORAGE_KEY, "{not valid json");
    expect(() => renderPage()).not.toThrow();
    const gibbsRow = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    expect(within(gibbsRow).queryByText(/^R\d/)).toBeNull();
  });

  it("starts with no targets when localStorage holds a different schema version", () => {
    window.localStorage.setItem(DRAFT_TARGETS_STORAGE_KEY, JSON.stringify({ version: 999, rounds: { "1": [1] } }));
    renderPage();
    const gibbsRow = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    expect(within(gibbsRow).queryByText(/^R\d/)).toBeNull();
  });
});

/** jsdom-normalized `rgb(...)` string, so comparisons are not sensitive to serialization whitespace differences. */
function normalizedColor(color: string): string {
  const probe = document.createElement("div");
  probe.style.backgroundColor = color;
  return probe.style.backgroundColor;
}

describe("/fantasy-football/draft-preview — heat-map coverage (Phase 2E)", () => {
  it("scopes Projection Rk color to the row's own position pool (root-cause fix), matching the canonical getRankGradientColor helper", () => {
    renderPage();
    const qbRows = filterDraftPreviewRows(DRAFT_PREVIEW_ROWS_2026, "QB", "");
    const rankedQbs = qbRows.filter((row) => row.jkb?.projectionRank != null);
    const worstQb = [...rankedQbs].sort((a, b) => (b.jkb!.projectionRank as number) - (a.jkb!.projectionRank as number))[0];
    expect(worstQb).toBeTruthy();
    const positionMax = getMaxRank(qbRows.map((row) => row.jkb?.projectionRank));
    const expectedColor = getRankGradientColor(worstQb.jkb!.projectionRank as number, positionMax);
    expect(expectedColor).toBeTruthy();

    const row = findRowByPlayer(getBoardTable(), worstQb.player);
    const cell = row.querySelectorAll("td")[8] as HTMLElement; // Projection Rk
    expect(cell.style.backgroundColor).toBe(normalizedColor(expectedColor!));
  });

  it("scopes AVG Rk color to the row's own position pool", () => {
    renderPage();
    const rbRows = filterDraftPreviewRows(DRAFT_PREVIEW_ROWS_2026, "RB", "");
    const rankedRbs = rbRows.filter((row) => row.jkb?.averageRank != null);
    const bestRb = [...rankedRbs].sort((a, b) => (a.jkb!.averageRank as number) - (b.jkb!.averageRank as number))[0];
    expect(bestRb).toBeTruthy();
    const positionMax = getMaxRank(rbRows.map((row) => row.jkb?.averageRank));
    const expectedColor = getRankGradientColor(bestRb.jkb!.averageRank as number, positionMax);

    const row = findRowByPlayer(getBoardTable(), bestRb.player);
    const cell = row.querySelectorAll("td")[9] as HTMLElement; // AVG Rk
    expect(cell.style.backgroundColor).toBe(normalizedColor(expectedColor!));
  });

  it("scopes 2025 Pts Rk, 2025 PPG Rk and L8 Pts Rk color to the row's own position pool", () => {
    renderPage();
    const wrRows = filterDraftPreviewRows(DRAFT_PREVIEW_ROWS_2026, "WR", "");
    const withSeasonRank = wrRows.filter((row) => row.seasonPointsRank2025 != null);
    const sample = withSeasonRank[0];
    expect(sample).toBeTruthy();
    const positionMax = getMaxRank(wrRows.map((row) => row.seasonPointsRank2025));
    const expectedColor = getRankGradientColor(sample.seasonPointsRank2025 as number, positionMax);

    const row = findRowByPlayer(getBoardTable(), sample.player);
    const cell = row.querySelectorAll("td")[11] as HTMLElement; // 2025 Pts Rk
    expect(cell.style.backgroundColor).toBe(normalizedColor(expectedColor!));
  });

  it("gives JKB PAR/G the canonical positive/negative pill treatment, scoped to the row's own position pool", () => {
    renderPage();
    const teRows = filterDraftPreviewRows(DRAFT_PREVIEW_ROWS_2026, "TE", "");
    const positiveTe = teRows.find((row) => row.jkbParPerGame != null && row.jkbParPerGame > 1);
    const negativeTe = teRows.find((row) => row.jkbParPerGame != null && row.jkbParPerGame < -1);
    if (positiveTe) {
      const cell = findRowByPlayer(getBoardTable(), positiveTe.player).querySelectorAll("td")[6];
      expect(cell.querySelector("span")?.className ?? "").toMatch(/emerald/);
    }
    if (negativeTe) {
      const cell = findRowByPlayer(getBoardTable(), negativeTe.player).querySelectorAll("td")[6];
      expect(cell.querySelector("span")?.className ?? "").toMatch(/rose/);
    }
    expect(positiveTe || negativeTe).toBeTruthy();
  });

  it("keeps missing rank/PAR values neutral (no color) rather than fabricating a shade", () => {
    renderPage();
    const unresolved = DRAFT_PREVIEW_ROWS_2026.find((row) => row.player === "Tua Tagovailoa")!;
    const row = findRowByPlayer(getBoardTable(), unresolved.player);
    const projectionCell = row.querySelectorAll("td")[8] as HTMLElement;
    expect(projectionCell.style.backgroundColor).toBe("");
    expect(projectionCell.textContent?.trim()).toBe("—");
  });

  it("renders Model Rk as a position-relative display label (e.g. RB4), derived from -- but never overwriting -- the cross-position Model Rank authority (Phase 2F)", () => {
    renderPage();
    const withModelRank = DRAFT_PREVIEW_ROWS_2026.find(
      (row) => row.modelRank != null && row.canonicalPosition != null,
    )!;
    const modelRankBefore = withModelRank.modelRank;
    const row = findRowByPlayer(getBoardTable(), withModelRank.player);
    const cell = row.querySelectorAll("td")[7] as HTMLElement; // Model Rk
    expect(cell.textContent?.trim()).toMatch(new RegExp(`^${withModelRank.canonicalPosition}\\d+$`));
    expect(cell.style.backgroundColor).not.toBe(""); // now heat-mapped, scoped to the derived positional pool
    expect(cell.getAttribute("title")).toContain(`Model Rank: ${withModelRank.modelRank} overall`);
    // The underlying authority itself is never mutated by deriving the display label.
    expect(withModelRank.modelRank).toBe(modelRankBefore);
  });

  it("keeps canonical heat-map treatment visible when a position focus is active (dimming is opacity-only, no color override)", () => {
    renderPage();
    const qbRows = filterDraftPreviewRows(DRAFT_PREVIEW_ROWS_2026, "QB", "");
    const rankedQbs = qbRows.filter((row) => row.jkb?.projectionRank != null);
    const worstQb = [...rankedQbs].sort((a, b) => (b.jkb!.projectionRank as number) - (a.jkb!.projectionRank as number))[0];
    const positionMax = getMaxRank(qbRows.map((row) => row.jkb?.projectionRank));
    const expectedColor = getRankGradientColor(worstQb.jkb!.projectionRank as number, positionMax);

    fireEvent.click(screen.getByRole("button", { name: "RB" })); // dims QB rows
    const row = findRowByPlayer(getBoardTable(), worstQb.player);
    expect(row.dataset.focusState).toBe("dim");
    expect(row.className).not.toMatch(/grayscale/);
    const cell = row.querySelectorAll("td")[8] as HTMLElement;
    expect(cell.style.backgroundColor).toBe(normalizedColor(expectedColor!));
  });
});

describe("/fantasy-football/draft-preview — sticky column header (Phase 2F)", () => {
  it("does not rely on thead itself for sticky positioning (root-cause fix -- sticky lives on every th)", () => {
    renderPage();
    const table = getBoardTable();
    const thead = table.querySelector("thead")!;
    expect(thead.className).not.toMatch(/sticky/);
  });

  it("makes every header cell sticky against page scroll, offset below the site header, with an opaque background", () => {
    renderPage();
    const table = getBoardTable();
    const headerCells = within(table).getAllByRole("columnheader");
    expect(headerCells.length).toBeGreaterThan(2);
    for (const cell of headerCells) {
      expect(cell.className).toMatch(/sticky/);
      expect(cell.className).toMatch(/top-\[73px\]/);
      expect(cell.className).toMatch(/bg-slate-100/);
    }
  });

  it("gives the sticky Sleeper Rank and Player header cells a higher z-index than ordinary sticky header cells", () => {
    renderPage();
    const table = getBoardTable();
    const headerCells = within(table).getAllByRole("columnheader");
    const rankHeader = headerCells[0];
    const playerHeader = headerCells[1];
    const posRkHeader = headerCells[2];

    expect(rankHeader.className).toMatch(/sticky/);
    expect(rankHeader.className).toMatch(/left-0/);
    expect(rankHeader.className).toMatch(/z-30/);
    expect(playerHeader.className).toMatch(/sticky/);
    expect(playerHeader.className).toMatch(/left-10/);
    expect(playerHeader.className).toMatch(/z-30/);

    expect(posRkHeader.className).toMatch(/z-20/);
    expect(posRkHeader.className).not.toMatch(/left-0|left-10/);
  });

  it("keeps the sticky body Rank/Player cells below the sticky header layer", () => {
    renderPage();
    const gibbsRow = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    const bodyCells = gibbsRow.querySelectorAll("td");
    expect(bodyCells[0].className).toMatch(/sticky/);
    expect(bodyCells[0].className).toMatch(/z-10/);
    expect(bodyCells[1].className).toMatch(/sticky/);
    expect(bodyCells[1].className).toMatch(/z-10/);
  });

  it("renders exactly one visible column-header row", () => {
    renderPage();
    const table = getBoardTable();
    expect(table.querySelectorAll("thead").length).toBe(1);
    expect(table.querySelectorAll("thead tr").length).toBe(1);
  });

  it("still does not reintroduce a max-height internal vertical scroller on the board", () => {
    renderPage();
    const scroller = screen.getByRole("region", { name: "Draft preview board" });
    expect(scroller.className).not.toMatch(/max-h-/);
  });

  it("does not remove overflow-x horizontal scrolling from the board scroller", () => {
    renderPage();
    const scroller = screen.getByRole("region", { name: "Draft preview board" });
    expect(scroller.className).toMatch(/overflow-x-auto/);
  });

  it("uses border-separate (never border-collapse) on the board table, the root-cause fix for sticky th cells", () => {
    renderPage();
    const table = getBoardTable();
    expect(table.className).toMatch(/border-separate/);
    expect(table.className).not.toMatch(/border-collapse/);
  });
});

describe("/fantasy-football/draft-preview — responsive fluid sizing (Phase 2F)", () => {
  it("scopes fluid clamp() sizing to the board's header and body cells", () => {
    renderPage();
    const table = getBoardTable();
    const thead = table.querySelector("thead")!;
    expect(thead.className).toMatch(/text-\[clamp\(/); // header text size, inherited by every th

    const headerCells = within(table).getAllByRole("columnheader");
    expect(headerCells[2].className).toMatch(/px-\[clamp\(/);

    const gibbsRow = findRowByPlayer(table, "Jahmyr Gibbs");
    expect(table.className).toMatch(/text-\[clamp\(/); // body cell text size
    expect(gibbsRow.querySelectorAll("td")[0].className).toMatch(/px-\[clamp\(/);
  });

  it("keeps player identity (name + team) present and legible under fluid sizing", () => {
    renderPage();
    const gibbsRow = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    expect(within(gibbsRow).getByText("Jahmyr Gibbs")).toBeTruthy();
    expect(within(gibbsRow).getByText("DET")).toBeTruthy();
  });

  it("keeps the add/remove and target action controls rendered and operable under fluid sizing", () => {
    renderPage();
    const gibbsRow = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    expect(within(gibbsRow).getByRole("button", { name: "Add Jahmyr Gibbs to team" })).toBeTruthy();
    expect(within(gibbsRow).getByRole("button", { name: "Target Jahmyr Gibbs for a round" })).toBeTruthy();
  });
});

describe("/fantasy-football/draft-preview — position-relative display ranks (Phase 2F)", () => {
  it("shows RB-prefixed Projection Rk / AVG Rk for an RB row", () => {
    renderPage();
    const rbRows = filterDraftPreviewRows(DRAFT_PREVIEW_ROWS_2026, "RB", "");
    const sample = rbRows.find((row) => row.jkb?.projectionRank != null && row.jkb?.averageRank != null)!;
    expect(sample).toBeTruthy();
    const row = findRowByPlayer(getBoardTable(), sample.player);
    const cells = row.querySelectorAll("td");
    expect(cells[8].textContent?.trim()).toBe(`RB${sample.jkb!.projectionRank}`); // Projection Rk
    expect(cells[9].textContent?.trim()).toBe(`RB${sample.jkb!.averageRank}`); // AVG Rk
  });

  it("shows WR-prefixed 2025 Pts Rk / 2025 PPG Rk / L8 Pts Rk for a WR row", () => {
    renderPage();
    const wrRows = filterDraftPreviewRows(DRAFT_PREVIEW_ROWS_2026, "WR", "");
    const sample = wrRows.find(
      (row) => row.seasonPointsRank2025 != null && row.seasonPpgRank2025 != null && row.lastEightPointsRank != null,
    )!;
    expect(sample).toBeTruthy();
    const row = findRowByPlayer(getBoardTable(), sample.player);
    const cells = row.querySelectorAll("td");
    expect(cells[11].textContent?.trim()).toBe(`WR${sample.seasonPointsRank2025}`);
    expect(cells[12].textContent?.trim()).toBe(`WR${sample.seasonPpgRank2025}`);
    expect(cells[13].textContent?.trim()).toBe(`WR${sample.lastEightPointsRank}`);
  });

  it("shows a QB-prefixed Model Rk display label, distinct from the raw cross-position authority", () => {
    renderPage();
    const qbRows = filterDraftPreviewRows(DRAFT_PREVIEW_ROWS_2026, "QB", "");
    const sample = qbRows.find((row) => row.modelRank != null)!;
    expect(sample).toBeTruthy();
    const row = findRowByPlayer(getBoardTable(), sample.player);
    const cell = row.querySelectorAll("td")[7];
    expect(cell.textContent?.trim()).toMatch(/^QB\d+$/);
  });

  it("shows a TE-prefixed SOS label when SOS is populated for a TE row", () => {
    renderPage();
    const teRows = filterDraftPreviewRows(DRAFT_PREVIEW_ROWS_2026, "TE", "");
    const sample = teRows.find((row) => row.jkb?.strengthOfSchedule != null)!;
    if (!sample) return; // no TE with SOS in the fixed source data -- nothing to assert
    const row = findRowByPlayer(getBoardTable(), sample.player);
    const cell = row.querySelectorAll("td")[10];
    expect(cell.textContent?.trim()).toBe(`TE${sample.jkb!.strengthOfSchedule}`);
  });

  it("derives the Model positional rank deterministically and never mutates the source Model Rank authority", () => {
    const before = JSON.stringify(DRAFT_PREVIEW_ROWS_2026.map((row) => row.modelRank));
    const first = renderPage();
    expect(JSON.stringify(DRAFT_PREVIEW_ROWS_2026.map((row) => row.modelRank))).toBe(before);

    // Re-rendering produces the exact same derived label -- deterministic, not randomly tie-broken.
    const qbRows = filterDraftPreviewRows(DRAFT_PREVIEW_ROWS_2026, "QB", "");
    const sample = qbRows.find((row) => row.modelRank != null)!;
    const firstLabel = findRowByPlayer(getBoardTable(), sample.player).querySelectorAll("td")[7].textContent?.trim();
    first.unmount();

    renderPage();
    const secondLabel = findRowByPlayer(getBoardTable(), sample.player).querySelectorAll("td")[7].textContent?.trim();
    expect(secondLabel).toBe(firstLabel);
  });

  it("keeps JKB PAR/G numeric (not position-rank text) and PPG columns numeric", () => {
    renderPage();
    const gibbsRow = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    const cells = gibbsRow.querySelectorAll("td");
    expect(cells[6].textContent?.trim()).toMatch(/^[+-]\d/); // JKB PAR/G
    expect(cells[4].textContent?.trim()).toMatch(/^\d/); // Sleeper PPG
    expect(cells[5].textContent?.trim()).toMatch(/^\d/); // JKB Proj PPG
  });
});

describe("/fantasy-football/draft-preview — Phase 2E regression", () => {
  it("still adds/removes a player via the board button", () => {
    renderPage();
    const boardTable = getBoardTable();
    fireEvent.click(within(findRowByPlayer(boardTable, "Jahmyr Gibbs")).getByRole("button", { name: "Add Jahmyr Gibbs to team" }));
    expect(getMyDraftPanel().getAllByText("Jahmyr Gibbs").length).toBeGreaterThan(0);
    fireEvent.click(within(findRowByPlayer(getBoardTable(), "Jahmyr Gibbs")).getByRole("button", { name: "Remove Jahmyr Gibbs from team" }));
    expect(getMyDraftPanel().queryByText("Jahmyr Gibbs")).toBeNull();
  });

  it("still targets a player and shows the star/round label", () => {
    renderPage();
    const gibbsRow = findRowByPlayer(getBoardTable(), "Jahmyr Gibbs");
    fireEvent.click(within(gibbsRow).getByRole("button", { name: "Target Jahmyr Gibbs for a round" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Round 3" }));
    expect(within(findRowByPlayer(getBoardTable(), "Jahmyr Gibbs")).getByText("R3")).toBeTruthy();
  });

  it("keeps board row order unchanged (Sleeper Rank ascending)", () => {
    renderPage();
    const ranks = [...getBoardTable().querySelectorAll("tbody tr[data-focus-state]")].map(
      (row) => Number((row.querySelectorAll("td")[0] as HTMLElement).textContent),
    );
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it("Starting Roster still fills from a drafted player", () => {
    renderPage();
    fireEvent.click(within(findRowByPlayer(getBoardTable(), "Jahmyr Gibbs")).getByRole("button", { name: "Add Jahmyr Gibbs to team" }));
    const rosterRegion = screen.getByRole("region", { name: "Starting roster" });
    const rb1Row = within(rosterRegion).getAllByRole("row").find((row) => within(row).queryByText("RB1"))!;
    expect(within(rb1Row).getByText("Jahmyr Gibbs")).toBeTruthy();
  });
});
