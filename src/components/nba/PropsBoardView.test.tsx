import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import PropsBoardView from "@/components/nba/PropsBoardView";
import { buildDemoBoard } from "@/lib/nba/props/__fixtures__/boardDemo";
import type { PropsBoardArtifact } from "@/lib/nba/props/propsBoard";

// Each test renders a wide table in jsdom, several times for market switches: allow for a loaded machine.
vi.setConfig({ testTimeout: 30_000 });

afterEach(cleanup);

const board = buildDemoBoard();
const rowOf = (name: string): HTMLElement => screen.getByRole("rowheader", { name: new RegExp(name) }).closest("tr") as HTMLElement;
const inputFor = (name: string): HTMLInputElement => screen.getByLabelText(new RegExp(`Your projected minutes for ${name},`)) as HTMLInputElement;
const cell = (name: string, testId: string): HTMLElement => within(rowOf(name)).getByTestId(testId);
/** The adjusted projection itself, without the "× n JKB min" note beneath it. */
const adjusted = (name: string): string | null => {
  const el = cell(name, "adjusted-projection");
  return el.querySelector("div")?.textContent ?? el.textContent;
};
const type = (name: string, text: string) => fireEvent.change(inputFor(name), { target: { value: text } });
const typeAndLeave = (name: string, text: string) => {
  type(name, text);
  fireEvent.blur(inputFor(name));
};
const headers = (): string[] => screen.getAllByRole("columnheader").map((h) => h.textContent?.replace(/\s+/g, " ").trim() ?? "");
const showMarket = (label: "Points" | "Rebounds" | "Assists") => fireEvent.click(screen.getByRole("button", { name: label }));
const playerOrder = (): string[] => screen.getAllByRole("rowheader").map((h) => h.querySelector("div")?.textContent ?? "");

describe("columns by market", () => {
  it("shows season MPG, PPG and PTS/min with the JKB and your-minutes columns in the points view, and no rebound or assist columns", () => {
    render(<PropsBoardView board={board} />);
    const h = headers();
    for (const label of ["Your min", "JKB proj", "JKB min", "JKB − line", "Adj proj", "Adj − line", "Season-rate est", "JKB PTS/REB/AST", "Season sample", "MPG", "PPG", "PTS/min"]) expect(h.some((x) => x.toUpperCase().startsWith(label.toUpperCase())), label).toBe(true);
    for (const absent of ["RPG", "REB/MIN", "APG", "AST/MIN"]) expect(h).not.toContain(absent);
  });

  it("adds rebounds per game and per minute in the rebounds view, and keeps season MPG", () => {
    render(<PropsBoardView board={board} />);
    showMarket("Rebounds");
    const h = headers().map((x) => x.toUpperCase());
    for (const label of ["MPG", "PPG", "PTS/MIN", "RPG", "REB/MIN"]) expect(h, label).toContain(label);
    expect(h).not.toContain("APG");
  });

  it("adds assists per game and per minute in the assists view, and keeps season MPG", () => {
    render(<PropsBoardView board={board} />);
    showMarket("Assists");
    const h = headers().map((x) => x.toUpperCase());
    for (const label of ["MPG", "PPG", "PTS/MIN", "APG", "AST/MIN"]) expect(h, label).toContain(label);
    expect(h).not.toContain("RPG");
  });

  it("computes each market's own per-game and per-minute figure from the season totals", () => {
    render(<PropsBoardView board={board} />);
    showMarket("Rebounds");
    expect(cell("Demo Big Four", "season-rpg").textContent).toContain("11.9");
    expect(cell("Demo Big Four", "season-reb-min").textContent).toContain((11.9 / 25.5).toFixed(2));
    expect(cell("Demo Big Four", "season-mpg").textContent).toContain("25.5");
    showMarket("Assists");
    expect(cell("Demo Guard One", "season-apg").textContent).toContain("8.6");
    expect(cell("Demo Guard One", "season-ast-min").textContent).toContain((8.6 / 33.8).toFixed(2));
  });

  it("shows the JKB projection in all three markets for each player", () => {
    render(<PropsBoardView board={board} />);
    expect(cell("Demo Guard One", "jkb-triple").textContent).toBe("26.1 / 3.8 / 9.4");
    expect(cell("Demo Wing Six", "jkb-triple").textContent).toBe("— / — / —");
  });
});

describe("season sample labelling and early-season handling", () => {
  it("labels the season and the number of games, and the JKB minutes beside them", () => {
    render(<PropsBoardView board={board} />);
    expect(cell("Demo Guard One", "season-sample").textContent).toContain("2026-27 · 24 games");
    expect(cell("Demo Guard One", "season-mpg").textContent).toContain("33.8");
    expect(cell("Demo Guard One", "jkb-minutes").textContent).toBe("34.0");
  });

  it("shows last season separately, never mixed in, when the current sample is short", () => {
    render(<PropsBoardView board={board} />);
    const sample = cell("Demo Wing Two", "season-sample").textContent ?? "";
    expect(sample).toContain("2026-27 · 3 games");
    expect(sample).toContain("2025-26 · 70 games");
    const ppg = cell("Demo Wing Two", "season-ppg");
    expect(ppg.textContent).toContain("15.3");
    expect(ppg.textContent).toContain("26: 19.8");
    expect(ppg.textContent).not.toContain((15.3 * 0.5 + 19.8 * 0.5).toFixed(1));
  });

  it("does not show last season beside a full current sample", () => {
    render(<PropsBoardView board={board} />);
    expect(cell("Demo Guard One", "season-sample").textContent).not.toContain("2025-26");
    expect(cell("Demo Guard One", "season-ppg").textContent).not.toContain("26:");
  });

  it("shows a dash for the current season and last season on its own when there are no games yet", () => {
    render(<PropsBoardView board={board} />);
    expect(cell("Demo Wing Six", "season-sample").textContent).toContain("no games yet this season");
    expect(cell("Demo Wing Six", "season-sample").textContent).toContain("2025-26 · 58 games");
    expect(cell("Demo Wing Six", "season-mpg").textContent).toContain("—");
    expect(cell("Demo Wing Six", "season-mpg").textContent).toContain("26: 30.2");
  });

  it("shows N/A, not zero, for a player with no season statistics at all", () => {
    render(<PropsBoardView board={board} />);
    expect(cell("Demo Bench Seven", "season-mpg").textContent).toBe("N/A");
    expect(cell("Demo Bench Seven", "season-sample").textContent).toBe("N/A");
  });

  it("hides the season columns on a board without season statistics, as on any public board", () => {
    const publicLike: PropsBoardArtifact = { ...board, entries: board.entries.map(({ seasonStats: _removed, ...entry }) => entry) };
    render(<PropsBoardView board={publicLike} />);
    const h = headers().map((x) => x.toUpperCase());
    expect(h).not.toContain("MPG");
    expect(h).not.toContain("SEASON SAMPLE");
    expect(h.some((x) => x.startsWith("YOUR MIN"))).toBe(true);
    expect(screen.queryByText(/Season figures cover completed games/)).toBeNull();
  });
});

describe("minutes overrides", () => {
  it("leaves the adjusted columns empty until minutes are typed", () => {
    render(<PropsBoardView board={board} />);
    expect(adjusted("Demo Guard One")).toBe("—");
    expect(cell("Demo Guard One", "season-rate-estimate").textContent).toBe("—");
    expect(inputFor("Demo Guard One").placeholder).toBe("34.0");
  });

  it("shows the adjusted projection, its line difference and the season-rate estimate, apart from the JKB values", () => {
    render(<PropsBoardView board={board} />);
    type("Demo Guard One", "36");
    expect(adjusted("Demo Guard One")).toBe(((26.1 * 36) / 34).toFixed(1));
    expect(cell("Demo Guard One", "adjusted-difference").textContent).toBe(`+${((26.1 * 36) / 34 - 24.5).toFixed(1)}`);
    const rate = 36 * ((24 * 25.4) / (24 * 33.8));
    expect(cell("Demo Guard One", "season-rate-estimate").textContent).toContain(rate.toFixed(1));
    expect(cell("Demo Guard One", "season-rate-estimate").textContent).toContain(`+${(rate - 24.5).toFixed(1)} vs line`);
    // The original model output and its difference are untouched.
    expect(cell("Demo Guard One", "jkb-projection").textContent).toBe("26.1");
    expect(cell("Demo Guard One", "jkb-minutes").textContent).toBe("34.0");
    expect(cell("Demo Guard One", "jkb-difference").textContent).toBe("+1.6");
  });

  it("recalculates when the minutes change", () => {
    render(<PropsBoardView board={board} />);
    type("Demo Guard One", "36");
    type("Demo Guard One", "24.5");
    expect(adjusted("Demo Guard One")).toBe(((26.1 * 24.5) / 34).toFixed(1));
    expect(cell("Demo Guard One", "adjusted-difference").textContent).toBe(((26.1 * 24.5) / 34 - 24.5).toFixed(1).replace(/^(?=\d)/, "+"));
    expect(cell("Demo Guard One", "adjusted-difference").className).toMatch(/rose|emerald/);
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
      expect(cell("Demo Guard One", "season-rate-estimate").textContent).toBe("—");
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
    expect(cell("Demo Wing Six", "season-rate-estimate").textContent).toBe("N/A");
    type("Demo Bench Seven", "20");
    // A projection and minutes but no season history, and no line.
    expect(adjusted("Demo Bench Seven")).toBe(((9.1 * 20) / 14).toFixed(1));
    expect(cell("Demo Bench Seven", "season-rate-estimate").textContent).toBe("N/A");
    expect(cell("Demo Bench Seven", "adjusted-difference").textContent).toBe("N/A");
  });

  it("disables the input when there is neither a JKB projection with minutes nor a season rate", () => {
    const stripped: PropsBoardArtifact = { ...board, entries: board.entries.map((e) => (e.playerName === "Demo Bench Seven" ? { ...e, projection: null, projectionUnavailableReason: "none" } : e)) };
    render(<PropsBoardView board={stripped} />);
    expect(inputFor("Demo Bench Seven")).toBeDisabled();
    expect(inputFor("Demo Guard One")).toBeEnabled();
  });
});

describe("reset", () => {
  it("resets one player and leaves the others", () => {
    render(<PropsBoardView board={board} />);
    type("Demo Guard One", "36");
    type("Demo Big Four", "20");
    fireEvent.click(within(rowOf("Demo Guard One")).getByRole("button", { name: /Reset minutes for Demo Guard One/ }));
    expect(inputFor("Demo Guard One").value).toBe("");
    expect(adjusted("Demo Guard One")).toBe("—");
    expect(adjusted("Demo Big Four")).toBe(((14.0 * 20) / 26).toFixed(1));
    expect(cell("Demo Guard One", "jkb-projection").textContent).toBe("26.1");
  });

  it("only offers a per-player reset while an override is active", () => {
    render(<PropsBoardView board={board} />);
    const reset = within(rowOf("Demo Guard One")).getByRole("button", { name: /Reset minutes for Demo Guard One/ });
    expect(reset).toBeDisabled();
    type("Demo Guard One", "36");
    expect(reset).toBeEnabled();
  });

  it("resets everything at once, including an invalid entry, and counts the active overrides", () => {
    render(<PropsBoardView board={board} />);
    const all = screen.getByTestId("reset-all-minutes");
    expect(all).toHaveAttribute("aria-disabled", "true");
    type("Demo Guard One", "36");
    type("Demo Big Four", "20");
    typeAndLeave("Demo Forward Three", "abc");
    expect(all).toHaveTextContent("Reset all minutes (3)");
    fireEvent.click(all);
    for (const name of ["Demo Guard One", "Demo Big Four", "Demo Forward Three"]) expect(inputFor(name).value).toBe("");
    expect(all).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("market switching", () => {
  it("keeps a player's minutes when the market changes and recalculates with that market's own projection, line and rate", () => {
    render(<PropsBoardView board={board} />);
    type("Demo Guard One", "36");
    showMarket("Rebounds");
    expect(inputFor("Demo Guard One").value).toBe("36");
    expect(adjusted("Demo Guard One")).toBe(((3.8 * 36) / 34).toFixed(1));
    expect(cell("Demo Guard One", "adjusted-difference").textContent).toBe(`+${((3.8 * 36) / 34 - 3.5).toFixed(1)}`);
    expect(cell("Demo Guard One", "season-rate-estimate").textContent).toContain((36 * (3.9 / 33.8)).toFixed(1));
    showMarket("Assists");
    expect(adjusted("Demo Guard One")).toBe(((9.4 * 36) / 34).toFixed(1));
    showMarket("Points");
    expect(inputFor("Demo Guard One").value).toBe("36");
  });

  it("keeps every row's season MPG visible in every market", () => {
    render(<PropsBoardView board={board} />);
    for (const market of ["Points", "Rebounds", "Assists"] as const) {
      showMarket(market);
      expect(cell("Demo Guard One", "season-mpg").textContent).toContain("33.8");
    }
  });
});

describe("sorting", () => {
  it("sorts by season PPG and toggles direction, with players missing it last", () => {
    render(<PropsBoardView board={board} />);
    fireEvent.click(screen.getByRole("button", { name: "PPG" }));
    expect(playerOrder()[0]).toBe("Demo Guard One");
    expect(playerOrder().slice(-2)).toEqual(expect.arrayContaining(["Demo Bench Seven", "Demo Wing Six"]));
    fireEvent.click(screen.getByRole("button", { name: "PPG" }));
    expect(playerOrder().slice(-2)).toEqual(expect.arrayContaining(["Demo Bench Seven", "Demo Wing Six"]));
    expect(screen.getByRole("columnheader", { name: /PPG/ })).toHaveAttribute("aria-sort", "ascending");
  });

  it("sorts by the adjusted projection once minutes are entered, and by the market's per-game figure", () => {
    render(<PropsBoardView board={board} />);
    type("Demo Big Four", "40");
    type("Demo Guard One", "20");
    fireEvent.click(screen.getByRole("button", { name: "Adj proj" }));
    expect(playerOrder().slice(0, 2)).toEqual(["Demo Big Four", "Demo Guard One"]);
    showMarket("Rebounds");
    fireEvent.click(screen.getByRole("button", { name: "RPG" }));
    expect(playerOrder()[0]).toBe("Demo Big Four");
  });
});

describe("mobile presentation", () => {
  it("keeps the table inside a labelled, keyboard-reachable scroll region so the page itself never scrolls sideways", () => {
    render(<PropsBoardView board={board} />);
    const region = screen.getByRole("region", { name: /player props with sportsbook lines, JKB projections, season averages, your minutes/ });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region.className).toMatch(/overflow-x-auto/);
    expect(region.querySelector("table")).toBeTruthy();
  });

  it("freezes the player column and gives every row a row header", () => {
    render(<PropsBoardView board={board} />);
    const first = screen.getAllByRole("rowheader")[0];
    expect(first.className).toMatch(/sticky/);
    expect(screen.getAllByRole("rowheader")).toHaveLength(8);
    expect(screen.getByRole("columnheader", { name: /^Player/ }).className).toMatch(/sticky/);
  });

  it("gives each minutes field a decimal keypad, a name that includes the player and the range, and a touch-sized target", () => {
    render(<PropsBoardView board={board} />);
    const input = inputFor("Demo Guard One");
    expect(input).toHaveAttribute("inputmode", "decimal");
    expect(input.getAttribute("aria-label")).toBe("Your projected minutes for Demo Guard One, 0 to 48");
    expect(input.className).toMatch(/\bh-8\b/);
    const reset = within(rowOf("Demo Guard One")).getByRole("button", { name: /Reset minutes for Demo Guard One/ });
    expect(reset.className).toMatch(/\bh-8\b/);
    expect(reset.className).toMatch(/\bw-8\b/);
  });

  it("explains the two estimates in text on the page, not only in hover titles", () => {
    render(<PropsBoardView board={board} />);
    expect(screen.getByText(/the JKB projection × your minutes ÷ the JKB minutes/)).toBeInTheDocument();
    expect(screen.getByText(/your minutes × this season's stat per minute/)).toBeInTheDocument();
    expect(screen.getByText(/not saved, shared or sent anywhere/)).toBeInTheDocument();
  });
});

describe("overrides stay in the page", () => {
  it("writes nothing to storage and makes no request", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<PropsBoardView board={board} />);
    type("Demo Guard One", "36");
    fireEvent.click(within(rowOf("Demo Guard One")).getByRole("button", { name: /Reset minutes/ }));
    expect(setItem).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(document.cookie).toBe("");
    vi.unstubAllGlobals();
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
    const reset = within(rowOf("Demo Guard One")).getByRole("button", { name: /Reset minutes for Demo Guard One/ });
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

  it("states the sample behind the season-rate estimate, and flags a small one", () => {
    render(<PropsBoardView board={board} />);
    type("Demo Wing Two", "30");
    expect(cell("Demo Wing Two", "season-rate-estimate").textContent).toContain("on 3 g · small sample");
    type("Demo Guard One", "30");
    expect(cell("Demo Guard One", "season-rate-estimate").textContent).toContain("on 24 g");
    expect(cell("Demo Guard One", "season-rate-estimate").textContent).not.toContain("small sample");
  });

  it("shows how far your minutes are from the JKB minutes, and highlights a large change", () => {
    render(<PropsBoardView board={board} />);
    type("Demo Guard One", "34");
    expect(cell("Demo Guard One", "adjusted-projection").textContent).toContain("× 1.00 JKB min");
    type("Demo Guard One", "48");
    expect(cell("Demo Guard One", "adjusted-projection").textContent).toContain(`× ${(48 / 34).toFixed(2)} JKB min`);
    type("Demo Big Four", "5");
    const note = within(cell("Demo Big Four", "adjusted-projection")).getByText(/× 0.19 JKB min/);
    expect(note.className).toMatch(/amber/);
    expect(note.getAttribute("title")).toMatch(/Large change/);
  });

  it("never prints a signed zero", () => {
    const flat: PropsBoardArtifact = { ...board, entries: board.entries.map((e) => (e.playerName === "Demo Guard One" && e.market === "pts" && e.line ? { ...e, line: { ...e.line, line: 26.12 } } : e)) };
    render(<PropsBoardView board={flat} />);
    expect(cell("Demo Guard One", "jkb-difference").textContent).toBe("0.0");
  });
});
