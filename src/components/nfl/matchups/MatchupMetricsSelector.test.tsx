import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MatchupMetricsSelector from "@/components/nfl/matchups/MatchupMetricsSelector";
import type { MatchupVisualMetric } from "@/lib/nfl/matchupVisualizationModel";

function metric(id: string, label: string): MatchupVisualMetric {
  return {
    id,
    label,
    shortLabel: label,
    categoryId: "offense",
    comparison: "away",
    leader: "away",
    isChartEligible: true,
    away: { value: 1, rank: 1, formatted: "1", percentile: 0 },
    home: { value: 0, rank: 20, formatted: "0", percentile: 0.6 },
    rankGap: 19,
  };
}

const METRICS = [metric("a", "Metric A"), metric("b", "Metric B"), metric("c", "Metric C"), metric("d", "Metric D")];

describe("MatchupMetricsSelector", () => {
  it("refuses to deselect below the minimum and shows inline feedback", () => {
    const onChange = vi.fn();
    render(
      <MatchupMetricsSelector
        categoryLabel="Offense"
        availableMetrics={METRICS}
        selectedIds={["a", "b"]}
        onChange={onChange}
        onReset={vi.fn()}
        isDefault={false}
      />
    );
    fireEvent.click(screen.getByText("Metrics · 2"));
    const checkboxA = screen.getByText("Metric A").closest("label")!.querySelector('[role="checkbox"]')!;
    fireEvent.click(checkboxA);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("Keep at least 2 metrics.")).toBeInTheDocument();
  });

  it("allows deselecting when above the minimum", () => {
    const onChange = vi.fn();
    render(
      <MatchupMetricsSelector
        categoryLabel="Offense"
        availableMetrics={METRICS}
        selectedIds={["a", "b", "c"]}
        onChange={onChange}
        onReset={vi.fn()}
        isDefault={false}
      />
    );
    fireEvent.click(screen.getByText("Metrics · 3"));
    const checkboxA = screen.getByText("Metric A").closest("label")!.querySelector('[role="checkbox"]')!;
    fireEvent.click(checkboxA);
    expect(onChange).toHaveBeenCalledWith(["b", "c"]);
  });

  it("adds a metric back in registry order regardless of click order", () => {
    const onChange = vi.fn();
    render(
      <MatchupMetricsSelector
        categoryLabel="Offense"
        availableMetrics={METRICS}
        selectedIds={["a", "d"]}
        onChange={onChange}
        onReset={vi.fn()}
        isDefault={false}
      />
    );
    fireEvent.click(screen.getByText("Metrics · 2"));
    const checkboxB = screen.getByText("Metric B").closest("label")!.querySelector('[role="checkbox"]')!;
    fireEvent.click(checkboxB);
    // "b" comes before "d" in availableMetrics, so it must be inserted there, not appended.
    expect(onChange).toHaveBeenCalledWith(["a", "b", "d"]);
  });

  it("disables Reset to defaults when already at the defaults", () => {
    render(
      <MatchupMetricsSelector
        categoryLabel="Offense"
        availableMetrics={METRICS}
        selectedIds={["a", "b"]}
        onChange={vi.fn()}
        onReset={vi.fn()}
        isDefault={true}
      />
    );
    fireEvent.click(screen.getByText("Metrics · 2"));
    expect(screen.getByText("Reset to defaults")).toBeDisabled();
  });

  it("calls onReset when Reset to defaults is clicked", () => {
    const onReset = vi.fn();
    render(
      <MatchupMetricsSelector
        categoryLabel="Offense"
        availableMetrics={METRICS}
        selectedIds={["a", "b", "c"]}
        onChange={vi.fn()}
        onReset={onReset}
        isDefault={false}
      />
    );
    fireEvent.click(screen.getByText("Metrics · 3"));
    fireEvent.click(screen.getByText("Reset to defaults"));
    expect(onReset).toHaveBeenCalled();
  });
});
