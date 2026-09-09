/**
 * compute-k-projection-v4.mjs
 *
 * Orchestrator: turns a pitcher's start log plus the opponent's recent
 * starter history into the full, auditable V4 block.
 *
 * Everything here is a pure function of its arguments. The two production
 * entry points (today's slate and the historical backtest) both call this,
 * which is what makes "the backtest scored the model that actually ships"
 * checkable rather than hopeful.
 *
 * LEAKAGE. `asOfDate` is enforced in both directions: pitcher form reads only
 * starts strictly before it, and the opponent context asserts the same for
 * every observation it is handed.
 *
 * NO MARKET INPUT.
 */
import {
  buildOpponentStarterContext,
  assertNoLookahead,
  OPPONENT_CONTEXT_DEFAULTS,
} from "./mlb-k-opponent-starter-context.mjs";
import {
  projectStrikeoutsV4,
  offensiveStrengthIndex,
  V4_DEFAULTS,
  K_PROJECTION_V4_MODEL_VERSION,
} from "./mlb-k-projection-v4-core.mjs";

export { K_PROJECTION_V4_MODEL_VERSION, V4_DEFAULTS, OPPONENT_CONTEXT_DEFAULTS };

/** Roles V4 is validated for. Everything else declines to a null projection. */
export const V4_SUPPORTED_ROLES = Object.freeze(["starter"]);

const finite = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const round = (value, digits = 4) =>
  finite(value) === null ? null : Math.round(Number(value) * 10 ** digits) / 10 ** digits;

/**
 * Season / last-10 / last-5 workload and strikeout rates from a start list.
 *
 * Rates are TOTALS over TOTALS (sum K / sum IP), never a mean of per-start
 * rates: averaging per-start K/IP over-weights short high-strikeout outings
 * and biases the anchor upward, which is one of the errors V4 exists to avoid.
 *
 * @param {object[]} starts `{ date, outs, strikeouts, battersFaced? }`
 * @param {string} asOfDate only starts strictly before this are visible
 */
export function summarizePitcherForm(starts = [], asOfDate) {
  const usable = (starts ?? [])
    .map((start) => ({
      date: start?.date ? String(start.date) : null,
      outs: finite(start?.outs ?? start?.outsRecorded),
      strikeouts: finite(start?.strikeouts),
      battersFaced: finite(start?.battersFaced ?? start?.bf),
    }))
    .filter((start) => start.date && start.outs !== null && start.outs >= 0 && start.strikeouts !== null)
    .filter((start) => (asOfDate ? start.date < String(asOfDate) : true))
    .sort((a, b) => b.date.localeCompare(a.date));

  const aggregate = (rows) => {
    if (!rows.length) return { ipPerStart: null, kPerIP: null, innings: 0, starts: 0, bfPerIP: null };
    const outs = rows.reduce((sum, row) => sum + row.outs, 0);
    const strikeouts = rows.reduce((sum, row) => sum + row.strikeouts, 0);
    const bfRows = rows.filter((row) => row.battersFaced !== null);
    const bf = bfRows.reduce((sum, row) => sum + row.battersFaced, 0);
    const innings = outs / 3;
    return {
      starts: rows.length,
      innings,
      ipPerStart: innings / rows.length,
      kPerIP: innings > 0 ? strikeouts / innings : null,
      bfPerIP: innings > 0 && bfRows.length === rows.length && bf > 0 ? bf / innings : null,
    };
  };

  const season = aggregate(usable);
  const last10 = aggregate(usable.slice(0, 10));
  const last5 = aggregate(usable.slice(0, 5));

  return {
    season,
    last10,
    last5,
    mostRecentStartDate: usable[0]?.date ?? null,
    sampleStarts: usable.length,
  };
}

/**
 * Builds the complete V4 block for one pitcher / one slate.
 *
 * @param {object} args
 * @param {object[]} args.pitcherStarts     this pitcher's completed starts
 * @param {object[]} args.opponentObservations starts made AGAINST today's opponent
 * @param {Function} args.baselineFor       opponent-starter baseline resolver
 * @param {string}   args.asOfDate          slate date
 * @param {string|null} args.role           workload role (starter/opener/reliever)
 * @param {object}   args.leagueContext     `{ ipPerStart, kPerIP, kRate, bfPerIP }`
 * @param {object}   args.opponentSplits    `{ kRateVsHand, recentKRate, wrcRankRecent, wrcRankSeason }`
 * @param {object|null} args.seasonOverride season aggregate from a fuller source
 *        than the recent-start window -- production carries whole-season venue
 *        splits, while `pitcherStarts` is only the last ten. Shape matches
 *        `summarizePitcherForm().season`. Recent windows always come from
 *        `pitcherStarts`; only the season anchor is replaced.
 */
export function computeKProjectionV4({
  pitcherStarts = [],
  opponentObservations = [],
  baselineFor = null,
  asOfDate,
  role = null,
  leagueContext = {},
  opponentSplits = {},
  seasonOverride = null,
  config = V4_DEFAULTS,
  opponentConfig = OPPONENT_CONTEXT_DEFAULTS,
} = {}) {
  if (role !== null && !V4_SUPPORTED_ROLES.includes(role)) {
    return declineV4(`ROLE_OUT_OF_V4_SCOPE_${String(role).toUpperCase()}`, asOfDate, role);
  }
  if (!asOfDate) return declineV4("NO_SLATE_DATE", asOfDate, role);

  // Hard leakage gate. Throws rather than silently degrading, because a
  // leaked observation would invalidate the whole validation exercise.
  assertNoLookahead(opponentObservations, asOfDate, "compute-k-projection-v4");

  const windowForm = summarizePitcherForm(pitcherStarts, asOfDate);
  const seasonSource = seasonOverride && finite(seasonOverride.ipPerStart) !== null
    ? { ...seasonOverride, source: "season-override" }
    : { ...windowForm.season, source: "recent-window" };
  const form = { ...windowForm, season: seasonSource };
  if (form.sampleStarts === 0 && finite(seasonSource.ipPerStart) === null) {
    return declineV4("NO_PITCHER_HISTORY", asOfDate, role);
  }

  const opponent = baselineFor
    ? buildOpponentStarterContext({
        observations: opponentObservations,
        baselineFor,
        asOfDate,
        config: opponentConfig,
      })
    : buildOpponentStarterContext({ observations: [], baselineFor: () => null, asOfDate, config: opponentConfig });

  const strength = offensiveStrengthIndex(
    opponentSplits.wrcRankRecent,
    opponentSplits.wrcRankSeason,
    config,
  );

  const projection = projectStrikeoutsV4(
    {
      seasonIPPerStart: form.season.ipPerStart,
      last10IPPerStart: form.last10.ipPerStart,
      last5IPPerStart: form.last5.ipPerStart,
      seasonGamesStarted: form.season.starts,

      seasonKPerIP: form.season.kPerIP,
      last10KPerIP: form.last10.kPerIP,
      last5KPerIP: form.last5.kPerIP,
      seasonInnings: form.season.innings,

      bfPerIP: form.season.bfPerIP ?? leagueContext.bfPerIP,

      leagueIPPerStart: leagueContext.ipPerStart,
      leagueKPerIP: leagueContext.kPerIP,
      leagueKRate: leagueContext.kRate,

      opponentIPFactor: opponent.shrunkIpFactor,
      opponentKRateFactor: opponent.shrunkKRateFactor,
      opponentConfidence: opponent.confidence,
      opponentKRateVsHand: opponentSplits.kRateVsHand,
      opponentRecentKRate: opponentSplits.recentKRate,
      offensiveStrengthIndex: strength,
      contextWarnings: opponent.warnings,
    },
    config,
  );

  return {
    ...projection,
    role,
    slateDate: asOfDate,

    // ---- opponent context, fully exposed for audit ----
    opponentGames: opponent.games,
    opponentUsableGames: opponent.usableGames,
    opponentStarterIPAgainst: opponent.avgStarterIPAgainst,
    opponentStarterNormalIP: opponent.avgStarterBaselineIP,
    opponentStarterKsAgainst: opponent.avgStarterKsAgainst,
    opponentStarterNormalKPerIP: opponent.avgStarterBaselineKPerIP,
    rawOpponentIPFactor: opponent.rawIpFactor,
    shrunkOpponentIPFactor: opponent.shrunkIpFactor,
    rawOpponentKFactor: opponent.rawKRateFactor,
    shrunkOpponentKFactor: opponent.shrunkKRateFactor,
    opponentConfidence: opponent.confidence,
    opponentWrcPlusRankRecent: finite(opponentSplits.wrcRankRecent),
    opponentWrcPlusRankSeason: finite(opponentSplits.wrcRankSeason),
    offensiveStrengthIndex: round(strength),

    pitcherSampleStarts: form.sampleStarts,
    pitcherSeasonSource: seasonSource.source,
    pitcherMostRecentStart: form.mostRecentStartDate,
    opponentObservations: opponent.observations,
  };
}

/** A declined row: shaped like a V4 block, all projection fields null. */
export function declineV4(reason, slateDate = null, role = null) {
  return {
    modelVersion: K_PROJECTION_V4_MODEL_VERSION,
    slateDate,
    role,
    finalProjectedIP: null,
    finalProjectedKPerIP: null,
    projectedKs: null,
    projectedBattersFaced: null,
    confidence: "insufficient",
    confidenceScore: 0,
    warnings: [reason],
  };
}

export default computeKProjectionV4;
