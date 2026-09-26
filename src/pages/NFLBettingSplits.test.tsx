import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NFLBettingSplits from "./NFLBettingSplits";
import { NFL_SECTION_NAV_CATEGORIES } from "@/lib/nfl/sectionNav";
import type { NflDkSplitsAvailability } from "@/lib/nfl/bettingSplitsData";

const artifact = {
  games: [{ gameId: "2026_03_BUF_MIA", away: "buf", home: "mia", markets: {
    spread: [{ side: "away", team: "buf", line: -2.5, odds: -110, handlePct: 75, betsPct: 50 }, { side: "home", team: "mia", line: 2.5, odds: -110, handlePct: 25, betsPct: 50 }],
    moneyline: [{ side: "away", team: "buf", line: null, odds: -140, handlePct: 80, betsPct: 45 }, { side: "home", team: "mia", line: null, odds: 120, handlePct: 20, betsPct: 55 }],
    total: [{ side: "over", line: 45.5, odds: -110, handlePct: 65, betsPct: 35 }, { side: "under", line: 45.5, odds: -110, handlePct: 35, betsPct: 65 }],
  } }],
} as unknown as NonNullable<NflDkSplitsAvailability["artifact"]>;
let state: ReturnType<typeof import("@/hooks/useNflBettingSplits")["useNflBettingSplits"]>;
vi.mock("@/hooks/useCurrentNflWeek", () => ({ useCurrentNflWeek: () => ({ loading: false, week: 3, error: null }) }));
vi.mock("@/hooks/useNflBettingSplits", () => ({ useNflBettingSplits: () => state }));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
function setup(freshness: NflDkSplitsAvailability["freshness"] = "fresh") {
  state = { loading: false, error: null, freshness, reason: freshness === "stale" ? "age" : null, artifact: freshness === "unavailable" ? null : artifact, sourceCapturedAt: freshness === "unavailable" ? null : "2026-09-25T14:47:13.329Z", generatedAt: "2026-09-25T14:48:00.000Z", ageMs: 1000, source: "DraftKings Network / DraftKings Sportsbook", season: 2026, week: 3 };
  return render(<MemoryRouter><NFLBettingSplits /></MemoryRouter>);
}

describe("NFL Betting Splits page", () => {
  it("renders Overview by default and the current source capture timestamp", () => {
    setup();
    expect(screen.getByRole("heading", { name: "NFL Betting Splits" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("status").textContent).toContain("Fresh");
    expect(screen.getByText("Matchup distribution")).toBeTruthy();
    expect(screen.getByText(/Captured Sep 25, 2026/)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("10:47 AM");
    expect(screen.getByRole("status").textContent).not.toContain("10:48 AM");
    const table = screen.getByRole("region", { name: "Overview matchup distribution" });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getByText("BUF Moneyline +35 [Strong Sharp Side]")).toBeTruthy();
    const gameRow = within(table).getAllByRole("row")[2];
    expect(within(gameRow).getAllByRole("cell").slice(1, 8).map((cell) => cell.textContent)).toEqual(["BUF 75%", "BUF 50%", "45.5", "Over 65%", "Under 65%", "BUF 80%", "MIA 55%"]);
    expect(within(gameRow).getByLabelText("BUF [-2.5] @ MIA")).toBeTruthy();
    expect(within(table).getByRole("columnheader", { name: /Sharp Indicator/ })).toBeTruthy();
    for (const market of ["Spread", "Total", "Moneyline"]) for (const metric of ["Handle", "Bets"]) expect(within(table).getByRole("button", { name: `Sort by ${market} ${metric} Favorite` })).toBeTruthy();
    expect(gameRow.querySelectorAll("[data-heat-pct]")).toHaveLength(6);
    for (const [title, tone] of [["Highest Public Sides", "bg-amber-50"], ["Sharp Sides", "bg-emerald-50"], ["Contrarian Sides", "bg-violet-50"]]) {
      const section = screen.getByRole("region", { name: title });
      expect(within(section).getByRole("heading", { name: title }).className).toContain(tone);
      expect(within(section).getAllByRole("row").length).toBeGreaterThan(1);
    }
    expect(within(screen.getByRole("region", { name: "Highest Public Sides" })).getAllByRole("row")[1].textContent).toContain("BUF @ MIAtotalUnder 45.5 · -11035%65%-30 pp");
    expect(within(screen.getByRole("region", { name: "Sharp Sides" })).getAllByRole("row")[1].textContent).toContain("BUF @ MIAmoneylineBUF -14080%45%+35 pp");
    expect(within(screen.getByRole("region", { name: "Contrarian Sides" })).getAllByRole("row")[1].textContent).toContain("BUF @ MIAtotalOver 45.5 · -11065%35%+30 pp");
    const cards = screen.getByRole("region", { name: "Overview matchup cards" });
    expect(within(cards).getByText("BUF 75%")).toBeTruthy();
    expect(within(cards).getByText("MIA 55%")).toBeTruthy();
  });
  it("shows both sides with market-specific columns, odds and shared signals", () => {
    setup();
    for (const market of ["Spread", "Moneyline", "Total"]) {
      fireEvent.click(screen.getByRole("tab", { name: market }));
      const table = screen.getByRole("region", { name: `${market.toLowerCase()} betting splits` });
      expect(within(table).getAllByRole("row").length).toBe(3);
      expect(within(table).getByRole("columnheader", { name: /Handle/ })).toBeTruthy();
      expect(within(table).getByRole("columnheader", { name: /Bets/ })).toBeTruthy();
      expect(within(table).getByRole("columnheader", { name: /Money Gap/ })).toBeTruthy();
      expect(within(table).getByRole("columnheader", { name: "Signal" })).toBeTruthy();
      const sides = within(table).getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent?.trim()));
      if (market === "Moneyline") { expect(within(table).queryByRole("columnheader", { name: "Line" })).toBeNull(); expect(within(table).getByText("-140")).toBeTruthy(); }
      if (market === "Total") { expect(within(table).getByText("Over")).toBeTruthy(); expect(within(table).getByText("Under")).toBeTruthy(); expect(within(table).getAllByText("45.5")).toHaveLength(2); }
      if (market === "Spread") { expect(within(table).getByText("-2.5")).toBeTruthy(); expect(within(table).getByText("+2.5")).toBeTruthy(); }
      expect(sides[0]).toEqual(market === "Spread" ? ["BUF", "-2.5", "MIA", "-110", "75%", "50%", "+25 pp", "Strong Money Gap"] : market === "Moneyline" ? ["BUF", "MIA", "-140", "80%", "45%", "+35 pp", "Strong Money Gap"] : ["BUF@MIA", "Over", "45.5", "-110", "65%", "35%", "+30 pp", "Strong Money Gap"]);
      if (market === "Total") { expect(within(table).getByText("Over").getAttribute("data-total-side")).toBe("over"); expect(within(table).getByText("Under").getAttribute("data-total-side")).toBe("under"); }
      expect(sides[1]?.at(-1)).toBe("Public Heavy");
    }
  });
  it("keeps mobile spread and moneyline rows side-specific and compact", () => {
    setup();
    for (const market of ["Spread", "Moneyline"]) {
      fireEvent.click(screen.getByRole("tab", { name: market }));
      const cards = screen.getByRole("region", { name: `${market.toLowerCase()} mobile rows` });
      const [away, home] = within(cards).getAllByRole("article");
      expect(away.textContent).toContain("BUF @ MIA");
      expect(home.textContent).toContain("MIA vs BUF");
      expect(away.textContent).not.toContain("BUF vs MIA");
      expect(home.textContent).not.toContain("BUF @ MIA");
      expect(away.textContent).toContain(market === "Spread" ? "Handle 75%Bets 50%" : "Handle 80%Bets 45%");
      expect(home.textContent).toContain(market === "Spread" ? "Handle 25%Bets 50%" : "Handle 20%Bets 55%");
      expect(away.querySelectorAll('img[src$="/buf.png"]')).toHaveLength(2);
      expect(home.querySelectorAll('img[src$="/mia.png"]')).toHaveLength(2);
      expect(away.textContent).toContain("Money Gap");
    }
  });
  it("keeps stale data visible with a warning, and hides unavailable data", () => {
    const view = setup("stale");
    expect(screen.getByRole("alert").textContent).toContain("Stale betting splits");
    expect(screen.getByRole("tab", { name: "Overview" })).toBeTruthy();
    view.unmount();
    setup("unavailable");
    expect(screen.getByText("Betting splits unavailable")).toBeTruthy();
    expect(screen.queryByRole("tab")).toBeNull();
  });
  it("uses a loading placeholder", () => {
    setup().unmount();
    state = { ...state, loading: true };
    render(<MemoryRouter><NFLBettingSplits /></MemoryRouter>);
    expect(screen.getByLabelText("Loading betting splits")).toBeTruthy();
    expect(screen.queryByRole("tab")).toBeNull();
  });
  it("registers the route in Markets & Predictions", () => {
    const markets = NFL_SECTION_NAV_CATEGORIES.find((item) => item.id === "markets");
    expect(markets?.items.find((item) => item.to === "/nfl/betting-splits")?.label).toBe("Betting Splits");
  });
});
