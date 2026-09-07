/**
 * mlb-k-workload-v3 -- composition.
 *
 * NEW module, added alongside scripts/mlb-k/compute-workload-projection.mjs
 * (v2). v2 is not modified, not imported, and remains the production workload
 * model until a promotion is explicitly authorised.
 *
 * THE MODEL
 * ---------
 *   neutral IP        strong season anchor blended with last 10 and last 5,
 *                     each recent window reliability-weighted so an unexplained
 *                     one-inning exit cannot define a pitcher's workload level
 *   + regime delta    weight migrates off the season anchor when recent
 *                     workload is sustainedly, consistently different
 *   + site delta      shrunk, capped home/away tendency
 *   + opponent delta  how far this offense pushes starters past or short of
 *                     THEIR OWN neutral expectation, capped
 *   = projected IP
 *
 *   projected BF = projected IP x blended BF/IP
 *
 * The projected IP/BF then feed the existing K-rate machinery unchanged. This
 * module never computes a strikeout rate and never reads a market line.
 */
import {
  DEFAULTS,
  STARTER_IP_MAX,
  STARTER_IP_MIN,
  WORKLOAD_V3_MODEL_VERSION,
  blendNeutralIp,
  clamp,
  expectedBfPerIp,
  priorStarts,
  projectBattersFaced,
  regimeEvidence,
  regimeShiftedWeights,
  robustIpPerStart,
  siteAdjustment,
} from "./mlb-k-workload-v3-core.mjs";

import { OPPONENT_DEFAULTS, opponentWorkloadEffect } from "./mlb-k-opponent-sp-workload-v3.mjs";

export { WORKLOAD_V3_MODEL_VERSION };

const finite = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const round = (value, digits = 4) =>
  finite(value) === null ? null : Math.round(Number(value) * 10 ** digits) / 10 ** digits;

/**
 * @param {object} input
 * @param {string} input.asOfDate        slate date; only strictly earlier starts are visible
 * @param {number} input.pitcherId
 * @param {boolean} input.pitcherIsHome
 * @param {string} input.opponent        opponent team abbreviation
 * @param {object|null} input.seasonSplit pregame venue-split record for this pitcher
 * @param {Array} input.pitcherLog       this pitcher's start log (any order)
 * @param {Array} input.startLog         league-wide start log, for the opponent model
 * @param {Map} input.logByPitcher       pitcherId -> that pitcher's starts
 * @param {number|null} input.leagueIpPerStart league starter IP/start as of this date
 * @param {number|null} input.leagueBfPerIp   league starter BF/IP as of this date
 * @param {object|null} input.leagueCentre  pregame { meanDelta, overRate } the opponent
 *                                          deltas are centred on; see leagueBaseline
 * @param {object} [input.config]        pitcher-side overrides
 * @param {object} [input.opponentConfig] opponent-side overrides
 */
export function computeWorkloadProjectionV3(input = {}) {
  const config = { ...DEFAULTS, ...(input.config ?? {}) };
  const opponentConfig = { ...OPPONENT_DEFAULTS, ...(input.opponentConfig ?? {}) };
  const flags = [];

  const last10Starts = priorStarts(input.pitcherLog, input.asOfDate, 10);
  const last5Starts = last10Starts.slice(0, 5);
  const last10 = robustIpPerStart(last10Starts, config);
  const last5 = robustIpPerStart(last5Starts, config);

  const split = input.seasonSplit ?? null;
  const seasonIpPerStart = finite(split?.seasonIpPerStart);
  if (seasonIpPerStart === null) flags.push("SEASON_IP_PER_START_UNAVAILABLE");
  if (last10.n < 3) flags.push("LOW_RECENT_START_SAMPLE");

  // ---- neutral baseline, then the regime-shifted baseline ----
  /**
   * Evidence backing this pitcher's own workload level: his season starts when
   * the split is available, otherwise the recent window. It drives the league
   * prior, so a pitcher one start into a season is not taken at face value.
   */
  const evidenceStarts = finite(split?.seasonGamesStarted) ?? last10.n;
  const windows = {
    seasonIpPerStart,
    last10IpPerStart: last10.value,
    last5IpPerStart: last5.value,
    evidenceStarts,
    leagueIpPerStart: input.leagueIpPerStart,
  };
  const neutralIp = blendNeutralIp(windows, config);
  const regime = regimeEvidence({ seasonIpPerStart, last10Starts, last10IpPerStart: last10.value }, config);
  const shifted = regimeShiftedWeights(regime.evidence, config, config);
  const regimeBlend = blendNeutralIp(windows, shifted);
  const currentRegimeAdjustment =
    neutralIp === null || regimeBlend === null ? 0 : regimeBlend - neutralIp;

  // ---- site ----
  const siteRecord = input.pitcherIsHome ? split?.home : split?.away;
  const site = siteAdjustment(
    {
      siteIpPerStart: finite(siteRecord?.ipPerStart),
      siteGames: finite(siteRecord?.games),
      seasonIpPerStart,
    },
    config,
  );
  if (siteRecord == null) flags.push("SITE_SPLIT_UNAVAILABLE");

  // ---- opponent ----
  const opponent = opponentWorkloadEffect(
    {
      team: input.opponent,
      asOfDate: input.asOfDate,
      startLog: input.startLog,
      logByPitcher: input.logByPitcher,
      leagueIpPerStart: input.leagueIpPerStart,
      leagueCentre: input.leagueCentre ?? null,
    },
    opponentConfig,
  );
  if (input.leagueCentre == null) flags.push("OPPONENT_LEAGUE_CENTRE_UNAVAILABLE");
  if (opponent.reason === "insufficient-opponent-sample") flags.push("OPPONENT_SAMPLE_INSUFFICIENT");

  // ---- final ----
  const rawProjectedIp =
    neutralIp === null
      ? null
      : neutralIp + currentRegimeAdjustment + site.adjustment + opponent.adjustment;
  const finalProjectedIp = rawProjectedIp === null ? null : clamp(rawProjectedIp, STARTER_IP_MIN, STARTER_IP_MAX);
  if (rawProjectedIp !== null && rawProjectedIp !== finalProjectedIp) flags.push("PROJECTED_IP_CLAMPED");

  const bfPerIp = expectedBfPerIp(
    {
      seasonBfPerIp: finite(split?.seasonBfPerIp),
      last10Starts,
      last5Starts,
      evidenceStarts,
      leagueBfPerIp: input.leagueBfPerIp,
    },
    config,
  );
  const projectedBattersFaced = projectBattersFaced(finalProjectedIp, bfPerIp);
  if (bfPerIp === null) flags.push("BF_PER_IP_UNAVAILABLE");

  return {
    modelVersion: WORKLOAD_V3_MODEL_VERSION,
    workload: {
      neutralIP: round(neutralIp),
      seasonIPPerStart: round(seasonIpPerStart),
      last10IPPerStart: round(last10.value),
      last5IPPerStart: round(last5.value),
      last10RawIPPerStart: round(last10.rawMean),
      last5RawIPPerStart: round(last5.rawMean),
      currentRegimeAdjustment: round(currentRegimeAdjustment),
      siteAdjustment: round(site.adjustment),
      opponentAdjustment: round(opponent.adjustment),
      finalProjectedIP: round(finalProjectedIp),
    },
    regime: {
      evidence: round(regime.evidence),
      gap: round(regime.gap),
      consistency: round(regime.consistency),
      sample: round(regime.sample),
      magnitude: round(regime.magnitude),
      shiftedWeights: {
        season: round(shifted.seasonWeight),
        last10: round(shifted.last10Weight),
        last5: round(shifted.last5Weight),
      },
    },
    site: {
      isHome: input.pitcherIsHome === true,
      siteIPPerStart: round(finite(siteRecord?.ipPerStart)),
      siteGames: finite(siteRecord?.games),
      rawDelta: round(site.rawDelta),
      shrink: round(site.shrink),
      adjustment: round(site.adjustment),
    },
    opponent: {
      team: input.opponent ?? null,
      opponentSeasonDelta: round(opponent.season.meanDelta),
      opponentL10Delta: round(opponent.last10.meanDelta),
      opponentL5Delta: round(opponent.last5.meanDelta),
      opponentSeasonMedianDelta: round(opponent.season.medianDelta),
      opponentOverExpectedRate: round(opponent.season.overRate),
      opponentOverExpectedRateL10: round(opponent.last10.overRate),
      opponentOverExpectedRateL5: round(opponent.last5.overRate),
      opponentUnderExpectedRate: round(opponent.season.underRate),
      opponentRawMeanStarterIP: round(opponent.season.rawMeanIp),
      opponentSeasonRawDelta: round(opponent.season.rawMeanDelta),
      opponentRawOverExpectedRate: round(opponent.season.rawOverRate),
      leagueCentreMeanDelta: round(opponent.leagueCentre?.meanDelta ?? null),
      leagueCentreOverRate: round(opponent.leagueCentre?.overRate ?? null),
      observations: opponent.season.n,
      weightSum: round(opponent.season.weightSum),
      reliability: round(opponent.reliability),
      consistencyScale: round(opponent.consistencyScale),
      blendedDelta: round(opponent.blendedDelta),
      capped: opponent.capped === true,
      adjustment: round(opponent.adjustment),
    },
    battersFaced: {
      expectedBFPerIP: round(bfPerIp),
      projectedBattersFaced: round(projectedBattersFaced),
    },
    inputs: {
      asOfDate: input.asOfDate ?? null,
      pitcherId: input.pitcherId ?? null,
      last10Sample: last10.n,
      last5Sample: last5.n,
      last10WeightSum: round(last10.weightSum),
      last5WeightSum: round(last5.weightSum),
      seasonGamesStarted: finite(split?.seasonGamesStarted),
      evidenceStarts,
      leaguePriorTrust: round(evidenceStarts / (evidenceStarts + config.leaguePriorK)),
      leagueIPPerStart: round(input.leagueIpPerStart),
      leagueBFPerIP: round(input.leagueBfPerIp),
    },
    flags,
  };
}

export default computeWorkloadProjectionV3;
