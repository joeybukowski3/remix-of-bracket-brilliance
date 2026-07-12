import { describe, expect, it } from "vitest";
import { HR_BRIDGE_MODEL } from "../hrBridgeModel";
import { METRIC_REGISTRY } from "../metricRegistry";
import { activeWeightedMetricKeys, validateModelConfig } from "../modelConfig";
import type { ModelConfig } from "../types";

function makeModel(overrides: Partial<ModelConfig> = {}): ModelConfig {
  return {
    ...HR_BRIDGE_MODEL,
    modelId: "test-model",
    weights: { ...HR_BRIDGE_MODEL.weights },
    ...overrides,
  };
}

describe("model config validation", () => {
  it("accepts the HR bridge model", () => {
    const result = validateModelConfig(HR_BRIDGE_MODEL, METRIC_REGISTRY);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("bridge weights mirror production and total exactly 100", () => {
    const weights = HR_BRIDGE_MODEL.weights!;
    expect(weights).toEqual({
      "batter-barrel-pct": 22,
      "batter-hard-hit-pct": 18,
      "batter-xba": 12,
      "batter-whiff-pct": 8,
      "batter-last-7-hr": 10,
      "batter-last-30-hr": 10,
      "pitcher-hr-vulnerability": 15,
      "park-hr-factor": 3,
      "weather-hr-boost": 2,
    });
    expect(Object.values(weights).reduce((s, w) => s + w, 0)).toBe(100);
  });

  it("rejects weight totals that are not exactly 100", () => {
    const model = makeModel();
    model.weights!["batter-barrel-pct"] = 23;
    const result = validateModelConfig(model, METRIC_REGISTRY);
    expect(result.errors.join()).toContain("must equal exactly 100");
  });

  it("rejects negative weights", () => {
    const model = makeModel();
    model.weights!["batter-barrel-pct"] = -22;
    model.weights!["batter-hard-hit-pct"] = 62;
    const result = validateModelConfig(model, METRIC_REGISTRY);
    expect(result.errors.join()).toContain("negative weight");
  });

  it("rejects non-finite weights", () => {
    const model = makeModel();
    model.weights!["batter-barrel-pct"] = Number.NaN;
    const result = validateModelConfig(model, METRIC_REGISTRY);
    expect(result.errors.join()).toContain("not finite");
  });

  it("rejects unknown metric keys", () => {
    const model = makeModel();
    delete model.weights!["park-hr-factor"];
    model.weights!["batter-xslg"] = 3; // not a verified Phase 1 metric
    const result = validateModelConfig(model, METRIC_REGISTRY);
    expect(result.errors.join()).toContain('unknown metric "batter-xslg"');
  });

  it("rejects weights on non-weightable (informational) metrics", () => {
    const model = makeModel({ market: "k" });
    model.weights = { "pitcher-k-rate": 50, "pitcher-projected-ks": 50 };
    const result = validateModelConfig(model, METRIC_REGISTRY);
    expect(result.errors.join()).toContain('"pitcher-projected-ks" is not weightable');
  });

  it("rejects metrics not declared for the model market", () => {
    const model = makeModel({ market: "k" });
    model.weights = { "batter-barrel-pct": 100 };
    const result = validateModelConfig(model, METRIC_REGISTRY);
    expect(result.errors.join()).toContain('not declared for market "k"');
  });

  it("validates rules-only models without a weight vector", () => {
    const model = makeModel({ modelType: "rules", weights: undefined });
    const result = validateModelConfig(model, METRIC_REGISTRY);
    expect(result.errors).toEqual([]);
  });

  it("rejects rules-only models that carry weights", () => {
    const model = makeModel({ modelType: "rules" });
    const result = validateModelConfig(model, METRIC_REGISTRY);
    expect(result.errors.join()).toContain("must not carry a weight vector");
  });

  it("treats zero-weight metrics as configured but inactive", () => {
    const model = makeModel();
    model.weights!["park-hr-factor"] = 0;
    model.weights!["weather-hr-boost"] = 5;
    const result = validateModelConfig(model, METRIC_REGISTRY);
    expect(result.errors).toEqual([]);
    expect(activeWeightedMetricKeys(model)).not.toContain("park-hr-factor");
    expect(activeWeightedMetricKeys(model)).toContain("weather-hr-boost");
  });
});
