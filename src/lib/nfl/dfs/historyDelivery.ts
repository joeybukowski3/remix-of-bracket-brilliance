import { z } from "zod";
import type { DfsEnrichedAnalyzerRow } from "./slateAnalyzer";
import { summarizeHistoryDeltas } from "@/lib/nfl/history/historySummaries";
import type { PlayerYardageHistoryRow, DefenseIndividualMatchupRow } from "@/lib/nfl/history/contracts";

export const DFS_HISTORY_MARKETS = { QB: "passing", RB: "rushing", WR: "receiving", TE: "receiving" } as const;
export type HistoryPosition = keyof typeof DFS_HISTORY_MARKETS;
const number = z.number().finite();
const sample = z.number().int().min(0).max(10);
const timestamp = z.string().datetime();
const metadata = z.object({
  season: z.number().int(), week: z.number().int().min(1).max(18), asOf: timestamp,
  lastN: z.literal(10), targetGameIds: z.array(z.string()),
  cohortPolicy: z.literal("individual-recorded-offensive-appearances-v1"),
  referencePolicy: z.literal("entering-game-trailing-10-recorded-games-v1"),
  temporalQuality: z.literal("event-time-reconstructed"),
});
export const dfsHistoryIndexSchema = metadata.extend({
  schemaVersion: z.literal("nfl-dfs-history-index-v1"),
  playerKeys: z.array(z.string()), defenseDeltas: z.record(z.array(number.nullable()).max(10)),
});
const appearance = z.object({
  rowId: z.string(), gameId: z.string(), season: z.number().int(), week: z.number().int(), dateUtc: timestamp,
  playerId: z.string(), playerName: z.string(), team: z.string(), opponent: z.string(),
  homeAway: z.enum(["home", "away"]), position: z.enum(["QB", "RB", "WR", "TE"]),
  market: z.enum(["passing", "rushing", "receiving"]), actualYards: number,
  historicalSportsbookLine: z.object({ point: number, bookmaker: z.string(), observedAt: timestamp,
    selectionPolicyVersion: z.literal("approved-final-pre-kickoff-v1") }).nullable(),
  lineResult: z.enum(["over", "under", "push", "unavailable"]), temporalQuality: z.literal("event-time-reconstructed"),
});
const playerRow = appearance.extend({
  comparison: z.literal("player-vs-aggregate-positional-allowance"),
  allowanceScope: z.literal("entire-position-group-per-defense-game"),
  opponentPregamePositionalAllowance: number.nullable(), opponentPregamePositionalAllowanceSampleSize: sample,
  actualMinusOpponentAllowance: number.nullable(), missingReferenceReason: z.literal("no-complete-prior-positional-reference").nullable(),
});
const defenseRow = appearance.extend({
  comparison: z.literal("individual-player-vs-own-pregame-average"),
  playerPregameTrailing10Average: number.nullable(), playerReferenceSampleSize: sample,
  actualMinusPlayerAverage: number.nullable(), missingReferenceReason: z.literal("no-prior-player-reference").nullable(),
});
export const dfsHistoryDetailSchema = metadata.extend({
  schemaVersion: z.literal("nfl-individual-yardage-history-v1"), position: z.enum(["QB", "RB", "WR", "TE"]),
  players: z.record(z.array(playerRow).max(10)), defenseMatchups: z.record(z.array(defenseRow).max(10)),
});
export type DfsHistoryIndex = z.infer<typeof dfsHistoryIndexSchema>;
export type DfsHistoryDetail = Omit<z.infer<typeof dfsHistoryDetailSchema>, "players" | "defenseMatchups"> & {
  players: Record<string, PlayerYardageHistoryRow[]>;
  defenseMatchups: Record<string, DefenseIndividualMatchupRow[]>;
};
export type HistoryTarget = { season: number; week: number; firstKickoff: string };

export function historyKeys(row: DfsEnrichedAnalyzerRow) {
  if (row.kind === "dst") return null;
  const market = DFS_HISTORY_MARKETS[row.position];
  return { market, position: row.position, player: row.playerId && !row.identityConflict ? `${row.playerId}:${market}` : null,
    defense: row.opponent ? `${row.opponent}:${market}:${row.position}` : null };
}
export function defenseSummary(index: DfsHistoryIndex | null, row: DfsEnrichedAnalyzerRow) {
  const keys = historyKeys(row);
  return summarizeHistoryDeltas(keys?.defense ? index?.defenseDeltas[keys.defense] ?? [] : []);
}
export function historyCoverage(index: DfsHistoryIndex, rows: readonly DfsEnrichedAnalyzerRow[]) {
  const covered = new Set(index.playerKeys);
  const offense = rows.filter((row) => row.kind === "offense");
  return { total: offense.length, covered: offense.filter((row) => covered.has(historyKeys(row)?.player)).length };
}
export function summarizeHistoryRows(rows: (PlayerYardageHistoryRow | DefenseIndividualMatchupRow)[]) {
  return { delta: summarizeHistoryDeltas(rows.map((row) => "actualMinusPlayerAverage" in row ? row.actualMinusPlayerAverage : row.actualMinusOpponentAllowance)),
    over: rows.filter((row) => row.lineResult === "over").length,
    under: rows.filter((row) => row.lineResult === "under").length,
    push: rows.filter((row) => row.lineResult === "push").length,
    lines: rows.filter((row) => row.historicalSportsbookLine !== null).length };
}
export const historyNumber = (value: number | null | undefined) => value == null ? "—" : value.toFixed(1);
export const historySigned = (value: number | null | undefined) => value == null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(1)}`;

/** Separate caches deduplicate pending requests and retain validated data for this session. */
export function createDfsHistoryLoader(fetcher: typeof fetch = (input, init) => fetch(input, init)) {
  const cache = new Map<string, Promise<unknown>>();
  function request<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    if (!cache.has(path)) {
      const pending = (async () => {
        const response = await fetcher(path);
        if (!response.ok || response.headers.get("content-type")?.includes("text/html")) throw new Error("History artifact unavailable");
        return schema.parse(await response.json());
      })();
      cache.set(path, pending);
      void pending.catch(() => cache.delete(path));
    }
    return cache.get(path) as Promise<T>;
  }
  function validateTarget(data: z.infer<typeof metadata>, target: HistoryTarget) {
    if (data.season !== target.season || data.week !== target.week || !Number.isFinite(Date.parse(target.firstKickoff)) ||
      Date.parse(data.asOf) > Math.min(Date.parse(target.firstKickoff), Date.now())) throw new Error("History target/cutoff mismatch");
  }
  const base = (target: HistoryTarget) => `${import.meta.env.BASE_URL}data/nfl/yardage-history/${target.season}/week-${String(target.week).padStart(2, "0")}`;
  return {
    async index(target: HistoryTarget) {
      const data = await request(`${base(target)}/index.json`, dfsHistoryIndexSchema);
      validateTarget(data, target);
      return data;
    },
    async detail(target: HistoryTarget, index: DfsHistoryIndex, position: HistoryPosition) {
      // Explicit domain output types retain required fields with this repository's
      // strictNullChecks=false; Zod still validates all required fields at runtime.
      const data = await request(`${base(target)}/${position}.json`, dfsHistoryDetailSchema as z.ZodType<DfsHistoryDetail>);
      validateTarget(data, target);
      if (data.asOf !== index.asOf || data.position !== position || JSON.stringify(data.targetGameIds) !== JSON.stringify(index.targetGameIds)) throw new Error("History generation mismatch");
      const excluded = new Set(data.targetGameIds);
      for (const [key, rows] of [...Object.entries(data.players), ...Object.entries(data.defenseMatchups)]) {
        const seen = new Set<string>();
        for (const row of rows) {
          const expected = "actualMinusPlayerAverage" in row ? `${row.opponent}:${row.market}:${row.position}` : `${row.playerId}:${row.market}`;
          if (key !== expected || row.position !== position || row.market !== DFS_HISTORY_MARKETS[position] ||
            Date.parse(row.dateUtc) >= Date.parse(data.asOf) || excluded.has(row.gameId) || seen.has(row.rowId) ||
            (row.historicalSportsbookLine && Date.parse(row.historicalSportsbookLine.observedAt) >= Date.parse(row.dateUtc))) throw new Error("Invalid historical appearance");
          seen.add(row.rowId);
        }
      }
      return data;
    },
  };
}
export const dfsHistoryLoader = createDfsHistoryLoader();
