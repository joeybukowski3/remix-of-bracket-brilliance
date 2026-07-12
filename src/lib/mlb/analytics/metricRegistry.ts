/**
 * Shared MLB analytics metric registry (Phase 1).
 *
 * Single source of truth for metric identity, directionality, normalization
 * method, null policy, and display metadata. Daily JSON carries only raw
 * values; the registry version pins what those values mean.
 *
 * Phase 1 scope: the registry describes ONLY verified current production
 * fields — the nine HR bridge metrics plus a minimal set of verified K
 * pitcher metrics used for market-compatibility contract tests. Target-model
 * metrics without verified daily fields (xSLG, platoon splits, Pull-Air,
 * pitcher xwOBA allowed, ...) are intentionally absent.
 */

import type { MetricDefinition, MlbMarket, ValidationResult } from "./types";

export const METRIC_REGISTRY_VERSION = "mlb-metrics@1";

const MARKETS: ReadonlySet<string> = new Set(["hr", "k", "hits", "ml"]);
const DIRECTIONS: ReadonlySet<string> = new Set(["higher-better", "lower-better"]);
const IMPLEMENTED_METHODS: ReadonlySet<string> = new Set(["fixed-range"]);

const HR_METRICS: MetricDefinition[] = [
  {
    key: "batter-barrel-pct",
    schemaVersion: 1,
    label: "Barrel %",
    shortLabel: "Brl%",
    description: "Share of batted balls barreled (season, Baseball Savant aggregate).",
    markets: ["hr"],
    group: "batter-power",
    unit: "pct",
    format: { decimals: 1, suffix: "%" },
    provenance: "statcast",
    dailyRowField: "barrelRate",
    timeframe: "season",
    normalization: {
      population: "production-bridge-constant",
      method: "fixed-range",
      direction: "higher-better",
      rangeKey: "batter-barrel-pct",
      transform: "linear",
    },
    filterable: true,
    weightable: true,
    informationalOnly: false,
    showInBasicMode: true,
    showInAdvancedMode: true,
    defaultWeight: 22,
    nullPolicy: "neutral",
    contributionTemplate: "Barrel rate of {raw}% vs bridge range 3–20%",
  },
  {
    key: "batter-hard-hit-pct",
    schemaVersion: 1,
    label: "Hard Hit %",
    shortLabel: "HH%",
    description: "Share of batted balls at 95+ mph exit velocity (season).",
    markets: ["hr"],
    group: "batter-power",
    unit: "pct",
    format: { decimals: 1, suffix: "%" },
    provenance: "statcast",
    dailyRowField: "hardHitRate",
    timeframe: "season",
    normalization: {
      population: "production-bridge-constant",
      method: "fixed-range",
      direction: "higher-better",
      rangeKey: "batter-hard-hit-pct",
      transform: "linear",
    },
    filterable: true,
    weightable: true,
    informationalOnly: false,
    showInBasicMode: true,
    showInAdvancedMode: true,
    defaultWeight: 18,
    nullPolicy: "neutral",
    contributionTemplate: "Hard-hit rate of {raw}% vs bridge range 25–60%",
  },
  {
    key: "batter-xba",
    schemaVersion: 1,
    label: "Expected Batting Average",
    shortLabel: "xBA",
    description: "Expected batting average from quality of contact (season).",
    markets: ["hr"],
    group: "batter-contact",
    unit: "ratio",
    format: { decimals: 3 },
    provenance: "statcast",
    dailyRowField: "xba",
    timeframe: "season",
    normalization: {
      population: "production-bridge-constant",
      method: "fixed-range",
      direction: "higher-better",
      rangeKey: "batter-xba",
      transform: "linear",
    },
    filterable: true,
    weightable: true,
    informationalOnly: false,
    showInBasicMode: true,
    showInAdvancedMode: true,
    defaultWeight: 12,
    nullPolicy: "neutral",
    contributionTemplate: "xBA of {raw} vs bridge range .180–.340",
  },
  {
    key: "batter-whiff-pct",
    schemaVersion: 1,
    label: "Whiff %",
    shortLabel: "Whiff%",
    description: "Swing-and-miss rate (season). Lower is better for HR contact.",
    markets: ["hr"],
    group: "batter-contact",
    unit: "pct",
    format: { decimals: 1, suffix: "%" },
    provenance: "statcast",
    dailyRowField: "whiffRate",
    timeframe: "season",
    normalization: {
      population: "production-bridge-constant",
      method: "fixed-range",
      direction: "lower-better",
      rangeKey: "batter-whiff-pct",
      transform: "linear",
    },
    filterable: true,
    weightable: true,
    informationalOnly: false,
    showInBasicMode: false,
    showInAdvancedMode: true,
    defaultWeight: 8,
    nullPolicy: "neutral",
    contributionTemplate: "Whiff rate of {raw}% (inverted) vs bridge range 15–38%",
  },
  {
    key: "batter-last-7-hr",
    schemaVersion: 1,
    label: "Home Runs, Last 7 Days",
    shortLabel: "L7 HR",
    description: "Raw HR count over the last 7 days. Small-window count; bridge-only.",
    markets: ["hr"],
    group: "batter-recent-form",
    unit: "count",
    format: { decimals: 0 },
    provenance: "mlb-api",
    dailyRowField: "last7HR",
    timeframe: "l7",
    normalization: {
      population: "production-bridge-constant",
      method: "fixed-range",
      direction: "higher-better",
      rangeKey: "batter-last-7-hr",
      transform: "linear",
    },
    filterable: true,
    weightable: true,
    informationalOnly: false,
    showInBasicMode: true,
    showInAdvancedMode: true,
    defaultWeight: 10,
    nullPolicy: "neutral",
    contributionTemplate: "{raw} HR in the last 7 days vs bridge range 0–5",
  },
  {
    key: "batter-last-30-hr",
    schemaVersion: 1,
    label: "Home Runs, Last 30 Days",
    shortLabel: "L30 HR",
    description: "Raw HR count over the last 30 days. Bridge-only raw count.",
    markets: ["hr"],
    group: "batter-recent-form",
    unit: "count",
    format: { decimals: 0 },
    provenance: "mlb-api",
    dailyRowField: "last30HR",
    timeframe: "l30",
    normalization: {
      population: "production-bridge-constant",
      method: "fixed-range",
      direction: "higher-better",
      rangeKey: "batter-last-30-hr",
      transform: "linear",
    },
    filterable: true,
    weightable: true,
    informationalOnly: false,
    showInBasicMode: true,
    showInAdvancedMode: true,
    defaultWeight: 10,
    nullPolicy: "neutral",
    contributionTemplate: "{raw} HR in the last 30 days vs bridge range 0–10",
  },
  {
    key: "pitcher-hr-vulnerability",
    schemaVersion: 1,
    label: "Opposing Pitcher HR Vulnerability",
    shortLabel: "Pit HRvs",
    description:
      "Composite 0–100 index of the opposing starter's HR susceptibility (xERA, hard-hit, fly-ball, barrel components).",
    markets: ["hr"],
    group: "pitcher-vulnerability",
    unit: "index",
    format: { decimals: 1 },
    provenance: "derived",
    dailyRowField: "opposingPitcherHrVs",
    timeframe: "season",
    normalization: {
      population: "production-bridge-constant",
      method: "fixed-range",
      direction: "higher-better",
      rangeKey: "pitcher-hr-vulnerability",
      transform: "linear",
    },
    filterable: true,
    weightable: true,
    informationalOnly: false,
    showInBasicMode: true,
    showInAdvancedMode: true,
    defaultWeight: 15,
    nullPolicy: "neutral",
    contributionTemplate: "Opposing pitcher vulnerability index {raw} of 100",
  },
  {
    key: "park-hr-factor",
    schemaVersion: 1,
    label: "Park HR Factor",
    shortLabel: "Park",
    description: "Venue HR factor (1.00 = neutral) from the checked-in park table.",
    markets: ["hr"],
    group: "environment",
    unit: "index",
    format: { decimals: 2 },
    provenance: "derived",
    dailyRowField: "parkFactor",
    timeframe: "multi-season",
    normalization: {
      population: "production-bridge-constant",
      method: "fixed-range",
      direction: "higher-better",
      rangeKey: "park-hr-factor",
      transform: "linear",
    },
    filterable: true,
    weightable: true,
    informationalOnly: false,
    showInBasicMode: false,
    showInAdvancedMode: true,
    defaultWeight: 3,
    nullPolicy: "neutral",
    contributionTemplate: "Park factor {raw} vs bridge range 0.85–1.40",
  },
  {
    key: "weather-hr-boost",
    schemaVersion: 1,
    label: "Weather HR Boost",
    shortLabel: "Wx",
    description:
      "Temperature/precipitation HR boost in [-10, +10]. 0 for closed roofs (a real neutral, not missing).",
    markets: ["hr"],
    group: "environment",
    unit: "boost",
    format: { decimals: 1, showSign: true },
    provenance: "derived",
    dailyRowField: "weatherBoost",
    timeframe: "game",
    normalization: {
      population: "production-bridge-constant",
      method: "fixed-range",
      direction: "higher-better",
      rangeKey: "weather-hr-boost",
      transform: "linear",
    },
    filterable: true,
    weightable: true,
    informationalOnly: false,
    showInBasicMode: false,
    showInAdvancedMode: true,
    defaultWeight: 2,
    nullPolicy: "neutral",
    contributionTemplate: "Weather boost {raw} vs range -10 to +10",
  },
];

/**
 * Minimal verified K metrics for market-compatibility contract tests.
 * All three have verified daily pitcher-row fields and verified fixed
 * ranges in computePitcherMatchupRatings (kVs composite).
 */
const K_METRICS: MetricDefinition[] = [
  {
    key: "pitcher-k-rate",
    schemaVersion: 1,
    label: "Pitcher K %",
    shortLabel: "K%",
    description: "Season strikeout rate for the starting pitcher.",
    markets: ["k"],
    group: "pitcher-skill",
    unit: "pct",
    format: { decimals: 1, suffix: "%" },
    provenance: "statcast",
    dailyRowField: "kRate",
    timeframe: "season",
    normalization: {
      population: "production-bridge-constant",
      method: "fixed-range",
      direction: "higher-better",
      rangeKey: "pitcher-k-rate",
      transform: "linear",
    },
    filterable: true,
    weightable: true,
    informationalOnly: false,
    showInBasicMode: true,
    showInAdvancedMode: true,
    nullPolicy: "neutral",
    contributionTemplate: "Pitcher K rate of {raw}%",
  },
  {
    key: "pitcher-whiff-pct",
    schemaVersion: 1,
    label: "Pitcher Whiff %",
    shortLabel: "Whiff%",
    description: "Season swing-and-miss rate induced by the pitcher.",
    markets: ["k"],
    group: "pitcher-skill",
    unit: "pct",
    format: { decimals: 1, suffix: "%" },
    provenance: "statcast",
    dailyRowField: "whiffRate",
    timeframe: "season",
    normalization: {
      population: "production-bridge-constant",
      method: "fixed-range",
      direction: "higher-better",
      rangeKey: "pitcher-whiff-pct",
      transform: "linear",
    },
    filterable: true,
    weightable: true,
    informationalOnly: false,
    showInBasicMode: true,
    showInAdvancedMode: true,
    nullPolicy: "neutral",
    contributionTemplate: "Pitcher whiff rate of {raw}%",
  },
  {
    key: "pitcher-bb-rate",
    schemaVersion: 1,
    label: "Pitcher BB %",
    shortLabel: "BB%",
    description: "Season walk rate. Lower is better for strikeout quality.",
    markets: ["k"],
    group: "pitcher-skill",
    unit: "pct",
    format: { decimals: 1, suffix: "%" },
    provenance: "statcast",
    dailyRowField: "bbRate",
    timeframe: "season",
    normalization: {
      population: "production-bridge-constant",
      method: "fixed-range",
      direction: "lower-better",
      rangeKey: "pitcher-bb-rate",
      transform: "linear",
    },
    filterable: true,
    weightable: true,
    informationalOnly: false,
    showInBasicMode: false,
    showInAdvancedMode: true,
    nullPolicy: "neutral",
    contributionTemplate: "Pitcher walk rate of {raw}% (inverted)",
  },
  {
    key: "pitcher-projected-ks",
    schemaVersion: 1,
    label: "Projected Strikeouts",
    shortLabel: "Proj K",
    description:
      "Native-unit strikeout projection (projectedIP × projectedK9 ÷ 9). Informational: projection edge stays outside the weighted score.",
    markets: ["k"],
    group: "workload",
    unit: "count",
    format: { decimals: 1 },
    provenance: "derived",
    dailyRowField: "projectedKs",
    timeframe: "season",
    normalization: {
      population: "none",
      method: "raw-differential",
      direction: "higher-better",
    },
    filterable: true,
    weightable: false,
    informationalOnly: true,
    showInBasicMode: true,
    showInAdvancedMode: true,
    nullPolicy: "informational-blank",
    contributionTemplate: "Projected {raw} strikeouts (native units, not weighted)",
  },
];

export const METRIC_REGISTRY: MetricDefinition[] = [...HR_METRICS, ...K_METRICS];

export function getMetric(key: string): MetricDefinition | null {
  return METRIC_REGISTRY.find((m) => m.key === key) ?? null;
}

export function getMetricsForMarket(market: MlbMarket): MetricDefinition[] {
  return METRIC_REGISTRY.filter((m) => m.markets.includes(market));
}

/**
 * Registry lint. Run in tests so an invalid registry can never ship.
 */
export function validateMetricRegistry(metrics: MetricDefinition[]): ValidationResult {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const metric of metrics) {
    const at = `metric "${metric.key}"`;
    if (!metric.key || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(metric.key)) {
      errors.push(`${at}: key must be non-empty kebab-case`);
    }
    if (seen.has(metric.key)) errors.push(`duplicate metric key "${metric.key}"`);
    seen.add(metric.key);

    if (!metric.markets.length || metric.markets.some((m) => !MARKETS.has(m))) {
      errors.push(`${at}: invalid market declaration`);
    }
    if (!DIRECTIONS.has(metric.normalization.direction)) {
      errors.push(`${at}: invalid direction "${metric.normalization.direction}"`);
    }
    if (metric.normalization.method === "fixed-range" && !metric.normalization.rangeKey) {
      errors.push(`${at}: fixed-range normalization requires a rangeKey`);
    }
    if (metric.weightable && !IMPLEMENTED_METHODS.has(metric.normalization.method)) {
      errors.push(
        `${at}: weightable metric declares unimplemented normalization method "${metric.normalization.method}"`,
      );
    }
    if (metric.informationalOnly && metric.weightable) {
      errors.push(`${at}: informational-only metric cannot be weightable`);
    }
    if (!metric.format || !Number.isFinite(metric.format.decimals)) {
      errors.push(`${at}: missing formatting metadata`);
    }
    if (!metric.dailyRowField) errors.push(`${at}: missing dailyRowField`);
    if (!metric.label || !metric.shortLabel) errors.push(`${at}: missing display labels`);
    if (metric.deprecation) {
      if (metric.deprecation.behavior === "map" && !metric.deprecation.replacedBy) {
        errors.push(`${at}: deprecation behavior "map" requires replacedBy`);
      }
      if (
        metric.deprecation.replacedBy &&
        !metrics.some((m) => m.key === metric.deprecation?.replacedBy)
      ) {
        errors.push(`${at}: deprecation replacedBy points at unknown metric`);
      }
    }
    if (metric.defaultWeight != null && (!Number.isFinite(metric.defaultWeight) || metric.defaultWeight < 0)) {
      errors.push(`${at}: defaultWeight must be a non-negative finite number`);
    }
    if (metric.defaultWeight != null && !metric.weightable) {
      errors.push(`${at}: non-weightable metric cannot declare a defaultWeight`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Cross-check that every fixed-range metric in the registry has a range in
 * the given artifact (scoped to the metrics the artifact's score version
 * actually uses).
 */
export function validateRangeCoverage(
  metrics: MetricDefinition[],
  rangeKeys: ReadonlySet<string>,
): ValidationResult {
  const errors: string[] = [];
  for (const metric of metrics) {
    if (metric.normalization.method !== "fixed-range") continue;
    const rangeKey = metric.normalization.rangeKey;
    if (rangeKey && !rangeKeys.has(rangeKey)) {
      errors.push(`metric "${metric.key}" references missing range "${rangeKey}"`);
    }
  }
  return { valid: errors.length === 0, errors };
}
