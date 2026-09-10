import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MatchupMetricTable from "./MatchupMetricTable";
import type { MatchupDisplayMetric } from "./matchupDisplayMetrics";
import { getRankTier } from "@/lib/nfl/rankTier";
import { nflTeamColor } from "@/lib/nfl/nflTeamColor";
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

describe("MatchupMetricTable — rank tiles", () => {
  it("shows league rank only and never the raw stat value", () => {
    const { container } = renderTable([metric()]);
    const ranks = container.querySelectorAll(".matchup-metric-table__rank");
    expect(ranks).toHaveLength(2);
    expect(ranks[0].textContent).toBe("1st");
    expect(ranks[1].textContent).toBe("19th");
    container.querySelectorAll(".matchup-metric-table__value").forEach((value) => {
      expect(value.textContent).not.toMatch(/[+-]?\d\.\d/);
    });
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

  it("colours each tile from its own rank tier, not from the row winner", () => {
    // away rank 1 (elite), home rank 19 (below-average) — away wins the row.
    const { container } = renderTable([metric()]);
    const away = container.querySelector('[data-cell="away"] .matchup-metric-table__value') as HTMLElement;
    const home = container.querySelector('[data-cell="home"] .matchup-metric-table__value') as HTMLElement;
    expect(away.className).toContain(getRankTier(1)!.badge.split(" ")[0]);
    expect(home.className).toContain(getRankTier(19)!.badge.split(" ")[0]);
    expect(away.className).not.toContain("is-winner");
    expect(home.className).not.toContain("is-weaker");
  });

  it("gives both facing teams an elite tile when both rank in the top four", () => {
    const { container } = renderTable([
      metric({ away: { value: 1, rank: 1, formatted: "1" }, home: { value: 1, rank: 2, formatted: "2" } }),
    ]);
    const tiles = container.querySelectorAll(".matchup-metric-table__value");
    const eliteFirstClass = getRankTier(1)!.badge.split(" ")[0];
    tiles.forEach((tile) => expect(tile.className).toContain(eliteFirstClass));
  });

  it("gives both facing teams a poor tile when both rank in the bottom four", () => {
    const { container } = renderTable([
      metric({
        comparison: "home",
        away: { value: 1, rank: 31, formatted: "31" },
        home: { value: 1, rank: 32, formatted: "32" },
      }),
    ]);
    const tiles = container.querySelectorAll(".matchup-metric-table__value");
    const poorFirstClass = getRankTier(32)!.badge.split(" ")[0];
    tiles.forEach((tile) => expect(tile.className).toContain(poorFirstClass));
  });

  it("marks an unranked tile neutral", () => {
    const { container } = renderTable([
      metric({ comparison: "missing", home: { value: null, rank: null, formatted: "N/A" } }),
    ]);
    const home = container.querySelector('[data-cell="home"] .matchup-metric-table__value') as HTMLElement;
    expect(home.getAttribute("data-ranked")).toBe("false");
    expect(home.textContent).toContain("N/A");
  });
});

describe("MatchupMetricTable — comparison bar", () => {
  it("fills toward the left team in that team's colour when the away side leads", () => {
    const { container } = renderTable([metric()]);
    const bar = container.querySelector(".matchup-metric-table__bar") as HTMLElement;
    expect(bar.getAttribute("data-side")).toBe("left");
    const fill = bar.querySelector(".matchup-metric-table__bar-fill--left") as HTMLElement;
    expect(fill).not.toBeNull();
    expect(fill.style.getPropertyValue("--bar-fill")).toBe(nflTeamColor("ne"));
  });

  it("fills toward the right team in that team's colour when the home side leads", () => {
    const { container } = renderTable([
      metric({
        comparison: "home",
        away: { value: -0.05, rank: 22, formatted: "-0.050" },
        home: { value: 0.1, rank: 3, formatted: "+0.100" },
      }),
    ]);
    const bar = container.querySelector(".matchup-metric-table__bar") as HTMLElement;
    expect(bar.getAttribute("data-side")).toBe("right");
    const fill = bar.querySelector(".matchup-metric-table__bar-fill--right") as HTMLElement;
    expect(fill.style.getPropertyValue("--bar-fill")).toBe(nflTeamColor("sea"));
  });

  it("shows no directional fill for a tie", () => {
    const { container } = renderTable([metric({ comparison: "tie" })]);
    const bar = container.querySelector(".matchup-metric-table__bar") as HTMLElement;
    expect(bar.getAttribute("data-side")).toBe("even");
    expect(bar.querySelector(".matchup-metric-table__bar-fill")).toBeNull();
  });

  it("shows no directional fill for a not-comparable row", () => {
    const { container } = renderTable([metric({ comparison: "not-comparable" })]);
    const bar = container.querySelector(".matchup-metric-table__bar") as HTMLElement;
    expect(bar.getAttribute("data-side")).toBe("none");
    expect(bar.querySelector(".matchup-metric-table__bar-fill")).toBeNull();
  });

  it("falls back to the neutral token when the favoured team has no resolvable colour", () => {
    const oddMatchup = {
      away: { slug: "a", abbr: "zzz", teamName: "Team Z", color: null },
      home: { slug: "h", abbr: "yyy", teamName: "Team Y", color: null },
    } as unknown as NflMatchup;
    const { container } = render(
      <MatchupMetricTable metrics={[metric()]} matchup={oddMatchup} caption="x" />
    );
    const fill = container.querySelector(".matchup-metric-table__bar-fill") as HTMLElement;
    expect(fill.style.getPropertyValue("--bar-fill")).toBe("var(--sheet-even)");
  });
});

describe("MatchupMetricTable — edge, variant, sides", () => {
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

  it("preserves N/A for an unavailable metric in the Edge", () => {
    const { container } = renderTable([
      metric({ comparison: "missing", home: { value: null, rank: null, formatted: "N/A" } }),
    ]);
    const edge = container.querySelector(".matchup-metric-table__edge.is-neutral") as HTMLElement;
    expect(edge.textContent).toBe("N/A");
  });

  it("suppresses the raw gap when edgeDifference is false", () => {
    renderTable([metric()], { edgeDifference: false });
    const edge = document.querySelector(".matchup-metric-table__edge--away") as HTMLElement;
    expect(edge.querySelector("small")).toBeNull();
  });

  it("applies the detail variant scale attribute", () => {
    const { container } = renderTable([metric()], { variant: "detail" });
    expect(container.querySelector(".matchup-metric-table")).toHaveAttribute("data-variant", "detail");
  });

  it("keeps away on the left and home on the right regardless of winner", () => {
    const { container } = renderTable([metric({ comparison: "home" })]);
    const away = container.querySelector('[data-cell="away"]') as HTMLElement;
    const home = container.querySelector('[data-cell="home"]') as HTMLElement;
    expect(within(away).getByText("NE", { exact: false })).toBeTruthy();
    expect(within(home).getByText("SEA", { exact: false })).toBeTruthy();
  });
});
