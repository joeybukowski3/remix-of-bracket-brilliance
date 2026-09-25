import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import MatchupBettingSplits from "./MatchupBettingSplits";
import type { NflDkSplitsAvailability } from "@/lib/nfl/bettingSplitsData";
import type { NflMatchup } from "@/lib/nfl/matchups";

const matchup = { gameId: "2026_03_BUF_MIA", season: 2026, week: 3 } as NflMatchup;
const game = { gameId: matchup.gameId, away: "buf", home: "mia", markets: {
  spread: [{ side: "away", team: "buf", line: -2.5, odds: -118, handlePct: 96, betsPct: 82 }, { side: "home", team: "mia", line: 2.5, odds: -102, handlePct: 4, betsPct: 18 }],
  moneyline: [{ side: "away", team: "buf", line: null, odds: 120, handlePct: 60, betsPct: 45 }, { side: "home", team: "mia", line: null, odds: -140, handlePct: 40, betsPct: 55 }],
  total: [{ side: "over", line: 45.5, odds: -110, handlePct: 75, betsPct: 50 }, { side: "under", line: 45.5, odds: 100, handlePct: 25, betsPct: 50 }],
} };
const artifact = { games: [game] } as unknown as NonNullable<NflDkSplitsAvailability["artifact"]>;
let state: ReturnType<typeof import("@/hooks/useNflBettingSplits")["useNflBettingSplits"]>;
const hook = vi.fn(() => state);
vi.mock("@/hooks/useNflBettingSplits", () => ({ useNflBettingSplits: () => hook() }));

function setup(overrides: Partial<typeof state> = {}) {
  state = { loading: false, error: null, freshness: "fresh", reason: null, artifact,
    sourceCapturedAt: "2026-09-25T14:47:13.329Z", generatedAt: "2026-09-25T14:48:00.000Z",
    ageMs: 1000, source: "DraftKings Network / DraftKings Sportsbook", season: 2026, week: 3, ...overrides };
  return render(<MatchupBettingSplits matchup={matchup} />);
}

describe("matchup betting splits", () => {
  it("shows both outcomes in all markets with shared formatting and signals", () => {
    setup();
    const spread = screen.getByRole("region", { name: "Spread betting splits" });
    const moneyline = screen.getByRole("region", { name: "Moneyline betting splits" });
    const total = screen.getByRole("region", { name: "Total betting splits" });
    expect(within(spread).getByText("BUF")).toBeTruthy();
    expect(within(spread).getByText("MIA")).toBeTruthy();
    expect(within(spread).getByText(/-2.5/)).toBeTruthy();
    expect(within(spread).getByText(/\+2.5/)).toBeTruthy();
    expect(within(spread).getByText(/-118/)).toBeTruthy();
    expect(within(spread).getAllByText(/Handle/)).toHaveLength(2);
    expect(within(spread).getAllByText(/Bets/)).toHaveLength(2);
    expect(within(spread).getAllByText(/Money Gap/).length).toBeGreaterThan(0);
    expect(within(spread).getByText("+14 pp")).toBeTruthy();
    expect(within(spread).getByText("-14 pp")).toBeTruthy();
    expect(within(spread).getByText("Money Lean")).toBeTruthy();
    expect(within(spread).getByText("Public Heavy")).toBeTruthy();
    expect(within(moneyline).getByText(/\+120/)).toBeTruthy();
    expect(within(moneyline).getByText(/-140/)).toBeTruthy();
    expect(within(moneyline).getByText("+15 pp")).toBeTruthy();
    expect(within(total).getByText("Over")).toBeTruthy();
    expect(within(total).getByText("Under")).toBeTruthy();
    expect(within(total).getAllByText(/45.5/)).toHaveLength(2);
    expect(within(total).getByText("Strong Money Gap")).toBeTruthy();
    expect(screen.getAllByText("JKB Sharp Side").length).toBeGreaterThan(0);
    expect(screen.getByText(/DraftKings does not identify professional bettors/)).toBeTruthy();
    expect(screen.getByText(/Sep 25, 2026/)).toBeTruthy();
    expect(screen.getByText(/Sep 25, 2026/).getAttribute("datetime")).toBe("2026-09-25T14:47:13.329Z");
    expect(hook).toHaveBeenCalled();
  });

  it("keeps stale data visible with the capture time", () => {
    setup({ freshness: "stale", reason: "age" });
    expect(screen.getByText(/Stale snapshot/)).toBeTruthy();
    expect(screen.getByRole("region", { name: "Spread betting splits" })).toBeTruthy();
  });

  it("separates full-artifact unavailability from an absent matchup", () => {
    const view = setup({ freshness: "unavailable", artifact: null });
    expect(screen.getByText("Betting splits are currently unavailable.")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Spread betting splits" })).toBeNull();
    view.unmount();
    setup({ artifact: { ...artifact, games: [{ ...game, gameId: "2026_03_NYJ_NE" }] } as typeof artifact });
    expect(screen.getByText("Betting splits are not available for this matchup in the current pregame snapshot.")).toBeTruthy();
    expect(screen.queryByText("Betting splits are currently unavailable.")).toBeNull();
  });

  it("shows a compact loading state", () => {
    setup({ loading: true, artifact: null });
    expect(screen.getByText("Loading betting splits…")).toBeTruthy();
  });
});
