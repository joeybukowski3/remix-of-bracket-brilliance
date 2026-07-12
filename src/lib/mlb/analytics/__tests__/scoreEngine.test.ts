import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { HR_BRIDGE_MODEL } from "../hrBridgeModel";
import { METRIC_REGISTRY, METRIC_REGISTRY_VERSION } from "../metricRegistry";
import { parseReferenceRangeArtifact } from "../referenceRanges";
import {
  assertScoreContextValid,
  NEUTRAL_NORMALIZED_VALUE,
  scoreRow,
  type ScoreEngineContext,
} from "../scoreEngine";
import type { ScoreEngineInput } from "../types";

const rangeArtifact = parseReferenceRangeArtifact(
  JSON.parse(
    readFileSync(
      resolve(process.cwd(), "public/data/mlb/model-reference-ranges/hr-bridge-v1.json"),
      "utf8",
    ),
  ),
);

const context: ScoreEngineContext = {
  metrics: METRIC_REGISTRY,
  model: HR_BRIDGE_MODEL,
  rangeArtifact,
  registryVersion: METRIC_REGISTRY_VERSION,
};

/** Complete row with every bridge metric present. */
function completeInput(): ScoreEngineInput {
  return {
    rawValues: {
      "batter-barrel-pct": 14.5, // (14.5-3)/17
      "batter-hard-hit-pct": 48, // (48-25)/35
      "batter-xba": 0.27,
      "batter-whiff-pct": 22, // lower-better → inverted
      "batter-last-7-hr": 2,
      "batter-last-30-hr": 6,
      "pitcher-hr-vulnerability": 61.3,
      "park-hr-factor": 1.05,
      "weather-hr-boost": 3.2,
    },
  };
}

describe("score engine invariants", () => {
  it("validates its context", () => {
    expect(() => assertScoreContextValid(context)).not.toThrow();
  });

  it("is deterministic: identical inputs produce identical output", () => {
    const a = scoreRow(context, completeInput());
    const b = scoreRow(context, completeInput());
    expect(b).toEqual(a);
  });

  it("is slate-independent: scoring other rows first cannot move a score", () => {
    const before = scoreRow(context, completeInput());
    for (let i = 0; i < 50; i += 1) {
      scoreRow(context, {
        rawValues: { ...completeInput().rawValues, "batter-barrel-pct": 3 + (i % 17) },
      });
    }
    const after = scoreRow(context, completeInput());
    expect(after).toEqual(before);
  });

  it("contributions sum exactly to the unrounded score", () => {
    const result = scoreRow(context, completeInput());
    const sum = result.contributions.reduce((s, c) => s + c.contributionPoints, 0);
    expect(Math.abs(sum - (result.absoluteScoreUnrounded ?? NaN))).toBeLessThan(1e-9);
    expect(result.absoluteScore).toBe(Number((result.absoluteScoreUnrounded ?? 0).toFixed(1)));
  });

  it("inverts lower-is-better metrics via registry directionality", () => {
    const lowWhiff = scoreRow(context, {
      rawValues: { ...completeInput().rawValues, "batter-whiff-pct": 15 },
    });
    const highWhiff = scoreRow(context, {
      rawValues: { ...completeInput().rawValues, "batter-whiff-pct": 38 },
    });
    const lowContribution = lowWhiff.contributions.find((c) => c.metricKey === "batter-whiff-pct")!;
    const highContribution = highWhiff.contributions.find((c) => c.metricKey === "batter-whiff-pct")!;
    expect(lowContribution.normalizedValue).toBe(100);
    expect(highContribution.normalizedValue).toBe(0);
    expect(lowWhiff.absoluteScore!).toBeGreaterThan(highWhiff.absoluteScore!);
  });

  it("clamps values outside the reference range", () => {
    const result = scoreRow(context, {
      rawValues: { ...completeInput().rawValues, "batter-barrel-pct": 35, "batter-xba": 0.05 },
    });
    const barrel = result.contributions.find((c) => c.metricKey === "batter-barrel-pct")!;
    const xba = result.contributions.find((c) => c.metricKey === "batter-xba")!;
    expect(barrel.normalizedValue).toBe(100);
    expect(xba.normalizedValue).toBe(0);
  });

  it("carries version metadata on every result", () => {
    const result = scoreRow(context, completeInput());
    expect(result.scoreVersion).toBe("hr-bridge-abs@1");
    expect(result.registryVersion).toBe(METRIC_REGISTRY_VERSION);
    expect(result.modelId).toBe("jkb-hr-bridge");
    expect(result.modelVersion).toBe("1.0.0");
  });
});

describe("missing-value and completeness policy", () => {
  it("scores a complete row at 100% completeness with no substitutions", () => {
    const result = scoreRow(context, completeInput());
    expect(result.completenessPercent).toBe(100);
    expect(result.substitutedMetricKeys).toEqual([]);
    expect(result.status).toBe("ok");
  });

  it("substitutes neutral 0.5 for one missing metric without renormalizing weights", () => {
    const input = completeInput();
    input.rawValues["batter-xba"] = null;
    const result = scoreRow(context, input);
    const xba = result.contributions.find((c) => c.metricKey === "batter-xba")!;
    expect(xba.substituted).toBe(true);
    expect(xba.substitutionReason).toBe("missing-value");
    expect(xba.contributionPoints).toBeCloseTo(12 * NEUTRAL_NORMALIZED_VALUE, 10);
    // Weight is NOT redistributed: every other contribution is unchanged.
    const baseline = scoreRow(context, completeInput());
    for (const contribution of result.contributions) {
      if (contribution.metricKey === "batter-xba") continue;
      const before = baseline.contributions.find((c) => c.metricKey === contribution.metricKey)!;
      expect(contribution.contributionPoints).toBeCloseTo(before.contributionPoints, 10);
    }
    expect(result.completenessPercent).toBe(88);
    expect(result.missingMetricKeys).toEqual(["batter-xba"]);
    expect(result.status).toBe("ok");
  });

  it("tracks multiple missing metrics", () => {
    const input = completeInput();
    input.rawValues["batter-xba"] = null;
    input.rawValues["batter-whiff-pct"] = undefined;
    input.rawValues["weather-hr-boost"] = null;
    const result = scoreRow(context, input);
    expect(result.missingMetricKeys.sort()).toEqual([
      "batter-whiff-pct",
      "batter-xba",
      "weather-hr-boost",
    ]);
    expect(result.completenessPercent).toBe(78);
  });

  it("keeps a normal score just above the completeness floor", () => {
    // Missing xba (12) + whiff (8) + last7 (10) = 70% completeness ≥ 65 floor.
    const input = completeInput();
    input.rawValues["batter-xba"] = null;
    input.rawValues["batter-whiff-pct"] = null;
    input.rawValues["batter-last-7-hr"] = null;
    const result = scoreRow(context, input);
    expect(result.completenessPercent).toBe(70);
    expect(result.status).toBe("ok");
    expect(result.absoluteScore).not.toBeNull();
  });

  it("suppresses the score just below the completeness floor", () => {
    // Missing barrel (22) + hardHit (18) = 60% completeness < 65 floor.
    const input = completeInput();
    input.rawValues["batter-barrel-pct"] = null;
    input.rawValues["batter-hard-hit-pct"] = null;
    const result = scoreRow(context, input);
    expect(result.completenessPercent).toBe(60);
    expect(result.status).toBe("suppressed");
    expect(result.absoluteScore).toBeNull();
    // Diagnostics remain available for the suppressed row.
    expect(result.contributions.length).toBeGreaterThan(0);
  });

  it("missing environmental metric only reduces its own weight", () => {
    const input = completeInput();
    input.rawValues["park-hr-factor"] = null;
    const result = scoreRow(context, input);
    expect(result.completenessPercent).toBe(97);
    expect(result.status).toBe("ok");
  });

  it("treats verified inapplicable context (closed roof weather) as real neutral", () => {
    const input = completeInput();
    input.rawValues["weather-hr-boost"] = null;
    input.inapplicableMetricKeys = ["weather-hr-boost"];
    const result = scoreRow(context, input);
    const weather = result.contributions.find((c) => c.metricKey === "weather-hr-boost")!;
    expect(weather.substituted).toBe(false);
    expect(weather.substitutionReason).toBe("inapplicable-context");
    expect(weather.normalizedValue).toBe(50);
    // No completeness penalty for inapplicable context.
    expect(result.completenessPercent).toBe(100);
    expect(result.missingMetricKeys).toEqual([]);
  });

  it("confidence equals completeness when no sample-size policies apply", () => {
    const input = completeInput();
    input.rawValues["batter-xba"] = null;
    const result = scoreRow(context, input);
    expect(result.confidencePercent).toBe(result.completenessPercent);
  });
});
