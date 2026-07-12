/**
 * Pure deterministic Absolute Score engine (Phase 1).
 *
 * Invariants:
 *  - Identical inputs + identical versions (registry, model, range artifact)
 *    produce identical output. The engine never sees the slate, so slate
 *    composition cannot move a score.
 *  - Contributions sum exactly to the unrounded score (float-sum order is
 *    fixed; displayed score is the unrounded score rounded to 1 decimal).
 *  - Lower-is-better metrics are inverted via registry directionality, so a
 *    higher contribution always means stronger support for the outcome.
 *  - Missing values substitute the neutral normalized midpoint (0.5) and are
 *    flagged; remaining weights are NEVER renormalized (unlike the current
 *    production HR score, which drops-and-renormalizes).
 *  - No negative weights; active weights must total exactly 100.
 *  - No browser, React, network, or filesystem dependencies. Side-effect free.
 *
 * The output is a 0–100 weighted-evidence index. It is NOT a probability.
 */

import { activeWeightedMetricKeys, validateModelConfig } from "./modelConfig";
import { getRangeEntry } from "./referenceRanges";
import type {
  MetricContribution,
  MetricDefinition,
  ModelConfig,
  ReferenceRangeArtifact,
  ScoreEngineInput,
  ScoreResult,
} from "./types";

/** Neutral normalized value substituted for missing metrics (0–1 scale). */
export const NEUTRAL_NORMALIZED_VALUE = 0.5;

/** Documented rounding: displayed scores round the exact sum to 1 decimal. */
export const SCORE_DISPLAY_DECIMALS = 1;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function roundScore(value: number): number {
  return Number(value.toFixed(SCORE_DISPLAY_DECIMALS));
}

/**
 * Normalize a raw value to [0,1] using the metric's versioned fixed range,
 * inverting for lower-is-better metrics.
 */
function normalizeFixedRange(
  metric: MetricDefinition,
  rawValue: number,
  artifact: ReferenceRangeArtifact,
): number {
  const rangeKey = metric.normalization.rangeKey;
  const range = rangeKey ? getRangeEntry(artifact, rangeKey) : null;
  if (!range) {
    throw new Error(
      `Score engine: metric "${metric.key}" has no range "${rangeKey}" in artifact "${artifact.artifactVersion}"`,
    );
  }
  const scaled = clamp01((rawValue - range.min) / (range.max - range.min));
  return metric.normalization.direction === "lower-better" ? 1 - scaled : scaled;
}

function sampleAdequacy(
  metric: MetricDefinition,
  sampleSize: number | null,
): number {
  const policy = metric.confidencePolicy;
  if (!policy) return 1;
  if (sampleSize == null || !Number.isFinite(sampleSize)) return 1;
  if (sampleSize >= policy.fullSample) return 1;
  if (sampleSize <= policy.floorSample) return 0;
  return (sampleSize - policy.floorSample) / (policy.fullSample - policy.floorSample);
}

export interface ScoreEngineContext {
  metrics: MetricDefinition[];
  model: ModelConfig;
  rangeArtifact: ReferenceRangeArtifact;
  registryVersion: string;
}

/**
 * Validate the (registry, model, artifact) triple once per slate/run; throws
 * so an invalid configuration can never silently produce scores.
 */
export function assertScoreContextValid(context: ScoreEngineContext): void {
  const modelResult = validateModelConfig(context.model, context.metrics);
  if (!modelResult.valid) {
    throw new Error(`Score engine: invalid model — ${modelResult.errors.join("; ")}`);
  }
  if (context.model.scoreVersion !== context.rangeArtifact.scoreVersion) {
    throw new Error(
      `Score engine: model scoreVersion "${context.model.scoreVersion}" does not match artifact scoreVersion "${context.rangeArtifact.scoreVersion}"`,
    );
  }
  for (const key of activeWeightedMetricKeys(context.model)) {
    const metric = context.metrics.find((m) => m.key === key);
    if (!metric) throw new Error(`Score engine: model references unknown metric "${key}"`);
    if (metric.normalization.method !== "fixed-range") {
      throw new Error(
        `Score engine: metric "${key}" uses unimplemented normalization "${metric.normalization.method}"`,
      );
    }
    const rangeKey = metric.normalization.rangeKey ?? "";
    if (!getRangeEntry(context.rangeArtifact, rangeKey)) {
      throw new Error(`Score engine: no reference range for metric "${key}"`);
    }
  }
}

/**
 * Score one row. Pure and slate-independent by construction: the only
 * inputs are this row's raw values and the versioned context.
 */
export function scoreRow(context: ScoreEngineContext, input: ScoreEngineInput): ScoreResult {
  const { metrics, model, rangeArtifact } = context;
  const inapplicable = new Set(input.inapplicableMetricKeys ?? []);
  const activeKeys = activeWeightedMetricKeys(model);

  const contributions: MetricContribution[] = [];
  const missingMetricKeys: string[] = [];
  const substitutedMetricKeys: string[] = [];

  let scoreSum = 0;
  let realWeight = 0;
  let confidenceSum = 0;

  for (const key of activeKeys) {
    const metric = metrics.find((m) => m.key === key);
    if (!metric) throw new Error(`Score engine: unknown metric "${key}"`);
    const weight = model.weights?.[key] ?? 0;

    const rawCandidate = input.rawValues[key];
    const rawValue =
      typeof rawCandidate === "number" && Number.isFinite(rawCandidate) ? rawCandidate : null;
    const sampleCandidate = input.sampleSizes?.[key];
    const sampleSize =
      typeof sampleCandidate === "number" && Number.isFinite(sampleCandidate)
        ? sampleCandidate
        : null;

    let normalized01: number;
    let substituted = false;
    let substitutionReason: MetricContribution["substitutionReason"] = null;

    if (inapplicable.has(key)) {
      // A verified inapplicable context (e.g. weather under a closed roof)
      // is a real neutral, not missing: no completeness penalty.
      normalized01 = NEUTRAL_NORMALIZED_VALUE;
      substitutionReason = "inapplicable-context";
    } else if (rawValue == null) {
      normalized01 = NEUTRAL_NORMALIZED_VALUE;
      substituted = true;
      substitutionReason = "missing-value";
      missingMetricKeys.push(key);
      substitutedMetricKeys.push(key);
    } else {
      normalized01 = normalizeFixedRange(metric, rawValue, rangeArtifact);
    }

    const contributionPoints = weight * normalized01;
    scoreSum += contributionPoints;

    const backedByRealValue = !substituted;
    if (backedByRealValue) realWeight += weight;

    const adequacy = backedByRealValue ? sampleAdequacy(metric, sampleSize) : 0;
    confidenceSum += weight * adequacy;

    contributions.push({
      metricKey: key,
      rawValue,
      normalizedValue: Number((normalized01 * 100).toFixed(2)),
      direction: metric.normalization.direction,
      weight,
      contributionPoints,
      maxContributionPoints: weight,
      sampleSize,
      minSample: metric.confidencePolicy?.floorSample ?? metric.minSample ?? null,
      sampleAdequacy: adequacy,
      substituted,
      substitutionReason,
      confidenceContribution: (weight * adequacy) / 100,
    });
  }

  const completenessPercent = Number(realWeight.toFixed(2));
  const confidencePercent = Number(confidenceSum.toFixed(2));
  const suppressed = completenessPercent < model.completenessFloorPercent;

  return {
    status: suppressed ? "suppressed" : "ok",
    absoluteScore: suppressed ? null : roundScore(scoreSum),
    absoluteScoreUnrounded: suppressed ? null : scoreSum,
    contributions,
    completenessPercent,
    confidencePercent,
    missingMetricKeys,
    substitutedMetricKeys,
    scoreVersion: model.scoreVersion,
    registryVersion: context.registryVersion,
    modelId: model.modelId,
    modelVersion: model.modelVersion,
  };
}
