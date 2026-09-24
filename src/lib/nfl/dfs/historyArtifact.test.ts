import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createDfsHistoryLoader, DFS_HISTORY_MARKETS, type DfsHistoryIndex, type HistoryPosition, type HistoryTarget } from "./historyDelivery";

/**
 * Integration checks against the COMMITTED public artifacts. Fixture-only tests let the
 * DFS board ship with history for Week 1 only while the slate was Week 3, so every
 * expansion silently showed "History unavailable". These read the real files through
 * the real loader (schema + cutoff validation included).
 */
const ROOT = process.cwd();
const publicPath = (path: string) => join(ROOT, "public", path);
const readJson = <T>(path: string): T => JSON.parse(readFileSync(publicPath(path), "utf-8")) as T;

type ProjectionRow = { week: number; playerId: string; playerName: string; position: HistoryPosition; market: string; team: string; opponent: string };
const projections = readJson<{ season: number; week: number; rows: ProjectionRow[] }>("data/nfl/2026/yardage-projections.json");
const games = readJson<{ games: { season: number; week: number; dateUtc: string }[] }>("data/nfl/2026/games.json").games;
const { season, week } = projections;

const target: HistoryTarget = {
  season, week,
  firstKickoff: new Date(Math.min(...games.filter((game) => game.season === season && game.week === week).map((game) => Date.parse(game.dateUtc)))).toISOString(),
};
const folder = `data/nfl/yardage-history/${season}/week-${String(week).padStart(2, "0")}`;
const fetcher = (async (input: RequestInfo | URL) => {
  const path = String(input).replace(/^\/+/, "");
  return existsSync(publicPath(path))
    ? new Response(readFileSync(publicPath(path), "utf-8"), { headers: { "content-type": "application/json" } })
    : new Response(null, { status: 404 });
}) as typeof fetch;

const POSITIONS = ["QB", "RB", "WR", "TE"] as const;
const projectionRows = projections.rows.filter((row) => row.week === week);

async function load(position: HistoryPosition) {
  const loader = createDfsHistoryLoader(fetcher);
  const index: DfsHistoryIndex = await loader.index(target);
  return { index, detail: await loader.detail(target, index, position) };
}
const keyOf = (row: ProjectionRow) => `${row.playerId}:${DFS_HISTORY_MARKETS[row.position]}`;

describe("committed DFS history artifacts", () => {
  it("exist for the current projection week (regenerate with `node scripts/generate-nfl-yardage-history.mjs --dfs-only`)", () => {
    for (const name of ["index", ...POSITIONS]) expect(existsSync(publicPath(`${folder}/${name}.json`)), `${folder}/${name}.json`).toBe(true);
  });

  it.each(POSITIONS)("%s: a current-slate player receives real Player Last 10 and Opponent Last 10 rows", async (position) => {
    const { index, detail } = await load(position);
    const covered = projectionRows.filter((row) => row.position === position && index.playerKeys.includes(keyOf(row)));
    expect(covered.length).toBeGreaterThan(0);
    const sample = covered.find((row) => (detail.players[keyOf(row)]?.length ?? 0) > 0)!;
    expect(sample).toBeDefined();
    const playerRows = detail.players[keyOf(sample)];
    const opponentRows = detail.defenseMatchups[`${sample.opponent}:${DFS_HISTORY_MARKETS[position]}:${position}`];
    expect(playerRows.length).toBeGreaterThan(0);
    expect(playerRows.length).toBeLessThanOrEqual(10);
    expect(opponentRows?.length ?? 0).toBeGreaterThan(0);
    for (const game of playerRows) expect(game.playerId).toBe(sample.playerId);
  });

  it("Kyler Murray: Player Last 10 is full, newest-first, and Opponent Last 10 is populated", async () => {
    const kyler = projectionRows.find((row) => row.playerName === "Kyler Murray")!;
    expect(kyler).toBeDefined();
    const { detail } = await load("QB");
    const rows = detail.players[keyOf(kyler)];
    expect(rows).toHaveLength(10);
    expect(detail.defenseMatchups[`${kyler.opponent}:passing:QB`].length).toBeGreaterThan(0);
    const times = rows.map((game) => Date.parse(game.dateUtc));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it.each(POSITIONS)("%s: every log is ordered newest to oldest and excludes the target week", async (position) => {
    const { index, detail } = await load(position);
    const excluded = new Set(index.targetGameIds);
    for (const rows of [...Object.values(detail.players), ...Object.values(detail.defenseMatchups)]) {
      const times = rows.map((game) => Date.parse(game.dateUtc));
      expect(times).toEqual([...times].sort((a, b) => b - a));
      for (const game of rows) {
        expect(excluded.has(game.gameId)).toBe(false);
        expect(Date.parse(game.dateUtc)).toBeLessThan(Date.parse(index.asOf));
        expect(Date.parse(game.dateUtc)).toBeLessThan(Date.parse(target.firstKickoff));
      }
    }
  });

  it("carries prior-season games into an early-season matchup", async () => {
    const { detail } = await load("QB");
    const seasons = new Set(Object.values(detail.players).flat().map((game) => game.season));
    expect(seasons.has(season - 1)).toBe(true);
  });

  it("gives an off-universe player the legitimate empty state instead of borrowed rows", async () => {
    const { index, detail } = await load("QB");
    expect(index.playerKeys).not.toContain("gsis:not-a-real-player:passing");
    expect(detail.players["gsis:not-a-real-player:passing"]).toBeUndefined();
  });

  it("resolves teams by canonical abbreviation for both current and historical opponents", async () => {
    const { detail } = await load("QB");
    const teams = new Set(projectionRows.map((row) => row.opponent));
    const keys = Object.keys(detail.defenseMatchups);
    for (const team of teams) expect(keys.some((key) => key.startsWith(`${team}:passing:QB`))).toBe(true);
  });
});
