import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { extractTouchdownContextFromGzip, nflverseTouchdownPbpUrl, serializeTouchdownContext, TOUCHDOWN_CONTEXT_COLUMNS, TOUCHDOWN_CONTEXT_SCHEMA_VERSION, TOUCHDOWN_PBP_COLUMNS } from "./lib/nfl-touchdown-context-core.mjs";

export const TOUCHDOWN_CONTEXT_REFRESH_MANIFEST_VERSION = "nfl-touchdown-context-refresh-v1";

const DEFAULT_SEASONS = [2025, 2026];
const SOURCE = "nflverse play-by-play";

function normalizeSeasons(seasons) {
  const normalized = [...new Set(seasons.map(Number).filter(Number.isInteger))].sort((left, right) => left - right);
  if (!normalized.length) throw new Error("Provide at least one integer season with --seasons=2025,2026");
  return normalized;
}

export function currentNflSeason(now = new Date()) {
  const year = now.getUTCFullYear();
  return now.getUTCMonth() < 2 ? year - 1 : year;
}

async function completedRegularSeasonGames(root, season) {
  const resultsPath = path.join(root, "public", "data", "nfl", String(season), "results.json");
  let parsed;
  try {
    parsed = JSON.parse(await readFile(resultsPath, "utf8"));
  } catch (error) {
    throw new Error(`${season}: cannot establish whether current-season PBP is legitimately unavailable from ${resultsPath}: ${error.message}`);
  }
  if (!Array.isArray(parsed.results)) throw new Error(`${season}: results artifact is missing a results array: ${resultsPath}`);
  return parsed.results.filter((game) => game?.seasonType === "REG" && game?.final === true).length;
}

function availableManifest(season, sourceUrl, extracted, csv) {
  return {
    schemaVersion: TOUCHDOWN_CONTEXT_SCHEMA_VERSION,
    season,
    source: SOURCE,
    sourceState: "available",
    sourceUrl,
    httpStatus: 200,
    completedRegularSeasonGames: null,
    compactFilename: `touchdown_context_${season}.csv`,
    sourceRows: extracted.sourceRows,
    compactRows: extracted.rows.length,
    sourceColumns: TOUCHDOWN_PBP_COLUMNS,
    compactColumns: TOUCHDOWN_CONTEXT_COLUMNS,
    sha256: createHash("sha256").update(csv).digest("hex"),
    unavailableReason: null,
    notes: [
      "Raw compressed play-by-play is streamed and discarded.",
      "Rows contain only eligible scorer carries and targets; passing, special-teams, two-point, kneel, spike, and play_type=no_play records are excluded.",
    ],
  };
}

function unavailableManifest(season, sourceUrl) {
  return {
    schemaVersion: TOUCHDOWN_CONTEXT_SCHEMA_VERSION,
    season,
    source: SOURCE,
    sourceState: "unavailable",
    sourceUrl,
    httpStatus: 404,
    completedRegularSeasonGames: 0,
    compactFilename: null,
    sourceRows: null,
    compactRows: 0,
    sourceColumns: TOUCHDOWN_PBP_COLUMNS,
    compactColumns: TOUCHDOWN_CONTEXT_COLUMNS,
    sha256: null,
    unavailableReason: "nflverse_pbp_not_published_before_completed_regular_season_games",
    notes: [
      "The current-season nflverse PBP release asset returned 404 while the canonical results artifact contained zero completed regular-season games.",
      "No compact rows were fabricated and no current-season CSV was published.",
    ],
  };
}

async function publishPrepared(outputDir, prepared, seasons) {
  await mkdir(outputDir, { recursive: true });
  const runManifest = {
    schemaVersion: TOUCHDOWN_CONTEXT_REFRESH_MANIFEST_VERSION,
    source: SOURCE,
    requestedSeasons: seasons,
    sources: prepared.map(({ manifest }) => manifest),
  };
  const publications = [];
  for (const item of prepared) {
    if (item.csv != null) publications.push({ target: path.join(outputDir, `touchdown_context_${item.season}.csv`), text: item.csv });
    publications.push({
      target: path.join(outputDir, `touchdown_context_${item.season}.manifest.json`),
      text: `${JSON.stringify(item.manifest, null, 2)}\n`,
    });
  }
  publications.push({ target: path.join(outputDir, "manifest.json"), text: `${JSON.stringify(runManifest, null, 2)}\n` });

  const staged = publications.map(({ target, text }) => ({ target, text, temporary: `${target}.${process.pid}.tmp` }));
  try {
    await Promise.all(staged.map(({ temporary, text }) => writeFile(temporary, text, "utf8")));
    for (const { target, temporary } of staged.slice(0, -1)) await rename(temporary, target);
    for (const item of prepared) {
      if (item.csv == null) await rm(path.join(outputDir, `touchdown_context_${item.season}.csv`), { force: true });
    }
    const runManifestPublication = staged.at(-1);
    await rename(runManifestPublication.temporary, runManifestPublication.target);
  } finally {
    await Promise.all(staged.map(({ temporary }) => rm(temporary, { force: true })));
  }
  return runManifest;
}

export async function refreshTouchdownContextCache({
  seasons: requestedSeasons = DEFAULT_SEASONS,
  root = process.cwd(),
  fetchImpl = fetch,
  currentSeason = currentNflSeason(),
  log = console.log,
} = {}) {
  const seasons = normalizeSeasons(requestedSeasons);
  const outputDir = path.join(root, "data", "nfl", "nflverse", "touchdown-context");
  const prepared = [];

  // Fetch and validate every requested season before publishing any file. A
  // failed later season therefore cannot leave a newly written partial cache.
  for (const season of seasons) {
    const sourceUrl = nflverseTouchdownPbpUrl(season);
    const response = await fetchImpl(sourceUrl);
    if (response.status === 404) {
      if (season !== currentSeason) throw new Error(`${season}: nflverse PBP request failed (404) for ${sourceUrl}`);
      const completedGames = await completedRegularSeasonGames(root, season);
      if (completedGames !== 0) {
        throw new Error(`${season}: nflverse PBP request failed (404) after ${completedGames} completed regular-season games for ${sourceUrl}`);
      }
      prepared.push({ season, csv: null, manifest: unavailableManifest(season, sourceUrl) });
      continue;
    }
    if (!response.ok || !response.body) throw new Error(`${season}: nflverse PBP request failed (${response.status}) for ${sourceUrl}`);
    const extracted = await extractTouchdownContextFromGzip(response);
    const csv = serializeTouchdownContext(extracted.rows);
    prepared.push({ season, csv, manifest: availableManifest(season, sourceUrl, extracted, csv) });
  }

  const manifest = await publishPrepared(outputDir, prepared, seasons);
  for (const item of prepared) {
    if (item.csv == null) log(`${item.season}: PBP unavailable (404); zero completed regular-season games, no compact CSV written`);
    else log(`${item.season}: ${item.manifest.compactRows} compact touchdown opportunities from ${item.manifest.sourceRows} PBP rows`);
  }
  return manifest;
}

function parseSeasons(argv) {
  const seasonsArg = argv.find((arg) => arg.startsWith("--seasons="));
  return normalizeSeasons((seasonsArg?.split("=")[1] ?? DEFAULT_SEASONS.join(",")).split(","));
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) await refreshTouchdownContextCache({ seasons: parseSeasons(process.argv.slice(2)) });
