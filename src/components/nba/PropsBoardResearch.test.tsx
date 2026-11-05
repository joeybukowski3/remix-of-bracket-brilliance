import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import PropsBoardView from "@/components/nba/PropsBoardView";
import { buildDemoBoard } from "@/lib/nba/props/__fixtures__/boardDemo";
import { COLUMN_PREFERENCE_KEY } from "@/lib/nba/props/boardColumns";
import { buildBoardRows, sortBoardRows, type PropsBoardArtifact } from "@/lib/nba/props/propsBoard";

vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: true, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const board = buildDemoBoard();
const text = (el: Element): string => el.textContent?.replace(/\s+/g, " ").trim() ?? "";
const playerOrder = (): string[] => screen.getAllByTestId("player-name").map((n) => n.textContent ?? "");
const rowOf = (name: string): HTMLElement => screen.getByRole("rowheader", { name: new RegExp(name) }).closest("tr") as HTMLElement;
const col = (name: string, id: string): HTMLElement => within(rowOf(name)).getByTestId(`col-${id}`);
const open = (name: string): HTMLElement => {
  if (rowOf(name).getAttribute("aria-expanded") !== "true") fireEvent.click(rowOf(name));
  return rowOf(name).nextElementSibling as HTMLElement;
};
const chip = (label: RegExp) => within(screen.getByTestId("tier-filter")).getByRole("button", { name: label });
const tierOf = (name: string): string | null => within(rowOf(name)).queryByTestId("research-tier")?.getAttribute("data-tier") ?? null;
const rows = () => buildBoardRows(board, "pts");
const namesWhere = (tier: "core" | "rotation" | "variable") => rows().filter((r) => r.research?.tier === tier).map((r) => r.entry.playerName);

describe("the research tier filter", () => {
  it("opens on Core props only, in research order", () => {
    render(<PropsBoardView board={board} />);
    expect(chip(/^Core/)).toHaveAttribute("aria-pressed", "true");
    expect(chip(/^Rotation/)).toHaveAttribute("aria-pressed", "false");
    expect(chip(/^All players/)).toHaveAttribute("aria-pressed", "false");
    const core = namesWhere("core");
    expect(core.length).toBeGreaterThan(1);
    expect(playerOrder()).toEqual(sortBoardRows(rows(), "research", "desc").map((r) => r.entry.playerName).filter((n) => core.includes(n)));
    expect(screen.getAllByTestId("research-tier").every((el) => el.getAttribute("data-tier") === "core")).toBe(true);
  });

  it("shows each choice's count and lists exactly those players", () => {
    render(<PropsBoardView board={board} />);
    expect(chip(/^Core/).textContent).toContain(`(${namesWhere("core").length})`);
    expect(chip(/^Rotation/).textContent).toContain(`(${namesWhere("rotation").length})`);
    expect(chip(/^All players/).textContent).toContain(`(${rows().length})`);
    fireEvent.click(chip(/^Rotation/));
    expect(new Set(playerOrder())).toEqual(new Set(namesWhere("rotation")));
    expect(playerOrder().length).toBeGreaterThan(0);
  });

  it("keeps every other player one click away, deprioritized: All players lists Core first, then Rotation, then Variable, then players with no tier", () => {
    render(<PropsBoardView board={board} />);
    fireEvent.click(chip(/^All players/));
    const order = playerOrder();
    expect(order).toHaveLength(rows().length);
    const rank = (name: string) => ({ core: 0, rotation: 1, variable: 2 })[(rows().find((r) => r.entry.playerName === name)?.research?.tier ?? "none") as "core"] ?? 3;
    expect(order.map(rank)).toEqual([...order.map(rank)].sort((a, b) => a - b));
    expect(order.at(-1)).toBe("Demo Bench Seven");
  });

  it("combines with the market, the team and the player search", () => {
    render(<PropsBoardView board={board} />);
    fireEvent.click(screen.getByRole("button", { name: "Rebounds" }));
    expect(playerOrder().every((n) => namesWhere("core").includes(n))).toBe(true);
    fireEvent.change(screen.getByRole("combobox", { name: /Team/ }), { target: { value: "BOS" } });
    expect(playerOrder().every((n) => namesWhere("core").includes(n))).toBe(true);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzz" } });
    expect(screen.getByTestId("tier-empty").textContent).toMatch(/No Core players match these filters/);
  });

  it("offers a way out of an empty tier", () => {
    render(<PropsBoardView board={board} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Bench Seven" } });
    expect(screen.getByTestId("tier-empty")).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId("tier-empty")).getByRole("button", { name: "Show all players" }));
    expect(playerOrder()).toEqual(["Demo Bench Seven"]);
  });

  it("has no tiers on a board without season statistics: everyone is listed and there are no tier controls", () => {
    const publicLike: PropsBoardArtifact = { ...board, entries: board.entries.map(({ seasonStats: _removed, ...entry }) => entry) };
    render(<PropsBoardView board={publicLike} />);
    expect(screen.queryByTestId("tier-filter")).toBeNull();
    expect(playerOrder()).toHaveLength(8);
  });
});

describe("research order", () => {
  it("is the default, is marked, and comes back with its button after another sort", () => {
    render(<PropsBoardView board={board} />);
    const button = screen.getByTestId("research-order");
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "JKB proj" }));
    expect(button).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("head-tier")).toHaveAttribute("aria-sort", "descending");
  });

  it("says in words that it is an ordering aid, not an edge estimate", () => {
    render(<PropsBoardView board={board} />);
    expect(screen.getByTestId("research-order").getAttribute("title")).toMatch(/not an edge estimate/);
    expect(screen.getByTestId("tier-note").textContent).toMatch(/not an edge estimate/);
  });
});

describe("research order and the tier filter in less usual states", () => {
  it("works from its button even when the Tier column is hidden by a saved column choice", () => {
    localStorage.setItem(COLUMN_PREFERENCE_KEY, JSON.stringify({ version: 1, columns: ["mpg", "matchup"] }));
    render(<PropsBoardView board={board} />);
    const button = screen.getByTestId("research-order");
    expect(button).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    const core = namesWhere("core");
    expect(playerOrder()).toEqual(sortBoardRows(rows(), "research", "desc").map((r) => r.entry.playerName).filter((n) => core.includes(n)));
  });

  it("does not hide every row when the board changes to one without season statistics", () => {
    const publicLike: PropsBoardArtifact = { ...board, entries: board.entries.map(({ seasonStats: _removed, ...entry }) => entry) };
    const view = render(<PropsBoardView board={board} />);
    expect(screen.getByTestId("tier-filter")).toBeInTheDocument();
    view.rerender(<PropsBoardView board={publicLike} />);
    expect(screen.queryByTestId("tier-filter")).toBeNull();
    expect(playerOrder()).toHaveLength(8);
  });
});

describe("tier, minutes consistency and flags in the table", () => {
  it("shows the tier, with the reason on hover, and Min stable as the count out of five beside the median", () => {
    render(<PropsBoardView board={board} />);
    fireEvent.click(chip(/^All players/));
    expect(tierOf("Demo Guard One")).toBe("core");
    expect(within(rowOf("Demo Guard One")).getByTestId("research-tier").getAttribute("title")).toMatch(/^Core: 33\.8 MPG over 24 games; 5 of the last 5 games within 20% of the 33\.9-minute median\.$/);
    expect(text(col("Demo Guard One", "stability"))).toBe("5/5 34");
    expect(tierOf("Demo Big Four")).toBe("rotation");
    expect(tierOf("Demo Wing Two")).toBe("variable");
  });

  it("marks a flagged player with a count and names the flags for a screen reader", () => {
    render(<PropsBoardView board={board} />);
    fireEvent.click(chip(/^All players/));
    const two = within(rowOf("Demo Wing Two")).getByTestId("research-flags");
    expect(two.textContent).toContain("1");
    expect(two.textContent).toContain("Flags: Low sample");
    expect(two.getAttribute("title")).toMatch(/Fewer than 5 completed games this season/);
    expect(within(rowOf("Demo Guard Five")).getByTestId("research-flags").textContent).toContain("Flags: Missed games");
    expect(within(rowOf("Demo Guard One")).queryByTestId("research-flags")).toBeNull();
  });

  it("gives a player with fewer than five games no stability reading, rather than a verdict", () => {
    render(<PropsBoardView board={board} />);
    fireEvent.click(chip(/^All players/));
    expect(text(col("Demo Wing Two", "stability"))).toBe("—");
    expect(col("Demo Wing Two", "stability").querySelector("[title]")?.getAttribute("title")).toMatch(/Fewer than 5 completed games/);
  });

  it("shows N/A, not a tier, for a player with no season statistics", () => {
    render(<PropsBoardView board={board} />);
    fireEvent.click(chip(/^All players/));
    expect(tierOf("Demo Bench Seven")).toBeNull();
    expect(text(col("Demo Bench Seven", "tier"))).toBe("N/A");
    expect(text(col("Demo Bench Seven", "stability"))).toBe("N/A");
  });
});

describe("role and minutes in the expanded row", () => {
  it("explains the tier, the recent median minutes beside the model's own, and the ten-game spread", () => {
    render(<PropsBoardView board={board} />);
    const panel = open("Demo Guard One");
    expect(within(panel).getByTestId("research-reason").textContent).toMatch(/^Core: /);
    expect(within(panel).getByTestId("research-baseline").textContent).toMatch(/Recent median: 33\.9 min over the last 5 games \(a baseline for reading, not the model's input\); the JKB model uses 34\.0\./);
    expect(within(panel).getByTestId("research-spread").textContent).toMatch(/Last 10 games: median 33\.9, range 33\.9–33\.9, SD 0\.0; 10 of 10 within 20% of the median/);
  });

  it("reports missed team games without naming a cause", () => {
    render(<PropsBoardView board={board} />);
    fireEvent.click(chip(/^All players/));
    const missed = within(open("Demo Guard Five")).getByTestId("research-missed").textContent ?? "";
    expect(missed).toMatch(/Missed 1 of the team's last 10 games\./);
    expect(missed).toMatch(/Injury, rest and a coach's decision cannot be told apart/);
    expect(missed).not.toMatch(/injured/i);
    expect(within(open("Demo Guard Five")).getByTestId("research-flag-list").textContent).toMatch(/Missed games\./);
  });

  it("says when the board predates missed-game tracking instead of claiming nobody missed any", () => {
    const withoutAvailability: PropsBoardArtifact = { ...board, entries: board.entries.map((e) => (e.seasonStats ? { ...e, seasonStats: { ...e.seasonStats, availability: undefined } } : e)) };
    render(<PropsBoardView board={withoutAvailability} />);
    expect(within(open("Demo Guard One")).getByTestId("research-missed").textContent).toMatch(/not on this board/);
  });

  it("lists a low sample as a flag with its reason", () => {
    render(<PropsBoardView board={board} />);
    fireEvent.click(chip(/^All players/));
    const panel = open("Demo Wing Two");
    expect(within(panel).getByTestId("research-flag-list").textContent).toMatch(/Low sample\. Fewer than 5 completed games this season/);
    expect(within(panel).getByTestId("research-reason").textContent).toMatch(/^Provisional: /);
  });
});

describe("opponent DEF RTG in the table", () => {
  it("shows the opponent's rating before the game, its rank and label, and the sample size under five games", () => {
    render(<PropsBoardView board={board} />);
    fireEvent.click(chip(/^All players/));
    const nyk = within(col("Demo Guard One", "oppDefRtg")).getByTestId("opp-def-rtg");
    expect(nyk).toHaveAttribute("data-strength", "strong");
    expect(text(nyk)).toContain("108.6");
    expect(text(nyk)).toContain("#5");
    const bos = within(col("Demo Guard Five", "oppDefRtg")).getByTestId("opp-def-rtg");
    expect(bos).toHaveAttribute("data-strength", "none");
    expect(text(bos)).toContain("114.2");
    expect(within(bos).getByRole("img").getAttribute("aria-label")).toMatch(/Only 3 games before this one/);
  });

  it("explains an empty cell instead of leaving it blank: an old board, or an opponent with no earlier game", () => {
    const { teamDefense: _gone, ...old } = board;
    render(<PropsBoardView board={old} />);
    fireEvent.click(chip(/^All players/));
    expect(within(col("Demo Guard One", "oppDefRtg")).getByTestId("opp-def-rtg")).toHaveAttribute("data-state", "stale");
    expect(within(col("Demo Guard One", "oppDefRtg")).getByTestId("opp-def-rtg").getAttribute("title")).toMatch(/built before DEF RTG existed/);
  });

  it("sorts by the rating, lowest (strongest defense) available either way", () => {
    render(<PropsBoardView board={board} />);
    fireEvent.click(chip(/^All players/));
    fireEvent.click(screen.getByRole("button", { name: "Opp DEF RTG" }));
    expect(screen.getByTestId("head-oppDefRtg")).toHaveAttribute("aria-sort", "descending");
    const first = playerOrder()[0];
    expect(rows().find((r) => r.entry.playerName === first)?.opponentDefense.entry?.rating).toBe(114.2);
  });
});

describe("what the tiers never touch", () => {
  it("leaves every projection, line and difference exactly as it was, whatever the tier or filter", () => {
    const stripped: PropsBoardArtifact = { ...board, entries: board.entries.map((e) => (e.seasonStats ? { ...e, seasonStats: { ...e.seasonStats, availability: undefined } } : e)) };
    const a = buildBoardRows(board, "pts").map((r) => [r.entry.projection, r.entry.line, r.difference, r.jkbTriple]);
    const b = buildBoardRows(stripped, "pts").map((r) => [r.entry.projection, r.entry.line, r.difference, r.jkbTriple]);
    expect(a).toEqual(b);
  });

  it("keeps the manual minutes adjustment working on a Core player, and the JKB figure unchanged", () => {
    render(<PropsBoardView board={board} />);
    const panel = open("Demo Guard One");
    const input = within(panel).getByLabelText(/Your projected minutes for Demo Guard One,/);
    fireEvent.change(input, { target: { value: "36" } });
    expect(within(panel).getByTestId("adjusted-value").textContent).toBe(((26.1 * 36) / 34).toFixed(1));
    expect(within(rowOf("Demo Guard One")).getByTestId("jkb-value").textContent).toBe("26.1");
  });
});

/** The demo board as it would look a few games into a season: nobody has played five games, so nobody can be rated. */
const earlySeason = (source: PropsBoardArtifact, games = 3): PropsBoardArtifact => ({
  ...source,
  entries: source.entries.map((entry) => {
    const stats = entry.seasonStats;
    if (!stats?.current) return entry;
    const { availability: _availability, ...rest } = stats;
    const mpg = stats.current.minutes / stats.current.games;
    return { ...entry, seasonStats: { ...rest, current: { ...stats.current, games, minutes: mpg * games }, recentGames: (stats.recentGames ?? []).slice(-games) } };
  }),
});

/** The demo board where every player with season minutes is held out of Core (returning from an absence): Rotation has players, Core has none. */
const noCore = (source: PropsBoardArtifact): PropsBoardArtifact => ({
  ...source,
  entries: source.entries.map((entry) => (entry.seasonStats?.current ? { ...entry, seasonStats: { ...entry.seasonStats, availability: { teamGames: 10, played: 10, returning: true, roleChange: false, teamChangedRecently: false } } } : entry)),
});

const early = earlySeason(board);
const earlyNames = (): string[] => buildBoardRows(early, "pts").map((r) => r.entry.playerName);
const isProvisional = (name: string): boolean => within(rowOf(name)).getByTestId("research-tier").getAttribute("data-provisional") === "true";

describe("an empty Core is never the opening view (early in the season)", () => {
  it("opens on All players, in research order, with Provisional players first, when nobody has five games", () => {
    render(<PropsBoardView board={early} />);
    expect(chip(/^Core/).textContent).toContain("(0)");
    expect(chip(/^Rotation/).textContent).toContain("(0)");
    expect(chip(/^All players/)).toHaveAttribute("aria-pressed", "true");
    expect(chip(/^Core/)).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("tier-notice").textContent).toMatch(/No Core or Rotation players yet.*Provisional/);
    expect([...playerOrder()].sort()).toEqual([...earlyNames()].sort());
    expect(screen.queryByTestId("tier-empty")).toBeNull();
    expect(screen.getByText(/\d+ props?/).textContent).toMatch(/^[1-9]/);
  });

  it("lists 20+ MPG players with fewer than five games as Provisional, ahead of players with no season minutes", () => {
    render(<PropsBoardView board={early} />);
    const order = playerOrder();
    expect(isProvisional("Demo Guard One")).toBe(true);
    expect(isProvisional("Demo Wing Two")).toBe(true);
    expect(isProvisional("Demo Wing Six")).toBe(false);
    const flags = order.filter((n) => n !== "Demo Bench Seven").map(isProvisional);
    expect(flags).toEqual([...flags].sort((a, b) => Number(b) - Number(a)));
    expect(order.at(-1)).toBe("Demo Bench Seven");
    expect(within(rowOf("Demo Guard One")).getByTestId("research-tier").textContent).toContain("Provisional");
    expect(within(rowOf("Demo Wing Six")).getByTestId("research-tier").textContent).toContain("Variable");
  });

  it("offers a Provisional chip that lists exactly those players", () => {
    render(<PropsBoardView board={early} />);
    fireEvent.click(chip(/^Provisional/));
    const shown = playerOrder();
    expect(shown).toContain("Demo Guard One");
    expect(shown).not.toContain("Demo Wing Six");
    expect(shown).not.toContain("Demo Bench Seven");
    expect(shown.every(isProvisional)).toBe(true);
  });

  it("gives a Provisional player no stability reading and no Core tier", () => {
    render(<PropsBoardView board={early} />);
    expect(text(col("Demo Guard One", "stability"))).toBe("—");
    expect(screen.queryAllByTestId("research-tier").some((el) => el.getAttribute("data-tier") === "core")).toBe(false);
  });

  it("opens on Rotation, and says why, when there are Rotation players but no Core players", () => {
    render(<PropsBoardView board={noCore(board)} />);
    expect(chip(/^Core/).textContent).toContain("(0)");
    expect(chip(/^Rotation/)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("tier-notice").textContent).toMatch(/No Core players yet.*Rotation players are shown/);
    expect(playerOrder().length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("research-tier").every((el) => el.getAttribute("data-tier") === "rotation")).toBe(true);
  });

  it("keeps the normal Core opening, with no notice, once Core has players", () => {
    render(<PropsBoardView board={board} />);
    expect(screen.queryByTestId("tier-notice")).toBeNull();
    expect(chip(/^Core/)).toHaveAttribute("aria-pressed", "true");
  });
});

describe("a tier choice cannot leave a misleading empty table", () => {
  it("falls back, saying what was asked for, when the chosen tier has no players on the board it now shows, and comes back with them", () => {
    const view = render(<PropsBoardView board={board} />);
    fireEvent.click(chip(/^Rotation/));
    expect(chip(/^Rotation/)).toHaveAttribute("aria-pressed", "true");
    view.rerender(<PropsBoardView board={early} />);
    expect(chip(/^All players/)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("tier-notice").textContent).toMatch(/No Rotation players on this board or market, so all players are shown/);
    expect(playerOrder().length).toBeGreaterThan(0);
    view.rerender(<PropsBoardView board={board} />);
    expect(chip(/^Rotation/)).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("tier-notice")).toBeNull();
    expect(new Set(playerOrder())).toEqual(new Set(namesWhere("rotation")));
  });

  it("lets a reader choose an empty tier without ever seeing an empty table, and All players always works", () => {
    render(<PropsBoardView board={early} />);
    fireEvent.click(chip(/^Core/));
    expect(playerOrder().length).toBeGreaterThan(0);
    expect(screen.getByTestId("tier-notice").textContent).toMatch(/No Core players on this board or market/);
    fireEvent.click(chip(/^All players/));
    expect(screen.queryByTestId("tier-notice")).toBeNull();
    expect(playerOrder()).toHaveLength(earlyNames().length);
  });

  it("still explains an empty list that comes from the other filters, and offers a way out", () => {
    render(<PropsBoardView board={early} />);
    fireEvent.click(chip(/^Provisional/));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Bench Seven" } });
    expect(screen.getByTestId("tier-empty").textContent).toMatch(/No Provisional players match these filters/);
    fireEvent.click(within(screen.getByTestId("tier-empty")).getByRole("button", { name: "Show all players" }));
    expect(playerOrder()).toEqual(["Demo Bench Seven"]);
  });
});

describe("saved preferences cannot hide players", () => {
  const stored = (): Record<string, string> => Object.fromEntries(Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) as string).map((key) => [key, localStorage.getItem(key) ?? ""]));

  it("remembers no tier: choosing tiers writes nothing to storage", () => {
    render(<PropsBoardView board={board} />);
    expect(stored()).toEqual({});
    fireEvent.click(chip(/^Rotation/));
    fireEvent.click(chip(/^All players/));
    expect(stored()).toEqual({});
  });

  it("opens an early-season board on its players with a saved column choice that hides the Tier column", () => {
    localStorage.setItem(COLUMN_PREFERENCE_KEY, JSON.stringify({ version: 1, columns: ["mpg", "matchup"] }));
    render(<PropsBoardView board={early} />);
    expect(playerOrder()).toHaveLength(earlyNames().length);
    expect(screen.getByTestId("tier-notice")).toBeInTheDocument();
  });

  it("guards against reading a tier or filter from a saved preference: one written there changes nothing", () => {
    localStorage.setItem(COLUMN_PREFERENCE_KEY, JSON.stringify({ version: 1, columns: ["mpg", "matchup"], tier: "core", filters: { tier: "core", search: "zzz", onlyWithLine: true } }));
    render(<PropsBoardView board={early} />);
    expect(playerOrder()).toHaveLength(earlyNames().length);
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(chip(/^All players/)).toHaveAttribute("aria-pressed", "true");
  });

  it("opens on its players with a corrupt saved preference", () => {
    localStorage.setItem(COLUMN_PREFERENCE_KEY, "{not json");
    render(<PropsBoardView board={noCore(board)} />);
    expect(playerOrder().length).toBeGreaterThan(0);
    expect(chip(/^Rotation/)).toHaveAttribute("aria-pressed", "true");
  });
});
