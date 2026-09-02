/**
 * mlb-k-backtest-asof.mjs  (backtest step 3)
 *
 * PURE, leak-free "as-of" reconstruction of the pitcher, opponent and league
 * context that the production Projected K models consume. No I/O, no clock.
 *
 * THE leakage gate: every aggregation includes a game log / team log row only
 * when `isBeforeCutoff(row.date, cutoffDate)` is true AND the row is not the
 * game being projected. `cutoffDate` is the start's slate date (`officialDate`);
 * the comparison is a strict `<`, so a game on the slate date itself - including
 * the pitcher's own start - is never used to project that start.
 *
 * Rates are StatsAPI-derived cumulative values (K / BF, K / IP, team K / PA).
 * They are close to but NOT identical to the Baseball Savant Statcast plate-
 * discipline rates production uses; the whiff-supported terms are therefore
 * approximated. Every such substitution is surfaced by the dataset builder as a
 * per-row degradation flag.
 */
import { parseInningsPitchedString } from "./mlb-projected-innings.mjs";

const RECENT_STARTS_SAMPLE = 5;
const WORKLOAD_START_SAMPLE = 6;
const WORKLOAD_APPEARANCE_SAMPLE = 8;
const RECENT_TEAM_WINDOW_DAYS = 14;

/** The single leakage gate. Strict "before"; blank dates are excluded. */
export function isBeforeCutoff(rowDate, cutoffDate) {
  return typeof rowDate === "string" && rowDate.length === 10 && rowDate < cutoffDate;
}

function isoSubtractDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function safeInnings(value) {
  const parsed = parseInningsPitchedString(value);
  return parsed != null && parsed > 0 ? parsed : null;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

function mean(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  return valid.length ? sum(valid) / valid.length : null;
}

/**
 * Filter + order raw pitching-log rows for use before `cutoffDate`.
 * Optionally prepends the previous season's rows (mirroring
 * `fetchPitcherWorkloadData`'s previous-season fallback) so an early-season
 * start still has a recent-form sample.
 */
export function eligiblePitchingRows({ currentSeasonRows = [], priorSeasonRows = [], cutoffDate, excludeGamePk = null }) {
  const current = currentSeasonRows
    .filter((row) => isBeforeCutoff(row.date, cutoffDate) && row.gamePk !== excludeGamePk)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.gamePk ?? 0) - (b.gamePk ?? 0));
  const currentStarts = current.filter((row) => row.gamesStarted === 1);

  const reliefShare = current.length >= 3 ? (current.length - currentStarts.length) / current.length : 0;
  const looksLikeReliever = current.length >= 3 && currentStarts.length <= 1 && reliefShare >= 0.7;

  let combined = current;
  let usedPriorSeason = false;
  if (!looksLikeReliever && currentStarts.length < WORKLOAD_START_SAMPLE && priorSeasonRows.length) {
    const prior = priorSeasonRows
      .filter((row) => row.gamePk !== excludeGamePk)
      .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || (a.gamePk ?? 0) - (b.gamePk ?? 0));
    if (prior.length) {
      combined = [...prior, ...current];
      usedPriorSeason = true;
    }
  }

  return {
    currentSeasonBeforeCutoff: current,
    currentStartsBeforeCutoff: currentStarts,
    combinedBeforeCutoff: combined,
    combinedStartsBeforeCutoff: combined.filter((row) => row.gamesStarted === 1),
    looksLikeReliever,
    usedPriorSeason,
  };
}

/** As-of pitcher context: season-to-date aggregates + recent-form samples. */
export function buildPitcherAsOf({ currentSeasonRows = [], priorSeasonRows = [], cutoffDate, excludeGamePk = null } = {}) {
  if (!cutoffDate) throw new Error("buildPitcherAsOf requires cutoffDate");
  const eligible = eligiblePitchingRows({ currentSeasonRows, priorSeasonRows, cutoffDate, excludeGamePk });

  const seasonStarts = eligible.currentStartsBeforeCutoff;
  const seasonInningsValues = seasonStarts.map((row) => safeInnings(row.inningsPitched)).filter((value) => value != null);
  const seasonInnings = seasonInningsValues.length ? sum(seasonInningsValues) : null;
  const seasonStrikeOuts = seasonStarts.length ? sum(seasonStarts.map((row) => row.strikeOuts ?? 0)) : null;
  const seasonBattersFaced = seasonStarts.some((row) => row.battersFaced != null)
    ? sum(seasonStarts.map((row) => row.battersFaced ?? 0))
    : null;
  const seasonWalks = seasonStarts.length ? sum(seasonStarts.map((row) => row.baseOnBalls ?? 0)) : null;
  const seasonPitches = seasonStarts.some((row) => row.numberOfPitches != null)
    ? sum(seasonStarts.map((row) => row.numberOfPitches ?? 0))
    : null;

  const recentStartRows = eligible.combinedStartsBeforeCutoff.slice(-RECENT_STARTS_SAMPLE);
  const recentStarts = recentStartRows.map((row) => ({
    date: row.date,
    inningsPitched: safeInnings(row.inningsPitched),
    strikeouts: row.strikeOuts,
    battersFaced: row.battersFaced,
    pitchCount: row.numberOfPitches,
  }));
  const recentInnings = recentStarts.map((row) => row.inningsPitched).filter((value) => value != null);
  const recentK = sum(recentStarts.map((row) => row.strikeouts ?? 0));
  const recentBF = recentStarts.some((row) => row.battersFaced != null)
    ? sum(recentStarts.map((row) => row.battersFaced ?? 0))
    : null;
  const recentInningsTotal = recentInnings.length ? sum(recentInnings) : null;

  const homeStarts = seasonStarts.filter((row) => row.isHome === true);
  const awayStarts = seasonStarts.filter((row) => row.isHome === false);
  const splitKRate = (rows) => {
    const bf = rows.some((row) => row.battersFaced != null) ? sum(rows.map((row) => row.battersFaced ?? 0)) : 0;
    return ratio(sum(rows.map((row) => row.strikeOuts ?? 0)), bf);
  };

  return {
    seasonStarts: seasonStarts.length,
    seasonStrikeOuts,
    seasonInnings,
    seasonBattersFaced,
    seasonWalks,
    seasonPitches,
    seasonKRate: seasonBattersFaced ? ratio(seasonStrikeOuts, seasonBattersFaced) : null,
    seasonKPer9: seasonInnings ? (seasonStrikeOuts / seasonInnings) * 9 : null,
    recentStarts,
    recentStartCount: recentStarts.length,
    recentKRate: recentBF ? ratio(recentK, recentBF) : null,
    recentKPer9: recentInningsTotal ? (recentK / recentInningsTotal) * 9 : null,
    recentMeanInnings: mean(recentInnings),
    recentMeanBattersFaced: recentBF != null && recentStarts.length ? recentBF / recentStarts.filter((row) => row.battersFaced != null).length : null,
    recentMeanPitches: mean(recentStarts.map((row) => row.pitchCount).filter((value) => value != null)),
    homeKRate: homeStarts.length ? splitKRate(homeStarts) : null,
    awayKRate: awayStarts.length ? splitKRate(awayStarts) : null,
    usedPriorSeason: eligible.usedPriorSeason,
    looksLikeReliever: eligible.looksLikeReliever,
    firstStartOfSeason: seasonStarts.length === 0,
    hasAnyPriorData: eligible.combinedBeforeCutoff.length > 0,
    // shape the workload model expects (see buildWorkloadDataShape)
    _eligible: eligible,
  };
}

/**
 * Build the `workloadData` object shape `computeWorkloadProjection` consumes,
 * mirroring `fetchPitcherWorkloadData`'s output for an as-of target date.
 */
export function buildWorkloadDataShape(pitcherAsOf, { season, cutoffDate }) {
  const eligible = pitcherAsOf._eligible;
  const toAppearance = (row) => ({
    season: row.season ?? season,
    date: row.date,
    isStart: row.gamesStarted === 1,
    gamesStarted: row.gamesStarted ?? 0,
    pitches: row.numberOfPitches,
    battersFaced: row.battersFaced,
    strikeouts: row.strikeOuts ?? 0,
    walks: row.baseOnBalls ?? 0,
    inningsPitched: safeInnings(row.inningsPitched),
  });

  const starts = eligible.combinedStartsBeforeCutoff.slice(-WORKLOAD_START_SAMPLE).map(toAppearance);
  const recentAppearances = eligible.combinedBeforeCutoff.slice(-WORKLOAD_APPEARANCE_SAMPLE).map(toAppearance);
  const currentBeforeCutoff = eligible.currentSeasonBeforeCutoff.map(toAppearance);
  const currentStarts = currentBeforeCutoff.filter((row) => row.isStart);
  const currentRelief = currentBeforeCutoff.filter((row) => !row.isStart);
  const samplesForCompleteness = pitcherAsOf.looksLikeReliever ? recentAppearances : starts;
  const usable = samplesForCompleteness.filter((row) => Number.isFinite(row.pitches) && Number.isFinite(row.battersFaced));
  const completenessScore = Math.min(1, usable.length / Math.max(3, pitcherAsOf.looksLikeReliever ? 5 : WORKLOAD_START_SAMPLE));
  const flags = [];
  if (pitcherAsOf.looksLikeReliever) flags.push("RELIEVER_PROFILE");
  else if (!starts.length) flags.push("NO_STARTS_AVAILABLE");

  return {
    ok: true,
    season,
    targetDate: cutoffDate,
    starts,
    recentAppearances,
    allAppearances: eligible.combinedBeforeCutoff.map(toAppearance),
    allStarterAppearances: eligible.combinedStartsBeforeCutoff.map(toAppearance),
    completeness: {
      score: Number(completenessScore.toFixed(3)),
      grade: completenessScore >= 0.85 ? "A" : completenessScore >= 0.65 ? "B" : completenessScore >= 0.4 ? "C" : "D",
      flags,
      counts: {
        allAppearances: recentAppearances.length,
        starterAppearances: eligible.combinedStartsBeforeCutoff.length,
        currentSeasonAppearances: currentBeforeCutoff.length,
        currentSeasonStarterAppearances: currentStarts.length,
        currentSeasonReliefAppearances: currentRelief.length,
        usableRecentAppearances: usable.length,
        returnedStarts: starts.length,
        returnedRecentAppearances: recentAppearances.length,
      },
    },
    source: { version: "mlb-k-backtest-asof", primary: "cached_stats_api_game_log", usedPreviousSeasonFallback: pitcherAsOf.usedPriorSeason },
  };
}

/** As-of opponent offense context from a team's hitting game log. */
export function buildTeamOffenseAsOf({ teamRows = [], cutoffDate, excludeGamePk = null } = {}) {
  if (!cutoffDate) throw new Error("buildTeamOffenseAsOf requires cutoffDate");
  const before = teamRows.filter((row) => isBeforeCutoff(row.date, cutoffDate) && row.gamePk !== excludeGamePk);
  const windowStart = isoSubtractDays(cutoffDate, RECENT_TEAM_WINDOW_DAYS);
  const recent = before.filter((row) => row.date >= windowStart);

  const aggregate = (rows) => {
    const pa = sum(rows.map((row) => row.plateAppearances ?? 0));
    const k = sum(rows.map((row) => row.strikeOuts ?? 0));
    const pitches = rows.some((row) => row.numberOfPitches != null) ? sum(rows.map((row) => row.numberOfPitches ?? 0)) : null;
    return {
      games: rows.length,
      plateAppearances: pa || null,
      strikeOuts: rows.length ? k : null,
      kRate: ratio(k, pa),
      pitchesPerPA: pitches != null ? ratio(pitches, pa) : null,
    };
  };

  const season = aggregate(before);
  const recent14 = aggregate(recent);
  return {
    gamesBeforeCutoff: before.length,
    seasonKRate: season.kRate,
    seasonPlateAppearances: season.plateAppearances,
    seasonPitchesPerPA: season.pitchesPerPA,
    recent14KRate: recent14.kRate,
    recent14PlateAppearances: recent14.plateAppearances,
    recent14PitchesPerPA: recent14.pitchesPerPA,
  };
}

/** As-of league context aggregated across every team's hitting game log. */
export function buildLeagueAsOf({ teamRowsByTeam = new Map(), cutoffDate } = {}) {
  if (!cutoffDate) throw new Error("buildLeagueAsOf requires cutoffDate");
  let pa = 0;
  let k = 0;
  let pitches = 0;
  let pitchGames = 0;
  for (const rows of teamRowsByTeam.values()) {
    for (const row of rows) {
      if (!isBeforeCutoff(row.date, cutoffDate)) continue;
      pa += row.plateAppearances ?? 0;
      k += row.strikeOuts ?? 0;
      if (row.numberOfPitches != null) {
        pitches += row.numberOfPitches;
        pitchGames += 1;
      }
    }
  }
  return {
    plateAppearances: pa || null,
    kRate: ratio(k, pa) ?? 0.225,
    pitchesPerPA: pitchGames > 0 && pa > 0 ? pitches / pa : 3.9,
    whiffRate: null, // StatsAPI carries no whiff; callers substitute + flag
    contactRate: null,
    outsPerBF: 0.72,
    starterAveragePitches: 86,
    starterAverageBF: 21.5,
  };
}
