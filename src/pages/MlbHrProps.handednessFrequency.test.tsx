/**
 * Focused tests for the dual-handedness season comparison table
 * shown in expanded Batter View detail.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HandednessSplitsTable, type HandednessSplits } from "@/pages/MlbHrProps";

const fullSplits: HandednessSplits = {
  vsLeft: {
    plateAppearances: 135,
    atBats: 120,
    hits: 32,
    homeRuns: 4,
    walks: 12,
    strikeouts: 30,
    battingAverage: 0.267,
    onBasePercentage: 0.333,
    sluggingPercentage: 0.5,
    ops: 0.833,
    hrRate: 4 / 135,
    abPerHr: 30.0,
    strikeoutRate: 30 / 135,
    walkRate: 12 / 135,
    status: "ok",
    sampleSizeTier: "medium",
  },
  vsRight: {
    plateAppearances: 50,
    atBats: 45,
    hits: 10,
    homeRuns: 0,
    walks: 4,
    strikeouts: 12,
    battingAverage: 0.222,
    onBasePercentage: 0.28,
    sluggingPercentage: 0.311,
    ops: 0.591,
    hrRate: 0,
    abPerHr: null,
    strikeoutRate: 12 / 50,
    walkRate: 4 / 50,
    status: "zero_hr",
    sampleSizeTier: "low",
  },
};

describe("HandednessSplitsTable", () => {
  it("renders both LHP and RHP season rows with core metrics", () => {
    render(
      <HandednessSplitsTable
        row={{
          pitcherHand: "L",
          splitSide: "vsLeft",
          handednessSplits: fullSplits,
        }}
      />,
    );

    expect(screen.getByTestId("handedness-splits-table")).toBeInTheDocument();
    expect(screen.getByText("Season vs LHP / RHP")).toBeInTheDocument();
    expect(screen.getByText("vs LHP")).toBeInTheDocument();
    expect(screen.getByText("vs RHP")).toBeInTheDocument();
    expect(screen.getByText("30.0")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("45")).toBeInTheDocument();
    // zero-HR side shows em dash for AB/HR (multiple dashes may exist)
    const rightRow = screen.getByTestId("handedness-row-vsRight");
    expect(rightRow).toHaveAttribute("data-facing", "false");
  });

  it("marks the facing hand row as Today", () => {
    render(
      <HandednessSplitsTable
        row={{
          pitcherHand: "R",
          splitSide: "vsRight",
          handednessSplits: fullSplits,
        }}
      />,
    );

    expect(screen.getByTestId("handedness-row-vsRight")).toHaveAttribute("data-facing", "true");
    expect(screen.getByTestId("handedness-row-vsLeft")).toHaveAttribute("data-facing", "false");
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("shows split unavailable when dual payload is missing", () => {
    render(
      <HandednessSplitsTable
        row={{
          pitcherHand: "L",
          splitSide: "vsLeft",
          handednessSplits: null,
        }}
      />,
    );

    expect(screen.getAllByText("Split unavailable").length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByText(/Dual-hand splits not on this payload yet/i),
    ).toBeInTheDocument();
  });

  it("shows unavailable for a missing side only", () => {
    render(
      <HandednessSplitsTable
        row={{
          pitcherHand: "L",
          splitSide: "vsLeft",
          handednessSplits: {
            vsLeft: fullSplits.vsLeft,
            vsRight: {
              ...fullSplits.vsRight,
              atBats: null,
              homeRuns: null,
              status: "split_unavailable",
            },
          },
        }}
      />,
    );

    const rightRow = screen.getByTestId("handedness-row-vsRight");
    expect(rightRow).toHaveTextContent("Split unavailable");
    expect(screen.getByTestId("handedness-row-vsLeft")).toHaveTextContent("120");
  });
});
