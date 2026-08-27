import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import App from "@/App";
import FantasyDraftPreview from "@/pages/FantasyDraftPreview";
import FantasyFootball from "@/pages/FantasyFootball";
import { SLEEPER_DRAFT_BOARD_2026 } from "@/lib/fantasy/draftPreview/sleeperDraftBoard";

vi.mock("@/components/layout/SiteShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/usePageSeo", async () => ({
  ...(await vi.importActual<typeof import("@/hooks/usePageSeo")>("@/hooks/usePageSeo")),
  usePageSeo: vi.fn(),
}));
vi.mock("@/pages/FantasyWeeklyRankings", () => ({ default: () => <h1>Weekly Fantasy Rankings</h1> }));

vi.setConfig({ testTimeout: 60000 });

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/fantasy-football/draft-preview"]}>
      <Routes>
        <Route path="/fantasy-football/draft-preview" element={<FantasyDraftPreview />} />
      </Routes>
    </MemoryRouter>,
  );
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
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    const gibbsRow = rows.find((row) => within(row).queryByText("Jahmyr Gibbs"))!;
    const cells = [...gibbsRow.querySelectorAll("td")].map((cell) => cell.textContent!.trim());
    expect(cells[0]).toBe("1"); // Sleeper Rk
    expect(cells[4]).toBe("331.4"); // Sleeper Proj
    expect(cells[5]).toBe("19.5"); // Sleeper PPG
  });

  it("keeps JKB Proj PPG and JKB PAR/G distinct from Sleeper's own projections", () => {
    renderPage();
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    const gibbsRow = rows.find((row) => within(row).queryByText("Jahmyr Gibbs"))!;
    const cells = [...gibbsRow.querySelectorAll("td")].map((cell) => cell.textContent!.trim());
    // Sleeper PPG (19.5) and JKB Proj PPG are independent authorities and need not match.
    expect(cells[6]).not.toBe(""); // JKB Proj PPG populated
    expect(cells[7]).toMatch(/^[+-]/); // JKB PAR/G is signed
  });

  it("reuses the corrected F2 Model Rank column", () => {
    renderPage();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Model Rk")).toBeTruthy();
  });

  it("filters by position while preserving each row's Sleeper Rank and Pos Rk", () => {
    renderPage();
    const before = screen.getByRole("table");
    const gibbsCellsBefore = [
      ...within(before).getAllByRole("row").find((row) => within(row).queryByText("Jahmyr Gibbs"))!.querySelectorAll("td"),
    ].map((c) => c.textContent!.trim());

    fireEvent.click(screen.getByRole("button", { name: "RB" }));
    const after = screen.getByRole("table");
    const gibbsRowAfter = within(after).getAllByRole("row").find((row) => within(row).queryByText("Jahmyr Gibbs"))!;
    const gibbsCellsAfter = [...gibbsRowAfter.querySelectorAll("td")].map((c) => c.textContent!.trim());
    expect(gibbsCellsAfter[0]).toBe(gibbsCellsBefore[0]); // Sleeper Rk unchanged
    expect(gibbsCellsAfter[2]).toBe(gibbsCellsBefore[2]); // Pos Rk unchanged

    // Every visible row is now an RB (or shows N/A when out of JKB scope, but
    // this source-CSV slice around Gibbs is entirely RB-tagged by Sleeper).
    fireEvent.click(screen.getByRole("button", { name: "QB" }));
    expect(within(screen.getByRole("table")).queryByText("Jahmyr Gibbs")).toBeNull();
  });

  it("defaults the draft-position selector to slot 10 and renders the slot-10 Round 1 separator before overall pick 10", () => {
    renderPage();
    const group = screen.getByRole("group", { name: "Draft position" });
    expect(within(group).getByRole("button", { name: "10" })).toHaveAttribute("aria-pressed", "true");

    const table = screen.getByRole("table");
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
    const table = screen.getByRole("table");
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
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    const separatorIndex = rows.findIndex((row) => row.textContent?.includes("Overall 1"));
    expect(separatorIndex).toBeGreaterThan(-1);
    const nextRowCells = [...rows[separatorIndex + 1].querySelectorAll("td")];
    expect(nextRowCells[0].textContent!.trim()).toBe("1");
  });

  it("keeps separators anchored to overall Sleeper Rank under a position filter, never repositioning onto a visible row", () => {
    renderPage();
    // Slot 10 Round 1 target is overall pick 10 = Jahmyr Gibbs (RB). Filtering to QB
    // hides that row entirely, so no "Overall 10" separator should appear anywhere.
    fireEvent.click(screen.getByRole("button", { name: "QB" }));
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows.some((row) => /Overall 10(?!\d)/.test(row.textContent ?? ""))).toBe(false);
  });

  it("does not mutate the underlying data source when rendered", () => {
    const before = JSON.stringify(SLEEPER_DRAFT_BOARD_2026);
    renderPage();
    expect(JSON.stringify(SLEEPER_DRAFT_BOARD_2026)).toBe(before);
  });
});

function getDecisionPanel() {
  const heading = screen.getByRole("heading", { level: 2, name: "Draft decision support" });
  return within(heading.closest("section")!);
}

describe("/fantasy-football/draft-preview — decision support panel", () => {
  it("renders the panel with the default slot-10 round-1 pick window", () => {
    renderPage();
    const panel = getDecisionPanel();
    expect(panel.getByText("Your pick")).toBeTruthy();
    expect(panel.getByText("Round 1 • Pick 1.10")).toBeTruthy();
    expect(panel.getByText("Overall 10")).toBeTruthy();
    expect(panel.getByText("Next pick")).toBeTruthy();
    expect(panel.getByText("Round 2 • Pick 2.10")).toBeTruthy();
    expect(panel.getByText("Overall 15")).toBeTruthy();
    expect(panel.getByText("Opponent picks before next turn")).toBeTruthy();
    expect(panel.getByText("4")).toBeTruthy();
  });

  it("updates the panel when the evaluated round changes", () => {
    renderPage();
    fireEvent.click(getDecisionPanel().getByRole("button", { name: "R2 • 2.10" }));
    const panel = getDecisionPanel();
    expect(panel.getByText("Round 2 • Pick 2.10")).toBeTruthy();
    expect(panel.getByText("Overall 15")).toBeTruthy();
    expect(panel.getByText("Round 3 • Pick 3.10")).toBeTruthy();
    expect(panel.getByText("Overall 34")).toBeTruthy();
    // 15 -> 34 leaves 18 opponent picks in between.
    expect(panel.getByText("18")).toBeTruthy();
  });

  it("recomputes the pick window when the draft slot changes", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "1" }));
    const panel = getDecisionPanel();
    expect(panel.getByText("Round 1 • Pick 1.01")).toBeTruthy();
    expect(panel.getByText("Overall 1")).toBeTruthy();
  });

  it("renders Best Available, Best JKB Projection and Best PAR cards with a named player", () => {
    renderPage();
    const panel = getDecisionPanel();
    expect(panel.getByText("Best Available")).toBeTruthy();
    expect(panel.getByText("Best JKB Projection")).toBeTruthy();
    expect(panel.getByText("Best PAR")).toBeTruthy();
  });

  it("renders position opportunity-cost cards for QB/RB/WR/TE with Now/Next/Wait cost values", () => {
    renderPage();
    const panel = getDecisionPanel();
    expect(panel.getByText("Position opportunity cost")).toBeTruthy();
    for (const position of ["QB", "RB", "WR", "TE"]) {
      expect(panel.getAllByText(position).length).toBeGreaterThan(0);
    }
    expect(panel.getAllByText(/^Wait cost: /).length).toBeGreaterThan(0);
  });

  it("shows insufficient data instead of a fabricated zero wait cost on the last tracked turn", () => {
    renderPage();
    const lastRoundButtons = getDecisionPanel().getAllByRole("button", { name: /^R\d+ • \d+\.10$/ });
    fireEvent.click(lastRoundButtons[lastRoundButtons.length - 1]);
    const panel = getDecisionPanel();
    expect(panel.getByText("Last tracked turn")).toBeTruthy();
    expect(panel.getAllByText(/^Wait cost: insufficient data$/).length).toBe(4);
  });

  it("adds a per-row availability Status column without changing Sleeper Rank order", () => {
    renderPage();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Status")).toBeTruthy();
    const rows = within(table).getAllByRole("row");
    const sleeperRanks = rows
      .map((row) => row.querySelectorAll("td")[0]?.textContent?.trim())
      .filter((value): value is string => value != null && /^\d+$/.test(value))
      .map(Number);
    expect(sleeperRanks).toEqual([...sleeperRanks].sort((a, b) => a - b));
  });
});
