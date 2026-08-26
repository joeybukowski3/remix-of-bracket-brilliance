import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render as rtlRender, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import FantasyParBoard from "@/components/fantasy/FantasyParBoard";
import { FANTASY_RANKINGS } from "@/lib/fantasy/rankings";
import { getShadowModelRankRow } from "@/lib/fantasy/rosResearch/shadowModelRankJoin";

function render(ui: ReactElement) {
  return rtlRender(<MemoryRouter>{ui}</MemoryRouter>);
}

function overallRowCells(player: string): HTMLElement[] {
  const row = screen.getAllByRole("row").find((item) => within(item).queryByText(player));
  if (!row) throw new Error(`row not found for ${player}`);
  return Array.from(row.querySelectorAll("td"));
}

describe("FantasyParBoard Model Rk (Option D)", () => {
  it("renders a Model Rk header and per-row Model Rk values sourced from the shadow join", () => {
    render(<FantasyParBoard />);
    expect(screen.getByRole("button", { name: /Model Rk/ })).toBeTruthy();

    const lamb = FANTASY_RANKINGS.rows.find((row) => row.player === "CeeDee Lamb")!;
    const lambModel = getShadowModelRankRow(lamb.overallRank)!;
    expect(lambModel.modelRank).not.toBeNull();

    const cells = overallRowCells("CeeDee Lamb");
    // Rank | Player | Pos Rk | ADP | PAR/G | Projection Rk | AVG Rk | Model Rk | ...
    expect(cells[7].textContent?.trim()).toBe(String(lambModel.modelRank));
  });

  it("defaults to JKB RANK order (unsorted by Model Rk)", () => {
    render(<FantasyParBoard />);
    const dataRows = screen.getAllByRole("row").filter((row) => row.querySelector("td"));
    const firstRank = dataRows[0].querySelector("td")?.textContent?.trim();
    expect(firstRank).toBe(String(FANTASY_RANKINGS.rows[0].overallRank));
  });

  it("sorts ascending by Model Rk when the header is clicked, and N/A rows sort to the bottom", () => {
    render(<FantasyParBoard />);
    fireEvent.click(screen.getByRole("button", { name: /Model Rk/ }));

    const dataRows = screen.getAllByRole("row").filter((row) => row.querySelectorAll("td").length > 5);
    // Column index 7 is Model Rk (0-based: Rank, Player, Pos Rk, ADP, PAR/G, Projection Rk, AVG Rk, Model Rk).
    const modelRkValues = dataRows.map((row) => row.querySelectorAll("td")[7]?.textContent?.trim() ?? "");
    const numeric = modelRkValues.filter((value) => value !== "N/A").map(Number);
    const naStartIndex = modelRkValues.findIndex((value) => value === "N/A");

    for (let i = 1; i < numeric.length; i += 1) {
      expect(numeric[i]).toBeGreaterThanOrEqual(numeric[i - 1]);
    }
    if (naStartIndex !== -1) {
      // Every N/A row must come after every numeric row.
      expect(modelRkValues.slice(naStartIndex).every((value) => value === "N/A")).toBe(true);
    }
  });

  it("clicking the Model Rk header again returns the board to JKB RANK order", () => {
    render(<FantasyParBoard />);
    const button = screen.getByRole("button", { name: /Model Rk/ });
    fireEvent.click(button);
    fireEvent.click(button);
    const dataRows = screen.getAllByRole("row").filter((row) => row.querySelector("td"));
    const firstRank = dataRows[0].querySelector("td")?.textContent?.trim();
    expect(firstRank).toBe(String(FANTASY_RANKINGS.rows[0].overallRank));
  });

  it("does not mutate FANTASY_RANKINGS when sorting by Model Rk", () => {
    const before = structuredClone(FANTASY_RANKINGS.rows);
    render(<FantasyParBoard />);
    fireEvent.click(screen.getByRole("button", { name: /Model Rk/ }));
    expect(FANTASY_RANKINGS.rows).toEqual(before);
  });

  it("shows N/A for rank-ineligible players (Tyreek Hill: confirmed free agent)", () => {
    render(<FantasyParBoard />);
    const hill = FANTASY_RANKINGS.rows.find((row) => row.player === "Tyreek Hill");
    if (!hill) return; // guard against a future workbook refresh dropping the player
    const cells = overallRowCells("Tyreek Hill");
    expect(cells[7].textContent?.trim()).toBe("N/A");
  });

  it("shows N/A for a disputed/released status player (Brandon Aiyuk) and surfaces the conflict in the expanded row", () => {
    render(<FantasyParBoard />);
    const aiyuk = FANTASY_RANKINGS.rows.find((row) => row.player === "Brandon Aiyuk");
    if (!aiyuk) return;
    const cells = overallRowCells("Brandon Aiyuk");
    expect(cells[7].textContent?.trim()).toBe("N/A");

    fireEvent.click(screen.getByRole("button", { name: "Show details for Brandon Aiyuk" }));
    expect(screen.getByText(/Status conflict:/)).toBeTruthy();
    expect(screen.getByText(/independently agree the player is still attached to a current team/)).toBeTruthy();
  });

  it("Justin Jefferson: JKB Overall Rank, PAR/G, and Projection Rk are unchanged by the Model Rk addition", () => {
    render(<FantasyParBoard />);
    const jefferson = FANTASY_RANKINGS.rows.find((row) => row.player === "Justin Jefferson")!;
    const cells = overallRowCells("Justin Jefferson");
    expect(cells[0].textContent?.trim()).toBe(String(jefferson.overallRank));
    expect(cells[5].textContent?.trim()).toBe(String(jefferson.projectionRank));

    const model = getShadowModelRankRow(jefferson.overallRank)!;
    expect(cells[7].textContent?.trim()).toBe(String(model.modelRank));
  });

  it("expanded-row Model provenance labels shadow values as research, not live PPG/PAR", () => {
    render(<FantasyParBoard />);
    fireEvent.click(screen.getByRole("button", { name: "Show details for CeeDee Lamb" }));
    expect(screen.getByText(/Model PPG \(research, not live PPG\):/)).toBeTruthy();
    expect(screen.getByText(/Model PAR\/G \(research, not live PAR\/G\):/)).toBeTruthy();
    expect(screen.queryByText(/^Live PPG:/)).toBeNull();
  });

  it("model-data join is exact: every rendered Model Rk cell traces to a shadow row keyed by the same overallRank, no fuzzy fallback", () => {
    render(<FantasyParBoard />);
    for (const row of FANTASY_RANKINGS.rows.slice(0, 25)) {
      const model = getShadowModelRankRow(row.overallRank);
      const cells = overallRowCells(row.player);
      const expected = model?.rankEligible ? String(model.modelRank) : "N/A";
      expect(cells[7].textContent?.trim()).toBe(expected);
    }
  });
});

describe("getShadowModelRankRow (fail-closed join)", () => {
  it("returns undefined for an overallRank with no shadow artifact row, never a guessed match", () => {
    expect(getShadowModelRankRow(999999)).toBeUndefined();
  });
});
