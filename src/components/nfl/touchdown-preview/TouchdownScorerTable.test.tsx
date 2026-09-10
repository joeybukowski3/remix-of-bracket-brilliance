import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildTouchdownBoardHeat, DEFAULT_TOUCHDOWN_SORT } from "@/lib/nfl/touchdown-preview/presentation";
import type { TouchdownMetric, TouchdownPosition, TouchdownPreviewPlayer, TouchdownWindowMetrics } from "@/lib/nfl/touchdown-preview/types";
import TouchdownMetricCell from "./TouchdownMetricCell";
import TouchdownScorerTable from "./TouchdownScorerTable";

const metric = (value: number | null, percentile: number | null = value): TouchdownMetric => ({ value, percentile, rank: value == null ? null : 1, poolSize: value == null ? 0 : 2 });
function windowMetrics(): TouchdownWindowMetrics {
  return { sampleState: "available", sampleGames: 1, sampleLabel: "2025 regular season · 1 game", tdPerGame: 1, tdLast5PerGame: 1, usagePerGame: 14,
    teamUsageShare: 0.28, rzOpportunitiesPerGame: 3, inside10OpportunitiesPerGame: 2, goalLineOpportunitiesPerGame: 1, rzOpportunityShare: 0.375,
    goalLineOpportunityShare: 0.333, impliedTeamPoints: 25, opponentTdOpportunitiesPerGame: 4.1, opponentPositionTdsAllowedPerGame: 1,
    tdSuccessRate: 0.08, components: { playerUsage: metric(1, 80), tdOpportunities: metric(75, 75), teamUsage: metric(0.28, 80), tdSuccess: metric(0.08, 80),
      opponentTdOpportunities: metric(70, 70), opponentPositionTdsAllowed: metric(1, 80), impliedTeamPoints: metric(25, 80) }, jkbTdScore: 79.5, scoreRank: 1, scorePoolSize: 2 };
}
function player(overrides: Partial<TouchdownPreviewPlayer> = {}): TouchdownPreviewPlayer {
  const metrics = windowMetrics();
  const playerGame = { gameId: "2025_01_CIN_CLE", season: 2025, week: 1, date: null, team: "cin", opponent: "cle", homeAway: "away" as const,
    teamScore: 24, opponentScore: 17, carries: 1, targets: 13, scorerOpportunities: 14, teamScorerOpportunities: 50, teamRzOpportunities: 8,
    teamGoalLineOpportunities: 3, rushingTds: 0, receivingTds: 1, touchdowns: 1, rzOpportunities: 3, inside10Opportunities: 2, goalLineOpportunities: 1 };
  const opponentGame = { gameId: "2025_01_CIN_CLE", season: 2025, week: 1, date: null, defense: "cle", opponent: "cin", homeAway: "home" as const,
    defenseScore: 17, opponentScore: 24, offensiveTdsAllowed: 3, rzOpportunitiesAllowed: 6, inside10OpportunitiesAllowed: 4, goalLineOpportunitiesAllowed: 2,
    touchdownsAllowedByPosition: { QB: 0, RB: 1, WR: 2, TE: 0 } };
  return { playerId: "gsis:1", playerName: "Ja'Marr Chase", team: "cin", opponent: "cle", homeAway: "away", position: "WR", gameId: "2026_01_CIN_CLE", kickoff: null,
    impliedTeamPoints: 25, anytimeTdOdds: null, windows: { 2025: metrics, 2026: { ...metrics, sampleState: "zero", sampleGames: 0, jkbTdScore: null }, last8: metrics },
    playerHistory: [playerGame], opponentHistory: [opponentGame], ...overrides };
}

/** A player with a specific position and window-metric overrides for the active 2025 window. */
function playerWith(id: string, position: TouchdownPosition, m: Partial<TouchdownWindowMetrics>): TouchdownPreviewPlayer {
  const merged = { ...windowMetrics(), ...m };
  return player({ playerId: `gsis:${id}`, playerName: id, position, windows: { 2025: merged, 2026: merged, last8: merged } });
}

function renderTable(players: TouchdownPreviewPlayer[], sort = DEFAULT_TOUCHDOWN_SORT) {
  return render(<TouchdownScorerTable players={players} window="2025" heat={buildTouchdownBoardHeat(players, "2025")} sort={sort} onSort={vi.fn()} />);
}

describe("TouchdownScorerTable", () => {
  it("renders a reduced primary column set and contains overflow in the scroller", () => {
    renderTable([player()]);
    expect(screen.getByText("Ja'Marr Chase")).toBeInTheDocument();
    expect(screen.getByText("JKB TD Score")).toBeInTheDocument();
    expect(screen.getByTestId("touchdown-table-scroller")).toHaveClass("overflow-x-auto");
    // No 1700px+ minimum-width surface anymore; desktop min-width is modest and mobile is fluid.
    expect(screen.getByRole("table")).toHaveClass("md:min-w-[900px]");
    expect(screen.getByRole("table")).not.toHaveClass("min-w-[2010px]");
  });

  it("shows Matchup instead of separate Team/Opp columns and drops the standalone Book header", () => {
    renderTable([player()]);
    const headers = screen.getAllByRole("columnheader").map((cell) => cell.textContent?.trim());
    expect(headers).toContain("Matchup");
    expect(headers).not.toContain("Team");
    expect(headers).not.toContain("Opp");
    expect(headers).not.toContain("Book");
    // Secondary opportunity metrics are still not primary-table headers.
    expect(headers).not.toContain("RZ Opp/G");
  });

  it("replaces the Usage column with Team Usage % and adds TD/G L5, in board order", () => {
    renderTable([player()]);
    const headers = screen.getAllByRole("columnheader").map((cell) => cell.textContent?.trim());
    expect(headers).toContain("Team Usage %");
    expect(headers).toContain("TD/G L5");
    expect(headers).not.toContain("Usage");
    const order = headers.filter((h) => h && ["Player", "Matchup", "Pos", "JKB TD Score", "Anytime TD", "Mkt Implied %", "TD/G", "TD/G L5", "Team Usage %"].includes(h));
    expect(order).toEqual(["Player", "Matchup", "Pos", "JKB TD Score", "Anytime TD", "Mkt Implied %", "TD/G", "TD/G L5", "Team Usage %"]);
  });

  it("grades identical raw TD/G values with the same color regardless of position", () => {
    const players = [
      playerWith("Alpha", "WR", { tdPerGame: 1, tdLast5PerGame: 2, teamUsageShare: 0.4 }),
      playerWith("Bravo", "RB", { tdPerGame: 1, tdLast5PerGame: 3, teamUsageShare: 0.1 }),
      playerWith("Carl", "TE", { tdPerGame: 2, tdLast5PerGame: 4, teamUsageShare: 0.25 }),
    ];
    renderTable(players);
    const tdCells = screen.getAllByText("1.00");
    // One TD/G cell per row shows "1.00" (Alpha, Bravo); Carl's TD/G is "2.00".
    expect(tdCells).toHaveLength(2);
    const [a, b] = tdCells.map((el) => (el as HTMLElement).style.backgroundColor);
    expect(a).not.toBe("");
    expect(a).toBe(b);
  });

  it("renders the bookmaker as secondary text under the Anytime TD price, not as its own column", () => {
    renderTable([player({ anytimeTdOdds: 230, anytimeTdBook: "draftkings", marketImpliedProbability: 0.3, oddsSourceState: "available" })]);
    const priceCell = screen.getByText("+230").closest("td") as HTMLElement;
    expect(within(priceCell).getByText("DraftKings")).toBeInTheDocument();
    expect(screen.getAllByText("DraftKings")).toHaveLength(1);
  });

  it("expands one compact row and renders player and opponent histories vertically", () => {
    renderTable([player()]);
    fireEvent.click(screen.getByRole("button", { name: "Expand details for Ja'Marr Chase" }));
    const detail = screen.getByTestId("touchdown-player-detail");
    expect(within(detail).getByText("Player game history")).toBeInTheDocument();
    expect(within(detail).getByText("Opponent game history")).toBeInTheDocument();
    expect(within(detail).getByText("Rec TD")).toBeInTheDocument();
    expect(within(detail).getByText("Off TD Allowed")).toBeInTheDocument();
    expect(within(detail).getAllByText("Unavailable").length).toBeGreaterThan(0);
  });

  it("keeps position-relative context in the expanded detail panel", () => {
    renderTable([player()]);
    fireEvent.click(screen.getByRole("button", { name: "Expand details for Ja'Marr Chase" }));
    const detail = screen.getByTestId("touchdown-player-detail");
    expect(within(detail).getByText("Usage/G")).toBeInTheDocument();
    expect(within(detail).getAllByText(/pctile$/).length).toBeGreaterThan(0);
  });

  it("renders Anytime TD odds, book, and market implied percent for a populated player", () => {
    renderTable([player({ anytimeTdOdds: 160, anytimeTdBook: "draftkings", marketImpliedProbability: 0.3846, oddsSourceState: "available" })]);
    expect(screen.getByText("Anytime TD")).toBeInTheDocument();
    expect(screen.getByText("+160")).toBeInTheDocument();
    expect(screen.getByText("DraftKings")).toBeInTheDocument();
    expect(screen.getByText("38.5%")).toBeInTheDocument();
  });

  it("renders a safe unavailable state for a player with no Anytime TD quote", () => {
    renderTable([player({ anytimeTdOdds: null, anytimeTdBook: null, marketImpliedProbability: null })]);
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(2); // Anytime TD price, Mkt Implied %
  });

  it("keeps a compact mobile column set: hides Matchup/Pos/Mkt Implied/TD-per-game and adds an identity subline", () => {
    renderTable([player()]);
    const matchupHeader = screen.getByRole("columnheader", { name: /Matchup/ });
    expect(matchupHeader).toHaveClass("hidden");
    expect(matchupHeader).toHaveClass("md:table-cell");
    // TD/G L5 is a desktop-only column, like TD/G.
    expect(screen.getByRole("columnheader", { name: /TD\/G L5/ })).toHaveClass("hidden");
    // Team Usage % stays visible on mobile (it replaces the old Usage column).
    expect(screen.getByRole("columnheader", { name: /Team Usage %/ })).not.toHaveClass("hidden");
    // Mobile-only identity line under the player name.
    expect(screen.getByText("cin @ cle · WR", { exact: false })).toBeInTheDocument();
  });

  it("still renders a frozen suspended-odds state", () => {
    renderTable([player({ anytimeTdOdds: 145, anytimeTdBook: "fanduel", oddsSourceState: "suspended" })]);
    expect(screen.getByText("+145")).toBeInTheDocument();
    expect(screen.getByText("Suspended")).toBeInTheDocument();
  });

  it("keeps sorting controls clickable in the normal-flow header", () => {
    const onSort = vi.fn();
    render(<TouchdownScorerTable players={[player()]} window="2025" heat={buildTouchdownBoardHeat([player()], "2025")} sort={DEFAULT_TOUCHDOWN_SORT} onSort={onSort} />);
    fireEvent.click(screen.getByRole("button", { name: "Sort by JKB TD Score" }));
    expect(onSort).toHaveBeenCalledWith("score");
  });

  describe("page-scroll sticky header", () => {
    /**
     * jsdom has no layout, so stub the boxes the sticky hook measures. `theadTop`
     * < 73 with `wrapBottom` > 73 means the real header has scrolled under the
     * 72px SiteHeader while the table body is still on screen.
     */
    function primeGeometry(container: HTMLElement, { theadBottom = -10, wrapBottom = 600 } = {}) {
      const wrap = container.querySelector('[data-testid="touchdown-table"]') as HTMLElement;
      const scroller = container.querySelector('[data-testid="touchdown-table-scroller"]') as HTMLElement;
      const table = container.querySelector("table") as HTMLElement;
      const thead = table.querySelector("thead") as HTMLElement;
      const widths = [28, 120, 90, 44, 70, 70, 84, 60, 60, 90];

      wrap.getBoundingClientRect = () => rect({ top: -200, bottom: wrapBottom, height: wrapBottom + 200 });
      thead.getBoundingClientRect = () => rect({ top: theadBottom - 30, bottom: theadBottom, height: 30 });
      table.getBoundingClientRect = () => rect({ left: 0, width: 716, x: 0 });
      scroller.getBoundingClientRect = () => rect({ left: 12, width: 716, x: 12 });
      const ths = [...table.querySelectorAll("thead th")] as HTMLElement[];
      let cursor = 0;
      ths.forEach((th, i) => {
        const left = cursor;
        th.getBoundingClientRect = () => rect({ left, right: left + widths[i], width: widths[i], height: 30, x: left });
        cursor += widths[i];
      });
    }
    const rect = (partial: Partial<DOMRect>): DOMRect =>
      ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {}, ...partial }) as DOMRect;
    const clone = (c: HTMLElement) => c.querySelector('[data-testid="touchdown-sticky-header"]') as HTMLElement | null;

    it("renders the real header in normal flow, before tbody, with no sticky offset", () => {
      const { container } = renderTable([player()]);
      const table = container.querySelector("table") as HTMLElement;
      const [first, second] = [...table.children];
      expect(first.tagName).toBe("THEAD");
      expect(second.tagName).toBe("TBODY");
      // No sticky/transform/padding hack pushing the header below the first row.
      const thead = first as HTMLElement;
      expect(thead).not.toHaveClass("sticky");
      expect(thead.className).not.toMatch(/top-\[/);
      expect(thead.style.transform).toBe("");
      expect(thead.style.paddingTop).toBe("");
      // The fixed clone is not mounted until the header actually scrolls away.
      expect(clone(container)).toBeNull();
    });

    it("activates the fixed clone only after the real header scrolls under the 72px SiteHeader", async () => {
      const { container } = renderTable([player()]);
      expect(clone(container)).toBeNull();

      primeGeometry(container, { theadBottom: -10, wrapBottom: 600 });
      fireEvent(window, new Event("resize"));

      await waitFor(() => expect(clone(container)).not.toBeNull());
      expect(clone(container)!.style.top).toBe("73px");
      expect(clone(container)!.style.left).toBe("12px");
    });

    it("deactivates the clone once the table body has left the viewport", async () => {
      const { container } = renderTable([player()]);
      primeGeometry(container, { theadBottom: -10, wrapBottom: 600 });
      fireEvent(window, new Event("resize"));
      await waitFor(() => expect(clone(container)).not.toBeNull());

      // Whole table scrolled above the sticky line: wrap bottom now < 73.
      primeGeometry(container, { theadBottom: -400, wrapBottom: 40 });
      fireEvent(window, new Event("scroll"));
      await waitFor(() => expect(clone(container)).toBeNull());
    });

    it("keeps sorting clickable from the fixed clone", async () => {
      const onSort = vi.fn();
      const { container } = render(
        <TouchdownScorerTable players={[player()]} window="2025" heat={buildTouchdownBoardHeat([player()], "2025")} sort={DEFAULT_TOUCHDOWN_SORT} onSort={onSort} />,
      );
      primeGeometry(container, { theadBottom: -10, wrapBottom: 600 });
      fireEvent(window, new Event("resize"));
      await waitFor(() => expect(clone(container)).not.toBeNull());

      fireEvent.click(within(clone(container)!).getByRole("button", { name: "Sort by JKB TD Score", hidden: true }));
      expect(onSort).toHaveBeenCalledWith("score");
    });

    it("mirrors measured column widths into the clone so it aligns with tbody", async () => {
      const { container } = renderTable([player()]);
      primeGeometry(container, { theadBottom: -10, wrapBottom: 600 });
      fireEvent(window, new Event("resize"));
      await waitFor(() => expect(clone(container)).not.toBeNull());

      const cols = [...clone(container)!.querySelectorAll("colgroup col")] as HTMLElement[];
      expect(cols.map((c) => c.style.width)).toEqual(["28px", "120px", "90px", "44px", "70px", "70px", "84px", "60px", "60px", "90px"]);
    });
  });

  it("uses bettor-perspective canonical heat and gives missing values no fake heat", () => {
    const { rerender } = render(<TouchdownMetricCell value={4} percentile={90} />);
    const favorable = screen.getByText("4.00");
    expect(favorable).toHaveStyle({ backgroundColor: "#10b981" });
    rerender(<TouchdownMetricCell value={1} percentile={5} />);
    expect(screen.getByText("1.00")).toHaveStyle({ backgroundColor: "#dc2626" });
    rerender(<TouchdownMetricCell value={null} percentile={null} />);
    expect(screen.getByText("N/A")).toHaveClass("text-slate-400");
    expect(screen.getByText("N/A")).toHaveAttribute("title", "Unavailable from current source data");
  });
});
