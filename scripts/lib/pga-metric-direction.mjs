/**
 * Authoritative direction metadata for every PGA metric consumed by a ranker.
 *
 * THIS IS THE ONLY DIRECTION MAP IN THE REPOSITORY. Rankers must not keep a
 * private copy. Four independent copies previously existed and one of them
 * (scripts/generate-pga-tournament-rankings.mjs) silently disagreed about
 * bogeyAvoidance, which shipped inverted Power Rankings to production.
 *
 * Consumed by plain-Node generators under scripts/ and, through
 * src/lib/pga/metricDirection.ts, by the Vite/TypeScript application.
 *
 * "lower" means a SMALLER raw value is a BETTER player:
 *   - bogeyAvoidance is stored as a bogey RATE (observed range 0.107-0.233),
 *     so fewer bogeys is better. The name reads like a score; the value is not.
 *   - trendRank is an ordinal rank, so #1 is better than #100.
 * Everything else is strokes-gained or a ratio where more is better.
 */

/** @typedef {"higher" | "lower"} PgaMetricDirection */

/** @type {Readonly<Record<string, PgaMetricDirection>>} */
export const PGA_METRIC_DIRECTION = Object.freeze({
  sgTotal: "higher",
  sgOTT: "higher",
  sgApp: "higher",
  sgAtG: "higher",
  sgPutt: "higher",
  drivingAccuracy: "higher",
  drivingDistance: "higher",
  birdieBogeyRatio: "higher",
  bogeyAvoidance: "lower",
  trendRank: "lower",
});

/**
 * Display aliases that historically resolved to a canonical metric.
 *
 * PgaHubShared matched lowercase short codes and full labels ("bog",
 * "bogey avoidance") as well as camelCase keys. Preserved verbatim so
 * centralizing direction does not change any existing call site's answer.
 */
const METRIC_ALIASES = Object.freeze({
  bog: "bogeyAvoidance",
  bogeyavoidance: "bogeyAvoidance",
  trend: "trendRank",
  trendrank: "trendRank",
  sgt: "sgTotal",
  ott: "sgOTT",
  app: "sgApp",
  atg: "sgAtG",
  put: "sgPutt",
  drv: "drivingAccuracy",
});

/** Lowercase and strip non-alphanumerics so "Bogey Avoidance" === "bogeyAvoidance". */
export function normalizeMetricKey(key) {
  return String(key ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const CANONICAL_BY_NORMALIZED = Object.freeze(
  Object.fromEntries([
    ...Object.keys(PGA_METRIC_DIRECTION).map((key) => [normalizeMetricKey(key), key]),
    ...Object.entries(METRIC_ALIASES).map(([alias, canonical]) => [normalizeMetricKey(alias), canonical]),
  ]),
);

/** Canonical metric key for any accepted spelling, or null when undeclared. */
export function resolveMetricKey(key) {
  return CANONICAL_BY_NORMALIZED[normalizeMetricKey(key)] ?? null;
}

/** True when a metric is declared lower-is-better. */
export function hasMetricDirection(key) {
  return resolveMetricKey(key) != null;
}

/**
 * Whether a smaller raw value is better for this metric.
 *
 * Returns false for an undeclared metric rather than throwing, preserving the
 * behavior of every pre-existing call site. Rankers that must not silently
 * accept an unknown metric call assertMetricDirectionsDeclared first.
 */
export function isLowerBetterMetric(key) {
  const canonical = resolveMetricKey(key);
  return canonical != null && PGA_METRIC_DIRECTION[canonical] === "lower";
}

/**
 * Throw when any supplied metric has no declared direction.
 *
 * This is the loud gate. A new weighted metric added to a ranker without a
 * direction entry would otherwise default to higher-is-better -- exactly the
 * failure mode that inverted bogeyAvoidance.
 */
export function assertMetricDirectionsDeclared(keys, context = "PGA ranker") {
  const undeclared = [...new Set(keys ?? [])].filter((key) => !hasMetricDirection(key));
  if (undeclared.length > 0) {
    throw new Error(
      `${context}: no direction declared for metric(s) ${undeclared.join(", ")}. ` +
        "Add them to PGA_METRIC_DIRECTION in scripts/lib/pga-metric-direction.mjs " +
        "(is a lower raw value better, or a higher one?) before weighting them.",
    );
  }
}
