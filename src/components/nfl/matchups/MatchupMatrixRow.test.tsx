import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MatchupMatrixRow from "@/components/nfl/matchups/MatchupMatrixRow";
import { matrixCellStyle } from "@/lib/nfl/matchupMatrixRankTier";
import type { NflMatrixBoard, NflMatrixCell, NflMatrixMetricId } from "@/lib/nfl/matchupMatrixData";
import type { NflMatchup } from "@/lib/nfl/matchups";

/**
 * Each cell renders exactly one number: the rank in Rankings mode, or the raw
 * value in Values mode. Heatmap color is always derived from league rank,
 * never from the displayed number — so switching Rankings <-> Values changes
 * the text in every cell but never its background tier. See the 2026-09-22
 * QA correction that collapsed the rank+rating badge into a single value.
 */

const team = (abbr: string, teamName: string, slug: string) => ({
  abbr,
  teamName,
  slug,
  division: "AFC East",
  conference: "AFC",
});

const MATCHUP = {
  gameId: "2026_03_NE_SEA",
  slug: "new-england-patriots-at-seattle-seahawks",
  week: 3,
  season: 2026,
  kickoffUtc: "2026-09-24T00:20:00.000Z",
  stadium: "Lumen Field",
  spread: null,
  away: team("ne", "New England Patriots", "new-england-patriots"),
  home: team("sea", "Seattle Seahawks", "seattle-seahawks"),
} as unknown as NflMatchup;

function makeCell(overrides: Partial<NflMatrixCell>): NflMatrixCell {
  return {
    value: null,
    formattedValue: "N/A",
    rank: null,
    windowSensitive: true,
    ...overrides,
  };
}

function makeBoard(cells: Record<string, NflMatrixCell>): NflMatrixBoard {
  return {
    hasData: true,
    getCell(abbr: string, metricId: NflMatrixMetricId): NflMatrixCell {
      return cells[`${abbr}:${metricId}`] ?? makeCell({});
    },
  };
}

/** jsdom normalizes inline hex colors to `rgb(...)` when read back from style. */
function cssColorToRgb(css: string): string {
  const el = document.createElement("div");
  el.style.backgroundColor = css;
  document.body.appendChild(el);
  const resolved = el.style.backgroundColor;
  document.body.removeChild(el);
  return resolved;
}

describe("MatchupMatrixRow heatmap and display-mode behavior", () => {
  it("Values mode shows the raw value only, not the rank", () => {
    const board = makeBoard({
      "ne:ovr": makeCell({ value: 82.6, formattedValue: "82.6", rank: 4 }),
      "sea:ovr": makeCell({ value: 61.2, formattedValue: "61.2", rank: 20 }),
    });
    render(
      <MemoryRouter>
        <MatchupMatrixRow matchup={MATCHUP} board={board} displayMode="values" awayRecord={null} homeRecord={null} />
      </MemoryRouter>
    );
    expect(screen.getByText("82.6")).toBeTruthy();
    expect(screen.queryByText("4")).toBeNull();
  });

  it("Rankings mode shows the rank only, not the raw value", () => {
    const board = makeBoard({
      "ne:ovr": makeCell({ value: 82.6, formattedValue: "82.6", rank: 4 }),
      "sea:ovr": makeCell({ value: 61.2, formattedValue: "61.2", rank: 20 }),
    });
    render(
      <MemoryRouter>
        <MatchupMatrixRow matchup={MATCHUP} board={board} displayMode="rankings" awayRecord={null} homeRecord={null} />
      </MemoryRouter>
    );
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.queryByText("82.6")).toBeNull();
  });

  it("gives a non-OVR metric the identical heatmap tier in Rankings and Values mode, only the text changes", () => {
    const cell = makeCell({ value: 0.106, formattedValue: "+0.106", rank: 3 });
    const expectedStyle = matrixCellStyle(3);

    const boardRankings = makeBoard({ "ne:offEpa": cell, "sea:offEpa": makeCell({}) });
    const { unmount } = render(
      <MemoryRouter>
        <MatchupMatrixRow matchup={MATCHUP} board={boardRankings} displayMode="rankings" awayRecord={null} homeRecord={null} />
      </MemoryRouter>
    );
    const rankCell = screen.getByText("3").closest("td")!;
    expect(rankCell.style.backgroundColor).toBe(cssColorToRgb(expectedStyle.backgroundColor));
    unmount();

    const boardValues = makeBoard({ "ne:offEpa": cell, "sea:offEpa": makeCell({}) });
    render(
      <MemoryRouter>
        <MatchupMatrixRow matchup={MATCHUP} board={boardValues} displayMode="values" awayRecord={null} homeRecord={null} />
      </MemoryRouter>
    );
    const valueCell = screen.getByText("+0.106").closest("td")!;
    expect(valueCell.style.backgroundColor).toBe(cssColorToRgb(expectedStyle.backgroundColor));
    // Same underlying rank (3) drove the same color in both modes.
  });

  it("gives rank 1-4 the canonical JKB elite gold tier and rank 29-32 the canonical JKB poor tier", () => {
    expect(matrixCellStyle(2).backgroundColor).toBe("#e8d5a8");
    expect(matrixCellStyle(31).backgroundColor).toBe("#dc2626");
  });

  it("colors a non-OVR metric using the same canonical JKB tier its rank resolves to", () => {
    const board = makeBoard({
      "ne:offYpp": makeCell({ value: 5, formattedValue: "5.0", rank: 30 }),
    });
    render(
      <MemoryRouter>
        <MatchupMatrixRow matchup={MATCHUP} board={board} displayMode="rankings" awayRecord={null} homeRecord={null} />
      </MemoryRouter>
    );
    const cell = screen.getByText("30").closest("td")!;
    expect(cell.getAttribute("data-matrix-rank-tier")).toBe("poor");
    expect(cell.style.backgroundColor).toBe(cssColorToRgb(matrixCellStyle(30).backgroundColor));
  });

  it("gives a rankless cell the neutral unranked treatment rather than a fabricated tier", () => {
    const board = makeBoard({ "ne:offSr": makeCell({ value: null, formattedValue: "N/A", rank: null }) });
    render(
      <MemoryRouter>
        <MatchupMatrixRow matchup={MATCHUP} board={board} displayMode="rankings" awayRecord={null} homeRecord={null} />
      </MemoryRouter>
    );
    const headerCell = screen.getAllByText("Off SR")[0].closest("td")!;
    // The header row's leading cell is the team-identity cell (rowSpan-merged
    // across both rows); the value row has no such cell, so its column index
    // is one less than the header cell's.
    const valueCell = headerCell.parentElement!.nextElementSibling!.children[headerCell.cellIndex - 1];
    expect(within(valueCell).getByText("—")).toBeTruthy();
    expect((valueCell as HTMLElement).style.backgroundColor).toBe(cssColorToRgb(matrixCellStyle(null).backgroundColor));
  });
});

describe("MatchupMatrixRow team record", () => {
  it("renders the team record under the team identity when available", () => {
    render(
      <MemoryRouter>
        <MatchupMatrixRow matchup={MATCHUP} board={makeBoard({})} displayMode="rankings" awayRecord="0-2" homeRecord="2-0" />
      </MemoryRouter>
    );
    expect(screen.getByText("0-2")).toBeTruthy();
    expect(screen.getByText("2-0")).toBeTruthy();
  });

  it("renders an em dash when the record is unavailable", () => {
    render(
      <MemoryRouter>
        <MatchupMatrixRow matchup={MATCHUP} board={makeBoard({})} displayMode="rankings" awayRecord={null} homeRecord={null} />
      </MemoryRouter>
    );
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});

describe("MatchupMatrixRow header/value row structure", () => {
  it("aligns pass block with opposing pass rush and run block with opposing run stop", () => {
    const board = makeBoard({
      "ne:passBlock": makeCell({ formattedValue: "61%", rank: 4 }),
      "ne:runBlock": makeCell({ formattedValue: "71%", rank: 5 }),
      "ne:passRush": makeCell({ formattedValue: "37%", rank: 8 }),
      "ne:runStop": makeCell({ formattedValue: "29%", rank: 16 }),
      "sea:passBlock": makeCell({ formattedValue: "63%", rank: 20 }),
      "sea:runBlock": makeCell({ formattedValue: "73%", rank: 15 }),
      "sea:passRush": makeCell({ formattedValue: "39%", rank: 13 }),
      "sea:runStop": makeCell({ formattedValue: "30%", rank: 12 }),
    });
    render(<MemoryRouter><MatchupMatrixRow matchup={MATCHUP} board={board} displayMode="values" awayRecord={null} homeRecord={null} /></MemoryRouter>);
    const rows = screen.getByRole("region", { name: /matchup matrix/i }).querySelectorAll("tbody > tr");
    const values = (row: Element) => Array.from(row.querySelectorAll("td")).map((cell) => cell.textContent);
    const away = values(rows[1]);
    const home = values(rows[3]);
    expect([away[4], home[4], away[5], home[5]]).toEqual(["61%", "39%", "71%", "30%"]);
    expect([away[10], home[10], away[11], home[11]]).toEqual(["37%", "63%", "29%", "73%"]);
  });

  it("renders the away stat header row in offense-then-defense order", () => {
    render(
      <MemoryRouter>
        <MatchupMatrixRow matchup={MATCHUP} board={makeBoard({})} displayMode="rankings" awayRecord={null} homeRecord={null} />
      </MemoryRouter>
    );
    const table = screen.getByRole("region", { name: /matchup matrix/i }).querySelector("table")!;
    const awayHeaderRow = table.querySelectorAll("tbody > tr")[0];
    const labels = Array.from(awayHeaderRow.querySelectorAll("td")).map((td) => td.textContent);
    expect(labels).toEqual([
      expect.stringContaining("New England Patriots"),
      "OVR",
      "Off EPA",
      "Off YPP",
      "Off SR",
      "Pass Block",
      "Run Block",
      "",
      "Def EPA",
      "Def YPP",
      "Def SR",
      "Pass Rush",
      "Run Stop",
    ]);
  });

  it("renders the home stat header row in defense-then-offense order", () => {
    render(
      <MemoryRouter>
        <MatchupMatrixRow matchup={MATCHUP} board={makeBoard({})} displayMode="rankings" awayRecord={null} homeRecord={null} />
      </MemoryRouter>
    );
    const table = screen.getByRole("region", { name: /matchup matrix/i }).querySelector("table")!;
    const homeHeaderRow = table.querySelectorAll("tbody > tr")[2];
    const labels = Array.from(homeHeaderRow.querySelectorAll("td")).map((td) => td.textContent);
    expect(labels).toEqual([
      expect.stringContaining("Seattle Seahawks"),
      "OVR",
      "Def EPA",
      "Def YPP",
      "Def SR",
      "Pass Rush",
      "Run Stop",
      "",
      "Off EPA",
      "Off YPP",
      "Off SR",
      "Pass Block",
      "Run Block",
    ]);
  });

  it("value cells no longer render an embedded stat label", () => {
    const board = makeBoard({
      "ne:ovr": makeCell({ value: 82.6, formattedValue: "82.6", rank: 4 }),
    });
    render(
      <MemoryRouter>
        <MatchupMatrixRow matchup={MATCHUP} board={board} displayMode="values" awayRecord={null} homeRecord={null} />
      </MemoryRouter>
    );
    const valueCell = screen.getByText("82.6").closest("td")!;
    expect(valueCell.textContent).toBe("82.6");
    expect(valueCell.querySelector("[class*='uppercase']")).toBeNull();
  });

  it("keeps a strong center divider after both offensive trench columns in both rows", () => {
    render(
      <MemoryRouter>
        <MatchupMatrixRow matchup={MATCHUP} board={makeBoard({})} displayMode="rankings" awayRecord={null} homeRecord={null} />
      </MemoryRouter>
    );
    const table = screen.getByRole("region", { name: /matchup matrix/i }).querySelector("table")!;
    const rows = table.querySelectorAll("tbody > tr");
    // Header rows: identity(0) + OVR,EPA,YPP,SR,Pass Block,Run Block(1-6).
    expect(rows[0].querySelectorAll("td")[7].getAttribute("aria-hidden")).toBe("true");
    expect(rows[2].querySelectorAll("td")[7].getAttribute("aria-hidden")).toBe("true");
    // Value rows omit the identity cell.
    expect(rows[1].querySelectorAll("td")[6].getAttribute("aria-hidden")).toBe("true");
    expect(rows[3].querySelectorAll("td")[6].getAttribute("aria-hidden")).toBe("true");
  });
});

describe("MatchupMatrixRow fixed grid and team tint", () => {
  const renderRow = () =>
    render(
      <MemoryRouter>
        <MatchupMatrixRow matchup={MATCHUP} board={makeBoard({})} displayMode="rankings" awayRecord={null} homeRecord={null} />
      </MemoryRouter>
    );

  it("uses a fixed table layout with identity + 11 metric + 1 divider columns", () => {
    const { container } = renderRow();
    const table = container.querySelector("table")!;
    expect(table.className).toContain("table-fixed");
    const cols = Array.from(table.querySelectorAll("colgroup > col")).map((c) => c.getAttribute("data-matrix-col"));
    expect(cols.filter((c) => c === "identity")).toHaveLength(1);
    expect(cols.filter((c) => c === "metric")).toHaveLength(11);
    expect(cols.indexOf("divider")).toBe(7);
    // Metric columns carry no explicit width, so they share the remainder equally.
    table.querySelectorAll('col[data-matrix-col="metric"]').forEach((c) => expect((c as HTMLElement).style.width).toBe(""));
  });

  it("keeps rowSpan=2 identity cells and tints only them with the team colour", () => {
    const { container } = renderRow();
    const teamCells = container.querySelectorAll<HTMLElement>("[data-matrix-team-cell]");
    expect(teamCells).toHaveLength(2);
    teamCells.forEach((cell) => {
      expect(cell.getAttribute("rowspan")).toBe("2");
      expect(cell.style.backgroundColor).not.toBe("");
      expect(cell.className).toContain("sticky");
    });
    container.querySelectorAll<HTMLElement>("[data-matrix-header-cell], [data-matrix-rank-tier], [data-matrix-divider]").forEach((cell) => {
      expect(cell.hasAttribute("data-matrix-team-cell")).toBe(false);
    });
    const headerBg = container.querySelector<HTMLElement>("[data-matrix-header-cell]")!.style.backgroundColor;
    expect(headerBg).toBe("");
  });

  it("wraps each game in a strong bordered container", () => {
    const { container } = renderRow();
    const game = container.querySelector<HTMLElement>("[data-matrix-game]")!;
    expect(game.className).toContain("border-2");
  });
});
