/**
 * MLBPercentileDemo.test.tsx
 * The demo must render through the shared PercentileCell + JKB Heat scale
 * (no bespoke inline percentileToClass ramp), keep every value and percentile
 * label, and honor K% as the one lower-is-better metric.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/hooks/useMLBPercentilesSample", () => ({
  useMLBPercentilesSample: () => ({
    isLoading: false,
    error: null,
    data: {
      players: [
        {
          id: "p1",
          name: "Aaron Judge",
          teamId: "nyy",
          stats: { xwOBA: 0.44, xSLG: 0.66, barrelRate: 26, kPct: 24, bbPct: 15 },
          percentiles: { xwOBA: 99, xSLG: 98, barrelRate: 97, kPct: 30, bbPct: 92 },
        },
      ],
    },
  }),
}));

import MLBPercentileDemo from "./MLBPercentileDemo";

function renderDemo() {
  return render(
    <MemoryRouter>
      <MLBPercentileDemo />
    </MemoryRouter>,
  );
}

describe("MLBPercentileDemo", () => {
  it("renders a JKB Heat legend built from the shared tier definitions", () => {
    renderDemo();
    expect(screen.getByLabelText("Percentile color scale legend")).toBeInTheDocument();
    expect(screen.getByText("Elite")).toBeInTheDocument();
    expect(screen.getByText("Poor")).toBeInTheDocument();
  });

  it("renders each metric value through PercentileCell with a resolved tier", () => {
    const { container } = renderDemo();
    const cells = container.querySelectorAll("[data-percentile-tier]");
    expect(cells.length).toBe(5);
    // xwOBA is 99th percentile, higher-better -> Elite tier
    const xwoba = Array.from(cells).find((el) => el.textContent === "0.44");
    expect(xwoba?.getAttribute("data-percentile-tier")).toBe("elite");
  });

  it("treats K% as lower-is-better (30th percentile K% is favorable, not weak)", () => {
    const { container } = renderDemo();
    const cells = Array.from(container.querySelectorAll("[data-percentile-tier]"));
    const kPct = cells.find((el) => el.textContent === "24");
    // favorable percentile = 100 - 30 = 70 -> Above Average
    expect(kPct?.getAttribute("data-percentile-tier")).toBe("aboveAverage");
  });

  it("keeps the raw percentile label next to each value", () => {
    renderDemo();
    expect(screen.getByText("(99th %ile)")).toBeInTheDocument();
    expect(screen.getByText("(30th %ile)")).toBeInTheDocument();
  });
});
