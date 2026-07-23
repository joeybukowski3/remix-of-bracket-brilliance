import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const DEFAULT_ARTIFACT_PATH = path.join(ROOT, "public", "data", "mlb", "k-props-v2-shadow.json");

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function rmse(errors) {
  const valid = errors.filter(Number.isFinite);
  return valid.length ? Math.sqrt(valid.reduce((sum, value) => sum + value ** 2, 0) / valid.length) : null;
}

function correlation(pairs) {
  const valid = pairs.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  if (valid.length < 2) return null;
  const meanA = average(valid.map(([a]) => a));
  const meanB = average(valid.map(([, b]) => b));
  const numerator = valid.reduce((sum, [a, b]) => sum + (a - meanA) * (b - meanB), 0);
  const denomA = Math.sqrt(valid.reduce((sum, [a]) => sum + (a - meanA) ** 2, 0));
  const denomB = Math.sqrt(valid.reduce((sum, [, b]) => sum + (b - meanB) ** 2, 0));
  return denomA > 0 && denomB > 0 ? numerator / (denomA * denomB) : null;
}

function increment(map, key, amount = 1) {
  map[key] = (map[key] ?? 0) + amount;
}

function flattenAvailability(prefix, value, output = {}) {
  if (!value || typeof value !== "object") return output;
  for (const [key, child] of Object.entries(value)) {
    const pathKey = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "boolean") output[pathKey] = child;
    else if (child && typeof child === "object" && !Array.isArray(child)) flattenAvailability(pathKey, child, output);
  }
  return output;
}

function missingInputs(row) {
  const availability = flattenAvailability("", row?.inputs?.availability ?? {});
  return Object.entries(availability).filter(([, available]) => available === false).map(([key]) => key);
}

function summarizeCurrentSlate(artifact) {
  const rows = (artifact?.rows ?? []).map((row) => {
    const legacyProjection = finiteNumber(row?.legacy?.projectedKs);
    const v2Projection = finiteNumber(row?.v2?.projectedStrikeouts);
    const kLine = finiteNumber(row?.market?.kLine);
    const difference = legacyProjection != null && v2Projection != null ? v2Projection - legacyProjection : null;

    return {
      pitcher: row?.pitcher?.name ?? null,
      team: row?.pitcher?.team ?? null,
      opponent: row?.pitcher?.opponent ?? null,
      legacyProjection,
      v2Projection,
      difference: round(difference),
      absoluteDifference: difference == null ? null : round(Math.abs(difference)),
      kLine,
      legacyEdge: legacyProjection != null && kLine != null ? round(legacyProjection - kLine) : null,
      v2Edge: v2Projection != null && kLine != null ? round(v2Projection - kLine) : null,
      confidence: row?.v2?.confidence ?? null,
      fallbackCount: row?.v2?.fallbacks?.length ?? 0,
      missingInputs: missingInputs(row),
    };
  });

  const differences = rows.map((row) => row.difference).filter(Number.isFinite);
  const absDifferences = rows.map((row) => row.absoluteDifference).filter(Number.isFinite);
  const confidenceDistribution = {};
  const fallbackCounts = {};
  const nullCountsByInputField = {};

  for (const row of artifact?.rows ?? []) {
    increment(confidenceDistribution, row?.v2?.confidence ?? "unknown");
    increment(fallbackCounts, String(row?.v2?.fallbacks?.length ?? 0));
    for (const input of missingInputs(row)) increment(nullCountsByInputField, input);
  }

  const maxRow = rows.reduce((best, row) => {
    if (row.absoluteDifference == null) return best;
    if (!best || row.absoluteDifference > best.absoluteDifference) return row;
    return best;
  }, null);

  return {
    mode: "current-slate",
    slateDate: artifact?.slateDate ?? null,
    rows,
    aggregate: {
      rowCount: rows.length,
      averageAbsoluteDifference: round(average(absDifferences)),
      maximumDifference: maxRow == null ? null : { pitcher: maxRow.pitcher, absoluteDifference: maxRow.absoluteDifference, difference: maxRow.difference },
      meanSignedDifference: round(average(differences)),
      confidenceDistribution,
      fallbackCounts,
      nullCountsByInputField,
    },
  };
}

function bucketKLine(line) {
  if (!Number.isFinite(line)) return "unknown";
  if (line < 4.5) return "under_4_5";
  if (line <= 6.5) return "4_5_to_6_5";
  return "over_6_5";
}

function bucketOpponentKRate(rate) {
  if (!Number.isFinite(rate)) return "unknown";
  if (rate < 0.21) return "low";
  if (rate < 0.245) return "medium";
  return "high";
}

function addBucket(buckets, key, legacyError, v2Error) {
  const bucket = buckets[key] ?? { sampleSize: 0, legacyErrors: [], v2Errors: [] };
  bucket.sampleSize += 1;
  bucket.legacyErrors.push(legacyError);
  bucket.v2Errors.push(v2Error);
  buckets[key] = bucket;
}

function finalizeBuckets(buckets) {
  return Object.fromEntries(Object.entries(buckets).map(([key, bucket]) => [
    key,
    {
      sampleSize: bucket.sampleSize,
      legacyMAE: round(average(bucket.legacyErrors.map(Math.abs))),
      v2MAE: round(average(bucket.v2Errors.map(Math.abs))),
      legacyBias: round(average(bucket.legacyErrors)),
      v2Bias: round(average(bucket.v2Errors)),
    },
  ]));
}

function summarizeHistorical(records) {
  const usable = (records ?? []).map((record) => ({
    actual: finiteNumber(record.actualStrikeouts),
    legacy: finiteNumber(record.legacyProjection ?? record.legacyProjectedKs),
    v2: finiteNumber(record.v2Projection ?? record.v2ProjectedStrikeouts),
    pitcherIsHome: record.pitcherIsHome,
    handedness: record.handedness ?? record.pitcherHandedness ?? "unknown",
    kLine: finiteNumber(record.kLine),
    opponentKRate: finiteNumber(record.opponentKRate),
    confidence: record.confidence ?? "unknown",
    completeness: record.completeness ?? record.confidence ?? "unknown",
  })).filter((record) => record.actual != null && record.legacy != null && record.v2 != null);

  if (!usable.length) {
    return {
      status: "INSUFFICIENT_HISTORICAL_DATA",
      requiredSnapshotSchema: {
        actualStrikeouts: "number",
        legacyProjection: "number",
        v2Projection: "number",
        pitcherIsHome: "boolean|null",
        handedness: '"L"|"R"|null',
        kLine: "number|null",
        opponentKRate: "number|null",
        confidence: "string|null",
        completeness: "string|null",
      },
    };
  }

  const legacyErrors = usable.map((record) => record.legacy - record.actual);
  const v2Errors = usable.map((record) => record.v2 - record.actual);
  const buckets = {
    homeAway: {},
    handedness: {},
    kLine: {},
    opponentKRate: {},
    confidence: {},
    completeness: {},
  };

  for (const record of usable) {
    const legacyError = record.legacy - record.actual;
    const v2Error = record.v2 - record.actual;
    addBucket(buckets.homeAway, record.pitcherIsHome === true ? "home" : record.pitcherIsHome === false ? "away" : "unknown", legacyError, v2Error);
    addBucket(buckets.handedness, record.handedness ?? "unknown", legacyError, v2Error);
    addBucket(buckets.kLine, bucketKLine(record.kLine), legacyError, v2Error);
    addBucket(buckets.opponentKRate, bucketOpponentKRate(record.opponentKRate), legacyError, v2Error);
    addBucket(buckets.confidence, record.confidence ?? "unknown", legacyError, v2Error);
    addBucket(buckets.completeness, record.completeness ?? "unknown", legacyError, v2Error);
  }

  return {
    status: "OK",
    sampleSize: usable.length,
    legacyMAE: round(average(legacyErrors.map(Math.abs))),
    v2MAE: round(average(v2Errors.map(Math.abs))),
    legacyRMSE: round(rmse(legacyErrors)),
    v2RMSE: round(rmse(v2Errors)),
    legacyBias: round(average(legacyErrors)),
    v2Bias: round(average(v2Errors)),
    correlationWithActualStrikeouts: {
      legacy: round(correlation(usable.map((record) => [record.legacy, record.actual]))),
      v2: round(correlation(usable.map((record) => [record.v2, record.actual]))),
    },
    buckets: {
      homeAway: finalizeBuckets(buckets.homeAway),
      handedness: finalizeBuckets(buckets.handedness),
      kLine: finalizeBuckets(buckets.kLine),
      opponentKRate: finalizeBuckets(buckets.opponentKRate),
      confidence: finalizeBuckets(buckets.confidence),
      completeness: finalizeBuckets(buckets.completeness),
    },
    note: "Synthetic fixtures may validate calculations but are not evidence of model improvement.",
  };
}

export function runCurrentSlateComparison(artifactPath = DEFAULT_ARTIFACT_PATH) {
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  return summarizeCurrentSlate(artifact);
}

export function runHistoricalBacktest(historyPath) {
  if (!historyPath || !existsSync(historyPath)) return summarizeHistorical([]);
  const payload = JSON.parse(readFileSync(historyPath, "utf8"));
  return summarizeHistorical(Array.isArray(payload) ? payload : payload.records);
}

export function main(argv = process.argv.slice(2)) {
  const value = (prefix) => argv.find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
  const historicalPath = value("--history=");
  const artifactPath = value("--artifact=") ?? DEFAULT_ARTIFACT_PATH;
  const result = historicalPath ? runHistoricalBacktest(historicalPath) : runCurrentSlateComparison(artifactPath);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`[backtest-mlb-k-projection-v2] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
