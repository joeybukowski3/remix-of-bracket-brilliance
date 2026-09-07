/**
 * mlb-k-projection-v3 -- production adapter.
 *
 * Turns the artifacts the daily MLB K pipeline already produces into the inputs
 * the validated v3 model wants, then returns the versioned v3 block that sits
 * ALONGSIDE v2 in k-props-v2-shadow.json.
 *
 * WHAT THIS IS NOT
 * ----------------
 * It is not a new projection. Every K-rate quantity -- pitcherSkillRate, the
 * opponent environment, the matchup adjustment, lineup and handedness context --
 * is taken from the v2 result for the same row, unchanged. v3 differs from v2 in
 * exactly two places:
 *
 *   1. projected innings and batters faced come from the v3 workload model
 *   2. the pitcher-skill shrinkage alpha is seasonBF / (seasonBF + 125)
 *      instead of the fixed 0.55
 *
 * SITE AND OPPONENT ARE CALIBRATED TO ZERO. The v3 research pass
 * (data/mlb/k-research/v3-workload-model/) selected both strengths to zero on a
 * development window: the opponent starting-pitcher signal correlated at most
 * +0.037 with pitcher-side residual innings, indistinguishable from zero at
 * n=602. The machinery is retained and fully instrumented so both terms appear
 * in diagnostics as an explicit 0 rather than being silently absent, and so
 * turning them on later is a config change rather than a rewrite.
 *
 * STARTERS ONLY. The v3 model was developed and validated exclusively on
 * starting pitchers, and its innings clamp is the starter envelope [3.0, 8.5].
 * Applied to an opener whose true level is around one inning, that floor alone
 * would nearly triple the projection. v3 therefore DECLINES to project any row
 * the workload model classifies as an opener or a reliever: it returns nulls
 * with an explicit flag and leaves v2, which carries per-role limits, as the
 * only projection for those rows. Refusing to answer outside the validated
 * scope is the fail-safe behaviour; guessing is not.
 *
 * NO MARKET INPUT. Nothing here reads kLine, oddsOver, oddsUnder or any Vegas
 * quantity. The market line is a display and evaluation value only, and an
 * enforced test asserts the output is unchanged when a line is supplied.
 *
 * DATA SOURCES, ALL ALREADY FETCHED -- nothing new is requested from any API:
 *   detail.pitcherVenueSplits.{home,away}.season   season GS / outs / BF
 *   detail.pitcherLast10Starts                     ten-start window (v3 addition)
 *   detail.pitcherLastFiveStarts                   five-start window (fallback)
 *   workloadRow.pitcherContext.seasonBattersFaced  pregame season BF, for alpha
 *   v2 result                                      every K-rate component
 */
import { computeWorkloadProjectionV3 } from "../mlb-k/compute-workload-projection-v3.mjs";
import { DEFAULTS } from "../mlb-k/mlb-k-workload-v3-core.mjs";
import { OPPONENT_DEFAULTS } from "../mlb-k/mlb-k-opponent-sp-workload-v3.mjs";
import { K_PROJECTION_V3_MODEL_VERSION, SAMPLE_SIZE_ALPHA_K, sampleSizeAlpha } from "./mlb-k-projection-v3.mjs";

export { K_PROJECTION_V3_MODEL_VERSION, SAMPLE_SIZE_ALPHA_K };

/**
 * The configuration the v3 research pass selected. Frozen here so the shipped
 * model and the backtested model are the same object, not two hand-copied sets
 * of numbers that can drift apart.
 *
 * Provenance: data/mlb/k-research/v3-workload-model/selected-config.json,
 * chosen on next-start batters-faced MAE over a development window
 * (2026-07-23..2026-08-17) with the validation window reported but never used
 * to choose.
 */
export const V3_PRODUCTION_CONFIG = Object.freeze({
  ...DEFAULTS,
  seasonWeight: 0.3,
  last10Weight: 0.45,
  last5Weight: 0.25,
  leaguePriorK: 2,
  regimeMaxShift: 0.6,
  // Calibrated to zero: retained, instrumented, contributing nothing.
  siteScale: 0,
});

export const V3_PRODUCTION_OPPONENT_CONFIG = Object.freeze({
  ...OPPONENT_DEFAULTS,
  // Calibrated to zero: retained, instrumented, contributing nothing.
  scale: 0,
});

/**
 * League fallbacks used only when the slate's own league context is missing.
 * Both are league starter levels, not pitcher-specific values, so a missing
 * league context degrades a thin-record pitcher toward a sane league level
 * rather than toward whatever his one start happened to be.
 */
export const LEAGUE_IP_PER_START_FALLBACK = 5.2;
export const LEAGUE_BF_PER_IP_FALLBACK = 4.3;

const MIN_K_RATE = 0.1;
const MAX_K_RATE = 0.4;

const finite = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

const round = (value, digits = 4) =>
  finite(value) === null ? null : Math.round(Number(value) * 10 ** digits) / 10 ** digits;

/** "5.2" -> 17 outs. Baseball fractional innings are thirds, not decimals. */
export function inningsTextToOuts(value) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value);
  if (!text.includes(".")) {
    const whole = Number(text);
    return Number.isFinite(whole) ? Math.round(whole * 3) : null;
  }
  const [whole, frac] = text.split(".");
  const w = Number(whole);
  const f = Number(frac);
  if (!Number.isFinite(w) || !Number.isFinite(f)) return null;
  return w * 3 + f;
}

/**
 * Normalizes one archived start row into the shape the v3 model expects.
 * Returns null for a row with no readable workload, which is dropped rather
 * than defaulted -- a start with unknown innings is not a zero-inning start.
 */
export function normalizeStart(start) {
  if (!start) return null;
  const outs = finite(start.outsRecorded) ?? inningsTextToOuts(start.inningsPitched);
  if (outs === null || outs < 0) return null;
  const date = start.date ?? null;
  if (!date) return null;
  return {
    date: String(date),
    outs,
    ip: outs / 3,
    bf: finite(start.battersFaced),
    pitches: finite(start.pitchCount),
    strikeouts: finite(start.strikeouts),
    hits: finite(start.hitsAllowed),
    walks: finite(start.walksAllowed),
    isHome: typeof start.isHome === "boolean" ? start.isHome : start.site === "home" ? true : start.site === "away" ? false : null,
    opponent: start.opponentAbbr ?? start.opponent ?? null,
  };
}

/**
 * The pitcher's start log for v3, newest first. Prefers the ten-start window and
 * falls back to the five-start one, so a details artifact generated before the
 * v3 field existed still produces a projection -- on a shorter window, which the
 * flags record.
 */
export function buildPitcherLog(detail) {
  const ten = Array.isArray(detail?.pitcherLast10Starts) ? detail.pitcherLast10Starts : [];
  const five = Array.isArray(detail?.pitcherLastFiveStarts) ? detail.pitcherLastFiveStarts : [];
  const source = ten.length >= five.length ? ten : five;
  return source.map(normalizeStart).filter(Boolean);
}

/** Season workload by site, from the venue splits the details artifact carries. */
export function buildSeasonSplit(detail) {
  const splits = detail?.pitcherVenueSplits ?? null;
  if (!splits) return null;

  const side = (site) => {
    const season = splits?.[site]?.season ?? null;
    const games = finite(season?.gamesUsed);
    const outs = finite(season?.totalOuts);
    if (games === null || outs === null || games <= 0) return null;
    return {
      games,
      outs,
      ip: outs / 3,
      ipPerStart: outs / 3 / games,
      battersFaced: finite(season?.battersFaced),
    };
  };

  const home = side("home");
  const away = side("away");
  if (!home && !away) return null;

  const games = (home?.games ?? 0) + (away?.games ?? 0);
  const outs = (home?.outs ?? 0) + (away?.outs ?? 0);
  const bf = (home?.battersFaced ?? 0) + (away?.battersFaced ?? 0);
  if (games <= 0) return null;

  return {
    seasonGamesStarted: games,
    seasonOuts: outs,
    seasonIp: outs / 3,
    seasonIpPerStart: outs / 3 / games,
    seasonBattersFaced: bf > 0 ? bf : null,
    seasonBfPerStart: bf > 0 ? bf / games : null,
    seasonBfPerIp: bf > 0 && outs > 0 ? bf / (outs / 3) : null,
    home,
    away,
  };
}

/**
 * Pregame season batters faced, for the shrinkage alpha, with explicit
 * provenance so a fallback is never mistaken for a measurement.
 *
 * The workload artifact's pitcherContext is preferred: it is the same pregame
 * season total the v2 path already trusts. The venue-split sum is the backup.
 */
export function resolveSeasonBattersFaced({ workloadRow, seasonSplit }) {
  const fromContext = finite(workloadRow?.pitcherContext?.seasonBattersFaced);
  if (fromContext !== null && fromContext >= 0) {
    return { seasonBattersFaced: fromContext, source: "workload.pitcherContext.seasonBattersFaced" };
  }
  const fromSplit = finite(seasonSplit?.seasonBattersFaced);
  if (fromSplit !== null && fromSplit >= 0) {
    return { seasonBattersFaced: fromSplit, source: "details.pitcherVenueSplits.season.battersFaced" };
  }
  return { seasonBattersFaced: null, source: "unavailable" };
}

/**
 * Recovers the league K-rate anchor the v2 row was built against:
 *   matchupAdjustment = (opponentEnvironmentRate - leagueKRate) * 0.75
 * Prefers the league context the slate actually carries; the recovery is the
 * fallback and is only valid while the adjustment is inside its clamp.
 */
export function resolveLeagueKRate({ leagueContext, v2, opponentMatchupMultiplier = 0.75 }) {
  const direct = finite(leagueContext?.kRate);
  if (direct !== null && direct > 0) return { leagueKRate: direct, source: "leagueContext.kRate" };
  const env = finite(v2?.opponentEnvironmentRate);
  const adj = finite(v2?.matchupAdjustment);
  if (env !== null && adj !== null) {
    return { leagueKRate: env - adj / opponentMatchupMultiplier, source: "recovered-from-v2-matchup" };
  }
  return { leagueKRate: null, source: "unavailable" };
}

/**
 * Builds the full versioned v3 block for one pitcher row.
 *
 * @param {object} args
 * @param {object} args.detail       strikeout-prop-details row for this pitcher
 * @param {object} args.workloadRow  k-workload-shadow row for this pitcher
 * @param {object} args.v2           the v2 projection result for this row
 * @param {string} args.slateDate    today's slate; only earlier starts are visible
 * @param {boolean} args.pitcherIsHome
 * @param {string|null} args.opponent
 * @param {object|null} args.leagueContext
 * @param {number|null} args.leagueIpPerStart league starter IP/start for this slate
 * @param {number|null} args.leagueBfPerIp    league starter BF/IP for this slate
 */
/**
 * Roles v3 is validated for. The workload artifact classifies every listed
 * pitcher as starter / opener / reliever; only the first is in scope.
 */
export const V3_SUPPORTED_ROLES = Object.freeze(["starter"]);

/** An out-of-scope or unprojectable row: shaped like a v3 block, all nulls. */
function declineProjection({ reason, role, slateDate, v2 }) {
  return {
    modelVersion: K_PROJECTION_V3_MODEL_VERSION,
    workloadModelVersion: null,
    neutralIP: null,
    seasonIPPerStart: null,
    last10IPPerStart: null,
    last5IPPerStart: null,
    robustLast10IP: null,
    robustLast5IP: null,
    rawLast10IP: null,
    rawLast5IP: null,
    regimeAdjustment: null,
    regime: null,
    siteAdjustment: 0,
    opponentAdjustment: 0,
    finalProjectedIP: null,
    expectedBFPerIP: null,
    projectedBF: null,
    seasonBF: null,
    seasonBFSource: "not-evaluated",
    alpha: null,
    alphaSource: "not-evaluated",
    leagueKRate: null,
    leagueKRateSource: "not-evaluated",
    pitcherSkillRate: null,
    shrunkSkillRate: null,
    matchupAdjustment: null,
    opponentEnvironmentRate: null,
    projectedKRate: null,
    projectedKs: null,
    v3MinusV2Ks: null,
    v3MinusV2IP: null,
    v3MinusV2BF: null,
    inputs: { slateDate, role, v2ProjectedKs: finite(v2?.projectedStrikeouts) },
    flags: [reason],
  };
}

export function buildV3Projection({
  detail = null,
  workloadRow = null,
  v2 = null,
  slateDate,
  pitcherIsHome = false,
  opponent = null,
  leagueContext = null,
  leagueIpPerStart = null,
  leagueBfPerIp = null,
  config = V3_PRODUCTION_CONFIG,
  opponentConfig = V3_PRODUCTION_OPPONENT_CONFIG,
} = {}) {
  const role = workloadRow?.role ?? null;
  if (role !== null && !V3_SUPPORTED_ROLES.includes(role)) {
    return declineProjection({ reason: `ROLE_OUT_OF_V3_SCOPE_${String(role).toUpperCase()}`, role, slateDate, v2 });
  }

  const flags = [];
  const pitcherLog = buildPitcherLog(detail);
  const seasonSplit = buildSeasonSplit(detail);

  if (!Array.isArray(detail?.pitcherLast10Starts) || detail.pitcherLast10Starts.length === 0) {
    flags.push("LAST10_WINDOW_UNAVAILABLE_USING_LAST5");
  }

  const workload = computeWorkloadProjectionV3({
    asOfDate: slateDate,
    pitcherId: finite(detail?.pitcherId) ?? finite(workloadRow?.pitcherId),
    pitcherIsHome: pitcherIsHome === true,
    opponent,
    seasonSplit,
    pitcherLog,
    // The opponent term is calibrated to zero, so no league-wide start log is
    // required at generation time. Passing empty keeps the diagnostics honest:
    // the opponent block reports an insufficient sample rather than a fabricated
    // effect, and its adjustment is 0 either way.
    startLog: [],
    logByPitcher: new Map(),
    leagueIpPerStart: finite(leagueIpPerStart) ?? LEAGUE_IP_PER_START_FALLBACK,
    leagueBfPerIp: finite(leagueBfPerIp) ?? LEAGUE_BF_PER_IP_FALLBACK,
    leagueCentre: null,
    config,
    opponentConfig,
  });

  const { seasonBattersFaced, source: seasonBfSource } = resolveSeasonBattersFaced({ workloadRow, seasonSplit });
  const { alpha, source: alphaSource } = sampleSizeAlpha(seasonBattersFaced, SAMPLE_SIZE_ALPHA_K);
  if (alphaSource !== "sample-size") flags.push("SHRINKAGE_ALPHA_FELL_BACK_TO_PRODUCTION");

  const { leagueKRate, source: leagueKRateSource } = resolveLeagueKRate({ leagueContext, v2 });
  const pitcherSkillRate = finite(v2?.pitcherSkillRate);
  const matchupAdjustment = finite(v2?.matchupAdjustment) ?? 0;
  const projectedBattersFaced = finite(workload.battersFaced.projectedBattersFaced);
  const projectedInnings = finite(workload.workload.finalProjectedIP);

  const shrunkSkillRate =
    pitcherSkillRate === null || leagueKRate === null
      ? null
      : leagueKRate + alpha * (pitcherSkillRate - leagueKRate);
  const projectedKRate = shrunkSkillRate === null ? null : clamp(shrunkSkillRate + matchupAdjustment, MIN_K_RATE, MAX_K_RATE);
  const projectedStrikeouts =
    projectedKRate === null || projectedBattersFaced === null ? null : projectedKRate * projectedBattersFaced;

  if (pitcherSkillRate === null) flags.push("PITCHER_SKILL_RATE_UNAVAILABLE");
  if (leagueKRate === null) flags.push("LEAGUE_K_RATE_UNAVAILABLE");
  if (projectedStrikeouts === null) flags.push("V3_PROJECTION_UNAVAILABLE");

  const v2Ks = finite(v2?.projectedStrikeouts);
  const v2Ip = finite(v2?.projectedInnings);
  const v2Bf = finite(v2?.projectedBattersFaced);

  return {
    modelVersion: K_PROJECTION_V3_MODEL_VERSION,
    workloadModelVersion: workload.modelVersion,

    // ---- workload decomposition, every term separately logged ----
    neutralIP: workload.workload.neutralIP,
    seasonIPPerStart: workload.workload.seasonIPPerStart,
    last10IPPerStart: workload.workload.last10IPPerStart,
    last5IPPerStart: workload.workload.last5IPPerStart,
    robustLast10IP: workload.workload.last10IPPerStart,
    robustLast5IP: workload.workload.last5IPPerStart,
    rawLast10IP: workload.workload.last10RawIPPerStart,
    rawLast5IP: workload.workload.last5RawIPPerStart,
    regimeAdjustment: workload.workload.currentRegimeAdjustment,
    regime: workload.regime,
    /** Calibrated to zero. Retained and instrumented; see the module header. */
    siteAdjustment: 0,
    /** Calibrated to zero. Retained and instrumented; see the module header. */
    opponentAdjustment: 0,
    finalProjectedIP: projectedInnings,

    // ---- batters faced ----
    expectedBFPerIP: workload.battersFaced.expectedBFPerIP,
    projectedBF: projectedBattersFaced,

    // ---- K rate ----
    seasonBF: seasonBattersFaced,
    seasonBFSource: seasonBfSource,
    alpha: round(alpha),
    alphaSource,
    leagueKRate: round(leagueKRate),
    leagueKRateSource,
    pitcherSkillRate: round(pitcherSkillRate),
    shrunkSkillRate: round(shrunkSkillRate),
    matchupAdjustment: round(matchupAdjustment),
    opponentEnvironmentRate: round(finite(v2?.opponentEnvironmentRate)),
    projectedKRate: round(projectedKRate),
    projectedKs: round(projectedStrikeouts, 3),

    // ---- side by side with v2 ----
    v3MinusV2Ks: projectedStrikeouts === null || v2Ks === null ? null : round(projectedStrikeouts - v2Ks, 3),
    v3MinusV2IP: projectedInnings === null || v2Ip === null ? null : round(projectedInnings - v2Ip, 3),
    v3MinusV2BF: projectedBattersFaced === null || v2Bf === null ? null : round(projectedBattersFaced - v2Bf, 3),

    inputs: {
      slateDate,
      pitcherIsHome: pitcherIsHome === true,
      last10Sample: workload.inputs.last10Sample,
      last5Sample: workload.inputs.last5Sample,
      seasonGamesStarted: workload.inputs.seasonGamesStarted,
      evidenceStarts: workload.inputs.evidenceStarts,
      leaguePriorTrust: workload.inputs.leaguePriorTrust,
      leagueIPPerStart: workload.inputs.leagueIPPerStart,
      leagueBFPerIP: workload.inputs.leagueBFPerIP,
      config: {
        seasonWeight: config.seasonWeight,
        last10Weight: config.last10Weight,
        last5Weight: config.last5Weight,
        leaguePriorK: config.leaguePriorK,
        regimeMaxShift: config.regimeMaxShift,
        siteScale: config.siteScale,
        opponentScale: opponentConfig.scale,
        alphaK: SAMPLE_SIZE_ALPHA_K,
      },
    },
    flags: [...flags, ...workload.flags],
  };
}

export default buildV3Projection;
