// CFB Model V2 — fail-fast validation for the compact historical scoring
// support artifacts (WU3A §17). Zero research runtime dependency.

import type { CfbV2CalibrationResidualSeedArtifact, CfbV2ScoringNormalEquationsArtifact } from "./scoringSupportTypes";
import { CFB_V2_CALIBRATION_RESIDUAL_ARTIFACT_VERSION, CFB_V2_SCORING_NORMAL_EQUATIONS_ARTIFACT_VERSION } from "./scoringSupportTypes";

export class CfbV2SupportValidationError extends Error {}

const ARITHMETIC_TOLERANCE = 1e-6;

function requireFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new CfbV2SupportValidationError(`${label} is not finite: ${value}`);
}

function requireClose(a: number, b: number, label: string): void {
  if (Math.abs(a - b) > ARITHMETIC_TOLERANCE) {
    throw new CfbV2SupportValidationError(`${label} arithmetic mismatch: ${a} vs ${b} (diff ${Math.abs(a - b)})`);
  }
}

function validateEnvelope(
  envelope: { schemaVersion: string; artifactVersion: string; marketFree: boolean; configVersion: string; recordCount: number; records: readonly unknown[]; generatedAt: string },
  expectedArtifactVersion: string,
  expectedConfigVersion: string | undefined,
): void {
  if (!envelope.schemaVersion) throw new CfbV2SupportValidationError("missing schemaVersion");
  if (envelope.artifactVersion !== expectedArtifactVersion) {
    throw new CfbV2SupportValidationError(`provenance mismatch: expected artifactVersion ${expectedArtifactVersion}, got ${envelope.artifactVersion}`);
  }
  if (envelope.marketFree !== true) {
    throw new CfbV2SupportValidationError("marketFree assertion is absent or false");
  }
  if (expectedConfigVersion !== undefined && envelope.configVersion !== expectedConfigVersion) {
    throw new CfbV2SupportValidationError(`config hash mismatch: expected ${expectedConfigVersion}, got ${envelope.configVersion} — artifact is stale relative to the running production config`);
  }
  if (envelope.recordCount !== envelope.records.length) {
    throw new CfbV2SupportValidationError(`recordCount (${envelope.recordCount}) does not match records.length (${envelope.records.length})`);
  }
  if (Number.isNaN(Date.parse(envelope.generatedAt))) {
    throw new CfbV2SupportValidationError(`unparseable generatedAt: ${envelope.generatedAt}`);
  }
  if (envelope.records.length === 0) {
    throw new CfbV2SupportValidationError("artifact has zero records");
  }
}

/** MARKET_FIELD_PATTERN — proves no market-derived field name ever appears on a row (§9 contamination guard). */
const MARKET_FIELD_PATTERN = /spread|moneyline|\bline\b|provider|openingtotal|currenttotal|\bmic\b|marketanchor/i;

function assertNoMarketFields(row: Record<string, unknown>, label: string): void {
  for (const key of Object.keys(row)) {
    if (MARKET_FIELD_PATTERN.test(key)) {
      throw new CfbV2SupportValidationError(`${label} contains a market-derived field name: ${key}`);
    }
  }
}

export function validateCfbV2ScoringNormalEquations(artifact: CfbV2ScoringNormalEquationsArtifact, expectedConfigVersion?: string): void {
  validateEnvelope(artifact, CFB_V2_SCORING_NORMAL_EQUATIONS_ARTIFACT_VERSION, expectedConfigVersion);

  const seen = new Set<string>();
  let previousKey: [number, number] = [-Infinity, -Infinity];
  for (const row of artifact.records) {
    assertNoMarketFields(row, `scoring snapshot ${row.season}/wk${row.week}`);

    const key = `${row.season}:${row.week}`;
    if (seen.has(key)) throw new CfbV2SupportValidationError(`duplicate scoring snapshot cutoff: ${key}`);
    seen.add(key);

    if (!Number.isInteger(row.season) || !Number.isInteger(row.week)) {
      throw new CfbV2SupportValidationError(`scoring snapshot ${key} has non-integer season/week — missing chronology`);
    }
    if (!Array.isArray(row.featureNames) || row.featureNames.length === 0) {
      throw new CfbV2SupportValidationError(`scoring snapshot ${key} has empty/missing featureNames`);
    }
    const n = row.featureNames.length;
    if (!Array.isArray(row.ata) || row.ata.length !== n || row.ata.some((r) => !Array.isArray(r) || r.length !== n)) {
      throw new CfbV2SupportValidationError(`scoring snapshot ${key} has an ata matrix that does not match featureNames.length (${n})`);
    }
    if (!Array.isArray(row.atb) || row.atb.length !== n) {
      throw new CfbV2SupportValidationError(`scoring snapshot ${key} has an atb vector that does not match featureNames.length (${n})`);
    }
    for (let i = 0; i < n; i += 1) {
      requireFinite(row.atb[i], `${key}.atb[${i}]`);
      for (let j = 0; j < n; j += 1) {
        requireFinite(row.ata[i][j], `${key}.ata[${i}][${j}]`);
        // ata is X'X, always exactly symmetric by construction — asymmetry means the artifact is corrupt, not just imprecise.
        if (row.ata[i][j] !== row.ata[j][i]) {
          throw new CfbV2SupportValidationError(`scoring snapshot ${key} has a non-symmetric ata matrix at [${i}][${j}] (${row.ata[i][j]} vs [${j}][${i}]=${row.ata[j][i]})`);
        }
      }
    }
    if (!Number.isInteger(row.usableRowCount) || row.usableRowCount < 0) {
      throw new CfbV2SupportValidationError(`scoring snapshot ${key} has an invalid usableRowCount: ${row.usableRowCount}`);
    }

    const currentKey: [number, number] = [row.season, row.week];
    if (currentKey[0] < previousKey[0] || (currentKey[0] === previousKey[0] && currentKey[1] < previousKey[1])) {
      throw new CfbV2SupportValidationError(`scoring snapshots are not chronologically sorted at ${key} (${currentKey.join("/")} after ${previousKey.join("/")})`);
    }
    previousKey = currentKey;
  }
}

export function validateCfbV2CalibrationResidualSeed(artifact: CfbV2CalibrationResidualSeedArtifact, expectedConfigVersion?: string): void {
  validateEnvelope(artifact, CFB_V2_CALIBRATION_RESIDUAL_ARTIFACT_VERSION, expectedConfigVersion);

  const seen = new Set<string>();
  let previousKey: [number, number] = [-Infinity, -Infinity];
  for (const row of artifact.records) {
    assertNoMarketFields(row, `calibration row ${row.gameId}`);

    if (seen.has(row.gameId)) throw new CfbV2SupportValidationError(`duplicate calibration row gameId: ${row.gameId}`);
    seen.add(row.gameId);

    if (!Number.isInteger(row.season) || !Number.isInteger(row.week)) {
      throw new CfbV2SupportValidationError(`calibration row ${row.gameId} has non-integer season/week — missing chronology`);
    }

    for (const [label, value] of [
      ["rawExpectedHomePoints", row.rawExpectedHomePoints],
      ["rawExpectedAwayPoints", row.rawExpectedAwayPoints],
      ["calibratedExpectedHomePoints", row.calibratedExpectedHomePoints],
      ["calibratedExpectedAwayPoints", row.calibratedExpectedAwayPoints],
      ["actualHomePoints", row.actualHomePoints],
      ["actualAwayPoints", row.actualAwayPoints],
    ] as const) {
      requireFinite(value, `${row.gameId}.${label}`);
    }

    requireClose(row.rawExpectedHomePoints + row.rawExpectedAwayPoints, row.rawProjectedTotal, `${row.gameId} rawTotal identity`);
    requireClose(row.rawExpectedHomePoints - row.rawExpectedAwayPoints, row.rawProjectedMargin, `${row.gameId} rawMargin identity`);
    requireClose(row.calibratedExpectedHomePoints + row.calibratedExpectedAwayPoints, row.calibratedTotal, `${row.gameId} calibratedTotal identity`);
    requireClose(row.calibratedExpectedHomePoints - row.calibratedExpectedAwayPoints, row.rawProjectedMargin, `${row.gameId} margin-preserved identity (TOTAL_ONLY never re-calibrates margin)`);
    requireClose(row.actualHomePoints + row.actualAwayPoints, row.actualTotal, `${row.gameId} actualTotal mismatch`);
    requireClose(row.actualHomePoints - row.calibratedExpectedHomePoints, row.homeResidual, `${row.gameId} homeResidual arithmetic mismatch`);
    requireClose(row.actualAwayPoints - row.calibratedExpectedAwayPoints, row.awayResidual, `${row.gameId} awayResidual arithmetic mismatch`);

    const currentKey: [number, number] = [row.season, row.week];
    if (currentKey[0] < previousKey[0] || (currentKey[0] === previousKey[0] && currentKey[1] < previousKey[1])) {
      throw new CfbV2SupportValidationError(`calibration rows are not chronologically sorted at ${row.gameId}`);
    }
    previousKey = currentKey;
  }
}
