/**
 * Application-side access to the authoritative PGA metric-direction map.
 *
 * A thin re-export, deliberately holding NO values of its own. The single
 * source of truth is scripts/lib/pga-metric-direction.mjs so that the Node
 * generators and the browser bundle can never disagree about whether a
 * smaller raw value is better -- the divergence that shipped inverted
 * Power Rankings to production.
 */
export {
  PGA_METRIC_DIRECTION,
  assertMetricDirectionsDeclared,
  hasMetricDirection,
  isLowerBetterMetric,
  normalizeMetricKey,
  resolveMetricKey,
} from "../../../scripts/lib/pga-metric-direction.mjs";

export type { PgaMetricDirection } from "../../../scripts/lib/pga-metric-direction.mjs";
