import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CFB_TEAM_METADATA } from "../src/data/cfb/teamMetadata";
import { getJkbTeamIdForCfbdName } from "../src/data/cfb/externalTeamMapping";
import {
  CFB_PIPELINE_CONFIG,
  assertCompleteCfbRatings,
  buildPreseasonModelInputs,
  normalizeCfbdGamePerformance,
  normalizeCfbdGames,
  normalizeCfbdSchedule,
  normalizeCfbdTransitionPriorFallbacks,
  resolveCfbdFbsTeams,
  type CfbdGame,
  type CfbdGameTeamStats,
  type CfbdReturningProduction,
  type CfbdTalent,
  type CfbdTeam,
  type CfbdTransitionTeamCache,
} from "../src/lib/cfb/pipeline";
import {
  computeDisplayRatings,
  computeRawRatingsForTeams,
  computeRawSosForAllTeams,
  computeSosDisplay,
  toSosGameInputs,
} from "../src/lib/cfb/model";
import { writeAtomic } from "./lib/cfb-cfbd-client";

const ROOT = resolve(import.meta.dirname, "..");
const RAW_DIR = resolve(ROOT, "data", "cfb", "cfbd", "raw");
const OUTPUT_DIR = resolve(ROOT, "data", "generated", "cfb");

type RawCacheManifestFile = {
  name: string;
  filename: string;
  rowCount: number;
  byteSize: number;
  sha256: string;
};

type RawCacheManifest = {
  schemaVersion: string;
  files: RawCacheManifestFile[];
};

type TransitionCacheManifest = {
  schemaVersion: string;
  filename: string;
  byteSize: number;
  sha256: string;
  requestCount: number;
};

const EXPECTED_CACHE_ROWS = Object.freeze({
  "teams-2026": 138,
  "games-2025": 934,
  "game-team-stats-2025": 934,
  "games-2026": 888,
  "returning-production-2026": 136,
  "talent-2026": 0,
});

function readJson<T>(filename: string, optional = false): T | null {
  const path = resolve(RAW_DIR, filename);
  if (!existsSync(path)) {
    if (optional) return null;
    throw new Error(`Missing ${path}. Run npm run cfb:fetch-data with CFBD_API_KEY first.`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "number" ? String(Number(value.toFixed(6))) : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function hash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function validateRawCache(manifest: RawCacheManifest): void {
  if (manifest.schemaVersion !== "jkb-cfbd-raw-cache-v1") {
    throw new Error(`Unexpected raw cache schema ${manifest.schemaVersion}`);
  }
  for (const [name, expectedRows] of Object.entries(EXPECTED_CACHE_ROWS)) {
    const entry = manifest.files.find((candidate) => candidate.name === name);
    if (!entry) throw new Error(`Raw cache manifest missing ${name}`);
    const path = resolve(RAW_DIR, entry.filename);
    if (!existsSync(path)) throw new Error(`Raw cache file missing ${path}`);
    const text = readFileSync(path, "utf8");
    const data = JSON.parse(text) as unknown;
    if (!Array.isArray(data)) throw new Error(`${entry.filename} is not a JSON array`);
    if (data.length !== expectedRows || entry.rowCount !== expectedRows) {
      throw new Error(
        `${name} row count mismatch: file=${data.length}, manifest=${entry.rowCount}, expected=${expectedRows}`,
      );
    }
    if (Buffer.byteLength(text) !== entry.byteSize) {
      throw new Error(`${name} byte size does not match manifest`);
    }
    if (hash(text) !== entry.sha256) {
      throw new Error(`${name} SHA-256 does not match manifest`);
    }
  }
}

function validateTransitionCache(
  cache: CfbdTransitionTeamCache,
  manifest: TransitionCacheManifest,
): void {
  if (manifest.schemaVersion !== "jkb-cfbd-transition-team-manifest-v1") {
    throw new Error(`Unexpected transition cache manifest schema ${manifest.schemaVersion}`);
  }
  if (cache.schemaVersion !== "jkb-cfbd-transition-team-cache-v1") {
    throw new Error(`Unexpected transition cache schema ${cache.schemaVersion}`);
  }
  const text = readFileSync(resolve(RAW_DIR, manifest.filename), "utf8");
  if (Buffer.byteLength(text) !== manifest.byteSize || hash(text) !== manifest.sha256) {
    throw new Error("Transition-team cache does not match its manifest");
  }
  if (manifest.requestCount !== 4 || cache.teams.length !== 2) {
    throw new Error("Transition-team cache must contain two teams from four narrow requests");
  }
}

function assertFinite(value: number | null, label: string): void {
  if (value !== null && !Number.isFinite(value)) throw new Error(`${label} is NaN/Infinity`);
}

function finiteRange(values: Array<number | null>): { min: number | null; max: number | null } {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return finite.length === 0 ? { min: null, max: null } : { min: Math.min(...finite), max: Math.max(...finite) };
}

function main() {
  const manifest = readJson<RawCacheManifest>("manifest.json") as RawCacheManifest;
  validateRawCache(manifest);
  const transitionManifest = readJson<TransitionCacheManifest>(
    "transition-teams-2025.manifest.json",
  ) as TransitionCacheManifest;
  const transitionCache = readJson<CfbdTransitionTeamCache>(
    "transition-teams-2025.json",
  ) as CfbdTransitionTeamCache;
  validateTransitionCache(transitionCache, transitionManifest);
  const teams = readJson<CfbdTeam[]>("teams-2026.json") as CfbdTeam[];
  const raw2025Games = readJson<CfbdGame[]>("games-2025.json") as CfbdGame[];
  const rawStats = readJson<CfbdGameTeamStats[]>("game-team-stats-2025.json") as CfbdGameTeamStats[];
  const raw2026Games = readJson<CfbdGame[]>("games-2026.json") as CfbdGame[];
  const returning = readJson<CfbdReturningProduction[]>("returning-production-2026.json", true) ?? [];
  const talent = readJson<CfbdTalent[]>("talent-2026.json", true) ?? [];

  const mappings = resolveCfbdFbsTeams(teams);
  const historicalGames = normalizeCfbdGames(raw2025Games, mappings);
  const performance = normalizeCfbdGamePerformance(rawStats, historicalGames, mappings);
  const transitionFallbacks = normalizeCfbdTransitionPriorFallbacks(
    transitionCache,
    mappings,
    new Set(historicalGames.map((game) => game.gameId)),
  );
  const teamIds = CFB_TEAM_METADATA.map((team) => team.id);
  const modelInputs = buildPreseasonModelInputs({
    teamIds,
    performances: performance,
    games: historicalGames,
    priorFallbacks: transitionFallbacks,
    returningProduction: returning,
    talent,
  });
  const schedule = normalizeCfbdSchedule(raw2026Games, mappings);

  if (process.argv.includes("--validate-only")) {
    const gameTypes = Object.fromEntries(
      [...new Set(historicalGames.map((game) => game.gameType))]
        .sort()
        .map((type) => [type, historicalGames.filter((game) => game.gameType === type).length]),
    );
    const categories = [...new Set(rawStats.flatMap((game) => game.teams.flatMap((team) => team.stats.map((stat) => stat.category))))].sort();
    const rawTeamKeys = rawStats.flatMap((game) => game.teams.map((team) => `${game.id}:${team.teamId}`));
    const scheduleCounts = new Map(CFB_TEAM_METADATA.map((team) => [team.id, 0]));
    for (const game of schedule) {
      if (scheduleCounts.has(game.homeTeamId)) scheduleCounts.set(game.homeTeamId, (scheduleCounts.get(game.homeTeamId) ?? 0) + 1);
      if (scheduleCounts.has(game.awayTeamId)) scheduleCounts.set(game.awayTeamId, (scheduleCounts.get(game.awayTeamId) ?? 0) + 1);
    }
    const missingReturning = CFB_TEAM_METADATA
      .filter((team) => !returning.some((row) => getJkbTeamIdForCfbdName(row.team) === team.id))
      .map((team) => team.name);
    const qa = modelInputs.qa;
    const audit = {
      cache: Object.fromEntries(Object.entries(EXPECTED_CACHE_ROWS)),
      transitionCache: {
        sha256: transitionManifest.sha256,
        requestCount: transitionManifest.requestCount,
        teams: transitionFallbacks.map((fallback) => ({
          teamId: fallback.teamId,
          sourceGames: fallback.sourceGameIds.length,
          normalizedTeamRows: fallback.performances.length,
          overlappingFbsCacheGameIds: fallback.overlappingFbsCacheGameIds,
          additionalGameCount:
            fallback.sourceGameIds.length - fallback.overlappingFbsCacheGameIds.length,
          duplicateGameIdsRemoved: fallback.duplicateGameIdsRemoved,
          sourceClassifications: [
            ...new Set(fallback.performances.map((row) => row.teamClassification)),
          ],
          missing: {
            points: fallback.performances.filter((row) => row.points === null).length,
            pointsAllowed: fallback.performances.filter((row) => row.pointsAllowed === null).length,
            plays: fallback.performances.filter((row) => row.plays === null).length,
            totalYards: fallback.performances.filter((row) => row.totalYards === null).length,
            yardsPerPlay: fallback.performances.filter((row) => row.yardsPerPlay === null).length,
            yardsPerPlayAllowed: fallback.performances.filter((row) => row.yardsPerPlayAllowed === null).length,
            turnovers: fallback.performances.filter((row) => row.turnovers === null).length,
          },
          impossibleRows: fallback.performances.filter((row) =>
            [row.plays, row.totalYards, row.yardsPerPlay, row.yardsPerPlayAllowed, row.turnovers]
              .some((value) => value !== null && (!Number.isFinite(value) || value < 0)),
          ).map((row) => row.gameId),
          input: modelInputs.inputs.find((input) => input.teamId === fallback.teamId),
        })),
      },
      mappings: {
        expected: CFB_TEAM_METADATA.length,
        mapped: mappings.length,
        unmapped: [],
        duplicateCfbdIds: mappings.length - new Set(mappings.map((row) => row.cfbdId)).size,
        duplicateJkbIds: mappings.length - new Set(mappings.map((row) => row.jkbTeamId)).size,
        ambiguousAliases: [],
      },
      historicalGames: {
        total: historicalGames.length,
        fbsVsFbs: historicalGames.filter((game) => game.homeClassification === "fbs" && game.awayClassification === "fbs").length,
        fbsVsFcs: historicalGames.filter((game) => game.includesFcsOpponent).length,
        gameTypes,
        duplicateGameIds: historicalGames.length - new Set(historicalGames.map((game) => game.gameId)).size,
      },
      teamGameStats: {
        sourceGames: rawStats.length,
        categories,
        duplicateGameTeamRows: rawTeamKeys.length - new Set(rawTeamKeys).size,
        gamesWithoutTwoTeams: rawStats.filter((game) => game.teams.length !== 2).map((game) => game.id),
        teamsWithoutStats: rawStats.flatMap((game) => game.teams.filter((team) => team.stats.length === 0).map((team) => `${game.id}:${team.team}`)),
        normalizedTeamRows: performance.length,
        missing: {
          points: performance.filter((row) => row.points === null).length,
          pointsAllowed: performance.filter((row) => row.pointsAllowed === null).length,
          plays: performance.filter((row) => row.plays === null).length,
          totalYards: performance.filter((row) => row.totalYards === null).length,
          yardsPerPlay: performance.filter((row) => row.yardsPerPlay === null).length,
          yardsPerPlayAllowed: performance.filter((row) => row.yardsPerPlayAllowed === null).length,
          turnovers: performance.filter((row) => row.turnovers === null).length,
        },
        impossibleRows: performance.filter((row) =>
          [row.plays, row.totalYards, row.yardsPerPlay, row.yardsPerPlayAllowed, row.turnovers]
            .some((value) => value !== null && (!Number.isFinite(value) || value < 0)),
        ).map((row) => `${row.gameId}:${row.teamId}`),
      },
      returningProduction: {
        sourceRows: returning.length,
        mappedRows: returning.filter((row) => getJkbTeamIdForCfbdName(row.team) !== null).length,
        missingTeams: missingReturning,
        availableFields: returning[0] ? Object.keys(returning[0]) : [],
        usedField: "percentPPA",
        defensiveField: null,
        quarterbackContinuityField: null,
      },
      talent: { sourceRows: talent.length, status: "unavailable", configuredWeight: 0 },
      opponentAdjustment: {
        iterations: CFB_PIPELINE_CONFIG.opponentAdjustmentIterations,
        strength: CFB_PIPELINE_CONFIG.opponentAdjustmentStrength,
        teamsWithEligibleFbsData: qa.filter((row) => row.opponentAdjustedOffense !== null).length,
        minimumDataFailures: qa.filter((row) => row.opponentAdjustedOffense === null).map((row) => row.teamId),
        rawOffenseRange: finiteRange(qa.map((row) => row.rawOffense)),
        rawDefenseRange: finiteRange(qa.map((row) => row.rawDefense)),
        adjustedOffenseRange: finiteRange(qa.map((row) => row.opponentAdjustedOffense)),
        adjustedDefenseRange: finiteRange(qa.map((row) => row.opponentAdjustedDefense)),
      },
      schedule: {
        total: raw2026Games.length,
        fbsVsFbs: raw2026Games.filter((game) => game.homeClassification === "fbs" && game.awayClassification === "fbs").length,
        fbsVsFcs: raw2026Games.filter((game) => game.homeClassification === "fcs" || game.awayClassification === "fcs").length,
        neutralSite: raw2026Games.filter((game) => game.neutralSite).length,
        duplicateGameIds: raw2026Games.length - new Set(raw2026Games.map((game) => game.id)).size,
        belowTwelve: [...scheduleCounts].filter(([, count]) => count < 12),
        aboveThirteen: [...scheduleCounts].filter(([, count]) => count > 13),
        countRange: finiteRange([...scheduleCounts.values()]),
        unmappedFbsOpponents: [...new Set(raw2026Games.flatMap((game) => [
          game.homeClassification === "fbs" && !getJkbTeamIdForCfbdName(game.homeTeam) ? game.homeTeam : null,
          game.awayClassification === "fbs" && !getJkbTeamIdForCfbdName(game.awayTeam) ? game.awayTeam : null,
        ]).filter((team): team is string => team !== null))],
      },
    };
    console.log(JSON.stringify(audit, null, 2));
    return;
  }

  const rawRatings = computeRawRatingsForTeams(modelInputs.inputs);
  const insufficientDataTeams = rawRatings
    .filter((row) => row.status === "insufficient-data")
    .map((row) => row.teamId);
  assertCompleteCfbRatings(rawRatings);
  const displayRatings = computeDisplayRatings(rawRatings);
  const powerLookup = new Map(displayRatings.map((row) => [row.teamId, row.jkbPowerRating]));
  const rawSos = computeRawSosForAllTeams(teamIds, toSosGameInputs(schedule), powerLookup);
  const sos = computeSosDisplay(rawSos);
  const qaByTeam = new Map(modelInputs.qa.map((row) => [row.teamId, row]));
  const inputByTeam = new Map(modelInputs.inputs.map((row) => [row.teamId, row]));
  const rawByTeam = new Map(rawRatings.map((row) => [row.teamId, row]));
  const sosByTeam = new Map(sos.map((row) => [row.teamId, row]));

  if (displayRatings.length !== 138 || rawRatings.length !== 138) throw new Error("Expected 138 model-rated teams");
  const ranks = displayRatings.map((row) => row.jkbRank).sort((a, b) => (a ?? 999) - (b ?? 999));
  if (ranks.some((rank, index) => rank !== index + 1)) throw new Error("Ranks are not exactly 1-138");
  if (displayRatings.filter((row) => (row.jkbRank ?? 999) <= 25).length !== 25) {
    throw new Error("Top 25 is not exactly ranks 1-25");
  }
  const fbsIds = new Set(teamIds);
  for (const game of schedule) {
    if (game.homeTeamId === game.awayTeamId) throw new Error(`Team plays itself in game ${game.id}`);
    for (const teamId of [game.homeTeamId, game.awayTeamId]) {
      if (!teamId.startsWith("cfbd:") && !fbsIds.has(teamId)) {
        throw new Error(`Unmapped FBS schedule team ${teamId} in game ${game.id}`);
      }
    }
  }

  const rows = displayRatings
    .map((display) => {
      const team = CFB_TEAM_METADATA.find((candidate) => candidate.id === display.teamId);
      const raw = rawByTeam.get(display.teamId);
      const input = inputByTeam.get(display.teamId);
      const qa = qaByTeam.get(display.teamId);
      const teamSos = sosByTeam.get(display.teamId);
      if (!team || !raw || !input || !qa || !teamSos) throw new Error(`Incomplete output for ${display.teamId}`);
      for (const [label, value] of Object.entries({ ...display, ...teamSos, ...raw })) {
        if (typeof value === "number") assertFinite(value, `${team.id}.${label}`);
      }
      return {
        rank: display.jkbRank,
        team: team.name,
        conference: team.conference,
        jkbPower: display.jkbPowerRating,
        jkbOffense: display.jkbOffensiveRating,
        jkbDefense: display.jkbDefensiveRating,
        sosRemainingRating: teamSos.sosRemainingRating,
        sosRemainingRank: teamSos.sosRemainingRank,
        sosPlayedRating: teamSos.sosPlayedRating,
        sosPlayedRank: teamSos.sosPlayedRank,
        rawPower: raw.rawPowerRating,
        rawOffense: raw.rawOffensiveRating,
        rawDefense: raw.rawDefensiveRating,
        priorOffense: input.priorPerformance?.offensiveYardsPerPlay ?? null,
        priorDefense: input.priorPerformance?.defensiveYardsPerPlayAllowed ?? null,
        opponentAdjustedOffense: input.opponentAdjusted?.opponentAdjustedOffensiveEfficiency ?? null,
        opponentAdjustedDefense: input.opponentAdjusted?.opponentAdjustedDefensiveEfficiency ?? null,
        priorPerformanceSource: input.priorPerformanceMetadata?.source ?? null,
        priorSampleGames: input.priorPerformanceMetadata?.sampleGames ?? 0,
        priorSourceClassification: input.priorPerformanceMetadata?.sourceClassification ?? null,
        returningProductionOffense:
          input.returningProduction?.returningOffensiveProductionPct ?? null,
        returningProductionDefense:
          input.returningProduction?.returningDefensiveProductionPct ?? null,
        returningQb: input.returningProduction?.returningQuarterback ?? null,
        rosterTalentComposite: input.rosterTalent?.rosterCompositeScore ?? null,
        provenance: "model-computed",
        inputProvenance: {
          priorPerformance: input.priorPerformanceMetadata,
          opponentAdjusted: input.opponentAdjusted
            ? "JKB 12-iteration FBS-only opponent adjustment"
            : "unavailable",
          returningProduction: input.returningProduction
            ? "CFBD /player/returning 2026 percentPPA"
            : "unavailable",
          returningDefense: "unavailable",
          quarterbackContinuity: "unavailable",
          rosterTalent: "unavailable (CFBD /talent 2026 returned no records)",
        },
        inputs: input,
        teamId: team.id,
        ratingBreakdown: raw.breakdown,
        priorQa: qa,
      };
    })
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

  const hardest = [...rows].sort(
    (a, b) => (a.sosRemainingRank ?? 999) - (b.sosRemainingRank ?? 999),
  );
  if (hardest[0]?.sosRemainingRating !== Math.max(...rows.map((row) => row.sosRemainingRating ?? -Infinity))) {
    throw new Error("SOS Remaining rank 1 is not the maximum SOS rating");
  }

  const headers = [
    "rank", "team", "conference", "jkbPower", "jkbOffense", "jkbDefense",
    "sosPlayedRating", "sosPlayedRank", "sosRemainingRating", "sosRemainingRank",
    "rawPower", "rawOffense", "rawDefense",
    "priorOffense", "priorDefense", "opponentAdjustedOffense", "opponentAdjustedDefense",
    "priorPerformanceSource", "priorSampleGames", "priorSourceClassification",
    "returningProductionOffense", "returningProductionDefense", "returningQb",
    "rosterTalentComposite", "provenance",
  ];
  const csv = `${headers.join(",")}\n${rows
    .map((row) => headers.map((header) => csvCell(row[header as keyof typeof row])).join(","))
    .join("\n")}\n`;
  const json = `${JSON.stringify(
    {
      schemaVersion: "jkb-cfb-2026-preseason-ratings-v1",
      provider: "CollegeFootballData.com API v2",
      sourceCache: { fbs: manifest, transitionTeams: transitionManifest },
      provenance: "model-computed",
      historicalGameCount: historicalGames.length,
      transitionTeamGameCount: transitionFallbacks.reduce(
        (sum, fallback) => sum + fallback.sourceGameIds.length,
        0,
      ),
      scheduleGameCount: schedule.length,
      insufficientDataTeams,
      rows,
    },
    null,
    2,
  )}\n`;
  writeAtomic(resolve(OUTPUT_DIR, "2026-preseason-ratings.csv"), csv);
  writeAtomic(resolve(OUTPUT_DIR, "2026-preseason-ratings.json"), json);
  writeAtomic(resolve(OUTPUT_DIR, "2025-normalized-games.json"), `${JSON.stringify(historicalGames, null, 2)}\n`);
  writeAtomic(
    resolve(OUTPUT_DIR, "2025-transition-team-normalized-games.json"),
    `${JSON.stringify(transitionFallbacks, null, 2)}\n`,
  );
  writeAtomic(resolve(OUTPUT_DIR, "2026-schedule.json"), `${JSON.stringify(schedule, null, 2)}\n`);
  console.log(`[cfb:build-ratings] ${rows.length} teams; ${historicalGames.length} historical games; ${schedule.length} schedule games`);
  console.log(`[cfb:build-ratings] ratings CSV sha256 ${hash(csv)}`);
}

try {
  main();
} catch (error) {
  console.error(`[cfb:build-ratings] FAILED: ${(error as Error).message}`);
  process.exitCode = 1;
}
