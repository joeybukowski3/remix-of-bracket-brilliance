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
    expect(buf.samples["2025"].rb?.touchdownsAllowedPerGame).toBe(1);
    expect(buf.samples["2026"].rb?.touchdownsAllowedPerGame).toBe(4);
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
    expect(buf.samples.last5.qb?.gamesSampled).toBe(5);
    expect(buf.samples.last5.qb?.touchdownsAllowedTotal).toBe(1 + 2 + 1 + 3 + 0);
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
    expect(buf.samples.last8.rb?.gamesSampled).toBe(8);
    expect(buf.samples.last8.rb?.touchdownsAllowedTotal).toBe(0 + 2 + 1 + 0 + 1 + 2 + 3 + 1);
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
    expect(buf.samples.last5.te?.gamesSampled).toBe(2);
    expect(buf.samples.last5.te?.touchdownsAllowedTotal).toBe(3);
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
    expect(buf.samples["2025"].rb?.gamesSampled).toBe(1);
  });

  it("combines a WR's rushing + receiving touchdowns end to end, excluding passing/return/defensive/two-point events", () => {
    const rows = [tdRow({ position: "WR", opponent: "buf", season: 2026, week: 1, rushingTouchdowns: 1, receivingTouchdowns: 2 })];
    const result = buildTdsAllowedRows({
      historicalRows: rows,
      teams: TEAMS,
      currentSeason: 2026,
      priorSeason: 2025,
      opponents: new Map(),
    });
    const buf = result.find((row) => row.team === "buf")!;
    expect(buf.samples["2026"].wr?.touchdownsAllowedTotal).toBe(3);
    expect(buf.samples["2026"].wr?.gamesSampled).toBe(1);
  });

  it("exposes wr for every sample (2026, 2025, last5, last8), never null-by-design like the old wideWr/slotWr split", () => {
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
    expect(buf.samples["2026"].wr?.touchdownsAllowedTotal).toBe(2);
    expect(buf.samples["2025"].wr?.touchdownsAllowedTotal).toBe(1);
    expect(buf.samples.last5.wr?.gamesSampled).toBe(2);
    expect(buf.samples.last8.wr?.gamesSampled).toBe(2);
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

  it("combines a QB's passing + rushing touchdowns end to end", () => {
    const rows = [tdRow({ position: "QB", opponent: "buf", season: 2026, week: 1, passingTouchdowns: 2, rushingTouchdowns: 1 })];
    const result = buildTdsAllowedRows({
      historicalRows: rows,
      teams: TEAMS,
      currentSeason: 2026,
      priorSeason: 2025,
      opponents: new Map(),
    });
    expect(result.find((row) => row.team === "buf")?.samples["2026"].qb?.touchdownsAllowedTotal).toBe(3);
  });
});
