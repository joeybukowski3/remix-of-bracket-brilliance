export const WORKLOAD_MODEL_VERSION = "mlb-k-workload-v1";

export function toFiniteNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeRate(value) {
  const parsed = toFiniteNumber(value);
  if (parsed == null) return null;
  return parsed > 1.5 ? parsed / 100 : parsed;
}

export function clamp(value, minimum, maximum) {
  if (!Number.isFinite(value)) return null;
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, digits = 3) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function weightedAverage(entries) {
  let total = 0;
  let weight = 0;
  for (const entry of entries) {
    if (!Number.isFinite(entry?.value) || !Number.isFinite(entry?.weight) || entry.weight <= 0) continue;
    total += entry.value * entry.weight;
    weight += entry.weight;
  }
  return weight > 0 ? total / weight : null;
}

function recentWeightedAverage(starts, key) {
  const valid = starts
    .map((start, index) => ({ value: toFiniteNumber(start?.[key]), weight: index + 1 }))
    .filter((entry) => Number.isFinite(entry.value));
  return weightedAverage(valid);
}

function aggregateRate(starts, numeratorKey) {
  let numerator = 0;
  let denominator = 0;
  for (const start of starts) {
    const bf = toFiniteNumber(start?.battersFaced);
    if (bf == null || bf <= 0) continue;
    denominator += bf;
    numerator += toFiniteNumber(start?.[numeratorKey], 0);
  }
  return denominator > 0 ? numerator / denominator : null;
}

export function computeWorkloadProjection({
  workloadData = {},
  pitcher = {},
  opponent = {},
  league = {},
  context = {},
} = {}) {
  const flags = new Set(workloadData?.completeness?.flags ?? []);
  const starts = Array.isArray(workloadData?.starts) ? workloadData.starts : [];

  const leaguePitches = toFiniteNumber(league.starterAveragePitches, 86);
  const leaguePpa = toFiniteNumber(league.pitchesPerPA, 3.9);
  const opponentSeasonPpa = toFiniteNumber(opponent.seasonPitchesPerPA);
  const opponentRecentPpa = toFiniteNumber(opponent.recent14PitchesPerPA);
  const opponentPpa = weightedAverage([
    { value: opponentSeasonPpa, weight: 0.75 },
    { value: opponentRecentPpa, weight: 0.25 },
  ]) ?? leaguePpa;

  const recentPitchAverage = recentWeightedAverage(starts, "pitches");
  const recentBfAverage = recentWeightedAverage(starts, "battersFaced");
  const recentIpAverage = recentWeightedAverage(starts, "inningsPitched");

  if (starts.length < 3) flags.add("LOW_RECENT_START_SAMPLE");
  if (recentPitchAverage == null) flags.add("RECENT_PITCH_COUNTS_MISSING");

  const expectedPitchLimit = clamp(
    weightedAverage([
      { value: recentPitchAverage, weight: starts.length >= 3 ? 0.72 : 0.45 },
      { value: leaguePitches, weight: starts.length >= 3 ? 0.28 : 0.55 },
    ]) ?? leaguePitches,
    55,
    115,
  );

  const expectedBFByPitches = expectedPitchLimit / Math.max(3.2, opponentPpa);
  const expectedBF = clamp(
    weightedAverage([
      { value: expectedBFByPitches, weight: 0.65 },
      { value: recentBfAverage, weight: 0.35 },
    ]) ?? expectedBFByPitches,
    12,
    30,
  );

  const expectedInnings = clamp(
    weightedAverage([
      { value: recentIpAverage, weight: 0.7 },
      { value: expectedBF * toFiniteNumber(league.outsPerBF, 0.72) / 3, weight: 0.3 },
    ]) ?? expectedBF * 0.72 / 3,
    3,
    8.5,
  );

  const seasonRate = normalizeRate(pitcher.seasonKRate);
  const recentRate = normalizeRate(pitcher.recentKRate) ?? aggregateRate(starts, "strikeouts");
  const whiffRate = normalizeRate(pitcher.whiffRate);
  const leagueKRate = normalizeRate(league.kRate) ?? 0.225;
  const leagueWhiffRate = normalizeRate(league.whiffRate) ?? 0.25;

  if (seasonRate == null) flags.add("PITCHER_SEASON_K_RATE_MISSING");
  if (recentRate == null) flags.add("PITCHER_RECENT_K_RATE_MISSING");

  const whiffSupportedRate = whiffRate == null
    ? null
    : leagueKRate + (whiffRate - leagueWhiffRate) * 0.55;

  const temporaryKRate = clamp(
    weightedAverage([
      { value: seasonRate, weight: 0.55 },
      { value: recentRate, weight: 0.2 },
      { value: whiffSupportedRate, weight: 0.15 },
      { value: leagueKRate, weight: 0.1 },
    ]) ?? leagueKRate,
    0.12,
    0.38,
  );

  const workloadOnlyProjectedKs = expectedBF * temporaryKRate;
  const completeness = toFiniteNumber(workloadData?.completeness?.score, 0);
  const confidenceScore = clamp(
    0.5 * completeness
      + 0.2 * Math.min(1, starts.length / 5)
      + 0.15 * (seasonRate != null ? 1 : 0)
      + 0.15 * (opponentSeasonPpa != null ? 1 : 0),
    0,
    1,
  );
  const grade = confidenceScore >= 0.82 ? "A" : confidenceScore >= 0.66 ? "B" : confidenceScore >= 0.45 ? "C" : "D";

  if (context.listedProbableStarter !== true) flags.add("STARTER_NOT_CONFIRMED");

  return {
    modelVersion: WORKLOAD_MODEL_VERSION,
    inputs: {
      recentStarts: starts.length,
      recentPitchAverage: round(recentPitchAverage, 2),
      recentBfAverage: round(recentBfAverage, 2),
      opponentPitchesPerPA: round(opponentPpa, 3),
    },
    projection: {
      expectedPitchLimit: round(expectedPitchLimit, 2),
      expectedBF: round(expectedBF, 3),
      expectedInnings: round(expectedInnings, 3),
      temporaryKRate: round(temporaryKRate, 4),
      workloadOnlyProjectedKs: round(workloadOnlyProjectedKs, 3),
    },
    confidence: {
      score: round(confidenceScore, 3),
      grade,
      publicEligible: ["A", "B"].includes(grade),
    },
    flags: [...flags],
  };
}

export default computeWorkloadProjection;
