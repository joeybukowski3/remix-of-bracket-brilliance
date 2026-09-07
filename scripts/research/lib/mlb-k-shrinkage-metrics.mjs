/**
 * RESEARCH ONLY -- study mlb-k-high-line-calibration-v2 (shrinkage experiment)
 *
 * Candidate metric aggregation. Every metric here is computed from
 * (projectedKs, actualKs, kLine). The market line enters ONLY through this
 * module and only for evaluation and bucketing -- never through an alpha
 * function.
 */
import {
  gradeDirection,
  lineBucket,
  mean,
  projectionDirection,
  quantile,
  rmse,
  stdev,
} from "./mlb-k-research-helpers.mjs";

export const round = (value, digits = 4) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? null
    : Math.round(value * 10 ** digits) / 10 ** digits;

const pct = (numerator, denominator, digits = 2) =>
  denominator > 0 ? round((numerator / denominator) * 100, digits) : null;

/** WIN / LOSS / PUSH tally plus the decided hit rate. */
export function tallyDirection(rows, projField) {
  const out = { WIN: 0, LOSS: 0, PUSH: 0 };
  for (const row of rows) {
    const projected = row[projField];
    if (projected === null || projected === undefined || !Number.isFinite(projected)) continue;
    const grade = gradeDirection(projectionDirection(projected, row.kLine), row.actualKs, row.kLine);
    if (grade && out[grade] !== undefined) out[grade] += 1;
  }
  const decided = out.WIN + out.LOSS;
  return { ...out, decided, hitRate: pct(out.WIN, decided) };
}

function signedErrors(rows, projField) {
  return rows
    .filter((row) => Number.isFinite(row[projField]))
    .map((row) => row[projField] - row.actualKs);
}

function underShare(rows, projField) {
  const usable = rows.filter((row) => Number.isFinite(row[projField]));
  if (!usable.length) return null;
  const under = usable.filter((row) => projectionDirection(row[projField], row.kLine) === "under");
  return pct(under.length, usable.length, 1);
}

/** Every metric the experiment reports for one candidate over one row set. */
export function candidateMetrics(rows, projField) {
  const usable = (Array.isArray(rows) ? rows : []).filter((row) => Number.isFinite(row[projField]));
  const projections = usable.map((row) => row[projField]);
  const errors = signedErrors(usable, projField);
  const highLine = usable.filter((row) => row.kLine >= 7);
  const line75 = usable.filter((row) => lineBucket(row.kLine) === "7.5");
  const line85 = usable.filter((row) => lineBucket(row.kLine) === "8.5+");
  const lowMid = usable.filter((row) => row.kLine <= 5.5);
  const low = usable.filter((row) => row.kLine <= 4.5);

  return {
    n: usable.length,
    mae: round(mean(errors.map(Math.abs)), 4),
    rmse: round(rmse(errors), 4),
    signedError: round(mean(errors), 4),
    sdProjectedKs: round(stdev(projections), 4),
    meanProjectedKs: round(mean(projections), 4),
    p75ProjectedKs: round(quantile(projections, 0.75), 4),
    p90ProjectedKs: round(quantile(projections, 0.9), 4),
    p95ProjectedKs: round(quantile(projections, 0.95), 4),
    maxProjectedKs: round(projections.length ? Math.max(...projections) : null, 4),
    pctAtLeast7: pct(usable.filter((row) => row[projField] >= 7).length, usable.length),
    pctAtLeast8: pct(usable.filter((row) => row[projField] >= 8).length, usable.length),
    highLineN: highLine.length,
    highLineSignedError: round(mean(signedErrors(highLine, projField)), 4),
    highLineMae: round(mean(signedErrors(highLine, projField).map(Math.abs)), 4),
    line75N: line75.length,
    line75SignedError: round(mean(signedErrors(line75, projField)), 4),
    line75PctUnder: underShare(line75, projField),
    line85N: line85.length,
    line85SignedError: round(mean(signedErrors(line85, projField)), 4),
    line85PctUnder: underShare(line85, projField),
    lowMidLineN: lowMid.length,
    lowMidLineMae: round(mean(signedErrors(lowMid, projField).map(Math.abs)), 4),
    lowMidLineSignedError: round(mean(signedErrors(lowMid, projField)), 4),
    lowLineN: low.length,
    lowLineMae: round(mean(signedErrors(low, projField).map(Math.abs)), 4),
    pctUnderAll: underShare(usable, projField),
    directionalHitRate: tallyDirection(usable, projField).hitRate,
    directionalRecord: (() => {
      const t = tallyDirection(usable, projField);
      return t.WIN + "-" + t.LOSS + (t.PUSH ? "-" + t.PUSH : "");
    })(),
    directionalHitRateHighLine: tallyDirection(highLine, projField).hitRate,
    directionalRecordHighLine: (() => {
      const t = tallyDirection(highLine, projField);
      return t.WIN + "-" + t.LOSS + (t.PUSH ? "-" + t.PUSH : "");
    })(),
  };
}

/** Generic bucket table: label -> filtered metric row. */
export function bucketTable(rows, projField, buckets) {
  return buckets
    .map((bucket) => {
      const list = (Array.isArray(rows) ? rows : []).filter(bucket.test);
      if (!list.length) return null;
      const errors = signedErrors(list, projField);
      return {
        bucket: bucket.key,
        n: list.length,
        meanLine: round(mean(list.map((row) => row.kLine)), 3),
        meanActual: round(mean(list.map((row) => row.actualKs)), 3),
        meanProjected: round(mean(list.map((row) => row[projField])), 3),
        signedError: round(mean(errors), 3),
        mae: round(mean(errors.map(Math.abs)), 3),
        pctUnder: underShare(list, projField),
        hitRate: tallyDirection(list, projField).hitRate,
      };
    })
    .filter(Boolean);
}

export const LINE_BUCKET_SPEC = [
  { key: "<=3.5", test: (row) => row.kLine <= 3.5 },
  { key: "4.5", test: (row) => row.kLine > 3.5 && row.kLine <= 4.5 },
  { key: "5.5", test: (row) => row.kLine > 4.5 && row.kLine <= 5.5 },
  { key: "6.5", test: (row) => row.kLine > 5.5 && row.kLine <= 6.5 },
  { key: "7.5", test: (row) => row.kLine > 6.5 && row.kLine <= 7.5 },
  { key: "8.5+", test: (row) => row.kLine > 7.5 },
];

export const SAMPLE_SIZE_BUCKET_SPEC = [
  { key: "<100 BF", test: (row) => row.seasonBattersFaced < 100 },
  { key: "100-249 BF", test: (row) => row.seasonBattersFaced >= 100 && row.seasonBattersFaced < 250 },
  { key: "250-399 BF", test: (row) => row.seasonBattersFaced >= 250 && row.seasonBattersFaced < 400 },
  { key: "400+ BF", test: (row) => row.seasonBattersFaced >= 400 },
];

export const WORKLOAD_BUCKET_SPEC = [
  { key: "IP <5", test: (row) => row.v2ProjectedInnings < 5 },
  { key: "IP 5-5.49", test: (row) => row.v2ProjectedInnings >= 5 && row.v2ProjectedInnings < 5.5 },
  { key: "IP 5.5-5.99", test: (row) => row.v2ProjectedInnings >= 5.5 && row.v2ProjectedInnings < 6 },
  { key: "IP 6+", test: (row) => row.v2ProjectedInnings >= 6 },
];

/**
 * Skill buckets are cut on the FULL evaluation set's own skill quantiles.
 * That is a reporting-side stratification only -- the cutpoints never feed an
 * alpha function, so they cannot leak into any projection.
 */
export function skillBucketSpec(rows) {
  const skills = (Array.isArray(rows) ? rows : []).map((row) => row.v2PitcherSkillRate);
  const q25 = quantile(skills, 0.25);
  const q75 = quantile(skills, 0.75);
  const q90 = quantile(skills, 0.9);
  return [
    { key: "skill bottom quartile", test: (row) => row.v2PitcherSkillRate < q25 },
    { key: "skill middle 50%", test: (row) => row.v2PitcherSkillRate >= q25 && row.v2PitcherSkillRate < q75 },
    { key: "skill top quartile", test: (row) => row.v2PitcherSkillRate >= q75 },
    { key: "skill top decile", test: (row) => row.v2PitcherSkillRate >= q90 },
  ];
}
