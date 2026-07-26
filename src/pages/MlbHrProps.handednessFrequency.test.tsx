/**
 * Focused tests for the dual-handedness season comparison table
 * shown in expanded Batter View detail.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  HandednessSplitsTable,
  buildHandednessPeerStats,
  handednessMetricCellStyle,
  type HandednessSplits,
} from "@/pages/MlbHrProps";

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

function makePeerSlate(): Array<{ handednessSplits: HandednessSplits }> {
  // Build enough same-hand peers for mean/std (n >= 3) with spread.
  const leftAvgs = [0.22, 0.25, 0.267, 0.3, 0.33];
  return leftAvgs.map((avg, i) => ({
    handednessSplits: {
      vsLeft: {
        ...fullSplits.vsLeft,
        battingAverage: avg,
        ops: avg + 0.5,
        atBats: 100 + i * 10,
        plateAppearances: 110 + i * 10,
      },
      vsRight: {
        ...fullSplits.vsRight,
        battingAverage: 0.2 + i * 0.02,
        atBats: 80 + i * 5,
        plateAppearances: 90 + i * 5,
        status: "ok" as const,
        homeRuns: 1,
        abPerHr: 40,
      },
    },
  }));
}

describe("HandednessSplitsTable", () => {
  it("renders both LHP and RHP season rows with core metrics and no Sample column", () => {
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
    expect(screen.queryByText("Sample")).not.toBeInTheDocument();
    expect(screen.queryByText("medium")).not.toBeInTheDocument();
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
    const renderedRows = screen.getByTestId("handedness-splits-table").querySelectorAll("tbody tr");
    expect(renderedRows[0]).toHaveAttribute("data-testid", "handedness-row-vsRight");
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
  });

  it("applies comparative tint when peer stats and sample allow", () => {
    const peerStats = buildHandednessPeerStats(makePeerSlate());
    // Extreme high AVG vs left peers should tint when AB >= 50
    const elite: HandednessSplits = {
      ...fullSplits,
      vsLeft: {
        ...fullSplits.vsLeft,
        battingAverage: 0.45,
        atBats: 120,
        plateAppearances: 135,
      },
    };
    render(
      <HandednessSplitsTable
        row={{
          pitcherHand: "L",
          splitSide: "vsLeft",
          handednessSplits: elite,
        }}
        peerStats={peerStats}
      />,
    );
    expect(screen.getAllByTestId("handedness-metric-tinted").length).toBeGreaterThan(0);
  });
});

describe("handednessMetricCellStyle sample protection", () => {
  const peer = { mean: 0.25, std: 0.03, n: 20 };

  it("returns no style under 20 opportunities", () => {
    expect(handednessMetricCellStyle(0.35, peer, { higherBetter: true, opportunities: 15 })).toBeUndefined();
  });

  it("returns no style for null values", () => {
    expect(handednessMetricCellStyle(null, peer, { higherBetter: true, opportunities: 100 })).toBeUndefined();
  });

  it("returns favorable green for strong high values with large sample", () => {
    const style = handednessMetricCellStyle(0.36, peer, { higherBetter: true, opportunities: 100 });
    expect(style?.backgroundColor).toBeTruthy();
  });

  it("treats lower K% as favorable when higherBetter is false", () => {
    const kPeer = { mean: 0.25, std: 0.04, n: 20 };
    const lowK = handednessMetricCellStyle(0.12, kPeer, { higherBetter: false, opportunities: 100 });
    const highK = handednessMetricCellStyle(0.4, kPeer, { higherBetter: false, opportunities: 100 });
    expect(lowK?.backgroundColor).toBeTruthy();
    expect(highK?.backgroundColor).toBeTruthy();
    // Favorable (low K) uses green; weaker (high K) uses blue
    expect(String(lowK?.backgroundColor)).toContain("22,163,74");
    expect(String(highK?.backgroundColor)).toContain("37,99,235");
  });
});
