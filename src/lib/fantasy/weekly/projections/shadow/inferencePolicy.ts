import { featureValue } from "../model/featureSets";
import { getFrozenModelAuthority, WEEKLY_FANTASY_PROJECTION_MODEL_VERSION } from "../model/frozenSpec";
import type { FantasyPosition } from "@/lib/fantasy/rankings";
import type { WeeklyFantasyProjectionTrainingRow } from "../contract";

/**
 * DEPLOYMENT/INFERENCE GOVERNANCE ONLY. This module decides WHEN the already
 * -frozen `weekly-fantasy-projection-v1` residual model is allowed to
 * contribute to a scored row; it never alters that frozen spec's family,
 * features, alpha, or promotion state (`frozenSpec.ts` is imported
 * read-only, for `getFrozenModelAuthority(...).features` only). Kept in its
 * own tracked, versioned module -- deliberately separate from `frozenSpec.ts`
 * -- so a future inference-policy change never requires touching, or being
 * confused with, a frozen research decision.
 */

export const WEEKLY_FANTASY_PROJECTION_INFERENCE_POLICY_VERSION =
  "weekly-fantasy-projection-inference-v1" as const;

export type InferencePolicyAuthority = {
  inferencePolicyVersion: typeof WEEKLY_FANTASY_PROJECTION_INFERENCE_POLICY_VERSION;
  modelVersion: typeof WEEKLY_FANTASY_PROJECTION_MODEL_VERSION;
  week1Authority: "baseline-only";
  learnedResidualActivation: "any-selected-non-baseline-feature-observed";
};

const INFERENCE_POLICIES: Readonly<Record<string, InferencePolicyAuthority>> = {
  [WEEKLY_FANTASY_PROJECTION_INFERENCE_POLICY_VERSION]: Object.freeze({
    inferencePolicyVersion: WEEKLY_FANTASY_PROJECTION_INFERENCE_POLICY_VERSION,
    modelVersion: WEEKLY_FANTASY_PROJECTION_MODEL_VERSION,
    week1Authority: "baseline-only",
    learnedResidualActivation: "any-selected-non-baseline-feature-observed",
  }),
};

/** Fails closed (throws) for any unknown inference-policy version rather than silently falling back. */
export function getInferencePolicy(version: string): InferencePolicyAuthority {
  const policy = INFERENCE_POLICIES[version];
  if (!policy) throw new Error(`Unknown weekly fantasy projection inference policy version "${version}".`);
  return policy;
}

export function getCurrentInferencePolicy(): InferencePolicyAuthority {
  return getInferencePolicy(WEEKLY_FANTASY_PROJECTION_INFERENCE_POLICY_VERSION);
}

/** Fail-closed, explicit reason enum -- never a free-form string. */
export type ResidualActivationReason =
  | "model-state-baseline-only"
  | "no-selected-current-season-features-observed"
  | "selected-current-season-feature-observed";

export type ResidualActivationResult = { activated: boolean; reason: ResidualActivationReason };

/**
 * Evaluates `learnedResidualActivation` for a RB/WR/TE row. "Observed" means
 * the frozen feature contract's `featureValue()` returns a real, present
 * value for at least one of the position's selected non-baseline features --
 * never a missingness indicator (there is no indicator column read here at
 * all, only the raw feature values themselves), never a fallback/baseline
 * substitution (baseline fields are not in `spec.features` for these
 * positions to begin with), and never target-week stats/snaps/participation
 * (the row's `...SeasonPrior`/`...Last3`/`team...Prior` fields are already
 * strictly N-1-safe by construction -- see `build.ts`/`buildTrainingRow`).
 */
export function evaluateResidualActivation(
  position: Exclude<FantasyPosition, "QB">,
  row: WeeklyFantasyProjectionTrainingRow,
): ResidualActivationResult {
  const spec = getFrozenModelAuthority(WEEKLY_FANTASY_PROJECTION_MODEL_VERSION, position);
  const observed = spec.features.some((feature) => featureValue(row, feature) != null);
  return observed
    ? { activated: true, reason: "selected-current-season-feature-observed" }
    : { activated: false, reason: "no-selected-current-season-features-observed" };
}
