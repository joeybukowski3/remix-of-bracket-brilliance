export const WORKLOAD_MODEL_VERSION = "mlb-k-workload-v2";

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

function recentWeightedAverage(appearances, key) {
  const valid = appearances
    .map((appearance, index) => ({ value: toFiniteNumber(appearance?.[key]), weight: index + 1 }))
    .filter((entry) => Number.isFinite(entry.value));
  return weightedAverage(valid);
}

function aggregateRate(appearances, numeratorKey) {
  let numerator = 0;
  let denominator = 0;
  for (const appearance of appearances) {
    const bf = toFiniteNumber(appearance?.battersFaced);
    if (bf == null || bf <= 0) continue;
    denominator += bf;
    numerator += toFiniteNumber(appearance?.[numeratorKey], 0);
  }
  return denominator > 0 ? numerator / denominator : null;
}

export function classifyWorkloadRole(workloadData = {}) {
  const counts = workloadData?.completeness?.counts ?? {};
  const currentAppearances = toFiniteNumber(counts.currentSeasonAppearances, 0);
  const currentStarts = toFiniteNumber(counts.currentSeasonStarterAppearances, 0);
  const currentReliefAppearances = toFiniteNumber(counts.currentSeasonReliefAppearances, 0);
  const starterSamples = Array.isArray(workloadData?.starts) ? workloadData.starts : [];
  const recentStarterIp = recentWeightedAverage(starterSamples, "inningsPitched");
  const reliefShare = currentAppearances > 0 ? currentReliefAppearances / currentAppearances : 0;

  if (currentAppearances >= 3 && currentStarts <= 1 && reliefShare >= 0.7) return "reliever";
  if (currentStarts >= 2 && recentStarterIp != null && recentStarterIp <= 2.5) return "opener";
  return "starter";
}

const ROLE_LIMITS = Object.freeze({
  starter: {
    defaultPitches: 86,
    pitchMin: 55,
    pitchMax: 115,
    bfMin: 12,
    bfMax: 30,
    ipMin: 3,
    ipMax: 8.5,
  },
  opener: {
    defaultPitches: 38,
    pitchMin: 15,
    pitchMax: 55,
    bfMin: 4,
    bfMax: 14,
    ipMin: 0.7,
    ipMax: 4,
  },
  reliever: {
    defaultPitches: 22,
    pitchMin: 8,
    pitchMax: 40,
    bfMin: 2,
    bfMax: 10,
    ipMin: 0.1,
    ipMax: 3,
  },
});

export function computeWorkloadProjection({
  workloadData = {},
  pitcher = {},
  opponent = {},
  league = {},
  context = {},
} = {}) {
  const flags = new Set(workloadData?.completeness?.flags ?? []);
  const starts = Array.isArray(workloadData?.starts) ? workloadData.starts : [];
  const recentAppearances = Array.isArray(workloadData?.recentAppearances) ? workloadData.recentAppearances : [];
  const role = context.role ?? classifyWorkloadRole(workloadData);
  const limits = ROLE_LIMITS[role] ?? ROLE_LIMITS.starter;
  const samples = role === "reliever"
    ? recentAppearances
    : role === "opener"
      ? (starts.length ? starts : recentAppearances)
      : starts;

  if (role === "reliever") flags.add("RELIEVER_WORKLOAD_CAP");
  if (role === "opener") flags.add("OPENER_WORKLOAD_CAP");

  const leaguePitches = role === "reliever"
    ? toFiniteNumber(league.relieverAveragePitches, limits.defaultPitches)
    : role === "opener"
      ? toFiniteNumber(league.openerAveragePitches, limits.defaultPitches)
      : toFiniteNumber(league.starterAveragePitches, limits.defaultPitches);
  const leaguePpa = toFiniteNumber(league.pitchesPerPA, 3.9);
  const opponentSeasonPpa = toFiniteNumber(opponent.seasonPitchesPerPA);
  const opponentRecentPpa = toFiniteNumber(opponent.recent14PitchesPerPA);
  const opponentPpa = weightedAverage([
    { value: opponentSeasonPpa, weight: 0.75 },
    { value: opponentRecentPpa, weight: 0.25 },
  ]) ?? leaguePpa;

  const recentPitchAverage = recentWeightedAverage(samples, "pitches");
  const recentBfAverage = recentWeightedAverage(samples, "battersFaced");
  const recentIpAverage = recentWeightedAverage(samples, "inningsPitched");

  if (samples.length < 3) flags.add("LOW_RECENT_APPEARANCE_SAMPLE");
  if (recentPitchAverage == null) flags.add("RECENT_PITCH_COUNTS_MISSING");

  const expectedPitchLimit = clamp(
    weightedAverage([
      { value: recentPitchAverage, weight: samples.length >= 3 ? 0.72 : 0.45 },
      { value: leaguePitches, weight: samples.length >= 3 ? 0.28 : 0.55 },
    ]) ?? leaguePitches,
    limits.pitchMin,
    limits.pitchMax,
  );

  const expectedBFByPitches = expectedPitchLimit / Math.max(3.2, opponentPpa);
  const expectedBF = clamp(
    weightedAverage([
      { value: expectedBFByPitches, weight: 0.65 },
      { value: recentBfAverage, weight: 0.35 },
    ]) ?? expectedBFByPitches,
    limits.bfMin,
    limits.bfMax,
  );

  const expectedInnings = clamp(
    weightedAverage([
      { value: recentIpAverage, weight: 0.7 },
      { value: expectedBF * toFiniteNumber(league.outsPerBF, 0.72) / 3, weight: 0.3 },
    ]) ?? expectedBF * 0.72 / 3,
    limits.ipMin,
    limits.ipMax,
  );

  const seasonRate = normalizeRate(pitcher.seasonKRate);
  const recentRate = normalizeRate(pitcher.recentKRate) ?? aggregateRate(samples, "strikeouts");
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
      + 0.2 * Math.min(1, samples.length / 5)
      + 0.15 * (seasonRate != null || recentRate != null ? 1 : 0)
      + 0.15 * (opponentSeasonPpa != null ? 1 : 0),
    0,
    1,
  );
  const grade = confidenceScore >= 0.82 ? "A" : confidenceScore >= 0.66 ? "B" : confidenceScore >= 0.45 ? "C" : "D";

  if (context.listedProbableStarter !== true) flags.add("STARTER_NOT_CONFIRMED");

  return {
    modelVersion: WORKLOAD_MODEL_VERSION,
    role,
    inputs: {
      role,
      recentSamples: samples.length,
      recentStarts: starts.length,
      recentAppearances: recentAppearances.length,
      recentPitchAverage: round(recentPitchAverage, 2),
      recentBfAverage: round(recentBfAverage, 2),
      recentIpAverage: round(recentIpAverage, 2),
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
