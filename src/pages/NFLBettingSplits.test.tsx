import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NFLBettingSplits from "./NFLBettingSplits";
import { NFL_SECTION_NAV_CATEGORIES } from "@/lib/nfl/sectionNav";
import type { NflDkSplitsAvailability } from "@/lib/nfl/bettingSplitsData";
import { moneyGap } from "@/lib/nfl/bettingSplitsData";

const artifact = {
  games: [
    { gameId: "2026_03_BUF_MIA", away: "buf", home: "mia", markets: {
      spread: [{ side: "away", team: "buf", line: -2.5, odds: -110, handlePct: 75, betsPct: 50 }, { side: "home", team: "mia", line: 2.5, odds: -110, handlePct: 25, betsPct: 50 }],
      moneyline: [{ side: "away", team: "buf", line: null, odds: -140, handlePct: 80, betsPct: 45 }, { side: "home", team: "mia", line: null, odds: 120, handlePct: 20, betsPct: 55 }],
      total: [{ side: "over", line: 45.5, odds: -110, handlePct: 65, betsPct: 35 }, { side: "under", line: 45.5, odds: -110, handlePct: 35, betsPct: 65 }],
    } },
    { gameId: "2026_03_LAC_SEA", away: "lac", home: "sea", markets: {
      spread: [{ side: "away", team: "lac", line: 7, odds: -110, handlePct: 51, betsPct: 80 }, { side: "home", team: "sea", line: -7, odds: -110, handlePct: 49, betsPct: 20 }],
      moneyline: [{ side: "away", team: "lac", line: null, odds: 240, handlePct: 50, betsPct: 50 }, { side: "home", team: "sea", line: null, odds: -300, handlePct: 50, betsPct: 50 }],
      total: [{ side: "over", line: 42.5, odds: -110, handlePct: 50, betsPct: 50 }, { side: "under", line: 42.5, odds: -110, handlePct: 50, betsPct: 50 }],
    } },
  ],
} as unknown as NonNullable<NflDkSplitsAvailability["artifact"]>;
let state: ReturnType<typeof import("@/hooks/useNflBettingSplits")["useNflBettingSplits"]>;
vi.mock("@/hooks/useCurrentNflWeek", () => ({ useCurrentNflWeek: () => ({ loading: false, week: 3, error: null }) }));
vi.mock("@/hooks/useNflBettingSplits", () => ({ useNflBettingSplits: () => state }));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
function setup(freshness: NflDkSplitsAvailability["freshness"] = "fresh") {
  state = { loading: false, error: null, freshness, reason: freshness === "stale" ? "age" : null, artifact: freshness === "unavailable" ? null : artifact, sourceCapturedAt: freshness === "unavailable" ? null : "2026-09-25T14:47:13.329Z", generatedAt: "2026-09-25T14:48:00.000Z", ageMs: 1000, source: "DraftKings Network / DraftKings Sportsbook", season: 2026, week: 3 };
  return render(<MemoryRouter><NFLBettingSplits /></MemoryRouter>);
}
function ranking(name: "Money" | "Tickets") {
  return screen.getByRole("region", { name: `${name} ranking` });
}
function bodyRows(name: "Money" | "Tickets") {
  return within(ranking(name)).getAllByRole("row").slice(1);
}

describe("NFL Betting Splits presentation", () => {
  it("renders one desktop overview row per game, logos, and the source capture time", () => {
    setup();
    expect(screen.getByRole("heading", { name: "NFL Betting Splits" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("status").textContent).toContain("Captured Sep 25, 2026");
    expect(screen.getByRole("status").textContent).toContain("10:47 AM");
    expect(screen.getByRole("status").textContent).not.toContain("10:48 AM");
    const table = screen.getByRole("region", { name: "Overview matchup distribution" });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(table.querySelectorAll('img[src$="/buf.png"]')).toHaveLength(1);
    expect(table.querySelectorAll('img[src$="/sea.png"]')).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Overview matchup cards" }).querySelectorAll("article")).toHaveLength(2);
  });
  it("keeps Money and Tickets on the displayed side and retains signed gaps", () => {
    setup();
    const table = screen.getByRole("region", { name: "Overview matchup distribution" });
    const [buf, lac] = within(table).getAllByRole("row").slice(1);
    expect(within(buf).getByRole("img", { name: "Money 75%" })).toBeTruthy();
    expect(within(buf).getByRole("img", { name: "Tickets 50%" })).toBeTruthy();
    expect(buf.textContent).toContain("+25 pp");
    expect(lac.textContent).toContain("-29 pp");
    expect(moneyGap(artifact.games[1].markets.spread[0])).toBe(-29);
    expect(artifact.games[1].markets.spread[0].handlePct).toBe(51);
    expect(artifact.games[1].markets.spread[0].betsPct).toBe(80);
  });
  it("shows the strongest existing qualifying sharp side and its source percentages", () => {
    setup();
    const table = screen.getByRole("region", { name: "Overview matchup distribution" });
    const [buf, lac] = within(table).getAllByRole("row").slice(1);
    expect(buf.textContent).toContain("BUF ML+35 pp");
    expect(buf.textContent).toContain("80% of money on 45% of tickets");
    expect(lac.textContent).toContain("SEA -7+29 pp");
  });
  it("ranks both spread sides independently and switches the mobile share view", () => {
    setup();
    fireEvent.click(screen.getByRole("tab", { name: "Spread" }));
    expect(bodyRows("Money")).toHaveLength(4);
    expect(bodyRows("Tickets")).toHaveLength(4);
    expect(bodyRows("Money")[0].textContent).toContain("BUF");
    expect(bodyRows("Money")[0].textContent).toContain("75%");
    expect(bodyRows("Tickets")[0].textContent).toContain("LAC");
    expect(bodyRows("Tickets")[0].textContent).toContain("80%");
    expect(ranking("Money").querySelectorAll('img[src$="/buf.png"]')).toHaveLength(1);
    expect(within(ranking("Money")).getByAltText("BUF").getAttribute("src")).toBe("https://a.espncdn.com/i/teamlogos/nfl/500/buf.png");
    fireEvent.click(screen.getByRole("button", { name: "Tickets" }));
    expect(screen.getByRole("button", { name: "Tickets" }).getAttribute("aria-pressed")).toBe("true");
  });
  it("sorts highest, lowest, alphabetically, and by signed spread value", () => {
    setup();
    fireEvent.click(screen.getByRole("tab", { name: "Spread" }));
    const select = screen.getByRole("combobox", { name: "Sort ranking rows" });
    expect(bodyRows("Money")[0].textContent).toContain("BUF");
    fireEvent.change(select, { target: { value: "lowest" } });
    expect(bodyRows("Money")[0].textContent).toContain("MIA");
    fireEvent.change(select, { target: { value: "az" } });
    expect(bodyRows("Money").map((row) => row.textContent?.match(/BUF|LAC|MIA|SEA/)?.[0])).toEqual(["BUF", "LAC", "MIA", "SEA"]);
    fireEvent.change(select, { target: { value: "value-high" } });
    expect(bodyRows("Money")[0].textContent).toContain("LAC");
    expect(bodyRows("Money")[0].textContent).toContain("+7");
    fireEvent.change(select, { target: { value: "value-low" } });
    expect(bodyRows("Money")[0].textContent).toContain("SEA");
    expect(bodyRows("Money")[0].textContent).toContain("-7");
  });
  it("ranks both moneyline team sides with ML-specific price sorting", () => {
    setup();
    fireEvent.click(screen.getByRole("tab", { name: "Moneyline" }));
    expect(bodyRows("Money")).toHaveLength(4);
    expect(bodyRows("Money")[0].textContent).toContain("BUF");
    expect(bodyRows("Money")[0].textContent).toContain("-140");
    fireEvent.change(screen.getByRole("combobox", { name: "Sort ranking rows" }), { target: { value: "value-high" } });
    expect(bodyRows("Money")[0].textContent).toContain("LAC");
    expect(bodyRows("Money")[0].textContent).toContain("+240");
  });
  it("ranks Over and Under without treating totals as team sides", () => {
    setup();
    fireEvent.click(screen.getByRole("tab", { name: "Total" }));
    expect(bodyRows("Money")).toHaveLength(4);
    expect(bodyRows("Money")[0].textContent).toContain("Over");
    expect(bodyRows("Money")[0].textContent).toContain("65%");
    expect(bodyRows("Tickets")[0].textContent).toContain("Under");
    expect(bodyRows("Tickets")[0].textContent).toContain("65%");
    expect(ranking("Money").querySelectorAll("img")).toHaveLength(0);
  });
  it("keeps stale data visible, unavailable data hidden, and the route registered", () => {
    const view = setup("stale");
    expect(screen.getByRole("alert").textContent).toContain("Stale betting splits");
    expect(screen.getByRole("tab", { name: "Overview" })).toBeTruthy();
    view.unmount();
    setup("unavailable");
    expect(screen.getByText("Betting splits unavailable")).toBeTruthy();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(NFL_SECTION_NAV_CATEGORIES.find((item) => item.id === "markets")?.items.find((item) => item.to === "/nfl/betting-splits")?.label).toBe("Betting Splits");
  });
});
