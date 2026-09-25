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
    expect(screen.getByText("Biggest Money Gap")).toBeTruthy();
    expect(screen.getByText(/Captured Sep 25, 2026/)).toBeTruthy();
    expect(screen.queryByText(/Captured Sep 25, 2026.*14:48/)).toBeNull();
    expect(screen.getAllByText("+25 pp").length).toBeGreaterThan(0);
    expect(screen.getAllByText("-25 pp").length).toBeGreaterThan(0);
  });
  it("shows two sides in each market and null moneyline lines", () => {
    setup();
    for (const market of ["Spread", "Moneyline", "Total"]) {
      fireEvent.click(screen.getByRole("tab", { name: market }));
      const table = screen.getByRole("region", { name: `${market.toLowerCase()} betting splits` });
      expect(within(table).getAllByRole("row").length).toBe(3);
      if (market === "Moneyline") expect(within(table).getAllByText("—").length).toBe(2);
      if (market === "Total") { expect(within(table).getByText("Over")).toBeTruthy(); expect(within(table).getByText("Under")).toBeTruthy(); }
      else { expect(within(table).getAllByText("BUF", { selector: "span" }).length).toBeGreaterThan(0); }
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
