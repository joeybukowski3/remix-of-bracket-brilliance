// CFB Model V2 — shadow build orchestrator (WU4 §10). Orchestrates the
// existing WU2 rating generator and WU3 projection generator against ONE
// shared in-memory rating state (never two separately-generated files that
// could silently diverge), cross-validates the pair, computes content
// hashes, and only then atomically promotes ratings + projections + a new
// manifest.json together. On any failure, the previous last-known-good
// manifest/artifacts are left completely untouched and failure diagnostics
// are written to a separate file. SHADOW MODE ONLY — no UI wiring, no V1
// mutation, no CFBD refetch (WU4 §11: this operates on whatever raw CFBD
// caches already exist on disk under data/cfb/cfbd/raw/).
//
// LIMITATIONS carried forward (documented, not silently absorbed — see WU3's
// scripts/cfb-v2-build-projections.ts for the identical note):
//   - No production /plays ingestion yet -> currentSeasonSuccessObservations
//     is always [] (§8/§28).
//   - No production source for completed-game point totals wired up yet ->
//     previousSeasonMean/allPriorSeasonsMean passed as null.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCfbV2TeamRatings } from "../src/lib/cfb/production/v2/buildTeamRatings";
import { buildCfbV2TeamRatingArtifact, cfbV2TeamRatingArtifactPath } from "../src/lib/cfb/production/v2/artifactWriter";
import { validateCfbV2TeamRatings } from "../src/lib/cfb/production/v2/ratingValidation";
import type { CfbdGame, CfbdGameTeamStats, CfbdReturningProduction, CfbdTalent, CfbdTeam } from "../src/lib/cfb/production/v2/ratingInputs";
import { buildCfbV2GameProjections, type CfbV2ScheduleGame } from "../src/lib/cfb/production/v2/buildGameProjections";
import { buildCfbV2GameProjectionArtifact, cfbV2GameProjectionArtifactPath } from "../src/lib/cfb/production/v2/projectionArtifactWriter";
import { validateCfbV2GameProjections } from "../src/lib/cfb/production/v2/projectionValidation";
import { CFB_V2_CONFIG_VERSION } from "../src/lib/cfb/production/v2/config";
import {
  cfbV2CalibrationResidualSeedPath,
  cfbV2ScoringNormalEquationsPath,
  type CfbV2CalibrationResidualSeedArtifact,
  type CfbV2ScoringNormalEquationsArtifact,
} from "../src/lib/cfb/production/v2/scoringSupportTypes";
import { validateCfbV2CalibrationResidualSeed, validateCfbV2ScoringNormalEquations } from "../src/lib/cfb/production/v2/scoringSupportValidation";
import { assertPublishableCfbV2Shadow } from "../src/lib/cfb/production/v2/shadowValidation";
import { buildCfbV2ShadowManifest, computeCfbV2ArtifactContentHash, computeCfbV2ShadowDegradedFlags } from "../src/lib/cfb/production/v2/shadowManifest";
import { promoteCfbV2ShadowState, writeCfbV2ShadowFailureDiagnostics } from "../src/lib/cfb/production/v2/shadowPublish";
import { cfbV2ManifestPath } from "../src/lib/cfb/production/v2/artifactContracts";

const ROOT = resolve(import.meta.dirname, "..");
const RAW_DIR = resolve(ROOT, "data", "cfb", "cfbd", "raw");

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(RAW_DIR, `${name}.json`), "utf8")) as T;
}

function readOptionalJson<T>(name: string, fallback: T): T {
  try {
    return readJson<T>(name);
  } catch {
    return fallback;
  }
}

function parseArgs(argv: readonly string[]): { season: number; asOfWeek: number; schedulePath: string } {
  const seasonArg = argv.find((a) => a.startsWith("--season="))?.split("=")[1];
  const asOfArg = argv.find((a) => a.startsWith("--as-of="))?.split("=")[1];
  const scheduleArg = argv.find((a) => a.startsWith("--schedule="))?.split("=")[1];
  return {
    season: seasonArg ? Number(seasonArg) : 2026,
    asOfWeek: asOfArg ? Number(asOfArg) : 0,
    schedulePath: scheduleArg ?? "data/generated/cfb/2026-schedule-v1.json",
  };
}

type RawScheduleGame = {
  id: string;
  season: number;
  week: number;
  date: string;
  homeTeamId: string;
  awayTeamId: string;
  neutralSite: boolean;
  homeClassification: string | null;
  awayClassification: string | null;
};

function fail(stage: string, error: unknown): never {
  const reason = error instanceof Error ? error.message : String(error);
  const occurredAt = new Date().toISOString();
  console.error(`[cfb:v2:build-shadow] FAILED at stage "${stage}": ${reason}`);
  console.error(`[cfb:v2:build-shadow] previous manifest/artifacts left untouched (last-known-good preserved)`);
  const diagnosticsPath = writeCfbV2ShadowFailureDiagnostics(ROOT, stage, reason, occurredAt);
  console.error(`[cfb:v2:build-shadow] failure diagnostics written to ${diagnosticsPath}`);
  process.exit(1);
}

function main(): void {
  const { season, asOfWeek, schedulePath } = parseArgs(process.argv.slice(2));
  console.log(`[cfb:v2:build-shadow] season=${season} asOfWeek=${asOfWeek} schedule=${schedulePath}`);
  const generatedAt = new Date().toISOString();
  const totalStartedAt = Date.now();

  // ---- 1. load production inputs -------------------------------------------------
  let teams: CfbdTeam[], currentSeasonGames: CfbdGame[], currentSeasonTeamGameStats: CfbdGameTeamStats[];
  let priorSeasonGames: CfbdGame[], priorSeasonTeamGameStats: CfbdGameTeamStats[];
  let returningProduction: CfbdReturningProduction[], talent: CfbdTalent[];
  let rawSchedule: RawScheduleGame[];
  let scoringArtifact: CfbV2ScoringNormalEquationsArtifact, calibrationArtifact: CfbV2CalibrationResidualSeedArtifact;
  try {
    teams = readJson<CfbdTeam[]>(`teams-${season}`);
    currentSeasonGames = readJson<CfbdGame[]>(`games-${season}`);
    currentSeasonTeamGameStats = readOptionalJson<CfbdGameTeamStats[]>(`game-team-stats-${season}`, []);
    priorSeasonGames = readJson<CfbdGame[]>(`games-${season - 1}`);
    priorSeasonTeamGameStats = readJson<CfbdGameTeamStats[]>(`game-team-stats-${season - 1}`);
    returningProduction = readOptionalJson<CfbdReturningProduction[]>(`returning-production-${season}`, []);
    talent = readOptionalJson<CfbdTalent[]>(`talent-${season}`, []);
    rawSchedule = JSON.parse(readFileSync(resolve(ROOT, schedulePath), "utf8")) as RawScheduleGame[];
    scoringArtifact = JSON.parse(readFileSync(resolve(ROOT, cfbV2ScoringNormalEquationsPath()), "utf8")) as CfbV2ScoringNormalEquationsArtifact;
    calibrationArtifact = JSON.parse(readFileSync(resolve(ROOT, cfbV2CalibrationResidualSeedPath()), "utf8")) as CfbV2CalibrationResidualSeedArtifact;
  } catch (error) {
    fail("load-inputs", error);
  }

  // ---- 2/3. build + validate V2 ratings -------------------------------------------
  const completedCurrentSeasonGames = currentSeasonGames.filter((g) => g.completed);
  const dataAsOf =
    completedCurrentSeasonGames.length > 0
      ? completedCurrentSeasonGames.map((g) => g.startDate).sort().at(-1)!
      : priorSeasonGames.filter((g) => g.completed).map((g) => g.startDate).sort().at(-1)!;

  let ratings: ReturnType<typeof buildCfbV2TeamRatings>;
  const ratingsStartedAt = Date.now();
  try {
    ratings = buildCfbV2TeamRatings({
      season,
      dataAsOf,
      generatedAt,
      asOfWeek,
      teams,
      currentSeasonGames,
      currentSeasonTeamGameStats,
      priorSeasonGames,
      priorSeasonTeamGameStats,
      returningProduction,
      talent,
    });
    const expectedFbsTeamIds = new Set(ratings.map((r) => r.teamId));
    validateCfbV2TeamRatings(ratings, expectedFbsTeamIds);
  } catch (error) {
    fail("build-ratings", error);
  }
  const ratingsMs = Date.now() - ratingsStartedAt;
  console.log(`[cfb:v2:build-shadow] built+validated ${ratings!.length} ratings in ${ratingsMs}ms`);

  // ---- 4/5. build + validate V2 projections, from the SAME in-memory ratings ------
  try {
    validateCfbV2ScoringNormalEquations(scoringArtifact!, CFB_V2_CONFIG_VERSION);
    validateCfbV2CalibrationResidualSeed(calibrationArtifact!, CFB_V2_CONFIG_VERSION);
  } catch (error) {
    fail("verify-support-artifacts", error);
  }

  const scheduleGames: CfbV2ScheduleGame[] = rawSchedule!
    .filter((g) => g.season === season)
    .map((g) => ({
      gameId: g.id,
      season: g.season,
      week: g.week,
      homeTeamId: g.homeTeamId,
      awayTeamId: g.awayTeamId,
      neutralSite: g.neutralSite,
      homeClassification: g.homeClassification,
      awayClassification: g.awayClassification,
    }));
  const teamRatingsByTeamId = new Map(ratings!.map((r) => [r.teamId, r]));

  let projections: ReturnType<typeof buildCfbV2GameProjections>;
  const projectionsStartedAt = Date.now();
  try {
    projections = buildCfbV2GameProjections({
      season,
      dataAsOf: { season, week: 1 }, // preseason default; a historical replay must pass real dataAsOf via a future WU
      dataAsOfIso: dataAsOf,
      generatedAt,
      scheduleGames,
      teamRatingsByTeamId,
      scoringArtifact: scoringArtifact!,
      calibrationArtifact: calibrationArtifact!,
      currentSeasonSuccessObservations: [],
      currentSeasonCompletedGameScores: [],
      previousSeasonMean: null,
      allPriorSeasonsMean: null,
      currentSeasonCalibrationRows: [],
    });
    validateCfbV2GameProjections(projections);
  } catch (error) {
    fail("build-projections", error);
  }
  const projectionsMs = Date.now() - projectionsStartedAt;
  console.log(`[cfb:v2:build-shadow] built+validated ${projections!.length} projections in ${projectionsMs}ms`);

  // ---- 6. cross-validate ------------------------------------------------------------
  const validationStartedAt = Date.now();
  const ratingArtifact = buildCfbV2TeamRatingArtifact({ season, asOfWeek, generatedAt, dataAsOf, records: ratings! });
  const projectionArtifact = buildCfbV2GameProjectionArtifact({ season, asOfWeek, generatedAt, dataAsOf, records: projections! });
  try {
    assertPublishableCfbV2Shadow({
      ratingArtifact,
      projectionArtifact,
      scoringSupportArtifact: scoringArtifact!,
      calibrationSupportArtifact: calibrationArtifact!,
      expectedConfigVersion: CFB_V2_CONFIG_VERSION,
    });
  } catch (error) {
    fail("cross-validate", error);
  }

  // ---- 7. compute hashes -------------------------------------------------------------
  const ratingsContentHash = computeCfbV2ArtifactContentHash(ratingArtifact.records as unknown as Record<string, unknown>[]);
  const projectionsContentHash = computeCfbV2ArtifactContentHash(projectionArtifact.records as unknown as Record<string, unknown>[]);
  const validationMs = Date.now() - validationStartedAt;

  const degradedFlags = computeCfbV2ShadowDegradedFlags({
    ratings: ratings!,
    currentSeasonSuccessObservationCount: 0,
    currentSeasonCompletedGameCount: completedCurrentSeasonGames.length,
    currentSeasonTalentRecordCount: talent!.length,
  });

  const ratingsArtifactPath = cfbV2TeamRatingArtifactPath(asOfWeek);
  const projectionsArtifactPath = cfbV2GameProjectionArtifactPath(asOfWeek);
  const manifest = buildCfbV2ShadowManifest({
    season,
    asOfWeek,
    dataAsOf,
    generatedAt,
    ratingArtifact,
    ratingsArtifactPath,
    ratingsContentHash,
    projectionArtifact,
    projectionsArtifactPath,
    projectionsContentHash,
    scoringSupportArtifact: scoringArtifact!,
    calibrationSupportArtifact: calibrationArtifact!,
    degradedFlags,
  });

  // ---- 8/9. write staging artifacts + promote manifest (atomic, all-or-nothing) ----
  let publishResult: ReturnType<typeof promoteCfbV2ShadowState>;
  try {
    publishResult = promoteCfbV2ShadowState(ROOT, {
      ratingsArtifactPath,
      ratingsArtifact: ratingArtifact,
      projectionsArtifactPath,
      projectionsArtifact: projectionArtifact,
      manifest,
    });
  } catch (error) {
    fail("promote", error);
  }

  // ---- 10. report status --------------------------------------------------------------
  const totalMs = Date.now() - totalStartedAt;
  console.log(`[cfb:v2:build-shadow] promoted: ratings=${publishResult!.ratingsPath} projections=${publishResult!.projectionsPath} manifest=${publishResult!.manifestPath}`);
  console.log(`[cfb:v2:build-shadow] degradedFlags: ${JSON.stringify(degradedFlags)}`);
  console.log(`[cfb:v2:build-shadow] priorTierCounts: ${JSON.stringify(manifest.summary.priorTierCounts)}`);
  console.log(`[cfb:v2:build-shadow] projections available=${manifest.summary.projectionsAvailable} unavailable=${manifest.summary.projectionsUnavailable} unsupportedMatchups=${manifest.summary.unsupportedMatchupCount}`);
  console.log(`[cfb:v2:build-shadow] ratingsContentHash=${ratingsContentHash} projectionsContentHash=${projectionsContentHash}`);
  console.log(`[cfb:v2:build-shadow] runtime: ratings=${ratingsMs}ms projections=${projectionsMs}ms validation+hash=${validationMs}ms total=${totalMs}ms`);
  console.log(`[cfb:v2:build-shadow] manifest path: ${cfbV2ManifestPath()}`);
}

main();
