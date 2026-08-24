// CFB Model V2 — WU7A §19 browser-artifact publisher. Reads the ALREADY-
// validated/promoted internal shadow state (manifest + ratings +
// projections, exactly what scripts/cfb-v2-audit-shadow.ts audits) and
// writes a compact, browser-safe JSON to public/data/cfb/v2/ — the SAME
// runtime-fetch convention every other sport in this repo already uses
// (public/data/{pga,mlb,nfl}/**, fetched via `fetch("/data/...")`,
// see e.g. src/hooks/useMlbBvpHistory.ts). This is NOT a second V2 build:
// it performs zero model computation, only a narrow re-shape of fields the
// app-side loader in src/data/cfb/v2/ actually needs (no confidence
// intervals, no per-row repeated version strings).
//
// Fails closed: refuses to publish (nonzero exit, no file written/changed)
// if the promoted state is INVALID per the same audit used elsewhere, so a
// broken shadow state can never reach the browser. A DEGRADED (e.g. honest
// preseason) state DOES publish — Stage 2 read-only consumption must be
// exercisable against the real, currently-degraded 2026 state.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { cfbV2ManifestPath } from "../src/lib/cfb/production/v2/artifactContracts";
import { CFB_V2_CONFIG_VERSION } from "../src/lib/cfb/production/v2/config";
import { cfbV2CalibrationResidualSeedPath, cfbV2ScoringNormalEquationsPath, type CfbV2CalibrationResidualSeedArtifact, type CfbV2ScoringNormalEquationsArtifact } from "../src/lib/cfb/production/v2/scoringSupportTypes";
import { auditCfbV2Shadow } from "../src/lib/cfb/production/v2/shadowAudit";
import type { CfbV2ArtifactEnvelope } from "../src/lib/cfb/production/v2/artifactContracts";
import type { CfbV2GameProjection, CfbV2TeamRating } from "../src/lib/cfb/production/v2/types";
import type { CfbV2ShadowManifest } from "../src/lib/cfb/production/v2/shadowManifest";

// Same test seam as scripts/cfb-v2-build-shadow.ts / cfb-v2-audit-shadow.ts.
const ROOT = process.env.CFB_V2_TEST_ROOT ? resolve(process.env.CFB_V2_TEST_ROOT) : resolve(import.meta.dirname, "..");

function parseArgs(argv: readonly string[]): { outPath: string } {
  const outArg = argv.find((a) => a.startsWith("--out="))?.split("=")[1];
  return { outPath: outArg ?? "public/data/cfb/v2/shadow-projections.json" };
}

function readJsonAt<T>(absolutePath: string): T {
  return JSON.parse(readFileSync(absolutePath, "utf8")) as T;
}

/** The exact compact row shape the browser loader (src/data/cfb/v2/shadowProjections.ts) expects — kept in sync manually, locked by tests on both sides. */
export type CfbV2PublicProjectionRow = {
  gameId: string;
  season: number;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  matchupPopulation: CfbV2GameProjection["matchupPopulation"];
  projectionStatus: CfbV2GameProjection["projectionStatus"];
  expectedHomePoints: number | null;
  expectedAwayPoints: number | null;
  projectedMargin: number | null;
  projectedTotal: number | null;
  homeWinProbability: number | null;
  awayWinProbability: number | null;
};

export type CfbV2PublicProjectionArtifact = {
  schemaVersion: "cfb-v2-public-projections-1";
  season: number;
  asOfWeek: number;
  dataAsOf: string;
  generatedAt: string;
  configVersion: string;
  modelVersion: string;
  scoringVersion: string;
  calibrationVersion: string;
  probabilityVersion: string;
  ratingsContentHash: string;
  projectionsContentHash: string;
  healthState: "HEALTHY" | "DEGRADED";
  degradedFlags: readonly string[];
  records: readonly CfbV2PublicProjectionRow[];
};

function toPublicRow(p: CfbV2GameProjection): CfbV2PublicProjectionRow {
  return {
    gameId: p.gameId,
    season: p.season,
    week: p.week,
    homeTeamId: p.homeTeamId,
    awayTeamId: p.awayTeamId,
    matchupPopulation: p.matchupPopulation,
    projectionStatus: p.projectionStatus,
    expectedHomePoints: p.expectedHomePoints,
    expectedAwayPoints: p.expectedAwayPoints,
    projectedMargin: p.projectedMargin,
    projectedTotal: p.projectedTotal,
    homeWinProbability: p.homeWinProbability,
    awayWinProbability: p.awayWinProbability,
  };
}

function main(): void {
  const { outPath } = parseArgs(process.argv.slice(2));

  let manifest: CfbV2ShadowManifest;
  let ratingArtifact: CfbV2ArtifactEnvelope<CfbV2TeamRating>;
  let projectionArtifact: CfbV2ArtifactEnvelope<CfbV2GameProjection>;
  let scoringSupportArtifact: CfbV2ScoringNormalEquationsArtifact;
  let calibrationSupportArtifact: CfbV2CalibrationResidualSeedArtifact;
  try {
    manifest = readJsonAt<CfbV2ShadowManifest>(resolve(ROOT, cfbV2ManifestPath()));
    ratingArtifact = readJsonAt<CfbV2ArtifactEnvelope<CfbV2TeamRating>>(resolve(ROOT, manifest.ratingsArtifactPath));
    projectionArtifact = readJsonAt<CfbV2ArtifactEnvelope<CfbV2GameProjection>>(resolve(ROOT, manifest.projectionsArtifactPath));
    scoringSupportArtifact = readJsonAt<CfbV2ScoringNormalEquationsArtifact>(resolve(ROOT, cfbV2ScoringNormalEquationsPath()));
    calibrationSupportArtifact = readJsonAt<CfbV2CalibrationResidualSeedArtifact>(resolve(ROOT, cfbV2CalibrationResidualSeedPath()));
  } catch (error) {
    console.error(`[cfb:v2:publish-browser-artifact] FAILED to load promoted shadow state: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  const audit = auditCfbV2Shadow({
    manifest,
    ratingArtifact,
    projectionArtifact,
    scoringSupportArtifact,
    calibrationSupportArtifact,
    expectedConfigVersion: CFB_V2_CONFIG_VERSION,
  });

  if (audit.healthState === "INVALID") {
    console.error(`[cfb:v2:publish-browser-artifact] refusing to publish — promoted state is INVALID:`);
    for (const issue of audit.issues) console.error(`  [${issue.severity}] ${issue.code}: ${issue.message}`);
    process.exit(1);
  }

  const publicArtifact: CfbV2PublicProjectionArtifact = {
    schemaVersion: "cfb-v2-public-projections-1",
    season: manifest.season,
    asOfWeek: manifest.asOfWeek,
    dataAsOf: manifest.dataAsOf,
    generatedAt: manifest.generatedAt,
    configVersion: manifest.configVersion,
    modelVersion: manifest.modelVersion,
    scoringVersion: manifest.scoringVersion,
    calibrationVersion: manifest.calibrationVersion,
    probabilityVersion: manifest.probabilityVersion,
    ratingsContentHash: manifest.ratingsContentHash,
    projectionsContentHash: manifest.projectionsContentHash,
    healthState: audit.healthState,
    degradedFlags: manifest.degradedFlags,
    records: projectionArtifact.records.map(toPublicRow),
  };

  const outAbsolute = resolve(ROOT, outPath);
  mkdirSync(dirname(outAbsolute), { recursive: true });
  writeFileSync(outAbsolute, `${JSON.stringify(publicArtifact, null, 2)}\n`, "utf8");
  console.log(`[cfb:v2:publish-browser-artifact] healthState=${audit.healthState} records=${publicArtifact.records.length} wrote ${outPath}`);
}

main();
