import { describe, expect, it } from "vitest";
import { describeStarterGaps, describeStarterMatch, opponentBoxTable, opponentLastTenFromBox, playerBoxTable } from "./boxScoreTables";
import { classifyRosterLabel, type DvpPosition } from "./dvpPositions";
import { opponentBoxKey, playerLastTen, teamDefenseKey, type OpponentBoxScoreGame, type OpposingPlayerLine, type PlayerRecentGame, type TeamDefenseEntry, type TeamDefenseTable } from "./recentForm";
import { opponentL10For, type BoardEntry } from "./propsBoard";

const GAME_KEY = "2026-11-09|NYK@BOS";
const entry = (over: Partial<Pick<BoardEntry, "positionLabel" | "opponent" | "market">> = {}): Pick<BoardEntry, "positionLabel" | "opponent" | "gameKey" | "market"> => ({ positionLabel: "PG", opponent: "BOS", gameKey: GAME_KEY, market: "pts", ...over });

const line = (over: Partial<OpposingPlayerLine> & { name: string }): OpposingPlayerLine => ({ minutes: 30, pts: 10, reb: 4, ast: 2, position: "PG", starter: false, ...over });
const game = (n: number, players: OpposingPlayerLine[]): OpponentBoxScoreGame => ({ gameId: `g${n}`, date: `2026-10-${String(10 + n).padStart(2, "0")}`, versus: "MIA", defenseIsHome: n % 2 === 0, players });
const boxes = (games: OpponentBoxScoreGame[]) => ({ opponentBoxScores: { [opponentBoxKey(GAME_KEY, "BOS")]: games } });

/** A complete 240-minute roster: five starters, one at each position, and a bench that includes a second PG and an unclassified player. */
function roster(over: Partial<Record<string, Partial<OpposingPlayerLine>>> = {}): OpposingPlayerLine[] {
  const base: OpposingPlayerLine[] = [
    line({ name: "Point", position: "PG", starter: true, minutes: 34, pts: 20, reb: 4, ast: 7 }),
    line({ name: "Wing", position: "SG", starter: true, minutes: 33, pts: 18, reb: 3, ast: 3 }),
    line({ name: "Small", position: "SF", starter: true, minutes: 31, pts: 14, reb: 5, ast: 2 }),
    line({ name: "Power", position: "PF", starter: true, minutes: 29, pts: 12, reb: 8, ast: 1 }),
    line({ name: "Big", position: "C", starter: true, minutes: 27, pts: 10, reb: 11, ast: 1 }),
    line({ name: "Backup Point", position: "PG", minutes: 30, pts: 25, reb: 2, ast: 6 }),
    line({ name: "Backup Wing", position: "SG", minutes: 28, pts: 9, reb: 2, ast: 2 }),
    line({ name: "Unrated", position: null, minutes: 28, pts: 4, reb: 3, ast: 0 }),
  ];
  return base.map((p) => ({ ...p, ...(over[p.name] ?? {}) }));
}
const TEAM_PTS = 20 + 18 + 14 + 12 + 10 + 25 + 9 + 4;

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

describe("playerBoxTable: opponent DEF RTG", () => {
  const rated = (rank: number, games: number, rating = 108.4): TeamDefenseEntry => ({ rating, leagueRating: 112, rank, rankedOf: 30, games });
  const table = (asOf: Record<string, TeamDefenseEntry>, usableGames = 100, unusableGames = 0): TeamDefenseTable => ({ season: "2026-27", asOf, usableGames, unusableGames });
  const recent = [played(1, { opponent: "MIA" }), played(2, { opponent: "ATL" }), played(3, { opponent: "CHI" })];
  const last = playerLastTen(recent, "pts");

  it("looks up each game's opponent by the date of that game, newest first", () => {
    const t = playerBoxTable(last, "pts", table({ [teamDefenseKey("MIA", "2026-10-11")]: rated(3, 8, 101.2), [teamDefenseKey("ATL", "2026-10-12")]: rated(15, 8, 111.5), [teamDefenseKey("CHI", "2026-10-13")]: rated(28, 8, 118.9) }));
    expect(t.defenseStatus).toBe("ok");
    expect(t.rows.map((r) => [r.opponent, r.defense?.rating, r.strength])).toEqual([["CHI", 118.9, "weak"], ["ATL", 111.5, "average"], ["MIA", 101.2, "strong"]]);
  });

  it("does not use a rating from another date for the same opponent", () => {
    const t = playerBoxTable(last, "pts", table({ [teamDefenseKey("MIA", "2026-10-20")]: rated(3, 8) }));
    expect(t.rows.every((r) => r.defense === null)).toBe(true);
  });

  it("gives no label under the minimum sample but keeps the rating and its sample size", () => {
    const t = playerBoxTable(last, "pts", table({ [teamDefenseKey("MIA", "2026-10-11")]: rated(2, 3) }));
    const row = t.rows.find((r) => r.opponent === "MIA");
    expect(row?.defense).toMatchObject({ rating: 108.4, games: 3 });
    expect(row?.strength).toBeNull();
  });

  it("leaves a game with no earlier opponent game blank, and averages only the games that have a rating", () => {
    const t = playerBoxTable(last, "pts", table({ [teamDefenseKey("MIA", "2026-10-11")]: rated(3, 8, 100), [teamDefenseKey("ATL", "2026-10-12")]: rated(9, 8, 110) }));
    expect(t.rows.find((r) => r.opponent === "CHI")?.defense).toBeNull();
    expect(t.defenseKnown).toBe(2);
    expect(t.defenseAverage).toBe(105);
  });

  it("says whether the board predates DEF RTG or was built without possession inputs, instead of showing blanks as if rated", () => {
    expect(playerBoxTable(last, "pts").defenseStatus).toBe("stale");
    expect(playerBoxTable(last, "pts", table({}, 0, 12)).defenseStatus).toBe("no-inputs");
    expect(playerBoxTable(last, "pts", table({}, 0, 12)).defenseAverage).toBeNull();
    // A stored null, or a season with no games yet, is not "no possession inputs".
    expect(playerBoxTable(last, "pts", null).defenseStatus).toBe("stale");
    expect(playerBoxTable(last, "pts", table({}, 0, 0)).defenseStatus).toBe("ok");
  });
});

describe("opponentBoxTable: team totals allowed first, the starter as optional detail", () => {
  it("shows the opposing team's full score and, separately, the starter at the position", () => {
    const g = opponentBoxTable(entry(), boxes([game(1, roster())])).games[0];
    expect(g.teamPtsAllowed).toBe(TEAM_PTS);
    expect(g.starter).toMatchObject({ name: "Point", pts: 20 });
    expect(g.starter?.pts).not.toBe(TEAM_PTS);
  });

  it("takes the player the source flags as the starter, not whoever scored most at the position", () => {
    const g = opponentBoxTable(entry(), boxes([game(1, roster())])).games[0];
    expect(g.starter?.name).toBe("Point");
    expect(g.players.find((p) => p.name === "Backup Point")?.pts).toBe(25);
  });

  it("never adds two players' figures into one: the starter figure is one player's line", () => {
    const g = opponentBoxTable(entry(), boxes([game(1, roster())])).games[0];
    expect(g.starter).toEqual(g.players.find((p) => p.name === "Point"));
    expect(g.starter?.pts).toBe(20); // not 20 + 25, the two PGs
  });

  it("lists the complete opposing box score by minutes, then name, with no preference for starters", () => {
    const g = opponentBoxTable(entry(), boxes([game(1, roster())])).games[0];
    expect(g.players.map((p) => p.name)).toEqual(["Point", "Wing", "Small", "Backup Point", "Power", "Backup Wing", "Unrated", "Big"]);
    expect(g.players.reduce((sum, p) => sum + p.minutes, 0)).toBe(240);
    expect(g.players.find((p) => p.name === "Unrated")).toMatchObject({ position: null, starter: false });
  });

  it("marks who is in the game's rotation by minutes played in that game, not by the starter flag", () => {
    const g = opponentBoxTable(entry(), boxes([game(1, roster({ Unrated: { minutes: 8 }, Big: { minutes: 14 }, "Backup Wing": { minutes: 15 } }))])).games[0];
    const rotation = Object.fromEntries(g.players.map((p) => [p.name, p.inRotation]));
    expect(rotation).toMatchObject({ Unrated: false, Big: false, "Backup Wing": true, Point: true });
  });

  it("totals rebounds and assists as the team's, over a complete box only", () => {
    const complete = opponentBoxTable(entry(), boxes([game(1, roster())])).games[0];
    expect(complete.teamAllowed).toEqual({ pts: TEAM_PTS, reb: 38, ast: 22 });
    const missing = opponentBoxTable(entry(), boxes([game(1, roster().filter((p) => p.name !== "Unrated"))])).games[0];
    expect(missing.teamAllowed).toEqual({ pts: null, reb: null, ast: null });
  });

  it("selects the market's stat as the starter's and each player's result", () => {
    const g = opponentBoxTable(entry({ market: "ast" }), boxes([game(1, roster())])).games[0];
    expect(g.starter?.selected).toBe(7);
    expect(g.players.find((p) => p.name === "Big")?.selected).toBe(1);
  });

  it("is null, not a floor, for team points when the opposing box score is not a complete game", () => {
    const missingPlayer = roster().filter((p) => p.name !== "Unrated");
    const g = opponentBoxTable(entry(), boxes([game(1, missingPlayer)])).games[0];
    expect(g.teamPtsAllowed).toBeNull();
    expect(g.starter?.name).toBe("Point");
  });

  it("averages team points over the games with a complete box score and says how many that is", () => {
    const table = opponentBoxTable(entry(), boxes([game(1, roster()), game(2, roster({ Point: { pts: 30 } })), game(3, roster().filter((p) => p.name !== "Unrated"))]));
    expect(table.teamKnown.pts).toBe(2);
    expect(table.teamAverage.pts).toBe((TEAM_PTS + TEAM_PTS + 10) / 2);
    expect(table.teamKnown.reb).toBe(2);
  });
});

describe("opponentBoxTable: the official team score", () => {
  const withScore = (g: OpponentBoxScoreGame, teamScore: number): OpponentBoxScoreGame => ({ ...g, teamScore });

  it("takes points allowed from the official score and marks the box complete when the players add up to it", () => {
    const g = opponentBoxTable(entry(), boxes([withScore(game(1, roster()), TEAM_PTS)])).games[0];
    expect(g).toMatchObject({ teamPtsAllowed: TEAM_PTS, teamPtsSource: "official", boxComplete: true, playerPtsSum: TEAM_PTS });
  });

  it("still knows the points allowed when a player row is missing, and says the box is short by name of the difference", () => {
    const missing = roster().filter((p) => p.name !== "Unrated"); // a 4-point row
    const g = opponentBoxTable(entry(), boxes([withScore(game(1, missing), TEAM_PTS)])).games[0];
    expect(g).toMatchObject({ teamPtsAllowed: TEAM_PTS, teamPtsSource: "official", boxComplete: false, playerPtsSum: TEAM_PTS - 4 });
  });

  it("recovers a game the minutes rule would have blanked, and averages it", () => {
    const missing = roster().filter((p) => p.name !== "Unrated");
    const table = opponentBoxTable(entry(), boxes([withScore(game(1, missing), TEAM_PTS), game(2, roster())]));
    expect(table.teamKnown.pts).toBe(2);
    expect(table.teamAverage.pts).toBe(TEAM_PTS);
    // Only points have an official total: the short box still gives no rebound or assist total.
    expect(table.teamKnown.reb).toBe(1);
    const noScore = opponentBoxTable(entry(), boxes([game(1, missing), game(2, roster())]));
    expect(noScore.games.find((x) => x.gameId === "g1")).toMatchObject({ teamPtsAllowed: null, teamPtsSource: null, boxComplete: false });
  });

  it("does not change a board without official scores: the box sum, accepted only for a full game", () => {
    expect(opponentBoxTable(entry(), boxes([game(1, roster())])).games[0]).toMatchObject({ teamPtsAllowed: TEAM_PTS, teamPtsSource: "box", boxComplete: true });
  });
});

describe("opponentBoxTable: starter outcomes and gaps", () => {
  const scenarios = (): OpponentBoxScoreGame[] => [
    game(1, roster()), // matched
    game(2, roster({ Wing: { position: "PG" } })), // two PG starters
    game(3, roster({ Point: { position: "SF" } })), // no PG starter
    game(4, roster({ Big: { position: null } })), // an unclassified starter
    game(5, roster().map(({ starter: _s, ...rest }) => rest)), // no starter status
    game(6, roster({ Point: { pts: 40 } })), // matched
  ];

  it("counts every outcome and leaves the unmatched games out of the starter average", () => {
    const table = opponentBoxTable(entry(), boxes(scenarios()));
    expect(table.gaps).toEqual({ multiple: 1, none: 1, uncertain: 1, unavailable: 1 });
    expect(table.gamesWithFigure).toBe(2);
    expect(table.average?.pts).toBe(30);
    expect(table.starterData).toBe("some");
  });

  it("gives a game with several starters at the position no single figure, and lists them all", () => {
    const g = opponentBoxTable(entry(), boxes([game(1, roster({ Wing: { position: "PG" } }))])).games[0];
    expect(g.starter).toBeNull();
    expect(g.starterMatch?.kind === "multiple" && g.starterMatch.players.map((p) => p.name).sort()).toEqual(["Point", "Wing"]);
    expect(describeStarterMatch(g.starterMatch!, "PG")).toMatch(/2 starters are estimated at PG.*no single player is chosen/);
  });

  it("explains each gap in words", () => {
    const [matched, multiple, none, uncertain, unavailable] = opponentBoxTable(entry(), boxes(scenarios())).games.reverse().map((g) => describeStarterMatch(g.starterMatch!, "PG"));
    expect(matched).toBe("Point started at PG");
    expect(multiple).toMatch(/no single player is chosen/);
    expect(none).toMatch(/positional substitution or an unconventional lineup/);
    expect(uncertain).toMatch(/no position estimate/);
    expect(unavailable).toMatch(/no starter status/);
    expect(describeStarterGaps({ multiple: 2, none: 0, uncertain: 1, unavailable: 0 }, "PG")).toBe("2 games with several PG starters; 1 game where a starter has no position estimate");
    expect(describeStarterGaps({ multiple: 0, none: 0, uncertain: 0, unavailable: 0 }, "PG")).toBe("");
  });

  it("does not call a board old when every game has flags that merely name other than five starters", () => {
    const fourStarters = roster({ Big: { starter: false } });
    const table = opponentBoxTable(entry(), boxes([game(1, fourStarters), game(2, fourStarters)]));
    expect(table.starterData).toBe("all");
    expect(table.gaps.unavailable).toBe(2);
    // The team totals do not depend on the starter flags at all.
    expect(opponentLastTenFromBox(table, "pts")).toMatchObject({ status: "ok", gamesWithFigure: 2, games: 2 });
    expect(describeStarterMatch(table.games[0].starterMatch!, "PG")).toMatch(/flagged 4 starters instead of five/);
  });

  it("reads a board built before starters were carried as having no starter data, still showing team points", () => {
    const noFlags = roster().map(({ starter: _s, ...rest }) => rest);
    const table = opponentBoxTable(entry(), boxes([game(1, noFlags), game(2, noFlags)]));
    expect(table.status).toBe("ok");
    expect(table.starterData).toBe("none");
    expect(table.average).toBeNull();
    expect(table.games[0].teamPtsAllowed).toBe(TEAM_PTS);
    expect(table.games[0].players.every((p) => p.starter === null)).toBe(true);
  });
});

describe("opponentBoxTable: window, ordering and unavailable states", () => {
  it("lists games newest to oldest and averages the matched starters", () => {
    const games = [game(1, roster({ Point: { pts: 10 } })), game(2, roster({ Point: { pts: 20 } })), game(3, roster({ Point: { pts: 30 } }))];
    const table = opponentBoxTable(entry(), boxes(games));
    expect(table.games.map((g) => g.date)).toEqual(["2026-10-13", "2026-10-12", "2026-10-11"]);
    expect(table.average?.pts).toBe(20);
    expect(table.gamesWithFigure).toBe(3);
    expect(table.isSmallSample).toBe(true);
  });

  it("keeps only the last ten games of a longer list", () => {
    const table = opponentBoxTable(entry(), boxes(Array.from({ length: 13 }, (_, i) => game(i + 1, roster()))));
    expect(table.games).toHaveLength(10);
    expect(table.games[0].gameId).toBe("g13");
    expect(table.games.at(-1)?.gameId).toBe("g4");
    expect(table.isSmallSample).toBe(false);
  });

  it("says why there is nothing to show instead of an empty table", () => {
    expect(opponentBoxTable(entry(), {}).status).toBe("stale");
    expect(opponentBoxTable(entry({ opponent: null }), boxes([game(1, roster())])).status).toBe("no-opponent");
    expect(opponentBoxTable(entry(), boxes([])).status).toBe("none");
    expect(opponentBoxTable(entry(), { opponentBoxScores: {} }).status).toBe("none");
  });
});

describe("opponentBoxTable: the same position as DvP", () => {
  it("uses the primary position of the roster label's DvP classification, for every label the DvP rules accept", () => {
    for (const label of ["PG", "SG", "SF", "PF", "C", "G", "F", "G-F", "F-G", "F-C", "C-F", "PG-SG", "SG/SF/PF"]) {
      const classification = classifyRosterLabel(label);
      if (classification.ok === false) throw new Error(label);
      const table = opponentBoxTable(entry({ positionLabel: label }), boxes([game(1, roster())]));
      expect(table.position, label).toBe(classification.primary);
      expect(table.games[0].starter?.position, label).toBe(classification.primary);
    }
  });

  it("never guesses a position from a generic label: the table still shows team totals, with no position detail", () => {
    for (const label of ["G-C", "", "  ", "X", "PG-F", "Guard", null]) {
      const table = opponentBoxTable(entry({ positionLabel: label }), boxes([game(1, roster())]));
      expect(table.status, String(label)).toBe("ok");
      expect(table.position, String(label)).toBeNull();
      expect(table.games[0].starterMatch, String(label)).toBeNull();
      expect(table.games[0].starter, String(label)).toBeNull();
      expect(table.games[0].teamPtsAllowed, String(label)).toBe(TEAM_PTS);
      expect(table.gamesWithFigure, String(label)).toBe(0);
    }
  });
});

describe("opponentLastTenFromBox: the chart and the column read the very table", () => {
  const scenarios = (): OpponentBoxScoreGame[] => [game(1, roster({ Point: { pts: 11 } })), game(2, roster({ Wing: { position: "PG" } })), game(3, roster({ Point: { pts: 33 } }))];

  it("plots what the defense allowed as a team per game, oldest to newest", () => {
    const l10 = opponentLastTenFromBox(opponentBoxTable(entry(), boxes(scenarios())), "pts");
    expect(l10).toMatchObject({ status: "ok", games: 3, gamesWithFigure: 3, isSmallSample: true });
    expect(l10.points.map((p) => p.value)).toEqual([TEAM_PTS - 9, TEAM_PTS, TEAM_PTS + 13]);
    expect(l10.average).toBe((TEAM_PTS * 3 + 4) / 3);
    expect(l10.points[0]).toMatchObject({ versus: "@ MIA", detail: "Summed from the listed players" });
  });

  it("is a team total in rebounds and assists too, never one player's line", () => {
    const table = opponentBoxTable(entry({ market: "reb" }), boxes([game(1, roster())]));
    expect(opponentLastTenFromBox(table, "reb").points.map((p) => p.value)).toEqual([38]);
    expect(opponentLastTenFromBox(table, "ast").points.map((p) => p.value)).toEqual([22]);
  });

  it("does not depend on the player's position or on the starter flags", () => {
    const noFlags = roster().map(({ starter: _s, ...rest }) => rest);
    const base = opponentLastTenFromBox(opponentBoxTable(entry(), boxes([game(1, roster())])), "pts");
    expect(opponentLastTenFromBox(opponentBoxTable(entry({ positionLabel: null }), boxes([game(1, roster())])), "pts")).toEqual(base);
    expect(opponentLastTenFromBox(opponentBoxTable(entry({ positionLabel: "C" }), boxes([game(1, roster())])), "pts")).toEqual(base);
    expect(opponentLastTenFromBox(opponentBoxTable(entry(), boxes([game(1, noFlags)])), "pts")).toEqual(base);
  });

  it("is the same for opponentL10For, which the board rows use", () => {
    const e = entry({ market: "ast" });
    const full = { ...e, entryKey: "k", playerName: "x", team: "NYK", tipoffUtc: "", line: null, lineWithheldReason: null, projection: null, projectionUnavailableReason: null };
    const artifact = boxes(scenarios());
    expect(opponentL10For(full, artifact)).toEqual(opponentLastTenFromBox(opponentBoxTable(e, artifact), "ast"));
  });

  it("agrees with the table game for game, for every market", () => {
    const table = opponentBoxTable(entry(), boxes(scenarios()));
    for (const market of ["pts", "reb", "ast"] as const) {
      const l10 = opponentLastTenFromBox(table, market);
      expect(l10.average, market).toBe(table.teamAverage[market]);
      expect(l10.points.map((p) => p.value), market).toEqual(table.games.map((g) => g.teamAllowed[market]).reverse());
    }
  });

  it("leaves a gap, with its reason, for a box score that is not a complete game", () => {
    const short = roster().filter((p) => p.name !== "Unrated");
    const l10 = opponentLastTenFromBox(opponentBoxTable(entry(), boxes([game(1, short), game(2, roster())])), "pts");
    expect(l10).toMatchObject({ status: "ok", games: 2, gamesWithFigure: 1, average: TEAM_PTS });
    expect(l10.points.map((p) => p.value)).toEqual([null, TEAM_PTS]);
    expect(l10.points[0].detail).toMatch(/not a complete game/);
  });

  it("uses the official score for points even when the rows fall short, but not for rebounds or assists", () => {
    const short = roster().filter((p) => p.name !== "Unrated");
    const table = opponentBoxTable(entry(), boxes([{ ...game(1, short), teamScore: TEAM_PTS }]));
    expect(opponentLastTenFromBox(table, "pts")).toMatchObject({ status: "ok", average: TEAM_PTS });
    expect(opponentLastTenFromBox(table, "pts").points[0].detail).toBe("Official final score");
    expect(opponentLastTenFromBox(table, "reb")).toMatchObject({ status: "none", average: null, gamesWithFigure: 0 });
  });

  it("has no figure when no box score in the window is complete", () => {
    const short = roster().filter((p) => p.name !== "Unrated");
    expect(opponentLastTenFromBox(opponentBoxTable(entry(), boxes([game(1, short), game(2, short)])), "pts")).toMatchObject({ status: "none", average: null, gamesWithFigure: 0, games: 2 });
  });

  it("passes the table's unavailable states through", () => {
    expect(opponentLastTenFromBox(opponentBoxTable(entry(), {}), "pts").status).toBe("stale");
    expect(opponentLastTenFromBox(opponentBoxTable(entry({ opponent: null }), boxes([game(1, roster())])), "pts").status).toBe("no-opponent");
    expect(opponentLastTenFromBox(opponentBoxTable(entry(), boxes([])), "pts").status).toBe("none");
  });
});
