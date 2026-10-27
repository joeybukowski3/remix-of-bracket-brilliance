import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import PropsBoardView from "@/components/nba/PropsBoardView";
import { buildDemoBoard } from "@/lib/nba/props/__fixtures__/boardDemo";
import { COLUMN_PREFERENCE_KEY } from "@/lib/nba/props/boardColumns";
import { buildBoardRows, type BoardMarket, type PropsBoardArtifact } from "@/lib/nba/props/propsBoard";

vi.setConfig({ testTimeout: 30_000 });

const stubViewport = (wide: boolean) =>
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: wide, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));

beforeEach(() => {
  localStorage.clear();
  stubViewport(true);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const board = buildDemoBoard();
const rowOf = (name: string): HTMLElement => screen.getByRole("rowheader", { name: new RegExp(name) }).closest("tr") as HTMLElement;
const col = (name: string, id: string): HTMLElement => within(rowOf(name)).getByTestId(`col-${id}`);
const toggleOf = (name: string): HTMLElement => within(rowOf(name)).getByTestId("row-toggle");
const isOpen = (name: string): boolean => rowOf(name).getAttribute("aria-expanded") === "true";
const detailOf = (name: string): HTMLElement | null => (isOpen(name) ? (rowOf(name).nextElementSibling as HTMLElement) : null);
const open = (name: string): HTMLElement => {
  if (!isOpen(name)) fireEvent.click(rowOf(name));
  return rowOf(name).nextElementSibling as HTMLElement;
};
const headers = (): string[] => screen.getAllByRole("columnheader").map((h) => h.textContent?.replace(/\s+/g, " ").trim() ?? "");
const showMarket = (label: "Points" | "Rebounds" | "Assists") => fireEvent.click(screen.getByRole("button", { name: label }));
const rowsFor = (market: BoardMarket) => buildBoardRows(board, market);
const rowData = (name: string, market: BoardMarket = "pts") => {
  const row = rowsFor(market).find((r) => r.entry.playerName === name);
  if (!row) throw new Error(`no row for ${name}`);
  return row;
};
const renderWith = (columns: readonly string[], b: PropsBoardArtifact = board) => {
  localStorage.setItem(COLUMN_PREFERENCE_KEY, JSON.stringify({ version: 1, columns }));
  return render(<PropsBoardView board={b} />);
};
const text = (el: Element): string => el.textContent?.replace(/\s+/g, " ").trim() ?? "";
/** The figure a pill shows, without the screen-reader sentence after it. */
const shown = (el: Element): string => el.firstChild?.textContent ?? "";
/** A subtotal cell as a number, or null for the dash that stands for missing data. */
const figure = (el: Element): number | null => (text(el) === "–" ? null : Number(text(el)));

describe("the whole player row opens and closes its detail", () => {
  it("opens from a click on any cell, not only the arrow, and closes from a second click", () => {
    render(<PropsBoardView board={board} />);
    expect(isOpen("Demo Guard One")).toBe(false);
    fireEvent.click(col("Demo Guard One", "mpg"));
    expect(isOpen("Demo Guard One")).toBe(true);
    expect(screen.getByTestId("row-detail")).toBeInTheDocument();
    fireEvent.click(col("Demo Guard One", "jkbProjection"));
    expect(isOpen("Demo Guard One")).toBe(false);
    expect(screen.queryByTestId("row-detail")).toBeNull();
    fireEvent.click(within(rowOf("Demo Guard One")).getByTestId("player-name"));
    expect(isOpen("Demo Guard One")).toBe(true);
  });

  it("keeps the chevron, which turns with the state and still opens the row once (not twice)", () => {
    render(<PropsBoardView board={board} />);
    const chevron = () => toggleOf("Demo Guard One").querySelector("svg") as SVGElement;
    expect(chevron().getAttribute("class")).not.toMatch(/rotate-90/);
    fireEvent.click(toggleOf("Demo Guard One"));
    expect(isOpen("Demo Guard One")).toBe(true);
    expect(toggleOf("Demo Guard One")).toHaveAttribute("aria-expanded", "true");
    expect(chevron().getAttribute("class")).toMatch(/rotate-90/);
    fireEvent.click(toggleOf("Demo Guard One"));
    expect(isOpen("Demo Guard One")).toBe(false);
    expect(chevron().getAttribute("class")).not.toMatch(/rotate-90/);
  });

  it("opens with Enter or Space on the focused row, and ignores other keys", () => {
    render(<PropsBoardView board={board} />);
    const row = rowOf("Demo Wing Two");
    expect(row).toHaveAttribute("tabindex", "0");
    row.focus();
    expect(document.activeElement).toBe(row);
    fireEvent.keyDown(row, { key: "Enter" });
    expect(isOpen("Demo Wing Two")).toBe(true);
    fireEvent.keyDown(row, { key: " " });
    expect(isOpen("Demo Wing Two")).toBe(false);
    for (const key of ["a", "Tab", "ArrowDown", "Escape"]) fireEvent.keyDown(row, { key });
    expect(isOpen("Demo Wing Two")).toBe(false);
    // Space is the row's own here, so the page must not scroll.
    expect(fireEvent.keyDown(row, { key: " " })).toBe(false);
  });

  it("announces the state on the row and points to its detail, and has one tab stop per row (the row, not the chevron)", () => {
    render(<PropsBoardView board={board} />);
    expect(rowOf("Demo Guard One")).toHaveAttribute("aria-expanded", "false");
    expect(rowOf("Demo Guard One")).not.toHaveAttribute("aria-controls");
    expect(toggleOf("Demo Guard One")).toHaveAttribute("tabindex", "-1");
    expect(toggleOf("Demo Guard One").getAttribute("aria-label")).toBe("Show details and minutes for Demo Guard One");
    open("Demo Guard One");
    expect(document.getElementById(rowOf("Demo Guard One").getAttribute("aria-controls") ?? "")).toBe(screen.getByTestId("row-detail"));
  });

  it("gives the row a pointer cursor, a hover wash and a visible focus ring", () => {
    render(<PropsBoardView board={board} />);
    const cls = rowOf("Demo Guard One").className;
    expect(cls).toMatch(/\bcursor-pointer\b/);
    expect(cls).toMatch(/hover:bg-sky-50/);
    expect(cls).toMatch(/focus-visible:outline-2/);
  });

  it("does not open when the minutes field, its reset button or a sort header is used", () => {
    renderWith(["mpg", "userMinutes"]);
    const input = within(col("Demo Guard One", "userMinutes")).getByTestId("minutes-input");
    fireEvent.click(input);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "36" } });
    // Typing a space or Enter in the field belongs to the field.
    fireEvent.keyDown(input, { key: " " });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(isOpen("Demo Guard One")).toBe(false);
    fireEvent.click(within(col("Demo Guard One", "userMinutes")).getByTestId("reset-minutes"));
    expect(isOpen("Demo Guard One")).toBe(false);
    expect((input as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "MPG" }));
    expect(screen.queryByTestId("row-detail")).toBeNull();
    // The column controls outside the table never reach a row either.
    fireEvent.click(screen.getByTestId("columns-menu-trigger"));
    expect(screen.queryByTestId("row-detail")).toBeNull();
  });

  it("does not open while the viewer is selecting text in the row", () => {
    render(<PropsBoardView board={board} />);
    const cell = col("Demo Guard One", "mpg");
    vi.spyOn(window, "getSelection").mockReturnValue({ isCollapsed: false, anchorNode: cell.firstChild ?? cell } as unknown as Selection);
    fireEvent.click(cell);
    expect(isOpen("Demo Guard One")).toBe(false);
    vi.restoreAllMocks();
    fireEvent.click(cell);
    expect(isOpen("Demo Guard One")).toBe(true);
  });

  it("keeps its detail open through sorting and filtering, and works on every row independently", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard One");
    open("Demo Big Four");
    fireEvent.click(screen.getByRole("button", { name: "MPG" }));
    expect(isOpen("Demo Guard One")).toBe(true);
    expect(isOpen("Demo Big Four")).toBe(true);
    expect(isOpen("Demo Wing Two")).toBe(false);
    fireEvent.change(screen.getByPlaceholderText("Search"), { target: { value: "Guard" } });
    expect(isOpen("Demo Guard One")).toBe(true);
    expect(screen.queryByRole("rowheader", { name: /Demo Big Four/ })).toBeNull();
  });

  it("opens by row on a phone too, where the detail carries the minutes field", () => {
    stubViewport(false);
    render(<PropsBoardView board={board} />);
    const detail = open("Demo Guard One");
    expect(within(detail).getByLabelText(/Your projected minutes for Demo Guard One,/)).toBeInTheDocument();
  });
});

describe("numeric columns are centered; identity stays left", () => {
  it("centers every default column's header and every value, with tabular numerals, and left-aligns the player", () => {
    render(<PropsBoardView board={board} />);
    const head = screen.getAllByRole("columnheader");
    expect(head[0].className).toMatch(/\btext-left\b/);
    for (const th of head.slice(1)) expect(th.className, text(th)).toMatch(/\btext-center\b/);
    for (const id of ["mpg", "perGame", "perMinute", "last10", "oppLast10", "matchup", "line", "jkbProjection"]) {
      const cell = col("Demo Guard One", id);
      expect(cell.className, id).toMatch(/\btext-center\b/);
      expect(cell.className, id).not.toMatch(/text-right/);
      expect(cell.className, id).toMatch(/\btabular-nums\b/);
      expect(screen.getByTestId(`head-${id}`).className, id).toMatch(/\btext-center\b/);
    }
    expect(within(rowOf("Demo Guard One")).getByTestId("player-cell").className).toMatch(/\btext-left\b/);
  });

  it("centers the sort buttons in the headers, so the label sits over its values", () => {
    render(<PropsBoardView board={board} />);
    for (const id of ["mpg", "line", "jkbProjection"]) expect(within(screen.getByTestId(`head-${id}`)).getByRole("button").className).toMatch(/justify-center/);
  });

  it("centers the optional columns when they are shown, including the minutes field and the adjusted values", () => {
    renderWith(["dvpAllowed", "overUnder", "modelEdge", "jkbMinutes", "userMinutes", "adjustedProjection", "adjustedDifference", "seasonRateEstimate", "jkbTriple"]);
    for (const id of ["dvpAllowed", "overUnder", "modelEdge", "jkbMinutes", "userMinutes", "adjustedProjection", "adjustedDifference", "seasonRateEstimate", "jkbTriple"]) {
      expect(col("Demo Guard One", id).className, id).toMatch(/\btext-center\b/);
      expect(screen.getByTestId(`head-${id}`).className, id).toMatch(/\btext-center\b/);
    }
    expect(within(col("Demo Guard One", "userMinutes")).getByTestId("minutes-input").className).toMatch(/\btext-center\b/);
  });

  it("keeps decimal precision exactly as before", () => {
    render(<PropsBoardView board={board} />);
    expect(col("Demo Guard One", "mpg").textContent).toBe("33.8");
    expect(col("Demo Guard One", "perMinute").textContent).toBe((25.4 / 33.8).toFixed(2));
    expect(col("Demo Guard One", "jkbProjection").textContent).toBe("26.1");
    expect(col("Demo Guard One", "line").textContent).toBe("24.5");
  });

  it("keeps column sorting accessible: aria-sort on the header, a named button in it", () => {
    render(<PropsBoardView board={board} />);
    expect(screen.getByTestId("head-jkbProjection")).toHaveAttribute("aria-sort", "descending");
    fireEvent.click(within(screen.getByTestId("head-line")).getByRole("button", { name: /Vegas Line/ }));
    expect(screen.getByTestId("head-line")).toHaveAttribute("aria-sort", "descending");
    expect(screen.getByTestId("head-jkbProjection")).toHaveAttribute("aria-sort", "none");
  });
});

describe("Vegas Line", () => {
  it("is a default column immediately before JKB projection, headed Vegas Line", () => {
    render(<PropsBoardView board={board} />);
    const h = headers();
    expect(h[h.indexOf("JKB proj") - 1]).toBe("Vegas Line");
    expect(h.indexOf("Vegas Line")).toBeGreaterThan(h.indexOf("Matchup"));
  });

  it("shows the selected market's own line from the board, and switches with the market", () => {
    render(<PropsBoardView board={board} />);
    expect(col("Demo Guard One", "line").textContent).toBe("24.5");
    showMarket("Rebounds");
    expect(col("Demo Guard One", "line").textContent).toBe("3.5");
    showMarket("Assists");
    expect(col("Demo Guard One", "line").textContent).toBe("8.5");
    showMarket("Points");
    expect(col("Demo Guard One", "line").textContent).toBe("24.5");
  });

  it("shows exactly the board's line for every row of every market, or N/A, and nothing else", () => {
    render(<PropsBoardView board={board} />);
    for (const market of ["pts", "reb", "ast"] as const) {
      showMarket(market === "pts" ? "Points" : market === "reb" ? "Rebounds" : "Assists");
      for (const row of rowsFor(market)) {
        const shown = text(col(row.entry.playerName, "line"));
        expect(shown, `${row.entry.playerName} ${market}`).toBe(row.entry.line ? row.entry.line.line.toFixed(1) : "N/A");
      }
    }
  });

  it("shows N/A, with the reason on hover, where the board has no line to show", () => {
    render(<PropsBoardView board={board} />);
    expect(col("Demo Bench Seven", "line").textContent).toBe("N/A");
    expect(col("Demo Bench Seven", "line").querySelector("[title]")?.getAttribute("title")).toBe("no line posted");
  });

  it("shows N/A on every row of a board whose lines were withheld, as a private preview's are, and never a number", () => {
    const withheld: PropsBoardArtifact = { ...board, entries: board.entries.map((e) => ({ ...e, line: null, lineWithheldReason: "no sportsbook line in a private preview" })) };
    render(<PropsBoardView board={withheld} />);
    for (const row of buildBoardRows(withheld, "pts")) {
      expect(text(col(row.entry.playerName, "line"))).toBe("N/A");
      expect(col(row.entry.playerName, "line").querySelector("[title]")?.getAttribute("title")).toBe("no sportsbook line in a private preview");
    }
    expect(screen.queryByTestId("vegas-line-value")).toBeNull();
  });

  it("still shows when the viewer's saved choice names no columns, and cannot be switched off in the Columns menu", () => {
    renderWith([]);
    expect(headers()).toEqual(["Player", "Vegas Line"]);
    fireEvent.click(screen.getByTestId("columns-menu-trigger"));
    expect(screen.getByTestId("column-toggle-line")).toBeChecked();
    expect(screen.getByTestId("column-toggle-line")).toBeDisabled();
    expect(screen.getByTestId("columns-menu-trigger").textContent).toContain("(1)");
  });

  it("lets the existing JKB-minus-line difference work whenever a line is present, and be N/A when not", () => {
    renderWith(["modelEdge"]);
    const guard = rowData("Demo Guard One");
    expect(guard.difference).toBeCloseTo(26.1 - 24.5);
    expect(col("Demo Guard One", "modelEdge").textContent).toBe("+1.6");
    expect(col("Demo Bench Seven", "modelEdge").textContent).toBe("N/A");
  });

  it("is sortable, with players that have no line last in either direction", () => {
    render(<PropsBoardView board={board} />);
    const order = () => screen.getAllByTestId("player-name").map((n) => n.textContent);
    fireEvent.click(within(screen.getByTestId("head-line")).getByRole("button"));
    const withLine = rowsFor("pts").filter((r) => r.entry.line).sort((a, b) => (b.entry.line?.line ?? 0) - (a.entry.line?.line ?? 0) || a.entry.entryKey.localeCompare(b.entry.entryKey));
    expect(order().slice(0, withLine.length)).toEqual(withLine.map((r) => r.entry.playerName));
    expect(order().at(-1)).toBe("Demo Bench Seven");
    fireEvent.click(within(screen.getByTestId("head-line")).getByRole("button"));
    expect(order().at(-1)).toBe("Demo Bench Seven");
  });

  it("marks a stale line instead of presenting it as current", () => {
    const stale: PropsBoardArtifact = { ...board, entries: board.entries.map((e) => (e.line ? { ...e, line: { ...e.line, freshness: "stale" as const, ageMinutes: 600 } } : e)) };
    render(<PropsBoardView board={stale} />);
    expect(within(col("Demo Guard One", "line")).getByRole("img", { name: /stale/i })).toBeInTheDocument();
    cleanup();
    render(<PropsBoardView board={board} />);
    expect(within(col("Demo Guard One", "line")).queryByRole("img")).toBeNull();
  });

  it("is one of the three phone columns, beside the matchup and the projection", () => {
    render(<PropsBoardView board={board} />);
    for (const id of ["line", "jkbProjection", "matchup"]) expect(col("Demo Guard One", id).className, id).not.toMatch(/\bhidden\b/);
    for (const id of ["mpg", "perGame", "perMinute", "last10", "oppLast10"]) expect(col("Demo Guard One", id).className, id).toMatch(/\bhidden\b/);
    // The detail carries what the table leaves out on a phone, the line and L10 included.
    const detail = open("Demo Guard One");
    expect(within(detail).getByTestId("detail-line").textContent).toBe("24.5");
    expect(within(detail).getByTestId("detail-last10").textContent).toBe(col("Demo Guard One", "last10").textContent);
    expect(within(detail).getByTestId("detail-matchup").textContent).toBe(col("Demo Guard One", "matchup").textContent);
  });

  it("makes no network request", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<PropsBoardView board={board} />);
    showMarket("Rebounds");
    open("Demo Guard One");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("Player Last 10 box-score table", () => {
  const table = (name: string) => within(open(name)).getByTestId("player-box-table");
  const bodyRows = (name: string) => within(table(name)).getAllByTestId("player-box-row");

  it("sits under the charts, in the row detail, with one row per completed game", () => {
    render(<PropsBoardView board={board} />);
    const detail = open("Demo Guard One");
    const chart = within(detail).getByTestId("player-l10-chart");
    const card = within(detail).getByTestId("player-box-card");
    expect(chart.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bodyRows("Demo Guard One")).toHaveLength(10);
  });

  it("lists the games newest to oldest, all before this game, each the player's own completed game", () => {
    render(<PropsBoardView board={board} />);
    const { playerL10 } = rowData("Demo Guard One");
    const expected = [...playerL10.recent].reverse();
    const rows = bodyRows("Demo Guard One");
    expect(rows).toHaveLength(expected.length);
    const dates = expected.map((g) => g.date);
    expect(dates).toEqual([...dates].sort().reverse());
    // The game is on 2026-11-09: nothing on or after it may appear (no future-game leakage).
    expect(dates.every((d) => d < "2026-11-09")).toBe(true);
    rows.forEach((tr, i) => {
      const cells = within(tr).getAllByRole("cell");
      expect(text(cells[0])).toMatch(/^[A-Z][a-z]{2} \d+$/);
      expect(text(cells[1])).toContain(expected[i].opponent);
      expect(tr.querySelector("[data-testid='box-home-away']")?.getAttribute("data-site")).toBe(expected[i].isHome ? "home" : "away");
      expect(text(cells[3])).toBe(String(expected[i].minutes));
      expect(text(cells[4])).toBe(String(expected[i].pts));
      expect(text(cells[5])).toBe(String(expected[i].reb));
      expect(text(cells[6])).toBe(String(expected[i].ast));
    });
  });

  it("shows the final score as W or L where known and a dash where it is not", () => {
    render(<PropsBoardView board={board} />);
    const { playerL10 } = rowData("Demo Guard One");
    const shown = bodyRows("Demo Guard One").map((tr) => within(tr).getByTestId("box-result").getAttribute("data-result"));
    expect(shown).toEqual([...playerL10.recent].reverse().map((g) => (g.result ? (g.result.won ? "W" : "L") : "unknown")));
    expect(shown).toContain("unknown");
    expect(shown).toContain("W");
    expect(shown).toContain("L");
  });

  it("averages the window in a footer row that matches the L10 column and the chart", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard One");
    const avg = within(screen.getByTestId("player-box-average"));
    const { playerBox, playerL10 } = rowData("Demo Guard One");
    expect(playerBox.average?.pts).toBeCloseTo(playerL10.average ?? NaN);
    expect(text(screen.getByTestId("player-box-average"))).toContain("L10 avg");
    expect(text(screen.getByTestId("player-box-average"))).toContain((playerL10.average ?? NaN).toFixed(1));
    expect(avg.getByTestId("player-box-record").textContent).toMatch(/^\d+–\d+$/);
  });

  it("follows the market: the result column, the highlighted stat and the average all switch together", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard One");
    expect(within(table("Demo Guard One")).getByRole("columnheader", { name: /PTS vs line/ })).toBeInTheDocument();
    showMarket("Rebounds");
    open("Demo Guard One");
    const t = within(screen.getByTestId("player-box-table"));
    expect(t.getByRole("columnheader", { name: /REB vs line/ })).toBeInTheDocument();
    expect(t.getByRole("columnheader", { name: "REB" }).className).toMatch(/bg-blue-50/);
    expect(t.getByRole("columnheader", { name: "PTS" }).className).not.toMatch(/bg-blue-50/);
    const { playerL10 } = rowData("Demo Guard One", "reb");
    const first = [...playerL10.recent].reverse()[0];
    expect(shown(within(screen.getAllByTestId("player-box-row")[0]).getByTestId("box-selected"))).toBe(String(first.reb));
    expect(text(screen.getByTestId("player-box-average"))).toContain((playerL10.average ?? NaN).toFixed(1));
  });

  it("reads each game's result against the Vegas line in words and color, and just shows the figure when there is no line", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard One");
    const line = 24.5;
    const { playerL10 } = rowData("Demo Guard One");
    const expected = [...playerL10.recent].reverse().map((g) => (g.pts > line ? "over" : g.pts < line ? "under" : "push"));
    const shown = screen.getAllByTestId("player-box-row").map((tr) => within(tr).getByTestId("box-selected").getAttribute("data-line-result"));
    expect(shown).toEqual(expected);
    const first = within(screen.getAllByTestId("player-box-row")[0]).getByTestId("box-selected");
    expect(first.textContent).toContain(`the 24.5 PTS line`);
    // A player with no posted line: figures only, nothing compared to an invented line.
    const noLine: PropsBoardArtifact = { ...board, entries: board.entries.map((e) => ({ ...e, line: null, lineWithheldReason: "no sportsbook line in a private preview" })) };
    cleanup();
    render(<PropsBoardView board={noLine} />);
    open("Demo Guard One");
    expect(within(screen.getByTestId("player-box-table")).getByRole("columnheader", { name: /PTS result/ })).toBeInTheDocument();
    for (const tr of screen.getAllByTestId("player-box-row")) expect(within(tr).getByTestId("box-selected").getAttribute("data-line-result")).toBe("none");
  });

  it("is honest about a short window, no games, and a board built before box scores existed", () => {
    render(<PropsBoardView board={board} />);
    expect(bodyRows("Demo Wing Two")).toHaveLength(3);
    expect(text(screen.getByTestId("player-box-average"))).toMatch(/3 games, small sample/);
    open("Demo Wing Six");
    expect(screen.getByTestId("player-box-note").textContent).toMatch(/No completed games this season yet/);
    cleanup();
    const stale: PropsBoardArtifact = { ...board, entries: board.entries.map((e) => (e.seasonStats ? { ...e, seasonStats: { current: e.seasonStats.current, previous: e.seasonStats.previous } } : e)) };
    render(<PropsBoardView board={stale} />);
    open("Demo Guard One");
    expect(screen.getByTestId("player-box-note").textContent).toMatch(/Rebuild the private preview board/);
  });

  it("gets no box scores on a board without season statistics (a public board)", () => {
    const publicLike: PropsBoardArtifact = { ...board, entries: board.entries.map(({ seasonStats: _removed, ...entry }) => entry) };
    render(<PropsBoardView board={publicLike} />);
    open("Demo Guard One");
    expect(screen.queryByTestId("player-box-card")).toBeNull();
    expect(screen.queryByTestId("opp-box-card")).toBeNull();
  });

  it("centers every numeric header and value, and left-aligns the date and opponent", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard One");
    const t = within(screen.getByTestId("player-box-table"));
    const heads = t.getAllByRole("columnheader");
    expect(heads.map((h) => text(h))).toEqual(["Date", "Opp", "Result", "MIN", "PTS", "REB", "AST", "PTS vs line"]);
    expect(heads.slice(0, 2).every((h) => /\btext-left\b/.test(h.className))).toBe(true);
    expect(heads.slice(2).every((h) => /\btext-center\b/.test(h.className))).toBe(true);
    const cells = within(screen.getAllByTestId("player-box-row")[0]).getAllByRole("cell");
    expect(cells.slice(0, 2).every((c) => /\btext-left\b/.test(c.className))).toBe(true);
    expect(cells.slice(2).every((c) => /\btext-center\b/.test(c.className) && /tabular-nums/.test(c.className))).toBe(true);
  });
});

describe("Opponent Last 10 vs. position box-score table", () => {
  const groups = () => screen.getAllByTestId("opp-box-game");
  const playersOf = (gameId: string) => screen.queryAllByTestId("opp-box-player").filter((tr) => tr.getAttribute("data-game") === gameId);
  const numbers = (tr: HTMLElement) => within(tr).getAllByRole("cell").map(text);

  it("groups the opponent's last ten games, newest first, collapsed to a subtotal row each", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard One");
    expect(groups()).toHaveLength(10);
    const dates = groups().map((g) => text(within(g).getAllByRole("rowheader")[0]));
    expect(dates[0]).not.toBe(dates[9]);
    const row = rowData("Demo Guard One");
    expect(row.opponentBox.games.map((g) => g.date)).toEqual([...row.opponentL10.points].reverse().map((p) => p.date));
    expect(screen.queryAllByTestId("opp-box-player")).toHaveLength(0);
    expect(groups().every((g) => g.getAttribute("aria-expanded") === "false")).toBe(true);
  });

  it("opens a game to its individual opposing players, all at the player's estimated position, whose totals are the game's subtotal", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard One");
    const game = rowData("Demo Guard One").opponentBox.games[0];
    fireEvent.click(groups()[0]);
    expect(groups()[0]).toHaveAttribute("aria-expanded", "true");
    const lines = playersOf(game.gameId);
    expect(lines).toHaveLength(game.players.length);
    expect(lines.length).toBeGreaterThan(0);
    for (const tr of lines) {
      const cells = within(tr).getAllByRole("cell");
      expect(text(cells.find((c) => /^(PG|SG|SF|PF|C|n\/a)$/.test(text(c))) as HTMLElement)).toBe("PG");
    }
    const sum = (index: number) => lines.reduce((total, tr) => total + Number(text(within(tr).getAllByRole("cell")[index])), 0);
    // Cells in a player row (the name is the row header): a spacer under date and team, Pos, MIN, PTS, REB, AST, result.
    const subtotal = within(groups()[0]);
    expect(Number(text(subtotal.getByTestId("opp-box-subtotal-pts")))).toBe(game.subtotal?.pts);
    expect(sum(2)).toBe(game.subtotal?.minutes);
    expect(sum(3)).toBe(game.subtotal?.pts);
    expect(sum(4)).toBe(game.subtotal?.reb);
    expect(sum(5)).toBe(game.subtotal?.ast);
    expect(Number(text(subtotal.getByTestId("opp-box-subtotal-reb")))).toBe(game.subtotal?.reb);
    expect(Number(text(subtotal.getByTestId("opp-box-subtotal-ast")))).toBe(game.subtotal?.ast);
  });

  it("reconciles every game's subtotal and the average with the chart and the Opp L10 column", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard One");
    const row = rowData("Demo Guard One");
    const bars = [...row.opponentL10.points].reverse();
    groups().forEach((g, i) => expect(figure(within(g).getByTestId("opp-box-subtotal-pts"))).toBe(bars[i].value));
    expect(text(screen.getByTestId("opp-box-average-pts"))).toBe((row.opponentL10.average ?? NaN).toFixed(1));
    expect(text(col("Demo Guard One", "oppLast10"))).toContain((row.opponentL10.average ?? NaN).toFixed(1));
    for (const market of ["reb", "ast"] as const) {
      showMarket(market === "reb" ? "Rebounds" : "Assists");
      open("Demo Guard One");
      const r = rowData("Demo Guard One", market);
      expect(text(screen.getByTestId(`opp-box-average-${market}`))).toBe((r.opponentL10.average ?? NaN).toFixed(1));
      groups().forEach((g, i) => expect(figure(within(g).getByTestId(`opp-box-subtotal-${market}`))).toBe([...r.opponentL10.points].reverse()[i].value));
    }
  });

  it("uses the player's estimated position and no other: a shooting guard sees only shooting guards", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Wing Two");
    expect(screen.getByTestId("opp-box-card").getAttribute("aria-label")).toMatch(/allowed to SG/);
    fireEvent.click(screen.getByTestId("opp-box-expand-all"));
    const shown = screen.getAllByTestId("opp-box-player");
    expect(shown.length).toBeGreaterThan(0);
    for (const tr of shown) expect(within(tr).getAllByRole("cell").map(text)).toContain("SG");
    for (const tr of shown) expect(within(tr).getByRole("rowheader").textContent).toMatch(/ SG /);
    expect(screen.getByTestId("opp-box-average").textContent).toContain("SG");
  });

  it("shows attributed-minutes coverage on every game, partial games flagged and complete ones not", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard One");
    const box = rowData("Demo Guard One").opponentBox;
    box.games.forEach((g, i) => {
      const coverage = within(groups()[i]).getByTestId("opp-box-coverage");
      expect(groups()[i].getAttribute("data-incomplete")).toBe(g.isIncomplete ? "true" : "false");
      if (g.subtotal === null) expect(coverage.textContent).toContain("no positions assigned, not a shutout");
      else expect(coverage.textContent).toContain(g.isIncomplete ? `partial ${Math.round((g.coverage ?? 0) * 100)}%` : "100% attributed");
    });
    expect(box.games.some((g) => g.isIncomplete)).toBe(true);
    expect(box.games.some((g) => !g.isIncomplete)).toBe(true);
    expect(screen.getByTestId("opp-box-coverage-summary").textContent).toMatch(new RegExp(`Attributed minutes: ${Math.round((box.coverage ?? 0) * 100)}% of the opposing players' minutes`));
    expect(screen.getByTestId("opp-box-coverage-summary").textContent).toMatch(/a floor, not a full total/);
  });

  it("treats a game with no assigned positions as missing data, never a shutout, and leaves it out of the average", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Big Four");
    const box = rowData("Demo Big Four").opponentBox;
    expect(box.gamesWithFigure).toBe(9);
    const gapIndex = box.games.findIndex((g) => g.subtotal === null);
    expect(gapIndex).toBeGreaterThanOrEqual(0);
    const gap = groups()[gapIndex];
    expect(gap.getAttribute("data-incomplete")).toBe("true");
    expect(text(within(gap).getByTestId("opp-box-coverage"))).toMatch(/not a shutout/);
    for (const id of ["pts", "reb", "ast"]) expect(text(within(gap).getByTestId(`opp-box-subtotal-${id}`))).toBe("–");
    expect(text(gap)).not.toMatch(/\b0\b/);
    expect(text(screen.getByTestId("opp-box-average"))).toMatch(/9 of 10 games with positions/);
    fireEvent.click(gap);
    expect(screen.getByTestId("opp-box-no-players").textContent).toMatch(/had an estimated position/);
    expect(screen.getAllByTestId("opp-box-unmatched").length).toBeGreaterThan(0);
  });

  it("never grades a team-position subtotal against one player's line, and says so", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard One");
    for (const pill of within(screen.getByTestId("opp-box-table")).getAllByTestId("box-selected")) {
      expect(pill.getAttribute("data-line-result")).toBe("none");
      expect(pill.textContent).not.toMatch(/line/);
    }
    expect(within(screen.getByTestId("opp-box-table")).getByRole("columnheader", { name: "PTS result" }).getAttribute("title")).toMatch(/never compared to one player's line/);
    // The player's own table still reads each game against the line.
    expect(within(screen.getByTestId("player-box-table")).getAllByTestId("box-selected").some((p) => p.getAttribute("data-line-result") !== "none")).toBe(true);
  });

  it("labels the average with a small sample and with how many games are partial floors", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard Five");
    open("Demo Guard One");
    const notes = screen.getAllByTestId("opp-box-average-note").map(text);
    const five = rowData("Demo Guard Five").opponentBox;
    const one = rowData("Demo Guard One").opponentBox;
    expect(notes.some((n) => n.includes("4 games, small sample") && n.includes(`${five.incompleteGames} partial (a floor)`))).toBe(true);
    expect(notes.some((n) => n.includes(`${one.incompleteGames} partial (a floor)`) && !n.includes("small sample"))).toBe(true);
  });

  it("lists a player with no position estimate as not counted, outside the subtotal", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard One");
    const game = rowData("Demo Guard One").opponentBox.games.find((g) => g.unmatched.length > 0 && g.players.length > 0);
    if (!game) throw new Error("the demo has a game with unmatched players");
    fireEvent.click(groups().find((g) => g.getAttribute("data-game") === game.gameId) as HTMLElement);
    const unmatched = screen.getAllByTestId("opp-box-unmatched").filter((tr) => tr.getAttribute("data-game") === game.gameId);
    expect(unmatched).toHaveLength(game.unmatched.length);
    for (const tr of unmatched) expect(tr.textContent).toContain("not counted");
    const counted = playersOf(game.gameId).reduce((total, tr) => total + Number(text(within(tr).getAllByRole("cell")[3])), 0);
    expect(counted).toBe(game.subtotal?.pts);
    const withUnmatched = counted + game.unmatched.reduce((total, p) => total + p.pts, 0);
    expect(withUnmatched).toBeGreaterThan(counted);
  });

  it("expands and collapses all games, and each game from the keyboard", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard One");
    const all = screen.getByTestId("opp-box-expand-all");
    expect(all.textContent).toBe("Expand all");
    fireEvent.click(all);
    expect(groups().every((g) => g.getAttribute("aria-expanded") === "true")).toBe(true);
    expect(screen.getAllByTestId("opp-box-player").length).toBeGreaterThan(10);
    expect(all.textContent).toBe("Collapse all");
    fireEvent.click(all);
    expect(screen.queryAllByTestId("opp-box-player")).toHaveLength(0);
    const first = groups()[0];
    expect(first).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(first, { key: "Enter" });
    expect(first).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(first, { key: " " });
    expect(first).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(within(first).getByTestId("opp-box-toggle"));
    expect(first).toHaveAttribute("aria-expanded", "true");
    // The game rows never open or close the player row above them.
    expect(rowOf("Demo Guard One")).toHaveAttribute("aria-expanded", "true");
  });

  it("follows the market and keeps its figures consistent", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard One");
    expect(screen.getByTestId("opp-box-card").getAttribute("aria-label")).toMatch(/PTS allowed to PG/);
    showMarket("Assists");
    open("Demo Guard One");
    expect(screen.getByTestId("opp-box-card").getAttribute("aria-label")).toMatch(/AST allowed to PG/);
    expect(within(screen.getByTestId("opp-box-table")).getByRole("columnheader", { name: "AST" }).className).toMatch(/bg-blue-50/);
    fireEvent.click(screen.getByTestId("opp-box-expand-all"));
    const first = rowData("Demo Guard One", "ast").opponentBox.games[0];
    expect(playersOf(first.gameId).map((tr) => numbers(tr).at(-1))).toEqual(first.players.map((p) => String(p.ast)));
  });

  it("shows a short window as it is, without padding to ten", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard Five");
    expect(groups()).toHaveLength(4);
    expect(text(screen.getByTestId("opp-box-average"))).toMatch(/4 games/);
  });

  it("says why there is nothing to show when the position, the opponent's games or the data are missing", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Bench Seven");
    expect(screen.getByTestId("opp-box-note").textContent).toMatch(/No estimated position/);
    cleanup();
    const stale: PropsBoardArtifact = (({ opponentBoxScores: _boxes, ...rest }) => rest)(board);
    render(<PropsBoardView board={stale} />);
    open("Demo Guard One");
    expect(screen.getByTestId("opp-box-note").textContent).toMatch(/built before opponent box scores existed/);
    // The older chart still works on such a board.
    expect(screen.getByTestId("opp-l10-chart")).toBeInTheDocument();
  });

  it("centers every numeric header and value, and left-aligns the date, team and player", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard One");
    fireEvent.click(groups()[0]);
    const heads = within(screen.getByTestId("opp-box-table")).getAllByRole("columnheader");
    expect(heads.map(text)).toEqual(["Date", "Opp team", "Player", "Pos", "MIN", "PTS", "REB", "AST", "PTS result"]);
    expect(heads.slice(0, 3).every((h) => /\btext-left\b/.test(h.className))).toBe(true);
    expect(heads.slice(3).every((h) => /\btext-center\b/.test(h.className))).toBe(true);
    const game = within(groups()[0]);
    expect(game.getAllByRole("cell").slice(3).every((c) => /\btext-center\b/.test(c.className) && /tabular-nums/.test(c.className))).toBe(true);
    const player = playersOf(rowData("Demo Guard One").opponentBox.games[0].gameId)[0];
    expect(within(player).getByRole("rowheader").className).toMatch(/\btext-left\b/);
    expect(within(player).getAllByRole("cell").slice(1).every((c) => /\btext-center\b/.test(c.className))).toBe(true);
  });
});
