import { describe, expect, it } from "vitest";
import type { ImportedPlayerGame } from "../playerGameImport";
import { directionalAccuracy, evaluateTiers, tierRows, wilson95, type LineObservation, type TieredRow } from "./tierEvaluation";
import { walkForward, type BacktestRow, type Method, type WalkRow } from "./walkForward";

const TEAM = "BOS";
const OPP = "NYK";
const day = (i: number): string => `2026-11-${String(i).padStart(2, "0")}`;

function row(playerId: string, i: number, minutes: number, over: Partial<ImportedPlayerGame> = {}): WalkRow {
  return { season: "2026-27", seasonType: "regular", gameId: `g${i}`, gameDate: day(i), team: TEAM, opponent: OPP, isHome: true, playerId, playerName: `Player ${playerId}`, minutes, pts: 20, reb: 5, ast: 4, ...over };
}
/** A run of games for one player with the given minutes, one per day starting at day 1. */
const run = (playerId: string, minutes: readonly number[], over: Partial<ImportedPlayerGame> = {}): WalkRow[] => minutes.map((m, i) => row(playerId, i + 1, m, over));

/** A scored row with hand-set predictions, so error arithmetic can be checked exactly. */
function scored(playerId: string, gameId: string, date: string, projected: number, actual: number, naive = projected): BacktestRow {
  const prediction = (value: number) => ({ minutes: 30, pts: value, reb: value, ast: value });
  const predictions = { v0: prediction(projected), naive_l5: prediction(naive), naive_l10: prediction(naive), naive_season_to_date: prediction(naive) } as unknown as Record<Method, ReturnType<typeof prediction>>;
  return {
    season: "2026-27", gameDate: date, gameId, playerId, team: TEAM, isHome: true, priorGames: 5, seasonPriorGames: 5, previousSeasonGames: 0, historyTier: "partial",
    flags: { teamChangedRecently: false, returningFromAbsence: false, roleChange: false }, teamRestDays: 1, marginAbs: 5, expectedAbsMargin: null, opponentDefense: null,
    predictions: predictions as unknown as BacktestRow["predictions"], candidates: {}, actual: { minutes: 30, pts: actual, reb: actual, ast: actual },
  };
}
const tiered = (group: TieredRow["group"], r: BacktestRow): TieredRow => ({ row: r, group, mpg: 30, stable: true });

describe("tierRows: who was Core, Rotation or Variable before each game", () => {
  const steady = run("steady", [32, 33, 31, 34, 32, 30, 33, 32]);
  const bench = run("bench", [10, 12, 8, 11, 9, 10, 12, 9]);
  const middle = run("middle", [22, 23, 21, 24, 22, 22, 23, 21]);
  const all = [...steady, ...bench, ...middle];
  const result = walkForward(all, { targetSeasons: ["2026-27"] });
  const rows = tierRows(all, result.rows);
  const groupOf = (playerId: string, i: number): TieredRow["group"] | undefined => rows.find((t) => t.row.playerId === playerId && t.row.gameId === `g${i}`)?.group;

  it("scores a game with the tier the board would have shown before it", () => {
    expect(groupOf("steady", 8)).toBe("core");
    expect(groupOf("middle", 8)).toBe("rotation");
    expect(groupOf("bench", 8)).toBe("variable");
  });

  it("keeps a player with fewer than five earlier games out of Core, however many minutes they played", () => {
    expect(groupOf("steady", 3)).toBe("variable");
    expect(groupOf("steady", 5)).toBe("variable");
    expect(groupOf("steady", 6)).toBe("core");
  });

  it("never lets the game itself or a later one change its own tier", () => {
    const withBlowup = all.map((r) => (r.playerId === "steady" && r.gameId === "g8" ? { ...r, minutes: 2 } : r));
    const again = tierRows(withBlowup, walkForward(withBlowup, { targetSeasons: ["2026-27"] }).rows);
    expect(again.find((t) => t.row.playerId === "steady" && t.row.gameId === "g8")?.group).toBe("core");
    const later = all.filter((r) => !(r.playerId === "steady" && r.gameId === "g8"));
    expect(tierRows(later, walkForward(later, { targetSeasons: ["2026-27"] }).rows).find((t) => t.row.playerId === "steady" && t.row.gameId === "g7")?.group).toBe(groupOf("steady", 7));
  });

  it("returns one tiered row per scored row, in the same order", () => {
    expect(rows.map((t) => t.row)).toEqual(result.rows);
  });
});

describe("evaluateTiers", () => {
  const rows = [
    ...Array.from({ length: 4 }, (_, i) => tiered("core", scored(`c${i}`, `g${i}`, day(10 + i), 20, 22, 26))),
    ...Array.from({ length: 2 }, (_, i) => tiered("rotation", scored(`r${i}`, `h${i}`, day(10 + i), 10, 16, 10))),
  ];
  const result = evaluateTiers(rows);

  it("counts rows and players per group and flags a thin group", () => {
    expect(result.groups.core).toMatchObject({ rows: 4, players: 4, thin: true });
    expect(result.groups.rotation).toMatchObject({ rows: 2, players: 2 });
    expect(result.groups.variable).toMatchObject({ rows: 0, players: 0 });
  });

  it("reports mean absolute error and bias per group and stat, with the sample size", () => {
    expect(result.groups.core.measures.pts).toMatchObject({ n: 4, mae: 2, bias: -2 });
    expect(result.groups.rotation.measures.reb).toMatchObject({ n: 2, mae: 6, bias: -6 });
    expect(result.groups.core.measures.minutes).toMatchObject({ n: 4, mae: 0 });
  });

  it("also reports error as a share of the mean outcome, because absolute error grows with volume", () => {
    // Core: mean actual 22, MAE 2 -> 9.1%. Rotation: mean actual 16, MAE 6 -> 37.5%.
    expect(result.groups.core.measures.pts.meanActual).toBe(22);
    expect(result.groups.core.measures.pts.maeRelative).toBeCloseTo(2 / 22, 10);
    expect(result.groups.rotation.measures.pts.maeRelative).toBeCloseTo(6 / 16, 10);
    expect(result.groups.variable.measures.pts).toMatchObject({ meanActual: null, maeRelative: null });
  });

  it("compares the JKB projection with the naive last-ten average on the same rows (negative favours JKB)", () => {
    // Core: |20-22| = 2 vs |26-22| = 4 -> -2 each; Rotation: 6 vs 6 -> 0.
    expect(result.groups.core.measures.pts.vsNaiveL10.meanDiff).toBe(-2);
    expect(result.groups.rotation.measures.pts.vsNaiveL10.meanDiff).toBe(0);
  });

  it("scores the three groups on exactly the rows given, and the overall line on all of them", () => {
    expect(result.overall.rows).toBe(6);
    expect(result.overall.measures.pts.n).toBe(6);
  });

  it("gives no error figure, rather than a zero, for a group with no rows", () => {
    expect(result.groups.variable.measures.pts).toMatchObject({ n: 0, mae: null, bias: null, maeCi95: null });
  });
});

describe("wilson95", () => {
  it("is the Wilson score interval for a proportion", () => {
    const [lo, hi] = wilson95(60, 100)!;
    expect(lo).toBeCloseTo(0.5, 1);
    expect(hi).toBeCloseTo(0.69, 1);
  });
  it("has no interval for no trials", () => {
    expect(wilson95(0, 0)).toBeNull();
  });
});

describe("directionalAccuracy: JKB against a posted line, only for lines captured before tip-off", () => {
  const TIP = "2026-11-10T00:30:00Z";
  const before = "2026-11-09T22:00:00Z";
  const after = "2026-11-10T01:00:00Z";
  const line = (playerId: string, gameId: string, value: number, over: Partial<LineObservation> = {}): LineObservation => ({ gameId, playerId, stat: "pts", line: value, capturedAtUtc: before, tipoffUtc: TIP, ...over });
  const rows = [
    tiered("core", scored("a", "g1", day(10), 25, 28)), // projects over 22.5, went over: hit
    tiered("core", scored("b", "g1", day(10), 20, 28)), // projects under 22.5, went over: miss
    tiered("core", scored("c", "g1", day(10), 25, 22.5)), // push: excluded
    tiered("core", scored("d", "g1", day(10), 22.5, 30)), // projection equals the line: no lean, excluded
    tiered("rotation", scored("e", "g1", day(10), 10, 8)), // projects under 11.5, went under: hit
  ];

  it("counts hits among called games, excluding pushes and no-lean projections, and reports the sample", () => {
    const lines = [line("a", "g1", 22.5), line("b", "g1", 22.5), line("c", "g1", 22.5), line("d", "g1", 22.5), line("e", "g1", 11.5)];
    const result = directionalAccuracy(rows, lines);
    expect(result.groups.core.pts).toMatchObject({ matched: 4, called: 2, hits: 1, pushes: 1, noLean: 1, accuracy: 0.5 });
    expect(result.groups.rotation.pts).toMatchObject({ called: 1, hits: 1, accuracy: 1 });
    expect(result.groups.variable.pts).toMatchObject({ called: 0, hits: 0, accuracy: null });
  });

  it("drops a line captured at or after tip-off, and says how many", () => {
    const lines = [line("a", "g1", 22.5, { capturedAtUtc: after }), line("b", "g1", 22.5, { capturedAtUtc: TIP }), line("e", "g1", 11.5)];
    const result = directionalAccuracy(rows, lines);
    expect(result.excludedNotPregame).toBe(2);
    expect(result.groups.core.pts.matched).toBe(0);
    expect(result.groups.rotation.pts.called).toBe(1);
  });

  it("counts a line with no scored game separately instead of dropping it silently", () => {
    const result = directionalAccuracy(rows, [line("zzz", "g9", 10), line("a", "g1", 22.5)]);
    expect(result.unmatchedLines).toBe(1);
  });

  it("reports the share of games that went over, so a hit rate can be read against it", () => {
    const result = directionalAccuracy(rows, [line("a", "g1", 22.5), line("b", "g1", 22.5)]);
    expect(result.groups.core.pts.overRate).toBe(1);
  });

  it("makes no accuracy claim without lines", () => {
    const result = directionalAccuracy(rows, []);
    expect(result.groups.core.pts).toMatchObject({ matched: 0, called: 0, accuracy: null, accuracyCi95: null });
    expect(result.linesUsed).toBe(0);
  });

  it("keeps a market's lines apart: a points line never scores a rebounds projection", () => {
    const result = directionalAccuracy(rows, [line("a", "g1", 22.5)]);
    expect(result.groups.core.reb.matched).toBe(0);
  });

  it("uses the most recent pregame line for a player and market when a book posted several", () => {
    const early = line("b", "g1", 15, { capturedAtUtc: "2026-11-09T18:00:00Z" });
    const late = line("b", "g1", 22.5, { capturedAtUtc: "2026-11-09T22:00:00Z" });
    const result = directionalAccuracy(rows, [early, late]);
    // With the late line (22.5) JKB's 20 leans under and the 28 went over: one miss. With the early line (15) it would lean over and hit.
    expect(result.groups.core.pts).toMatchObject({ called: 1, hits: 0 });
  });
});
