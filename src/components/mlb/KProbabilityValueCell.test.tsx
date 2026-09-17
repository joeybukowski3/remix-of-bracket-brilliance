import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { KProbabilityShadowRow } from "@/hooks/useMlbKProbabilityShadow";
import { KProbabilityDetailBlock, KProbabilityValueBadge } from "./KProbabilityValueCell";

function computedRow(overrides: Partial<KProbabilityShadowRow> = {}): KProbabilityShadowRow {
  return {
    key: "500123|1001",
    slateDate: "2026-09-11",
    pitcherId: 1001,
    gameId: 500123,
    pitcher: "Test Pitcher",
    team: "NYY",
    opponent: "BOS",
    line: 5.5,
    overOdds: "-120",
    underOdds: "-110",
    book: "draftkings",
    projectedKs: 6.1,
    projectedKsSource: "v4",
    modelVersion: "mlb-k-probability-shadow-v1",
    simulationCount: 8000,
    market: { overImpliedProbability: 0.5455, underImpliedProbability: 0.5238, overNoVigProbability: 0.51, underNoVigProbability: 0.49, overround: 1.0692, twoSided: true },
    model: { overProbability: 0.6, underProbability: 0.4, meanSimulatedKs: 6.0, medianSimulatedKs: 6, stdevSimulatedKs: 2.5 },
    edge: { overProbabilityEdge: 0.09, underProbabilityEdge: null, lean: "OVER", bestProbabilityEdge: 0.09, bestProbabilitySide: "OVER" },
    confidence: { grade: "HIGH", score: 0.8, workloadTrust: 0.8, kRateTrust: 0.8 },
    diagnostics: { ipSd: 1.2, kPerIpSd: 0.2, ipSpread: 0.1, kPerIpSpread: 0.1, bfPerIP: 4.3, usedV4Diagnostics: true },
    status: "computed",
    statusReason: null,
    ...overrides,
  };
}

describe("KProbabilityValueBadge", () => {
  it("renders a dash when there is no probability row", () => {
    render(<KProbabilityValueBadge probabilityRow={null} />);
    expect(screen.getByText("--")).toBeInTheDocument();
  });

  it("renders Neutral when lean is NEUTRAL", () => {
    render(<KProbabilityValueBadge probabilityRow={computedRow({ edge: { overProbabilityEdge: -0.01, underProbabilityEdge: -0.02, lean: "NEUTRAL", bestProbabilityEdge: null, bestProbabilitySide: null } })} />);
    expect(screen.getByText("Neutral")).toBeInTheDocument();
  });

  it("renders the lean and edge percentage for a computed, valued row", () => {
    render(<KProbabilityValueBadge probabilityRow={computedRow()} />);
    expect(screen.getByText(/OVER/)).toBeInTheDocument();
    expect(screen.getByText(/\+9\.0%/)).toBeInTheDocument();
  });

  it("does NOT cap or alter the displayed edge when the model probability is in the overconfident tail (>= 65%) -- the compact pill shows no caution marker for it", () => {
    const row = computedRow({
      model: { overProbability: 0.72, underProbability: 0.28, meanSimulatedKs: 6.0, medianSimulatedKs: 6, stdevSimulatedKs: 2.5 },
      edge: { overProbabilityEdge: 0.21, underProbabilityEdge: null, lean: "OVER", bestProbabilityEdge: 0.21, bestProbabilitySide: "OVER" },
    });
    render(<KProbabilityValueBadge probabilityRow={row} />);
    // Raw edge is preserved verbatim -- not capped, not hidden.
    expect(screen.getByText(/\+21\.0%/)).toBeInTheDocument();
    // The overconfident-tail caution is not surfaced on the compact pill.
    expect(screen.queryByText("*")).not.toBeInTheDocument();
  });

  it("never shows a caution marker on the compact pill, in or out of the overconfident tail", () => {
    render(<KProbabilityValueBadge probabilityRow={computedRow()} />);
    expect(screen.queryByText("*")).not.toBeInTheDocument();
  });

  it("shows a one-sided indicator instead of a value badge when only one side of the market is priced", () => {
    render(<KProbabilityValueBadge probabilityRow={computedRow({ status: "one_sided_market" })} />);
    expect(screen.getByText("1-sided")).toBeInTheDocument();
  });
});

describe("KProbabilityDetailBlock", () => {
  it("renders an unavailable message when there is no probability row", () => {
    render(<KProbabilityDetailBlock probabilityRow={null} />);
    expect(screen.getByText(/unavailable for this pitcher/)).toBeInTheDocument();
  });

  it("renders model/market probabilities and the confidence grade for a computed row", () => {
    render(<KProbabilityDetailBlock probabilityRow={computedRow()} />);
    expect(screen.getByText("60.0%")).toBeInTheDocument();
    expect(screen.getByText("40.0%")).toBeInTheDocument();
    expect(screen.getByText(/HIGH confidence/)).toBeInTheDocument();
  });

  it("shows the historical calibration warning, verbatim raw probability, when a model probability is in the overconfident tail", () => {
    const row = computedRow({
      model: { overProbability: 0.72, underProbability: 0.28, meanSimulatedKs: 6.0, medianSimulatedKs: 6, stdevSimulatedKs: 2.5 },
    });
    render(<KProbabilityDetailBlock probabilityRow={row} />);
    expect(screen.getByText("72.0%")).toBeInTheDocument();
    expect(screen.getByText(/Calibration check/)).toBeInTheDocument();
    expect(screen.getByText(/overconfident range/)).toBeInTheDocument();
  });

  it("does not show the calibration warning when neither side is in the overconfident tail", () => {
    render(<KProbabilityDetailBlock probabilityRow={computedRow()} />);
    expect(screen.queryByText(/Calibration check/)).not.toBeInTheDocument();
  });

  it("never fabricates a de-vig comparison for a one-sided market", () => {
    render(<KProbabilityDetailBlock probabilityRow={computedRow({ status: "one_sided_market" })} />);
    expect(screen.getByText(/no de-vig comparison shown/)).toBeInTheDocument();
  });
});
