// CFB Model V2 — shadow-state audit CLI (WU6 §2). Reads the currently
// promoted shadow state (manifest.json + the artifacts it points at, plus
// the frozen support artifacts) and prints a deterministic validation
// summary. Read-only: never mutates any artifact. Exits non-zero on an
// INVALID health state (or if the state cannot even be loaded) so CI can
// gate on it; exits 0 for HEALTHY and DEGRADED (degraded/preseason is not
// a failure — see shadowAudit.ts's health-state rationale).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { cfbV2ManifestPath } from "../src/lib/cfb/production/v2/artifactContracts";
import { CFB_V2_CONFIG_VERSION } from "../src/lib/cfb/production/v2/config";
import { cfbV2CalibrationResidualSeedPath, cfbV2ScoringNormalEquationsPath, type CfbV2CalibrationResidualSeedArtifact, type CfbV2ScoringNormalEquationsArtifact } from "../src/lib/cfb/production/v2/scoringSupportTypes";
import { auditCfbV2Shadow, type CfbV2ShadowAuditResult } from "../src/lib/cfb/production/v2/shadowAudit";
import { diffCfbV2Shadow, type CfbV2ShadowDiffResult } from "../src/lib/cfb/production/v2/shadowDiff";
import type { CfbV2ArtifactEnvelope } from "../src/lib/cfb/production/v2/artifactContracts";
import type { CfbV2GameProjection, CfbV2TeamRating } from "../src/lib/cfb/production/v2/types";
import type { CfbV2ShadowManifest } from "../src/lib/cfb/production/v2/shadowManifest";

// Same test seam as scripts/cfb-v2-build-shadow.ts — unset in every real
// invocation, so production behavior (including the default path) is
// unchanged.
const ROOT = process.env.CFB_V2_TEST_ROOT ? resolve(process.env.CFB_V2_TEST_ROOT) : resolve(import.meta.dirname, "..");

function parseArgs(argv: readonly string[]): { previousDir: string | null; outPath: string } {
  const previousArg = argv.find((a) => a.startsWith("--previous="))?.split("=")[1] ?? null;
  const outArg = argv.find((a) => a.startsWith("--out="))?.split("=")[1];
  return { previousDir: previousArg, outPath: outArg ?? "data/generated/cfb/v2/audit-summary.json" };
}

function readJsonAt<T>(absolutePath: string): T {
  return JSON.parse(readFileSync(absolutePath, "utf8")) as T;
}

type LoadedSnapshot = {
  manifest: CfbV2ShadowManifest;
  ratingArtifact: CfbV2ArtifactEnvelope<CfbV2TeamRating>;
  projectionArtifact: CfbV2ArtifactEnvelope<CfbV2GameProjection>;
};

function loadSnapshot(dirAbsolute: string): LoadedSnapshot {
  const manifest = readJsonAt<CfbV2ShadowManifest>(resolve(dirAbsolute, "manifest.json"));
  const ratingArtifact = readJsonAt<CfbV2ArtifactEnvelope<CfbV2TeamRating>>(resolve(ROOT, manifest.ratingsArtifactPath));
  const projectionArtifact = readJsonAt<CfbV2ArtifactEnvelope<CfbV2GameProjection>>(resolve(ROOT, manifest.projectionsArtifactPath));
  return { manifest, ratingArtifact, projectionArtifact };
}

function printAudit(result: CfbV2ShadowAuditResult): void {
  console.log(`[cfb:v2:audit-shadow] healthState=${result.healthState}`);
  console.log(`[cfb:v2:audit-shadow] manifest: season=${result.manifest.season} asOfWeek=${result.manifest.asOfWeek} pipelineStatus=${result.manifest.pipelineStatus} generatedAt=${result.manifest.generatedAt} dataAsOf=${result.manifest.dataAsOf}`);
  console.log(`[cfb:v2:audit-shadow] versions: model=${result.manifest.modelVersion} scoring=${result.manifest.scoringVersion} calibration=${result.manifest.calibrationVersion} probability=${result.manifest.probabilityVersion} config=${result.manifest.configVersion}`);
  console.log(`[cfb:v2:audit-shadow] hashes: ratings=${result.manifest.ratingsContentHash} projections=${result.manifest.projectionsContentHash}`);
  console.log(`[cfb:v2:audit-shadow] degradedFlags: ${JSON.stringify(result.manifest.degradedFlags)}`);
  console.log(`[cfb:v2:audit-shadow] ratings: total=${result.ratings.totalTeams} priorTiers=${JSON.stringify(result.ratings.priorTierCounts)} duplicates=${result.ratings.duplicateTeamIds.length}`);
  console.log(`[cfb:v2:audit-shadow] ratings: overallRating min/median/max=${JSON.stringify(result.ratings.overallRating)}`);
  console.log(`[cfb:v2:audit-shadow] ratings: componentSize=${JSON.stringify(result.ratings.componentSizeDistribution)}`);
  console.log(`[cfb:v2:audit-shadow] ratings: regularizationMultiplier=${JSON.stringify(result.ratings.regularizationMultiplierDistribution)}`);
  console.log(`[cfb:v2:audit-shadow] projections: total=${result.projections.totalRecords} population=${JSON.stringify(result.projections.matchupPopulationCounts)} status=${JSON.stringify(result.projections.projectionStatusCounts)}`);
  console.log(`[cfb:v2:audit-shadow] projections: unavailableFbsVsFbs=${result.projections.unavailableFbsVsFbsCount} duplicateGameIds=${result.projections.duplicateGameIds.length}`);
  if (result.issues.length === 0) {
    console.log(`[cfb:v2:audit-shadow] issues: none`);
  } else {
    for (const issue of result.issues) console.log(`[cfb:v2:audit-shadow] issue[${issue.severity}] ${issue.code}: ${issue.message}`);
  }
}

function printDiff(diff: CfbV2ShadowDiffResult): void {
  console.log(`[cfb:v2:audit-shadow] diff: comparedTeams=${diff.ratings.comparedTeamCount} medianAbsMovement=${diff.ratings.medianAbsoluteMovement.toFixed(4)}`);
  console.log(`[cfb:v2:audit-shadow] diff: priorTierTransitions=${diff.ratings.priorTierTransitions.length} componentSizeChanges=${diff.ratings.componentSizeChanges.length}`);
  console.log(`[cfb:v2:audit-shadow] diff: largest rating movers: ${JSON.stringify(diff.ratings.largestMovers.slice(0, 5).map((m) => ({ teamId: m.teamId, delta: Number(m.absoluteDelta.toFixed(4)) })))}`);
  console.log(`[cfb:v2:audit-shadow] diff: comparedGames=${diff.projections.comparedGameCount} availabilityTransitions=${diff.projections.availabilityTransitions.length}`);
  console.log(`[cfb:v2:audit-shadow] diff: largest margin movers: ${JSON.stringify(diff.projections.largestMarginMovers.slice(0, 5).map((m) => ({ gameId: m.gameId, delta: m.marginDelta === null ? null : Number(m.marginDelta.toFixed(2)) })))}`);
}

function main(): void {
  const { previousDir, outPath } = parseArgs(process.argv.slice(2));

  let current: LoadedSnapshot;
  let scoringSupportArtifact: CfbV2ScoringNormalEquationsArtifact;
  let calibrationSupportArtifact: CfbV2CalibrationResidualSeedArtifact;
  try {
    current = loadSnapshot(resolve(ROOT, dirname(cfbV2ManifestPath())));
    scoringSupportArtifact = readJsonAt<CfbV2ScoringNormalEquationsArtifact>(resolve(ROOT, cfbV2ScoringNormalEquationsPath()));
    calibrationSupportArtifact = readJsonAt<CfbV2CalibrationResidualSeedArtifact>(resolve(ROOT, cfbV2CalibrationResidualSeedPath()));
  } catch (error) {
    console.error(`[cfb:v2:audit-shadow] FAILED to load promoted shadow state: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  const result = auditCfbV2Shadow({
    manifest: current.manifest,
    ratingArtifact: current.ratingArtifact,
    projectionArtifact: current.projectionArtifact,
    scoringSupportArtifact,
    calibrationSupportArtifact,
    expectedConfigVersion: CFB_V2_CONFIG_VERSION,
  });
  printAudit(result);

  let diff: CfbV2ShadowDiffResult | null = null;
  if (previousDir) {
    try {
      const previous = loadSnapshot(resolve(previousDir));
      diff = diffCfbV2Shadow(
        { ratings: previous.ratingArtifact.records, projections: previous.projectionArtifact.records },
        { ratings: current.ratingArtifact.records, projections: current.projectionArtifact.records },
      );
      printDiff(diff);
    } catch (error) {
      console.warn(`[cfb:v2:audit-shadow] could not load --previous=${previousDir} for comparison: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const outAbsolute = resolve(ROOT, outPath);
  mkdirSync(dirname(outAbsolute), { recursive: true });
  writeFileSync(outAbsolute, `${JSON.stringify({ result, diff }, null, 2)}\n`, "utf8");
  console.log(`[cfb:v2:audit-shadow] wrote audit summary to ${outPath}`);

  if (result.healthState === "INVALID") {
    console.error(`[cfb:v2:audit-shadow] healthState=INVALID — exiting non-zero`);
    process.exit(1);
  }
}

main();
