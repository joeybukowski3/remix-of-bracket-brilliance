import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MetricCell } from "@/components/nfl/powerRatings/MetricCell";

function renderCell(ui: React.ReactElement) {
  return render(
    <table>
      <tbody>
        <tr>{ui}</tr>
      </tbody>
    </table>
  );
}

const fmt = (v: number) => v.toFixed(1);

describe("MetricCell", () => {
  it("Rankings mode: rank is primary, value is secondary", () => {
    renderCell(<MetricCell value={78.6} rank={3} mode="rankings" formatValue={fmt} heat />);
    const primary = screen.getByText("#3");
    const secondary = screen.getByText("78.6");
    expect(primary.className).toContain("nfl-pr-value-primary");
    expect(secondary.className).toContain("nfl-pr-value-secondary");
  });

  it("Ratings mode: value is primary, rank is secondary", () => {
    renderCell(<MetricCell value={78.6} rank={3} mode="ratings" formatValue={fmt} heat />);
    expect(screen.getByText("78.6").className).toContain("nfl-pr-value-primary");
    expect(screen.getByText("#3").className).toContain("nfl-pr-value-secondary");
  });

  it("heat background is driven by value, not rank", () => {
    const { container: strong } = renderCell(
      <MetricCell value={90} rank={32} mode="rankings" formatValue={fmt} heat />
    );
    const { container: weak } = renderCell(
      <MetricCell value={15} rank={1} mode="rankings" formatValue={fmt} heat />
    );
    const strongBg = (strong.querySelector("td") as HTMLElement).style.background;
    const weakBg = (weak.querySelector("td") as HTMLElement).style.background;
    expect(strongBg).toContain("22, 163, 74"); // green for the high value despite worst rank
    expect(weakBg).toContain("220, 38, 38"); // red for the low value despite best rank
  });

  it("renders a single neutral dash when the value is null", () => {
    renderCell(<MetricCell value={null} rank={5} mode="ratings" formatValue={fmt} heat />);
    const dash = screen.getByText("—");
    expect(dash.className).toContain("nfl-pr-unavailable");
    expect(screen.queryByText("#5")).toBeNull();
  });

  it("omits the secondary line when there is no rank", () => {
    renderCell(<MetricCell value={50} rank={null} mode="rankings" formatValue={fmt} />);
    expect(screen.getByText("50.0").className).toContain("nfl-pr-value-primary");
  });
});
