export function buildReturningProductionMetric({ numerator = null, denominator = null, sourceRefs = [], warnings = [] } = {}) {
  const coverageComplete = denominator != null;
  const value =
    typeof numerator === "number" && typeof denominator === "number" && denominator > 0
      ? Number((numerator / denominator).toFixed(6))
      : null;
  return {
    value,
    numerator,
    denominator,
    coverageComplete,
    sourceRefs,
    warnings,
  };
}

export function metricIsComplete(metric) {
  return Boolean(
    metric &&
      metric.coverageComplete === true &&
      typeof metric.numerator === "number" &&
      typeof metric.denominator === "number" &&
      metric.denominator > 0 &&
      metric.numerator <= metric.denominator &&
      typeof metric.value === "number",
  );
}

export function metricIsUnavailable(metric) {
  return Boolean(
    metric &&
      metric.value == null &&
      metric.numerator == null &&
      metric.denominator == null &&
      metric.coverageComplete === false,
  );
}
