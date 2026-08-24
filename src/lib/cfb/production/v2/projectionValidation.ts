// CFB Model V2 — fail-fast validation for CfbV2GameProjection[] (WU3 §23).
// Zero runtime dependency on src/lib/cfb/research/**.

import type { CfbV2GameProjection } from "./types";

export class CfbV2ProjectionValidationError extends Error {}

const PROBABILITY_TOLERANCE = 1e-6;
const IDENTITY_TOLERANCE = 1e-6;

function requireFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new CfbV2ProjectionValidationError(`${label} is not finite: ${value}`);
}

function requireClose(a: number, b: number, label: string): void {
  if (Math.abs(a - b) > IDENTITY_TOLERANCE) throw new CfbV2ProjectionValidationError(`${label} mismatch: ${a} vs ${b} (diff ${Math.abs(a - b)})`);
}

function requireIntervalOrdered(interval: [number, number], label: string): void {
  requireFinite(interval[0], `${label}[0]`);
  requireFinite(interval[1], `${label}[1]`);
  if (interval[0] > interval[1]) throw new CfbV2ProjectionValidationError(`${label} bounds are out of order: [${interval[0]}, ${interval[1]}]`);
}

/** Validates one projection row. Throws on the first violation (§23 — no partial misleading artifact). */
export function validateCfbV2GameProjection(row: CfbV2GameProjection): void {
  if (row.matchupPopulation !== "fbs_vs_fbs") {
    if (row.projectionStatus !== "unavailable") {
      throw new CfbV2ProjectionValidationError(`${row.gameId}: matchupPopulation=${row.matchupPopulation} is unsupported but projectionStatus=${row.projectionStatus} (must be "unavailable")`);
    }
    if (row.expectedHomePoints !== null || row.expectedAwayPoints !== null || row.homeWinProbability !== null || row.awayWinProbability !== null) {
      throw new CfbV2ProjectionValidationError(`${row.gameId}: unsupported matchupPopulation must not carry any fabricated model output`);
    }
    return;
  }

  if (row.projectionStatus === "unavailable") {
    if (row.expectedHomePoints !== null || row.expectedAwayPoints !== null) {
      throw new CfbV2ProjectionValidationError(`${row.gameId}: projectionStatus=unavailable must not carry expected points`);
    }
    return;
  }

  // projectionStatus === "computed" AND matchupPopulation === "fbs_vs_fbs" — every field below is required.
  const { expectedHomePoints, expectedAwayPoints, projectedMargin, projectedTotal, homeWinProbability, awayWinProbability } = row;
  if (expectedHomePoints === null || expectedAwayPoints === null || projectedMargin === null || projectedTotal === null || homeWinProbability === null || awayWinProbability === null) {
    throw new CfbV2ProjectionValidationError(`${row.gameId}: projectionStatus=computed but a required field is null`);
  }

  requireFinite(expectedHomePoints, `${row.gameId}.expectedHomePoints`);
  requireFinite(expectedAwayPoints, `${row.gameId}.expectedAwayPoints`);
  requireClose(expectedHomePoints - expectedAwayPoints, projectedMargin, `${row.gameId} margin identity`);
  requireClose(expectedHomePoints + expectedAwayPoints, projectedTotal, `${row.gameId} total identity`);

  if (homeWinProbability < 0 || homeWinProbability > 1) throw new CfbV2ProjectionValidationError(`${row.gameId}: homeWinProbability out of [0,1]: ${homeWinProbability}`);
  if (awayWinProbability < 0 || awayWinProbability > 1) throw new CfbV2ProjectionValidationError(`${row.gameId}: awayWinProbability out of [0,1]: ${awayWinProbability}`);
  if (Math.abs(homeWinProbability + awayWinProbability - 1) > PROBABILITY_TOLERANCE) {
    throw new CfbV2ProjectionValidationError(`${row.gameId}: homeWinProbability + awayWinProbability != 1 (${homeWinProbability + awayWinProbability})`);
  }

  for (const [label, interval] of [
    ["marginInterval50", row.marginInterval50],
    ["marginInterval80", row.marginInterval80],
    ["marginInterval90", row.marginInterval90],
    ["marginInterval95", row.marginInterval95],
    ["totalInterval50", row.totalInterval50],
    ["totalInterval80", row.totalInterval80],
    ["totalInterval90", row.totalInterval90],
    ["totalInterval95", row.totalInterval95],
  ] as const) {
    if (interval === null) throw new CfbV2ProjectionValidationError(`${row.gameId}: ${label} is null but projectionStatus=computed`);
    requireIntervalOrdered(interval, `${row.gameId}.${label}`);
  }
}

export function validateCfbV2GameProjections(rows: readonly CfbV2GameProjection[]): void {
  const seenGameIds = new Set<string>();
  for (const row of rows) {
    if (seenGameIds.has(row.gameId)) throw new CfbV2ProjectionValidationError(`duplicate gameId in projection artifact: ${row.gameId}`);
    seenGameIds.add(row.gameId);
    validateCfbV2GameProjection(row);
  }
}
