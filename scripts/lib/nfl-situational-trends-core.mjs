/**
 * Pure qualification and summary logic for NFL Situational Trends Study v1.
 *
 * This is a descriptive historical research layer. It does not feed, alter, or
 * evaluate any production JKB prediction model.
 */

export const STUDY_VERSION = "nfl-situational-trends-v1";
export const DEFINITION_VERSION = "nfl-situational-trend-definitions-v1";
export const ATS_BREAK_EVEN = 11 / 21; // 52.38095% at -110
export const RECENT_MATERIAL_DIFFERENCE = 0.03;

export const REPORTING_WINDOWS = {
  fullHistory: {
    id: "full-history",
    label: "FULL HISTORY",
    startSeason: 2011,
    endSeason: 2025,
  },
  recentForm: {
    id: "recent-form",
    label: "RECENT FORM",
    startSeason: 2021,
    endSeason: 2025,
  },
};

export const FIXED_ERA_WINDOWS = {
  olderEra: {
    id: "older-era",
    label: "OLDER ERA",
    startSeason: 2011,
    endSeason: 2018,
  },
  newerEra: {
    id: "newer-era",
    label: "NEWER ERA",
    startSeason: 2019,
    endSeason: 2025,
  },
};

export const TREND_DEFINITIONS = [
  {
    id: "classic-sandwich",
    name: "Classic sandwich spot",
    rule: "Current team is favored by at least 6 points against a non-major opponent, and both immediately adjacent same-season opponents are major opponents.",
  },
  {
    id: "look-ahead",
    name: "Look-ahead spot",
    rule: "Current team is favored by at least 6 points against a non-major opponent and its next same-season opponent is a major opponent.",
  },
  {
    id: "letdown",
    name: "Letdown spot",
    rule: "Team won its immediately previous game and that game was divisional, against a prior-season playoff team, an upset as an underdog of 3+ points, or kicked off at/after 8:00 p.m. Eastern.",
  },
  {
    id: "short-rest-disadvantage",
    name: "Short-rest disadvantage",
    rule: "Team has at most 6 calendar days since its previous game and at least 1 fewer rest day than its opponent; season openers are excluded.",
  },
  {
    id: "rest-advantage",
    name: "Rest advantage",
    rule: "Team has at least 3 more calendar rest days than its opponent; season openers are excluded.",
  },
  {
    id: "post-bye",
    name: "Post-bye teams",
    rule: "First game after exactly one missing scheduled week, with 10-17 calendar days since the prior game.",
  },
  {
    id: "pre-bye",
    name: "Pre-bye teams",
    rule: "Final game before exactly one missing scheduled week, with 10-17 calendar days until the next game.",
  },
  {
    id: "consecutive-road",
    name: "Consecutive road games",
    rule: "Team is playing its second or later consecutive true road game; neutral-site games break the sequence.",
  },
  {
    id: "west-to-east-early",
    name: "Cross-country / time-zone travel",
    rule: "Pacific-origin team plays at a non-neutral Eastern-time home site at exactly 1:00 p.m. Eastern.",
  },
  {
    id: "divisional-underdog",
    name: "Divisional underdogs",
    rule: "Divisional matchup in which the team-relative closing spread is greater than 0; pick'em games are excluded.",
  },
  {
    id: "after-blowout-win",
    name: "Teams after blowout wins",
    rule: "Immediately previous game was a straight-up win by at least 14 points; 14+, 17+, and 20+ thresholds are reported together.",
  },
  {
    id: "after-blowout-loss",
    name: "Teams after blowout losses",
    rule: "Immediately previous game was a straight-up loss by at least 14 points; 14+, 17+, and 20+ thresholds are reported together.",
  },
];

const EASTERN_TEAMS = new Set([
  "atl", "bal", "buf", "car", "cin", "cle", "det", "ind", "jax", "mia",
  "ne", "nyg", "nyj", "phi", "pit", "tb", "wsh",
]);
const PACIFIC_TEAMS = new Set(["lac", "lar", "lv", "sea", "sf"]);

export function teamTimeZone(team, season) {
  if (team === "lar" && season <= 2015) return "CT"; // St. Louis
  if (PACIFIC_TEAMS.has(team)) return "PT";
  if (EASTERN_TEAMS.has(team)) return "ET";
  if (team === "ari" || team === "den") return "MT";
  return "CT";
}

export function gradeTeamAts(pointMargin, teamSpread) {
  if (!Number.isFinite(pointMargin) || !Number.isFinite(teamSpread)) return null;
  const coverMargin = pointMargin + teamSpread;
  return coverMargin > 0 ? "W" : coverMargin < 0 ? "L" : "P";
}

export function teamRelativeSpread(spreadLine, isHome) {
  if (!Number.isFinite(spreadLine)) return null;
  return isHome ? -spreadLine : spreadLine;
}

export function atsCoverMargin(pointMargin, teamSpread) {
  if (!Number.isFinite(pointMargin) || !Number.isFinite(teamSpread)) return null;
  return pointMargin + teamSpread;
}

function easternDateParts(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}

/** Calendar-day difference in the NFL schedule's Eastern-time convention. */
export function calculateRestDays(previousKickoffUtc, currentKickoffUtc) {
  const previous = easternDateParts(previousKickoffUtc);
  const current = easternDateParts(currentKickoffUtc);
  if (!previous || !current) return null;
  const previousDay = Date.UTC(previous.year, previous.month - 1, previous.day);
  const currentDay = Date.UTC(current.year, current.month - 1, current.day);
  const days = (currentDay - previousDay) / 86_400_000;
  return Number.isInteger(days) && days >= 0 ? days : null;
}

export function isByeGap(previousGame, currentGame) {
  if (!previousGame || !currentGame || previousGame.season !== currentGame.season) return false;
  const restDays = calculateRestDays(previousGame.kickoffUtc, currentGame.kickoffUtc);
  return currentGame.week - previousGame.week === 2 && restDays >= 10 && restDays <= 17;
}

export function roadSequenceAt(teamGames, index) {
  const current = teamGames[index];
  if (!current || current.venue !== "away") return 0;
  let count = 1;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (teamGames[cursor].venue !== "away") break;
    count += 1;
  }
  return count;
}

export function isDivisionalMatchup(teamDivision, opponentDivision) {
  return Boolean(teamDivision && opponentDivision && teamDivision === opponentDivision);
}

export function blowoutThresholds(previousMargin) {
  if (!Number.isFinite(previousMargin)) return { win14: false, win17: false, win20: false, loss14: false, loss17: false, loss20: false };
  return {
    win14: previousMargin >= 14,
    win17: previousMargin >= 17,
    win20: previousMargin >= 20,
    loss14: previousMargin <= -14,
    loss17: previousMargin <= -17,
    loss20: previousMargin <= -20,
  };
}

export function isPrimeTimeKickoff(kickoffUtc) {
  if (!kickoffUtc) return false;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(kickoffUtc));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(values.hour) >= 20;
}

export function isEarlyEasternKickoff(kickoffUtc) {
  if (!kickoffUtc) return false;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(kickoffUtc));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(values.hour) === 13 && Number(values.minute) === 0;
}

export function isWestToEastEarly({ team, opponent, season, venue, kickoffUtc }) {
  return venue === "away" && teamTimeZone(team, season) === "PT" &&
    teamTimeZone(opponent, season) === "ET" && isEarlyEasternKickoff(kickoffUtc);
}

/** A v1 major opponent is divisional or reached the prior season's playoffs. */
export function isMajorOpponent({ divisional, opponent, priorSeasonPlayoffTeams }) {
  return Boolean(divisional || priorSeasonPlayoffTeams?.has(opponent));
}

export function isLesserFavorite({ majorOpponent, teamSpread }) {
  return !majorOpponent && Number.isFinite(teamSpread) && teamSpread <= -6;
}

export function qualifiesLookAhead({ lesserFavorite, nextMajorOpponent }) {
  return Boolean(lesserFavorite && nextMajorOpponent);
}

export function qualifiesSandwich({ lesserFavorite, previousMajorOpponent, nextMajorOpponent }) {
  return Boolean(lesserFavorite && previousMajorOpponent && nextMajorOpponent);
}

export function qualifiesLetdown({ previousPointMargin, previousTeamSpread, previousMajorOpponent, previousPrimeTime }) {
  return Boolean(previousPointMargin > 0 &&
    (previousMajorOpponent || previousTeamSpread >= 3 || previousPrimeTime));
}

function round(value, digits = 4) {
  if (value == null || !Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function mean(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

/** Wilson score interval for a binomial proportion. */
export function wilsonInterval(wins, losses, z = 1.959963984540054) {
  const n = wins + losses;
  if (n === 0) return { low: null, high: null };
  const p = wins / n;
  const denominator = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denominator;
  const half = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n) / denominator;
  return { low: round(center - half), high: round(center + half) };
}

export function summarizeRows(rows) {
  const atsWins = rows.filter((row) => row.atsResult === "W").length;
  const atsLosses = rows.filter((row) => row.atsResult === "L").length;
  const atsPushes = rows.filter((row) => row.atsResult === "P").length;
  const atsUngraded = rows.length - atsWins - atsLosses - atsPushes;
  const atsDecisions = atsWins + atsLosses;
  const suWins = rows.filter((row) => row.suResult === "W").length;
  const suLosses = rows.filter((row) => row.suResult === "L").length;
  const suTies = rows.filter((row) => row.suResult === "T").length;
  const suDecisions = suWins + suLosses;
  const seasons = [...new Set(rows.map((row) => row.season))].sort((a, b) => a - b);
  return {
    qualifyingTeamGames: rows.length,
    atsWins,
    atsLosses,
    atsPushes,
    atsUngraded,
    atsWinPct: atsDecisions ? round(atsWins / atsDecisions) : null,
    atsWilson95: wilsonInterval(atsWins, atsLosses),
    atsBreakEvenPct: round(ATS_BREAK_EVEN),
    atsRoiAtMinus110: atsDecisions ? round((atsWins * 100 - atsLosses * 110) / (atsDecisions * 110)) : null,
    suWins,
    suLosses,
    suTies,
    suWinPct: suDecisions ? round(suWins / suDecisions) : null,
    averageTeamSpread: round(mean(rows.map((row) => row.teamSpread))),
    averageAtsCoverMargin: round(mean(rows.map((row) => row.atsCoverMargin))),
    seasons,
    seasonCount: seasons.length,
  };
}

export function summarizeBySeason(rows) {
  return [...new Set(rows.map((row) => row.season))]
    .sort((a, b) => a - b)
    .map((season) => ({ season, ...summarizeRows(rows.filter((row) => row.season === season)) }));
}

function rowsInWindow(rows, window) {
  return rows.filter((row) => row.season >= window.startSeason && row.season <= window.endSeason);
}

function summarizeWindow(rows, window) {
  return {
    ...window,
    seasons: Array.from({ length: window.endSeason - window.startSeason + 1 }, (_, index) => window.startSeason + index),
    metrics: summarizeRows(rowsInWindow(rows, window)),
  };
}

export function buildReportingWindows(rows) {
  return Object.fromEntries(Object.entries(REPORTING_WINDOWS).map(([key, window]) => [key, summarizeWindow(rows, window)]));
}

function atsDirection(atsWinPct) {
  if (!Number.isFinite(atsWinPct) || atsWinPct === 0.5) return "NEUTRAL";
  return atsWinPct > 0.5 ? "ABOVE_50" : "BELOW_50";
}

export function summarizeStability(rows) {
  const olderEra = summarizeWindow(rows, FIXED_ERA_WINDOWS.olderEra);
  const newerEra = summarizeWindow(rows, FIXED_ERA_WINDOWS.newerEra);
  const fullHistory = summarizeWindow(rows, REPORTING_WINDOWS.fullHistory);
  const recentForm = summarizeWindow(rows, REPORTING_WINDOWS.recentForm);
  const olderPct = olderEra.metrics.atsWinPct;
  const newerPct = newerEra.metrics.atsWinPct;
  const fullPct = fullHistory.metrics.atsWinPct;
  const recentPct = recentForm.metrics.atsWinPct;
  const recentDelta = Number.isFinite(fullPct) && Number.isFinite(recentPct) ? round(recentPct - fullPct) : null;
  const materiallyDiffers = Number.isFinite(recentDelta) && Math.abs(recentDelta) >= RECENT_MATERIAL_DIFFERENCE;
  return {
    splitPolicy: "Fixed midpoint split of the predefined 2011-2025 study window; never optimized from results.",
    materialDifferenceThreshold: RECENT_MATERIAL_DIFFERENCE,
    olderEra,
    newerEra,
    comparison: {
      bothErasAboveBreakEven: Number.isFinite(olderPct) && Number.isFinite(newerPct) && olderPct > ATS_BREAK_EVEN && newerPct > ATS_BREAK_EVEN,
      bothErasBelowBreakEven: Number.isFinite(olderPct) && Number.isFinite(newerPct) && olderPct < ATS_BREAK_EVEN && newerPct < ATS_BREAK_EVEN,
      directionReverses: atsDirection(olderPct) !== "NEUTRAL" && atsDirection(newerPct) !== "NEUTRAL" && atsDirection(olderPct) !== atsDirection(newerPct),
      recentVsFullHistoryAtsPctDelta: recentDelta,
      recentMateriallyDiffersFromFullHistory: materiallyDiffers,
      recentChange: !materiallyDiffers ? "STABLE" : recentDelta > 0 ? "STRENGTHENED" : "WEAKENED",
    },
  };
}

export function classifyRecentEvidence(summary) {
  const decisions = summary.atsWins + summary.atsLosses;
  if (summary.seasonCount < 3 || decisions < 50) return "INSUFFICIENT DATA";
  if (summary.atsWilson95.low > ATS_BREAK_EVEN) return "STRONG POSITIVE";
  if (summary.atsWilson95.high < 1 - ATS_BREAK_EVEN) return "STRONG NEGATIVE";
  if (summary.atsWinPct > ATS_BREAK_EVEN) return "SUGGESTIVE POSITIVE";
  if (summary.atsWinPct < 1 - ATS_BREAK_EVEN) return "SUGGESTIVE NEGATIVE";
  if (summary.atsWilson95.low > 0.5) return "DIRECTIONAL POSITIVE";
  if (summary.atsWilson95.high < 0.5) return "DIRECTIONAL NEGATIVE";
  return "NEUTRAL/MIXED";
}

export function classifyEvidence(fullSummary, recentSummary, stability) {
  const decisions = fullSummary.atsWins + fullSummary.atsLosses;
  if (fullSummary.seasonCount < 5 || decisions < 100) {
    return {
      classification: "INSUFFICIENT DATA",
      confidence: "Low",
      explanation: `Only ${decisions} ATS decisions across ${fullSummary.seasonCount} observed season(s) in the fixed 2011-2025 window; at least 100 decisions and five seasons are required before interpreting historical evidence.`,
    };
  }
  const interval = fullSummary.atsWilson95;
  const clearsPositiveBreakEven = interval.low > ATS_BREAK_EVEN;
  const clearsNegativeBreakEven = interval.high < 1 - ATS_BREAK_EVEN;
  const clearsBreakEven = clearsPositiveBreakEven || clearsNegativeBreakEven;
  const fullDirection = atsDirection(fullSummary.atsWinPct);
  const olderDirection = atsDirection(stability.olderEra.metrics.atsWinPct);
  const newerDirection = atsDirection(stability.newerEra.metrics.atsWinPct);
  const erasConsistent = fullDirection !== "NEUTRAL" && olderDirection === fullDirection && newerDirection === fullDirection;
  const recentDirection = atsDirection(recentSummary.atsWinPct);
  const recentContradicts = stability.comparison.recentMateriallyDiffersFromFullHistory && recentDirection !== "NEUTRAL" && recentDirection !== fullDirection;
  if (fullSummary.seasonCount >= 8 && decisions >= 200 && clearsBreakEven && erasConsistent && !recentContradicts) {
    return {
      classification: "HISTORICALLY MEANINGFUL",
      confidence: fullSummary.seasonCount >= 10 && decisions >= 500 ? "High" : "Moderate",
      explanation: "The full-history 95% interval clears the relevant -110 profitability boundary, both fixed eras point in the same ATS direction, and recent form does not materially reverse that direction. This is descriptive historical evidence, not proof of predictive value.",
    };
  }
  const fullPointBeyondBreakEven = fullSummary.atsWinPct > ATS_BREAK_EVEN || fullSummary.atsWinPct < 1 - ATS_BREAK_EVEN;
  const intervalExcludesCoinFlip = interval.low > 0.5 || interval.high < 0.5;
  const meaningfulCoverMargin = Number.isFinite(fullSummary.averageAtsCoverMargin) && Math.abs(fullSummary.averageAtsCoverMargin) >= 0.75;
  const recentStrength = classifyRecentEvidence(recentSummary);
  const recentHasSignal = !["INSUFFICIENT DATA", "NEUTRAL/MIXED"].includes(recentStrength);
  const contextDependent = fullPointBeyondBreakEven || intervalExcludesCoinFlip || meaningfulCoverMargin ||
    stability.comparison.directionReverses || stability.comparison.recentMateriallyDiffersFromFullHistory || recentHasSignal;
  if (contextDependent) {
    return {
      classification: "CONTEXT-DEPENDENT",
      confidence: decisions >= 250 && fullSummary.seasonCount >= 8 ? "Moderate" : "Low",
      explanation: "The full-history magnitude, uncertainty interval, era pattern, or fixed recent window is non-neutral, but the evidence is not stable and strong enough for a broad historical ATS conclusion.",
    };
  }
  return {
    classification: "LITTLE/NO EVIDENCE",
    confidence: fullSummary.seasonCount >= 10 && decisions >= 500 && !stability.comparison.recentMateriallyDiffersFromFullHistory ? "High" : "Moderate",
    explanation: "The fixed full-history and recent views remain broadly neutral: the sample does not reliably separate from 50% ATS or materially clear the 52.38% -110 break-even rate. The angle remains part of the reference library.",
  };
}

export function evaluateTeamRows(teamRows) {
  return TREND_DEFINITIONS.map((definition) => {
    const rows = teamRows.filter((row) => row.trendIds.includes(definition.id));
    const reportingWindows = buildReportingWindows(rows);
    const stability = summarizeStability(rows);
    const metrics = reportingWindows.fullHistory.metrics;
    const evidence = classifyEvidence(metrics, reportingWindows.recentForm.metrics, stability);
    return {
      ...definition,
      definitionVersion: DEFINITION_VERSION,
      commonAngleStatus: "COMMON/CLASSIC ANGLE",
      qualifyingRowIds: rows.map((row) => row.rowId),
      metrics,
      reportingWindows,
      seasonSplits: summarizeBySeason(rows),
      eraSplits: {
        available: stability.olderEra.metrics.seasonCount > 0 && stability.newerEra.metrics.seasonCount > 0,
        reason: null,
        splits: [stability.olderEra, stability.newerEra],
      },
      stability,
      historicalEvidenceStrength: evidence.classification,
      recentEvidenceStrength: classifyRecentEvidence(reportingWindows.recentForm.metrics),
      ...evidence,
    };
  });
}
