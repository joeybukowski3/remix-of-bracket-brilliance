import { MIN_CALIBRATION_ROWS } from "./config";
import type { CfbTotalCalibrationMethod, LinearCoefficients } from "./types";

export type CalibrationTrainingRow = { rawTotal: number; actualTotal: number; season: number; week: number };

function fitLinear(rows: readonly { x: number; y: number }[]): LinearCoefficients {
  const n = rows.length;
  if (n === 0) return { intercept: 0, slope: 1 };
  const meanX = rows.reduce((s, r) => s + r.x, 0) / n;
  const meanY = rows.reduce((s, r) => s + r.y, 0) / n;
  let cov = 0;
  let varX = 0;
  for (const r of rows) {
    cov += (r.x - meanX) * (r.y - meanY);
    varX += (r.x - meanX) ** 2;
  }
  if (varX < 1e-9) return { intercept: meanY, slope: 0 };
  const slope = cov / varX;
  const intercept = meanY - slope * meanX;
  return { intercept, slope };
}

function weekSegment(week: number): "1-4" | "5-8" | "9+" {
  return week <= 4 ? "1-4" : week <= 8 ? "5-8" : "9+";
}

/**
 * Fits total-mean calibration for one prediction's cutoff, using ONLY
 * `trainingRows` (caller must have already filtered to season < current
 * OR (season == current AND week < current) — same discipline as
 * Phase 2-4). Falls back to a coarser pool (Section 9-style fallback
 * hierarchy, same spirit as Phase 3's prior tiers) when the requested
 * method's own bucket has too few rows.
 */
export function fitTotalCalibration(
  trainingRows: readonly CalibrationTrainingRow[],
  method: CfbTotalCalibrationMethod,
  currentSeason: number,
  currentWeek: number,
): LinearCoefficients {
  if (method === "NONE") return { intercept: 0, slope: 1 };

  const pooled = fitLinear(trainingRows.map((r) => ({ x: r.rawTotal, y: r.actualTotal })));
  if (method === "LINEAR" || method === "VARIANCE_AWARE") return pooled;

  if (method === "SEASON_AWARE") {
    const seasonRows = trainingRows.filter((r) => r.season === currentSeason);
    return seasonRows.length >= MIN_CALIBRATION_ROWS ? fitLinear(seasonRows.map((r) => ({ x: r.rawTotal, y: r.actualTotal }))) : pooled;
  }

  // WEEK_SEGMENT_AWARE: prefer same-season+same-segment, then same-season, then pooled.
  const segment = weekSegment(currentWeek);
  const seasonSegmentRows = trainingRows.filter((r) => r.season === currentSeason && weekSegment(r.week) === segment);
  if (seasonSegmentRows.length >= MIN_CALIBRATION_ROWS) {
    return fitLinear(seasonSegmentRows.map((r) => ({ x: r.rawTotal, y: r.actualTotal })));
  }
  const seasonRows = trainingRows.filter((r) => r.season === currentSeason);
  if (seasonRows.length >= MIN_CALIBRATION_ROWS) {
    return fitLinear(seasonRows.map((r) => ({ x: r.rawTotal, y: r.actualTotal })));
  }
  return pooled;
}

export function applyCalibration(rawValue: number, coefficients: LinearCoefficients): number {
  return coefficients.intercept + coefficients.slope * rawValue;
}
