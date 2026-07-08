/**
 * Generate PGA tournament-specific player rankings dynamically.
 *
 * Monday automation contract:
 * - current tournament identity comes from the same schedule selector as field sync
 * - current model rows are filtered to the official current field
 * - Google Sheet data is optional enrichment; stale Sheet rows are never relabeled
 * - direct PGA Tour API stats can be the primary/fallback model source when fresh
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { selectLocalTarget } from "./lib/pga-field-selection.mjs";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "pga");
const MIN_CURRENT_MODEL_PLAYERS = parseInt(process.env.PGA_MIN_CURRENT_MODEL_PLAYERS || "20", 10);
const MAX_STATS_STALE_DAYS = parseInt(process.env.PGA_STATS_MAX_STALE_DAYS || "10", 10);

const PR_WEIGHTS = {
  sgTotal: 0.55,
  sgApp: 0.09,
  sgPutt: 0.04,
  trendRank: 0.03,
  sgAtG: 0.1,
  bogeyAvoidance: 0.14,
  birdieBogeyRatio: 0.05,
  sgOTT: 0,
  drivingAccuracy: 0,
};

const STAT_KEYS = [
  "sgTotal",
  "sgOTT",
  "sgApp",
  "sgAtG",
  "sgPutt",
  "trendRank",
  "drivingAccuracy",
  "bogeyAvoidance",
  "birdieBogeyRatio",
];

// Preserve the existing tournament-ranking formula. Only trendRank was treated
// as lower-is-better in the previous generator; this PR changes data sourcing,
// not the score formula.
const LOWER_IS_BETTER_STATS = new Set(["trendrank"]);
const MODEL_SOURCE_VALUES = new Set(["sheet", "online-api", "mixed", "fallback"]);
const SHEET_ONLY_FIELDS_UNAVAILABLE_ON_API = [
  "Salary",
  "HT # Rounds",
  "Course True SG",
  "2021-2025 course-history finishes",
  "Par 4 Scoring Average",
  "Birdie or Better 125-150 yds",
  "Birdie or Better <125 yds",
  "DataGolf TrendRank unless the Sheet is fresh",
];

function loadJson(relativePath) {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function loadOptionalJson(relativePath, fallback = null) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!existsSync(absolutePath)) return fallback;
  return JSON.parse(readFileSync(absolutePath, "utf8"));
}

function writeJson(relativePath, payload) {
  const targetPath = path.join(ROOT, relativePath);
  mkdirSync(path.dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function getTodayEt() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeEventKey(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\[.*?\]/g, "")
    .toLowerCase()
    .replace(/\b(the|presented by|championship|tournament|2026)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizePlayerName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function isLowerBetterStat(statKey) {
  return LOWER_IS_BETTER_STATS.has(statKey.toLowerCase());
}

function findCourseWeights(courseWeights, tournamentName, courseName) {
  const tournamentKey = normalizeEventKey(tournamentName);
  const courseKey = normalizeEventKey(courseName);

  return (
    courseWeights.find((entry) => normalizeEventKey(entry.tournament) === tournamentKey && normalizeEventKey(entry.course) === courseKey)
    ?? courseWeights.find((entry) => normalizeEventKey(entry.tournament) === tournamentKey)
    ?? courseWeights.find((entry) => normalizeEventKey(entry.course) === courseKey)
    ?? courseWeights.find((entry) => normalizeEventKey(entry.tournament) === "default")
    ?? null
  );
}

function findNextNonAlternateTournament(schedule, currentTournament) {
  return [...schedule]
    .filter((entry) => !String(entry.eventType ?? "").toLowerCase().includes("alternate field"))
    .filter((entry) => entry.startDate && entry.endDate)
    .sort((left, right) => String(left.startDate).localeCompare(String(right.startDate)))
    .find((entry) => String(entry.startDate) > String(currentTournament.endDate ?? currentTournament.startDate)) ?? null;
}

function daysSince(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.round(((Date.now() - parsed.getTime()) / 86_400_000) * 10) / 10;
}

function deriveModelSource(statsMeta) {
  const source = String(statsMeta?.source ?? "").toLowerCase();
  if (source.includes("google") || source.includes("sheet")) return "sheet";
  if (source.includes("fallback")) return "fallback";
  if (source.includes("pga-tour-api") || source.includes("api")) return "online-api";
  return "online-api";
}

function getStatsSourceDate(statsMeta) {
  return statsMeta?.exportDate ?? statsMeta?.fetchedAt ?? statsMeta?.syncedAt ?? null;
}

function isStatsFresh(statsMeta) {
  const ageDays = daysSince(getStatsSourceDate(statsMeta));
  return ageDays != null && ageDays <= MAX_STATS_STALE_DAYS;
}

function validateStatsInput(playerStats, statsMeta) {
  if (!Array.isArray(playerStats) || playerStats.length < MIN_CURRENT_MODEL_PLAYERS) {
    throw new Error(`Player stats input has only ${playerStats?.length ?? 0} players; refusing to generate a current model.`);
  }
  if (!isStatsFresh(statsMeta)) {
    throw new Error(
      `Player stats source is stale or missing. Source=${statsMeta?.source ?? "unknown"}; date=${getStatsSourceDate(statsMeta) ?? "missing"}. `
      + "Run scripts/fetch-pga-player-stats.mjs or refresh the Sheet before publishing model data.",
    );
  }
}

function validateCurrentField(currentField, currentTournament) {
  if (!currentField) throw new Error("Missing public/data/pga/current-field.json; cannot validate current model field.");
  const idMatch = currentField.localScheduleId && currentField.localScheduleId === currentTournament.id;
  const nameMatch = normalizeEventKey(currentField.tournament) === normalizeEventKey(currentTournament.name);
  if (!idMatch && !nameMatch) {
    throw new Error(
      `Current field/model mismatch: field=${currentField.tournament} (${currentField.localScheduleId ?? "no id"}) `
      + `model=${currentTournament.name} (${currentTournament.id}).`,
    );
  }
  if (!Array.isArray(currentField.players) || currentField.players.length < MIN_CURRENT_MODEL_PLAYERS) {
    throw new Error(`Current field has only ${currentField.players?.length ?? 0} players; refusing to publish model rows.`);
  }
}

function filterStatsToField(playerStats, currentField) {
  const statsByName = new Map(playerStats.map((player) => [normalizePlayerName(player.player), player]));
  const matched = [];
  const missing = [];

  for (const playerName of currentField.players ?? []) {
    const row = statsByName.get(normalizePlayerName(playerName));
    if (row) matched.push(row);
    else missing.push(playerName);
  }

  return { matched, missing };
}

function rankPlayers(players, weights) {
  if (!players?.length) return [];

  const ranges = {};
  STAT_KEYS.forEach((key) => {
    const values = players
      .map((player) => player[key])
      .filter((value) => typeof value === "number" && Number.isFinite(value));
    if (values.length > 0) ranges[key] = { min: Math.min(...values), max: Math.max(...values) };
  });

  const scored = players.map((player) => {
    let weightedScore = 0;
    let availableWeightTotal = 0;

    STAT_KEYS.forEach((key) => {
      const value = player[key];
      const weight = weights[key] ?? 0;
      const range = ranges[key];
      if (weight <= 0 || value == null || !range) return;

      const normalized = isLowerBetterStat(key)
        ? range.max === range.min ? 100 : ((range.max - value) / (range.max - range.min)) * 100
        : range.max === range.min ? 100 : ((value - range.min) / (range.max - range.min)) * 100;

      weightedScore += normalized * weight;
      availableWeightTotal += weight;
    });

    return { ...player, score: availableWeightTotal > 0 ? weightedScore / availableWeightTotal : 0 };
  });

  return scored
    .sort((left, right) => (right.score - left.score) || left.player.localeCompare(right.player))
    .map((player, index) => ({ ...player, rank: index + 1 }));
}

function rankValueMap(players, key, { lowerIsBetter = false } = {}) {
  const sorted = players
    .map((player) => ({ player: player.player, value: player[key] }))
    .filter((entry) => typeof entry.value === "number" && Number.isFinite(entry.value))
    .sort((left, right) => lowerIsBetter ? left.value - right.value : right.value - left.value);

  const ranks = new Map();
  sorted.forEach((entry, index) => {
    if (!ranks.has(entry.player)) ranks.set(entry.player, index + 1);
  });
  return ranks;
}

function buildTournamentPlayerDataRows(players) {
  const approachRanks = rankValueMap(players, "sgApp");
  const aroundGreenRanks = rankValueMap(players, "sgAtG");
  const puttingRanks = rankValueMap(players, "sgPutt");
  const drivingAccuracyRanks = rankValueMap(players, "drivingAccuracy");
  const bogeyAvoidanceRanks = rankValueMap(players, "bogeyAvoidance", { lowerIsBetter: true });

  return players
    .slice()
    .sort((left, right) => left.player.localeCompare(right.player))
    .map((player) => {
      const missingStatFields = [];
      if (player.sgApp == null) missingStatFields.push("SG: Approach the Green");
      if (player.drivingAccuracy == null) missingStatFields.push("Driving Accuracy %");
      if (player.bogeyAvoidance == null) missingStatFields.push("Bogey Avoidance");
      if (player.sgAtG == null) missingStatFields.push("SG: Around the Green");
      if (player.sgPutt == null) missingStatFields.push("SG: Putting");
      missingStatFields.push(...SHEET_ONLY_FIELDS_UNAVAILABLE_ON_API);

      const availableCoreStats = [player.sgApp, player.drivingAccuracy, player.bogeyAvoidance, player.sgAtG, player.sgPutt]
        .filter((value) => typeof value === "number" && Number.isFinite(value)).length;

      return {
        "Player Name": player.player,
        Salary: null,
        "HT # Rounds": null,
        "Course True SG": null,
        "2021": null,
        "2022": null,
        "2023": null,
        "2024": null,
        "2025": null,
        "SG: Approach the Green": player.sgApp ?? null,
        "SG: Around the Green": player.sgAtG ?? null,
        "SG: Putting": player.sgPutt ?? null,
        "Par 4 Scoring Average": null,
        "Driving Accuracy %": player.drivingAccuracy ?? null,
        "Bogey Avoidance": player.bogeyAvoidance ?? null,
        "Birdie or Better 125-150 yds": null,
        "Birdie or Better <125 yds": null,
        TrendRank: player.trendRank ?? null,
        "SG: Approach the Green_rank": approachRanks.get(player.player) ?? null,
        "SG: Around the Green_rank": aroundGreenRanks.get(player.player) ?? null,
        "SG: Putting_rank": puttingRanks.get(player.player) ?? null,
        "Par 4 Scoring Average_rank": null,
        "Driving Accuracy %_rank": drivingAccuracyRanks.get(player.player) ?? null,
        "Bogey Avoidance_rank": bogeyAvoidanceRanks.get(player.player) ?? null,
        "Birdie or Better 125-150 yds_rank": null,
        "Birdie or Better <125 yds_rank": null,
        hasStatProfile: availableCoreStats >= 4,
        missingStatFields,
        dataCompletenessScore: Number((availableCoreStats / 10).toFixed(2)),
      };
    });
}

function buildSourceMetadata({ tournament, rankedPlayers, inputPlayers, field, missingFieldPlayers, statsMeta, weightsEntry, usedDefaultWeights, isCurrent }) {
  const modelSource = deriveModelSource(statsMeta);
  if (!MODEL_SOURCE_VALUES.has(modelSource)) throw new Error(`Unsupported PGA modelSource: ${modelSource}`);

  const sourceDate = getStatsSourceDate(statsMeta);
  const sourceFreshnessAgeDays = daysSince(sourceDate);
  const sourceIsSheet = modelSource === "sheet";
  const onlineFallbackUsed = modelSource === "fallback";
  const sheetIsStale = onlineFallbackUsed || (sourceIsSheet && sourceFreshnessAgeDays != null && sourceFreshnessAgeDays > MAX_STATS_STALE_DAYS);

  return {
    version: 1,
    currentTournament: isCurrent ? tournament.name : null,
    fieldTournament: field?.tournament ?? null,
    modelTournament: tournament.name,
    tournamentId: field?.tournamentId ?? tournament.pgaTourId ?? tournament.id ?? null,
    tournamentSlug: tournament.slug ?? null,
    localScheduleId: tournament.id ?? null,
    modelSource,
    primaryDataSource: modelSource === "sheet" ? "google-sheet" : "online-api",
    statsSource: statsMeta?.source ?? null,
    statsExportDate: statsMeta?.exportDate ?? null,
    statsSyncedAt: statsMeta?.syncedAt ?? null,
    fetchedAt: field?.fetchedAt ?? null,
    generatedAt: new Date().toISOString(),
    sourceFreshnessAgeDays,
    sheetIsStale,
    onlineFallbackUsed,
    staleSheetBlocked: onlineFallbackUsed,
    safeForCurrentTournament: isCurrent ? rankedPlayers.length >= MIN_CURRENT_MODEL_PLAYERS : true,
    modelAvailable: rankedPlayers.length > 0,
    fieldCount: field?.fieldCount ?? field?.players?.length ?? null,
    inputPlayerCount: inputPlayers.length,
    rankedPlayerCount: rankedPlayers.length,
    omittedFieldPlayerCount: missingFieldPlayers.length,
    omittedFieldPlayersSample: missingFieldPlayers.slice(0, 25),
    weightsTournament: weightsEntry?.tournament ?? "DEFAULT",
    usedDefaultWeights,
    unavailableSheetOnlyFields: SHEET_ONLY_FIELDS_UNAVAILABLE_ON_API,
    unavailableFieldsPolicy: "Unavailable Sheet-only fields are set to null and are not fabricated.",
    formulaImpact: "The score formula and weights are unchanged. Online/API data supplies available SG, driving accuracy, bogey avoidance, and birdie/bogey inputs; Sheet-only course history, salary, par-4, proximity, and long-term finish history remain null until a fresh Sheet/manual source is available.",
  };
}

function generateTournamentOutput(tournament, rankedPlayers, isCurrentWeek, metadata) {
  return {
    section: isCurrentWeek ? "current-tournament" : "next-tournament",
    title: isCurrentWeek ? "CURRENT TOURNAMENT MODEL" : "NEXT WEEK TOURNAMENT MODEL",
    tournamentName: tournament.name,
    courseName: tournament.courseName,
    tournamentId: metadata.tournamentId,
    startDate: tournament.startDate ?? null,
    endDate: tournament.endDate ?? null,
    generatedAt: metadata.generatedAt,
    modelAvailable: metadata.modelAvailable,
    modelSource: metadata.modelSource,
    primaryDataSource: metadata.primaryDataSource,
    sourceTournamentName: metadata.fieldTournament ?? tournament.name,
    sourceReferenceDate: metadata.statsExportDate ?? metadata.statsSyncedAt,
    sourceValidated: metadata.safeForCurrentTournament,
    safeForCurrentTournament: metadata.safeForCurrentTournament,
    sheetIsStale: metadata.sheetIsStale,
    onlineFallbackUsed: metadata.onlineFallbackUsed,
    sourceFreshnessAgeDays: metadata.sourceFreshnessAgeDays,
    modelNote: metadata.formulaImpact,
    metadata,
    rows: rankedPlayers.map((player) => ({
      rank: player.rank,
      player: player.player,
      modelScore: player.score.toFixed(1),
      sgTotal: typeof player.sgTotal === "number" ? player.sgTotal.toFixed(3) : "0.000",
      sgOtt: typeof player.sgOTT === "number" ? player.sgOTT.toFixed(3) : "0.000",
      sgApp: typeof player.sgApp === "number" ? player.sgApp.toFixed(3) : "0.000",
      sgAtg: typeof player.sgAtG === "number" ? player.sgAtG.toFixed(3) : "0.000",
      sgPutt: typeof player.sgPutt === "number" ? player.sgPutt.toFixed(3) : "0.000",
    })),
  };
}

function generatePowerRankings(players, statsMeta) {
  const ranked = rankPlayers(players, PR_WEIGHTS);
  const modelSource = deriveModelSource(statsMeta);

  return {
    section: "power-rankings",
    title: "POWER RANKINGS",
    generatedAt: new Date().toISOString(),
    modelSource,
    primaryDataSource: modelSource === "sheet" ? "google-sheet" : "online-api",
    statsSource: statsMeta?.source ?? null,
    statsExportDate: statsMeta?.exportDate ?? null,
    statsSyncedAt: statsMeta?.syncedAt ?? null,
    sourceFreshnessAgeDays: daysSince(getStatsSourceDate(statsMeta)),
    rows: ranked.map((player) => ({
      rank: player.rank,
      player: player.player,
      powerScore: player.score.toFixed(1),
      sgTotal: typeof player.sgTotal === "number" ? player.sgTotal.toFixed(3) : "0.000",
      sgOtt: typeof player.sgOTT === "number" ? player.sgOTT.toFixed(3) : "0.000",
      sgApp: typeof player.sgApp === "number" ? player.sgApp.toFixed(3) : "0.000",
      sgAtg: typeof player.sgAtG === "number" ? player.sgAtG.toFixed(3) : "0.000",
      sgPutt: typeof player.sgPutt === "number" ? player.sgPutt.toFixed(3) : "0.000",
      trendRank: typeof player.trendRank === "number" ? player.trendRank.toFixed(1) : null,
    })),
  };
}

async function main() {
  console.log("\n🎯 Generating PGA Tournament Rankings\n");

  const schedule = loadJson("public/data/pga/schedule.json");
  const playerStats = loadJson("public/data/pga/player-stats-raw.json");
  const courseWeights = loadJson("public/data/pga/course-weights.json");
  const statsMeta = loadOptionalJson("public/data/pga/player-stats-meta.json", {});
  const currentField = loadOptionalJson("public/data/pga/current-field.json", null);

  validateStatsInput(playerStats, statsMeta);

  const asOfDate = process.env.PGA_MODEL_AS_OF ?? getTodayEt();
  const currentTournament = selectLocalTarget(schedule, asOfDate);
  const nextTournament = findNextNonAlternateTournament(schedule, currentTournament);
  validateCurrentField(currentField, currentTournament);

  const { matched: currentFieldStats, missing: missingFieldPlayers } = filterStatsToField(playerStats, currentField);
  if (currentFieldStats.length < MIN_CURRENT_MODEL_PLAYERS) {
    throw new Error(
      `Only ${currentFieldStats.length}/${currentField.players.length} current-field players matched stats profiles for ${currentTournament.name}.`,
    );
  }

  const currentWeights = findCourseWeights(courseWeights, currentTournament.name, currentTournament.courseName);
  if (!currentWeights) throw new Error("No DEFAULT course weights found; cannot rank current tournament.");
  const currentUsedDefault = normalizeEventKey(currentWeights.tournament) === "default";

  const currentRanked = rankPlayers(currentFieldStats, currentWeights.weights);
  const currentMetadata = buildSourceMetadata({
    tournament: currentTournament,
    rankedPlayers: currentRanked,
    inputPlayers: currentFieldStats,
    field: currentField,
    missingFieldPlayers,
    statsMeta,
    weightsEntry: currentWeights,
    usedDefaultWeights: currentUsedDefault,
    isCurrent: true,
  });

  const currentOutput = generateTournamentOutput(currentTournament, currentRanked, true, currentMetadata);

  let nextOutput;
  if (nextTournament) {
    const nextWeights = findCourseWeights(courseWeights, nextTournament.name, nextTournament.courseName) ?? currentWeights;
    const nextUsedDefault = normalizeEventKey(nextWeights.tournament) === "default";
    const nextRanked = rankPlayers(playerStats, nextWeights.weights);
    const nextMetadata = buildSourceMetadata({
      tournament: nextTournament,
      rankedPlayers: nextRanked,
      inputPlayers: playerStats,
      field: null,
      missingFieldPlayers: [],
      statsMeta,
      weightsEntry: nextWeights,
      usedDefaultWeights: nextUsedDefault,
      isCurrent: false,
    });
    nextOutput = generateTournamentOutput(nextTournament, nextRanked, false, nextMetadata);
  } else {
    nextOutput = {
      section: "next-tournament",
      title: "NEXT WEEK TOURNAMENT MODEL",
      tournamentName: null,
      courseName: null,
      generatedAt: new Date().toISOString(),
      modelAvailable: false,
      modelSource: deriveModelSource(statsMeta),
      modelNote: "No upcoming non-alternate tournament found after the current event.",
      rows: [],
    };
  }

  const powerRankingsOutput = generatePowerRankings(playerStats, statsMeta);
  const currentTournamentPlayerData = buildTournamentPlayerDataRows(currentFieldStats);

  writeJson("public/data/pga/current-tournament.json", currentOutput);
  writeJson("public/data/pga/next-tournament.json", nextOutput);
  writeJson("public/data/pga/power-rankings.json", powerRankingsOutput);
  writeJson(`public/data/pga/${currentTournament.dataFile}`, currentTournamentPlayerData);
  writeJson(`public/data/pga/${currentTournament.slug}-model-meta.json`, currentMetadata);
  writeJson("public/data/pga/model-source-meta.json", currentMetadata);

  console.log(`[pga-rankings] Current tournament: ${currentTournament.name}`);
  console.log(`[pga-rankings] Model source: ${currentMetadata.modelSource}`);
  console.log(`[pga-rankings] Field stats matched: ${currentFieldStats.length}/${currentField.players.length}`);
  console.log(`[pga-rankings] Wrote current model rows: ${currentRanked.length}`);
  console.log(`[pga-rankings] Wrote tournament data file: public/data/pga/${currentTournament.dataFile}`);
  console.log("\n✅ Tournament rankings generated successfully!\n");
}

main().catch((error) => {
  console.error("\n❌ Error generating tournament rankings:", error instanceof Error ? error.message : error);
  process.exit(1);
});
