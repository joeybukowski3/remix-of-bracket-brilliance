/**
 * Shared committed-cache I/O for the "Allowed by Position" defense-rank
 * generator family (Fantasy Points Allowed, TDs Allowed by Position, and any
 * future sibling). Both generators need the exact same normalized per-game
 * player rows, canonical team list and schedule -- only the aggregation that
 * consumes them differs -- so that loading/writing logic lives here once
 * instead of being copy-pasted per script.
 *
 * Reads only committed caches (never touches the network):
 *   - data/nfl/nflverse/stats-player-week/stats_player_week_{season}.csv
 *   - public/data/nfl/teams.json
 *   - public/data/nfl/<season>/games.json
 */

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseCsv } from "./nfl-schedules-results-core.mjs";
import { verifyCacheEntry } from "./nfl-source-cache.mjs";
import { normalizeHistoricalPlayerWeek, type HistoricalPlayerWeek } from "../../src/lib/fantasy/weekly/history.ts";
import { normalizeNflTeamAbbr } from "../../src/lib/nfl/identity/identity.ts";
import type { NflGameRecord } from "../../src/lib/nfl/standings.ts";

export const readJson = (path: string): any => JSON.parse(readFileSync(path, "utf-8"));

export function readManifest(root: string, relativeDir: string): { files?: Array<{ season: number | null; filename: string }> } {
  const path = join(root, relativeDir, "manifest.json");
  return existsSync(path) ? readJson(path) : { files: [] };
}

export function loadPlayerWeekRows(root: string, season: number): HistoricalPlayerWeek[] {
  const statsDir = join(root, "data", "nfl", "nflverse", "stats-player-week");
  const manifest = readManifest(root, "data/nfl/nflverse/stats-player-week");
  const entry = manifest.files?.find((file) => file.season === season);
  if (!entry) throw new Error(`Player-week source for ${season} is not cached. Run npm run fantasy:player-week-cache.`);
  const path = join(statsDir, entry.filename);
  const text = readFileSync(path, "utf-8");
  const problems = verifyCacheEntry(entry, text);
  if (problems.length) throw new Error(`${entry.filename} failed cache verification: ${problems.join("; ")}`);

  const rows: HistoricalPlayerWeek[] = [];
  for (const source of parseCsv(text)) {
    const normalized = normalizeHistoricalPlayerWeek(source);
    if (normalized) rows.push(normalized);
  }
  return rows;
}

export function loadTeamAbbrs(root: string): string[] {
  const teams = readJson(join(root, "public", "data", "nfl", "teams.json")).teams as Array<{ abbr: string }>;
  return teams.map((team) => normalizeNflTeamAbbr(team.abbr)).filter((abbr): abbr is string => Boolean(abbr)).sort();
}

export function loadGames(root: string, season: number): NflGameRecord[] {
  const path = join(root, "public", "data", "nfl", String(season), "games.json");
  if (!existsSync(path)) return [];
  return (readJson(path).games ?? []) as NflGameRecord[];
}

export function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const text = `${JSON.stringify(value, null, 2)}\n`;
  const temporary = `${path}.tmp`;
  try {
    writeFileSync(temporary, text, "utf8");
    renameSync(temporary, path);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}
