/**
 * Model configuration contract + validation (Phase 1).
 *
 * Supports default JKB models, curated presets (weighted or rules-based),
 * and future browser-local user models. Phase 1 ships validation and the
 * internal HR bridge model only — no model-builder UI.
 */

import type { MetricDefinition, ModelConfig, ValidationResult } from "./types";

/** Active weighted models must total exactly 100 (within float tolerance). */
export const WEIGHT_TOTAL = 100;
const WEIGHT_EPSILON = 1e-6;

export function validateModelConfig(
  model: ModelConfig,
  metrics: MetricDefinition[],
): ValidationResult {
  const errors: string[] = [];
  const at = `model "${model.modelId}"`;

  if (!model.modelId) errors.push("modelId is required");
  if (!model.name) errors.push(`${at}: name is required`);
  if (!["hr", "k", "hits", "ml"].includes(model.market)) {
    errors.push(`${at}: invalid market "${model.market}"`);
  }
  if (!["weighted", "rules", "hybrid"].includes(model.modelType)) {
    errors.push(`${at}: invalid modelType`);
  }
  if (!["jkb-default", "curated", "user"].includes(model.origin)) {
    errors.push(`${at}: invalid origin`);
  }
  if (!model.modelVersion) errors.push(`${at}: modelVersion is required`);
  if (!model.scoreVersion) errors.push(`${at}: scoreVersion is required`);
  if (!model.registryVersion) errors.push(`${at}: registryVersion is required`);
  if (
    !Number.isFinite(model.completenessFloorPercent) ||
    model.completenessFloorPercent < 0 ||
    model.completenessFloorPercent > 100
  ) {
    errors.push(`${at}: completenessFloorPercent must be within 0–100`);
  }

  const needsWeights = model.modelType === "weighted" || model.modelType === "hybrid";
  if (needsWeights) {
    errors.push(...validateWeights(model, metrics));
  } else if (model.weights && Object.keys(model.weights).length > 0) {
    errors.push(`${at}: rules-only models must not carry a weight vector`);
  }

  return { valid: errors.length === 0, errors };
}

function validateWeights(model: ModelConfig, metrics: MetricDefinition[]): string[] {
  const errors: string[] = [];
  const at = `model "${model.modelId}"`;
  const weights = model.weights;
  if (!weights || Object.keys(weights).length === 0) {
    return [`${at}: weighted model requires a weight vector`];
  }

  let total = 0;
  for (const [key, weight] of Object.entries(weights)) {
    if (!Number.isFinite(weight)) {
      errors.push(`${at}: weight for "${key}" is not finite`);
      continue;
    }
    if (weight < 0) {
      errors.push(`${at}: negative weight for "${key}" is not allowed`);
      continue;
    }
    const metric = metrics.find((m) => m.key === key);
    if (!metric) {
      errors.push(`${at}: unknown metric "${key}"`);
      continue;
    }
    if (!metric.weightable || metric.informationalOnly) {
      errors.push(`${at}: metric "${key}" is not weightable`);
    }
    if (!metric.markets.includes(model.market)) {
      errors.push(`${at}: metric "${key}" is not declared for market "${model.market}"`);
    }
    total += weight;
  }

  if (Math.abs(total - WEIGHT_TOTAL) > WEIGHT_EPSILON) {
    errors.push(`${at}: active weights total ${total}, must equal exactly ${WEIGHT_TOTAL}`);
  }
  return errors;
}

/**
 * Metric keys with strictly positive weight — the "active" metrics the
 * score engine iterates. Zero-weight entries are valid configuration but
 * contribute nothing.
 */
export function activeWeightedMetricKeys(model: ModelConfig): string[] {
  return Object.entries(model.weights ?? {})
    .filter(([, weight]) => Number.isFinite(weight) && weight > 0)
    .map(([key]) => key);
}
