/**
 * Inputs shared by the Yards vs Avg generator and validator, so both always
 * read exactly the same seasons from the committed player-week cache.
 */

import type { HistoricalPlayerWeek } from "../../src/lib/fantasy/weekly/history.ts";
import { loadPlayerWeekRows, readManifest } from "./nflAllowedByPositionIo.ts";

export const YARDS_VS_AVERAGE_OUT_FILE = "public/data/nfl/yards-vs-average-by-position.json";

const INDENT = "  ";

function containerHeight(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  return 1 + Math.max(0, ...Object.values(value).map(containerHeight));
}

/**
 * Pretty JSON that keeps any container at most two levels deep on one line
 * (each game, each row's per-sample metric block), so the artifact stays
 * compact and line-diffable. Parses to exactly the same value as JSON.stringify.
 */
export function serializeCompactJson(value: unknown, depth = 0): string {
  if (!value || typeof value !== "object" || containerHeight(value) <= 2) return JSON.stringify(value);
  const pad = INDENT.repeat(depth + 1);
  const entries = Array.isArray(value)
    ? value.map((item) => `${pad}${serializeCompactJson(item, depth + 1)}`)
    : Object.entries(value).map(([key, item]) => `${pad}${JSON.stringify(key)}: ${serializeCompactJson(item, depth + 1)}`);
  const [open, close] = Array.isArray(value) ? ["[", "]"] : ["{", "}"];
  return entries.length ? `${open}\n${entries.join(",\n")}\n${INDENT.repeat(depth)}${close}` : `${open}${close}`;
}

/**
 * Rows for seasons S-1 and S (required) plus S-2 when cached: S-2 only
 * supplies the prior-season component for S-1 games, and the blend gives it
 * no weight once an offense has 5+ other games in S-1.
 */
export function loadYardsVsAverageRows(root: string, season: number): HistoricalPlayerWeek[] {
  const cached = new Set((readManifest(root, "data/nfl/nflverse/stats-player-week").files ?? []).map((file) => file.season));
  const olderSeason = season - 2;
  return [
    ...(cached.has(olderSeason) ? loadPlayerWeekRows(root, olderSeason) : []),
    ...loadPlayerWeekRows(root, season - 1),
    ...loadPlayerWeekRows(root, season),
  ];
}
