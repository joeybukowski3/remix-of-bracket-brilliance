import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MatchupMatrixRow from "@/components/nfl/matchups/MatchupMatrixRow";
import { matrixCellClass } from "@/lib/nfl/matchupMatrixRankTier";
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
    const expectedClass = matrixCellClass(3);

    const boardRankings = makeBoard({ "ne:offEpa": cell, "sea:offEpa": makeCell({}) });
    const { unmount } = render(
      <MemoryRouter>
        <MatchupMatrixRow matchup={MATCHUP} board={boardRankings} displayMode="rankings" awayRecord={null} homeRecord={null} />
      </MemoryRouter>
    );
    const rankCell = screen.getByText("3").closest("td")!;
    expect(rankCell.className).toContain(expectedClass);
    unmount();

    const boardValues = makeBoard({ "ne:offEpa": cell, "sea:offEpa": makeCell({}) });
    render(
      <MemoryRouter>
        <MatchupMatrixRow matchup={MATCHUP} board={boardValues} displayMode="values" awayRecord={null} homeRecord={null} />
      </MemoryRouter>
    );
    const valueCell = screen.getByText("+0.106").closest("td")!;
    expect(valueCell.className).toContain(expectedClass);
    // Same underlying rank (3) drove the same color class in both modes.
  });

  it("gives rank 1-4 the elite gold tier and rank 29-32 the strongest red tier", () => {
    expect(matrixCellClass(2)).toBe("bg-amber-500");
    expect(matrixCellClass(31)).toBe("bg-red-700");
  });

  it("never uses green anywhere in the matrix tier palette", () => {
    const board = makeBoard({
      "ne:offYpp": makeCell({ value: 5, formattedValue: "5.0", rank: 30 }),
    });
    render(
      <MemoryRouter>
        <MatchupMatrixRow matchup={MATCHUP} board={board} displayMode="rankings" awayRecord={null} homeRecord={null} />
      </MemoryRouter>
    );
    const cell = screen.getByText("30").closest("td")!;
    expect(cell.className).not.toMatch(/\bbg-(emerald|green|teal)-/);
  });

  it("gives a rankless cell the neutral unranked treatment rather than a fabricated tier", () => {
    const board = makeBoard({ "ne:offSr": makeCell({ value: null, formattedValue: "N/A", rank: null }) });
    render(
      <MemoryRouter>
        <MatchupMatrixRow matchup={MATCHUP} board={board} displayMode="rankings" awayRecord={null} homeRecord={null} />
      </MemoryRouter>
    );
    const cell = screen.getAllByText("Off SR")[0].closest("td")!;
    expect(within(cell).getByText("—")).toBeTruthy();
    expect(cell.className).toContain(matrixCellClass(null));
  });
});
