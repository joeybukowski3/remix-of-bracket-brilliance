/**
 * mlb-k-workload-v3 -- opponent starting-pitcher workload model.
 *
 * NEW module. Nothing in the v2 production path imports it.
 *
 * THE IDEA
 * --------
 * The raw average innings an offense allows opposing starters is mostly a
 * statement about WHICH starters that offense happened to face, not about the
 * offense. A team that drew four aces averages more opposing-starter innings
 * than a team that drew four openers, with no information about either lineup.
 *
 * v3 therefore measures the opponent RELATIVE TO EACH STARTER'S OWN BASELINE:
 *
 *   delta = actual IP against this team - that starter's neutral expected IP
 *
 * A starter normally good for 1.1 IP who throws 1.0 contributes -0.1, i.e.
 * roughly nothing, exactly as an opener should. A starter normally good for
 * 5.2 who throws 6.1 contributes +0.9, which is real evidence. No opener or
 * short starter is discarded; each simply contributes on its own scale.
 *
 * LEAGUE CENTRING. A raw delta is not yet a team effect. The starter baselines
 * are estimated from a sample of listed probable starters and are shrunk toward
 * a league level, which leaves the deltas with a small league-wide offset --
 * measured at +0.094 IP on this archive, with 56.2% of starts "over expected"
 * where 50% is the only value the whole league can average. That offset says
 * nothing about any offense, so every delta is centred on the contemporaneous
 * league mean delta and every over-expected rate on the league over-rate before
 * either is used. After centring the terms mean zero across the league by
 * construction, which is what "does this offense extend or shorten starters
 * relative to everyone else" actually requires. The centring constants are
 * supplied by the caller and must be built pregame (see leagueBaseline).
 *
 * Every function is pure, deterministic and pregame-only, and none of them may
 * read a market line.
 */
import {
  DEFAULTS as CORE_DEFAULTS,
  clamp,
  clamp01,
  medianOf,
  priorStarts,
  reliabilityWeight,
  robustIpPerStart,
} from "./mlb-k-workload-v3-core.mjs";

export const OPPONENT_DEFAULTS = Object.freeze({
  // Window blend. Season is the largest weight, then last 10, then last 5.
  seasonWeight: 0.5,
  last10Weight: 0.3,
  last5Weight: 0.2,

  // How much a starter's own thin prior log is trusted before falling back to
  // the league starter level. n / (n + k) in starts.
  starterPriorK: 4,

  // Total reliability mass at which the opponent read is considered fully
  // backed. sum(w) / (sum(w) + k).
  confidenceK: 8,

  // Over-expected consistency. A blended delta earns full credit only when the
  // individual starts agree on its sign; a delta carried by two outliers is
  // scaled down rather than thrown away.
  consistencyFloor: 0.5,
  consistencySpan: 0.25,
  consistencyMinScale: 0.5,

  // Size of the final adjustment. The opponent is a modifier on the pitcher
  // baseline, never a co-equal term.
  scale: 1.0,
  capIp: 0.5,

  minObservations: 3,
});

const finite = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * A starter's neutral expected innings as of a date, from that starter's own
 * prior starts, shrunk toward the league starter level by how few there are.
 *
 * This is deliberately a SIMPLER estimator than the full pitcher baseline: it
 * is applied to every opposing starter in the league, most of whom have no
 * venue-split record in the archive, and a heavier estimator would only add
 * missingness. Robust weighting is still applied so one opener-length outing
 * does not drag a starter's own reference down.
 */
export function starterExpectedIp(starterLog, asOfDate, leagueIpPerStart, config = OPPONENT_DEFAULTS) {
  const league = finite(leagueIpPerStart);
  const window = priorStarts(starterLog, asOfDate, 10);
  const robust = robustIpPerStart(window, CORE_DEFAULTS);
  if (robust.value === null) return { expectedIp: league, n: 0, source: league === null ? "none" : "league" };
  if (league === null) return { expectedIp: robust.value, n: robust.n, source: "own" };
  const weight = robust.n / (robust.n + config.starterPriorK);
  return {
    expectedIp: weight * robust.value + (1 - weight) * league,
    n: robust.n,
    source: "shrunk",
    ownIpPerStart: robust.value,
    shrinkWeight: weight,
  };
}

/**
 * Every prior start made AGAINST `team`, annotated with the starter's own
 * neutral expected innings, the resulting delta, and a reliability weight.
 *
 * The reliability weight uses the same philosophy as the pitcher's own recent
 * starts: an extreme shortfall with no performance evidence behind it is weak
 * evidence about the opponent; the same shortfall with a wrecked line is
 * moderate evidence, because the offense plausibly caused it.
 */
export function opponentObservations({ team, asOfDate, startLog, logByPitcher, leagueIpPerStart }, config = OPPONENT_DEFAULTS) {
  const cutoff = String(asOfDate);
  const faced = (Array.isArray(startLog) ? startLog : []).filter(
    (s) => s && s.opponent === team && typeof s.date === "string" && s.date < cutoff && finite(s.ip) !== null,
  );
  faced.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));

  return faced.map((start) => {
    const own = logByPitcher?.get?.(start.pitcherId) ?? [];
    const expected = starterExpectedIp(own, start.date, leagueIpPerStart, config);
    const expectedIp = expected.expectedIp;
    const delta = expectedIp === null ? null : finite(start.ip) - expectedIp;
    const weight = reliabilityWeight(start, expectedIp, CORE_DEFAULTS);
    return {
      date: start.date,
      pitcherId: start.pitcherId,
      pitcher: start.pitcher ?? null,
      ip: finite(start.ip),
      bf: finite(start.bf),
      pitches: finite(start.pitches),
      hits: finite(start.hits),
      walks: finite(start.walks),
      expectedIp,
      expectedSource: expected.source,
      expectedN: expected.n,
      delta,
      weight: weight === null ? 1 : weight,
    };
  });
}

/**
 * Weighted delta summary over one window of opponent observations.
 *
 * `centre` carries the league constants this window is measured against:
 * { meanDelta, overRate }. Both default to the neutral values (0 and 0.5), so
 * an uncentred call is still well defined -- it simply reports raw deltas.
 */
export function summarizeWindow(observations, config = OPPONENT_DEFAULTS, centre = null) {
  const leagueDelta = finite(centre?.meanDelta) ?? 0;
  const usable = (Array.isArray(observations) ? observations : []).filter(
    (o) => o && finite(o.delta) !== null && finite(o.weight) !== null && o.weight > 0,
  );
  if (!usable.length) {
    return {
      n: 0,
      weightSum: 0,
      meanDelta: null,
      rawMeanDelta: null,
      medianDelta: null,
      overRate: null,
      rawOverRate: null,
      underRate: null,
      rawMeanIp: null,
    };
  }
  const weightSum = usable.reduce((sum, o) => sum + o.weight, 0);
  // Centred against the league: a team that behaves exactly like the league
  // average scores zero, whatever the raw estimator offset happens to be.
  const rawMeanDelta = usable.reduce((sum, o) => sum + o.delta * o.weight, 0) / weightSum;
  // "Over expected" means over the LEAGUE-TYPICAL delta, not over zero. Moving
  // the threshold is what centres this rate; subtracting a league over-rate on
  // top of it would centre the same quantity twice.
  const overWeight = usable.filter((o) => o.delta > leagueDelta).reduce((sum, o) => sum + o.weight, 0);
  const underWeight = usable.filter((o) => o.delta < leagueDelta).reduce((sum, o) => sum + o.weight, 0);
  // Retained uncentred for reporting continuity: the share that beat their own
  // expectation outright, whatever the league was doing.
  const rawOverRate = usable.filter((o) => o.delta > 0).reduce((sum, o) => sum + o.weight, 0) / weightSum;
  return {
    n: usable.length,
    weightSum,
    meanDelta: rawMeanDelta - leagueDelta,
    rawMeanDelta,
    medianDelta: medianOf(usable.map((o) => o.delta - leagueDelta)),
    // 0.5 means "this offense is exactly league-average at pushing starters
    // past their own expectation".
    overRate: overWeight / weightSum,
    rawOverRate,
    underRate: underWeight / weightSum,
    overCount: usable.filter((o) => o.delta > leagueDelta).length,
    // Reported alongside so the "raw opposing-starter innings" comparison the
    // study runs has a like-for-like number on the same rows.
    rawMeanIp: usable.reduce((sum, o) => sum + o.ip, 0) / usable.length,
    reliability: clamp01(weightSum / (weightSum + config.confidenceK)),
  };
}

/**
 * Turns the three windows into one capped innings adjustment.
 *
 * Three multiplicative guards keep the opponent subordinate to the pitcher:
 *   reliability -- how much weighted evidence exists at all
 *   consistency -- whether the individual starts agree with the blended sign
 *   cap         -- a hard ceiling on the innings this term may move
 */
export function opponentAdjustment({ season, last10, last5 }, config = OPPONENT_DEFAULTS) {
  const cfg = { ...OPPONENT_DEFAULTS, ...(config ?? {}) };
  const terms = [
    [season?.meanDelta ?? null, cfg.seasonWeight],
    [last10?.meanDelta ?? null, cfg.last10Weight],
    [last5?.meanDelta ?? null, cfg.last5Weight],
  ].filter(([value, weight]) => finite(value) !== null && weight > 0);

  if (!terms.length || (season?.n ?? 0) < cfg.minObservations) {
    return {
      adjustment: 0,
      blendedDelta: null,
      reliability: season?.reliability ?? 0,
      consistencyScale: null,
      overExpectedRate: season?.overRate ?? null,
      reason: "insufficient-opponent-sample",
    };
  }

  const weightSum = terms.reduce((sum, [, w]) => sum + w, 0);
  const blendedDelta = terms.reduce((sum, [v, w]) => sum + v * w, 0) / weightSum;

  // Agreement is the weighted share of starts that moved in the blended
  // direction. It scales confidence; it is never an additive term of its own.
  const overRate = season?.overRate ?? null;
  const agreement = overRate === null ? null : blendedDelta >= 0 ? overRate : 1 - overRate;
  const consistencyScale =
    agreement === null
      ? cfg.consistencyMinScale
      : cfg.consistencyMinScale +
        (1 - cfg.consistencyMinScale) *
          clamp01((agreement - cfg.consistencyFloor) / cfg.consistencySpan);

  const reliability = season?.reliability ?? 0;
  const adjustment = clamp(blendedDelta * reliability * consistencyScale * cfg.scale, -cfg.capIp, cfg.capIp);

  return {
    adjustment,
    blendedDelta,
    reliability,
    consistencyScale,
    overExpectedRate: overRate,
    capped: Math.abs(blendedDelta * reliability * consistencyScale * cfg.scale) > cfg.capIp,
    reason: null,
  };
}

/**
 * League centring constants as of a date, from every observation the caller can
 * legitimately see. Pregame by construction when the caller passes a start log
 * already restricted to dates strictly before the slate.
 */
export function leagueBaseline(observations) {
  const usable = (Array.isArray(observations) ? observations : []).filter(
    (o) => o && finite(o.delta) !== null && finite(o.weight) !== null && o.weight > 0,
  );
  if (!usable.length) return { meanDelta: 0, overRate: 0.5, n: 0 };
  const weightSum = usable.reduce((sum, o) => sum + o.weight, 0);
  return {
    meanDelta: usable.reduce((sum, o) => sum + o.delta * o.weight, 0) / weightSum,
    overRate: usable.filter((o) => o.delta > 0).reduce((sum, o) => sum + o.weight, 0) / weightSum,
    n: usable.length,
  };
}

/**
 * Full opponent read: observations, three windows, and the capped adjustment.
 *
 * `input.leagueCentre` supplies the { meanDelta, overRate } this team is scored
 * against. Omitting it scores raw, uncentred deltas, which carry the estimator
 * offset and are not a team effect -- callers should supply it.
 */
export function opponentWorkloadEffect(input, config = OPPONENT_DEFAULTS) {
  const cfg = { ...OPPONENT_DEFAULTS, ...(config ?? {}) };
  const observations = opponentObservations(input, cfg);
  const centre = input?.leagueCentre ?? null;
  const season = summarizeWindow(observations, cfg, centre);
  const last10 = summarizeWindow(observations.slice(0, 10), cfg, centre);
  const last5 = summarizeWindow(observations.slice(0, 5), cfg, centre);
  const effect = opponentAdjustment({ season, last10, last5 }, cfg);
  return { observations, season, last10, last5, leagueCentre: centre, ...effect };
}
