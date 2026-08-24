// CFB Model V2 — production game-projection shadow generator (WU3 §29).
// Loads WU2's existing rating artifact + the 2026 schedule + WU3A's frozen
// support artifacts, builds CfbV2GameProjection[], validates fail-closed,
// writes a shadow artifact under data/generated/cfb/v2/. Does NOT wire the
// artifact into any UI/loader or touch any V1/V1.1 file. SHADOW MODE ONLY.
//
// LIMITATIONS carried forward from WU3 (documented, not silently absorbed):
//   - No production /plays ingestion yet -> currentSeasonSuccessObservations
//     is always [] until a future work unit wires it (§8/§28).
//   - No production source for actual completed-game point totals wired up
//     yet (needed for BLENDED_CURRENT's previousSeasonMean/allPriorSeasonsMean
//     scoring-environment inputs) -> both are passed as null here. Since
//     SUCCESS is unavailable for every 2026 game anyway (zero completed
//     games), this does not change which games are marked available: every
//     FBS-vs-FBS game in the 2026 preseason schedule is correctly reported
//     "unavailable" by construction, honestly reflecting that the validated
//     Phase 9 architecture itself never predicts a team's very first game of
//     a season (SUCCESS requires at least one prior completed game).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCfbV2GameProjections, type CfbV2ScheduleGame } from "../src/lib/cfb/production/v2/buildGameProjections";
import { writeCfbV2GameProjectionArtifact, buildCfbV2GameProjectionArtifact } from "../src/lib/cfb/production/v2/projectionArtifactWriter";
import { validateCfbV2GameProjections } from "../src/lib/cfb/production/v2/projectionValidation";
import { cfbV2PreseasonRatingsPath } from "../src/lib/cfb/production/v2/artifactContracts";
import { CFB_V2_CONFIG_VERSION } from "../src/lib/cfb/production/v2/config";
import { cfbV2CalibrationResidualSeedPath, cfbV2ScoringNormalEquationsPath, type CfbV2CalibrationResidualSeedArtifact, type CfbV2ScoringNormalEquationsArtifact } from "../src/lib/cfb/production/v2/scoringSupportTypes";
import { validateCfbV2CalibrationResidualSeed, validateCfbV2ScoringNormalEquations } from "../src/lib/cfb/production/v2/scoringSupportValidation";
import type { CfbV2ArtifactEnvelope } from "../src/lib/cfb/production/v2/artifactContracts";
import type { CfbV2TeamRating } from "../src/lib/cfb/production/v2/types";

const ROOT = resolve(import.meta.dirname, "..");

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

function main(): void {
  const { season, asOfWeek, schedulePath } = parseArgs(process.argv.slice(2));
  console.log(`[cfb:v2:build-projections] season=${season} asOfWeek=${asOfWeek} schedule=${schedulePath}`);

  const ratingArtifact = JSON.parse(readFileSync(resolve(ROOT, cfbV2PreseasonRatingsPath()), "utf8")) as CfbV2ArtifactEnvelope<CfbV2TeamRating>;
  const scoringArtifact = JSON.parse(readFileSync(resolve(ROOT, cfbV2ScoringNormalEquationsPath()), "utf8")) as CfbV2ScoringNormalEquationsArtifact;
  const calibrationArtifact = JSON.parse(readFileSync(resolve(ROOT, cfbV2CalibrationResidualSeedPath()), "utf8")) as CfbV2CalibrationResidualSeedArtifact;
  const rawSchedule = JSON.parse(readFileSync(resolve(ROOT, schedulePath), "utf8")) as RawScheduleGame[];

  // §22 support-artifact integrity — fail closed before doing anything else.
  validateCfbV2ScoringNormalEquations(scoringArtifact, CFB_V2_CONFIG_VERSION);
  validateCfbV2CalibrationResidualSeed(calibrationArtifact, CFB_V2_CONFIG_VERSION);
  if (ratingArtifact.configVersion !== CFB_V2_CONFIG_VERSION) {
    throw new Error(`rating artifact configVersion mismatch: expected ${CFB_V2_CONFIG_VERSION}, got ${ratingArtifact.configVersion}`);
  }
  if (ratingArtifact.season !== season) throw new Error(`rating artifact season ${ratingArtifact.season} does not match requested season ${season}`);
  console.log(`[cfb:v2:build-projections] support artifacts verified: scoring=${scoringArtifact.artifactVersion} calibration=${calibrationArtifact.artifactVersion} rating=${ratingArtifact.schemaVersion}`);

  const scheduleGames: CfbV2ScheduleGame[] = rawSchedule
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

  const teamRatingsByTeamId = new Map(ratingArtifact.records.map((r) => [r.teamId, r]));
  const generatedAt = new Date().toISOString();
  const dataAsOfIso = ratingArtifact.dataAsOf;

  const startedAt = Date.now();
  const projections = buildCfbV2GameProjections({
    season,
    dataAsOf: { season, week: 1 }, // preseason: strictly before every game of the season (week 1's own games are never "before week 1")
    dataAsOfIso,
    generatedAt,
    scheduleGames,
    teamRatingsByTeamId,
    scoringArtifact,
    calibrationArtifact,
    // Carried-forward limitations — see file header.
    currentSeasonSuccessObservations: [],
    currentSeasonCompletedGameScores: [],
    previousSeasonMean: null,
    allPriorSeasonsMean: null,
    currentSeasonCalibrationRows: [],
  });
  const buildMs = Date.now() - startedAt;

  validateCfbV2GameProjections(projections);
  console.log(`[cfb:v2:build-projections] validated ${projections.length} projections in ${buildMs}ms`);

  const artifact = buildCfbV2GameProjectionArtifact({ season, asOfWeek, generatedAt, dataAsOf: dataAsOfIso, records: projections });
  const relativePath = writeCfbV2GameProjectionArtifact(ROOT, artifact);
  console.log(`[cfb:v2:build-projections] wrote shadow artifact to ${relativePath}`);

  const byPopulation = new Map<string, number>();
  const byStatus = new Map<string, number>();
  for (const p of projections) {
    byPopulation.set(p.matchupPopulation, (byPopulation.get(p.matchupPopulation) ?? 0) + 1);
    byStatus.set(p.projectionStatus, (byStatus.get(p.projectionStatus) ?? 0) + 1);
  }
  console.log(`[cfb:v2:build-projections] matchupPopulation distribution: ${JSON.stringify(Object.fromEntries(byPopulation))}`);
  console.log(`[cfb:v2:build-projections] projectionStatus distribution: ${JSON.stringify(Object.fromEntries(byStatus))}`);

  const computed = projections.filter((p) => p.projectionStatus === "computed");
  if (computed.length > 0) {
    const probs = computed.map((p) => p.homeWinProbability as number);
    const margins = computed.map((p) => p.projectedMargin as number);
    const totals = computed.map((p) => p.projectedTotal as number);
    console.log(`[cfb:v2:build-projections] homeWinProbability range: [${Math.min(...probs)}, ${Math.max(...probs)}]`);
    console.log(`[cfb:v2:build-projections] projectedMargin range: [${Math.min(...margins)}, ${Math.max(...margins)}]`);
    console.log(`[cfb:v2:build-projections] projectedTotal range: [${Math.min(...totals)}, ${Math.max(...totals)}]`);
  } else {
    console.log(`[cfb:v2:build-projections] zero computed projections — honest preseason behavior: SUCCESS is unavailable for every team until at least one completed 2026 game exists (§8/§28), so every FBS-vs-FBS game is correctly reported unavailable, not fabricated. 2026 talent inputs are also currently unavailable, so WU2 ratings are predominantly PRIOR_A rather than full PRIOR_D — see [cfb:v2:build-ratings]'s own priorTier distribution log.`);
  }
}

main();
