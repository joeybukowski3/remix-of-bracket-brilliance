/**
 * Type surface for the authoritative PGA metric-direction map.
 *
 * Declarations only -- the values live solely in pga-metric-direction.mjs so
 * TypeScript consumers and plain-Node generators can never disagree.
 */

export type PgaMetricDirection = "higher" | "lower";

export declare const PGA_METRIC_DIRECTION: Readonly<Record<string, PgaMetricDirection>>;

export declare function normalizeMetricKey(key: unknown): string;

export declare function resolveMetricKey(key: unknown): string | null;

export declare function hasMetricDirection(key: unknown): boolean;

export declare function isLowerBetterMetric(key: unknown): boolean;

export declare function assertMetricDirectionsDeclared(
  keys: readonly unknown[] | null | undefined,
  context?: string,
): void;
