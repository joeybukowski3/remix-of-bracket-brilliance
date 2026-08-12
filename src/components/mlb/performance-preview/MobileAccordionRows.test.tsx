import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PerformanceRow } from "./PerformanceRow";
import MobileAccordionRows from "./MobileAccordionRows";

function row(overrides: Partial<PerformanceRow> = {}, index = 0): PerformanceRow {
  return {
    key: `row-${index}`,
    date: "2026-08-10",
    player: `Player ${index}`,
    team: "NYY",
    resultKind: "HIT",
    compactValue: "70.0",
    details: [{ label: "Opponent", value: "BOS" }, { label: "AB", value: "4" }],
    ...overrides,
  };
}

describe("MobileAccordionRows", () => {
  it("renders exactly one row per item, no table element", () => {
    const { container } = render(<MobileAccordionRows rows={[row({}, 0), row({}, 1), row({}, 2)]} />);
    expect(container.querySelector("table")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("does not expand any row by default (nothing expanded on initial render)", () => {
    render(<MobileAccordionRows rows={[row({}, 0), row({}, 1)]} />);
    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAttribute("aria-expanded", "false");
    }
    expect(screen.queryByText("Opponent")).not.toBeInTheDocument();
  });

  it("expands only the clicked row's details, collapsing it again on second click", () => {
    render(<MobileAccordionRows rows={[row({ player: "Alpha" }, 0), row({ player: "Beta" }, 1)]} />);
    const alphaButton = screen.getByText("Alpha").closest("button") as HTMLButtonElement;
    fireEvent.click(alphaButton);
    expect(alphaButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Opponent")).toBeInTheDocument();
    expect(screen.getByText("BOS")).toBeInTheDocument();

    fireEvent.click(alphaButton);
    expect(alphaButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Opponent")).not.toBeInTheDocument();
  });

  it("shows a clean empty state instead of an empty table when there are no rows", () => {
    render(<MobileAccordionRows rows={[]} />);
    expect(screen.getByText(/No graded plays match this filter/)).toBeInTheDocument();
  });

  it("shows the date, player, team logo, compact value, and result badge in the collapsed row", () => {
    render(<MobileAccordionRows rows={[row({ date: "2026-08-05", player: "Slugger", team: "BOS", compactValue: "88.5", resultKind: "MISS" }, 0)]} />);
    expect(screen.getByText("08-05")).toBeInTheDocument();
    expect(screen.getByText("Slugger")).toBeInTheDocument();
    expect(screen.getByAltText("BOS logo")).toBeInTheDocument();
    expect(screen.getByText("88.5")).toBeInTheDocument();
    expect(screen.getByText("MISS")).toBeInTheDocument();
  });
});
