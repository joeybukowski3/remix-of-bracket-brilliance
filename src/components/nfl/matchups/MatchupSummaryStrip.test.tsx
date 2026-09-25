import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import MatchupSummaryStrip from "@/components/nfl/matchups/MatchupSummaryStrip";
import type { MarketCurrentGame } from "@/lib/nfl/marketData";
import type { GameProjection } from "@/lib/nfl/projectionData";
import type { NflMatchupTeam } from "@/lib/nfl/matchups";
import type { TeamTotalProjection } from "@/lib/nfl/totalsProjectionData";

const market = {
  homeAbbr: "gb",
  awayAbbr: "chi",
  spread: { home: -3.5, away: 3.5 },
  moneyline: { home: null, away: null },
  total: 45.5,
} as MarketCurrentGame;
const gb = { abbr: "gb", slug: "green-bay-packers", teamName: "Green Bay Packers", color: "#203731" } as NflMatchupTeam;
const chi = { abbr: "chi", slug: "chicago-bears", teamName: "Chicago Bears", color: "#0B162A" } as NflMatchupTeam;
const projection = { formattedJkbSpread: "GB −1.8", projectedHomeMargin: 1.8, homeTeam: "gb", awayTeam: "chi" } as GameProjection;
const totals = { projectedGameTotal: 47.2, status: "projected" } as TeamTotalProjection;

function fieldText(key: string) {
  const field = document.querySelector(`[data-summary-field="${key}"]`) as HTMLElement;
  return {
    label: within(field).getByRole("term").textContent,
    value: within(field).getByRole("definition").textContent,
  };
}

describe("MatchupSummaryStrip", () => {
  it("renders all labeled values", () => {
    render(<MatchupSummaryStrip market={market} projection={projection} totalProjection={totals} awayTeam={chi} homeTeam={gb} />);
    expect(fieldText("vegas-line")).toEqual({ label: "Vegas Line", value: "GB −3.5" });
    expect(fieldText("jkb-line")).toEqual({ label: "JKB Line", value: "GB −1.8" });
    expect(fieldText("vegas-total")).toEqual({ label: "Vegas Total", value: "45.5" });
    expect(fieldText("jkb-total")).toEqual({ label: "JKB Total", value: "47.2" });
    expect(screen.getByLabelText("JKB is less bullish on the market favorite by 1.7 points")).toBeTruthy();
    expect(screen.getByLabelText("JKB total is higher than the Vegas total by 1.7 points")).toBeTruthy();
  });

  it("shows an away favorite by away abbreviation", () => {
    const awayFav = { ...market, spread: { home: 2, away: -2 } } as MarketCurrentGame;
    render(<MatchupSummaryStrip market={awayFav} projection={null} totalProjection={null} awayTeam={chi} homeTeam={gb} />);
    expect(fieldText("vegas-line").value).toBe("CHI −2");
  });

  it("shows PK for a pickem", () => {
    const pk = { ...market, spread: { home: 0, away: 0 } } as MarketCurrentGame;
    render(<MatchupSummaryStrip market={pk} projection={null} totalProjection={null} awayTeam={chi} homeTeam={gb} />);
    expect(fieldText("vegas-line").value).toBe("PK");
  });

  it("shows dashes when market data is missing but keeps JKB values", () => {
    render(<MatchupSummaryStrip market={null} projection={projection} totalProjection={totals} awayTeam={chi} homeTeam={gb} />);
    expect(fieldText("vegas-line").value).toBe("—");
    expect(fieldText("vegas-total").value).toBe("—");
    expect(fieldText("jkb-line").value).toBe("GB −1.8");
    expect(fieldText("jkb-total").value).toBe("47.2");
  });

  it("shows dashes when JKB projections are missing but keeps market values", () => {
    render(<MatchupSummaryStrip market={market} projection={null} totalProjection={null} awayTeam={chi} homeTeam={gb} />);
    expect(fieldText("jkb-line").value).toBe("—");
    expect(fieldText("jkb-total").value).toBe("—");
    expect(fieldText("vegas-line").value).toBe("GB −3.5");
  });

  it("uses a compact mobile grid and a left-aligned desktop row with strong dividers", () => {
    render(<MatchupSummaryStrip market={market} projection={projection} totalProjection={totals} awayTeam={chi} homeTeam={gb} />);
    const strip = document.querySelector("[data-matchup-summary-strip]") as HTMLElement;
    expect(strip.className).toContain("grid-cols-2");
    expect(strip.className).toContain("md:flex");
    expect(strip.className).toContain("border-t-[3px]");
    expect((strip.querySelector('[data-summary-field="jkb-line"]') as HTMLElement).className).toContain("border-l-2");
    expect(screen.getAllByRole("term")).toHaveLength(6);
  });

  it("shows a dog badge for a flipped favorite and a neutral PK badge for pick'em", () => {
    const flipped = { formattedJkbSpread: "CHI −1.0", projectedHomeMargin: -1 } as GameProjection;
    const view = render(<MatchupSummaryStrip market={market} projection={flipped} totalProjection={totals} awayTeam={chi} homeTeam={gb} />);
    expect(screen.getByLabelText("Market underdog projected to be favored by JKB").textContent).toBe("DOG");
    view.rerender(<MatchupSummaryStrip market={{ ...market, spread: { home: 0, away: 0 } }} projection={projection} totalProjection={totals} awayTeam={chi} homeTeam={gb} />);
    expect(screen.getByLabelText("Market pick'em; no favorite to compare").textContent).toBe("PK");
  });

  it("does not show a signal without both numeric sources or when effectively aligned", () => {
    const view = render(<MatchupSummaryStrip market={null} projection={projection} totalProjection={null} awayTeam={chi} homeTeam={gb} />);
    expect(document.querySelectorAll('[data-summary-field="jkb-line"] [aria-label]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-summary-field="jkb-total"] [aria-label]')).toHaveLength(0);
    view.rerender(<MatchupSummaryStrip market={market} projection={{ ...projection, projectedHomeMargin: 3.53 }} totalProjection={{ ...totals, projectedGameTotal: 45.53 }} awayTeam={chi} homeTeam={gb} />);
    expect(document.querySelectorAll('[data-summary-field="jkb-line"] [aria-label]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-summary-field="jkb-total"] [aria-label]')).toHaveLength(0);
  });

  describe("model picks", () => {
    const pickText = (key: string) => (document.querySelector(`[data-summary-field="${key}"] [data-summary-pick]`) as HTMLElement | null)?.textContent ?? null;
    const dd = (key: string) => (document.querySelector(`[data-summary-field="${key}"] dd`) as HTMLElement).textContent;
    const proj = (projectedHomeMargin: number) => ({ ...projection, projectedHomeMargin }) as GameProjection;
    const show = (p: GameProjection | null, m: MarketCurrentGame | null = market) =>
      render(<MatchupSummaryStrip market={m} projection={p} totalProjection={totals} awayTeam={chi} homeTeam={gb} />);

    it("labels both fields and orders them after the four numeric fields", () => {
      show(projection);
      expect(screen.getAllByRole("term").map((t) => t.textContent)).toEqual([
        "Vegas Line", "JKB Line", "Vegas Total", "JKB Total", "ATS Model Pick", "ML Model Pick",
      ]);
    });

    it("ATS picks home (with its market spread) when JKB is higher on home than the market", () => {
      show(proj(5));
      expect(pickText("ats-pick")).toBe("GB−3.5");
    });

    it("ATS picks away (with its market spread) when JKB is lower on home than the market", () => {
      show(proj(1.8));
      expect(pickText("ats-pick")).toBe("CHI+3.5");
    });

    it("ATS shows a dash when JKB exactly matches the market", () => {
      show(proj(3.5));
      expect(pickText("ats-pick")).toBeNull();
      expect(dd("ats-pick")).toBe("—");
    });

    it("ML picks home, away, and shows a dash for a pick'em", () => {
      const view = show(proj(0.6));
      expect(pickText("ml-pick")).toBe("GB");
      view.unmount();
      const away = show(proj(-0.6));
      expect(pickText("ml-pick")).toBe("CHI");
      away.unmount();
      show(proj(0));
      expect(pickText("ml-pick")).toBeNull();
      expect(dd("ml-pick")).toBe("—");
    });

    it("ML pick does not need a market; ATS does", () => {
      show(proj(2), null);
      expect(pickText("ml-pick")).toBe("GB");
      expect(dd("ats-pick")).toBe("—");
    });

    it("renders the picked team's logo at a compact size, with a team-color accent", () => {
      show(proj(5));
      const pick = document.querySelector('[data-summary-field="ats-pick"] [data-summary-pick]') as HTMLElement;
      const logo = pick.querySelector("img") as HTMLImageElement;
      expect(logo.getAttribute("width")).toBe("18");
      expect(logo.getAttribute("src")).toMatch(/gb/i);
      expect(pick.getAttribute("aria-label")).toBe("ATS Model Pick: GB −3.5");
      expect(pick.style.borderLeftColor).not.toBe("");
    });

    it("shows dashes for both picks when the projection is missing", () => {
      show(null);
      expect(dd("ats-pick")).toBe("—");
      expect(dd("ml-pick")).toBe("—");
    });
  });
});
