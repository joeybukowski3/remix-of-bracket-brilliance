/**
 * MLB analytics foundation — shared contract types (Phase 1).
 *
 * These types describe the versioned metric registry, model configuration,
 * and scoring contracts shared by HR (pilot), K (second phase), and future
 * Hits/Moneyline markets. Pure types only — no browser, React, or network
 * dependencies.
 *
 * Nothing in this module describes a probability. Absolute Scores are
 * 0–100 weighted-evidence indexes and must never be presented as win/hit
 * probabilities without separate, gated calibration.
 */

export type MlbMarket = "hr" | "k" | "hits" | "ml";

export type MetricDirection = "higher-better" | "lower-better";

/**
 * Normalization methods the score engine understands.
 * Phase 1 implements "fixed-range" (versioned reference-range linear
 * scaling, clamped to [0,1]). The other members are declared so the
 * registry contract does not change when they are implemented; the
 * registry validator rejects entries that declare a method the engine
 * cannot execute yet.
 */
export type NormalizationMethod =
  | "fixed-range"
  | "binary-rule"
  | "capped-transform"
  | "raw-differential";

export const IMPLEMENTED_NORMALIZATION_METHODS: ReadonlySet<NormalizationMethod> =
  new Set(["fixed-range"]);

/** Population a metric's reference range is (or will be) derived from. */
export type NormalizationPopulation =
  | "production-bridge-constant"
  | "league-multi-season"
  | "league-role-split"
  | "none";

/**
 * How a missing raw value is treated by the score engine.
 * Phase 1 implements "neutral" (substitute the normalized midpoint 0.5 and
 * count the metric's weight against completeness). "exclude-row" and
 * "informational-blank" are declared for future policies.
 */
export type MetricNullPolicy = "neutral" | "exclude-row" | "informational-blank";

export type MetricGroup =
  | "batter-power"
  | "batter-contact"
  | "batter-recent-form"
  | "pitcher-vulnerability"
  | "pitcher-skill"
  | "opponent-offense"
  | "environment"
  | "workload"
  | "identity";

export type MetricUnit = "pct" | "ratio" | "count" | "index" | "mph" | "ip" | "boost";

export interface MetricFormat {
  decimals: number;
  suffix?: string;
  showSign?: boolean;
}

export interface MetricDeprecation {
  deprecatedIn: string;
  behavior: "hide" | "map" | "freeze";
  /** Required when behavior is "map". */
  replacedBy?: string;
}

export interface MetricConfidencePolicy {
  /** Sample size at/above which the metric earns full sample credit. */
  fullSample: number;
  /** Sample size below which the metric earns zero sample credit. */
  floorSample: number;
}

export interface MetricDefinition {
  /** Stable kebab-case key. Never reused. Not tied to payload camelCase names. */
  key: string;
  schemaVersion: number;
  label: string;
  shortLabel: string;
  description: string;
  markets: MlbMarket[];
  group: MetricGroup;
  unit: MetricUnit;
  format: MetricFormat;
  /** Where the raw number originates (e.g. "statcast", "mlb-api", "derived"). */
  provenance: string;
  /**
   * Field name on the current daily row that carries the raw value
   * (e.g. "barrelRate" on an HR batter row, "kRate" on a pitcher row).
   */
  dailyRowField: string;
  timeframe: "season" | "l7" | "l30" | "l3-5-starts" | "game" | "multi-season";
  /** Daily-row field holding the sample size backing this metric, when one exists. */
  sampleSizeField?: string;
  minSample?: number;
  normalization: {
    population: NormalizationPopulation;
    method: NormalizationMethod;
    direction: MetricDirection;
    /**
     * Key into the versioned reference-range artifact. Required for
     * "fixed-range". By convention it equals the metric key.
     */
    rangeKey?: string;
    transform?: "linear";
  };
  filterable: boolean;
  weightable: boolean;
  informationalOnly: boolean;
  showInBasicMode: boolean;
  showInAdvancedMode: boolean;
  /** Default weight in the market's default model, when the metric has one. */
  defaultWeight?: number;
  nullPolicy: MetricNullPolicy;
  confidencePolicy?: MetricConfidencePolicy;
  /** Human template for contribution explanations, e.g. "Barrel rate of {raw}". */
  contributionTemplate: string;
  deprecation?: MetricDeprecation;
}

// ── Reference-range artifact ─────────────────────────────────────────────────

export interface ReferenceRangeEntry {
  metricKey: string;
  /** Selected production minimum (normalizes to 0 for higher-better). */
  min: number;
  /** Selected production maximum (normalizes to 1 for higher-better). */
  max: number;
  /** Empirical percentile bounds, when a derivation script produced them. */
  rawPercentileBounds?: { p2?: number | null; p98?: number | null } | null;
  winsorization?: string | null;
  /** Where these bounds came from — required so bridge ranges stay traceable. */
  provenance: string;
}

export interface ReferenceRangeArtifact {
  artifactVersion: string;
  scoreVersion: string;
  generatedAt: string;
  /** Null for bridge artifacts inherited from production constants. */
  sourceSeasons: string[] | null;
  sourceDescription: string;
  populationDefinition: string;
  /** Null when ranges were not empirically derived. */
  sampleCount: number | null;
  ranges: ReferenceRangeEntry[];
}

// ── Model configuration ──────────────────────────────────────────────────────

export type ModelType = "weighted" | "rules" | "hybrid";
export type ModelOrigin = "jkb-default" | "curated" | "user";

export type HardFilterOp = "gte" | "lte" | "eq" | "neq" | "in";

export interface HardFilterClause {
  /** Metric key or row context field (e.g. "lineupStatus"). */
  field: string;
  op: HardFilterOp;
  value: number | string | boolean | Array<number | string>;
}

export interface ModelSortState {
  key: string;
  direction: "asc" | "desc";
}

export interface ModelConfig {
  modelId: string;
  market: MlbMarket;
  name: string;
  description: string;
  modelType: ModelType;
  origin: ModelOrigin;
  /** Set when a model was cloned from a curated preset. */
  sourcePresetId?: string;
  modelVersion: string;
  scoreVersion: string;
  registryVersion: string;
  /** Metric key → weight. Active weighted models must total exactly 100. */
  weights?: Record<string, number>;
  hardFilters: HardFilterClause[];
  visibleColumns: string[];
  sortState?: ModelSortState;
  createdAt: string;
  updatedAt: string;
  schemaVersion: number;
  /**
   * Completeness floor (percent of active weight that must be backed by
   * real values) below which the score is suppressed rather than shown.
   */
  completenessFloorPercent: number;
}

// ── Score engine output ──────────────────────────────────────────────────────

export interface MetricContribution {
  metricKey: string;
  rawValue: number | null;
  /** Post-direction normalized value on a 0–100 display scale. */
  normalizedValue: number;
  direction: MetricDirection;
  weight: number;
  /** Points earned toward the final score (= weight × normalized/100). */
  contributionPoints: number;
  /** Maximum points this metric could contribute (= weight). */
  maxContributionPoints: number;
  sampleSize: number | null;
  minSample: number | null;
  /** 0–1 sample credit. 1 when no sample-size policy applies. */
  sampleAdequacy: number;
  substituted: boolean;
  substitutionReason: "missing-value" | "inapplicable-context" | null;
  /** This metric's share of the row confidence (0–1 scale, weight-fraction). */
  confidenceContribution: number;
}

export type ScoreStatus = "ok" | "suppressed";

export interface ScoreResult {
  status: ScoreStatus;
  /** Final 0–100 Absolute Score. Null when suppressed. */
  absoluteScore: number | null;
  /** Unrounded score; contributions sum to this exactly. */
  absoluteScoreUnrounded: number | null;
  contributions: MetricContribution[];
  /** Percent (0–100) of active model weight backed by real values. */
  completenessPercent: number;
  /** 0–100. Completeness × weighted sample adequacy. */
  confidencePercent: number;
  missingMetricKeys: string[];
  substitutedMetricKeys: string[];
  scoreVersion: string;
  registryVersion: string;
  modelId: string;
  modelVersion: string;
}

export interface ScoreEngineInput {
  /** Metric key → raw value (null/undefined = missing). */
  rawValues: Record<string, number | null | undefined>;
  /** Metric key → sample size backing the raw value, when known. */
  sampleSizes?: Record<string, number | null | undefined>;
  /**
   * Metric keys that are inapplicable in this row's context (e.g. weather
   * under a closed roof). Treated as a real neutral value — normalized 0.5,
   * not substituted, no completeness penalty.
   */
  inapplicableMetricKeys?: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
