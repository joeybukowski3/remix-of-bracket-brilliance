import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HrPredictionRecord } from "@/types/mlbHrModelPerformance";
import HrPerformanceTable from "./HrPerformanceTable";

// jsdom does not evaluate CSS media queries, so both the "sm:hidden" mobile
// accordion and the "hidden sm:block" desktop table are present in the DOM
// simultaneously during tests -- helpers below scope queries to one or the
// other rather than relying on document-wide uniqueness.
function desktopTable(container: HTMLElement) {
  return container.querySelector("table") as HTMLTableElement;
}
function mobileList(container: HTMLElement) {
  return container.querySelector("ul") as HTMLUListElement;
}

function record(overrides: Partial<HrPredictionRecord> & { result?: Partial<HrPredictionRecord["result"]> } = {}, index = 0): HrPredictionRecord {
  return {
    date: `2026-08-${String((index % 27) + 1).padStart(2, "0")}`,
    generatedAt: "2026-08-01T00:00:00Z",
    modelVersion: "mlb-hr-quality-v1.1",
    playerId: 1000 + index,
    playerName: `Player ${index}`,
    teamId: 1,
    team: "NYY",
    opponentId: 2,
    opponent: "BOS",
    opposingPitcherId: null,
    opposingPitcherName: null,
    lineupStatus: "confirmed",
    battingOrder: 3,
    gameId: 500 + index,
    hrQualityScore: 65,
    hrRank: 5,
    hrOddsYes: "+300",
    hrOddsBook: "book",
    marketImpliedProbability: 0.2,
    confidenceLevel: "medium",
    ...overrides,
    result: {
      status: "miss",
      hrCount: 0,
      plateAppearances: 4,
      gameFinalStatus: "Final",
      gradedAt: "2026-08-02T00:00:00Z",
      resolutionReason: null,
      attemptCount: 1,
      battingLine: { atBats: 4, hits: 1, doubles: 0, totalBases: 1, rbi: 0, runs: 0, baseOnBalls: 0, strikeOuts: 1 },
      ...overrides.result,
    },
  };
}

describe("HrPerformanceTable — desktop table", () => {
  it("renders exactly one row per record", () => {
    const records = [record({}, 0), record({}, 1), record({}, 2)];
    const { container } = render(<HrPerformanceTable records={records} />);
    const rows = within(desktopTable(container)).getAllByText(/^Player \d$/);
    expect(rows).toHaveLength(3);
  });

  it("defaults to the latest 20 records and reports the total count", () => {
    const records = Array.from({ length: 45 }, (_, i) => record({}, i));
    const { container } = render(<HrPerformanceTable records={records} />);
    expect(screen.getByText("Showing 20 of 45 graded plays")).toBeInTheDocument();
    expect(within(desktopTable(container)).getAllByText(/^Player \d+$/)).toHaveLength(20);
  });

  it("expands the visible count when Show More is clicked", () => {
    const records = Array.from({ length: 45 }, (_, i) => record({}, i));
    render(<HrPerformanceTable records={records} />);
    fireEvent.click(screen.getByText("Show More"));
    expect(screen.getByText("Showing 40 of 45 graded plays")).toBeInTheDocument();
  });

  it("filters to only Hit results", () => {
    const records = [
      record({ result: { status: "hit", hrCount: 1 } }, 0),
      record({ result: { status: "miss", hrCount: 0 } }, 1),
    ];
    const { container } = render(<HrPerformanceTable records={records} />);
    fireEvent.click(screen.getByRole("button", { name: "Hit" }));
    expect(within(desktopTable(container)).getByText("Player 0")).toBeInTheDocument();
    expect(within(desktopTable(container)).queryByText("Player 1")).not.toBeInTheDocument();
  });

  it("renders missing batting-line stats as an em dash instead of blank or zero", () => {
    const records = [record({ result: { status: "pending", battingLine: undefined } }, 0)];
    render(<HrPerformanceTable records={records} />);
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("does not break rendering for an unsupported team abbreviation", () => {
    const records = [record({ team: "ZZZ" }, 0)];
    expect(() => render(<HrPerformanceTable records={records} />)).not.toThrow();
    expect(screen.getAllByText("Player 0").length).toBeGreaterThan(0);
  });

  it("maps each result status to the correct badge text", () => {
    const records = [
      record({ result: { status: "hit", hrCount: 1 } }, 0),
      record({ result: { status: "miss" } }, 1),
      record({ result: { status: "did_not_play", battingLine: null } }, 2),
      record({ result: { status: "pending", battingLine: undefined } }, 3),
      record({ result: { status: "unresolved_retryable" } }, 4),
    ];
    const { container } = render(<HrPerformanceTable records={records} />);
    const table = desktopTable(container);
    expect(within(table).getByText("HIT")).toBeInTheDocument();
    expect(within(table).getByText("MISS")).toBeInTheDocument();
    expect(within(table).getByText("DNP")).toBeInTheDocument();
    expect(within(table).getByText("PENDING")).toBeInTheDocument();
    expect(within(table).getByText("UNRESOLVED")).toBeInTheDocument();
  });

  it("includes a 2B (doubles) column", () => {
    const records = [record({}, 0)];
    const { container } = render(<HrPerformanceTable records={records} />);
    expect(within(desktopTable(container)).getByText("2B")).toBeInTheDocument();
  });
});

describe("HrPerformanceTable — mobile accordion rows", () => {
  it("renders one compact row per player, not a table", () => {
    const records = [record({}, 0), record({}, 1), record({}, 2)];
    const { container } = render(<HrPerformanceTable records={records} />);
    const list = mobileList(container);
    expect(list).toBeTruthy();
    expect(within(list).getAllByRole("button")).toHaveLength(3);
  });

  it("does not expand any row by default", () => {
    const records = [record({}, 0), record({}, 1)];
    const { container } = render(<HrPerformanceTable records={records} />);
    const buttons = within(mobileList(container)).getAllByRole("button");
    for (const button of buttons) {
      expect(button).toHaveAttribute("aria-expanded", "false");
    }
  });

  it("expands a row to reveal detail stats when tapped, and collapses others", () => {
    const records = [record({ playerName: "Alpha" }, 0), record({ playerName: "Beta" }, 1)];
    const { container } = render(<HrPerformanceTable records={records} />);
    const list = mobileList(container);
    const alphaButton = within(list).getByText("Alpha").closest("button") as HTMLButtonElement;
    fireEvent.click(alphaButton);
    expect(alphaButton).toHaveAttribute("aria-expanded", "true");
    expect(within(list).getByText("Opponent")).toBeInTheDocument();
    expect(within(list).getByText("2B")).toBeInTheDocument();
  });

  it("shows the player's team logo in the mobile row", () => {
    const records = [record({ team: "BOS" }, 0)];
    const { container } = render(<HrPerformanceTable records={records} />);
    expect(within(mobileList(container)).getByAltText("BOS logo")).toBeInTheDocument();
  });
});
