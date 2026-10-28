import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import PropsBoardView from "@/components/nba/PropsBoardView";
import { buildDemoBoard } from "@/lib/nba/props/__fixtures__/boardDemo";
import { COLUMN_PREFERENCE_KEY } from "@/lib/nba/props/boardColumns";
import { buildBoardRows, type BoardMarket, type PropsBoardArtifact } from "@/lib/nba/props/propsBoard";

// Each test renders a table in jsdom, several times for market switches: allow for a loaded machine.
vi.setConfig({ testTimeout: 30_000 });

/** The shared test setup reports every media query as not matching (a phone); the table tests default to a desktop width. */
const stubViewport = (wide: boolean) =>
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: wide, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));

beforeEach(() => {
  localStorage.clear();
  stubViewport(true);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The columns the table showed by default before the last-ten redesign: tests of L5 and Opp allows select them explicitly. */
const DEFAULT_HEADERS = ["Player", "MPG", "PPG", "PTS/MIN", "L10 PTS", "Opp L10 PTS", "Matchup", "Vegas Line", "JKB proj"];
const LEGACY_COLUMNS = ["mpg", "perGame", "perMinute", "last5", "dvpAllowed", "matchup", "jkbProjection"];
const renderWith = (columns: readonly string[], b: PropsBoardArtifact = buildDemoBoard()) => {
  localStorage.setItem(COLUMN_PREFERENCE_KEY, JSON.stringify({ version: 1, columns }));
  return render(<PropsBoardView board={b} />);
};
const renderLegacy = (b?: PropsBoardArtifact) => renderWith(LEGACY_COLUMNS, b);

const board = buildDemoBoard();
const rowOf = (name: string): HTMLElement => screen.getByRole("rowheader", { name: new RegExp(name) }).closest("tr") as HTMLElement;
const col = (name: string, id: string): HTMLElement => within(rowOf(name)).getByTestId(`col-${id}`);
const toggleOf = (name: string): HTMLElement => within(rowOf(name)).getByTestId("row-toggle");
/** Expands a player's detail row (idempotent) and returns it. */
const open = (name: string): HTMLElement => {
  if (toggleOf(name).getAttribute("aria-expanded") !== "true") fireEvent.click(toggleOf(name));
  return rowOf(name).nextElementSibling as HTMLElement;
};
const detail = (name: string, id: string): HTMLElement => within(open(name)).getByTestId(`detail-${id}`);
const inputFor = (name: string): HTMLInputElement => {
  open(name);
  return screen.getByLabelText(new RegExp(`Your projected minutes for ${name},`)) as HTMLInputElement;
};
/** The adjusted projection itself, without the "× n JKB min" note beneath it. */
const adjusted = (name: string): string | null => {
  const el = detail(name, "adjustedProjection");
  return el.querySelector('[data-testid="adjusted-value"]')?.textContent ?? el.textContent;
};
const type = (name: string, text: string) => fireEvent.change(inputFor(name), { target: { value: text } });
const typeAndLeave = (name: string, text: string) => {
  type(name, text);
  fireEvent.blur(inputFor(name));
};
const headers = (): string[] => screen.getAllByRole("columnheader").map((h) => h.textContent?.replace(/\s+/g, " ").trim() ?? "");
const showMarket = (label: "Points" | "Rebounds" | "Assists") => fireEvent.click(screen.getByRole("button", { name: label }));
const playerOrder = (): string[] => screen.getAllByTestId("player-name").map((n) => n.textContent ?? "");
const openColumns = () => fireEvent.click(screen.getByTestId("columns-menu-trigger"));
const toggleColumn = (id: string) => fireEvent.click(screen.getByTestId(`column-toggle-${id}`));
const rowsFor = (market: BoardMarket) => buildBoardRows(board, market);
const dvpOf = (name: string, market: BoardMarket = "pts") => {
  const row = rowsFor(market).find((r) => r.entry.playerName === name);
  if (!row || row.dvp.kind !== "ok") throw new Error(`no DvP for ${name}`);
  return row.dvp.comparison;
};
const withoutLastWindows: PropsBoardArtifact = { ...board, entries: board.entries.map((e) => (e.seasonStats ? { ...e, seasonStats: { current: e.seasonStats.current, previous: e.seasonStats.previous } } : e)) };
const publicLike: PropsBoardArtifact = { ...board, entries: board.entries.map(({ seasonStats: _removed, ...entry }) => entry) };

describe("the compact default table", () => {
  it("shows player, MPG, PPG, PTS/MIN, player L10, opponent L10 allowed, matchup, Vegas Line and JKB projection, in that order, and nothing else", () => {
    render(<PropsBoardView board={board} />);
    expect(headers()).toEqual(DEFAULT_HEADERS);
  });

  it("uses the selected market's own per-game, per-minute, L10 and opponent labels", () => {
    render(<PropsBoardView board={board} />);
    showMarket("Rebounds");
    expect(headers()).toEqual(["Player", "MPG", "RPG", "REB/MIN", "L10 REB", "Opp L10 REB", "Matchup", "Vegas Line", "JKB proj"]);
    showMarket("Assists");
    expect(headers()).toEqual(["Player", "MPG", "APG", "AST/MIN", "L10 AST", "Opp L10 AST", "Matchup", "Vegas Line", "JKB proj"]);
  });

  it("keeps every optional field out of the default view", () => {
    render(<PropsBoardView board={board} />);
    const h = headers().join("|");
    for (const absent of ["O / U", "JKB min", "Your min", "Adj proj", "Adj − line", "JKB − line", "L5", "Opp allows", "DvP", "Sample", "Season-rate", "Source"]) expect(h, absent).not.toContain(absent);
  });

  it("computes each cell from the player's own figures for the selected market", () => {
    render(<PropsBoardView board={board} />);
    expect(col("Demo Guard One", "mpg").textContent).toBe("33.8");
    expect(col("Demo Guard One", "perGame").textContent).toBe("25.4");
    expect(col("Demo Guard One", "perMinute").textContent).toBe((25.4 / 33.8).toFixed(2));
    expect(col("Demo Guard One", "last10").textContent).toBe("26.8");
    expect(col("Demo Guard One", "jkbProjection").textContent).toBe("26.1");
    showMarket("Rebounds");
    expect(col("Demo Big Four", "perGame").textContent).toBe("11.9");
    expect(col("Demo Big Four", "perMinute").textContent).toBe((11.9 / 25.5).toFixed(2));
    expect(col("Demo Big Four", "last10").textContent).toBe("12.3");
    expect(col("Demo Big Four", "mpg").textContent).toBe("25.5");
    showMarket("Assists");
    expect(col("Demo Guard One", "perGame").textContent).toBe("8.6");
    expect(col("Demo Guard One", "last10").textContent).toBe("8.9");
  });

  it("shows what the opponent allowed over its last ten games to the player's estimated position", () => {
    render(<PropsBoardView board={board} />);
    for (const name of ["Demo Guard One", "Demo Big Four"]) {
      const l10 = rowsFor("pts").find((r) => r.entry.playerName === name)?.opponentL10;
      expect(l10?.status, name).toBe("ok");
      expect(col(name, "oppLast10").textContent).toContain((l10?.average ?? NaN).toFixed(1));
    }
    // BOS (the opponent of the NYK players) has a full window; NYK (the opponent of the BOS players) has four games.
    expect(rowsFor("pts").find((r) => r.entry.playerName === "Demo Guard One")?.opponentL10.games).toBe(10);
    expect(rowsFor("pts").find((r) => r.entry.playerName === "Demo Guard Five")?.opponentL10.games).toBe(4);
  });

  it("starts sorted by the JKB projection, highest first, with the projection header marking it", () => {
    render(<PropsBoardView board={board} />);
    expect(playerOrder()[0]).toBe("Demo Guard One");
    expect(screen.getByTestId("head-jkbProjection")).toHaveAttribute("aria-sort", "descending");
  });

  it("keeps only matchup, Vegas Line and the projection as table columns on a phone: the rest, L10 included, are hidden below the md breakpoint", () => {
    render(<PropsBoardView board={board} />);
    const onPhone = ["matchup", "line", "jkbProjection"];
    for (const id of ["mpg", "perGame", "perMinute", "last10", "oppLast10", "matchup", "line", "jkbProjection"]) {
      // A tablet shows every default column but PTS/MIN (it arrives at lg); the expanded row carries it.
      const arrives = id === "perMinute" ? /\blg:table-cell\b/ : /\bmd:table-cell\b/;
      const hidden = /\bhidden\b/.test(screen.getByTestId(`head-${id}`).className) && arrives.test(screen.getByTestId(`head-${id}`).className);
      expect(hidden, id).toBe(!onPhone.includes(id));
      expect(/\bhidden\b/.test(col("Demo Guard One", id).className), `${id} cell`).toBe(!onPhone.includes(id));
    }
  });

  it("does not force a wide table: no fixed minimum width", () => {
    render(<PropsBoardView board={board} />);
    expect(screen.getByTestId("props-board-table").className).not.toMatch(/min-w-/);
  });

  it("hides the season columns on a board without season statistics, as on any public board", () => {
    render(<PropsBoardView board={publicLike} />);
    expect(headers()).toEqual(["Player", "Matchup", "Vegas Line", "JKB proj"]);
    expect(screen.queryByText(/completed games this season/)).toBeNull();
  });
});

describe("last five games", () => {
  it("marks a short window with a small amber dot that says how many games it covers", () => {
    renderLegacy();
    expect(col("Demo Wing Two", "last5").textContent).toBe("15.33g");
    expect(within(col("Demo Wing Two", "last5")).getByRole("img", { name: /Only 3 games so far this season/ }).className).toMatch(/amber/);
    expect(within(col("Demo Guard One", "last5")).queryByRole("img")).toBeNull();
  });

  it("shows a dash for a player with no games this season, never a number from last season", () => {
    renderLegacy();
    expect(col("Demo Wing Six", "last5").textContent).toBe("—");
    expect(col("Demo Wing Six", "last5").querySelector("[title]")?.getAttribute("title")).toBe("No games this season yet");
  });

  it("shows N/A for a player with no statistics at all", () => {
    renderLegacy();
    expect(col("Demo Bench Seven", "last5").textContent).toBe("N/A");
    expect(col("Demo Bench Seven", "mpg").textContent).toBe("N/A");
  });

  it("says a board built before last-five averages must be rebuilt, instead of showing a number or a dash", () => {
    renderLegacy(withoutLastWindows);
    expect(col("Demo Guard One", "last5").textContent).toBe("N/A");
    expect(col("Demo Guard One", "last5").querySelector("[title]")?.getAttribute("title")).toMatch(/rebuild/);
    expect(col("Demo Guard One", "mpg").textContent).toBe("33.8");
  });

  it("sorts by the last-five figure, with players missing it last in either direction", () => {
    renderLegacy();
    fireEvent.click(screen.getByRole("button", { name: "L5 PTS" }));
    expect(playerOrder()[0]).toBe("Demo Guard One");
    expect(playerOrder().slice(-2)).toEqual(expect.arrayContaining(["Demo Bench Seven", "Demo Wing Six"]));
    fireEvent.click(screen.getByRole("button", { name: "L5 PTS" }));
    expect(playerOrder().slice(-2)).toEqual(expect.arrayContaining(["Demo Bench Seven", "Demo Wing Six"]));
    expect(screen.getByTestId("head-last5")).toHaveAttribute("aria-sort", "ascending");
  });
});

describe("season sample labelling", () => {
  it("marks a small current-season sample with an amber dot on MPG and not a full one", () => {
    renderLegacy();
    expect(within(col("Demo Wing Two", "mpg")).getByRole("img", { name: /Small sample: 3 games this season/ })).toBeInTheDocument();
    // The count is written out, not only colored, so a touch or color-blind reader sees it too.
    expect(col("Demo Wing Two", "mpg").textContent).toBe("29.13g");
    expect(col("Demo Wing Two", "last5").textContent).toContain("3g");
    expect(col("Demo Guard One", "last5").textContent).not.toMatch(/\dg/);
    expect(within(col("Demo Guard One", "mpg")).queryByRole("img")).toBeNull();
  });

  it("shows a dash for the current season when there are no games yet", () => {
    renderLegacy();
    expect(col("Demo Wing Six", "mpg").textContent).toBe("—");
    expect(col("Demo Wing Six", "perGame").textContent).toBe("—");
  });

  it("explains the sample in the expanded row: the season and games, with last season on its own beside a short sample", () => {
    renderLegacy();
    expect(detail("Demo Guard One", "seasonSample").textContent).toContain("2026-27 · 24 games");
    expect(detail("Demo Guard One", "seasonSample").textContent).not.toContain("2025-26");
    const early = detail("Demo Wing Two", "seasonSample").textContent ?? "";
    expect(early).toContain("2026-27 · 3 games");
    expect(early).toContain("2025-26 · 70 games");
    expect(detail("Demo Wing Two", "lastSeason").textContent).toContain("19.8");
    expect(detail("Demo Wing Two", "mpg").textContent).toContain("29.1");
    expect(detail("Demo Wing Six", "seasonSample").textContent).toContain("no games yet this season");
    expect(detail("Demo Bench Seven", "seasonSample").textContent).toBe("N/A");
  });
});

describe("matchup colors reinforce the number and never replace it", () => {
  const chip = (name: string) => within(col(name, "matchup")).getByText(/Favorable|Neutral|Tough/).closest("span[title]") as HTMLElement;

  it("labels a matchup Favorable, Neutral or Tough from the opponent's rank, with a green, gray or red chip", () => {
    renderLegacy();
    expect(dvpOf("Demo Big Four").tier).toBe("favorable");
    expect(chip("Demo Big Four").textContent).toBe("▲ Favorable #1");
    expect(chip("Demo Big Four").className).toMatch(/emerald/);
    expect(dvpOf("Demo Forward Three").tier).toBe("neutral");
    expect(chip("Demo Forward Three").textContent).toMatch(/^● Neutral #\d+$/);
    expect(chip("Demo Forward Three").className).toMatch(/slate/);
    expect(dvpOf("Demo Guard One").tier).toBe("tough");
    expect(chip("Demo Guard One").textContent).toMatch(/^▼ Tough #\d+$/);
    expect(chip("Demo Guard One").className).toMatch(/rose/);
  });

  it("tints the Opp allows and Matchup cells to match, while the allowed figure and rank stay printed", () => {
    renderLegacy();
    for (const [name, tone] of [["Demo Big Four", /emerald/], ["Demo Forward Three", /slate/], ["Demo Guard One", /rose/]] as const) {
      expect(col(name, "dvpAllowed").className).toMatch(tone);
      expect(col(name, "matchup").className).toMatch(tone);
      expect(col(name, "dvpAllowed").textContent).toMatch(/^\d+\.\d#\d+$/);
    }
  });

  it("shows a neutral N/A, with the reason on hover, for a player with no estimated position", () => {
    renderLegacy();
    for (const id of ["dvpAllowed", "matchup"]) {
      expect(col("Demo Bench Seven", id).textContent).toBe("N/A");
      expect(col("Demo Bench Seven", id).querySelector("[title]")?.getAttribute("title")).toMatch(/No usable position/);
      expect(col("Demo Bench Seven", id).className).not.toMatch(/emerald|rose|amber/);
    }
    expect(rowOf("Demo Bench Seven").textContent).toContain("pos N/A");
  });

  it("gives the JKB projection a navy emphasis, in the header and every cell", () => {
    renderLegacy();
    expect(screen.getByTestId("head-jkbProjection").className).toMatch(/blue/);
    expect(col("Demo Guard One", "jkbProjection").className).toMatch(/blue/);
    expect(within(col("Demo Guard One", "jkbProjection")).getByText("26.1").className).toMatch(/blue-900/);
  });

  it("says once, in amber, that this season's DvP sample is small, and does not repeat it on every row", () => {
    renderLegacy();
    const note = screen.getByTestId("dvp-sample-note");
    expect(note.textContent).toMatch(/3 games per team/);
    expect(within(note).getByRole("img").className).toMatch(/amber/);
    expect(within(col("Demo Guard One", "dvpAllowed")).queryByRole("img")).toBeNull();
  });

  it("labels DvP as the estimated primary-position view with incomplete position coverage", () => {
    renderLegacy();
    expect(screen.getByText(/estimated primary-position Defense vs\. Position/)).toBeInTheDocument();
    expect(screen.getByText(/Position coverage is incomplete/)).toBeInTheDocument();
    expect(screen.getByText(/Favorable 1–10, Neutral 11–20, Tough 21–30/)).toBeInTheDocument();
  });
});

describe("the Columns menu", () => {
  it("lists every optional field, with the defaults checked and the rest unchecked", () => {
    render(<PropsBoardView board={board} />);
    openColumns();
    for (const id of ["mpg", "perGame", "perMinute", "last10", "oppLast10", "matchup", "line", "jkbProjection"]) expect(screen.getByTestId(`column-toggle-${id}`), id).toBeChecked();
    for (const id of ["overUnder", "jkbMinutes", "userMinutes", "adjustedProjection", "modelEdge", "last5", "dvpAllowed", "dvpPrior", "dvpCurrent", "seasonRateEstimate", "seasonSample", "lastSeason"]) expect(screen.getByTestId(`column-toggle-${id}`), id).not.toBeChecked();
  });

  it("adds an optional column, in its registry position, and removes it again", () => {
    render(<PropsBoardView board={board} />);
    openColumns();
    toggleColumn("last5");
    toggleColumn("overUnder");
    expect(headers()).toEqual(["Player", "MPG", "PPG", "PTS/MIN", "L5 PTS", "L10 PTS", "Opp L10 PTS", "Matchup", "Vegas Line", "JKB proj", "O / U"]);
    expect(col("Demo Guard One", "last5").textContent).toBe("28.6");
    expect(col("Demo Guard One", "last10").textContent).toBe("26.8");
    expect(col("Demo Guard One", "line").textContent).toBe("24.5");
    expect(col("Demo Guard One", "overUnder").textContent).toBe("-115 / -105");
    toggleColumn("overUnder");
    expect(headers()).not.toContain("O / U");
  });

  it("offers the 2025–26 and 2026–27 DvP, JKB minutes, the edge and the season comparison fields", () => {
    render(<PropsBoardView board={board} />);
    openColumns();
    for (const id of ["dvpPrior", "dvpCurrent", "jkbMinutes", "modelEdge", "seasonSample", "lastSeason"]) toggleColumn(id);
    const h = headers();
    expect(h).toEqual(expect.arrayContaining(["2025 DvP", "2026 DvP", "JKB min", "JKB − line", "Sample", "2025-26 PPG"]));
    expect(col("Demo Guard One", "jkbMinutes").textContent).toBe("34.0");
    expect(col("Demo Guard One", "modelEdge").textContent).toBe("+1.6");
    expect(col("Demo Guard One", "dvpPrior").textContent).toMatch(/^\d+\.\d#\d+$/);
    expect(col("Demo Guard One", "lastSeason").textContent).toContain("24.1");
  });

  it("puts the editable minutes field in the table when the Your min column is shown, and not twice", () => {
    render(<PropsBoardView board={board} />);
    openColumns();
    toggleColumn("userMinutes");
    const input = within(col("Demo Guard One", "userMinutes")).getByLabelText(/Your projected minutes for Demo Guard One,/);
    fireEvent.change(input, { target: { value: "36" } });
    open("Demo Guard One");
    expect(screen.getAllByLabelText(/Your projected minutes for Demo Guard One,/)).toHaveLength(1);
    expect(adjusted("Demo Guard One")).toBe(((26.1 * 36) / 34).toFixed(1));
  });

  it("disables the season columns on a board that carries no season statistics", () => {
    render(<PropsBoardView board={publicLike} />);
    openColumns();
    // They are not shown, so they are not drawn as ticked.
    expect(screen.getByTestId("column-toggle-mpg")).not.toBeChecked();
    for (const id of ["mpg", "last5", "last10", "oppLast10", "seasonSample"]) expect(screen.getByTestId(`column-toggle-${id}`), id).toBeDisabled();
    // Vegas Line is on every board, public or private, and cannot be switched off.
    expect(screen.getByTestId("column-toggle-line")).toBeChecked();
    expect(screen.getByTestId("column-toggle-line")).toBeDisabled();
  });

  it("returns to the default columns, and reports the shown count", () => {
    render(<PropsBoardView board={board} />);
    openColumns();
    expect(screen.getByTestId("columns-menu-trigger").textContent).toContain("(8)");
    expect(screen.getByTestId("columns-reset")).toBeDisabled();
    toggleColumn("dvpAllowed");
    toggleColumn("mpg");
    expect(screen.getByTestId("columns-menu-trigger").textContent).toContain("(8)");
    expect(screen.getByTestId("columns-reset")).toBeEnabled();
    fireEvent.click(screen.getByTestId("columns-reset"));
    expect(headers()).toEqual(DEFAULT_HEADERS);
  });

  it("falls back to the first shown sortable column when the projection column itself is hidden, and comes back with it", () => {
    render(<PropsBoardView board={board} />);
    openColumns();
    toggleColumn("jkbProjection");
    expect(screen.queryByTestId("head-jkbProjection")).toBeNull();
    // Nothing is ordered by a column that is not on screen.
    expect(screen.getByTestId("head-mpg")).toHaveAttribute("aria-sort", "descending");
    expect(playerOrder()[0]).toBe("Demo Guard One");
    toggleColumn("jkbProjection");
    expect(screen.getByTestId("head-jkbProjection")).toHaveAttribute("aria-sort", "descending");
  });

  it("applies the same rule to a saved selection that hides the default sort column", () => {
    localStorage.setItem(COLUMN_PREFERENCE_KEY, JSON.stringify({ version: 1, columns: ["last5", "matchup"] }));
    render(<PropsBoardView board={board} />);
    expect(headers()).toEqual(["Player", "L5 PTS", "Matchup", "Vegas Line"]);
    expect(screen.getByTestId("head-last5")).toHaveAttribute("aria-sort", "descending");
    expect(screen.getByTestId("head-matchup")).toHaveAttribute("aria-sort", "none");
  });

  it("falls back to the projection sort when the sorted column is hidden", () => {
    renderLegacy();
    fireEvent.click(screen.getByRole("button", { name: "L5 PTS" }));
    expect(screen.getByTestId("head-last5")).toHaveAttribute("aria-sort", "descending");
    openColumns();
    toggleColumn("last5");
    expect(screen.getByTestId("head-jkbProjection")).toHaveAttribute("aria-sort", "descending");
  });
});

describe("remembering the column choice", () => {
  it("stores only the column ids, once per change, and restores them on the next visit", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const first = render(<PropsBoardView board={board} />);
    expect(setItem).not.toHaveBeenCalled();
    openColumns();
    toggleColumn("dvpAllowed");
    expect(setItem).toHaveBeenCalledTimes(1);
    const [key, value] = setItem.mock.calls[0];
    expect(key).toBe(COLUMN_PREFERENCE_KEY);
    expect(JSON.parse(String(value))).toEqual({ version: 1, columns: ["mpg", "perGame", "perMinute", "last10", "oppLast10", "dvpAllowed", "matchup", "line", "jkbProjection"] });
    first.unmount();
    render(<PropsBoardView board={board} />);
    expect(headers()).toContain("Opp allows");
    setItem.mockRestore();
  });

  it("never stores a player, a figure, a projection or a minutes override", () => {
    render(<PropsBoardView board={board} />);
    openColumns();
    toggleColumn("userMinutes");
    type("Demo Guard One", "36");
    fireEvent.click(screen.getByTestId("reset-all-minutes"));
    const everything = Object.keys(localStorage).map((k) => `${k}=${localStorage.getItem(k)}`).join("\n") + document.cookie + JSON.stringify(sessionStorage);
    expect(Object.keys(localStorage)).toEqual([COLUMN_PREFERENCE_KEY]);
    for (const secret of ["Demo", "26.1", "33.8", "36", "NYK", "BOS"]) expect(everything, secret).not.toContain(secret);
  });

  it("clears the stored choice with the Default button", () => {
    render(<PropsBoardView board={board} />);
    openColumns();
    toggleColumn("dvpAllowed");
    expect(localStorage.getItem(COLUMN_PREFERENCE_KEY)).not.toBeNull();
    fireEvent.click(screen.getByTestId("columns-reset"));
    expect(localStorage.getItem(COLUMN_PREFERENCE_KEY)).toBeNull();
  });

  it("uses the defaults for a corrupt stored value and drops ids it does not know", () => {
    localStorage.setItem(COLUMN_PREFERENCE_KEY, "{broken");
    const first = render(<PropsBoardView board={board} />);
    expect(headers()).toEqual(DEFAULT_HEADERS);
    first.unmount();
    localStorage.setItem(COLUMN_PREFERENCE_KEY, JSON.stringify({ columns: ["last10", "Demo Guard One", "jkbProjection"] }));
    render(<PropsBoardView board={board} />);
    // The Vegas Line is fixed, so it shows even though this saved choice never named it.
    expect(headers()).toEqual(["Player", "L10 PTS", "Vegas Line", "JKB proj"]);
  });

  it("works when the browser blocks storage", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<PropsBoardView board={board} />);
    expect(headers()).toContain("MPG");
    openColumns();
    toggleColumn("dvpAllowed");
    expect(headers()).toContain("Opp allows");
    get.mockRestore();
    set.mockRestore();
  });
});

describe("the expanded row", () => {
  it("is collapsed by default and opens and closes from a labelled, keyboard-reachable button", () => {
    render(<PropsBoardView board={board} />);
    const toggle = toggleOf("Demo Guard One");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle.getAttribute("aria-label")).toBe("Show details and minutes for Demo Guard One");
    expect(screen.queryByTestId("row-detail")).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle.getAttribute("aria-label")).toBe("Hide details and minutes for Demo Guard One");
    expect(document.getElementById(toggle.getAttribute("aria-controls") ?? "")).toBe(screen.getByTestId("row-detail"));
    fireEvent.click(toggle);
    expect(screen.queryByTestId("row-detail")).toBeNull();
  });

  it("carries every figure a phone does not have room for, using the same values as the table columns", () => {
    renderLegacy();
    expect(detail("Demo Guard One", "mpg").textContent).toBe("33.8");
    expect(detail("Demo Guard One", "perGame").textContent).toBe("25.4");
    expect(detail("Demo Guard One", "perMinute").textContent).toBe((25.4 / 33.8).toFixed(2));
    expect(detail("Demo Guard One", "last5").textContent).toBe("28.6");
    expect(detail("Demo Guard One", "last10").textContent).toBe("26.8");
    expect(detail("Demo Guard One", "dvpAllowed").textContent).toBe(col("Demo Guard One", "dvpAllowed").textContent);
    expect(detail("Demo Guard One", "dvpPrior").textContent).toMatch(/^\d+\.\d#\d+$/);
    expect(detail("Demo Guard One", "dvpCurrent").textContent).toMatch(/^\d+\.\d#\d+$/);
    expect(detail("Demo Guard One", "line").textContent).toBe("24.5");
    expect(detail("Demo Guard One", "overUnder").textContent).toBe("-115 / -105");
    expect(detail("Demo Guard One", "jkbMinutes").textContent).toBe("34.0");
    expect(detail("Demo Guard One", "jkbTriple").textContent).toBe("26.1 / 3.8 / 9.4");
    expect(detail("Demo Guard One", "source").textContent).toContain("demobook");
    expect(detail("Demo Wing Six", "jkbTriple").textContent).toBe("— / — / —");
  });

  it("leaves out the season lines on a board without season statistics", () => {
    render(<PropsBoardView board={publicLike} />);
    const panel = open("Demo Guard One");
    expect(within(panel).queryByTestId("detail-mpg")).toBeNull();
    expect(within(panel).getByTestId("detail-dvpAllowed")).toBeInTheDocument();
  });
});

describe("minutes overrides", () => {
  it("leaves the adjusted values empty until minutes are typed, with the JKB minutes as the placeholder", () => {
    render(<PropsBoardView board={board} />);
    expect(adjusted("Demo Guard One")).toBe("—");
    expect(detail("Demo Guard One", "seasonRateEstimate").textContent).toBe("—");
    expect(inputFor("Demo Guard One").placeholder).toBe("34.0");
  });

  it("shows the adjusted projection, its line difference and the season-rate estimate, apart from the JKB values", () => {
    render(<PropsBoardView board={board} />);
    type("Demo Guard One", "36");
    expect(adjusted("Demo Guard One")).toBe(((26.1 * 36) / 34).toFixed(1));
    expect(detail("Demo Guard One", "adjustedDifference").textContent).toBe(`+${((26.1 * 36) / 34 - 24.5).toFixed(1)}`);
    const rate = 36 * ((24 * 25.4) / (24 * 33.8));
    expect(detail("Demo Guard One", "seasonRateEstimate").textContent).toContain(rate.toFixed(1));
    expect(detail("Demo Guard One", "seasonRateEstimate").textContent).toContain(`+${(rate - 24.5).toFixed(1)} vs line`);
    // The original model output and its difference are untouched.
    expect(col("Demo Guard One", "jkbProjection").textContent).toBe("26.1");
    expect(detail("Demo Guard One", "jkbMinutes").textContent).toBe("34.0");
    expect(detail("Demo Guard One", "modelEdge").textContent).toBe("+1.6");
  });

  it("recalculates when the minutes change", () => {
    render(<PropsBoardView board={board} />);
    type("Demo Guard One", "36");
    type("Demo Guard One", "24.5");
    expect(adjusted("Demo Guard One")).toBe(((26.1 * 24.5) / 34).toFixed(1));
    expect(detail("Demo Guard One", "adjustedDifference").textContent).toBe(((26.1 * 24.5) / 34 - 24.5).toFixed(1).replace(/^(?=\d)/, "+"));
    expect(within(detail("Demo Guard One", "adjustedDifference")).getByText(/\d/).className).toMatch(/rose|emerald/);
  });

  it("rounds to one decimal", () => {
    render(<PropsBoardView board={board} />);
    type("Demo Guard One", "32.46");
    expect(adjusted("Demo Guard One")).toBe(((26.1 * 32.5) / 34).toFixed(1));
  });

  it("rejects invalid input with a message and applies nothing", () => {
    render(<PropsBoardView board={board} />);
    for (const bad of ["49", "-3", "abc", "1e1"]) {
      typeAndLeave("Demo Guard One", bad);
      expect(inputFor("Demo Guard One").getAttribute("aria-invalid")).toBe("true");
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(adjusted("Demo Guard One")).toBe("—");
      expect(detail("Demo Guard One", "seasonRateEstimate").textContent).toBe("—");
    }
    type("Demo Guard One", "30");
    expect(inputFor("Demo Guard One").getAttribute("aria-invalid")).toBe("false");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("accepts the edges of the range, 0 and 48", () => {
    render(<PropsBoardView board={board} />);
    type("Demo Guard One", "0");
    expect(adjusted("Demo Guard One")).toBe("0.0");
    type("Demo Guard One", "48");
    expect(adjusted("Demo Guard One")).toBe(((26.1 * 48) / 34).toFixed(1));
  });

  it("shows N/A rather than a number when a value cannot be computed", () => {
    render(<PropsBoardView board={board} />);
    type("Demo Wing Six", "30");
    // No projection, no games this season: nothing to scale and no current per-minute rate.
    expect(adjusted("Demo Wing Six")).toBe("N/A");
    expect(detail("Demo Wing Six", "seasonRateEstimate").textContent).toBe("N/A");
    type("Demo Bench Seven", "20");
    // A projection and minutes but no season history, and no line.
    expect(adjusted("Demo Bench Seven")).toBe(((9.1 * 20) / 14).toFixed(1));
    expect(detail("Demo Bench Seven", "seasonRateEstimate").textContent).toBe("N/A");
    expect(detail("Demo Bench Seven", "adjustedDifference").textContent).toBe("N/A");
  });

  it("disables the input when there is neither a JKB projection with minutes nor a season rate", () => {
    const stripped: PropsBoardArtifact = { ...board, entries: board.entries.map((e) => (e.playerName === "Demo Bench Seven" ? { ...e, projection: null, projectionUnavailableReason: "none" } : e)) };
    render(<PropsBoardView board={stripped} />);
    expect(inputFor("Demo Bench Seven")).toBeDisabled();
    expect(inputFor("Demo Guard One")).toBeEnabled();
  });

  it("keeps a player's minutes when the market changes and recalculates with that market's own projection, line and rate", () => {
    render(<PropsBoardView board={board} />);
    type("Demo Guard One", "36");
    showMarket("Rebounds");
    expect(inputFor("Demo Guard One").value).toBe("36");
    expect(adjusted("Demo Guard One")).toBe(((3.8 * 36) / 34).toFixed(1));
    expect(detail("Demo Guard One", "adjustedDifference").textContent).toBe(`+${((3.8 * 36) / 34 - 3.5).toFixed(1)}`);
    expect(detail("Demo Guard One", "seasonRateEstimate").textContent).toContain((36 * (3.9 / 33.8)).toFixed(1));
    showMarket("Assists");
    expect(adjusted("Demo Guard One")).toBe(((9.4 * 36) / 34).toFixed(1));
    showMarket("Points");
    expect(inputFor("Demo Guard One").value).toBe("36");
  });

  it("states the sample behind the season-rate estimate, and flags a small one", () => {
    render(<PropsBoardView board={board} />);
    type("Demo Wing Two", "30");
    expect(detail("Demo Wing Two", "seasonRateEstimate").textContent).toContain("on 3 g · small sample");
    type("Demo Guard One", "30");
    expect(detail("Demo Guard One", "seasonRateEstimate").textContent).toContain("on 24 g");
    expect(detail("Demo Guard One", "seasonRateEstimate").textContent).not.toContain("small sample");
  });

  it("shows how far your minutes are from the JKB minutes, and highlights a large change", () => {
    render(<PropsBoardView board={board} />);
    type("Demo Guard One", "34");
    expect(detail("Demo Guard One", "adjustedProjection").textContent).toContain("× 1.00 JKB min");
    type("Demo Guard One", "48");
    expect(detail("Demo Guard One", "adjustedProjection").textContent).toContain(`× ${(48 / 34).toFixed(2)} JKB min`);
    type("Demo Big Four", "5");
    const note = within(detail("Demo Big Four", "adjustedProjection")).getByText(/× 0.19 JKB min/);
    expect(note.className).toMatch(/amber/);
    expect(note.getAttribute("title")).toMatch(/Large change/);
  });

  it("never prints a signed zero", () => {
    const flat: PropsBoardArtifact = { ...board, entries: board.entries.map((e) => (e.playerName === "Demo Guard One" && e.market === "pts" && e.line ? { ...e, line: { ...e.line, line: 26.12 } } : e)) };
    render(<PropsBoardView board={flat} />);
    expect(detail("Demo Guard One", "modelEdge").textContent).toBe("0.0");
  });
});

describe("reset", () => {
  it("resets one player and leaves the others", () => {
    render(<PropsBoardView board={board} />);
    type("Demo Guard One", "36");
    type("Demo Big Four", "20");
    fireEvent.click(within(rowOf("Demo Guard One").nextElementSibling as HTMLElement).getByRole("button", { name: /Reset minutes for Demo Guard One/ }));
    expect(inputFor("Demo Guard One").value).toBe("");
    expect(adjusted("Demo Guard One")).toBe("—");
    expect(adjusted("Demo Big Four")).toBe(((14.0 * 20) / 26).toFixed(1));
    expect(col("Demo Guard One", "jkbProjection").textContent).toBe("26.1");
  });

  it("only offers a per-player reset while an override is active", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Guard One");
    const reset = screen.getByRole("button", { name: /Reset minutes for Demo Guard One/ });
    expect(reset).toBeDisabled();
    type("Demo Guard One", "36");
    expect(reset).toBeEnabled();
  });

  it("resets everything at once, including an invalid entry and rows that are collapsed, and counts the active overrides", () => {
    render(<PropsBoardView board={board} />);
    const all = screen.getByTestId("reset-all-minutes");
    expect(all).toHaveAttribute("aria-disabled", "true");
    type("Demo Guard One", "36");
    type("Demo Big Four", "20");
    typeAndLeave("Demo Forward Three", "abc");
    fireEvent.click(toggleOf("Demo Big Four"));
    expect(all).toHaveTextContent("Reset all minutes (3)");
    fireEvent.click(all);
    for (const name of ["Demo Guard One", "Demo Big Four", "Demo Forward Three"]) expect(inputFor(name).value).toBe("");
    expect(all).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("sorting and filters survive the redesign", () => {
  it("sorts by season PPG and toggles direction, with players missing it last", () => {
    render(<PropsBoardView board={board} />);
    fireEvent.click(screen.getByRole("button", { name: "PPG" }));
    expect(playerOrder()[0]).toBe("Demo Guard One");
    expect(playerOrder().slice(-2)).toEqual(expect.arrayContaining(["Demo Bench Seven", "Demo Wing Six"]));
    fireEvent.click(screen.getByRole("button", { name: "PPG" }));
    expect(playerOrder().slice(-2)).toEqual(expect.arrayContaining(["Demo Bench Seven", "Demo Wing Six"]));
    expect(screen.getByRole("columnheader", { name: /PPG/ })).toHaveAttribute("aria-sort", "ascending");
  });

  it("sorts by the market's own per-game figure", () => {
    render(<PropsBoardView board={board} />);
    showMarket("Rebounds");
    fireEvent.click(screen.getByRole("button", { name: "RPG" }));
    expect(playerOrder()[0]).toBe("Demo Big Four");
  });

  it("sorts by the opponent's allowed figure and by matchup rank", () => {
    renderLegacy();
    fireEvent.click(screen.getByRole("button", { name: "Opp allows" }));
    const expected = rowsFor("pts")
      .filter((r) => r.dvp.kind === "ok")
      .sort((a, b) => (b.dvp.kind === "ok" ? b.dvp.comparison.blended?.allowedPerGame ?? 0 : 0) - (a.dvp.kind === "ok" ? a.dvp.comparison.blended?.allowedPerGame ?? 0 : 0))
      .map((r) => r.entry.playerName);
    expect(playerOrder().slice(0, expected.length)).toEqual(expected);
    expect(playerOrder().at(-1)).toBe("Demo Bench Seven");
    // Matchup sorts by rank, easiest first (rank 1 allows the most), then toughest first.
    fireEvent.click(screen.getByRole("button", { name: "Matchup" }));
    expect(playerOrder()[0]).toBe("Demo Big Four");
    expect(playerOrder().at(-1)).toBe("Demo Bench Seven");
    fireEvent.click(screen.getByRole("button", { name: "Matchup" }));
    expect(playerOrder()[0]).toBe("Demo Wing Two");
    expect(playerOrder().at(-1)).toBe("Demo Bench Seven");
  });

  it("sorts by the adjusted projection once minutes are entered and that column is shown", () => {
    render(<PropsBoardView board={board} />);
    openColumns();
    toggleColumn("adjustedProjection");
    type("Demo Big Four", "40");
    type("Demo Guard One", "20");
    fireEvent.click(screen.getByRole("button", { name: "Adj proj" }));
    expect(playerOrder().slice(0, 2)).toEqual(["Demo Big Four", "Demo Guard One"]);
  });

  it("still filters by search, team and position", () => {
    render(<PropsBoardView board={board} />);
    fireEvent.change(screen.getByPlaceholderText("Search"), { target: { value: "guard" } });
    expect(playerOrder().sort()).toEqual(["Demo Guard Five", "Demo Guard One"]);
    fireEvent.change(screen.getByPlaceholderText("Search"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Team"), { target: { value: "BOS" } });
    expect(playerOrder()).toHaveLength(8);
    fireEvent.change(screen.getByLabelText("Position"), { target: { value: "C" } });
    expect(playerOrder().sort()).toEqual(["Demo Big Eight", "Demo Big Four"]);
    expect(screen.getByText("2 props")).toBeInTheDocument();
  });
});

describe("mobile and accessibility", () => {
  it("keeps the table inside a labelled, keyboard-reachable scroll region so the page itself never scrolls sideways", () => {
    render(<PropsBoardView board={board} />);
    const region = screen.getByRole("region", { name: /player props: recent form, opponent defense vs\. position and JKB projections/ });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region.className).toMatch(/overflow-x-auto/);
    expect(region.querySelector("table")).toBeTruthy();
  });

  it("freezes the player column and gives every row a row header", () => {
    render(<PropsBoardView board={board} />);
    expect(screen.getAllByRole("rowheader")[0].className).toMatch(/sticky/);
    expect(screen.getAllByRole("rowheader")).toHaveLength(8);
    expect(screen.getByRole("columnheader", { name: /^Player/ }).className).toMatch(/sticky/);
  });

  it("lets a long name wrap on a phone and stay on one line on a wide screen", () => {
    render(<PropsBoardView board={board} />);
    const line = screen.getAllByTestId("player-name")[0].parentElement as HTMLElement;
    expect(line.className).toMatch(/md:whitespace-nowrap/);
    expect(line.className).not.toMatch(/(^|\s)whitespace-nowrap/);
  });

  it("gives each minutes field a decimal keypad, a name that includes the player and the range, and a touch-sized target", () => {
    render(<PropsBoardView board={board} />);
    const input = inputFor("Demo Guard One");
    expect(input).toHaveAttribute("inputmode", "decimal");
    expect(input.getAttribute("aria-label")).toBe("Your projected minutes for Demo Guard One, 0 to 48");
    expect(input.className).toMatch(/\bh-8\b/);
    const reset = screen.getByRole("button", { name: /Reset minutes for Demo Guard One/ });
    expect(reset.className).toMatch(/\bh-8\b/);
    expect(reset.className).toMatch(/\bw-8\b/);
    expect(toggleOf("Demo Guard One").className).toMatch(/\bh-8\b/);
  });

  it("hides the Columns menu on a phone, where the expanded row carries the detail", () => {
    render(<PropsBoardView board={board} />);
    expect(screen.getByTestId("columns-menu-trigger").closest("div")?.className).toMatch(/\bhidden\b.*\bmd:block\b/);
  });

  it("explains the two estimates in text on the page, not only in hover titles", () => {
    render(<PropsBoardView board={board} />);
    expect(screen.getByText(/the JKB projection × your minutes ÷ the JKB minutes/)).toBeInTheDocument();
    expect(screen.getByText(/your minutes × this season's stat per minute/)).toBeInTheDocument();
    expect(screen.getByText(/not saved, shared or sent anywhere/)).toBeInTheDocument();
  });

  it("explains the last-ten windows, the opponent window and the amber dot", () => {
    render(<PropsBoardView board={board} />);
    expect(screen.getByText(/last ten completed games this season/)).toBeInTheDocument();
    expect(screen.getByText(/with did-not-play and zero-minute games left out/)).toBeInTheDocument();
    expect(screen.getByText(/ten opponent games, never ten player-games/)).toBeInTheDocument();
    expect(screen.getByText(/do not change the JKB projection/)).toBeInTheDocument();
  });
});

describe("the minutes override is always reachable", () => {
  const narrow = () => stubViewport(false);

  it("keeps the editor in the expanded row on a narrow screen even when the Your min column is chosen", () => {
    localStorage.setItem(COLUMN_PREFERENCE_KEY, JSON.stringify({ version: 1, columns: ["mpg", "last5", "matchup", "jkbProjection", "userMinutes"] }));
    narrow();
    render(<PropsBoardView board={board} />);
    const panel = open("Demo Guard One");
    expect(within(panel).getByLabelText(/Your projected minutes for Demo Guard One,/)).toBeInTheDocument();
    expect(within(panel).queryByText(/Type minutes in the Your min column/)).toBeNull();
  });

  it("points to the Your min column only when that column is on screen", () => {
    localStorage.setItem(COLUMN_PREFERENCE_KEY, JSON.stringify({ version: 1, columns: ["jkbProjection", "userMinutes"] }));
    render(<PropsBoardView board={board} />);
    expect(within(open("Demo Guard One")).getByText(/Type minutes in the Your min column/)).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Your projected minutes for Demo Guard One,/)).toHaveLength(1);
  });

  it("marks a row that carries an override even while it is collapsed, and across a market switch", () => {
    render(<PropsBoardView board={board} />);
    expect(within(rowOf("Demo Guard One")).queryByTestId("override-chip")).toBeNull();
    type("Demo Guard One", "36");
    fireEvent.click(toggleOf("Demo Guard One"));
    expect(screen.queryByTestId("row-detail")).toBeNull();
    expect(within(rowOf("Demo Guard One")).getByTestId("override-chip").textContent).toBe("36.0 min");
    showMarket("Rebounds");
    expect(within(rowOf("Demo Guard One")).getByTestId("override-chip").textContent).toBe("36.0 min");
    fireEvent.click(screen.getByTestId("reset-all-minutes"));
    expect(screen.queryByTestId("override-chip")).toBeNull();
  });
});

describe("overrides stay in the page", () => {
  it("writes nothing to storage and makes no request", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<PropsBoardView board={board} />);
    type("Demo Guard One", "36");
    fireEvent.click(screen.getByRole("button", { name: /Reset minutes/ }));
    toggleOf("Demo Guard One").click();
    expect(setItem).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(document.cookie).toBe("");
    vi.unstubAllGlobals();
    stubViewport(true);
    setItem.mockRestore();
  });

  it("a fresh render starts with no overrides", () => {
    const first = render(<PropsBoardView board={board} />);
    type("Demo Guard One", "36");
    first.unmount();
    render(<PropsBoardView board={board} />);
    expect(inputFor("Demo Guard One").value).toBe("");
  });
});

describe("review hardening", () => {
  it("waits for the field to be left before showing an error, and applies nothing meanwhile", () => {
    render(<PropsBoardView board={board} />);
    type("Demo Guard One", ".");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(adjusted("Demo Guard One")).toBe("—");
    fireEvent.blur(inputFor("Demo Guard One"));
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("returns keyboard focus to the minutes field after a per-player reset, and keeps reset-all focusable", () => {
    render(<PropsBoardView board={board} />);
    type("Demo Guard One", "36");
    const reset = screen.getByRole("button", { name: /Reset minutes for Demo Guard One/ });
    reset.focus();
    fireEvent.click(reset);
    expect(inputFor("Demo Guard One")).toHaveFocus();
    type("Demo Big Four", "20");
    const all = screen.getByTestId("reset-all-minutes");
    all.focus();
    fireEvent.click(all);
    expect(all).toHaveFocus();
  });

  it("gives every row its own error id, even for two rows of the same player or names that sanitize alike", () => {
    const rows = board.entries.filter((e) => e.market === "pts" && e.playerName === "Demo Guard One");
    const twin = { ...rows[0], entryKey: `${rows[0].entryKey}-second-book` };
    const lookalike = { ...rows[0], entryKey: "x", playerName: "Demo Guard-One", gameKey: "2026-11-10|NYK@BOS" };
    const crowded: PropsBoardArtifact = { ...board, entries: [...board.entries, twin, lookalike] };
    render(<PropsBoardView board={crowded} />);
    for (const toggle of screen.getAllByTestId("row-toggle")) fireEvent.click(toggle);
    for (const input of screen.getAllByLabelText(/Your projected minutes for Demo Guard/)) {
      fireEvent.change(input, { target: { value: "abc" } });
      fireEvent.blur(input);
    }
    const ids = screen.getAllByRole("alert").map((a) => a.id);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(new Set(ids).size).toBe(ids.length);
    for (const input of screen.getAllByLabelText(/Your projected minutes for Demo Guard/)) {
      if (input.getAttribute("aria-invalid") === "true") expect(document.getElementById(input.getAttribute("aria-describedby") ?? "")?.getAttribute("role")).toBe("alert");
    }
  });
});

describe("player identity and visual hierarchy", () => {
  it("shows the player's team logo beside the name, with team, opponent and estimated position still written out", () => {
    render(<PropsBoardView board={board} />);
    const cell = within(rowOf("Demo Guard One")).getByTestId("player-cell");
    const logo = within(cell).getByTestId("team-logo");
    expect(logo).toHaveAttribute("data-team", "NYK");
    expect(logo.className).toMatch(/h-9/);
    expect(logo.className).toMatch(/md:h-10/);
    expect(cell.textContent).toContain("NYK vs BOS");
    expect(cell.textContent).toContain("PG");
    expect(cell.textContent).toContain("(est.)");
  });

  it("falls back to a badge in the team's own colors when the logo cannot load, never a broken image", () => {
    render(<PropsBoardView board={board} />);
    const logo = within(within(rowOf("Demo Guard One")).getByTestId("player-cell")).getByTestId("team-logo");
    // jsdom loads nothing: the badge stands in until (and unless) the image arrives.
    expect(logo).toHaveAttribute("data-logo-state", "loading");
    expect(logo.textContent).toBe("NYK");
    const img = logo.querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("https://a.espncdn.com/i/teamlogos/nba/500/ny.png");
    expect(img.getAttribute("alt")).toBe("");
    fireEvent.error(img);
    expect(logo).toHaveAttribute("data-logo-state", "failed");
    expect(logo.querySelector("img")).toBeNull();
    expect(logo.textContent).toBe("NYK");
  });

  it("colors the frozen player cell from the player's own team, so both teams in one game look different", () => {
    render(<PropsBoardView board={board} />);
    const nyk = within(rowOf("Demo Guard One")).getByTestId("player-cell");
    const bos = within(rowOf("Demo Guard Five")).getByTestId("player-cell");
    expect(nyk.style.borderLeft).toMatch(/5px solid/);
    expect(nyk.style.borderLeft).not.toBe(bos.style.borderLeft);
    expect(nyk.className).toMatch(/\bsticky\b/);
    // Opaque wash: nothing scrolls visibly under the frozen column.
    expect(nyk.style.backgroundImage).toMatch(/linear-gradient/);
    expect(nyk.style.backgroundImage).not.toMatch(/rgba|transparent/);
  });

  it("uses a neutral badge, not a guessed color, for a player with no team", () => {
    const unknown: PropsBoardArtifact = { ...board, entries: board.entries.map((e) => (e.playerName === "Demo Bench Seven" ? { ...e, team: null } : e)) };
    render(<PropsBoardView board={unknown} />);
    const logo = within(within(rowOf("Demo Bench Seven")).getByTestId("player-cell")).getByTestId("team-logo");
    expect(logo).toHaveAttribute("data-logo-state", "none");
    expect(logo.textContent).toBe("—");
  });

  it("makes the favorable and tough matchups solid green and red with an arrow, a word and the rank", () => {
    render(<PropsBoardView board={board} />);
    const fav = within(col("Demo Big Four", "matchup")).getByText(/Favorable/).closest("span[title]") as HTMLElement;
    const tough = within(col("Demo Guard One", "matchup")).getByText(/Tough/).closest("span[title]") as HTMLElement;
    expect(fav.className).toMatch(/bg-emerald-700/);
    expect(tough.className).toMatch(/bg-rose-700/);
    expect(fav.textContent).toMatch(/^▲ Favorable #\d+$/);
    expect(tough.textContent).toMatch(/^▼ Tough #\d+$/);
    // The ten-game figure is not washed with the season-long tier: only the labelled Matchup chip carries it.
    expect(col("Demo Big Four", "oppLast10").className).not.toMatch(/emerald|rose/);
    expect(col("Demo Guard One", "oppLast10").className).not.toMatch(/emerald|rose/);
  });

  it("gives the JKB projection a navy pill and header", () => {
    render(<PropsBoardView board={board} />);
    expect(within(col("Demo Guard One", "jkbProjection")).getByTestId("jkb-value").className).toMatch(/bg-blue-900.*text-white/);
    expect(screen.getByTestId("head-jkbProjection").className).toMatch(/bg-blue-900/);
  });

  it("keeps amber for sample-size warnings only", () => {
    render(<PropsBoardView board={board} />);
    open("Demo Wing Two");
    const amber = Array.from(document.querySelectorAll("[class*='amber']"));
    expect(amber.length).toBeGreaterThan(0);
    // Every amber element is a small-sample dot (with its game count) or the words about one.
    for (const el of amber) expect(el.getAttribute("role") === "img" || el.querySelector("[role=img]") !== null || /^\d+g$|small sample|Small sample|amber dot/i.test(el.textContent ?? ""), el.outerHTML).toBe(true);
  });

  it("separates rows and the header with visible lines and a dark header", () => {
    render(<PropsBoardView board={board} />);
    expect(screen.getAllByRole("columnheader")[0].className).toMatch(/bg-slate-900/);
    expect(rowOf("Demo Guard One").className).toMatch(/border-t border-slate-200/);
  });
});

describe("player last 10", () => {
  it("lists the ten results oldest to newest on hover, and the L10 figure is their average", () => {
    render(<PropsBoardView board={board} />);
    const title = col("Demo Guard One", "last10").querySelector("[title]")?.getAttribute("title") ?? "";
    expect(title).toMatch(/PTS by game, oldest to newest: /);
    const listed = (title.split("oldest to newest: ")[1] ?? "").split("; ");
    expect(listed).toHaveLength(10);
    const values = listed.map((entry) => Number(entry.split(" ").at(-1)));
    expect(values.reduce((a, b) => a + b, 0) / 10).toBeCloseTo(26.8, 1);
  });

  it("draws one bar per game in the expanded row, oldest at the left, each labelled with its date, opponent and exact result", () => {
    render(<PropsBoardView board={board} />);
    const chart = within(open("Demo Guard One")).getByTestId("player-l10-chart");
    const bars = within(chart).getAllByTestId("player-l10-chart-bar");
    expect(bars).toHaveLength(10);
    const labels = bars.map((b) => b.getAttribute("aria-label") ?? "");
    const times = labels.map((l) => /^([A-Z][a-z]{2}) (\d+),/.exec(l)).map((m) => (m ? new Date(`${m[1]} ${m[2]}, 2026`).getTime() : Number.NaN));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(labels[0]).toMatch(/^Oct \d+, vs [A-Z]{3}: [\d.]+ PTS$/);
    expect(labels[1]).toMatch(/^Oct \d+, @ [A-Z]{3}: /);
    expect(chart.textContent).toContain("oldest");
    expect(chart.textContent).toContain("newest");
  });

  it("shows the exact game on hover, focus or tap, and clears it", () => {
    render(<PropsBoardView board={board} />);
    const chart = within(open("Demo Guard One")).getByTestId("player-l10-chart");
    const bars = within(chart).getAllByTestId("player-l10-chart-bar");
    const readout = within(chart).getByTestId("player-l10-chart-readout");
    expect(readout.textContent).toMatch(/Hover, focus or tap/);
    fireEvent.mouseEnter(bars[0]);
    expect(readout.textContent).toMatch(/Oct \d+ · vs [A-Z]{3} · [\d.]+ PTS · 34 min/);
    fireEvent.mouseLeave(within(chart).getByRole("group"));
    expect(readout.textContent).toMatch(/Hover, focus or tap/);
    // A tap on a touch screen arrives as hover-then-click: the game stays shown, it does not flip off.
    fireEvent.mouseEnter(bars[3]);
    fireEvent.click(bars[3]);
    expect(bars[3]).toHaveAttribute("aria-current", "true");
    expect(readout.textContent).toMatch(/Oct \d+ · /);
    fireEvent.click(bars[5]);
    expect(bars[3]).not.toHaveAttribute("aria-current");
    expect(bars[5]).toHaveAttribute("aria-current", "true");
    fireEvent.blur(bars[5]);
    expect(readout.textContent).toMatch(/Hover, focus or tap/);
  });

  it("follows the selected market", () => {
    render(<PropsBoardView board={board} />);
    showMarket("Rebounds");
    const panel = open("Demo Guard One");
    expect(within(within(panel).getByTestId("player-l10-chart")).getAllByTestId("player-l10-chart-bar")[0].getAttribute("aria-label")).toMatch(/REB$/);
    expect(within(panel).getByTestId("player-l10-summary").textContent).toMatch(/REB per game/);
  });

  it("reports the real sample for a player with fewer than ten games, flagged as small, and never pads", () => {
    render(<PropsBoardView board={board} />);
    const panel = open("Demo Wing Two");
    expect(within(within(panel).getByTestId("player-l10-chart")).getAllByTestId("player-l10-chart-bar")).toHaveLength(3);
    expect(within(panel).getByTestId("player-l10-summary").textContent).toMatch(/3 games/);
    expect(within(panel).getByTestId("player-l10-summary").textContent).toMatch(/small sample \(3 of 10\)/);
  });

  it("says plainly that a player with no games this season has no window, and that last season is not used", () => {
    render(<PropsBoardView board={board} />);
    const note = within(open("Demo Wing Six")).getByTestId("player-l10-note");
    expect(note.textContent).toMatch(/No completed games this season/);
    expect(note.textContent).toMatch(/Last season is never used/);
  });

  it("tells a viewer of a board built before game-by-game results to rebuild, rather than drawing nothing", () => {
    const old: PropsBoardArtifact = { ...board, entries: board.entries.map((e) => (e.seasonStats ? { ...e, seasonStats: { ...e.seasonStats, recentGames: undefined } } : e)) };
    render(<PropsBoardView board={old} />);
    expect(within(open("Demo Guard One")).getByTestId("player-l10-note").textContent).toMatch(/Rebuild the private preview board/);
  });
});

describe("opponent last 10 vs. position", () => {
  const OPP = "Demo Guard One"; // NYK PG, opponent BOS: ten games on file
  const SHORT = "Demo Guard Five"; // BOS SG, opponent NYK: four games on file

  it("shows the opponent's own ten games for the player's estimated position as one bar per game", () => {
    render(<PropsBoardView board={board} />);
    const panel = open(OPP);
    const chart = within(panel).getByTestId("opp-l10-chart");
    expect(within(chart).getAllByTestId("opp-l10-chart-bar")).toHaveLength(10);
    expect(within(panel).getByTestId("opp-l10-panel").textContent).toContain("BOS last 10 · PTS allowed to PG");
    const row = rowsFor("pts").find((r) => r.entry.playerName === OPP);
    expect(within(panel).getByTestId("opp-l10-summary").textContent).toContain((row?.opponentL10.average ?? Number.NaN).toFixed(1));
  });

  it("is chronological, and each bar names the date, the team that faced the defense and the figure", () => {
    render(<PropsBoardView board={board} />);
    const bars = within(within(open(OPP)).getByTestId("opp-l10-chart")).getAllByTestId("opp-l10-chart-bar");
    const times = bars.map((b) => /^([A-Z][a-z]{2}) (\d+),/.exec(b.getAttribute("aria-label") ?? "")).map((m) => (m ? new Date(`${m[1]} ${m[2]}, 2026`).getTime() : Number.NaN));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(bars[0].getAttribute("aria-label")).toMatch(/^Oct \d+, (vs|@) [A-Z]{3}: [\d.]+ PTS$/);
  });

  it("shows the sample size, the attributed-minutes coverage and the method limits in the details", () => {
    render(<PropsBoardView board={board} />);
    const limits = within(open(OPP)).getByTestId("opp-l10-limits").textContent ?? "";
    expect(limits).toMatch(/10 games of BOS's 14 completed this season/);
    expect(limits).toMatch(/\d+% of opposing players' minutes had an estimated position/);
    expect(limits).toMatch(/Estimated primary position, regular-season games only; context, not a projection input/);
  });

  it("shows the actual N with a small-sample warning when the opponent has fewer than ten games, and never pads", () => {
    render(<PropsBoardView board={board} />);
    expect(col(SHORT, "oppLast10").textContent).toMatch(/4g$/);
    expect(within(col(SHORT, "oppLast10")).getByRole("img", { name: /Only 4 games of NYK's season so far/ }).className).toMatch(/amber/);
    expect(within(col(OPP, "oppLast10")).queryByRole("img")).toBeNull();
    const panel = open(SHORT);
    expect(within(within(panel).getByTestId("opp-l10-chart")).getAllByTestId("opp-l10-chart-bar")).toHaveLength(4);
    expect(within(panel).getByTestId("opp-l10-summary").textContent).toMatch(/small sample \(4 of 10\)/);
    expect(within(panel).getByTestId("opp-l10-limits").textContent).toMatch(/a small sample, not padded to ten/);
  });

  it("shows a game with no attributable minutes as a gap that is left out of the average, not a zero", () => {
    render(<PropsBoardView board={board} />);
    const panel = open("Demo Big Four"); // NYK C, opponent BOS: its fifth game has no attributed minutes at C
    const bars = within(within(panel).getByTestId("opp-l10-chart")).getAllByTestId("opp-l10-chart-bar");
    expect(bars.filter((b) => /no figure/.test(b.getAttribute("aria-label") ?? ""))).toHaveLength(1);
    expect(bars[4].getAttribute("aria-label")).toMatch(/no figure/);
    expect(within(panel).getByTestId("opp-l10-summary").textContent).toMatch(/average of 9 of 10 games/);
    expect(within(panel).getByTestId("opp-l10-limits").textContent).toMatch(/1 game with no attributed minutes shown as gaps and left out of the average/);
    const row = rowsFor("pts").find((r) => r.entry.playerName === "Demo Big Four");
    expect(row?.opponentL10).toMatchObject({ games: 10, gamesWithFigure: 9 });
  });

  it("explains N/A states instead of inventing a number: no position, no sequences on the board, no games", () => {
    render(<PropsBoardView board={board} />);
    expect(col("Demo Bench Seven", "oppLast10").textContent).toBe("N/A");
    expect(col("Demo Bench Seven", "oppLast10").querySelector("[title]")?.getAttribute("title")).toMatch(/No estimated position/);
    expect(within(open("Demo Bench Seven")).getByTestId("opp-l10-note").textContent).toMatch(/No estimated position/);
    cleanup();
    const { opponentRecent: _gone, ...old } = board;
    render(<PropsBoardView board={old} />);
    expect(col("Demo Guard One", "oppLast10").textContent).toBe("N/A");
    expect(col("Demo Guard One", "oppLast10").querySelector("[title]")?.getAttribute("title")).toMatch(/rebuild the private preview board/);
    expect(within(open("Demo Guard One")).getByTestId("opp-l10-note").textContent).toMatch(/Rebuild the private preview board/);
    cleanup();
    render(<PropsBoardView board={{ ...board, opponentRecent: {} }} />);
    expect(col("Demo Guard One", "oppLast10").textContent).toBe("—");
    expect(within(open("Demo Guard One")).getByTestId("opp-l10-note").textContent).toMatch(/no completed game this season/);
  });

  it("follows the selected market and sorts by the opponent's last-ten allowance", () => {
    render(<PropsBoardView board={board} />);
    showMarket("Rebounds");
    expect(within(within(open(OPP)).getByTestId("opp-l10-chart")).getAllByTestId("opp-l10-chart-bar")[0].getAttribute("aria-label")).toMatch(/REB$/);
    fireEvent.click(screen.getByRole("button", { name: "Opp L10 REB" }));
    const averages = rowsFor("reb")
      .filter((r) => r.opponentL10.average !== null)
      .sort((a, b) => (b.opponentL10.average ?? 0) - (a.opponentL10.average ?? 0))
      .map((r) => r.entry.playerName);
    expect(playerOrder().slice(0, averages.length)).toEqual(averages);
    expect(playerOrder().at(-1)).toBe("Demo Bench Seven");
  });

  it("never changes a JKB projection: the same numbers with and without the windows", () => {
    const { opponentRecent: _gone, ...old } = board;
    const strippedEntries = board.entries.map((e) => (e.seasonStats ? { ...e, seasonStats: { ...e.seasonStats, recentGames: undefined } } : e));
    const withWindows = buildBoardRows(board, "pts").map((r) => [r.entry.projection, r.difference, r.jkbTriple]);
    const without = buildBoardRows({ ...old, entries: strippedEntries }, "pts").map((r) => [r.entry.projection, r.difference, r.jkbTriple]);
    expect(withWindows).toEqual(without);
  });

  it("keeps the minutes override reachable in the same expanded row that holds the charts, including on a phone", () => {
    stubViewport(false);
    render(<PropsBoardView board={board} />);
    const panel = open(OPP);
    expect(within(panel).getByTestId("player-l10-chart")).toBeInTheDocument();
    expect(within(panel).getByTestId("opp-l10-chart")).toBeInTheDocument();
    expect(inputFor(OPP)).toBeInTheDocument();
  });
});
