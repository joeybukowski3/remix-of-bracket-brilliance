/**
 * mlb-k-probability-model.mjs
 *
 * SHADOW / INFORMATIONAL ONLY (see docs/features/mlb-k.md and
 * docs/models/mlb-k-score.md "Not this"). Does NOT touch, read, or influence
 * `projectedKs` / K Projection V4 / V2 / legacy, K Score, or the "Best K Prop
 * Bets" value sort. This module answers a different question: given the
 * PUBLISHED projection's own point estimate plus V4's recent-form diagnostics
 * (season / last-10 / last-5 windows and sample-size trust, already computed
 * and persisted in k-props-v2-shadow.json), what is a reasonable probability
 * distribution around that point estimate, and what is P(actual Ks > line)?
 *
 * NO MARKET INPUT INTO THE DISTRIBUTION. `kLine` is used only once, at the
 * very end, to threshold an already-built distribution -- exactly like V4's
 * own "no market input" contract for the projection itself (STEP 9).
 *
 * METHOD -- deterministic seeded Monte Carlo, not a closed-form Poisson.
 * ------------------------------------------------------------------------
 * Each simulation independently perturbs the two things V4 keeps separate
 * (projectedKs = projectedIP x projectedKPerIP):
 *
 *   1. simulatedIP      ~ TruncatedNormal(mean = finalProjectedIP, sd = ipSd)
 *   2. simulatedKPerIP  ~ TruncatedNormal(mean = finalProjectedKPerIP, sd = kPerIpSd)
 *   3. simulatedBF      = simulatedIP x bfPerIP
 *   4. perPaKProbability = clamp(simulatedKPerIP / bfPerIP, MIN_PA_P, MAX_PA_P)
 *   5. simulatedKs       ~ Binomial(round(simulatedBF), perPaKProbability)
 *
 * Step 5 draws an INTEGER strikeout count (STEP 3's "strikeouts must resolve
 * to integer outcomes" / Binomial choice) conditional on that simulation's
 * own workload draw, so workload noise and rate noise compound the way they
 * do in reality instead of being added as independent normal terms on the
 * final count. Because both n (via simulatedBF) and p (via perPaKProbability)
 * vary simulation-to-simulation, the resulting marginal distribution of
 * simulatedKs is over-dispersed relative to a single fixed-n-fixed-p Binomial
 * -- effectively a compound (workload x rate) Binomial, which is exactly the
 * "two uncertainty components" STEP 3 asks for and is closer to a
 * Beta-Binomial than a plain Poisson-around-the-mean. Plain Poisson was
 * rejected per STEP 3's instruction not to assume it without checking
 * dispersion: a fixed-mean Poisson has variance == mean and cannot represent
 * "two pitchers who both project 5.8 Ks but have very different workload/
 * rate stability" (the PHILOSOPHY section's Pitcher A/B example) -- which is
 * the entire point of this layer.
 *
 * DETERMINISM. A pure seeded PRNG (mulberry32) keyed on
 * `${pitcherId}|${slateDate}|${PROBABILITY_MODEL_VERSION}` -- same inputs
 * always produce byte-identical simulated counts, and bumping the model
 * version deliberately reseeds every row rather than silently drifting.
 */

export const K_PROBABILITY_MODEL_VERSION = "mlb-k-probability-shadow-v1";

/** Default simulation count. STEP 3 asks for ~5,000-10,000 per pitcher. */
export const DEFAULT_SIMULATIONS = 8000;

/**
 * Every tunable in one place, same convention as V4_DEFAULTS
 * (mlb-k-projection-v4-core.mjs).
 *
 * BASE_IP_SD / BASE_K_PER_IP_SD are single-start intrinsic volatility floors,
 * not fit to outcome data (this module has no calibrated-variance target the
 * way V4's kPerIpCalibration does) -- see
 * scripts/research/mlb-k-probability-calibration.mjs for the historical
 * calibration check run against them.
 * They are deliberately generous (a "5.8 IP" pitcher is NOT simulated as
 * 5.5-6.1 every time -- STEP "WORKLOAD UNCERTAINTY") and are then widened
 * further by (a) how much the season/last10/last5 windows disagree with each
 * other and (b) how little of a sample (games started / innings) backs the
 * anchor, via the SAME trust formulas V4 itself uses
 * (games/(games+leagueIPPriorStarts), innings/(innings+leagueKPriorInnings)).
 */
export const PROBABILITY_MODEL_DEFAULTS = Object.freeze({
  baseIpSd: 1.35,
  minIpSd: 0.8,
  maxIpSd: 2.6,
  ipSpreadMultiplier: 0.5,
  ipTrustMultiplier: 0.6,
  ipClamp: [0, 9],

  baseKPerIpSd: 0.22,
  minKPerIpSd: 0.1,
  maxKPerIpSd: 0.55,
  kSpreadMultiplier: 1,
  kTrustMultiplier: 0.6,
  kPerIpClamp: [0.05, 2.4],

  // Same league-prior shrinkage strengths as V4_DEFAULTS, duplicated here
  // (not imported) so this module has zero coupling to the projection core
  // and can never accidentally read/change a projection constant.
  leagueIPPriorStarts: 3,
  leagueKPriorInnings: 30,

  perPaProbabilityClamp: [0.02, 0.65],
  leagueBfPerIPFallback: 4.3,

  // Confidence bucketing -- deliberately mirrors V4's own confidenceScore
  // thresholds (0.66 / 0.45) so "HIGH/MEDIUM/LOW" here means the same thing
  // a reader of the V4 debug panel already expects, but this is confidence
  // in the SHAPE of the probability estimate, not in a bet -- see STEP 5.
  highConfidenceThreshold: 0.66,
  mediumConfidenceThreshold: 0.4,
});

const finite = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

const round = (value, digits = 4) =>
  finite(value) === null ? null : Math.round(Number(value) * 10 ** digits) / 10 ** digits;

/** FNV-1a string hash -> 32-bit unsigned seed. Deterministic across platforms/Node versions. */
function hashSeed(text) {
  let hash = 0x811c9dc5;
  const str = String(text);
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 -- small, fast, deterministic PRNG. Returns a function producing floats in [0, 1). */
export function createSeededRng(seed) {
  let a = typeof seed === "number" ? seed >>> 0 : hashSeed(seed);
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Builds the deterministic seed string for one pitcher/slate/model-version. */
export function buildSimulationSeed(pitcherId, slateDate, modelVersion = K_PROBABILITY_MODEL_VERSION) {
  return `${pitcherId ?? "unknown"}|${slateDate ?? "unknown"}|${modelVersion}`;
}

/** Box-Muller standard normal draw from a [0,1) uniform RNG. */
function standardNormal(rng) {
  let u1 = rng();
  while (u1 <= 1e-12) u1 = rng();
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Normal draw truncated (by resample, capped retries, then clamp) to [min, max]. */
function truncatedNormal(rng, mean, sd, min, max, maxRetries = 8) {
  if (sd <= 0) return clamp(mean, min, max);
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const draw = mean + standardNormal(rng) * sd;
    if (draw >= min && draw <= max) return draw;
  }
  return clamp(mean, min, max);
}

/** Exact Binomial(n, p) draw as a sum of Bernoulli trials -- n is small (roughly 10-35 batters faced per start), so this is cheap and exact rather than a normal approximation. */
function binomialDraw(rng, trials, probability) {
  const n = Math.max(0, Math.round(trials));
  if (n === 0 || probability <= 0) return 0;
  if (probability >= 1) return n;
  let successes = 0;
  for (let i = 0; i < n; i++) {
    if (rng() < probability) successes += 1;
  }
  return successes;
}

/**
 * Weighted spread of up to three window values (season/last10/last5), used as
 * a volatility signal -- (max - min) / 2 over whichever windows are present.
 * Returns 0 (not null) when fewer than two windows are available, since a
 * missing recent window is "no extra signal", not "extra uncertainty" (the
 * trust term below already captures thin-sample uncertainty separately).
 */
function windowSpread(values) {
  const present = values.filter((value) => finite(value) !== null);
  if (present.length < 2) return 0;
  return (Math.max(...present) - Math.min(...present)) / 2;
}

/**
 * League-prior shrinkage trust, identical formula to V4's own
 * `games/(games+leagueIPPriorStarts)` and `innings/(innings+leagueKPriorInnings)`
 * -- see mlb-k-projection-v4-core.mjs. Recomputed here (not read off the V4
 * block) for two reasons: (1) this module has zero coupling to the
 * projection core by design, and (2) mlb-k-projection-v4-core.mjs's merged
 * output used to publish both trusts under the same key `leagueTrust`
 * (projectStrikeoutsV4 spreads `...innings, ...kPerInning`, and both stages
 * used to return that name), which silently let the K-side value win for
 * ANY reader of the merged object -- confirmed diagnostics-only (it never
 * fed back into `finalProjectedIP` / `finalProjectedKPerIP` / `confidence` /
 * `projectedKs`, all of which are computed from the local, unmerged
 * `innings`/`kPerInning` objects before the merge) and now fixed there via
 * distinct `workloadLeagueTrust` / `kRateLeagueTrust` keys. This module
 * still recomputes independently rather than reading either key, so it
 * behaves identically against an older cached v4 block that predates that
 * fix.
 */
export function computeTrust(sampleSize, priorStrength) {
  const n = finite(sampleSize) ?? 0;
  if (n <= 0) return 0;
  return n / (n + priorStrength);
}

/**
 * Workload (innings) uncertainty standard deviation for one pitcher/slate.
 * Wider when the season/last10/last5 windows disagree with each other and
 * when the sample backing the anchor (games started) is thin.
 */
export function computeIpStandardDeviation(input, config = PROBABILITY_MODEL_DEFAULTS) {
  const cfg = { ...PROBABILITY_MODEL_DEFAULTS, ...config };
  const spread = windowSpread([input.seasonIPPerStart, input.last10IPPerStart, input.last5IPPerStart]);
  const trust = computeTrust(input.seasonGamesStarted, cfg.leagueIPPriorStarts);
  const sd = cfg.baseIpSd * (1 + spread * cfg.ipSpreadMultiplier) * (1 + (1 - trust) * cfg.ipTrustMultiplier);
  return { sd: clamp(sd, cfg.minIpSd, cfg.maxIpSd), spread, trust };
}

/**
 * Strikeout-rate (K per inning) uncertainty standard deviation for one
 * pitcher/slate. Same shape as computeIpStandardDeviation but keyed on
 * innings pitched (the sample size K/IP is regressed against) rather than
 * games started.
 */
export function computeKPerIpStandardDeviation(input, config = PROBABILITY_MODEL_DEFAULTS) {
  const cfg = { ...PROBABILITY_MODEL_DEFAULTS, ...config };
  const spread = windowSpread([input.seasonKPerIP, input.last10KPerIP, input.last5KPerIP]);
  const trust = computeTrust(input.seasonInnings, cfg.leagueKPriorInnings);
  const sd = cfg.baseKPerIpSd * (1 + spread * cfg.kSpreadMultiplier) * (1 + (1 - trust) * cfg.kTrustMultiplier);
  return { sd: clamp(sd, cfg.minKPerIpSd, cfg.maxKPerIpSd), spread, trust };
}

/**
 * Runs the full deterministic Monte Carlo and returns a strikeout-count
 * frequency distribution (`counts[k]` = number of simulations landing on
 * exactly k strikeouts) plus the diagnostics needed to explain it. No line,
 * no market -- see probabilityFromCounts for that.
 */
export function simulateStrikeoutDistribution(input, options = {}) {
  const cfg = { ...PROBABILITY_MODEL_DEFAULTS, ...(options.config ?? {}) };
  const simulations = Number.isFinite(options.simulations) && options.simulations > 0
    ? Math.round(options.simulations)
    : DEFAULT_SIMULATIONS;

  const finalProjectedIP = finite(input.finalProjectedIP);
  const finalProjectedKPerIP = finite(input.finalProjectedKPerIP);
  const bfPerIP = finite(input.bfPerIP) ?? cfg.leagueBfPerIPFallback;

  if (finalProjectedIP === null || finalProjectedKPerIP === null || finalProjectedIP <= 0 || finalProjectedKPerIP <= 0) {
    return {
      ok: false,
      reason: "MISSING_PROJECTION_INPUTS",
      counts: [],
      simulations: 0,
      maxK: 0,
      ipSd: null,
      kPerIpSd: null,
      ipTrust: null,
      kTrust: null,
    };
  }

  const ipStats = computeIpStandardDeviation(input, cfg);
  const kStats = computeKPerIpStandardDeviation(input, cfg);

  const seed = options.seed ?? buildSimulationSeed(input.pitcherId, input.slateDate, options.modelVersion);
  const rng = createSeededRng(seed);

  // Generous headroom above any plausible starter K count -- a bound for the
  // counts array, not a distribution clamp.
  const maxK = 25;
  const counts = new Array(maxK + 1).fill(0);

  for (let i = 0; i < simulations; i++) {
    const simulatedIP = truncatedNormal(rng, finalProjectedIP, ipStats.sd, cfg.ipClamp[0], cfg.ipClamp[1]);
    const simulatedKPerIP = truncatedNormal(rng, finalProjectedKPerIP, kStats.sd, cfg.kPerIpClamp[0], cfg.kPerIpClamp[1]);
    const simulatedBF = simulatedIP * bfPerIP;
    const perPaProbability = clamp(simulatedKPerIP / bfPerIP, cfg.perPaProbabilityClamp[0], cfg.perPaProbabilityClamp[1]);
    const simulatedKs = binomialDraw(rng, simulatedBF, perPaProbability);
    counts[Math.min(simulatedKs, maxK)] += 1;
  }

  return {
    ok: true,
    reason: null,
    counts,
    simulations,
    maxK,
    ipSd: round(ipStats.sd, 4),
    ipSpread: round(ipStats.spread, 4),
    ipTrust: round(ipStats.trust, 4),
    kPerIpSd: round(kStats.sd, 4),
    kPerIpSpread: round(kStats.spread, 4),
    kTrust: round(kStats.trust, 4),
    bfPerIP: round(bfPerIP, 4),
    seed: typeof seed === "string" ? seed : String(seed),
    modelVersion: options.modelVersion ?? K_PROBABILITY_MODEL_VERSION,
  };
}

/** Mean/median/stdev of a counts[] frequency distribution -- for display and calibration. */
export function distributionSummary(counts, simulations) {
  if (!simulations) return { mean: null, median: null, stdev: null };
  let sum = 0;
  for (let k = 0; k < counts.length; k++) sum += k * counts[k];
  const mean = sum / simulations;

  let variance = 0;
  for (let k = 0; k < counts.length; k++) variance += counts[k] * (k - mean) ** 2;
  variance /= simulations;

  let cumulative = 0;
  let median = null;
  for (let k = 0; k < counts.length; k++) {
    cumulative += counts[k];
    if (median === null && cumulative >= simulations / 2) median = k;
  }

  return { mean: round(mean, 3), median, stdev: round(Math.sqrt(variance), 3) };
}

/**
 * P(actual Ks > line) and P(actual Ks < line) from a counts[] distribution.
 * For a half-point line (the normal case -- MIN_ELIGIBLE_K_LINE-eligible
 * lines are always X.5 in this repo) over + under sum to exactly 1 by
 * construction, since every simulated count is an integer and none can equal
 * a half-point line. For an integer line the push mass is excluded from
 * both, so over + under can be < 1 -- documented rather than hidden.
 */
export function probabilityFromCounts(counts, simulations, line) {
  const lineValue = finite(line);
  if (!simulations || lineValue === null) return { overProbability: null, underProbability: null, pushProbability: null };

  let overCount = 0;
  let underCount = 0;
  let pushCount = 0;
  for (let k = 0; k < counts.length; k++) {
    if (k > lineValue) overCount += counts[k];
    else if (k < lineValue) underCount += counts[k];
    else pushCount += counts[k];
  }

  return {
    overProbability: round(overCount / simulations, 4),
    underProbability: round(underCount / simulations, 4),
    pushProbability: pushCount > 0 ? round(pushCount / simulations, 4) : 0,
  };
}

/**
 * Confidence descriptor for the PROBABILITY ESTIMATE ITSELF (not for whether
 * a bet will win -- STEP 5: "A 52% probability can still have HIGH model
 * confidence."). Blends IP trust, K-rate trust, and how many opponent-side
 * observations backed V4's environment term when available.
 */
export function describeProbabilityConfidence(ipTrust, kTrust, opponentConfidence = null, config = PROBABILITY_MODEL_DEFAULTS) {
  const cfg = { ...PROBABILITY_MODEL_DEFAULTS, ...config };
  const parts = [finite(ipTrust) ?? 0, finite(kTrust) ?? 0];
  if (finite(opponentConfidence) !== null) parts.push(finite(opponentConfidence));
  const score = parts.reduce((sum, part) => sum + part, 0) / parts.length;
  const grade = score >= cfg.highConfidenceThreshold ? "HIGH" : score >= cfg.mediumConfidenceThreshold ? "MEDIUM" : "LOW";
  return { score: round(score, 4), grade };
}
