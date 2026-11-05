import { describe, expect, it } from "vitest";
import { buildDemoBoard } from "./__fixtures__/boardDemo";
import { DEFAULT_FILTERS, buildBoardRows, filterBoardRows, gameDateOf, sortBoardRows, tierFilterOptions, type BoardRow, type PropsBoardArtifact } from "./propsBoard";
import { teamDefenseKey } from "./recentForm";

const rowsOf = (board: PropsBoardArtifact, market: "pts" | "reb" | "ast" = "pts"): BoardRow[] => buildBoardRows(board, market);
const names = (rows: readonly BoardRow[]): string[] => rows.map((r) => r.entry.playerName);

describe("board rows carry a research profile", () => {
  it("gives every player with season statistics a tier and no player without them", () => {
    const rows = rowsOf(buildDemoBoard());
    const bench = rows.find((r) => r.entry.playerName === "Demo Bench Seven");
    expect(bench?.research).toBeNull();
    expect(rows.filter((r) => r.entry.playerName !== "Demo Bench Seven").every((r) => r.research !== null)).toBe(true);
  });

  it("puts all three tiers on the demo board", () => {
    const tiers = new Set(rowsOf(buildDemoBoard()).flatMap((r) => (r.research ? [r.research.tier] : [])));
    expect([...tiers].sort()).toEqual(["core", "rotation", "variable"]);
  });

  it("is the same for a player in every market", () => {
    const board = buildDemoBoard();
    const tierOf = (market: "pts" | "reb" | "ast") => Object.fromEntries(rowsOf(board, market).map((r) => [r.entry.playerName, r.research?.tier ?? null]));
    expect(tierOf("reb")).toEqual(tierOf("pts"));
    expect(tierOf("ast")).toEqual(tierOf("pts"));
  });
});

describe("the tier filter", () => {
  const rows = rowsOf(buildDemoBoard());

  it("shows everyone for All, including players with no tier", () => {
    expect(filterBoardRows(rows, { ...DEFAULT_FILTERS, tier: "all" })).toHaveLength(rows.length);
  });

  it("shows only that tier for Core and for Rotation", () => {
    const core = filterBoardRows(rows, { ...DEFAULT_FILTERS, tier: "core" });
    const rotation = filterBoardRows(rows, { ...DEFAULT_FILTERS, tier: "rotation" });
    expect(core.length).toBeGreaterThan(0);
    expect(rotation.length).toBeGreaterThan(0);
    expect(core.every((r) => r.research?.tier === "core")).toBe(true);
    expect(rotation.every((r) => r.research?.tier === "rotation")).toBe(true);
    expect(core.length + rotation.length).toBeLessThan(rows.length);
  });

  it("composes with the other filters", () => {
    const core = filterBoardRows(rows, { ...DEFAULT_FILTERS, tier: "core", team: "NYK" });
    expect(core.every((r) => r.entry.team === "NYK" || r.entry.opponent === "NYK")).toBe(true);
  });

  it("offers Core, Rotation and All with the Core and Rotation counts for the market", () => {
    const options = tierFilterOptions(rows);
    expect(options.map((o) => o.value)).toEqual(["core", "rotation", "all"]);
    expect(options.find((o) => o.value === "all")?.count).toBe(rows.length);
    expect(options.find((o) => o.value === "core")?.count).toBe(rows.filter((r) => r.research?.tier === "core").length);
  });
});

describe("the research order", () => {
  const rows = rowsOf(buildDemoBoard());
  const ordered = sortBoardRows(rows, "research", "desc");

  it("lists Core before Rotation before Variable before players with no tier", () => {
    const rank = (r: BoardRow) => ({ core: 0, rotation: 1, variable: 2 })[r.research?.tier ?? "variable"] + (r.research ? 0 : 1);
    const ranks = ordered.map(rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it("orders players of one tier by the size of the gap between JKB and the line, largest first, then by projection", () => {
    const core = ordered.filter((r) => r.research?.tier === "core" && r.difference !== null);
    const gaps = core.map((r) => Math.abs(r.difference as number));
    expect(gaps).toEqual([...gaps].sort((a, b) => b - a));
  });

  it("puts a player with no line after the ones with a line inside a tier", () => {
    const board = buildDemoBoard();
    const withoutLine = { ...board, entries: board.entries.map((e) => (e.playerName === "Demo Guard One" ? { ...e, line: null, lineWithheldReason: "no line posted" } : e)) };
    const sorted = sortBoardRows(rowsOf(withoutLine), "research", "desc").filter((r) => r.research?.tier === "core");
    const index = sorted.findIndex((r) => r.entry.playerName === "Demo Guard One");
    expect(sorted.slice(0, index).every((r) => r.difference !== null)).toBe(true);
  });

  it("does not mutate its input", () => {
    const before = names(rows);
    sortBoardRows(rows, "research", "desc");
    expect(names(rows)).toEqual(before);
  });
});

describe("the opponent's own DEF RTG before the game", () => {
  const KEY_BOS = teamDefenseKey("BOS", "2026-11-09");
  const withoutRatings = (board: PropsBoardArtifact): PropsBoardArtifact => {
    const { [KEY_BOS]: _bos, [teamDefenseKey("NYK", "2026-11-09")]: _nyk, ...rest } = board.teamDefense!.asOf;
    return { ...board, teamDefense: { ...board.teamDefense!, asOf: rest } };
  };

  it("reads the rating the board carries for the opponent on the game's date", () => {
    const nyk = rowsOf(buildDemoBoard()).find((r) => r.entry.team === "NYK");
    expect(nyk?.opponentDefense).toMatchObject({ status: "ok", entry: { rating: 108.6, rank: 5, games: 12 }, strength: "strong" });
  });

  it("gives no strength label for fewer than five prior games, but still shows the rating", () => {
    const bos = rowsOf(buildDemoBoard()).find((r) => r.entry.team === "BOS");
    expect(bos?.opponentDefense).toMatchObject({ status: "ok", entry: { rating: 114.2, games: 3 }, strength: null });
  });

  it("says why there is none: an old board, no earlier usable game, or an unknown opponent", () => {
    const board = buildDemoBoard();
    const { teamDefense: _teamDefense, ...old } = board;
    expect(rowsOf(old as PropsBoardArtifact)[0].opponentDefense.status).toBe("stale");
    expect(rowsOf(withoutRatings(board))[0].opponentDefense.status).toBe("none");
    expect(rowsOf({ ...board, entries: board.entries.map((e) => ({ ...e, opponent: null })) })[0].opponentDefense.status).toBe("no-opponent");
  });

  it("sorts by the rating, with no rating last in either direction", () => {
    const board = withoutRatings(buildDemoBoard());
    const partial = { ...board, teamDefense: { ...board.teamDefense!, asOf: { ...board.teamDefense!.asOf, [KEY_BOS]: { rating: 108.6, leagueRating: 112, rank: 5, rankedOf: 30, games: 12 } } } };
    for (const direction of ["asc", "desc"] as const) {
      const sorted = sortBoardRows(rowsOf(partial), "oppDefRtg", direction);
      const rated = sorted.filter((r) => r.opponentDefense.entry !== null).length;
      expect(rated).toBeGreaterThan(0);
      expect(sorted.slice(0, rated).every((r) => r.opponentDefense.entry !== null)).toBe(true);
    }
  });
});

describe("gameDateOf", () => {
  it("reads the date from a canonical game key", () => {
    expect(gameDateOf("2026-11-09|NYK@BOS")).toBe("2026-11-09");
  });
  it("is null for anything else", () => {
    expect(gameDateOf("not-a-key")).toBeNull();
    expect(gameDateOf("")).toBeNull();
  });
});
