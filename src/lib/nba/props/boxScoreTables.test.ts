import { describe, expect, it } from "vitest";
import { opponentBoxTable, playerBoxTable } from "./boxScoreTables";
import { classifyRosterLabel } from "./dvpPositions";
import { opponentBoxKey, opponentLastTen, opponentRecentKey, playerLastTen, type OpponentBoxScoreGame, type OpponentRecentSequence, type OpposingPlayerLine, type PlayerRecentGame } from "./recentForm";
import { opponentL10For, type BoardEntry } from "./propsBoard";

const GAME_KEY = "2026-11-09|NYK@BOS";
const entry = (over: Partial<Pick<BoardEntry, "positionLabel" | "opponent" | "market">> = {}): Pick<BoardEntry, "positionLabel" | "opponent" | "gameKey" | "market"> => ({ positionLabel: "PG", opponent: "BOS", gameKey: GAME_KEY, market: "pts", ...over });

const line = (over: Partial<OpposingPlayerLine> & { name: string }): OpposingPlayerLine => ({ minutes: 30, pts: 10, reb: 4, ast: 2, position: "PG", ...over });
const game = (n: number, players: OpposingPlayerLine[]): OpponentBoxScoreGame => ({ gameId: `g${n}`, date: `2026-10-${String(10 + n).padStart(2, "0")}`, versus: "MIA", defenseIsHome: n % 2 === 0, players });
const boxes = (games: OpponentBoxScoreGame[]) => ({ opponentBoxScores: { [opponentBoxKey(GAME_KEY, "BOS")]: games } });

function played(n: number, over: Partial<PlayerRecentGame> = {}): PlayerRecentGame {
  return { date: `2026-10-${String(10 + n).padStart(2, "0")}`, opponent: "MIA", isHome: n % 2 === 0, minutes: 30 + n, pts: 20 + n, reb: 5, ast: 3, ...over };
}

describe("playerBoxTable", () => {
  const recent = [played(1), played(2, { result: { won: true, teamPts: 110, opponentPts: 100 } }), played(3, { result: { won: false, teamPts: 99, opponentPts: 104 } })];

  it("lists the window newest to oldest, one row per completed game, with the selected market's result", () => {
    const table = playerBoxTable(playerLastTen(recent, "reb"), "reb");
    expect(table.rows.map((r) => r.date)).toEqual(["2026-10-13", "2026-10-12", "2026-10-11"]);
    expect(table.rows[0]).toMatchObject({ opponent: "MIA", isHome: false, minutes: 33, pts: 23, reb: 5, ast: 3, selected: 5 });
    expect(playerBoxTable(playerLastTen(recent, "pts"), "pts").rows.map((r) => r.selected)).toEqual([23, 22, 21]);
  });

  it("averages minutes and each stat over the window and counts the record only from known scores", () => {
    const table = playerBoxTable(playerLastTen(recent, "pts"), "pts");
    expect(table.average).toEqual({ minutes: 32, pts: 22, reb: 5, ast: 3, selected: 22 });
    expect(table.record).toEqual({ wins: 1, losses: 1, known: 2 });
    expect(table.rows.map((r) => r.result?.won ?? null)).toEqual([false, true, null]);
  });

  it("never invents a result, a record or an average", () => {
    const none = playerBoxTable(playerLastTen([played(1), played(2)], "pts"), "pts");
    expect(none.record).toBeNull();
    expect(none.rows.every((r) => r.result === null)).toBe(true);
    const empty = playerBoxTable(playerLastTen([], "pts"), "pts");
    expect(empty).toMatchObject({ status: "none", rows: [], average: null, record: null });
    expect(playerBoxTable(playerLastTen(undefined, "pts"), "pts").status).toBe("stale");
  });

  it("holds at most ten games, flags fewer as a small sample, and does not change the input", () => {
    const twelve = Array.from({ length: 12 }, (_, i) => played(i + 1));
    const copy = JSON.stringify(twelve);
    const table = playerBoxTable(playerLastTen(twelve, "pts"), "pts");
    expect(table.rows).toHaveLength(10);
    expect(table.rows[0].date).toBe("2026-10-22");
    expect(table.rows.at(-1)?.date).toBe("2026-10-13");
    expect(table.isSmallSample).toBe(false);
    expect(playerBoxTable(playerLastTen(twelve.slice(0, 4), "pts"), "pts").isSmallSample).toBe(true);
    expect(JSON.stringify(twelve)).toBe(copy);
  });
});

describe("opponentBoxTable: grouping and subtotals", () => {
  const players = [line({ name: "Starter", minutes: 34, pts: 20, reb: 4, ast: 7 }), line({ name: "Bench", minutes: 12, pts: 5, reb: 1, ast: 2 }), line({ name: "Wing", position: "SG", minutes: 30, pts: 99, reb: 9, ast: 9 }), line({ name: "Center", position: "C", minutes: 24, pts: 14, reb: 8, ast: 1 })];

  it("groups by the defense's game, lists only the players at the player's position, and subtotals them", () => {
    const table = opponentBoxTable(entry(), boxes([game(1, players)]));
    expect(table.status).toBe("ok");
    expect(table.position).toBe("PG");
    const g = table.games[0];
    expect(g.players.map((p) => p.name)).toEqual(["Starter", "Bench"]);
    expect(g.subtotal).toEqual({ minutes: 46, pts: 25, reb: 5, ast: 9, selected: 25 });
    expect(g.otherPositionPlayers).toBe(2);
    expect(g.versus).toBe("MIA");
  });

  it("lists games newest to oldest and averages the subtotals over the games that have one", () => {
    const games = [game(1, [line({ name: "A", pts: 10 })]), game(2, [line({ name: "B", pts: 20 })]), game(3, [line({ name: "C", pts: 30 })])];
    const table = opponentBoxTable(entry(), boxes(games));
    expect(table.games.map((g) => g.date)).toEqual(["2026-10-13", "2026-10-12", "2026-10-11"]);
    expect(table.average?.pts).toBe(20);
    expect(table.gamesWithFigure).toBe(3);
  });

  it("keeps only the last ten games of a longer list", () => {
    const table = opponentBoxTable(entry(), boxes(Array.from({ length: 13 }, (_, i) => game(i + 1, [line({ name: `P${i}` })]))));
    expect(table.games).toHaveLength(10);
    expect(table.games[0].gameId).toBe("g13");
    expect(table.games.at(-1)?.gameId).toBe("g4");
    expect(table.isSmallSample).toBe(false);
  });

  it("selects the market's stat as each player's and each subtotal's result", () => {
    const g = opponentBoxTable(entry({ market: "ast" }), boxes([game(1, players)])).games[0];
    expect(g.players.map((p) => p.selected)).toEqual([7, 2]);
    expect(g.subtotal?.selected).toBe(9);
  });

  it("orders players by minutes, then name, so the list never depends on input order", () => {
    const g = opponentBoxTable(entry(), boxes([game(1, [line({ name: "B", minutes: 20 }), line({ name: "A", minutes: 20 }), line({ name: "Z", minutes: 40 })])])).games[0];
    expect(g.players.map((p) => p.name)).toEqual(["Z", "A", "B"]);
  });
});

describe("opponentBoxTable: coverage, missing positions and incomplete games", () => {
  it("counts a player with no estimate nowhere, lists them apart and marks the game incomplete with its coverage", () => {
    const g = opponentBoxTable(entry(), boxes([game(1, [line({ name: "PG", minutes: 30, pts: 12 }), line({ name: "Unknown", position: null, minutes: 10, pts: 40 })])])).games[0];
    expect(g.subtotal?.pts).toBe(12);
    expect(g.unmatched.map((p) => p.name)).toEqual(["Unknown"]);
    expect(g.totalMinutes).toBe(40);
    expect(g.attributedMinutes).toBe(30);
    expect(g.coverage).toBeCloseTo(0.75);
    expect(g.isIncomplete).toBe(true);
  });

  it("calls a fully attributed game complete, even when nobody played the position (a real zero)", () => {
    const g = opponentBoxTable(entry(), boxes([game(1, [line({ name: "Wing", position: "SG", pts: 33 })])])).games[0];
    expect(g.isIncomplete).toBe(false);
    expect(g.players).toEqual([]);
    expect(g.subtotal).toMatchObject({ pts: 0, minutes: 0 });
  });

  it("gives a game with no attributed minutes no subtotal at all (missing data, not a shutout), and leaves it out of the average", () => {
    const table = opponentBoxTable(entry(), boxes([game(1, [line({ name: "A", pts: 10 })]), game(2, [line({ name: "X", position: null, minutes: 48, pts: 60 })]), game(3, [line({ name: "B", pts: 30 })])]));
    const gap = table.games.find((g) => g.gameId === "g2");
    expect(gap?.subtotal).toBeNull();
    expect(gap?.isIncomplete).toBe(true);
    expect(gap?.coverage).toBe(0);
    expect(table.gamesWithFigure).toBe(2);
    expect(table.average?.pts).toBe(20);
    expect(table.incompleteGames).toBe(1);
  });

  it("reports the window's attributed share across every game", () => {
    const table = opponentBoxTable(entry(), boxes([game(1, [line({ name: "A", minutes: 30 }), line({ name: "U", position: null, minutes: 10 })]), game(2, [line({ name: "B", minutes: 30 })])]));
    expect(table.coverage).toBeCloseTo(60 / 70);
    expect(table.incompleteGames).toBe(1);
  });

  it("says why there is nothing to show instead of an empty table", () => {
    expect(opponentBoxTable(entry(), {}).status).toBe("stale");
    expect(opponentBoxTable(entry({ positionLabel: null }), boxes([game(1, [line({ name: "A" })])])).status).toBe("no-position");
    expect(opponentBoxTable(entry({ positionLabel: "G-C" }), boxes([game(1, [line({ name: "A" })])])).status).toBe("no-position");
    expect(opponentBoxTable(entry({ opponent: null }), boxes([game(1, [line({ name: "A" })])])).status).toBe("no-opponent");
    expect(opponentBoxTable(entry(), boxes([])).status).toBe("none");
    expect(opponentBoxTable(entry(), { opponentBoxScores: {} }).status).toBe("none");
    expect(opponentBoxTable(entry(), boxes([game(1, [line({ name: "X", position: null })])])).status).toBe("none");
  });
});

describe("opponentBoxTable: the same position as DvP", () => {
  const roster = [line({ name: "PG", position: "PG", pts: 10 }), line({ name: "SG", position: "SG", pts: 20 }), line({ name: "SF", position: "SF", pts: 30 }), line({ name: "PF", position: "PF", pts: 40 }), line({ name: "C", position: "C", pts: 50 })];

  it("uses the primary position of the roster label's DvP classification, for every label the DvP rules accept", () => {
    for (const label of ["PG", "SG", "SF", "PF", "C", "G", "F", "G-F", "F-G", "F-C", "C-F", "PG-SG", "SG/SF/PF"]) {
      const classification = classifyRosterLabel(label);
      if (classification.ok === false) throw new Error(label);
      const table = opponentBoxTable(entry({ positionLabel: label }), boxes([game(1, roster)]));
      expect(table.position, label).toBe(classification.primary);
      expect(table.games[0].players.map((p) => p.position), label).toEqual([classification.primary]);
    }
  });

  it("never guesses a position from a generic label: unsupported labels have no table", () => {
    for (const label of ["G-C", "", "  ", "X", "PG-F", "Guard"]) expect(opponentBoxTable(entry({ positionLabel: label }), boxes([game(1, roster)])).status, label).toBe("no-position");
  });

  it("does not mix positions: a G label (PG/SG) lists the primary PG only, never the SGs", () => {
    const g = opponentBoxTable(entry({ positionLabel: "G" }), boxes([game(1, roster)])).games[0];
    expect(g.players.map((p) => p.name)).toEqual(["PG"]);
    expect(g.otherPositionPlayers).toBe(4);
  });

  it("agrees with the opponent chart row for row, for every position, when both are built from the same games", () => {
    const games = [
      game(1, [line({ name: "A", position: "PG", minutes: 30, pts: 12, reb: 3, ast: 8 }), line({ name: "B", position: "PG", minutes: 10, pts: 4, reb: 1, ast: 1 }), line({ name: "C", position: "C", minutes: 28, pts: 17, reb: 11, ast: 2 }), line({ name: "U", position: null, minutes: 14, pts: 9 })]),
      game(2, [line({ name: "D", position: "SG", minutes: 32, pts: 21, reb: 4, ast: 3 }), line({ name: "E", position: "PG", minutes: 26, pts: 8, reb: 2, ast: 5 })]),
      game(3, [line({ name: "F", position: null, minutes: 48, pts: 30 })]),
    ];
    for (const position of ["PG", "SG", "SF", "PF", "C"] as const) {
      const sequence: OpponentRecentSequence = {
        team: "BOS",
        position,
        season: "2026-27",
        seasonGames: 3,
        games: games.map((g) => {
          const attributedMinutes = g.players.reduce((sum, p) => sum + (p.position === null ? 0 : p.minutes), 0);
          const at = g.players.filter((p) => p.position === position);
          const total = (key: "pts" | "reb" | "ast") => (attributedMinutes > 0 ? at.reduce((sum, p) => sum + p[key], 0) : null);
          return { date: g.date, versus: g.versus, defenseIsHome: g.defenseIsHome, attributedMinutes, totalMinutes: g.players.reduce((sum, p) => sum + p.minutes, 0), pts: total("pts"), reb: total("reb"), ast: total("ast") };
        }),
      };
      const artifact = { ...boxes(games), opponentRecent: { [opponentRecentKey(GAME_KEY, "BOS", position)]: sequence } };
      for (const market of ["pts", "reb", "ast"] as const) {
        const e = entry({ positionLabel: position, market });
        const table = opponentBoxTable(e, artifact);
        const chart = opponentL10For({ ...e, entryKey: "k", playerName: "x", team: "NYK", tipoffUtc: "", line: null, lineWithheldReason: null, projection: null, projectionUnavailableReason: null }, artifact);
        const expected = opponentLastTen(sequence, market);
        expect(chart.average, `${position} ${market}`).toBe(expected.average);
        expect(table.average?.selected ?? null, `${position} ${market} average`).toBe(expected.average);
        expect(table.gamesWithFigure).toBe(expected.gamesWithFigure);
        expect(table.coverage).toBe(expected.coverage);
        // Newest first here, oldest first in the chart.
        expect(table.games.map((g) => g.subtotal?.selected ?? null)).toEqual([...expected.points.map((p) => p.value)].reverse());
      }
    }
  });
});
