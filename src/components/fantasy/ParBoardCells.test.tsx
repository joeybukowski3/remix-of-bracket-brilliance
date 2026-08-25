import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MatchupOpponentCell } from "@/components/fantasy/ParBoardCells";

function renderCell(opponent: string) {
  render(<table><tbody><tr><MatchupOpponentCell opponent={opponent} position="QB" /></tr></tbody></table>);
  return screen.getByRole("cell");
}

describe("ROS playoff matchup cells", () => {
  it("colors an easy matchup favorably from the fantasy player's perspective", () => {
    const cell = renderCell("DAL");
    expect(cell).toHaveAttribute("data-heat-tone", "gold");
    expect(cell).toHaveTextContent("DAL");
    expect(cell.getAttribute("title")).toMatch(/allowed 23\.9 QB pts\/gm.*1 of 32/i);
  });

  it("colors a difficult matchup unfavorably and preserves away notation", () => {
    const cell = renderCell("@MIN");
    expect(cell).toHaveAttribute("data-heat-tone", "strong-red");
    expect(cell).toHaveTextContent("@MIN");
    expect(cell.getAttribute("title")).toMatch(/allowed 12\.1 QB pts\/gm.*32 of 32/i);
  });
});
