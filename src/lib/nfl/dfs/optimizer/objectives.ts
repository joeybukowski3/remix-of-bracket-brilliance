/**
 * WU8 per-player, per-strategy objective scoring.
 *
 * A strategy score is a weighted mean of AVAILABLE normalized components on a
 * 0-100 scale. Missing components are never zero-filled: they are dropped, the
 * remaining policy weights are renormalized, and both the coverage and the
 * effective weights are reported. A player whose available weight falls below
 * MINIMUM_OBJECTIVE_COVERAGE keeps its optimizer eligibility and stays on the
 * board, but has no score for that strategy and cannot be selected for it.
 *
 * The DST slot never receives a fabricated fantasy projection: it contributes
 * the WU6C DST matchup percentile, already on the same 0-100 scale.
 */

import {
  LINEUP_STRATEGY_WEIGHTS,
  MINIMUM_OBJECTIVE_COVERAGE,
  OBJECTIVE_COMPONENT_LABELS,
  USAGE_ROLE_SUBWEIGHTS,
  DST_OBJECTIVE,
  type LineupStrategy,
  type ObjectiveComponent,
} from "@/lib/nfl/dfs/policies/lineupObjectivesV1";
import type { DstMatchup } from "@/lib/nfl/dfs/dstMatchup";
import type { ObjectiveComponentScore, PlayerStrategyScore } from "./contracts";
import { SUB_FEATURE_SOURCES, type NormalizedCandidate, type OffensivePosition, type SubFeature } from "./features";

type SubWeight = { feature: SubFeature; weight: number };

/**
 * How each objective component is assembled from normalized sub-features, per
 * position. An empty list means the component does not exist for that position
 * and its policy weight is redistributed across the components that do.
 */
function componentSubWeights(component: ObjectiveComponent, position: OffensivePosition): SubWeight[] {
  switch (component) {
    case "jkbProjection":
      return [{ feature: "jkbProjection", weight: 1 }];
    case "salaryEfficiency":
      return [{ feature: "pointsPer1k", weight: 1 }];
    case "matchup":
      return [{ feature: "matchupEdgeMean", weight: 1 }];
    case "scoringEnvironment":
      return [{ feature: "impliedTeamTotal", weight: 1 }];
    case "dkBenchmark":
      return [{ feature: "dkAvgPointsPerGame", weight: 1 }];
    case "upsideProxy":
      if (position === "RB") {
        return [
          { feature: "yardsPerCarry", weight: 0.5 },
          { feature: "touchesPerGame", weight: 0.5 },
        ];
      }
      if (position === "WR" || position === "TE") {
        return [
          { feature: "airYardsPerGame", weight: 0.5 },
          { feature: "targetShare", weight: 0.5 },
        ];
      }
      // No explosive-play evidence is published for QB.
      return [];
    case "workloadEvidence":
      if (position === "RB") return [{ feature: "touchesPerGame", weight: 1 }];
      if (position === "WR" || position === "TE") return [{ feature: "targetsPerGame", weight: 1 }];
      return [];
    case "usageRole": {
      const opportunity: SubWeight[] =
        position === "RB"
          ? [
              { feature: "projectedCarries", weight: USAGE_ROLE_SUBWEIGHTS.opportunity / 2 },
              { feature: "projectedTargets", weight: USAGE_ROLE_SUBWEIGHTS.opportunity / 2 },
            ]
          : position === "WR" || position === "TE"
            ? [{ feature: "projectedTargets", weight: USAGE_ROLE_SUBWEIGHTS.opportunity }]
            : // QB has no published passing-volume projection; rushing carries alone
              // would misrank pocket passers, so opportunity is treated as absent.
              [];
      return [...opportunity, { feature: "roleOrdinal", weight: USAGE_ROLE_SUBWEIGHTS.roleCertainty }];
    }
    default:
      return [];
  }
}

/** Composite value of one objective component, or null when nothing is available. */
function componentValue(
  candidate: NormalizedCandidate,
  component: ObjectiveComponent,
): { normalized: number | null; rawValue: number | null; detail: string } {
  const subWeights = componentSubWeights(component, candidate.position);
  if (subWeights.length === 0) {
    return { normalized: null, rawValue: null, detail: "Not published for " + candidate.position };
  }

  const available = subWeights.filter((sub) => candidate.percentile[sub.feature] != null);
  if (available.length === 0) {
    const missing = subWeights.map((sub) => SUB_FEATURE_SOURCES[sub.feature]).join("; ");
    return { normalized: null, rawValue: null, detail: "Unavailable: " + missing };
  }

  const totalWeight = available.reduce((sum, sub) => sum + sub.weight, 0);
  const normalized = available.reduce(
    (sum, sub) => sum + (candidate.percentile[sub.feature] as number) * (sub.weight / totalWeight),
    0,
  );
  const rawValue = subWeights.length === 1 ? candidate.raw[subWeights[0].feature] : null;
  const detail =
    available.map((sub) => SUB_FEATURE_SOURCES[sub.feature]).join("; ") +
    (available.length < subWeights.length ? " (partial; sub-weights renormalized)" : "");
  return { normalized, rawValue, detail };
}

/** Scores one offensive candidate for one strategy. */
export function scoreOffensiveCandidate(candidate: NormalizedCandidate, strategy: LineupStrategy): PlayerStrategyScore {
  const policy = LINEUP_STRATEGY_WEIGHTS[strategy];
  const entries = Object.entries(policy) as [ObjectiveComponent, number][];

  const evaluated = entries.map(([component, policyWeight]) => ({
    component,
    policyWeight,
    ...componentValue(candidate, component),
  }));

  const availableWeight = evaluated
    .filter((entry) => entry.normalized != null)
    .reduce((sum, entry) => sum + entry.policyWeight, 0);
  const scorable = availableWeight + 1e-9 >= MINIMUM_OBJECTIVE_COVERAGE;

  const components: ObjectiveComponentScore[] = evaluated.map((entry) => ({
    component: entry.component,
    label: OBJECTIVE_COMPONENT_LABELS[entry.component],
    rawValue: entry.rawValue,
    normalized: entry.normalized,
    policyWeight: entry.policyWeight,
    effectiveWeight: scorable && entry.normalized != null ? entry.policyWeight / availableWeight : 0,
    detail: entry.detail,
  }));

  const score = scorable
    ? components.reduce((sum, entry) => sum + (entry.normalized ?? 0) * entry.effectiveWeight, 0)
    : null;

  const missingComponents = evaluated.filter((entry) => entry.normalized == null).map((entry) => entry.component);

  return {
    strategy,
    score,
    componentCoverage: availableWeight,
    components,
    missingComponents,
    effectiveWeights: Object.fromEntries(
      components.filter((entry) => entry.effectiveWeight > 0).map((entry) => [entry.component, entry.effectiveWeight]),
    ),
    scorable,
    unavailableReason: scorable
      ? null
      : "Available objective weight " +
        Math.round(availableWeight * 100) +
        "% is below the " +
        Math.round(MINIMUM_OBJECTIVE_COVERAGE * 100) +
        "% minimum coverage required for a strategy score",
  };
}

/**
 * Scores one DST candidate. Identical for all three strategies: the WU6C DST
 * matchup percentile IS the DST objective. There is no JKB DST fantasy
 * projection and none is invented here.
 */
export function scoreDstCandidate(matchup: DstMatchup | null | undefined, strategy: LineupStrategy): PlayerStrategyScore {
  const percentile = matchup?.dstMatchupPercentile ?? null;
  const usable = matchup?.dstMatchupScore != null && percentile != null;

  const component: ObjectiveComponentScore = {
    component: DST_OBJECTIVE.component,
    label: DST_OBJECTIVE.label,
    rawValue: matchup?.dstMatchupScore ?? null,
    normalized: usable ? percentile : null,
    policyWeight: 1,
    effectiveWeight: usable ? 1 : 0,
    detail: usable
      ? DST_OBJECTIVE.definition
      : "DST matchup context is unavailable under the WU6C DST Matchup Score v1 coverage policy",
  };

  return {
    strategy,
    score: usable ? percentile : null,
    componentCoverage: usable ? 1 : 0,
    components: [component],
    missingComponents: usable ? [] : [DST_OBJECTIVE.component],
    effectiveWeights: usable ? { [DST_OBJECTIVE.component]: 1 } : {},
    scorable: usable,
    unavailableReason: usable ? null : "No usable WU6C DST matchup context",
  };
}
