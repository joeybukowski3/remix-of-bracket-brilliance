import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MetricCell, type MetricCellHeat } from "@/components/nfl/powerRatings/MetricCell";

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

const HEAT: MetricCellHeat = {
  backgroundColor: "#10b981",
  color: "#ffffff",
  boxShadow: "inset 0 0 0 1px rgba(16, 185, 129, 0.3)",
};

describe("MetricCell", () => {
  it("Rankings mode: rank is primary, value is secondary", () => {
    renderCell(<MetricCell value={78.6} rank={3} mode="rankings" formatValue={fmt} heat={HEAT} />);
    expect(screen.getByText("#3").className).toContain("nfl-pr-value-primary");
    expect(screen.getByText("78.6").className).toContain("nfl-pr-value-secondary");
  });

  it("Ratings mode: value is primary, rank is secondary", () => {
    renderCell(<MetricCell value={78.6} rank={3} mode="ratings" formatValue={fmt} heat={HEAT} />);
    expect(screen.getByText("78.6").className).toContain("nfl-pr-value-primary");
    expect(screen.getByText("#3").className).toContain("nfl-pr-value-secondary");
  });

  it("paints exactly the resolved shared-heat style it is handed, and marks the cell painted", () => {
    const { container } = renderCell(
      <MetricCell value={90} rank={1} mode="rankings" formatValue={fmt} heat={HEAT} />
    );
    const td = container.querySelector("td") as HTMLElement;
    expect(td.classList.contains("nfl-pr-heat--painted")).toBe(true);
    expect(td.style.backgroundColor).toBe("rgb(16, 185, 129)");
    expect(td.style.color).toBe("rgb(255, 255, 255)");
    expect(td.style.boxShadow).toContain("inset 0 0 0 1px");
  });

  it("heat is a function of the resolved style only, not of rank — same style regardless of mode", () => {
    const { container: rankings } = renderCell(
      <MetricCell value={90} rank={32} mode="rankings" formatValue={fmt} heat={HEAT} />
    );
    const { container: ratings } = renderCell(
      <MetricCell value={90} rank={32} mode="ratings" formatValue={fmt} heat={HEAT} />
    );
    const bg = (c: HTMLElement | null) => (c as HTMLElement).style.backgroundColor;
    expect(bg(rankings.querySelector("td"))).toBe(bg(ratings.querySelector("td")));
  });

  it("no heat style: no fill, no painted class", () => {
    const { container } = renderCell(
      <MetricCell value={50} rank={16} mode="rankings" formatValue={fmt} heat={null} />
    );
    const td = container.querySelector("td") as HTMLElement;
    expect(td.classList.contains("nfl-pr-heat--painted")).toBe(false);
    expect(td.style.backgroundColor).toBe("");
  });

  it("renders a single neutral dash with no heat when the value is null", () => {
    const { container } = renderCell(
      <MetricCell value={null} rank={5} mode="ratings" formatValue={fmt} heat={HEAT} />
    );
    const dash = screen.getByText("—");
    expect(dash.className).toContain("nfl-pr-unavailable");
    expect(screen.queryByText("#5")).toBeNull();
    const td = container.querySelector("td") as HTMLElement;
    expect(td.classList.contains("nfl-pr-heat--painted")).toBe(false);
    expect(td.style.backgroundColor).toBe("");
  });

  it("omits the secondary line when there is no rank", () => {
    renderCell(<MetricCell value={50} rank={null} mode="rankings" formatValue={fmt} />);
    expect(screen.getByText("50.0").className).toContain("nfl-pr-value-primary");
  });
});
