import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createDfsHistoryLoader, defenseSummary, DFS_HISTORY_MARKETS, historyKeys, historyCoverage, summarizeHistoryRows } from "./historyDelivery";
import type { DfsEnrichedAnalyzerRow } from "./slateAnalyzer";
import { historyFixture, historyTarget } from "./__fixtures__/historyFactory";

const response = (data: unknown) => new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
const row = (position = "QB") => ({ kind: position === "DST" ? "dst" : "offense", position, playerId: "gsis:p", opponent: "det" } as DfsEnrichedAnalyzerRow);

describe("DFS history delivery", () => {
  it("loads no detail with the index and deduplicates concurrent and repeated expansions", async () => {
    const { index, detail } = historyFixture();
    const fetcher = vi.fn(async (path: string) => response(path.endsWith("index.json") ? index : detail));
    const loader = createDfsHistoryLoader(fetcher as typeof fetch);
    expect(fetcher).not.toHaveBeenCalled();
    await loader.index(historyTarget);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [a, b] = await Promise.all([loader.detail(historyTarget, index, "QB"), loader.detail(historyTarget, index, "QB")]);
    expect(a).toBe(b);
    await loader.detail(historyTarget, index, "QB");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([404, 500])("handles HTTP %s and permits a later retry", async (status) => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status })).mockResolvedValueOnce(response(historyFixture().index));
    const loader = createDfsHistoryLoader(fetcher);
    await expect(loader.index(historyTarget)).rejects.toThrow();
    await expect(loader.index(historyTarget)).resolves.toMatchObject({ season: 2026 });
  });
  it("rejects SPA HTML fallbacks", async () => {
    const loader = createDfsHistoryLoader(vi.fn(async () => new Response("html", { headers: { "content-type": "text/html" } })));
    await expect(loader.index(historyTarget)).rejects.toThrow();
  });
  it.each([{ season: 2025 }, { week: 2 }, { schemaVersion: "v0" }, { asOf: "2026-09-11T00:00:00.000Z" }, { asOf: "bad" }, { cohortPolicy: "volume-leader" }])("rejects incompatible index %j", async (change) => {
    const loader = createDfsHistoryLoader(vi.fn(async () => response({ ...historyFixture().index, ...change })));
    await expect(loader.index(historyTarget)).rejects.toThrow();
  });
  it.each(["cutoff", "target", "line", "schema", "week", "generation", "cohort", "position"])("rejects invalid detail: %s", async (change) => {
    const { index, detail } = historyFixture();
    const game = detail.players["gsis:p:passing"][0];
    if (change === "cutoff") game.dateUtc = detail.asOf;
    if (change === "target") game.gameId = "target";
    if (change === "line") game.historicalSportsbookLine!.observedAt = game.dateUtc;
    if (change === "schema") Object.assign(detail, { schemaVersion: "v0" });
    if (change === "week") detail.week = 2;
    if (change === "generation") detail.asOf = "2026-08-31T00:00:00.000Z";
    if (change === "cohort") Object.assign(detail, { cohortPolicy: "volume-leader" });
    if (change === "position") detail.position = "RB";
    const loader = createDfsHistoryLoader(vi.fn(async () => response(detail)));
    await expect(loader.detail(historyTarget, index, "QB")).rejects.toThrow();
  });
  it("preserves partial player coverage and individual same-game appearances", async () => {
    const { index, detail } = historyFixture();
    const loader = createDfsHistoryLoader(vi.fn(async () => response(detail)));
    const data = await loader.detail(historyTarget, index, "QB");
    expect(data.players["gsis:unknown:passing"]).toBeUndefined();
    expect(historyCoverage(index, [row(), { ...row(), playerId: "gsis:unknown" } as DfsEnrichedAnalyzerRow, row("DST")])).toEqual({ total: 2, covered: 1 });
    expect(data.defenseMatchups["det:passing:QB"].filter((game) => game.gameId === "old")).toHaveLength(2);
    expect(data.players["gsis:p:passing"][0]).toMatchObject({ opponentPregamePositionalAllowance: 230, actualMinusOpponentAllowance: 20, lineResult: "push" });
  });
  it("uses correct preferred markets, valid denominator, median, equal and missing handling", () => {
    expect(DFS_HISTORY_MARKETS).toEqual({ QB: "passing", RB: "rushing", WR: "receiving", TE: "receiving" });
    for (const [position, market] of Object.entries(DFS_HISTORY_MARKETS)) expect(historyKeys(row(position))?.market).toBe(market);
    expect(historyKeys(row("DST"))).toBeNull();
    expect(defenseSummary(historyFixture().index, row())).toMatchObject({ mean: 5 / 3, median: 0, aboveCount: 1, belowCount: 1, equalCount: 1, comparisonCount: 3, missingCount: 1 });
    expect(defenseSummary(historyFixture().index, row("DST")).mean).toBeNull();
    expect(summarizeHistoryRows(historyFixture().detail.defenseMatchups["det:passing:QB"])).toMatchObject({ over: 0, under: 0, push: 1, lines: 1 });
  });
  it("validates all generated Week 1 files, keys, temporal bounds and index deltas", async () => {
    const fetcher = vi.fn(async (path: string) => response(JSON.parse(readFileSync(`public${path}`, "utf8"))));
    const loader = createDfsHistoryLoader(fetcher as typeof fetch);
    const index = await loader.index(historyTarget);
    let total = 0;
    for (const position of ["QB", "RB", "WR", "TE"] as const) {
      const detail = await loader.detail(historyTarget, index, position);
      for (const [key, games] of Object.entries(detail.defenseMatchups)) expect(index.defenseDeltas[key]).toEqual(games.map((game) => game.actualMinusPlayerAverage));
      total += Object.values(detail.players).flat().length + Object.values(detail.defenseMatchups).flat().length;
    }
    expect(total).toBe(4386);
  });
});
