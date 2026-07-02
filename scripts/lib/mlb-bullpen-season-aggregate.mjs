/**
 * mlb-bullpen-season-aggregate.mjs
 *
 * Pure aggregation of a team's reliever-pool season pitching stats into
 * team-level bullpen totals and rate stats.
 *
 * Rate stats are always derived from summed totals (earned runs, outs,
 * home runs, strikeouts, walks, hits), never by averaging individual
 * pitcher rate stats -- averaging per-pitcher ERA, for example, would
 * incorrectly weight a reliever who threw 2 innings the same as one who
 * threw 40.
 */

import { sumInningsToOuts, outsToBaseballNotation, outsToDecimalInnings } from "./mlb-bullpen-innings.mjs";

export const MIN_RELIEVERS_FOR_ADEQUATE_COVERAGE = 3;
export const MIN_OUTS_FOR_ADEQUATE_COVERAGE = 60; // 20 innings aggregate

function toNumberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * @typedef {object} PitcherSeasonPitchingStat
 * @property {string|number|null} inningsPitched
 * @property {number|null} earnedRuns
 * @property {number|null} homeRuns
 * @property {number|null} strikeOuts
 * @property {number|null} baseOnBalls
 * @property {number|null} hits
 */

/**
 * Aggregates a set of reliever-pool pitchers' season stats into team
 * bullpen totals, rate stats, and coverage metadata.
 *
 * @param {number[]} relieverPitcherIds
 * @param {Map<number, PitcherSeasonPitchingStat>} seasonStatsByPitcherId
 * @param {{ rosterPitcherCount?: number }} [context]
 */
export function aggregateSeasonBullpenStats(relieverPitcherIds, seasonStatsByPitcherId, context = {}) {
  const contributingPitcherIds = [];
  const missingStatsPitcherIds = [];

  let totalOuts = 0;
  let totalEarnedRuns = 0;
  let totalHomeRuns = 0;
  let totalStrikeOuts = 0;
  let totalBaseOnBalls = 0;
  let totalHits = 0;
  let statsAreIncomplete = false;

  for (const pitcherId of relieverPitcherIds ?? []) {
    const stat = seasonStatsByPitcherId?.get(pitcherId);
    if (!stat) {
      missingStatsPitcherIds.push(pitcherId);
      continue;
    }
    const outsList = sumInningsToOuts([stat.inningsPitched]);
    const earnedRuns = toNumberOrNull(stat.earnedRuns);
    const homeRuns = toNumberOrNull(stat.homeRuns);
    const strikeOuts = toNumberOrNull(stat.strikeOuts);
    const baseOnBalls = toNumberOrNull(stat.baseOnBalls);
    const hits = toNumberOrNull(stat.hits);

    if (
      stat.inningsPitched === null || stat.inningsPitched === undefined ||
      earnedRuns === null || homeRuns === null || strikeOuts === null ||
      baseOnBalls === null || hits === null
    ) {
      statsAreIncomplete = true;
    }

    contributingPitcherIds.push(pitcherId);
    totalOuts += outsList;
    totalEarnedRuns += earnedRuns ?? 0;
    totalHomeRuns += homeRuns ?? 0;
    totalStrikeOuts += strikeOuts ?? 0;
    totalBaseOnBalls += baseOnBalls ?? 0;
    totalHits += hits ?? 0;
  }

  const decimalInnings = outsToDecimalInnings(totalOuts);
  const relieverCount = relieverPitcherIds?.length ?? 0;
  const rosterPitcherCount = context.rosterPitcherCount ?? null;

  const hasInnings = decimalInnings > 0;
  const seasonBullpenEra = hasInnings ? round2((totalEarnedRuns * 9) / decimalInnings) : null;
  const seasonBullpenHr9 = hasInnings ? round2((totalHomeRuns * 9) / decimalInnings) : null;
  const seasonBullpenKbb = totalBaseOnBalls > 0 ? round2(totalStrikeOuts / totalBaseOnBalls) : null;
  const seasonBullpenWhip = hasInnings ? round2((totalBaseOnBalls + totalHits) / decimalInnings) : null;

  const coverageRatio = relieverCount > 0 ? contributingPitcherIds.length / relieverCount : 0;
  const dataQuality = classifyCoverage({
    contributingCount: contributingPitcherIds.length,
    totalOuts,
    statsAreIncomplete,
  });

  const warnings = [];
  if (missingStatsPitcherIds.length > 0) {
    warnings.push(`${missingStatsPitcherIds.length} reliever(s) missing season stats and excluded from totals`);
  }
  if (statsAreIncomplete) warnings.push("one or more contributing pitchers had partial/incomplete stat fields");
  if (dataQuality === "insufficient") {
    warnings.push("reliever coverage insufficient for a high-confidence bullpen score");
  }

  return {
    seasonBullpenIp: outsToBaseballNotation(totalOuts),
    seasonBullpenEra,
    seasonBullpenHr9,
    seasonBullpenKbb,
    seasonBullpenWhip,
    coverageMetadata: {
      relieverCount,
      rosterPitcherCount,
      contributingPitcherCount: contributingPitcherIds.length,
      missingStatsCount: missingStatsPitcherIds.length,
      coverageRatio: round2(coverageRatio),
    },
    sampleSize: {
      outs: totalOuts,
      inningsPitched: outsToBaseballNotation(totalOuts),
      contributingPitcherCount: contributingPitcherIds.length,
    },
    dataQuality,
    warnings,
    // Retained internally for auditability; callers building the public
    // schema may choose to omit this field from persisted output.
    contributingPitcherIds,
  };
}

function classifyCoverage({ contributingCount, totalOuts, statsAreIncomplete }) {
  if (contributingCount === 0 || totalOuts === 0) return "insufficient";
  if (
    contributingCount < MIN_RELIEVERS_FOR_ADEQUATE_COVERAGE ||
    totalOuts < MIN_OUTS_FOR_ADEQUATE_COVERAGE
  ) {
    return "low";
  }
  return statsAreIncomplete ? "adequate" : "high";
}

function round2(value) {
  return Math.round(value * 100) / 100;
}
