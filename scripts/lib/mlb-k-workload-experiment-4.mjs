/**
 * mlb-k-workload-experiment-4.mjs  (calibration experiment 4, PURE)
 *
 * ANALYSIS ONLY. Pitcher-anchored contextual workload projection.
 *
 * Experiment 4 tests one idea only: replace the production workload model's
 * "recency-weighted last-6 pitch average + league constant 86" blend with an
 * explicit blend of the pitcher's OWN season-to-date per-start workload and his
 * OWN last-5 per-start workload. League / role defaults are used only as a
 * fallback when the pitcher has < `minSeasonStarts` current-season starts AND no
 * recent-start sample.
 *
 * One optional arm: derive expected BF from the pitch-limit blend divided by the
 * pitcher's OWN historical pitches-per-BF, instead of a direct season/recent BF
 * blend.
 *
 * `reprojectV4(decomp, v4Inputs, BASELINE_PARAMS_V4)` MUST return exactly what
 * the production `mlb-k-workload-v2` model returns (it delegates to the
 * Experiment 3 `reprojectFromDecomp`). A fidelity test asserts this.
 *
 * Nothing here is imported by production. No I/O, no clock.
 * Opponent workload / offensive-quality terms are intentionally absent — the
 * Experiment 4 diagnosis found no usable pregame signal in them.
 */
import { ROLE_LIMITS, clamp, reprojectFromDecomp } from "./mlb-k-workload-experiment.mjs";

export const WORKLOAD_EXPERIMENT_4_BASE_VERSION = "mlb-k-workload-v2";

/** Baseline = exact production. Candidates override `mode` + `seasonWeight`. */
export const BASELINE_PARAMS_V4 = Object.freeze({
  mode: "baseline", // "baseline" | "pitcher-anchored"
  seasonWeight: 0.6, // weight on season-to-date per-start; recent weight = 1 - seasonWeight
  usePitcherPitchesPerBF: false, // optional arm: BF = pitchLimit / pitcher season pitches-per-BF
  minSeasonStarts: 3, // below this, fall back to recent-only, then league
});

function toFiniteNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 3) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Blend a pitcher's own season and recent per-start numbers.
 *  - both present + enough season starts -> ws*season + (1-ws)*recent
 *  - only recent present (or thin season)  -> recent
 *  - only season present                   -> season
 *  - neither                               -> leagueFallback
 */
function anchorBlend({ season, recent, seasonWeight, enoughSeason, leagueFallback }) {
  const s = toFiniteNumber(season);
  const r = toFiniteNumber(recent);
  if (enoughSeason && s != null && r != null) return seasonWeight * s + (1 - seasonWeight) * r;
  if (r != null) return r;
  if (s != null) return s;
  return toFiniteNumber(leagueFallback);
}

/**
 * Re-derive expected pitch-limit / BF / innings for one row.
 *
 * @param {object} decomp   Experiment 3 `workloadDecomp` block (limits, league defaults, opponentPpa, recency-weighted recent averages)
 * @param {object} v4       as-of pitcher per-start numbers: { seasonStarts, recentStartCount,
 *                          seasonIpPerStart, seasonBfPerStart, seasonPitchesPerStart, seasonPitchesPerBF,
 *                          last5IpPerStart, last5BfPerStart, last5PitchesPerStart }
 * @param {object} params   BASELINE_PARAMS_V4 override
 */
export function reprojectV4(decomp, v4 = {}, params = BASELINE_PARAMS_V4) {
  const p = { ...BASELINE_PARAMS_V4, ...params };
  if (!decomp) return { expectedBF: null, expectedInnings: null, expectedPitchLimit: null };

  // baseline arm and non-starter roles: exact production behaviour
  if (p.mode === "baseline" || (decomp.role ?? "starter") !== "starter") {
    const base = reprojectFromDecomp(decomp, {});
    return {
      expectedBF: base.expectedBF,
      expectedInnings: base.expectedInnings,
      expectedPitchLimit: decomp.expectedPitchLimit ?? null,
    };
  }

  const limits = decomp.limits ?? ROLE_LIMITS.starter;
  const ws = p.seasonWeight;
  const enoughSeason = toFiniteNumber(v4.seasonStarts, 0) >= p.minSeasonStarts;

  // --- pitch limit: pitcher-anchored season/recent blend, league 86 only as fallback ---
  const recentPitch = toFiniteNumber(v4.last5PitchesPerStart) ?? toFiniteNumber(decomp.recentPitchAverage);
  const pitchAnchor = anchorBlend({
    season: v4.seasonPitchesPerStart,
    recent: recentPitch,
    seasonWeight: ws,
    enoughSeason,
    leagueFallback: decomp.leaguePitches ?? limits.defaultPitches,
  });
  const expectedPitchLimit = clamp(pitchAnchor, limits.pitchMin, limits.pitchMax);

  // --- BF ---
  const recentBf = toFiniteNumber(v4.last5BfPerStart) ?? toFiniteNumber(decomp.recentBfAverage);
  const bfAnchor = anchorBlend({
    season: v4.seasonBfPerStart,
    recent: recentBf,
    seasonWeight: ws,
    enoughSeason,
    leagueFallback: null,
  });

  let expectedBFRaw;
  if (p.usePitcherPitchesPerBF) {
    let ppb = toFiniteNumber(v4.seasonPitchesPerBF);
    // sanity-gate the pitcher divisor; otherwise fall back to the opponent PPA path
    if (!(enoughSeason && ppb != null && ppb >= 3.0 && ppb <= 5.5)) ppb = null;
    const divisor = ppb ?? Math.max(3.2, toFiniteNumber(decomp.opponentPpa) ?? toFiniteNumber(decomp.leaguePpa) ?? 3.9);
    expectedBFRaw = expectedPitchLimit / divisor;
  } else {
    expectedBFRaw = bfAnchor != null
      ? bfAnchor
      : expectedPitchLimit / Math.max(3.2, toFiniteNumber(decomp.opponentPpa) ?? 3.9);
  }
  const expectedBF = clamp(expectedBFRaw, limits.bfMin, limits.bfMax);

  // --- innings: pitcher-anchored season/recent IP blend, clamped ---
  const recentIp = toFiniteNumber(v4.last5IpPerStart) ?? toFiniteNumber(decomp.recentIpAverage);
  const ipAnchor = anchorBlend({
    season: v4.seasonIpPerStart,
    recent: recentIp,
    seasonWeight: ws,
    enoughSeason,
    leagueFallback: Number.isFinite(expectedBF) ? (expectedBF * 0.72) / 3 : null,
  });
  const expectedInnings = clamp(
    ipAnchor != null ? ipAnchor : (expectedBF * 0.72) / 3,
    limits.ipMin,
    limits.ipMax,
  );

  return {
    expectedBF: round(expectedBF, 3),
    expectedInnings: round(expectedInnings, 3),
    expectedPitchLimit: round(expectedPitchLimit, 2),
  };
}

/** Build the `v4Inputs` shape from an as-of pitcher context + workload shape. */
export function buildV4Inputs(pitcherAsOf = {}, workloadDataShape = {}) {
  const gs = toFiniteNumber(pitcherAsOf.seasonStarts, 0);
  const perStart = (total) => (gs > 0 && Number.isFinite(toFiniteNumber(total)) ? toFiniteNumber(total) / gs : null);
  const seasonBf = toFiniteNumber(pitcherAsOf.seasonBattersFaced);
  const seasonPitches = toFiniteNumber(pitcherAsOf.seasonPitches);

  // last-5 per-start simple means: prefer pitcherAsOf's recentMean* (last 5, incl.
  // prior-season carry); fall back to the workload shape's last starts.
  const starts = Array.isArray(workloadDataShape?.starts) ? workloadDataShape.starts.slice(-5) : [];
  const meanOf = (key) => {
    const v = starts.map((s) => toFiniteNumber(s?.[key])).filter((x) => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };

  return {
    seasonStarts: gs,
    recentStartCount: toFiniteNumber(pitcherAsOf.recentStartCount, 0),
    firstStartOfSeason: Boolean(pitcherAsOf.firstStartOfSeason),
    usedPriorSeason: Boolean(pitcherAsOf.usedPriorSeason),
    seasonIpPerStart: perStart(pitcherAsOf.seasonInnings),
    seasonBfPerStart: perStart(pitcherAsOf.seasonBattersFaced),
    seasonPitchesPerStart: perStart(pitcherAsOf.seasonPitches),
    seasonPitchesPerBF: seasonPitches != null && seasonBf != null && seasonBf > 0 ? seasonPitches / seasonBf : null,
    last5IpPerStart: toFiniteNumber(pitcherAsOf.recentMeanInnings) ?? meanOf("inningsPitched"),
    last5BfPerStart: toFiniteNumber(pitcherAsOf.recentMeanBattersFaced) ?? meanOf("battersFaced"),
    last5PitchesPerStart: toFiniteNumber(pitcherAsOf.recentMeanPitches) ?? meanOf("pitches"),
  };
}

export { round as _round };
