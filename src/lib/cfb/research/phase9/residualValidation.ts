import { computeDistributionStats, pearsonCorrelation } from "../phase5/residualStats";
import type { CalibratedPrediction } from "../phase5/types";

/** Section 11 — residual diagnostics on Phase 9's own (baseline or finalist) calibrated predictions, reusing Phase 5's distribution-stats functions verbatim. */
export function buildResidualValidation(calibrated: readonly CalibratedPrediction[]) {
  const homeResiduals = calibrated.map((c) => c.actualHomePoints - c.calibratedExpectedHome);
  const awayResiduals = calibrated.map((c) => c.actualAwayPoints - c.calibratedExpectedAway);
  const marginResiduals = calibrated.map((c) => c.actualMargin - c.calibratedProjectedMargin);
  const totalResiduals = calibrated.map((c) => c.actualTotal - c.calibratedProjectedTotal);

  return {
    home: computeDistributionStats(homeResiduals),
    away: computeDistributionStats(awayResiduals),
    homeAwayCorrelation: pearsonCorrelation(homeResiduals, awayResiduals),
    margin: computeDistributionStats(marginResiduals),
    total: computeDistributionStats(totalResiduals),
  };
}
