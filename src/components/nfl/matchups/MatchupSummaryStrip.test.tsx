import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import MatchupSummaryStrip from "@/components/nfl/matchups/MatchupSummaryStrip";
import type { MarketCurrentGame } from "@/lib/nfl/marketData";
import type { GameProjection } from "@/lib/nfl/projectionData";
import type { TeamTotalProjection } from "@/lib/nfl/totalsProjectionData";

const market = {
  homeAbbr: "gb",
  awayAbbr: "chi",
  spread: { home: -3.5, away: 3.5 },
  moneyline: { home: null, away: null },
  total: 45.5,
} as MarketCurrentGame;
const projection = { formattedJkbSpread: "GB −1.8" } as GameProjection;
const totals = { projectedGameTotal: 47.2, status: "projected" } as TeamTotalProjection;

function fieldText(key: string) {
  const field = document.querySelector(`[data-summary-field="${key}"]`) as HTMLElement;
  return {
    label: within(field).getByRole("term").textContent,
    value: within(field).getByRole("definition").textContent,
  };
}

describe("MatchupSummaryStrip", () => {
  it("renders all four labeled values", () => {
    render(<MatchupSummaryStrip market={market} projection={projection} totalProjection={totals} />);
    expect(fieldText("vegas-line")).toEqual({ label: "Vegas Line", value: "GB −3.5" });
    expect(fieldText("jkb-line")).toEqual({ label: "JKB Line", value: "GB −1.8" });
    expect(fieldText("vegas-total")).toEqual({ label: "Vegas Total", value: "45.5" });
    expect(fieldText("jkb-total")).toEqual({ label: "JKB Total", value: "47.2" });
  });

  it("shows an away favorite by away abbreviation", () => {
    const awayFav = { ...market, spread: { home: 2, away: -2 } } as MarketCurrentGame;
    render(<MatchupSummaryStrip market={awayFav} projection={null} totalProjection={null} />);
    expect(fieldText("vegas-line").value).toBe("CHI −2");
  });

  it("shows PK for a pickem", () => {
    const pk = { ...market, spread: { home: 0, away: 0 } } as MarketCurrentGame;
    render(<MatchupSummaryStrip market={pk} projection={null} totalProjection={null} />);
    expect(fieldText("vegas-line").value).toBe("PK");
  });

  it("shows dashes when market data is missing but keeps JKB values", () => {
    render(<MatchupSummaryStrip market={null} projection={projection} totalProjection={totals} />);
    expect(fieldText("vegas-line").value).toBe("—");
    expect(fieldText("vegas-total").value).toBe("—");
    expect(fieldText("jkb-line").value).toBe("GB −1.8");
    expect(fieldText("jkb-total").value).toBe("47.2");
  });

  it("shows dashes when JKB projections are missing but keeps market values", () => {
    render(<MatchupSummaryStrip market={market} projection={null} totalProjection={null} />);
    expect(fieldText("jkb-line").value).toBe("—");
    expect(fieldText("jkb-total").value).toBe("—");
    expect(fieldText("vegas-line").value).toBe("GB −3.5");
  });

  it("uses a 2x2 grid on mobile and one row at md", () => {
    render(<MatchupSummaryStrip market={market} projection={projection} totalProjection={totals} />);
    const strip = document.querySelector("[data-matchup-summary-strip]") as HTMLElement;
    expect(strip.className).toContain("grid-cols-2");
    expect(strip.className).toContain("md:grid-cols-4");
    expect(screen.getAllByRole("term")).toHaveLength(4);
  });
});
