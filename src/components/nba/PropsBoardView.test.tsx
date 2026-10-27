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
  it("shows player, MPG, PPG, PTS/MIN, last five, opponent allowed, matchup and JKB projection, in that order, and nothing else", () => {
    render(<PropsBoardView board={board} />);
    expect(headers()).toEqual(["Player", "MPG", "PPG", "PTS/MIN", "L5 PTS", "Opp allows", "Matchup", "JKB proj"]);
  });

  it("uses the selected market's own per-game, per-minute and last-five labels", () => {
    render(<PropsBoardView board={board} />);
    showMarket("Rebounds");
    expect(headers()).toEqual(["Player", "MPG", "RPG", "REB/MIN", "L5 REB", "Opp allows", "Matchup", "JKB proj"]);
    showMarket("Assists");
    expect(headers()).toEqual(["Player", "MPG", "APG", "AST/MIN", "L5 AST", "Opp allows", "Matchup", "JKB proj"]);
  });

  it("keeps every optional field out of the default view", () => {
    render(<PropsBoardView board={board} />);
    const h = headers().join("|");
    for (const absent of ["Line", "O / U", "JKB min", "Your min", "Adj proj", "Adj − line", "JKB − line", "L10", "DvP", "Sample", "Season-rate", "Source"]) expect(h, absent).not.toContain(absent);
  });

  it("computes each cell from the player's own figures for the selected market", () => {
    render(<PropsBoardView board={board} />);
    expect(col("Demo Guard One", "mpg").textContent).toBe("33.8");
    expect(col("Demo Guard One", "perGame").textContent).toBe("25.4");
    expect(col("Demo Guard One", "perMinute").textContent).toBe((25.4 / 33.8).toFixed(2));
    expect(col("Demo Guard One", "last5").textContent).toBe("28.6");
    expect(col("Demo Guard One", "jkbProjection").textContent).toBe("26.1");
    showMarket("Rebounds");
    expect(col("Demo Big Four", "perGame").textContent).toBe("11.9");
    expect(col("Demo Big Four", "perMinute").textContent).toBe((11.9 / 25.5).toFixed(2));
    expect(col("Demo Big Four", "last5").textContent).toBe("13.4");
    expect(col("Demo Big Four", "mpg").textContent).toBe("25.5");
    showMarket("Assists");
    expect(col("Demo Guard One", "perGame").textContent).toBe("8.6");
    expect(col("Demo Guard One", "last5").textContent).toBe("9.2");
  });

  it("shows the opponent's allowed-per-game for the player's estimated position, with its rank", () => {
    render(<PropsBoardView board={board} />);
    for (const name of ["Demo Guard One", "Demo Big Four", "Demo Forward Three"]) {
      const blended = dvpOf(name).blended;
      expect(col(name, "dvpAllowed").textContent).toBe(`${blended?.allowedPerGame.toFixed(1)}#${blended?.rank}`);
    }
  });

  it("starts sorted by the JKB projection, highest first, with the projection header marking it", () => {
    render(<PropsBoardView board={board} />);
    expect(playerOrder()[0]).toBe("Demo Guard One");
    expect(screen.getByTestId("head-jkbProjection")).toHaveAttribute("aria-sort", "descending");
  });

  it("keeps only the last five, matchup and projection as table columns on a phone: the rest are hidden below the md breakpoint", () => {
    render(<PropsBoardView board={board} />);
    const onPhone = ["last5", "matchup", "jkbProjection"];
    for (const id of ["mpg", "perGame", "perMinute", "last5", "dvpAllowed", "matchup", "jkbProjection"]) {
      const hidden = /\bhidden\b/.test(screen.getByTestId(`head-${id}`).className) && /\bmd:table-cell\b/.test(screen.getByTestId(`head-${id}`).className);
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
    expect(headers()).toEqual(["Player", "Opp allows", "Matchup", "JKB proj"]);
    expect(screen.queryByText(/completed games this season/)).toBeNull();
  });
});

describe("last five games", () => {
  it("marks a short window with a small amber dot that says how many games it covers", () => {
    render(<PropsBoardView board={board} />);
    expect(col("Demo Wing Two", "last5").textContent).toBe("15.33g");
    expect(within(col("Demo Wing Two", "last5")).getByRole("img", { name: /Only 3 games so far this season/ }).className).toMatch(/amber/);
    expect(within(col("Demo Guard One", "last5")).queryByRole("img")).toBeNull();
  });

  it("shows a dash for a player with no games this season, never a number from last season", () => {
    render(<PropsBoardView board={board} />);
    expect(col("Demo Wing Six", "last5").textContent).toBe("—");
    expect(col("Demo Wing Six", "last5").querySelector("[title]")?.getAttribute("title")).toBe("No games this season yet");
  });

  it("shows N/A for a player with no statistics at all", () => {
    render(<PropsBoardView board={board} />);
    expect(col("Demo Bench Seven", "last5").textContent).toBe("N/A");
    expect(col("Demo Bench Seven", "mpg").textContent).toBe("N/A");
  });

  it("says a board built before last-five averages must be rebuilt, instead of showing a number or a dash", () => {
    render(<PropsBoardView board={withoutLastWindows} />);
    expect(col("Demo Guard One", "last5").textContent).toBe("N/A");
    expect(col("Demo Guard One", "last5").querySelector("[title]")?.getAttribute("title")).toMatch(/rebuild/);
    expect(col("Demo Guard One", "mpg").textContent).toBe("33.8");
  });

  it("sorts by the last-five figure, with players missing it last in either direction", () => {
    render(<PropsBoardView board={board} />);
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
    render(<PropsBoardView board={board} />);
    expect(within(col("Demo Wing Two", "mpg")).getByRole("img", { name: /Small sample: 3 games this season/ })).toBeInTheDocument();
    // The count is written out, not only colored, so a touch or color-blind reader sees it too.
    expect(col("Demo Wing Two", "mpg").textContent).toBe("29.13g");
    expect(col("Demo Wing Two", "last5").textContent).toContain("3g");
    expect(col("Demo Guard One", "last5").textContent).not.toMatch(/\dg/);
    expect(within(col("Demo Guard One", "mpg")).queryByRole("img")).toBeNull();
  });

  it("shows a dash for the current season when there are no games yet", () => {
    render(<PropsBoardView board={board} />);
    expect(col("Demo Wing Six", "mpg").textContent).toBe("—");
    expect(col("Demo Wing Six", "perGame").textContent).toBe("—");
  });

  it("explains the sample in the expanded row: the season and games, with last season on its own beside a short sample", () => {
    render(<PropsBoardView board={board} />);
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
  const chip = (name: string) => within(col(name, "matchup")).getByText(/Favorable|Neutral|Tough/);

  it("labels a matchup Favorable, Neutral or Tough from the opponent's rank, with a green, gray or red chip", () => {
    render(<PropsBoardView board={board} />);
    expect(dvpOf("Demo Big Four").tier).toBe("favorable");
    expect(chip("Demo Big Four").textContent).toBe("Favorable");
    expect(chip("Demo Big Four").className).toMatch(/emerald/);
    expect(dvpOf("Demo Forward Three").tier).toBe("neutral");
    expect(chip("Demo Forward Three").textContent).toBe("Neutral");
    expect(chip("Demo Forward Three").className).toMatch(/slate/);
    expect(dvpOf("Demo Guard One").tier).toBe("tough");
    expect(chip("Demo Guard One").textContent).toBe("Tough");
    expect(chip("Demo Guard One").className).toMatch(/rose/);
  });

  it("tints the Opp allows and Matchup cells to match, while the allowed figure and rank stay printed", () => {
    render(<PropsBoardView board={board} />);
    for (const [name, tone] of [["Demo Big Four", /emerald/], ["Demo Forward Three", /slate/], ["Demo Guard One", /rose/]] as const) {
      expect(col(name, "dvpAllowed").className).toMatch(tone);
      expect(col(name, "matchup").className).toMatch(tone);
      expect(col(name, "dvpAllowed").textContent).toMatch(/^\d+\.\d#\d+$/);
    }
  });

  it("shows a neutral N/A, with the reason on hover, for a player with no estimated position", () => {
    render(<PropsBoardView board={board} />);
    for (const id of ["dvpAllowed", "matchup"]) {
      expect(col("Demo Bench Seven", id).textContent).toBe("N/A");
      expect(col("Demo Bench Seven", id).querySelector("[title]")?.getAttribute("title")).toMatch(/No usable position/);
      expect(col("Demo Bench Seven", id).className).not.toMatch(/emerald|rose|amber/);
    }
    expect(rowOf("Demo Bench Seven").textContent).toContain("pos N/A");
  });

  it("gives the JKB projection a navy emphasis, in the header and every cell", () => {
    render(<PropsBoardView board={board} />);
    expect(screen.getByTestId("head-jkbProjection").className).toMatch(/blue/);
    expect(col("Demo Guard One", "jkbProjection").className).toMatch(/blue/);
    expect(within(col("Demo Guard One", "jkbProjection")).getByText("26.1").className).toMatch(/blue-900/);
  });

  it("says once, in amber, that this season's DvP sample is small, and does not repeat it on every row", () => {
    render(<PropsBoardView board={board} />);
    const note = screen.getByTestId("dvp-sample-note");
    expect(note.textContent).toMatch(/3 games per team/);
    expect(within(note).getByRole("img").className).toMatch(/amber/);
    expect(within(col("Demo Guard One", "dvpAllowed")).queryByRole("img")).toBeNull();
  });

  it("labels DvP as the estimated primary-position view with incomplete position coverage", () => {
    render(<PropsBoardView board={board} />);
    expect(screen.getByText(/estimated primary-position Defense vs\. Position/)).toBeInTheDocument();
    expect(screen.getByText(/Position coverage is incomplete/)).toBeInTheDocument();
    expect(screen.getByText(/Favorable 1–10, Neutral 11–20, Tough 21–30/)).toBeInTheDocument();
  });
});

describe("the Columns menu", () => {
  it("lists every optional field, with the defaults checked and the rest unchecked", () => {
    render(<PropsBoardView board={board} />);
    openColumns();
    for (const id of ["mpg", "perGame", "perMinute", "last5", "dvpAllowed", "matchup", "jkbProjection"]) expect(screen.getByTestId(`column-toggle-${id}`), id).toBeChecked();
    for (const id of ["line", "overUnder", "jkbMinutes", "userMinutes", "adjustedProjection", "modelEdge", "last10", "dvpPrior", "dvpCurrent", "seasonRateEstimate", "seasonSample", "lastSeason"]) expect(screen.getByTestId(`column-toggle-${id}`), id).not.toBeChecked();
  });

  it("adds an optional column, in its registry position, and removes it again", () => {
    render(<PropsBoardView board={board} />);
    openColumns();
    toggleColumn("last10");
    toggleColumn("line");
    toggleColumn("overUnder");
    expect(headers()).toEqual(["Player", "MPG", "PPG", "PTS/MIN", "L5 PTS", "L10 PTS", "Opp allows", "Matchup", "Line", "O / U", "JKB proj"]);
    expect(col("Demo Guard One", "last10").textContent).toBe("26.8");
    expect(col("Demo Guard One", "line").textContent).toBe("24.5");
    expect(col("Demo Guard One", "overUnder").textContent).toBe("-115 / -105");
    toggleColumn("line");
    expect(headers()).not.toContain("Line");
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
    for (const id of ["mpg", "last5", "last10", "seasonSample"]) expect(screen.getByTestId(`column-toggle-${id}`), id).toBeDisabled();
    expect(screen.getByTestId("column-toggle-line")).toBeEnabled();
  });

  it("returns to the default columns, and reports the shown count", () => {
    render(<PropsBoardView board={board} />);
    openColumns();
    expect(screen.getByTestId("columns-menu-trigger").textContent).toContain("(7)");
    expect(screen.getByTestId("columns-reset")).toBeDisabled();
    toggleColumn("line");
    toggleColumn("mpg");
    expect(screen.getByTestId("columns-menu-trigger").textContent).toContain("(7)");
    expect(screen.getByTestId("columns-reset")).toBeEnabled();
    fireEvent.click(screen.getByTestId("columns-reset"));
    expect(headers()).toEqual(["Player", "MPG", "PPG", "PTS/MIN", "L5 PTS", "Opp allows", "Matchup", "JKB proj"]);
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
    expect(headers()).toEqual(["Player", "L5 PTS", "Matchup"]);
    expect(screen.getByTestId("head-last5")).toHaveAttribute("aria-sort", "descending");
    expect(screen.getByTestId("head-matchup")).toHaveAttribute("aria-sort", "none");
  });

  it("falls back to the projection sort when the sorted column is hidden", () => {
    render(<PropsBoardView board={board} />);
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
    toggleColumn("line");
    expect(setItem).toHaveBeenCalledTimes(1);
    const [key, value] = setItem.mock.calls[0];
    expect(key).toBe(COLUMN_PREFERENCE_KEY);
    expect(JSON.parse(String(value))).toEqual({ version: 1, columns: ["mpg", "perGame", "perMinute", "last5", "dvpAllowed", "matchup", "line", "jkbProjection"] });
    first.unmount();
    render(<PropsBoardView board={board} />);
    expect(headers()).toContain("Line");
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
    toggleColumn("line");
    expect(localStorage.getItem(COLUMN_PREFERENCE_KEY)).not.toBeNull();
    fireEvent.click(screen.getByTestId("columns-reset"));
    expect(localStorage.getItem(COLUMN_PREFERENCE_KEY)).toBeNull();
  });

  it("uses the defaults for a corrupt stored value and drops ids it does not know", () => {
    localStorage.setItem(COLUMN_PREFERENCE_KEY, "{broken");
    const first = render(<PropsBoardView board={board} />);
    expect(headers()).toEqual(["Player", "MPG", "PPG", "PTS/MIN", "L5 PTS", "Opp allows", "Matchup", "JKB proj"]);
    first.unmount();
    localStorage.setItem(COLUMN_PREFERENCE_KEY, JSON.stringify({ columns: ["last10", "Demo Guard One", "jkbProjection"] }));
    render(<PropsBoardView board={board} />);
    expect(headers()).toEqual(["Player", "L10 PTS", "JKB proj"]);
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
    toggleColumn("line");
    expect(headers()).toContain("Line");
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
    render(<PropsBoardView board={board} />);
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
    render(<PropsBoardView board={board} />);
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

  it("explains the last-five window and the amber dot", () => {
    render(<PropsBoardView board={board} />);
    expect(screen.getByText(/last five completed games this season/)).toBeInTheDocument();
    expect(screen.getByText(/with did-not-play and zero-minute games left out/)).toBeInTheDocument();
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
