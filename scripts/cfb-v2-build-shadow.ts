// CFB Model V2 — shadow build orchestrator (WU4 §10, extended WU5 §12/§13).
// Orchestrates the existing WU2 rating generator and WU3 projection
// generator against ONE shared in-memory rating state (never two
// separately-generated files that could silently diverge), cross-validates
// the pair, computes content hashes, and only then atomically promotes
// ratings + projections + a new manifest.json together. On any failure,
// the previous last-known-good manifest/artifacts are left completely
// untouched and failure diagnostics are written to a separate file. SHADOW
// MODE ONLY — no UI wiring, no V1 mutation (WU4 §11: this operates on
// whatever raw CFBD caches already exist on disk under
// data/cfb/cfbd/raw/, refreshed by `npm run cfb:fetch-data`).
//
// WU5 adds real current-season input wiring: completed-game scores, plays-
// derived SUCCESS observations, and a best-effort current-season
// calibration-row append — all filtered to games strictly before asOfWeek
// (§7 "no future leakage"). See buildCurrentSeasonCalibrationRows's own
// header comment for a documented limitation on that last piece.
//
// LIMITATIONS carried forward:
//   - previousSeasonMean/allPriorSeasonsMean are still passed as null —
//     no production source for historical completed-game point totals is
//     wired up yet. This only matters before the FIRST current-season game
//     completes (estimateCfbV2ScoringEnvironment falls back to
//     currentSeasonSoFarMean once currentSeasonCompletedGameScores is
//     non-empty, per scoringEnvironment.ts's own precedence).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCfbV2TeamRatings } from "../src/lib/cfb/production/v2/buildTeamRatings";
import { buildCfbV2TeamRatingArtifact, cfbV2TeamRatingArtifactPath } from "../src/lib/cfb/production/v2/artifactWriter";
import { validateCfbV2TeamRatings } from "../src/lib/cfb/production/v2/ratingValidation";
import type { CfbdGame, CfbdGameTeamStats, CfbdReturningProduction, CfbdTalent, CfbdTeam } from "../src/lib/cfb/production/v2/ratingInputs";
import { buildCfbV2GameProjections, type CfbV2ScheduleGame } from "../src/lib/cfb/production/v2/buildGameProjections";
import { buildCfbV2GameProjectionArtifact, cfbV2GameProjectionArtifactPath } from "../src/lib/cfb/production/v2/projectionArtifactWriter";
import { validateCfbV2GameProjections } from "../src/lib/cfb/production/v2/projectionValidation";
import { CFB_V2_CONFIG_VERSION, CFB_V2_SCORING_CONFIG } from "../src/lib/cfb/production/v2/config";
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
import { deriveCfbV2SuccessObservations, type CfbV2RawPlay } from "../src/lib/cfb/production/v2/successDerivation";
import { getJkbTeamIdForCfbdName } from "@/data/cfb/externalTeamMapping";
import { computeCfbV2TeamSuccessSoFar, type CfbV2TeamGameSuccessObservation } from "../src/lib/cfb/production/v2/successFeature";
import { estimateCfbV2ScoringEnvironment } from "../src/lib/cfb/production/v2/scoringEnvironment";
import { buildCfbV2CurrentSeasonCalibrationRows } from "../src/lib/cfb/production/v2/currentSeasonCalibration";

// WU5 checkpoint — smallest possible test seam for the required-input
// fail-closed branch: CFB_V2_TEST_ROOT, when set, overrides the repo root
// this orchestrator reads/writes under (raw cache, schedule, support
// artifacts, generated shadow output all move together). Unset in every
// real invocation (npm scripts, the GHA workflow), so production behavior
// — including the default path — is completely unchanged.
const ROOT = process.env.CFB_V2_TEST_ROOT ? resolve(process.env.CFB_V2_TEST_ROOT) : resolve(import.meta.dirname, "..");
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
  let rawPlays: CfbV2RawPlay[];
  try {
    teams = readJson<CfbdTeam[]>(`teams-${season}`);
    currentSeasonGames = readJson<CfbdGame[]>(`games-${season}`);
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

  // WU5 §15 — required-vs-optional current-season input semantics: once
  // completed games exist strictly before the cutoff, game-team stats and
  // plays for those weeks become REQUIRED (missing => fail closed, never
  // silently publish a new state built on incomplete current-season data).
  // Before any completed game exists, both remain optional/degradable,
  // exactly matching WU4's original honest-preseason behavior.
  const eligibleCompletedGames = currentSeasonGames!.filter((g) => g.completed && g.week < asOfWeek);
  try {
    if (eligibleCompletedGames.length > 0) {
      currentSeasonTeamGameStats = readJson<CfbdGameTeamStats[]>(`game-team-stats-${season}`);
      rawPlays = readJson<CfbV2RawPlay[]>(`plays-${season}`);
    } else {
      currentSeasonTeamGameStats = readOptionalJson<CfbdGameTeamStats[]>(`game-team-stats-${season}`, []);
      rawPlays = readOptionalJson<CfbV2RawPlay[]>(`plays-${season}`, []);
    }
  } catch (error) {
    fail(
      "load-required-current-season-inputs",
      new Error(`${eligibleCompletedGames.length} completed game(s) exist before asOfWeek=${asOfWeek}, but required current-season game-team-stats/plays could not be read: ${error instanceof Error ? error.message : String(error)}`),
    );
  }

  // ---- 2/3. build + validate V2 ratings -------------------------------------------
  const completedCurrentSeasonGames = currentSeasonGames!.filter((g) => g.completed);
  const dataAsOf =
    completedCurrentSeasonGames.length > 0
      ? completedCurrentSeasonGames.map((g) => g.startDate).sort().at(-1)!
      : priorSeasonGames!.filter((g) => g.completed).map((g) => g.startDate).sort().at(-1)!;

  let ratings: ReturnType<typeof buildCfbV2TeamRatings>;
  const ratingsStartedAt = Date.now();
  try {
    ratings = buildCfbV2TeamRatings({
      season,
      dataAsOf,
      generatedAt,
      asOfWeek,
      teams: teams!,
      currentSeasonGames: currentSeasonGames!,
      currentSeasonTeamGameStats: currentSeasonTeamGameStats!,
      priorSeasonGames: priorSeasonGames!,
      priorSeasonTeamGameStats: priorSeasonTeamGameStats!,
      returningProduction: returningProduction!,
      talent: talent!,
    });
    const expectedFbsTeamIds = new Set(ratings.map((r) => r.teamId));
    validateCfbV2TeamRatings(ratings, expectedFbsTeamIds);
  } catch (error) {
    fail("build-ratings", error);
  }
  const ratingsMs = Date.now() - ratingsStartedAt;
  console.log(`[cfb:v2:build-shadow] built+validated ${ratings!.length} ratings in ${ratingsMs}ms`);

  // ---- WU5 — derive current-season SUCCESS, completed scores, calibration rows ----
  const successStartedAt = Date.now();
  const eligibleGameIds = new Set(eligibleCompletedGames.map((g) => g.id));
  const eligiblePlays = rawPlays!.filter((p) => eligibleGameIds.has(p.gameId));
  const currentSeasonSuccessObservations: CfbV2TeamGameSuccessObservation[] = deriveCfbV2SuccessObservations(eligiblePlays);
  const successByTeam = computeCfbV2TeamSuccessSoFar(currentSeasonSuccessObservations);

  const currentSeasonCompletedGameScores = eligibleCompletedGames
    .filter((g) => typeof g.homePoints === "number" && typeof g.awayPoints === "number")
    .map((g) => ({ homePoints: g.homePoints as number, awayPoints: g.awayPoints as number }));
  const successMs = Date.now() - successStartedAt;
  console.log(`[cfb:v2:build-shadow] derived ${currentSeasonSuccessObservations.length} SUCCESS observations from ${eligiblePlays.length} eligible plays (${eligibleCompletedGames.length} eligible completed games) in ${successMs}ms`);

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

  // WU5 — projection cutoff now tracks the real asOfWeek (clamped to a
  // minimum of 1: the frozen historical support artifacts' earliest/only
  // 2026 entry lives at week=1, and selectCfbV2ScoringSnapshot requires a
  // cutoff >= that entry's week to find it at all). At asOfWeek=0
  // (preseason) this is identical to WU4's original hardcoded `week: 1`.
  const projectionCutoff = { season, week: Math.max(asOfWeek, 1) };

  const currentSeasonScores = currentSeasonCompletedGameScores.flatMap((g) => [g.homePoints, g.awayPoints]);
  const currentSeasonSoFarMean = currentSeasonScores.length === 0 ? null : currentSeasonScores.reduce((s, v) => s + v, 0) / currentSeasonScores.length;
  const scoringEnvironmentEstimate = estimateCfbV2ScoringEnvironment(
    { allPriorSeasonsMean: null, previousSeasonMean: null, currentSeasonSoFarMean, currentSeasonGamesSoFar: currentSeasonCompletedGameScores.length },
    CFB_V2_SCORING_CONFIG.priorGamesWeight,
  );

  const calibrationEligibleGames: { gameId: string; season: number; week: number; homeTeamId: string; awayTeamId: string; homePoints: number; awayPoints: number }[] = [];
  for (const g of eligibleCompletedGames) {
    if (typeof g.homePoints !== "number" || typeof g.awayPoints !== "number") continue;
    const homeTeamId = getJkbTeamIdForCfbdName(g.homeTeam);
    const awayTeamId = getJkbTeamIdForCfbdName(g.awayTeam);
    if (!homeTeamId || !awayTeamId) continue; // unresolved team name — skip rather than fabricate
    calibrationEligibleGames.push({ gameId: String(g.id), season: g.season, week: g.week, homeTeamId, awayTeamId, homePoints: g.homePoints, awayPoints: g.awayPoints });
  }

  let currentSeasonCalibrationRows: ReturnType<typeof buildCfbV2CurrentSeasonCalibrationRows>;
  try {
    currentSeasonCalibrationRows = buildCfbV2CurrentSeasonCalibrationRows({
      games: calibrationEligibleGames,
      teamRatingsByTeamId,
      scoringArtifact: scoringArtifact!,
      successByTeam,
      scoringEnvironmentEstimate,
      dataAsOf: projectionCutoff,
    });
  } catch (error) {
    fail("build-current-season-calibration-rows", error);
  }

  let projections: ReturnType<typeof buildCfbV2GameProjections>;
  const projectionsStartedAt = Date.now();
  try {
    projections = buildCfbV2GameProjections({
      season,
      dataAsOf: projectionCutoff,
      dataAsOfIso: dataAsOf,
      generatedAt,
      scheduleGames,
      teamRatingsByTeamId,
      scoringArtifact: scoringArtifact!,
      calibrationArtifact: calibrationArtifact!,
      currentSeasonSuccessObservations,
      currentSeasonCompletedGameScores,
      previousSeasonMean: null,
      allPriorSeasonsMean: null,
      currentSeasonCalibrationRows,
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
    currentSeasonSuccessObservationCount: currentSeasonSuccessObservations.length,
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
  console.log(`[cfb:v2:build-shadow] runtime: ratings=${ratingsMs}ms success=${successMs}ms projections=${projectionsMs}ms validation+hash=${validationMs}ms total=${totalMs}ms`);
  console.log(`[cfb:v2:build-shadow] manifest path: ${cfbV2ManifestPath()}`);
}

main();
