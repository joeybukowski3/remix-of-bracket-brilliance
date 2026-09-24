import { describe, expect, it } from "vitest";
import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";
import { buildTdsAllowedRows } from "./buildRows";
import { makeHistoricalPlayerWeek } from "../fantasyAllowed/__fixtures__/historicalPlayerWeek";

const TEAMS = ["buf", "mia", "nyj"];

function tdRow(
  overrides: Partial<HistoricalPlayerWeek> & { rushingTouchdowns?: number; receivingTouchdowns?: number; passingTouchdowns?: number },
) {
  const { rushingTouchdowns = 0, receivingTouchdowns = 0, passingTouchdowns = 0, ...rest } = overrides;
  return makeHistoricalPlayerWeek({
    ...rest,
    stats: { ...makeHistoricalPlayerWeek().stats, rushingTouchdowns, receivingTouchdowns, passingTouchdowns },
  });
}

describe("buildTdsAllowedRows", () => {
  it("builds independent 2026 and 2025 samples from season-tagged rows", () => {
    const rows = [
      tdRow({ position: "RB", opponent: "buf", season: 2025, week: 1, rushingTouchdowns: 1 }),
      tdRow({ position: "RB", opponent: "buf", season: 2026, week: 1, rushingTouchdowns: 4 }),
    ];
    const result = buildTdsAllowedRows({
      historicalRows: rows,
      teams: TEAMS,
      currentSeason: 2026,
      priorSeason: 2025,
      opponents: new Map(),
    });
    const buf = result.find((row) => row.team === "buf")!;
    expect(buf.samples["2025"].rbRush?.touchdownsAllowedPerGame).toBe(1);
    expect(buf.samples["2026"].rbRush?.touchdownsAllowedPerGame).toBe(4);
  });

  it("rolls the last5 sample backward from 2026 into 2025 when 2026 has fewer than 5 games", () => {
    const rows = [
      tdRow({ position: "QB", opponent: "buf", season: 2025, week: 15, passingTouchdowns: 1 }),
      tdRow({ position: "QB", opponent: "buf", season: 2025, week: 16, passingTouchdowns: 2 }),
      tdRow({ position: "QB", opponent: "buf", season: 2025, week: 17, passingTouchdowns: 1 }),
      tdRow({ position: "QB", opponent: "buf", season: 2026, week: 1, passingTouchdowns: 3 }),
      tdRow({ position: "QB", opponent: "buf", season: 2026, week: 2, passingTouchdowns: 0 }),
    ];
    const result = buildTdsAllowedRows({
      historicalRows: rows,
      teams: TEAMS,
      currentSeason: 2026,
      priorSeason: 2025,
      opponents: new Map(),
    });
    const buf = result.find((row) => row.team === "buf")!;
    expect(buf.samples.last5.qbPass?.gamesSampled).toBe(5);
    expect(buf.samples.last5.qbPass?.touchdownsAllowedTotal).toBe(1 + 2 + 1 + 3 + 0);
  });

  it("last8 selects exactly 8 games and rolls backward from 2026 into 2025 (regular season only)", () => {
    const rows = [
      tdRow({ position: "RB", opponent: "buf", season: 2025, week: 11, rushingTouchdowns: 1 }),
      tdRow({ position: "RB", opponent: "buf", season: 2025, week: 12, rushingTouchdowns: 0 }),
      tdRow({ position: "RB", opponent: "buf", season: 2025, week: 13, rushingTouchdowns: 2 }),
      tdRow({ position: "RB", opponent: "buf", season: 2025, week: 14, rushingTouchdowns: 1 }),
      tdRow({ position: "RB", opponent: "buf", season: 2025, week: 15, rushingTouchdowns: 0 }),
      tdRow({ position: "RB", opponent: "buf", season: 2025, week: 16, rushingTouchdowns: 1 }),
      tdRow({ position: "RB", opponent: "buf", season: 2025, week: 17, rushingTouchdowns: 2 }),
      tdRow({ position: "RB", opponent: "buf", season: 2026, week: 1, rushingTouchdowns: 3 }),
      tdRow({ position: "RB", opponent: "buf", season: 2026, week: 2, rushingTouchdowns: 1 }),
    ];
    const result = buildTdsAllowedRows({
      historicalRows: rows,
      teams: TEAMS,
      currentSeason: 2026,
      priorSeason: 2025,
      opponents: new Map(),
    });
    const buf = result.find((row) => row.team === "buf")!;
    // Most recent 8 completed games: 2026 wk1-2 plus 2025 wk12-17 (wk11 falls out of the window).
    expect(buf.samples.last8.rbRush?.gamesSampled).toBe(8);
    expect(buf.samples.last8.rbRush?.touchdownsAllowedTotal).toBe(0 + 2 + 1 + 0 + 1 + 2 + 3 + 1);
  });

  it("last5 behavior is unaffected by the addition of last8", () => {
    const rows = [
      tdRow({ position: "TE", opponent: "buf", season: 2026, week: 1, receivingTouchdowns: 1 }),
      tdRow({ position: "TE", opponent: "buf", season: 2026, week: 2, receivingTouchdowns: 2 }),
    ];
    const result = buildTdsAllowedRows({
      historicalRows: rows,
      teams: TEAMS,
      currentSeason: 2026,
      priorSeason: 2025,
      opponents: new Map(),
    });
    const buf = result.find((row) => row.team === "buf")!;
    expect(buf.samples.last5.teRec?.gamesSampled).toBe(2);
    expect(buf.samples.last5.teRec?.touchdownsAllowedTotal).toBe(3);
  });

  it("excludes preseason and playoff rows entirely (normalizeHistoricalPlayerWeek only ever produces REG rows)", () => {
    // HistoricalPlayerWeek fixtures here are always REG (see normalizeHistoricalPlayerWeek), so a
    // non-REG row simply cannot reach buildTdsAllowedRows -- this test documents that invariant.
    const rows = [tdRow({ position: "RB", opponent: "buf", season: 2025, week: 1, rushingTouchdowns: 1 })];
    const result = buildTdsAllowedRows({
      historicalRows: rows,
      teams: TEAMS,
      currentSeason: 2026,
      priorSeason: 2025,
      opponents: new Map(),
    });
    const buf = result.find((row) => row.team === "buf")!;
    expect(buf.samples["2025"].rbRush?.gamesSampled).toBe(1);
  });

  it("counts only a WR's receiving touchdowns in WR REC (rushing, passing, special-teams and two-point scores are excluded)", () => {
    const rows = [
      makeHistoricalPlayerWeek({
        position: "WR",
        opponent: "buf",
        season: 2026,
        week: 1,
        stats: {
          ...makeHistoricalPlayerWeek().stats,
          receivingTouchdowns: 2,
          rushingTouchdowns: 1,
          passingTouchdowns: 1,
          specialTeamsTouchdowns: 1,
          receivingTwoPointConversions: 1,
        },
      }),
    ];
    const result = buildTdsAllowedRows({ historicalRows: rows, teams: TEAMS, currentSeason: 2026, priorSeason: 2025, opponents: new Map() });
    const buf = result.find((row) => row.team === "buf")!;
    expect(buf.samples["2026"].wrRec?.touchdownsAllowedTotal).toBe(2);
    expect(buf.samples["2026"].wrRec?.gamesSampled).toBe(1);
    // A WR row feeds no other category's TDs, but the game still counts for every category.
    for (const key of ["qbPass", "qbRush", "rbRush", "rbRec", "teRec"] as const) {
      expect(buf.samples["2026"][key]?.gamesSampled).toBe(1);
      expect(buf.samples["2026"][key]?.touchdownsAllowedTotal).toBe(0);
    }
  });

  it("exposes wrRec for every sample (2026, 2025, last5, last8)", () => {
    const rows = [
      tdRow({ position: "WR", opponent: "buf", season: 2025, week: 1, receivingTouchdowns: 1 }),
      tdRow({ position: "WR", opponent: "buf", season: 2026, week: 1, receivingTouchdowns: 2 }),
    ];
    const result = buildTdsAllowedRows({
      historicalRows: rows,
      teams: TEAMS,
      currentSeason: 2026,
      priorSeason: 2025,
      opponents: new Map(),
    });
    const buf = result.find((row) => row.team === "buf")!;
    expect(buf.samples["2026"].wrRec?.touchdownsAllowedTotal).toBe(2);
    expect(buf.samples["2025"].wrRec?.touchdownsAllowedTotal).toBe(1);
    expect(buf.samples.last5.wrRec?.gamesSampled).toBe(2);
    expect(buf.samples.last8.wrRec?.gamesSampled).toBe(2);
  });

  it("joins each team's current opponent and location from the opponents lookup", () => {
    const opponents = new Map([
      ["buf", { opponent: "mia" as const, location: "@" as const }],
      ["mia", { opponent: "buf" as const, location: "vs" as const }],
    ]);
    const result = buildTdsAllowedRows({
      historicalRows: [],
      teams: TEAMS,
      currentSeason: 2026,
      priorSeason: 2025,
      opponents,
    });
    expect(result.find((row) => row.team === "buf")).toMatchObject({ opponent: "mia", location: "@" });
    expect(result.find((row) => row.team === "mia")).toMatchObject({ opponent: "buf", location: "vs" });
    expect(result.find((row) => row.team === "nyj")).toMatchObject({ opponent: null, location: null });
  });

  it("emits exactly one row per requested team, in the given order", () => {
    const result = buildTdsAllowedRows({
      historicalRows: [],
      teams: TEAMS,
      currentSeason: 2026,
      priorSeason: 2025,
      opponents: new Map(),
    });
    expect(result.map((row) => row.team)).toEqual(TEAMS);
  });

  it("splits a QB's passing and rushing touchdowns into QB PASS and QB RUSH end to end (never summed)", () => {
    const rows = [tdRow({ position: "QB", opponent: "buf", season: 2026, week: 1, passingTouchdowns: 2, rushingTouchdowns: 1 })];
    const result = buildTdsAllowedRows({ historicalRows: rows, teams: TEAMS, currentSeason: 2026, priorSeason: 2025, opponents: new Map() });
    const buf = result.find((row) => row.team === "buf")!;
    expect(buf.samples["2026"].qbPass?.touchdownsAllowedTotal).toBe(2);
    expect(buf.samples["2026"].qbRush?.touchdownsAllowedTotal).toBe(1);
  });

  it("classifies one game's mixed touchdowns into exactly the six intended buckets, each counted once", () => {
    const stats = makeHistoricalPlayerWeek().stats;
    const game = { opponent: "buf", season: 2026, week: 1 };
    const rows = [
      // QB throws 2 TDs and runs 1 in.
      makeHistoricalPlayerWeek({ ...game, position: "QB", stats: { ...stats, passingTouchdowns: 2, rushingTouchdowns: 1 } }),
      // RB scores 1 rushing + 1 receiving (dual-threat): one stat each, no cross-counting.
      makeHistoricalPlayerWeek({ ...game, position: "RB", stats: { ...stats, rushingTouchdowns: 1, receivingTouchdowns: 1 } }),
      makeHistoricalPlayerWeek({ ...game, position: "WR", stats: { ...stats, receivingTouchdowns: 1 } }),
      makeHistoricalPlayerWeek({ ...game, position: "TE", stats: { ...stats, receivingTouchdowns: 1 } }),
    ];
    const result = buildTdsAllowedRows({ historicalRows: rows, teams: TEAMS, currentSeason: 2026, priorSeason: 2025, opponents: new Map() });
    const sample = result.find((row) => row.team === "buf")!.samples["2026"];
    expect(sample.qbPass?.touchdownsAllowedTotal).toBe(2);
    expect(sample.qbRush?.touchdownsAllowedTotal).toBe(1);
    expect(sample.rbRush?.touchdownsAllowedTotal).toBe(1);
    expect(sample.rbRec?.touchdownsAllowedTotal).toBe(1);
    expect(sample.wrRec?.touchdownsAllowedTotal).toBe(1);
    expect(sample.teRec?.touchdownsAllowedTotal).toBe(1);
  });

  it("reports a zero total (not null) for a category with games sampled but no touchdowns", () => {
    const rows = [tdRow({ position: "TE", opponent: "buf", season: 2026, week: 1, receivingTouchdowns: 0 })];
    const result = buildTdsAllowedRows({ historicalRows: rows, teams: TEAMS, currentSeason: 2026, priorSeason: 2025, opponents: new Map() });
    const sample = result.find((row) => row.team === "buf")!.samples["2026"];
    expect(sample.teRec).toMatchObject({ gamesSampled: 1, touchdownsAllowedTotal: 0, touchdownsAllowedPerGame: 0, rank: 1 });
    // A defense with no games in the sample has a null total and null rank instead.
    expect(result.find((row) => row.team === "mia")!.samples["2026"].teRec).toMatchObject({
      gamesSampled: 0,
      touchdownsAllowedTotal: null,
      rank: null,
    });
  });

  it("ranks each category independently by touchdowns allowed per game (fewest = rank 1)", () => {
    const rows = [
      // buf: rush TDs only. mia: receiving TDs only.
      tdRow({ position: "RB", opponent: "buf", season: 2026, week: 1, rushingTouchdowns: 3, receivingTouchdowns: 0 }),
      tdRow({ position: "RB", opponent: "mia", season: 2026, week: 1, rushingTouchdowns: 0, receivingTouchdowns: 2 }),
    ];
    const result = buildTdsAllowedRows({ historicalRows: rows, teams: ["buf", "mia"], currentSeason: 2026, priorSeason: 2025, opponents: new Map() });
    const buf = result.find((row) => row.team === "buf")!.samples["2026"];
    const mia = result.find((row) => row.team === "mia")!.samples["2026"];
    expect(buf.rbRush?.rank).toBe(2);
    expect(mia.rbRush?.rank).toBe(1);
    expect(buf.rbRec?.rank).toBe(1);
    expect(mia.rbRec?.rank).toBe(2);
  });

  it("gives tied teams distinct, deterministic ranks (per-game, then total, then team abbreviation)", () => {
    const rows = [
      tdRow({ position: "WR", opponent: "mia", season: 2026, week: 1, receivingTouchdowns: 2 }),
      tdRow({ position: "WR", opponent: "buf", season: 2026, week: 1, receivingTouchdowns: 2 }),
    ];
    const result = buildTdsAllowedRows({ historicalRows: rows, teams: ["mia", "buf"], currentSeason: 2026, priorSeason: 2025, opponents: new Map() });
    expect(result.find((row) => row.team === "buf")!.samples["2026"].wrRec?.rank).toBe(1);
    expect(result.find((row) => row.team === "mia")!.samples["2026"].wrRec?.rank).toBe(2);
  });

  describe("complete defensive game count (every category shares one denominator)", () => {
    const CATEGORY_KEYS = ["qbPass", "qbRush", "rbRush", "rbRec", "wrRec", "teRec"] as const;
    const SAMPLES = ["2026", "2025", "last5", "last8"] as const;
    const build = (rows: HistoricalPlayerWeek[], teams: string[] = TEAMS) =>
      buildTdsAllowedRows({ historicalRows: rows, teams, currentSeason: 2026, priorSeason: 2025, opponents: new Map() });

    /** buf plays weeks 1..n of `season`; a QB row exists every week, other positions only when listed. */
    const bufQbGames = (season: number, weeks: number[]) =>
      weeks.map((week) => tdRow({ position: "QB", opponent: "buf", season, week, passingTouchdowns: 1 }));

    it("a game with no TE row still increases the TE REC denominator", () => {
      const rows = [
        ...bufQbGames(2025, [1, 2]),
        tdRow({ position: "TE", opponent: "buf", season: 2025, week: 1, receivingTouchdowns: 2 }),
      ];
      const teRec = build(rows).find((row) => row.team === "buf")!.samples["2025"].teRec!;
      expect(teRec.gamesSampled).toBe(2);
      expect(teRec.touchdownsAllowedTotal).toBe(2);
      expect(teRec.touchdownsAllowedPerGame).toBe(1); // 2 TDs / 2 defensive games, not 2 / 1
    });

    it("a game with no RB receiving row still increases the RB REC denominator", () => {
      const rows = [
        ...bufQbGames(2025, [1, 2, 3]),
        // Only week 1 has an RB row (a rusher, no receiving TD); weeks 2-3 have no RB row at all.
        tdRow({ position: "RB", opponent: "buf", season: 2025, week: 1, rushingTouchdowns: 1, receivingTouchdowns: 1 }),
      ];
      const sample = build(rows).find((row) => row.team === "buf")!.samples["2025"];
      expect(sample.rbRec).toMatchObject({ gamesSampled: 3, touchdownsAllowedTotal: 1, touchdownsAllowedPerGame: 0.3 });
      expect(sample.rbRush).toMatchObject({ gamesSampled: 3, touchdownsAllowedTotal: 1 });
    });

    it("all six categories report the same gamesSampled for a team in every sample", () => {
      const rows = [
        ...bufQbGames(2025, [1, 2, 3, 4, 5, 6, 7, 8, 9]),
        ...bufQbGames(2026, [1, 2]),
        // Sparse position rows: TE only in one game, WR only in another, RB never.
        tdRow({ position: "TE", opponent: "buf", season: 2025, week: 4, receivingTouchdowns: 1 }),
        tdRow({ position: "WR", opponent: "buf", season: 2026, week: 1, receivingTouchdowns: 1 }),
      ];
      const buf = build(rows).find((row) => row.team === "buf")!;
      for (const sample of SAMPLES) {
        const counts = new Set(CATEGORY_KEYS.map((key) => buf.samples[sample][key]?.gamesSampled));
        expect(counts.size).toBe(1);
      }
      expect(buf.samples["2026"].teRec?.gamesSampled).toBe(2);
      expect(buf.samples["2025"].rbRec?.gamesSampled).toBe(9);
    });

    it("Last 5 is always the defense's last 5 games when 5 exist, even if a category has no rows in them", () => {
      const rows = [
        ...bufQbGames(2025, [10, 11, 12, 13, 14, 15, 16, 17]),
        // The only TE row is old; none of the defense's last 5 games has a TE row.
        tdRow({ position: "TE", opponent: "buf", season: 2025, week: 10, receivingTouchdowns: 3 }),
      ];
      const buf = build(rows).find((row) => row.team === "buf")!;
      for (const key of CATEGORY_KEYS) expect(buf.samples.last5[key]?.gamesSampled).toBe(5);
      expect(buf.samples.last5.teRec?.touchdownsAllowedTotal).toBe(0);
    });

    it("Last 8 is always the defense's last 8 games when 8 exist, rolling back across seasons", () => {
      const rows = [
        ...bufQbGames(2025, [13, 14, 15, 16, 17]),
        ...bufQbGames(2026, [1, 2, 3]),
        tdRow({ position: "RB", opponent: "buf", season: 2025, week: 13, receivingTouchdowns: 1 }),
      ];
      const buf = build(rows).find((row) => row.team === "buf")!;
      for (const key of CATEGORY_KEYS) expect(buf.samples.last8[key]?.gamesSampled).toBe(8);
      expect(buf.samples.last8.rbRec?.touchdownsAllowedTotal).toBe(1);
      expect(buf.samples.last8.rbRec?.touchdownsAllowedPerGame).toBe(0.1); // 1 / 8
    });

    it("recomputes rank from the corrected per-game rate (a team with more games and the same total ranks better)", () => {
      // buf: 2 TE TDs over 4 defensive games (0.5/g). mia: 1 TE TD over 1 game (1.0/g).
      // Under the old TE-rows-only denominator buf (2 / 1 game = 2.0/g) would have ranked worst.
      const rows = [
        ...bufQbGames(2025, [1, 2, 3, 4]),
        tdRow({ position: "TE", opponent: "buf", season: 2025, week: 1, receivingTouchdowns: 2 }),
        tdRow({ position: "QB", opponent: "mia", season: 2025, week: 1 }),
        tdRow({ position: "TE", opponent: "mia", season: 2025, week: 1, receivingTouchdowns: 1 }),
      ];
      const result = build(rows, ["buf", "mia"]);
      expect(result.find((row) => row.team === "buf")!.samples["2025"].teRec?.rank).toBe(1);
      expect(result.find((row) => row.team === "mia")!.samples["2025"].teRec?.rank).toBe(2);
    });

    it("still gives tied teams distinct deterministic ranks and ranks zero-TD categories by the shared denominator", () => {
      const rows = [
        ...["buf", "mia"].flatMap((opponent) => [
          tdRow({ position: "QB", opponent, season: 2025, week: 1 }),
          tdRow({ position: "QB", opponent, season: 2025, week: 2 }),
        ]),
      ];
      const result = build(rows, ["mia", "buf"]);
      // 0 TDs over 2 games for both: exact tie on every category -> alphabetical.
      for (const key of CATEGORY_KEYS) {
        expect(result.find((row) => row.team === "buf")!.samples["2025"][key]).toMatchObject({ rank: 1, gamesSampled: 2, touchdownsAllowedTotal: 0 });
        expect(result.find((row) => row.team === "mia")!.samples["2025"][key]).toMatchObject({ rank: 2, gamesSampled: 2, touchdownsAllowedTotal: 0 });
      }
    });
  });
});
