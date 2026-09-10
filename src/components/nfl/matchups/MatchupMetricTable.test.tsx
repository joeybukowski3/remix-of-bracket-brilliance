import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MatchupMetricTable from "./MatchupMetricTable";
import type { MatchupDisplayMetric } from "./matchupDisplayMetrics";
import type { NflMatchup } from "@/lib/nfl/matchups";

const matchup = {
  away: { slug: "away", abbr: "ne", teamName: "New England" },
  home: { slug: "home", abbr: "sea", teamName: "Seattle" },
} as NflMatchup;

const metric = (overrides: Partial<MatchupDisplayMetric> = {}): MatchupDisplayMetric => ({
  key: "off.epaPerPlay",
  label: "EPA / Play",
  direction: "higher-is-better",
  away: { value: 0.215, rank: 1, formatted: "+0.215" },
  home: { value: -0.01, rank: 19, formatted: "-0.010" },
  comparison: "away",
  ...overrides,
});

function renderTable(metrics: MatchupDisplayMetric[], props = {}) {
  return render(
    <MatchupMetricTable
      metrics={metrics}
      matchup={matchup}
      caption="EPA metrics for New England and Seattle"
      {...props}
    />
  );
}

describe("MatchupMetricTable", () => {
  it("shows league rank only in team cells and never the raw stat value", () => {
    const { container } = renderTable([metric()]);
    const ranks = container.querySelectorAll(".matchup-metric-table__rank");
    expect(ranks).toHaveLength(2);
    expect(ranks[0].textContent).toBe("1st");
    expect(ranks[1].textContent).toBe("19th");
    container.querySelectorAll(".matchup-metric-table__value").forEach((value) => {
      expect(value.textContent).not.toMatch(/[+-]?\d\.\d/);
    });
  });

  it("marks the winning side and weaker side from the existing comparison", () => {
    const { container } = renderTable([metric()]);
    expect(container.querySelectorAll(".matchup-metric-table__value.is-winner")).toHaveLength(1);
    expect(container.querySelectorAll(".matchup-metric-table__value.is-weaker")).toHaveLength(1);
    const away = container.querySelector('[data-cell="away"] .matchup-metric-table__value');
    expect(away).toHaveClass("is-winner");
  });

  it("keeps the Edge column on the raw-value difference and winning team", () => {
    renderTable([metric()]);
    const edge = document.querySelector(".matchup-metric-table__edge--away") as HTMLElement;
    expect(edge.querySelector("b")?.textContent).toBe("NE");
    expect(edge.querySelector("small")?.textContent).toBe("+0.225");
  });

  it("renders EVEN with no crest for a tie", () => {
    renderTable([metric({ comparison: "tie" })]);
    const edge = document.querySelector(".matchup-metric-table__edge.is-neutral") as HTMLElement;
    expect(edge.textContent).toBe("EVEN");
    expect(within(edge).queryByRole("img")).toBeNull();
  });

  it("preserves N/A for an unavailable metric in both the cell and the Edge", () => {
    const { container } = renderTable([
      metric({
        comparison: "missing",
        home: { value: null, rank: null, formatted: "N/A" },
      }),
    ]);
    const home = container.querySelector('[data-cell="home"] .matchup-metric-table__value') as HTMLElement;
    expect(home.textContent).toContain("N/A");
    const edge = container.querySelector(".matchup-metric-table__edge.is-neutral") as HTMLElement;
    expect(edge.textContent).toBe("N/A");
  });

  it("carries the raw value on the cell title for hover/detail", () => {
    const { container } = renderTable([metric()]);
    const away = container.querySelector('[data-cell="away"] .matchup-metric-table__value') as HTMLElement;
    expect(away.getAttribute("title")).toContain("+0.215");
  });

  it("uses projection wording on the value title when projected", () => {
    const { container } = renderTable([metric()], { projected: true });
    const away = container.querySelector('[data-cell="away"] .matchup-metric-table__value') as HTMLElement;
    expect(away.getAttribute("title")).toContain("Projected rank 1");
  });

  it("applies the detail variant scale attribute", () => {
    const { container } = renderTable([metric()], { variant: "detail" });
    expect(container.querySelector(".matchup-metric-table")).toHaveAttribute("data-variant", "detail");
  });
});
