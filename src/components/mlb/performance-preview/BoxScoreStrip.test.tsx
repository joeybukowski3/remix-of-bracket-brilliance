import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BoxScoreStrip, { type BoxScoreAggregate } from "./BoxScoreStrip";

function aggregate(overrides: Partial<BoxScoreAggregate> = {}): BoxScoreAggregate {
  return {
    atBats: 40, hits: 12, avg: 0.3, homeRuns: 3, doubles: 2, totalBases: 24,
    rbi: 8, runs: 6, baseOnBalls: 4, strikeOuts: 10, sampleSize: 40,
    ...overrides,
  };
}

describe("BoxScoreStrip", () => {
  it("renders all 10 stat labels", () => {
    render(<BoxScoreStrip aggregate={aggregate()} />);
    for (const label of ["AB", "H", "AVG", "HR", "2B", "TB", "RBI", "R", "BB", "K"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("uses a wrapping grid (5 cols mobile, 10 cols sm+) instead of a horizontally-scrolling row", () => {
    const { container } = render(<BoxScoreStrip aggregate={aggregate()} />);
    const grid = container.querySelector(".grid") as HTMLElement;
    expect(grid.className).toMatch(/grid-cols-5/);
    expect(grid.className).toMatch(/sm:grid-cols-10/);
    // No overflow-x-auto wrapper and no forced min-width -- nothing here relies on horizontal scroll.
    expect(container.querySelector(".overflow-x-auto")).toBeNull();
    expect(grid.className).not.toMatch(/min-w-/);
  });

  it("renders missing fields (e.g. doubles never tracked) as a dash without breaking layout", () => {
    render(<BoxScoreStrip aggregate={aggregate({ doubles: null })} />);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
