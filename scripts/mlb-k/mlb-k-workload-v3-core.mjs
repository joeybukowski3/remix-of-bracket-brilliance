/**
 * mlb-k-workload-v3 -- pitcher-side workload primitives.
 *
 * This is a NEW module. scripts/mlb-k/compute-workload-projection.mjs (the v2
 * production workload model) is not modified and not imported here; v2 and v3
 * are reproducible side by side.
 *
 * Every function is pure, deterministic and pregame-only. None of them may read
 * a market line, a Vegas total, or any field of the game being projected. A
 * "start" here is always a COMPLETED prior start.
 *
 * A start record has the shape:
 *   { date, ip, outs, bf, pitches, strikeouts, hits, walks, isHome }
 * Earned runs are not available in the JKB start sources, so the reliability
 * model uses baserunners (hits + walks) and batters faced per out as its
 * performance-quality evidence instead. See reliabilityWeight below.
 */

export const WORKLOAD_V3_MODEL_VERSION = "mlb-k-workload-v3";

/** Production starter bounds, mirrored so v3 lands in the same safe envelope. */
export const STARTER_IP_MIN = 3;
export const STARTER_IP_MAX = 8.5;
export const STARTER_BF_MIN = 12;
export const STARTER_BF_MAX = 30;
export const BF_PER_IP_MIN = 3.4;
export const BF_PER_IP_MAX = 5.6;

export const DEFAULTS = Object.freeze({
  // Neutral baseline blend. Season is the long-term anchor, last 10 second,
  // last 5 a smaller recent modifier. Selected by grid search, not intuition.
  seasonWeight: 0.45,
  last10Weight: 0.35,
  last5Weight: 0.2,

  // Reliability weighting of an individual start.
  reliabilityFloor: 0.2,
  shortfallMax: 1.0,
  supportRelief: 0.6,
  baserunnersPerIpNormal: 1.3,
  baserunnersPerIpExtreme: 3.0,
  bfPerOutNormal: 1.4,
  bfPerOutExtreme: 2.1,

  // Current workload regime: how much weight may migrate off the season anchor.
  regimeMaxShift: 0.3,
  regimeGapReferenceIp: 0.6,
  regimeSampleK: 4,
  regimeConsistencyFloor: 0.5,
  regimeConsistencySpan: 0.25,

  // Home / away.
  siteShrinkK: 8,
  siteScale: 1.0,
  siteCapIp: 0.25,

  // League prior. How much own-evidence a pitcher needs before his own workload
  // history is trusted outright, measured in starts.
  leaguePriorK: 3,

  // Batters faced per inning.
  bfSeasonWeight: 0.5,
  bfLast10Weight: 0.3,
  bfLast5Weight: 0.2,
});

const finite = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
export const clamp01 = (value) => clamp(value, 0, 1);

/** Fraction of the way `value` sits between low and high, clamped to [0,1]. */
export function ramp(value, low, high) {
  const v = finite(value);
  if (v === null || !(high > low)) return 0;
  return clamp01((v - low) / (high - low));
}

function weightedMean(pairs) {
  let total = 0;
  let weight = 0;
  for (const [value, w] of pairs) {
    const v = finite(value);
    const ww = finite(w);
    if (v === null || ww === null || ww <= 0) continue;
    total += v * ww;
    weight += ww;
  }
  return weight > 0 ? total / weight : null;
}

export function medianOf(values) {
  const sorted = (Array.isArray(values) ? values : [])
    .map(finite)
    .filter((v) => v !== null)
    .sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ------------------------------- reliability -------------------------------

/**
 * How much performance evidence a start carries that its short length was
 * opponent-driven rather than unexplained.
 *
 * Two continuous signals, both scale-free and both available for a COMPLETED
 * prior start:
 *   - baserunners per inning: hits + walks over innings pitched
 *   - batters faced per out: how many hitters it took to record each out
 * A starter pulled at 1.0 IP having allowed nine baserunners was beaten; one
 * pulled at 1.0 IP having allowed one was removed for a reason the box score
 * does not explain, and is far weaker evidence about workload.
 *
 * Returns 0 (no support) to 1 (fully performance-explained). Missing inputs
 * return 0, which is the conservative reading: absence of evidence is not
 * evidence.
 */
export function performanceSupport(start, config = DEFAULTS) {
  const outsRaw = finite(start?.outs);
  const ipRaw = finite(start?.ip);
  const outs = outsRaw !== null ? outsRaw : ipRaw === null ? null : Math.round(ipRaw * 3);
  const ip = ipRaw !== null ? ipRaw : outs === null ? null : outs / 3;
  if (ip === null || ip <= 0 || outs === null || outs <= 0) return 0;

  const hits = finite(start?.hits);
  const walks = finite(start?.walks);
  const bf = finite(start?.bf);

  const signals = [];
  if (hits !== null) {
    const baserunners = hits + (walks ?? 0);
    signals.push(ramp(baserunners / ip, config.baserunnersPerIpNormal, config.baserunnersPerIpExtreme));
  }
  if (bf !== null) {
    signals.push(ramp(bf / outs, config.bfPerOutNormal, config.bfPerOutExtreme));
  }
  if (!signals.length) return 0;
  // The strongest available signal wins: either one on its own explains a short
  // outing, and requiring both would punish an incomplete box score.
  return clamp01(Math.max(...signals));
}

/**
 * Continuous reliability weight in [reliabilityFloor, 1] for one observed
 * start, judged against the innings that start was expected to produce.
 *
 * Only SHORT outings are discounted. A start that ran long is workload evidence
 * in its own right and keeps full weight -- the failure mode this guards
 * against is a one-inning exit defining a pitcher's workload level, not a
 * seven-inning outing doing so.
 *
 * Never binary: even a wholly unexplained 1-IP start keeps `reliabilityFloor`
 * weight, because it did happen.
 */
export function reliabilityWeight(start, expectedIp, config = DEFAULTS) {
  const ipRaw = finite(start?.ip);
  const outs = finite(start?.outs);
  const ip = ipRaw !== null ? ipRaw : outs === null ? null : outs / 3;
  const expected = finite(expectedIp);
  if (ip === null) return null;
  if (expected === null || expected <= 0) return 1;

  const shortfall = clamp01((expected - ip) / expected);
  if (shortfall <= 0) return 1;

  const support = performanceSupport(start, config);
  const penalty = config.shortfallMax * shortfall * (1 - config.supportRelief * support);
  return clamp(1 - penalty, config.reliabilityFloor, 1);
}

// ------------------------------- windows -------------------------------

/** The n most recent starts strictly before `asOfDate`, newest first. */
export function priorStarts(startLog, asOfDate, limit = Infinity) {
  const cutoff = String(asOfDate);
  const list = (Array.isArray(startLog) ? startLog : []).filter(
    (s) => s && typeof s.date === "string" && s.date < cutoff,
  );
  list.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
  return Number.isFinite(limit) ? list.slice(0, limit) : list;
}

/**
 * Reliability-weighted mean innings over a window, where each start's expected
 * innings is the MEDIAN OF THE OTHER starts in the window. Judging a start
 * against its leave-one-out peers keeps one short outing from defining the
 * baseline it is measured against.
 */
export function robustIpPerStart(starts, config = DEFAULTS) {
  const list = (Array.isArray(starts) ? starts : []).filter((s) => finite(s?.ip) !== null);
  if (!list.length) return { value: null, n: 0, weightSum: 0, weights: [], rawMean: null };
  const ips = list.map((s) => finite(s.ip));
  const weights = list.map((start, index) => {
    const others = ips.filter((_, i) => i !== index);
    const expected = others.length >= 2 ? medianOf(others) : null;
    const weight = reliabilityWeight(start, expected, config);
    return weight === null ? 1 : weight;
  });
  return {
    value: weightedMean(list.map((s, i) => [finite(s.ip), weights[i]])),
    rawMean: weightedMean(list.map((s) => [finite(s.ip), 1])),
    n: list.length,
    weightSum: weights.reduce((a, b) => a + b, 0),
    weights,
  };
}

// ------------------------------- neutral baseline -------------------------------

/**
 * Blends the season anchor with the two recent windows. Weights renormalize
 * over whichever terms are available, so a pitcher with no season split still
 * gets an interpretable baseline out of his recent starts.
 *
 * LEAGUE PRIOR. The blend on its own has no defence against a pitcher with
 * almost no record. A starter one game into a season has a "season IP/start"
 * that is just that one game, and taking it at face value produced the worst
 * miss in the whole v3 sample -- a 3.0 IP baseline, clamped at the starter
 * floor, for a pitcher who went six. The blended level is therefore shrunk
 * toward the league starter level by how many starts actually back it,
 * n / (n + leaguePriorK), the same beta-binomial form used for the K-rate
 * alpha and for the opponent's starter baselines. A pitcher with a full season
 * behind him is essentially unaffected; a pitcher with one start is pulled most
 * of the way to the league.
 *
 * `evidenceStarts` is the number of starts backing the estimate and
 * `leagueIpPerStart` the level to shrink toward. Omitting either leaves the
 * raw blend, so the function stays usable without league context.
 */
export function blendNeutralIp(
  { seasonIpPerStart, last10IpPerStart, last5IpPerStart, evidenceStarts, leagueIpPerStart },
  weights,
) {
  const w = { ...DEFAULTS, ...(weights ?? {}) };
  const blended = weightedMean([
    [seasonIpPerStart, w.seasonWeight],
    [last10IpPerStart, w.last10Weight],
    [last5IpPerStart, w.last5Weight],
  ]);
  if (blended === null) return null;

  const league = finite(leagueIpPerStart);
  const starts = finite(evidenceStarts);
  if (league === null || starts === null || starts < 0) return blended;
  const trust = starts / (starts + w.leaguePriorK);
  return trust * blended + (1 - trust) * league;
}

/**
 * Current workload regime.
 *
 * Season-long workload goes stale when a pitcher moves into a sustained new
 * role. Rather than bolt an additive term onto the blend, the regime mechanism
 * MIGRATES WEIGHT off the season anchor toward the recent windows, in
 * proportion to how much evidence there is that the move is real:
 *
 *   sample      -- how many recent starts back the claim
 *   magnitude   -- how large the last-10 vs season gap is
 *   consistency -- what share of those starts sit on the same side of season
 *
 * All three must be present for a large shift; two strong starts and a big gap
 * are not enough on their own. The result is reported as a delta against the
 * unshifted blend so it stays separately auditable.
 */
export function regimeEvidence({ seasonIpPerStart, last10Starts, last10IpPerStart }, config = DEFAULTS) {
  const season = finite(seasonIpPerStart);
  const recent = finite(last10IpPerStart);
  const starts = Array.isArray(last10Starts) ? last10Starts.filter((s) => finite(s?.ip) !== null) : [];
  if (season === null || recent === null || !starts.length) {
    return { evidence: 0, gap: null, consistency: null, sample: 0, magnitude: 0 };
  }
  const gap = recent - season;
  const sample = starts.length / (starts.length + config.regimeSampleK);
  const magnitude = clamp01(Math.abs(gap) / config.regimeGapReferenceIp);
  const sameSide = starts.filter((s) => (finite(s.ip) - season) * gap > 0).length;
  const consistency = sameSide / starts.length;
  const consistencyScore = clamp01(
    (consistency - config.regimeConsistencyFloor) / config.regimeConsistencySpan,
  );
  return { evidence: clamp01(sample * magnitude * consistencyScore), gap, consistency, sample, magnitude };
}

/** Moves `regimeMaxShift` of the season weight onto the recent windows, pro rata. */
export function regimeShiftedWeights(evidence, weights, config = DEFAULTS) {
  const w = { ...DEFAULTS, ...(weights ?? {}) };
  const shift = config.regimeMaxShift * clamp01(evidence);
  const moved = w.seasonWeight * shift;
  const recentTotal = w.last10Weight + w.last5Weight;
  if (!(recentTotal > 0) || !(moved > 0)) return w;
  return {
    ...w,
    seasonWeight: w.seasonWeight - moved,
    last10Weight: w.last10Weight + moved * (w.last10Weight / recentTotal),
    last5Weight: w.last5Weight + moved * (w.last5Weight / recentTotal),
  };
}

// ------------------------------- site -------------------------------

/**
 * Home / away workload tendency, expressed as a delta from the pitcher's own
 * neutral level and then shrunk toward zero by how few starts back it.
 * Deliberately small, capped, and secondary to the pitcher baseline.
 */
export function siteAdjustment({ siteIpPerStart, siteGames, seasonIpPerStart }, config = DEFAULTS) {
  const site = finite(siteIpPerStart);
  const season = finite(seasonIpPerStart);
  const games = finite(siteGames) ?? 0;
  if (site === null || season === null) return { adjustment: 0, rawDelta: null, shrink: 0, games };
  const rawDelta = site - season;
  const shrink = games > 0 ? games / (games + config.siteShrinkK) : 0;
  const adjustment = clamp(rawDelta * shrink * config.siteScale, -config.siteCapIp, config.siteCapIp);
  return { adjustment, rawDelta, shrink, games };
}

// ------------------------------- batters faced -------------------------------

/**
 * Batters faced per inning, blended across the same three windows and shrunk
 * toward a league rate on the same n / (n + k) prior as the innings baseline.
 *
 * A pitcher with one rough start on record has a BF/IP that pins to the top of
 * the allowed range, which then multiplies straight into projected batters
 * faced. The prior keeps that from happening while leaving an established
 * pitcher's own rate essentially untouched.
 */
export function expectedBfPerIp(
  { seasonBfPerIp, last10Starts, last5Starts, evidenceStarts, leagueBfPerIp },
  config = DEFAULTS,
) {
  const windowRate = (starts) => {
    const list = (Array.isArray(starts) ? starts : []).filter(
      (s) => finite(s?.bf) !== null && finite(s?.ip) !== null && finite(s.ip) > 0,
    );
    if (!list.length) return null;
    const bf = list.reduce((sum, s) => sum + finite(s.bf), 0);
    const ip = list.reduce((sum, s) => sum + finite(s.ip), 0);
    return ip > 0 ? bf / ip : null;
  };
  const blended = weightedMean([
    [finite(seasonBfPerIp), config.bfSeasonWeight],
    [windowRate(last10Starts), config.bfLast10Weight],
    [windowRate(last5Starts), config.bfLast5Weight],
  ]);
  if (blended === null) return null;

  const league = finite(leagueBfPerIp);
  const starts = finite(evidenceStarts);
  const shrunk =
    league === null || starts === null || starts < 0
      ? blended
      : (starts / (starts + config.leaguePriorK)) * blended +
        (1 - starts / (starts + config.leaguePriorK)) * league;
  return clamp(shrunk, BF_PER_IP_MIN, BF_PER_IP_MAX);
}

/** Projected batters faced, bounded by the production starter envelope. */
export function projectBattersFaced(projectedIp, bfPerIp) {
  const ip = finite(projectedIp);
  const rate = finite(bfPerIp);
  if (ip === null || rate === null) return null;
  return clamp(ip * rate, STARTER_BF_MIN, STARTER_BF_MAX);
}
