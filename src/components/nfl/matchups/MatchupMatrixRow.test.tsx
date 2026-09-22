import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MatchupMatrixRow from "@/components/nfl/matchups/MatchupMatrixRow";
import { rankBadgeClass } from "@/lib/nfl/rankTier";
import type { NflMatrixBoard, NflMatrixCell, NflMatrixMetricId } from "@/lib/nfl/matchupMatrixData";
import type { NflMatchup } from "@/lib/nfl/matchups";

/**
 * Heatmap color must always be derived from league rank, never from the
 * displayed +/- rating — so switching Rankings <-> Ratings changes the text
 * in every cell but never its color, and OVR's Ratings-mode text is its own
 * native rating rather than a league-relative delta. See the 2026-09-22 QA
 * correction that removed the old rating-threshold heatmap.
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
    rating: null,
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
  it("OVR shows the native rating in Ratings mode, not a league-relative delta", () => {
    const board = makeBoard({
      "ne:ovr": makeCell({ value: 82.6, formattedValue: "82.6", rank: 4, rating: null }),
      "sea:ovr": makeCell({ value: 61.2, formattedValue: "61.2", rank: 20, rating: null }),
    });
    render(
      <MemoryRouter>
        <MatchupMatrixRow matchup={MATCHUP} board={board} displayMode="ratings" awayRecord={null} homeRecord={null} />
      </MemoryRouter>
    );
    // Native rating text appears twice (the raw value line and the badge,
    // which for OVR in Ratings mode both read the same native number), never
    // "+32.6" (the old OVR-50 behavior).
    expect(screen.getAllByText("82.6").length).toBe(2);
    expect(screen.queryByText("+32.6")).toBeNull();
    expect(screen.queryByText(/^\+/)).toBeNull();
  });

  it("OVR shows the rank in Rankings mode", () => {
    const board = makeBoard({
      "ne:ovr": makeCell({ value: 82.6, formattedValue: "82.6", rank: 4, rating: null }),
      "sea:ovr": makeCell({ value: 61.2, formattedValue: "61.2", rank: 20, rating: null }),
    });
    render(
      <MemoryRouter>
        <MatchupMatrixRow matchup={MATCHUP} board={board} displayMode="rankings" awayRecord={null} homeRecord={null} />
      </MemoryRouter>
    );
    expect(screen.getByText("4")).toBeTruthy();
  });

  it("gives a non-OVR metric the identical heatmap tier in Rankings and Ratings mode, only the text changes", () => {
    const cell = makeCell({ value: 0.106, formattedValue: "+0.106", rank: 3, rating: 14.7 });
    const expectedClass = rankBadgeClass(3);

    const boardRankings = makeBoard({ "ne:offEpa": cell, "sea:offEpa": makeCell({}) });
    const { unmount } = render(
      <MemoryRouter>
        <MatchupMatrixRow matchup={MATCHUP} board={boardRankings} displayMode="rankings" awayRecord={null} homeRecord={null} />
      </MemoryRouter>
    );
    const rankBadge = screen.getByText("3");
    expect(rankBadge.className).toContain(expectedClass);
    unmount();

    const boardRatings = makeBoard({ "ne:offEpa": cell, "sea:offEpa": makeCell({}) });
    render(
      <MemoryRouter>
        <MatchupMatrixRow matchup={MATCHUP} board={boardRatings} displayMode="ratings" awayRecord={null} homeRecord={null} />
      </MemoryRouter>
    );
    const ratingBadge = screen.getByText("+14.7");
    expect(ratingBadge.className).toContain(expectedClass);
    // Same underlying rank (3) drove the same color class in both modes.
  });

  it("colors a poor-rank cell in the worst tier regardless of the magnitude of its +/- rating", () => {
    // A large-magnitude rating (+40) paired with a bad rank (30) must still
    // color by the rank, not the rating's own size.
    const cell = makeCell({ value: 5, formattedValue: "5.0", rank: 30, rating: 40 });
    const board = makeBoard({ "ne:offYpp": cell, "sea:offYpp": makeCell({}) });
    render(
      <MemoryRouter>
        <MatchupMatrixRow matchup={MATCHUP} board={board} displayMode="ratings" awayRecord={null} homeRecord={null} />
      </MemoryRouter>
    );
    const badge = screen.getByText("+40.0");
    expect(badge.className).toContain(rankBadgeClass(30));
    expect(badge.className).not.toContain(rankBadgeClass(1));
  });

  it("gives a rankless cell the neutral unranked treatment rather than a fabricated tier", () => {
    const board = makeBoard({ "ne:offSr": makeCell({ value: null, formattedValue: "N/A", rank: null, rating: null }) });
    render(
      <MemoryRouter>
        <MatchupMatrixRow matchup={MATCHUP} board={board} displayMode="rankings" awayRecord={null} homeRecord={null} />
      </MemoryRouter>
    );
    const dash = within(screen.getAllByText("N/A")[0].closest("td")!).getByText("—");
    expect(dash.className).toContain(rankBadgeClass(null));
  });
});
