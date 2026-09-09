/**
 * mlb-k-opponent-starter-context.mjs
 *
 * V4's core new idea: measure how an offense treats opposing STARTING PITCHERS
 * relative to what those pitchers normally do.
 *
 * "MIN's opposing starters averaged 4.27 IP" is not by itself information --
 * it could just mean MIN kept drawing short-leash pitchers. The signal is
 *
 *     what those specific pitchers actually did against MIN
 *     -----------------------------------------------------
 *     what those same pitchers normally do
 *
 * so the denominator is each opposing starter's OWN pregame baseline.
 *
 * TWO SEPARATE FACTORS, AND WHY THE K FACTOR IS A *RATE*
 * -----------------------------------------------------
 * V4 projects innings and strikeouts-per-inning separately and multiplies
 * them. If the opponent K factor were built from strikeouts PER START it
 * would already contain the innings suppression, and multiplying it by an
 * innings projection that was itself suppressed would count the same effect
 * twice. So:
 *
 *   ipFactor      = (total IP actually thrown vs this opponent)
 *                 / (sum of those starters' baseline IP/start)
 *
 *   kRateFactor   = (total K actually recorded vs this opponent)
 *                 / (sum of baseline K/IP * the innings ACTUALLY thrown)
 *
 * The K factor is therefore conditional on the innings that happened. It
 * answers "per inning pitched, did this offense strike out more or less than
 * these pitchers normally induce", which is exactly the quantity V4's K/IP
 * model needs and is orthogonal to the innings factor.
 *
 * Both are innings-weighted totals rather than means of per-start ratios: a
 * two-inning injury exit would otherwise contribute a wild 0.35 IP ratio and a
 * meaningless K/IP ratio with the same weight as a full outing.
 *
 * SELF-CENTERING. Summed over the whole league, total actual IP equals total
 * baseline IP by construction, so these factors average to ~1.00 across a
 * slate of different opponents. They redistribute rather than inflate, which
 * is the property V3's workload term lacked.
 *
 * LEAKAGE. Every baseline is resolved through a caller-supplied lookup that
 * receives the observation's own date; this module never sees a schedule, a
 * future start or a market price. `assertNoLookahead` re-checks the contract.
 *
 * NO MARKET INPUT. Nothing here reads a line, odds or any Vegas quantity.
 */

export const OPPONENT_STARTER_CONTEXT_VERSION = "mlb-k-opponent-starter-context-v1";

/**
 * Tunables, all documented and all deliberately conservative.
 *
 * `sampleK` / `baselineK` are beta-style prior strengths: a 10-game sample
 * earns 10/(10+4) = 0.714 of full trust, and a baseline built on 10 prior
 * starts earns 10/(10+3) = 0.769, so a well-populated opponent reaches about
 * 0.55 total confidence -- a raw 0.80 factor lands near 0.89, not 0.80.
 *
 * `maxAdjustment` is the hard cap on the SHRUNK factor, applied last.
 */
export const OPPONENT_CONTEXT_DEFAULTS = Object.freeze({
  lookback: 10,
  sampleK: 4,
  baselineK: 3,
  minBaselineStarts: 3,
  /**
   * Openers are excluded from the opponent measurement. A pitcher whose own
   * baseline is barely over an inning is not evidence about how an offence
   * treats STARTERS, and his ratios are violently noisy: a 1.67-inning opener
   * against a 1.2-inning baseline reads as a 1.39 innings ratio and a 1.80
   * strikeout ratio, which would swamp eight real starts.
   */
  minBaselineIPPerStart: 3.0,
  /** Per-observation sanity clamps: reject nonsense, keep real short starts. */
  minObservationOuts: 3,
  ipRatioClamp: [0.35, 1.75],
  kRatioClamp: [0.30, 2.20],
  /** Hard caps on the final shrunk factors (+/- 12%). */
  maxIpAdjustment: 0.12,
  maxKAdjustment: 0.12,
});

const NEUTRAL = 1;

const finite = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

const round = (value, digits = 4) =>
  finite(value) === null ? null : Math.round(Number(value) * 10 ** digits) / 10 ** digits;

/** Deterministic key for joining a starter across sources. */
export function normalizePitcherKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Throws if any observation is dated on or after the projection slate.
 * Called by both adapters and asserted directly by the leakage test.
 */
export function assertNoLookahead(observations, asOfDate, label = "opponent-starter-context") {
  for (const observation of observations ?? []) {
    const date = String(observation?.date ?? "");
    if (!date) throw new Error(`${label}: observation is missing a date`);
    if (date >= String(asOfDate)) {
      throw new Error(`${label}: observation dated ${date} is not strictly before slate ${asOfDate}`);
    }
  }
  return true;
}

/** The all-neutral result used whenever there is nothing trustworthy to say. */
function neutralContext(reason, extra = {}) {
  return {
    version: OPPONENT_STARTER_CONTEXT_VERSION,
    games: 0,
    usableGames: 0,
    totalActualIP: null,
    totalBaselineIP: null,
    totalActualKs: null,
    totalExpectedKs: null,
    avgStarterIPAgainst: null,
    avgStarterKsAgainst: null,
    avgStarterBaselineIP: null,
    avgStarterBaselineKPerIP: null,
    rawIpFactor: null,
    rawKRateFactor: null,
    medianIpRatio: null,
    shrunkIpFactor: NEUTRAL,
    shrunkKRateFactor: NEUTRAL,
    confidence: 0,
    warnings: [reason],
    observations: [],
    ...extra,
  };
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Builds the opponent starter context.
 *
 * @param {object} args
 * @param {object[]} args.observations  starts made AGAINST this opponent, each
 *        `{ date, pitcherKey, outs, strikeouts }`, any order. Only the most
 *        recent `lookback` (by date, descending) are used.
 * @param {(pitcherKey: string, beforeDate: string) => (null|{ipPerStart, kPerIP, starts})}
 *        args.baselineFor  that starter's OWN pregame baseline, built strictly
 *        from starts before `beforeDate` and, by contract, excluding starts
 *        against this same opponent so the denominator cannot absorb the very
 *        effect being measured.
 * @param {string} args.asOfDate  slate date; every observation must precede it.
 * @param {object} [args.config]
 */
export function buildOpponentStarterContext({
  observations = [],
  baselineFor,
  asOfDate,
  config = OPPONENT_CONTEXT_DEFAULTS,
} = {}) {
  const cfg = { ...OPPONENT_CONTEXT_DEFAULTS, ...config };
  if (typeof baselineFor !== "function") return neutralContext("NO_BASELINE_RESOLVER");
  if (!asOfDate) return neutralContext("NO_SLATE_DATE");

  const dated = (observations ?? [])
    .filter((observation) => observation && observation.date && String(observation.date) < String(asOfDate))
    .sort((a, b) => (String(b.date).localeCompare(String(a.date))))
    .slice(0, cfg.lookback);

  if (dated.length === 0) return neutralContext("NO_OPPONENT_OBSERVATIONS");

  let totalActualIP = 0;
  let totalBaselineIP = 0;
  let totalActualKs = 0;
  let totalExpectedKs = 0;
  let baselineTrustSum = 0;
  const ipRatios = [];
  const audited = [];
  const warnings = [];

  for (const observation of dated) {
    const outs = finite(observation.outs);
    const strikeouts = finite(observation.strikeouts);
    const pitcherKey = normalizePitcherKey(observation.pitcherKey ?? observation.pitcher);

    if (outs === null || outs < cfg.minObservationOuts || strikeouts === null || !pitcherKey) {
      audited.push({ date: observation.date, pitcherKey, used: false, reason: "INCOMPLETE_OBSERVATION" });
      continue;
    }

    const baseline = baselineFor(pitcherKey, String(observation.date));
    const baselineIP = finite(baseline?.ipPerStart);
    const baselineKPerIP = finite(baseline?.kPerIP);
    const baselineStarts = finite(baseline?.starts) ?? 0;

    if (baselineIP === null || baselineIP <= 0 || baselineKPerIP === null || baselineKPerIP <= 0) {
      audited.push({ date: observation.date, pitcherKey, used: false, reason: "NO_BASELINE" });
      continue;
    }
    if (baselineStarts < cfg.minBaselineStarts) {
      audited.push({ date: observation.date, pitcherKey, used: false, reason: "THIN_BASELINE" });
      continue;
    }
    if (baselineIP < cfg.minBaselineIPPerStart) {
      audited.push({ date: observation.date, pitcherKey, used: false, reason: "OPENER_BASELINE_EXCLUDED" });
      continue;
    }

    const actualIP = outs / 3;
    const ipRatio = clamp(actualIP / baselineIP, cfg.ipRatioClamp[0], cfg.ipRatioClamp[1]);
    const expectedKs = baselineKPerIP * actualIP;
    const kRatio = expectedKs > 0
      ? clamp(strikeouts / expectedKs, cfg.kRatioClamp[0], cfg.kRatioClamp[1])
      : null;

    // Clamped ratios are re-expressed as effective totals so one wild game
    // cannot dominate the innings-weighted aggregate it feeds.
    totalActualIP += ipRatio * baselineIP;
    totalBaselineIP += baselineIP;
    if (kRatio !== null) {
      totalActualKs += kRatio * expectedKs;
      totalExpectedKs += expectedKs;
    }
    ipRatios.push(ipRatio);
    baselineTrustSum += baselineStarts / (baselineStarts + cfg.baselineK);

    audited.push({
      date: observation.date,
      pitcherKey,
      used: true,
      actualIP: round(actualIP, 3),
      baselineIP: round(baselineIP, 3),
      ipRatio: round(ipRatio, 4),
      strikeouts,
      expectedKs: round(expectedKs, 3),
      kRatio: round(kRatio, 4),
      baselineStarts,
    });
  }

  const usableGames = ipRatios.length;
  if (usableGames === 0) return neutralContext("NO_USABLE_OPPONENT_OBSERVATIONS", { games: dated.length, observations: audited });

  const rawIpFactor = totalBaselineIP > 0 ? totalActualIP / totalBaselineIP : null;
  const rawKRateFactor = totalExpectedKs > 0 ? totalActualKs / totalExpectedKs : null;

  // confidence = sample trust x mean baseline trust. Both are beta-style and
  // bounded in [0,1), so a thin or poorly-supported sample shrinks hard.
  const sampleTrust = usableGames / (usableGames + cfg.sampleK);
  const baselineTrust = baselineTrustSum / usableGames;
  const confidence = clamp(sampleTrust * baselineTrust, 0, 1);

  if (usableGames < dated.length) warnings.push(`OPPONENT_OBSERVATIONS_DROPPED_${dated.length - usableGames}`);
  if (usableGames < cfg.lookback) warnings.push("OPPONENT_SAMPLE_BELOW_LOOKBACK");

  const shrink = (raw, cap) => {
    if (raw === null) return NEUTRAL;
    const shrunk = NEUTRAL + confidence * (raw - NEUTRAL);
    return clamp(shrunk, NEUTRAL - cap, NEUTRAL + cap);
  };

  const usedRows = audited.filter((row) => row.used);
  return {
    version: OPPONENT_STARTER_CONTEXT_VERSION,
    games: dated.length,
    usableGames,
    totalActualIP: round(totalActualIP, 3),
    totalBaselineIP: round(totalBaselineIP, 3),
    totalActualKs: round(totalActualKs, 3),
    totalExpectedKs: round(totalExpectedKs, 3),
    avgStarterIPAgainst: round(totalActualIP / usableGames, 3),
    avgStarterKsAgainst: round(totalActualKs / usableGames, 3),
    avgStarterBaselineIP: round(totalBaselineIP / usableGames, 3),
    avgStarterBaselineKPerIP: round(totalExpectedKs / totalActualIP, 4),
    rawIpFactor: round(rawIpFactor),
    rawKRateFactor: round(rawKRateFactor),
    medianIpRatio: round(median(ipRatios)),
    shrunkIpFactor: round(shrink(rawIpFactor, cfg.maxIpAdjustment)),
    shrunkKRateFactor: round(shrink(rawKRateFactor, cfg.maxKAdjustment)),
    confidence: round(confidence),
    warnings,
    observations: usedRows,
  };
}

/**
 * Builds a leakage-safe baseline resolver over a flat start log.
 *
 * Each start needs `{ date, pitcherKey, outs, strikeouts, opponent }`. The
 * returned function answers with the pitcher's IP/start and K/IP over every
 * start strictly BEFORE the requested date, optionally excluding starts
 * against `excludeOpponent` so an opponent's own suppression never leaks into
 * the denominator it is measured against.
 *
 * K/IP is total K over total IP, never a mean of per-start rates: the latter
 * is biased upward by short high-strikeout outings.
 */
export function createStartLogBaselineResolver(startLog = [], { excludeOpponent = null } = {}) {
  const byPitcher = new Map();
  for (const start of startLog) {
    const key = normalizePitcherKey(start?.pitcherKey ?? start?.pitcher);
    const date = start?.date ? String(start.date) : null;
    const outs = finite(start?.outs);
    const strikeouts = finite(start?.strikeouts);
    if (!key || !date || outs === null || strikeouts === null) continue;
    const bucket = byPitcher.get(key);
    const row = { date, outs, strikeouts, opponent: start?.opponent ?? null };
    if (bucket) bucket.push(row);
    else byPitcher.set(key, [row]);
  }
  for (const rows of byPitcher.values()) rows.sort((a, b) => a.date.localeCompare(b.date));

  return function baselineFor(pitcherKey, beforeDate) {
    const rows = byPitcher.get(normalizePitcherKey(pitcherKey));
    if (!rows) return null;
    let outs = 0;
    let strikeouts = 0;
    let starts = 0;
    for (const row of rows) {
      if (row.date >= String(beforeDate)) break;
      if (excludeOpponent && row.opponent === excludeOpponent) continue;
      outs += row.outs;
      strikeouts += row.strikeouts;
      starts += 1;
    }
    if (starts === 0 || outs <= 0) return null;
    const innings = outs / 3;
    return { ipPerStart: innings / starts, kPerIP: strikeouts / innings, starts, innings };
  };
}

export default buildOpponentStarterContext;
