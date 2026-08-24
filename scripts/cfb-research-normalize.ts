import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeResearchGames } from "../src/lib/cfb/research/normalize/normalizeGames";
import { normalizeResearchMarketLines } from "../src/lib/cfb/research/normalize/normalizeMarketLines";
import { normalizeResearchPlays } from "../src/lib/cfb/research/normalize/normalizePlays";
import { normalizeResearchTeamSeason } from "../src/lib/cfb/research/normalize/normalizeTeamSeason";
import { assertNoAmbiguousTeamMappings } from "../src/lib/cfb/research/validation/teamMappingValidation";
import { writeAtomic } from "../src/lib/cfb/research/ingestion/cfbdClient";
import {
  CFB_RESEARCH_BACKFILL_SEASONS,
  CFB_RESEARCH_NORMALIZED_DIR,
  CFB_RESEARCH_RAW_DIR,
} from "../src/lib/cfb/research/config/researchConfig";
import type {
  CfbdResearchGameRaw,
  CfbdResearchGameTeamStatsRaw,
  CfbdResearchLinesGameRaw,
  CfbdResearchPlayRaw,
  CfbdResearchReturningProductionRaw,
  CfbdResearchTalentRaw,
  CfbdResearchTeamRaw,
  CfbResearchPlay,
  CfbResearchTeamSeason,
} from "../src/lib/cfb/research/types";

const ROOT = resolve(import.meta.dirname, "..");
const RAW_ROOT = resolve(ROOT, CFB_RESEARCH_RAW_DIR);
const NORMALIZED_ROOT = resolve(ROOT, CFB_RESEARCH_NORMALIZED_DIR);

// Above this many normalized play rows, split into week-partitioned files
// instead of one season file (see Stage 3: "decide based on actual size/operability").
const PLAYS_SEASON_FILE_ROW_LIMIT = 60_000;

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function readJsonIfExists<T>(path: string, fallback: T): T {
  return existsSync(path) ? readJson<T>(path) : fallback;
}

function listWeekFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json") && !name.endsWith(".manifest.json"))
    .sort();
}

function normalizeSeason(season: number): { plays: CfbResearchPlay[]; teamSeasons: CfbResearchTeamSeason[] } {
  const rawDir = resolve(RAW_ROOT, String(season));
  const games = readJson<CfbdResearchGameRaw[]>(resolve(rawDir, "games.json"));
  const teams = readJson<CfbdResearchTeamRaw[]>(resolve(rawDir, "teams.json"));
  const returning = readJsonIfExists<CfbdResearchReturningProductionRaw[]>(
    resolve(rawDir, "returning-production.json"),
    [],
  );
  const talent = readJsonIfExists<CfbdResearchTalentRaw[]>(resolve(rawDir, "talent.json"), []);
  const lines = readJson<CfbdResearchLinesGameRaw[]>(resolve(rawDir, "lines.json"));

  const normalizedGames = normalizeResearchGames(games);
  const normalizedLines = normalizeResearchMarketLines(lines);
  const normalizedTeamSeason = normalizeResearchTeamSeason(season, teams, returning, talent);
  assertNoAmbiguousTeamMappings(normalizedTeamSeason);

  const playsDir = resolve(rawDir, "plays");
  const allPlays: CfbResearchPlay[] = [];
  for (const file of listWeekFiles(playsDir)) {
    const match = /^(regular|postseason)-week(\d+)\.json$/.exec(file);
    if (!match) continue;
    const week = Number(match[2]);
    const rawPlays = readJson<CfbdResearchPlayRaw[]>(resolve(playsDir, file));
    allPlays.push(...normalizeResearchPlays(rawPlays, games, season, week));
  }

  const statsDir = resolve(rawDir, "team-game-stats");
  const gameIdsWithStats = new Set<string>();
  for (const file of listWeekFiles(statsDir)) {
    const rawStats = readJson<CfbdResearchGameTeamStatsRaw[]>(resolve(statsDir, file));
    for (const row of rawStats) gameIdsWithStats.add(String(row.id));
  }

  writeAtomic(
    resolve(NORMALIZED_ROOT, String(season), "games.json"),
    `${JSON.stringify(normalizedGames, null, 2)}\n`,
  );
  writeAtomic(
    resolve(NORMALIZED_ROOT, String(season), "team-season.json"),
    `${JSON.stringify(normalizedTeamSeason, null, 2)}\n`,
  );
  writeAtomic(
    resolve(NORMALIZED_ROOT, String(season), "market-lines.json"),
    `${JSON.stringify(normalizedLines, null, 2)}\n`,
  );
  writeAtomic(
    resolve(NORMALIZED_ROOT, String(season), "team-game-stats-game-ids.json"),
    `${JSON.stringify([...gameIdsWithStats].sort(), null, 2)}\n`,
  );

  if (allPlays.length <= PLAYS_SEASON_FILE_ROW_LIMIT) {
    writeAtomic(
      resolve(NORMALIZED_ROOT, String(season), "plays.json"),
      `${JSON.stringify(allPlays, null, 2)}\n`,
    );
  } else {
    const byWeek = new Map<string, CfbResearchPlay[]>();
    for (const play of allPlays) {
      const key = String(play.week).padStart(2, "0");
      if (!byWeek.has(key)) byWeek.set(key, []);
      byWeek.get(key)!.push(play);
    }
    for (const [week, rows] of byWeek) {
      writeAtomic(
        resolve(NORMALIZED_ROOT, String(season), "plays", `week${week}.json`),
        `${JSON.stringify(rows, null, 2)}\n`,
      );
    }
  }

  console.log(
    `[cfb:research:normalize] ${season}: ${normalizedGames.length} games, ${allPlays.length} plays, ` +
      `${normalizedLines.length} market-line rows, ${normalizedTeamSeason.length} team-seasons ` +
      `(plays ${allPlays.length <= PLAYS_SEASON_FILE_ROW_LIMIT ? "season-file" : "week-partitioned"})`,
  );

  return { plays: allPlays, teamSeasons: normalizedTeamSeason };
}

function main() {
  const requestedSeasons = process.argv
    .slice(2)
    .filter((arg) => /^\d{4}$/.test(arg))
    .map(Number);
  const seasons = requestedSeasons.length > 0 ? requestedSeasons : [...CFB_RESEARCH_BACKFILL_SEASONS];

  for (const season of seasons) {
    normalizeSeason(season);
  }
}

main();
