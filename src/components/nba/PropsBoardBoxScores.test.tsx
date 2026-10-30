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
      expect(text(cells[4])).toBe(String(expected[i].minutes));
      expect(text(cells[5])).toBe(String(expected[i].pts));
      expect(text(cells[6])).toBe(String(expected[i].reb));
      expect(text(cells[7])).toBe(String(expected[i].ast));
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
    expect(heads.map((h) => text(h))).toEqual(["Date", "Opp", "DEF RTG", "Result", "MIN", "PTS", "REB", "AST", "PTS vs line"]);
    expect(heads.slice(0, 2).every((h) => /\btext-left\b/.test(h.className))).toBe(true);
    expect(heads.slice(2).every((h) => /\btext-center\b/.test(h.className))).toBe(true);
    const cells = within(screen.getAllByTestId("player-box-row")[0]).getAllByRole("cell");
    expect(cells.slice(0, 2).every((c) => /\btext-left\b/.test(c.className))).toBe(true);
    expect(cells.slice(2).every((c) => /\btext-center\b/.test(c.className) && /tabular-nums/.test(c.className))).toBe(true);
  });
});

describe("Player Last 10 box-score table: opponent DEF RTG", () => {
  const cells = () => screen.getAllByTestId("player-box-defense");
  const withDefense = (teamDefense: PropsBoardArtifact["teamDefense"]): PropsBoardArtifact => (({ teamDefense: _removed, ...rest }) => (teamDefense ? { ...rest, teamDefense } : rest))(board);

  it("adds a DEF RTG column after the opponent, one rating per game, newest first, matching the board's pregame data", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard One");
    expect(within(screen.getByTestId("player-box-table")).getAllByRole("columnheader").map(text).slice(0, 4)).toEqual(["Date", "Opp", "DEF RTG", "Result"]);
    const rows = rowData("Demo Guard One").playerBox.rows;
    expect(cells()).toHaveLength(rows.length);
    rows.forEach((r, i) => {
      if (r.defense === null) return;
      expect(cells()[i].getAttribute("data-state")).toBe("rated");
      expect(text(cells()[i])).toContain(r.defense.rating.toFixed(1));
      expect(text(cells()[i])).toContain(`#${r.defense.rank}`);
    });
    expect(rows.some((r) => r.defense !== null)).toBe(true);
  });

  it("gives a strong / average / weak label only from five prior games, and shows the sample size below that", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard One");
    const rows = rowData("Demo Guard One").playerBox.rows.flatMap((r, i) => (r.defense ? [{ r, cell: cells()[i] }] : []));
    const enough = rows.filter(({ r }) => (r.defense?.games ?? 0) >= 5);
    const small = rows.filter(({ r }) => (r.defense?.games ?? 0) < 5);
    expect(enough.length).toBeGreaterThan(0);
    expect(small.length).toBeGreaterThan(0);
    for (const { r, cell } of enough) {
      expect(cell.getAttribute("data-strength")).toBe(r.strength);
      expect(["strong", "average", "weak"]).toContain(cell.getAttribute("data-strength"));
      expect(cell.querySelector("[role=img]")).toBeNull();
    }
    for (const { r, cell } of small) {
      expect(cell.getAttribute("data-strength")).toBe("none");
      expect(cell.querySelector("[role=img]")?.getAttribute("aria-label")).toMatch(/noisy, so it has no strong/);
      expect(text(cell)).toContain(`${r.defense?.games}g`);
      expect(cell.getAttribute("title")).toMatch(/no strong \/ average \/ weak label/);
    }
    expect(new Set(enough.map(({ cell }) => cell.getAttribute("data-strength"))).size).toBeGreaterThan(1);
  });

  it("reads the strongest third as strong and the weakest third as weak, with the words available to a screen reader", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard One");
    const rows = rowData("Demo Guard One").playerBox.rows;
    rows.forEach((r, i) => {
      if (r.strength === null || r.defense === null) return;
      expect(r.strength).toBe(r.defense.rank <= 10 ? "strong" : r.defense.rank > 20 ? "weak" : "average");
      expect(cells()[i].textContent).toContain(`${r.strength[0].toUpperCase()}${r.strength.slice(1)} defense`);
    });
  });

  it("leaves a game blank, with the reason, when the opponent had no earlier usable game", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Wing Two");
    const rows = rowData("Demo Wing Two").playerBox.rows;
    const blank = rows.findIndex((r) => r.defense === null);
    expect(blank).toBeGreaterThanOrEqual(0);
    expect(text(cells()[blank])).toBe("–");
    expect(cells()[blank].getAttribute("data-state")).toBe("none");
    expect(cells()[blank].getAttribute("title")).toMatch(/no earlier usable game/);
  });

  it("averages the opponents' ratings in the footer, over the games that have one", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard One");
    const { playerBox } = rowData("Demo Guard One");
    expect(text(screen.getByTestId("player-box-defense-average"))).toBe((playerBox.defenseAverage ?? NaN).toFixed(1));
    expect(screen.getByTestId("player-box-defense-average").getAttribute("title")).toContain(`${playerBox.defenseKnown} of 10 games`);
  });

  it("states what the rating is: pregame only, per 100 estimated possessions, lower is stronger, and not a model input", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard One");
    const note = text(screen.getByTestId("player-box-defense-note"));
    expect(note).toMatch(/points allowed per 100 estimated possessions/);
    expect(note).toMatch(/before that date, so it never includes the game itself or any later one/);
    expect(note).toMatch(/Lower is a stronger defense/);
    expect(note).toMatch(/Context, not a projection input/);
    expect(within(screen.getByTestId("player-box-table")).getByRole("columnheader", { name: "DEF RTG" }).getAttribute("title")).toMatch(/Lower is a stronger defense/);
  });

  it("says when the board predates DEF RTG, or was built from data without possession inputs, instead of showing blanks as ratings", () => {
    render(<PropsBoardView board={withDefense(undefined)} />);
    open("Demo Guard One");
    expect(cells().every((c) => c.getAttribute("data-state") === "stale")).toBe(true);
    expect(screen.getByTestId("player-box-defense-note").textContent).toMatch(/built before DEF RTG existed/);
    expect(text(screen.getByTestId("player-box-defense-average"))).toBe("–");
    cleanup();
    render(<PropsBoardView board={withDefense({ season: "2026-27", asOf: {}, usableGames: 0, unusableGames: 180 })} />);
    open("Demo Guard One");
    expect(cells().every((c) => c.getAttribute("data-state") === "no-inputs")).toBe(true);
    expect(screen.getByTestId("player-box-defense-note").textContent).toMatch(/no possession inputs/);
  });

  it("changes nothing else in the table when the market changes: DEF RTG is the opponent's, whatever stat is shown", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard One");
    const before = cells().map(text);
    showMarket("Rebounds");
    open("Demo Guard One");
    expect(cells().map(text)).toEqual(before);
  });
});

describe("Opponent Last 10 box-score table: points allowed and the starter at the position", () => {
  const groups = () => screen.getAllByTestId("opp-box-game");
  const playersOf = (gameId: string) => screen.queryAllByTestId("opp-box-player").filter((tr) => tr.getAttribute("data-game") === gameId);
  const totalOf = (gameId: string) => screen.getAllByTestId("opp-box-total").find((tr) => tr.getAttribute("data-game") === gameId) as HTMLElement;
  const cellsOf = (tr: HTMLElement): string[] => within(tr).getAllByRole("cell").map(text);
  /** The BOS demo window, newest first: games 9..0. Game 6 has two PG starters, 7 none, 8 an unclassified starter, 4 no usable starter status. */
  const MATCH_BY_GAME = ["matched", "uncertain", "none", "multiple", "matched", "unavailable", "matched", "matched", "matched", "matched"];
  const withoutStarterStatus = (b: PropsBoardArtifact): PropsBoardArtifact => ({
    ...b,
    opponentBoxScores: Object.fromEntries(Object.entries(b.opponentBoxScores ?? {}).map(([key, games]) => [key, games.map((g) => ({ ...g, players: g.players.map(({ starter: _starter, ...rest }) => rest) }))])),
  });

  it("groups the opponent's last ten games, newest first, collapsed to one row each with the team points allowed", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard One");
    expect(groups()).toHaveLength(10);
    const row = rowData("Demo Guard One");
    expect(row.opponentBox.games.map((g) => g.date)).toEqual([...row.opponentL10.points].reverse().map((p) => p.date));
    groups().forEach((g, i) => expect(figure(within(g).getByTestId("opp-box-team-pts"))).toBe(row.opponentBox.games[i].teamPtsAllowed));
    expect(screen.queryAllByTestId("opp-box-player")).toHaveLength(0);
    expect(groups().every((g) => g.getAttribute("aria-expanded") === "false")).toBe(true);
  });

  it("keeps team points allowed and the starter's points apart, each labelled, and never adds one into the other", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard One");
    const t = within(screen.getByTestId("opp-box-table"));
    expect(t.getByRole("columnheader", { name: "Team PTS allowed" })).toBeInTheDocument();
    expect(t.getByRole("columnheader", { name: "PG starter" })).toBeInTheDocument();
    const game = rowData("Demo Guard One").opponentBox.games[0];
    const row = within(groups()[0]);
    expect(figure(row.getByTestId("opp-box-team-pts"))).toBe(game.teamPtsAllowed);
    expect(figure(row.getByTestId("opp-box-starter-pts"))).toBe(game.starter?.pts);
    expect(game.teamPtsAllowed).toBeGreaterThan(game.starter?.pts ?? Infinity);
    expect(text(row.getByTestId("opp-box-starter"))).toBe(game.starter?.name);
  });

  it("opens a game to the complete opposing box score: every player and position, with minutes, points, rebounds and assists", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard One");
    const game = rowData("Demo Guard One").opponentBox.games[0];
    fireEvent.click(groups()[0]);
    expect(groups()[0]).toHaveAttribute("aria-expanded", "true");
    const lines = playersOf(game.gameId);
    expect(lines).toHaveLength(game.players.length);
    expect(new Set(game.players.map((p) => p.position)).size).toBeGreaterThan(2);
    // A player with no position estimate is listed too, marked n/a, not hidden.
    expect(lines.some((tr) => within(tr).queryByText("n/a") !== null)).toBe(true);
    const sum = (index: number) => lines.reduce((total, tr) => total + Number(cellsOf(tr)[index]), 0);
    expect(sum(1)).toBe(240);
    expect(sum(2)).toBe(game.teamPtsAllowed);
    expect(sum(3)).toBe(game.players.reduce((total, p) => total + p.reb, 0));
    expect(sum(4)).toBe(game.players.reduce((total, p) => total + p.ast, 0));
    expect(cellsOf(totalOf(game.gameId)).slice(1)).toEqual(["240", String(game.teamPtsAllowed), String(sum(3)), String(sum(4))]);
  });

  it("marks the five starters, lists them first, and highlights the one matched starter", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard One");
    const game = rowData("Demo Guard One").opponentBox.games[0];
    fireEvent.click(groups()[0]);
    const lines = playersOf(game.gameId);
    expect(lines.filter((tr) => tr.getAttribute("data-starter") === "true")).toHaveLength(5);
    expect(lines.slice(0, 5).every((tr) => tr.getAttribute("data-starter") === "true")).toBe(true);
    const matched = lines.filter((tr) => tr.getAttribute("data-matched") === "true");
    expect(matched).toHaveLength(1);
    expect(text(within(matched[0]).getByRole("rowheader"))).toContain(game.starter?.name ?? "never");
    expect(text(within(matched[0]).getByRole("rowheader"))).toContain("matched");
  });

  it("reconciles every game's starter figure and the average with the chart and the Opp L10 column", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard One");
    const row = rowData("Demo Guard One");
    const bars = [...row.opponentL10.points].reverse();
    groups().forEach((g, i) => expect(figure(within(g).getByTestId("opp-box-starter-pts"))).toBe(bars[i].value));
    expect(text(screen.getByTestId("opp-box-average-pts"))).toBe((row.opponentL10.average ?? NaN).toFixed(1));
    expect(text(col("Demo Guard One", "oppLast10"))).toContain((row.opponentL10.average ?? NaN).toFixed(1));
    for (const market of ["reb", "ast"] as const) {
      showMarket(market === "reb" ? "Rebounds" : "Assists");
      open("Demo Guard One");
      const r = rowData("Demo Guard One", market);
      expect(text(screen.getByTestId(`opp-box-average-${market}`))).toBe((r.opponentL10.average ?? NaN).toFixed(1));
      groups().forEach((g, i) => expect(figure(within(g).getByTestId(`opp-box-starter-${market}`))).toBe([...r.opponentL10.points].reverse()[i].value));
    }
  });

  it("uses the player's estimated position and no other: a shooting guard sees the opposing shooting guard", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Wing Two");
    expect(screen.getByTestId("opp-box-card").getAttribute("aria-label")).toMatch(/the SG starter/);
    expect(within(screen.getByTestId("opp-box-table")).getByRole("columnheader", { name: "SG starter" })).toBeInTheDocument();
    const matched = rowData("Demo Wing Two").opponentBox.games.flatMap((g) => (g.starter ? [g.starter] : []));
    expect(matched.length).toBeGreaterThan(0);
    expect(matched.every((p) => p.position === "SG")).toBe(true);
    expect(matched.every((p) => p.starter === true)).toBe(true);
  });

  it("shows why a game has no single starter, in plain words, with dashes rather than zeros or a guess", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard One");
    expect(groups().map((g) => g.getAttribute("data-match"))).toEqual(MATCH_BY_GAME);
    const label = (i: number) => text(within(groups()[i]).getByTestId("opp-box-starter"));
    expect(label(1)).toBe("Position unclear");
    expect(label(2)).toBe("No PG starter");
    expect(label(3)).toBe("2 PG starters");
    expect(label(5)).toBe("Starter n/a");
    for (const i of [1, 2, 3, 5]) {
      for (const id of ["pts", "reb", "ast"]) expect(text(within(groups()[i]).getByTestId(`opp-box-starter-${id}`))).toBe("–");
      expect(within(groups()[i]).getByTestId("opp-box-starter").getAttribute("title")).toMatch(/./);
    }
    expect(within(groups()[3]).getByTestId("opp-box-starter").getAttribute("title")).toMatch(/no single player is chosen/);
    // The team's points allowed are still known for every one of those games.
    for (const i of [1, 2, 3, 5]) expect(figure(within(groups()[i]).getByTestId("opp-box-team-pts"))).not.toBeNull();
  });

  it("lists every candidate when several starters share the position, and names none of them the match", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard One");
    const game = rowData("Demo Guard One").opponentBox.games[3];
    fireEvent.click(groups()[3]);
    const lines = playersOf(game.gameId);
    expect(lines.filter((tr) => tr.getAttribute("data-matched") === "true")).toHaveLength(0);
    const notChosen = lines.filter((tr) => /not chosen/.test(text(tr)));
    expect(notChosen).toHaveLength(2);
    expect(notChosen.every((tr) => tr.getAttribute("data-starter") === "true")).toBe(true);
  });

  it("counts the identified games, leaves the rest out of the starter average, and gives each reason", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard One");
    const box = rowData("Demo Guard One").opponentBox;
    expect(box.gamesWithFigure).toBe(6);
    expect(box.gaps).toEqual({ multiple: 1, none: 1, uncertain: 1, unavailable: 1 });
    expect(text(screen.getByTestId("opp-box-average-starters"))).toBe("6 of 10 games");
    const summary = text(screen.getByTestId("opp-box-coverage-summary"));
    expect(summary).toContain("PG starter identified in 6 of 10 games");
    for (const reason of ["1 game with several PG starters", "1 game with no PG starter", "1 game where a starter has no position estimate", "1 game without usable starter status"]) expect(summary).toContain(reason);
    expect(summary).toMatch(/never filled by a guess/);
    const identified = box.games.flatMap((g) => (g.starter ? [g.starter.pts] : []));
    expect(Number(text(screen.getByTestId("opp-box-average-pts")))).toBeCloseTo(identified.reduce((a, b) => a + b, 0) / identified.length, 1);
  });

  it("does not grade any figure against a player's line: the table has no over / under pills", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard One");
    expect(within(screen.getByTestId("opp-box-table")).queryAllByTestId("box-selected")).toHaveLength(0);
    // The player's own table still reads each game against the line.
    expect(within(screen.getByTestId("player-box-table")).getAllByTestId("box-selected").some((p) => p.getAttribute("data-line-result") !== "none")).toBe(true);
  });

  it("flags an opposing box score that is not a complete game: its team points are unknown, not a floor", () => {
    const [key] = Object.keys(board.opponentBoxScores ?? {}).filter((k) => k.endsWith("|BOS"));
    const games = (board.opponentBoxScores ?? {})[key];
    const newest = games.at(-1);
    if (!newest) throw new Error("the demo has BOS games");
    const trimmed = { ...newest, players: newest.players.filter((p) => p.starter !== true || p.position !== "C") };
    const incomplete: PropsBoardArtifact = { ...board, opponentBoxScores: { ...board.opponentBoxScores, [key]: [...games.slice(0, -1), trimmed] } };
    render(<PropsBoardView board={incomplete} />);
    open("Demo Guard One");
    expect(text(within(groups()[0]).getByTestId("opp-box-team-pts"))).toBe("–");
    expect(within(screen.getByTestId("opp-box-average-team-pts")).getByRole("img").getAttribute("aria-label")).toBe("Only 9 of 10 games have a complete opposing box score");
    fireEvent.click(groups()[0]);
    expect(totalOf(newest.gameId).textContent).toMatch(/incomplete box score/);
  });

  it("explains a board whose box scores carry no starter status, still showing team points and the full box score", () => {
    render(<PropsBoardView board={withoutStarterStatus(board)} />);
    open("Demo Guard One");
    expect(screen.getByTestId("opp-box-starter-note").textContent).toMatch(/no starter status/);
    expect(groups()).toHaveLength(10);
    expect(groups().every((g) => g.getAttribute("data-match") === "unavailable")).toBe(true);
    expect(groups().every((g) => figure(within(g).getByTestId("opp-box-team-pts")) !== null)).toBe(true);
    expect(text(screen.getByTestId("opp-box-average-pts"))).toBe("–");
    fireEvent.click(groups()[0]);
    expect(playersOf(rowData("Demo Guard One").opponentBox.games[0].gameId).length).toBeGreaterThan(8);
    // The chart and the column say the same, and do not fall back to a position total.
    expect(screen.getByTestId("opp-l10-note").textContent).toMatch(/no starter status/);
    expect(screen.queryByTestId("opp-l10-chart")).toBeNull();
    expect(text(col("Demo Guard One", "oppLast10"))).not.toMatch(/\d/);
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

  it("follows the market: the highlighted column and the starter's figures switch, team points allowed do not", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard One");
    const teamPts = figure(within(groups()[0]).getByTestId("opp-box-team-pts"));
    showMarket("Assists");
    open("Demo Guard One");
    expect(within(screen.getByTestId("opp-box-table")).getByRole("columnheader", { name: "AST" }).className).toMatch(/bg-blue-50/);
    expect(within(screen.getByTestId("opp-box-table")).getByRole("columnheader", { name: "PTS" }).className).not.toMatch(/bg-blue-50/);
    const first = rowData("Demo Guard One", "ast").opponentBox.games[0];
    expect(figure(within(groups()[0]).getByTestId("opp-box-starter-ast"))).toBe(first.starter?.ast);
    expect(figure(within(groups()[0]).getByTestId("opp-box-team-pts"))).toBe(teamPts);
  });

  it("shows a short window as it is, without padding to ten", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard Five");
    expect(groups()).toHaveLength(4);
    expect(text(screen.getByTestId("opp-box-average"))).toMatch(/4 games, small sample/);
    expect(text(screen.getByTestId("opp-box-average-starters"))).toBe("4 of 4 games");
  });

  it("says why there is nothing to show when the position or the data is missing", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Bench Seven");
    expect(screen.getByTestId("opp-box-note").textContent).toMatch(/No estimated position/);
    cleanup();
    const stale: PropsBoardArtifact = (({ opponentBoxScores: _boxes, ...rest }) => rest)(board);
    render(<PropsBoardView board={stale} />);
    open("Demo Guard One");
    expect(screen.getByTestId("opp-box-note").textContent).toMatch(/built before opponent box scores existed/);
    expect(screen.getByTestId("opp-l10-note").textContent).toMatch(/built before opponent box scores existed/);
  });

  it("aligns the date, team and starter name left and every number centered", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard One");
    fireEvent.click(groups()[0]);
    const heads = within(screen.getByTestId("opp-box-table")).getAllByRole("columnheader");
    expect(heads.map(text)).toEqual(["Date", "Opp team", "Team PTS allowed", "PG starter", "MIN", "PTS", "REB", "AST"]);
    expect(heads.filter((h) => /\btext-left\b/.test(h.className)).map(text)).toEqual(["Date", "Opp team", "PG starter"]);
    expect(heads.filter((h) => /\btext-center\b/.test(h.className)).map(text)).toEqual(["Team PTS allowed", "MIN", "PTS", "REB", "AST"]);
    const cells = within(groups()[0]).getAllByRole("cell");
    expect(cells.filter((c) => /\btext-center\b/.test(c.className) && /tabular-nums/.test(c.className))).toHaveLength(5);
    const player = playersOf(rowData("Demo Guard One").opponentBox.games[0].gameId)[0];
    expect(within(player).getByRole("rowheader").className).toMatch(/\btext-left\b/);
    expect(within(player).getAllByRole("cell").slice(1).every((c) => /\btext-center\b/.test(c.className))).toBe(true);
  });
});
