/**
 * Phase 2: generates the leakage-safe team pregame play-volume and
 * pass-tendency artifact from the committed compact play-volume cache
 * (`data/nfl/nflverse/play-volume-team-game/`, built by
 * `npm run nfl:play-volume-cache`) plus the repository's own `games.json`
 * schedules. No player-level modeling occurs here -- see
 * src/lib/nfl/props/README.md.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildTeamGameLog,
  buildTeamPregameFeatures,
  NEUTRAL_SITUATION_DEFINITION,
} from "../src/lib/nfl/props/teamPlayVolume";
import { buildGameJoinIndex, type NflPropRawGameRecord } from "../src/lib/nfl/props/historicalOutcomes";
import type { NflTeamGamePlayVolumeRecord } from "../src/lib/nfl/props/types/teamPregameFeatures";
import {
  countLowNeutralSampleRows,
  countRowsWithInsufficientPriorHistory,
  findDuplicatePregameFeatureKeys,
  summarizeByWeek,
  summarizeDistribution,
} from "../src/lib/nfl/props/teamPregameFeaturesQa";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { verifyCacheEntry } from "./lib/nfl-source-cache.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = "data/nfl/nflverse/play-volume-team-game";
const DEFAULT_OUTPUT_DIR = join(ROOT, "data", "nfl", "props");
const LOW_NEUTRAL_SAMPLE_THRESHOLD = 20;
const MIN_PRIOR_GAMES_FOR_CONFIDENCE = 3;

type CsvRow = Record<string, string>;
type CacheEntry = { season: number | null; filename: string; retrievedDateUtc: string; [key: string]: unknown };
type CacheManifest = { files?: CacheEntry[] };

function parseArgs(argv: string[]) {
  const args: { seasons: number[] | null; output: string | null; generatedAt: string } = {
    seasons: null,
    output: null,
    generatedAt: new Date().toISOString(),
  };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--seasons=")) args.seasons = raw.slice(10).split(",").map(Number).filter(Number.isInteger);
    else if (raw.startsWith("--output=")) args.output = resolve(ROOT, raw.slice(9));
    else if (raw.startsWith("--generated-at=")) args.generatedAt = raw.slice(15);
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (Number.isNaN(Date.parse(args.generatedAt))) throw new Error("--generated-at must be an ISO timestamp.");
  return args;
}

function readManifest(relativeDir: string): CacheManifest {
  const path = join(ROOT, relativeDir, "manifest.json");
  if (!existsSync(path)) throw new Error(`Missing source manifest ${path}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function verifiedCsvRows(relativeDir: string, manifest: CacheManifest, season: number) {
  const entry = manifest.files?.find((candidate) => candidate.season === season);
  if (!entry) return null;
  const path = join(ROOT, relativeDir, entry.filename);
  const text = readFileSync(path, "utf8");
  const problems = verifyCacheEntry(entry, text);
  if (problems.length) throw new Error(problems.join("\n"));
  return { entry, rows: parseCsv(text) as CsvRow[] };
}

function toPlayVolumeRecord(row: CsvRow): NflTeamGamePlayVolumeRecord {
  const num = (field: string, integer: boolean) => {
    const text = String(row[field] ?? "").trim();
    if (text === "") throw new Error(`compact play-volume row missing ${field}`);
    const value = Number(text);
    if (!Number.isFinite(value)) throw new Error(`compact play-volume row field ${field} is not finite`);
    if (integer && !Number.isInteger(value)) throw new Error(`compact play-volume row field ${field} must be an integer`);
    return value;
  };
  return {
    gameId: String(row.game_id ?? "").trim(),
    season: num("season", true),
    week: num("week", true),
    team: String(row.team ?? "").trim(),
    opponent: String(row.opponent ?? "").trim(),
    eligiblePlays: num("eligible_plays", true),
    passPlays: num("pass_plays", true),
    rushPlays: num("rush_plays", true),
    neutralEligiblePlays: num("neutral_eligible_plays", true),
    neutralPassPlays: num("neutral_pass_plays", true),
    passOeSum: num("pass_oe_sum", false),
    passOeCount: num("pass_oe_count", true),
  };
}

function readSeasonGames(season: number): NflPropRawGameRecord[] {
  const path = join(ROOT, "public", "data", "nfl", String(season), "games.json");
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { games?: NflPropRawGameRecord[] };
  if (!Array.isArray(parsed.games)) throw new Error(`Malformed games.json for ${season}: missing "games" array.`);
  return parsed.games;
}

function writeAtomic(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  try {
    writeFileSync(temporary, text, "utf8");
    renameSync(temporary, path);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}

const { seasons: requestedSeasons, output: outputOverride, generatedAt } = parseArgs(process.argv);

const cacheManifest = readManifest(CACHE_DIR);
const availableSeasons = (cacheManifest.files ?? [])
  .map((entry) => entry.season)
  .filter((season): season is number => Number.isInteger(season))
  .sort((a, b) => a - b);
if (!availableSeasons.length) throw new Error(`No cached seasons found in ${CACHE_DIR}/manifest.json. Run npm run nfl:play-volume-cache.`);

// The full compact cache is loaded regardless of --seasons, because Week 1
// of a target season needs the ENTIRE prior season as a prior -- excluding
// it from loading would silently zero out `priorSeason` for every team.
const allRecords: NflTeamGamePlayVolumeRecord[] = [];
const allGames: NflPropRawGameRecord[] = [];
const sourceFiles: { season: number; entry: CacheEntry }[] = [];
for (const season of availableSeasons) {
  const cache = verifiedCsvRows(CACHE_DIR, cacheManifest, season);
  if (!cache) continue;
  sourceFiles.push({ season, entry: cache.entry });
  for (const row of cache.rows) allRecords.push(toPlayVolumeRecord(row));
  allGames.push(...readSeasonGames(season));
}

const gameJoinIndex = buildGameJoinIndex(allGames);
const fullGameLog = buildTeamGameLog(allRecords, gameJoinIndex);

const targetSeasons = requestedSeasons ?? availableSeasons;
for (const season of targetSeasons) {
  if (!availableSeasons.includes(season)) {
    throw new Error(`Season ${season} is not cached in ${CACHE_DIR}. Available: ${availableSeasons.join(",")}.`);
  }
}

const rows = allRecords
  .filter((record) => targetSeasons.includes(record.season))
  .map((record) => buildTeamPregameFeatures(record, gameJoinIndex, fullGameLog))
  .sort(
    (a, b) => a.season - b.season || a.week - b.week || a.team.localeCompare(b.team),
  );

const duplicateKeys = findDuplicatePregameFeatureKeys(rows);
if (duplicateKeys.length) throw new Error(`Duplicate pregame feature rows detected: ${duplicateKeys.join(", ")}`);
if (!rows.length) throw new Error("Team pregame feature generation produced zero rows.");

const seasonPriorDropbackRates = rows.map((r) => r.seasonPrior.overallDropbackRate).filter((v): v is number => v != null);
const seasonPriorNeutralRates = rows.map((r) => r.seasonPrior.earlyDownNeutralPassRate).filter((v): v is number => v != null);
const seasonPriorProe = rows.map((r) => r.seasonPrior.passRateOverExpected).filter((v): v is number => v != null);

const output = outputOverride ?? join(DEFAULT_OUTPUT_DIR, `team-pregame-features-${targetSeasons[0]}-${targetSeasons.at(-1)}.json`);

const artifact = {
  _meta: {
    schemaVersion: "nfl-team-pregame-features-artifact-v1",
    generatedAt,
    source: "nflverse play-by-play (compact play-volume cache); public/data/nfl/<season>/games.json (schedule join)",
    neutralSituationDefinition: NEUTRAL_SITUATION_DEFINITION,
    seasons: targetSeasons,
    rowCount: rows.length,
    coverage: summarizeByWeek(rows),
    qa: {
      teamGameRowsBySeason: availableSeasons.map((season) => ({
        season,
        rows: allRecords.filter((r) => r.season === season).length,
      })),
      rowsInArtifact: rows.length,
      duplicateKeysDetected: duplicateKeys.length,
      rowsWithLowNeutralSample: countLowNeutralSampleRows(rows, LOW_NEUTRAL_SAMPLE_THRESHOLD),
      lowNeutralSampleThreshold: LOW_NEUTRAL_SAMPLE_THRESHOLD,
      rowsWithInsufficientPriorHistory: countRowsWithInsufficientPriorHistory(rows, MIN_PRIOR_GAMES_FOR_CONFIDENCE),
      minPriorGamesForConfidence: MIN_PRIOR_GAMES_FOR_CONFIDENCE,
      week1RowCount: rows.filter((r) => r.week === 1 && r.gamesPlayedPriorThisSeason === 0).length,
      week1WithPriorSeason: rows.filter((r) => r.week === 1 && r.hasPriorSeason).length,
      week1WithoutPriorSeason: rows.filter((r) => r.week === 1 && !r.hasPriorSeason).length,
      distributions: {
        seasonPriorOverallDropbackRate: summarizeDistribution(seasonPriorDropbackRates),
        seasonPriorEarlyDownNeutralPassRate: summarizeDistribution(seasonPriorNeutralRates),
        seasonPriorPassRateOverExpected: summarizeDistribution(seasonPriorProe),
      },
    },
    deferred: {
      secondsPerPlayPace: "not implemented -- reconstructing clock-stoppage-adjusted seconds/play from play-by-play requires classifying timeouts, injuries, replay reviews and the two-minute warning, which is out of scope for this phase; deferred rather than shipped unreliable.",
      blending: "seasonPrior/last3/priorSeason are never combined into one number -- choosing a blend weight is model-fitting, explicitly out of scope for Phase 2.",
      playerLevelFeatures: "this artifact is team-level only; no player opportunity/efficiency model exists yet.",
    },
    leakagePolicy: [
      "Every window (seasonPrior, last3, priorSeason) is built only from games strictly before the target game's own kickoff date within the applicable season -- never from week number.",
      "priorSeason uses only the entirely-prior NFL season, which by construction ends before the target season begins.",
      "The target game's own plays never enter its own feature row -- see the adversarial leakage tests in teamPlayVolume.test.ts.",
    ],
    sourceFiles,
  },
  rows,
};

writeAtomic(output, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`Generated ${rows.length} team pregame feature rows at ${output}`);
console.log(`Low neutral sample (< ${LOW_NEUTRAL_SAMPLE_THRESHOLD} plays): ${artifact._meta.qa.rowsWithLowNeutralSample}`);
console.log(`Week 1 rows: ${artifact._meta.qa.week1RowCount} (${artifact._meta.qa.week1WithPriorSeason} with prior season, ${artifact._meta.qa.week1WithoutPriorSeason} without)`);
