/**
 * HR bridge shadow integration (Phase 1).
 *
 * Computes the shadow Absolute Score for HR batter rows at the frontend
 * data-loading path. Pure functions over already-normalized payload rows —
 * validated entirely with checked-in fixture payloads (running the live
 * generator would require external providers).
 *
 * The shadow output is additive: production `hrScore`/`hrScoreRank`,
 * sorting, best bets, Sin City, email, and social selection are untouched
 * and must never read these fields.
 */

import { HR_BRIDGE_MODEL } from "./hrBridgeModel";
import { getMetricsForMarket, METRIC_REGISTRY, METRIC_REGISTRY_VERSION } from "./metricRegistry";
import { assertScoreContextValid, scoreRow, type ScoreEngineContext } from "./scoreEngine";
import type {
  MetricContribution,
  ReferenceRangeArtifact,
  ScoreEngineInput,
  ScoreStatus,
} from "./types";

/** Structural view of the HR batter fields the bridge model reads. */
export interface HrShadowBatterInput {
  gameKey: string;
  barrelRate: number | null;
  hardHitRate: number | null;
  xba: number | null;
  whiffRate: number | null;
  last7HR: number | null;
  last30HR: number | null;
  opposingPitcherHrVs: number | null;
  parkFactor: number | null;
  weatherBoost: number | null;
}

export interface HrShadowFields {
  shadowAbsoluteScore: number | null;
  shadowScoreStatus: ScoreStatus;
  /** Slate-relative rank among shadow-scored rows. Deliberately separate from the Absolute Score. */
  shadowSlateRank: number | null;
  shadowCompleteness: number;
  shadowConfidence: number;
  shadowContributions: MetricContribution[];
  /** Metric key → post-direction normalized value (0–100). */
  shadowNormalizedMetrics: Record<string, number>;
  shadowMissingMetrics: string[];
}

export interface HrShadowMeta {
  shadowModelId: string;
  shadowModelVersion: string;
  shadowScoreVersion: string;
  shadowRegistryVersion: string;
  shadowRangeArtifactVersion: string;
}

export function buildHrShadowMeta(artifact: ReferenceRangeArtifact): HrShadowMeta {
  return {
    shadowModelId: HR_BRIDGE_MODEL.modelId,
    shadowModelVersion: HR_BRIDGE_MODEL.modelVersion,
    shadowScoreVersion: HR_BRIDGE_MODEL.scoreVersion,
    shadowRegistryVersion: METRIC_REGISTRY_VERSION,
    shadowRangeArtifactVersion: artifact.artifactVersion,
  };
}

function buildEngineInput(
  batter: HrShadowBatterInput,
  roofTypeByGameKey: ReadonlyMap<string, string>,
): ScoreEngineInput {
  const hrMetrics = getMetricsForMarket("hr");
  const rawValues: Record<string, number | null> = {};
  for (const metric of hrMetrics) {
    const value = (batter as unknown as Record<string, unknown>)[metric.dailyRowField];
    rawValues[metric.key] = typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  // Closed/unknown-roof games: a missing weather boost is inapplicable
  // context (real neutral, no completeness penalty), not missing data.
  // Production writes weatherBoost = 0 for non-open roofs, so this branch
  // only matters for rows where the value was dropped upstream.
  const inapplicableMetricKeys: string[] = [];
  if (rawValues["weather-hr-boost"] == null) {
    const roofType = roofTypeByGameKey.get(batter.gameKey);
    if (roofType && roofType !== "Open") inapplicableMetricKeys.push("weather-hr-boost");
  }

  return { rawValues, inapplicableMetricKeys };
}

export function createHrShadowContext(rangeArtifact: ReferenceRangeArtifact): ScoreEngineContext {
  const context: ScoreEngineContext = {
    metrics: METRIC_REGISTRY,
    model: HR_BRIDGE_MODEL,
    rangeArtifact,
    registryVersion: METRIC_REGISTRY_VERSION,
  };
  assertScoreContextValid(context);
  return context;
}

/**
 * Score every batter row and attach shadow fields, including the separate
 * slate rank (computed here, outside the engine — the engine itself never
 * sees the slate). Returns new row objects; inputs are not mutated.
 */
export function computeHrShadowRows<T extends HrShadowBatterInput>(
  batters: readonly T[],
  rangeArtifact: ReferenceRangeArtifact,
  roofTypeByGameKey: ReadonlyMap<string, string> = new Map(),
): Array<T & HrShadowFields> {
  const context = createHrShadowContext(rangeArtifact);

  const scored = batters.map((batter, index) => {
    const result = scoreRow(context, buildEngineInput(batter, roofTypeByGameKey));
    const normalized: Record<string, number> = {};
    for (const contribution of result.contributions) {
      normalized[contribution.metricKey] = contribution.normalizedValue;
    }
    return { batter, index, result, normalized };
  });

  const ranked = scored
    .filter((entry) => entry.result.status === "ok" && entry.result.absoluteScore != null)
    .sort(
      (a, b) =>
        (b.result.absoluteScoreUnrounded ?? 0) - (a.result.absoluteScoreUnrounded ?? 0) ||
        a.index - b.index,
    );
  const rankByIndex = new Map<number, number>();
  ranked.forEach((entry, position) => rankByIndex.set(entry.index, position + 1));

  return scored.map(({ batter, index, result, normalized }) => ({
    ...batter,
    shadowAbsoluteScore: result.absoluteScore,
    shadowScoreStatus: result.status,
    shadowSlateRank: rankByIndex.get(index) ?? null,
    shadowCompleteness: result.completenessPercent,
    shadowConfidence: result.confidencePercent,
    shadowContributions: result.contributions,
    shadowNormalizedMetrics: normalized,
    shadowMissingMetrics: result.missingMetricKeys,
  }));
}

/**
 * Enrich a normalized HR dashboard payload with shadow rows + header
 * metadata. Non-batter sections pass through untouched. Returns a new
 * payload object; never mutates the input.
 */
export function enrichHrPayloadWithShadow<
  P extends {
    batters: HrShadowBatterInput[];
    games?: Array<{ gameKey: string; roofType: string }>;
  },
>(payload: P, rangeArtifact: ReferenceRangeArtifact): P & { shadowMeta: HrShadowMeta } {
  const roofTypeByGameKey = new Map(
    (payload.games ?? []).map((game) => [game.gameKey, game.roofType]),
  );
  return {
    ...payload,
    batters: computeHrShadowRows(payload.batters, rangeArtifact, roofTypeByGameKey),
    shadowMeta: buildHrShadowMeta(rangeArtifact),
  };
}
