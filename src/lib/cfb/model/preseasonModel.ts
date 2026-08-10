/**
 * JKB CFB preseason rating model.
 *
 * offensiveBase = f(priorOffensivePerformance, returningOffensiveProduction, qbContinuity)
 * defensiveBase = f(priorDefensivePerformance, returningDefensiveProduction)
 * powerBase     = f(offensiveBase, defensiveBase)
 *
 * All weights come from CFB_MODEL_CONFIG — nothing here is a magic number.
 *
 * Missing-input handling: each base is a weighted sum of whichever of its
 * components are available. When a component is unavailable, its weight is
 * NOT applied as if the value were zero — instead the remaining available
 * components are reweighted proportionally so they still sum to 1. A base is
 * null only when every one of its components is unavailable.
 *
 * Defensive inputs (yards/points allowed) are lower-is-better on their native
 * scale; they are negated before weighting so every base stays "higher = better."
 *
 * This module produces RAW ratings only (arbitrary internal scale, comparable
 * only to each other). Converting raw → 0-100 display ratings (jkbPowerRating,
 * offensiveRating, defensiveRating) is a separate step — see computeDisplayRatings,
 * which normalizes across a full slate of raw ratings via normalize.ts.
 */

import { CFB_MODEL_CONFIG } from "./config";
import { generateRanks } from "./rank";
import { normalizeToDisplayScale } from "./normalize";
import type {
  CfbDisplayTeamRating,
  CfbPreseasonModelInputs,
  CfbRatingBreakdown,
  CfbRatingComponentContribution,
  CfbRawTeamRating,
} from "./types";

type WeightedComponent = { component: string; rawValue: number | null; baseWeight: number };

/**
 * Weighted sum over whichever components have a non-null rawValue, reweighting
 * the available components' weights to sum to 1. Returns null if none are available.
 */
function computeReweightedBase(
  components: WeightedComponent[],
): { value: number; breakdown: CfbRatingComponentContribution[] } | null {
  const available = components.filter(
    (c): c is WeightedComponent & { rawValue: number } => c.rawValue !== null,
  );
  if (available.length === 0) return null;

  const availableWeightSum = available.reduce((sum, c) => sum + c.baseWeight, 0);
  // If every available component happens to carry zero configured weight
  // (e.g. only the reserved roster/coaching slots had data), fall back to
  // an equal split so the data isn't silently discarded.
  const useEqualSplit = availableWeightSum <= 0;
  const equalWeight = 1 / available.length;

  const breakdown: CfbRatingComponentContribution[] = available.map((c) => {
    const appliedWeight = useEqualSplit ? equalWeight : c.baseWeight / availableWeightSum;
    return {
      component: c.component,
      rawValue: c.rawValue,
      appliedWeight,
      weightedContribution: c.rawValue * appliedWeight,
    };
  });

  const value = breakdown.reduce((sum, c) => sum + c.weightedContribution, 0);
  return { value, breakdown };
}

function firstContribution(
  breakdown: CfbRatingComponentContribution[] | undefined,
  component: string,
): CfbRatingComponentContribution | null {
  return breakdown?.find((c) => c.component === component) ?? null;
}

function computeQbContinuityValue(
  returningQuarterback: boolean | null,
): number | null {
  if (returningQuarterback === null) return null;
  const bonus = CFB_MODEL_CONFIG.quarterbackContinuityBonus;
  return returningQuarterback ? bonus.returningStarterBonus : bonus.newStarterPenalty;
}

function computeReturningProductionValue(
  side: "offense" | "defense",
  inputs: CfbPreseasonModelInputs["returningProduction"],
): number | null {
  if (!inputs) return null;
  const pct =
    side === "offense"
      ? inputs.returningOffensiveProductionPct
      : inputs.returningDefensiveProductionPct;
  return pct;
}

/** Computes raw offensive/defensive/power ratings and a full contribution breakdown for one team. */
export function computeRawTeamRating(inputs: CfbPreseasonModelInputs): CfbRawTeamRating {
  const prior = inputs.priorPerformance;
  const opponentAdjusted = inputs.opponentAdjusted;

  // Prefer opponent-adjusted efficiency when available; fall back to raw prior performance.
  const priorOffensiveValue =
    opponentAdjusted?.opponentAdjustedOffensiveEfficiency ?? prior?.offensiveYardsPerPlay ?? null;
  const priorDefensiveRawValue =
    opponentAdjusted?.opponentAdjustedDefensiveEfficiency ??
    prior?.defensiveYardsPerPlayAllowed ??
    null;
  // Defensive "allowed" metrics are lower-is-better; negate so higher = better.
  const priorDefensiveValue = priorDefensiveRawValue === null ? null : -priorDefensiveRawValue;

  const offensiveComponents: WeightedComponent[] = [
    {
      component: "priorPerformance",
      rawValue: priorOffensiveValue,
      baseWeight: CFB_MODEL_CONFIG.offensiveBaseWeights.priorPerformanceWeight,
    },
    {
      component: "returningProduction",
      rawValue: computeReturningProductionValue("offense", inputs.returningProduction),
      baseWeight: CFB_MODEL_CONFIG.offensiveBaseWeights.returningProductionWeight,
    },
    {
      component: "qbContinuity",
      rawValue: computeQbContinuityValue(inputs.returningProduction?.returningQuarterback ?? null),
      baseWeight: CFB_MODEL_CONFIG.offensiveBaseWeights.quarterbackContinuityWeight,
    },
  ];

  const defensiveComponents: WeightedComponent[] = [
    {
      component: "priorPerformance",
      rawValue: priorDefensiveValue,
      baseWeight: CFB_MODEL_CONFIG.defensiveBaseWeights.priorPerformanceWeight,
    },
    {
      component: "returningProduction",
      rawValue: computeReturningProductionValue("defense", inputs.returningProduction),
      baseWeight: CFB_MODEL_CONFIG.defensiveBaseWeights.returningProductionWeight,
    },
  ];

  const offensiveResult = computeReweightedBase(offensiveComponents);
  const defensiveResult = computeReweightedBase(defensiveComponents);

  const powerComponents: WeightedComponent[] = [
    {
      component: "offensiveBase",
      rawValue: offensiveResult?.value ?? null,
      baseWeight: CFB_MODEL_CONFIG.powerBaseWeights.offensiveBaseWeight,
    },
    {
      component: "defensiveBase",
      rawValue: defensiveResult?.value ?? null,
      baseWeight: CFB_MODEL_CONFIG.powerBaseWeights.defensiveBaseWeight,
    },
  ];
  const powerResult = computeReweightedBase(powerComponents);

  const breakdown: CfbRatingBreakdown = {
    teamId: inputs.teamId,
    priorPerformanceContribution: firstContribution(offensiveResult?.breakdown, "priorPerformance"),
    returningProductionContribution: firstContribution(
      offensiveResult?.breakdown,
      "returningProduction",
    ),
    qbContinuityContribution: firstContribution(offensiveResult?.breakdown, "qbContinuity"),
    rosterTalentContribution: null,
    coachingContinuityContribution: null,
    offensiveBaseContribution: firstContribution(powerResult?.breakdown, "offensiveBase"),
    defensiveBaseContribution: firstContribution(powerResult?.breakdown, "defensiveBase"),
  };

  const status: CfbRawTeamRating["status"] =
    offensiveResult === null && defensiveResult === null ? "insufficient-data" : "computed";

  return {
    teamId: inputs.teamId,
    rawOffensiveRating: offensiveResult?.value ?? null,
    rawDefensiveRating: defensiveResult?.value ?? null,
    rawPowerRating: powerResult?.value ?? null,
    breakdown,
    status,
  };
}

export function computeRawRatingsForTeams(
  inputsList: ReadonlyArray<CfbPreseasonModelInputs>,
): CfbRawTeamRating[] {
  return inputsList.map(computeRawTeamRating);
}

/**
 * Normalizes a full slate of raw ratings to 0-100-ish display ratings and
 * generates jkbRank from the resulting jkbPowerRating. Each of offense/
 * defense/power is normalized independently against its own distribution
 * across the supplied teams.
 */
export function computeDisplayRatings(
  rawRatings: ReadonlyArray<CfbRawTeamRating>,
): CfbDisplayTeamRating[] {
  const scale = CFB_MODEL_CONFIG.normalization.displayScale;

  const offensiveDisplay = normalizeToDisplayScale(
    rawRatings.map((r) => r.rawOffensiveRating),
    scale,
  );
  const defensiveDisplay = normalizeToDisplayScale(
    rawRatings.map((r) => r.rawDefensiveRating),
    scale,
  );
  const powerDisplay = normalizeToDisplayScale(
    rawRatings.map((r) => r.rawPowerRating),
    scale,
  );

  const ranks = generateRanks(
    rawRatings.map((r, i) => ({ teamId: r.teamId, value: powerDisplay[i] })),
    "desc",
  );

  return rawRatings.map((r, i) => ({
    teamId: r.teamId,
    jkbOffensiveRating: offensiveDisplay[i],
    jkbDefensiveRating: defensiveDisplay[i],
    jkbPowerRating: powerDisplay[i],
    jkbRank: ranks.get(r.teamId) ?? null,
  }));
}
