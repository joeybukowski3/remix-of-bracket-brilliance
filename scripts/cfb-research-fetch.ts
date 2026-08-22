import { resolve } from "node:path";
import { fetchConferences } from "../src/lib/cfb/research/ingestion/fetchConferences";
import { fetchGamesForSeason } from "../src/lib/cfb/research/ingestion/fetchGames";
import { fetchLinesForSeason } from "../src/lib/cfb/research/ingestion/fetchLines";
import { writeRawDataset, writeSeasonManifest } from "../src/lib/cfb/research/ingestion/manifestWriter";
import { fetchPlaysForSeason, weekBatchesFromGames } from "../src/lib/cfb/research/ingestion/fetchPlays";
import { fetchReturningProductionForSeason } from "../src/lib/cfb/research/ingestion/fetchReturningProduction";
import { fetchTalentForSeason } from "../src/lib/cfb/research/ingestion/fetchTalent";
import { fetchTeamGameStatsForSeason } from "../src/lib/cfb/research/ingestion/fetchTeamGameStats";
import { fetchTeamsForSeason } from "../src/lib/cfb/research/ingestion/fetchTeams";
import { CFB_RESEARCH_BACKFILL_SEASONS, CFB_RESEARCH_RAW_DIR } from "../src/lib/cfb/research/config/researchConfig";
import type { CfbResearchManifestFileEntry } from "../src/lib/cfb/research/types";

const ROOT = resolve(import.meta.dirname, "..");
const RAW_ROOT = resolve(ROOT, CFB_RESEARCH_RAW_DIR);
const API_KEY = process.env.CFBD_API_KEY?.trim();

const requestedSeasons = process.argv
  .slice(2)
  .filter((arg) => /^\d{4}$/.test(arg))
  .map(Number);
const seasons = requestedSeasons.length > 0 ? requestedSeasons : [...CFB_RESEARCH_BACKFILL_SEASONS];

async function fetchSeason(season: number, apiKey: string, fetchedAt: string) {
  const datasets: Record<string, CfbResearchManifestFileEntry | CfbResearchManifestFileEntry[]> = {};
  const incompleteReasons: string[] = [];

  const games = await fetchGamesForSeason(season, apiKey);
  datasets.games = writeRawDataset({
    filePath: resolve(RAW_ROOT, String(season), "games.json"),
    data: games.data,
    endpoint: "/games",
    params: { year: season },
    season,
    week: null,
    fetchedAt,
  });
  console.log(`[cfb:research:fetch] ${season} games: ${games.data.length} rows`);

  const teams = await fetchTeamsForSeason(season, apiKey);
  datasets.teams = writeRawDataset({
    filePath: resolve(RAW_ROOT, String(season), "teams.json"),
    data: teams.data,
    endpoint: "/teams",
    params: { year: season },
    season,
    week: null,
    fetchedAt,
  });
  console.log(`[cfb:research:fetch] ${season} teams: ${teams.data.length} rows`);

  const returning = await fetchReturningProductionForSeason(season, apiKey);
  datasets["returning-production"] = writeRawDataset({
    filePath: resolve(RAW_ROOT, String(season), "returning-production.json"),
    data: returning.data,
    endpoint: "/player/returning",
    params: { year: season },
    season,
    week: null,
    fetchedAt,
  });
  console.log(`[cfb:research:fetch] ${season} returning-production: ${returning.data.length} rows`);

  const talent = await fetchTalentForSeason(season, apiKey);
  datasets.talent = writeRawDataset({
    filePath: resolve(RAW_ROOT, String(season), "talent.json"),
    data: talent.data,
    endpoint: "/talent",
    params: { year: season },
    season,
    week: null,
    fetchedAt,
  });
  console.log(`[cfb:research:fetch] ${season} talent: ${talent.data.length} rows`);

  const lines = await fetchLinesForSeason(season, apiKey);
  datasets.lines = writeRawDataset({
    filePath: resolve(RAW_ROOT, String(season), "lines.json"),
    data: lines.data,
    endpoint: "/lines",
    params: { year: season },
    season,
    week: null,
    fetchedAt,
  });
  console.log(`[cfb:research:fetch] ${season} lines: ${lines.data.length} games`);

  const weekBatches = weekBatchesFromGames(games.data);

  const playResults = await fetchPlaysForSeason(season, weekBatches, apiKey);
  const playEntries: CfbResearchManifestFileEntry[] = [];
  for (const result of playResults) {
    if (result.failed) {
      incompleteReasons.push(`plays ${result.batch.seasonType} week ${result.batch.week}: ${result.error}`);
      continue;
    }
    playEntries.push(
      writeRawDataset({
        filePath: resolve(
          RAW_ROOT,
          String(season),
          "plays",
          `${result.batch.seasonType}-week${String(result.batch.week).padStart(2, "0")}.json`,
        ),
        data: result.data,
        endpoint: "/plays",
        params: { year: season, week: result.batch.week, seasonType: result.batch.seasonType },
        season,
        week: result.batch.week,
        fetchedAt,
      }),
    );
  }
  datasets.plays = playEntries;
  const totalPlays = playEntries.reduce((sum, entry) => sum + entry.recordCount, 0);
  console.log(
    `[cfb:research:fetch] ${season} plays: ${totalPlays} rows across ${playEntries.length}/${weekBatches.length} week batches`,
  );

  const statsResults = await fetchTeamGameStatsForSeason(season, weekBatches, apiKey);
  const statsEntries: CfbResearchManifestFileEntry[] = [];
  for (const result of statsResults) {
    if (result.failed) {
      incompleteReasons.push(
        `team-game-stats ${result.batch.seasonType} week ${result.batch.week}: ${result.error}`,
      );
      continue;
    }
    statsEntries.push(
      writeRawDataset({
        filePath: resolve(
          RAW_ROOT,
          String(season),
          "team-game-stats",
          `${result.batch.seasonType}-week${String(result.batch.week).padStart(2, "0")}.json`,
        ),
        data: result.data,
        endpoint: "/games/teams",
        params: { year: season, week: result.batch.week, seasonType: result.batch.seasonType },
        season,
        week: result.batch.week,
        fetchedAt,
      }),
    );
  }
  datasets["team-game-stats"] = statsEntries;
  console.log(
    `[cfb:research:fetch] ${season} team-game-stats: ${statsEntries.length}/${weekBatches.length} week batches`,
  );

  writeSeasonManifest({
    filePath: resolve(RAW_ROOT, String(season), "manifest.json"),
    season,
    fetchedAt,
    datasets,
    incomplete: incompleteReasons.length > 0,
    incompleteReasons,
  });

  if (incompleteReasons.length > 0) {
    console.warn(`[cfb:research:fetch] ${season} INCOMPLETE: ${incompleteReasons.length} failed batches`);
  }

  return { season, incomplete: incompleteReasons.length > 0 };
}

async function main() {
  if (!API_KEY) {
    throw new Error("CFBD_API_KEY is required. Set it in the process environment. No files were written.");
  }

  const conferences = await fetchConferences(API_KEY);
  const fetchedAt = new Date().toISOString();
  writeRawDataset({
    filePath: resolve(RAW_ROOT, "conferences.json"),
    data: conferences.data,
    endpoint: "/conferences",
    params: {},
    season: 0,
    week: null,
    fetchedAt,
  });
  console.log(`[cfb:research:fetch] conferences: ${conferences.data.length} rows`);

  const results = [];
  for (const season of seasons) {
    const seasonFetchedAt = new Date().toISOString();
    results.push(await fetchSeason(season, API_KEY, seasonFetchedAt));
  }

  const incompleteSeasons = results.filter((r) => r.incomplete).map((r) => r.season);
  console.log(`[cfb:research:fetch] done: ${results.length} seasons fetched`);
  if (incompleteSeasons.length > 0) {
    console.warn(`[cfb:research:fetch] INCOMPLETE seasons: ${incompleteSeasons.join(", ")}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`[cfb:research:fetch] FAILED: ${(error as Error).message}`);
  process.exitCode = 1;
});
