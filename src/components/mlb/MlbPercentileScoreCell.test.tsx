import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PercentileCell } from "./MlbPercentileScoreCell";
import { PERCENTILE_TIERS } from "@/lib/mlb/percentileColorScale";

const ELITE_STYLE = PERCENTILE_TIERS.find((tier) => tier.id === "elite")!.style;

describe("PercentileCell", () => {
  it.each([
    ["elite", 99, "Elite"],
    ["excellent", 96, "Excellent"],
    ["great", 85, "Great"],
    ["aboveAverage", 65, "Above Average"],
    ["average", 45, "Average"],
    ["belowAverage", 30, "Below Average"],
    ["weak", 15, "Weak"],
    ["poor", 5, "Poor"],
  ])("resolves the %s tier for percentile %i", (tierId, percentile, label) => {
    render(<PercentileCell value={72} display="72.0" percentile={percentile} bypassSampleGate />);
    const cell = screen.getByText("72.0");
    expect(cell).toHaveAttribute("data-percentile-tier", tierId);
    expect(cell).toHaveAttribute("title", expect.stringContaining(label));
  });

  it("gives Elite the existing gold background and text color", () => {
    render(<PercentileCell value={99} display="99.0" percentile={99} bypassSampleGate />);
    const cell = screen.getByText("99.0");
    expect(cell).toHaveAttribute("data-percentile-tier", "elite");
    expect(cell.style.backgroundColor).toBe(hexToRgb(ELITE_STYLE.backgroundColor));
    expect(cell.style.color).toBe(hexToRgb(ELITE_STYLE.color));
  });

  it.each([
    [30, "belowAverage"],
    [15, "weak"],
    [5, "poor"],
  ])("paints unfavorable percentile %i (%s) red, not blue", (percentile, tierId) => {
    render(<PercentileCell value={5} display={`u${percentile}`} percentile={percentile} bypassSampleGate />);
    const cell = screen.getByText(`u${percentile}`);
    expect(cell).toHaveAttribute("data-percentile-tier", tierId);
    const [r, , b] = cell.style.backgroundColor.match(/\d+/g)!.map(Number);
    expect(r).toBeGreaterThan(b);
  });

  it("resolves boundary values consistently at the exact tier thresholds", () => {
    render(<PercentileCell value={1} display="a" percentile={98} bypassSampleGate />);
    expect(screen.getByText("a")).toHaveAttribute("data-percentile-tier", "elite");

    render(<PercentileCell value={2} display="b" percentile={97.999} bypassSampleGate />);
    expect(screen.getByText("b")).toHaveAttribute("data-percentile-tier", "excellent");
  });

  it("falls back to a neutral dash when the score is missing or invalid", () => {
    const { rerender } = render(<PercentileCell value={null} display="—" percentile={80} bypassSampleGate />);
    expect(screen.getByText("—")).not.toHaveAttribute("data-percentile-tier");

    rerender(<PercentileCell value={Number.NaN} display="—" percentile={80} bypassSampleGate />);
    expect(screen.getByText("—")).not.toHaveAttribute("data-percentile-tier");
  });

  it("falls back to a neutral style when percentile is missing (value present)", () => {
    render(<PercentileCell value={72} display="72.0" percentile={null} bypassSampleGate />);
    const cell = screen.getByText("72.0");
    expect(cell).toHaveAttribute("data-percentile-tier", "neutral");
  });
});

function hexToRgb(hex: string): string {
  const match = hex.trim().match(/^#([0-9a-f]{6})$/i);
  if (!match) return hex;
  const n = parseInt(match[1], 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}
