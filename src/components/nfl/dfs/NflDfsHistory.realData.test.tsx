import { fireEvent, render, screen, within } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import NflDfsHistory from "./NflDfsHistory";
import { createDfsHistoryLoader, dfsHistoryLoader, type HistoryTarget } from "@/lib/nfl/dfs/historyDelivery";
import type { DfsEnrichedAnalyzerRow } from "@/lib/nfl/dfs/slateAnalyzer";

/** Renders the expanded history against the COMMITTED current-week artifacts (no mocked rows). */
const publicPath = (path: string) => join(process.cwd(), "public", path);
const projections = JSON.parse(readFileSync(publicPath("data/nfl/2026/yardage-projections.json"), "utf-8")) as
  { season: number; week: number; rows: { week: number; playerId: string; playerName: string; position: string; team: string; opponent: string }[] };
const games = (JSON.parse(readFileSync(publicPath("data/nfl/2026/games.json"), "utf-8")) as { games: { season: number; week: number; dateUtc: string }[] }).games;
const { season, week } = projections;
const target: HistoryTarget = { season, week, firstKickoff: new Date(Math.min(...games.filter((g) => g.season === season && g.week === week).map((g) => Date.parse(g.dateUtc)))).toISOString() };
const realLoader = createDfsHistoryLoader((async (input: RequestInfo | URL) => {
  const path = String(input).replace(/^\/+/, "");
  return existsSync(publicPath(path))
    ? new Response(readFileSync(publicPath(path), "utf-8"), { headers: { "content-type": "application/json" } })
    : new Response(null, { status: 404 });
}) as typeof fetch);

const slateRow = (name: string, position: string) => {
  const found = projections.rows.find((row) => row.week === week && row.playerName === name && row.position === position)!;
  return { kind: "offense", dkId: found.playerId, playerName: name, position, playerId: found.playerId, team: found.team, opponent: found.opponent,
    homeAway: "home", identityConflict: false } as unknown as DfsEnrichedAnalyzerRow;
};

afterEach(() => vi.restoreAllMocks());

describe("expanded DFS history with real current-week artifacts", () => {
  it("shows non-empty Player and Opponent Last 10 for Kyler Murray, then refreshes without leaking when the row changes", async () => {
    const index = await realLoader.index(target);
    vi.spyOn(dfsHistoryLoader, "detail").mockImplementation((t, i, position) => realLoader.detail(t, i, position));
    const kyler = slateRow("Kyler Murray", "QB");
    const { rerender } = render(<NflDfsHistory row={kyler} target={target} index={index} />);
    const playerRows = within(await screen.findByRole("table")).getAllByRole("row").length - 1;
    expect(playerRows).toBe(10);
    fireEvent.click(screen.getByRole("tab", { name: "Opponent Last 10" }));
    expect(within(screen.getByRole("table")).getAllByRole("row").length - 1).toBeGreaterThan(0);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    rerender(<NflDfsHistory row={slateRow("Travis Kelce", "TE")} target={target} index={index} />);
    // TE detail is a different file: previous QB rows must not remain while loading or after.
    fireEvent.click(await screen.findByRole("tab", { name: "Player Last 10" }));
    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("row").length - 1).toBeGreaterThan(0);
    expect(table).not.toHaveTextContent("Kyler");
  });
});
