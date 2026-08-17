/**
 * Standalone MLB Pitcher K +EV model (V1).
 *
 * This module is independent of K Projection V2, the K workload shadow
 * model, and the HR +EV model. It never mutates or reads back into those
 * artifacts. All innings math is outs-based (see baseballInnings.ts) --
 * baseball notation (e.g. "6.1") is never treated as a decimal.
 *
 * Source rows are expected to be pre-aggregated by the generator
 * (scripts/generate-mlb-k-plus-ev.mjs) from real per-start game logs,
 * real home/away splits, and the real batter-hand-splits-cache matchup
 * hierarchy. This module performs no data fetching and invents nothing --
 * any missing input is treated with the documented neutral fallback.
 */

import {
  americanOddsToDecimal,
  americanOddsToImpliedProbability,
  clampNumber,
  formatAmericanOdds,
  formatEvPercent,
  labelFromEv,
  parseAmericanOdds,
  probabilityToAmericanOdds,
  type HrPlusEvValueLabel,
} from "./hrPlusEvModel";
import { outsToDecimalInnings } from "./baseballInnings";

export const K_PLUS_EV_MODEL_VERSION = "mlb-k-plus-ev-v1";

export type KPlusEvValueLabel = HrPlusEvValueLabel;

export const ELIGIBILITY_MIN_DECIMAL_IP = 60.0;
export const ELIGIBILITY_MIN_STARTS = 10;

export const EXPECTED_IP_MIN = 3.0;
export const EXPECTED_IP_MAX = 7.0;

export const TREND_FACTOR_MIN = 0.9;
export const TREND_FACTOR_MAX = 1.1;
export const TREND_BASE = 0.7;
export const TREND_L8_WEIGHT = 0.2;
export const TREND_L4_WEIGHT = 0.1;

export const EXPECTED_PITCH_SEASON_WEIGHT = 0.7;
export const EXPECTED_PITCH_L4_WEIGHT = 0.3;

export const PPI_SEASON_WEIGHT = 0.7;
export const PPI_L8_WEIGHT = 0.2;
export const PPI_L4_WEIGHT = 0.1;

export const LOCATION_SAMPLE_MIN_STARTS = 8;
export const LOCATION_SAMPLE_MIN_IP = 40;

export const MATCHUP_OPPONENT_WEIGHT = 0.7;
export const MATCHUP_LOCATION_WEIGHT = 0.3;
export const MATCHUP_MULTIPLIER_MIN = 0.92;
export const MATCHUP_MULTIPLIER_MAX = 1.08;

export type OpponentKRatioSource = "LINEUP" | "TEAM_FALLBACK" | "NEUTRAL";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function divide(numerator: number | null | undefined, denominator: number | null | undefined): number | null {
  if (!isFiniteNumber(numerator) || !isFiniteNumber(denominator) || denominator <= 0) return null;
  return numerator / denominator;
}

/** A window of real per-start aggregate counts (season, L8, or L4). Outs, not decimal innings. */
export type KPlusEvCountWindow = {
  strikeouts: number | null;
  outs: number | null;
  pitches: number | null;
  starts: number | null;
};

export type KPlusEvHomeAwaySplit = {
  strikeouts: number | null;
  outs: number | null;
  starts: number | null;
};

export type KPlusEvSource = {
  pitcher: string;
  team: string;
  opponent: string;
  pitcherHand: "L" | "R" | null;
  isHome: boolean | null;
  starterConfirmed: boolean;

  season: KPlusEvCountWindow;
  last8: KPlusEvCountWindow | null;
  last4: KPlusEvCountWindow | null;

  home: KPlusEvHomeAwaySplit | null;
  away: KPlusEvHomeAwaySplit | null;

  opponentKRatio: number | null;
  opponentKRatioSource: OpponentKRatioSource;
  opponentKRateVsHand: number | null;
  leagueKRateVsHand: number | null;

  kLine: number | null;
  kOddsOverRaw: string | null;
  kOddsUnderRaw: string | null;
  kOddsBook: string | null;
};

export type KPlusEvSeasonBaseline = {
  seasonStrikeouts: number | null;
  seasonDecimalIP: number | null;
  seasonStarts: number | null;
  seasonKPerIP: number | null;
  seasonKPerStart: number | null;
  seasonPitches: number | null;
  seasonPitchesPerStart: number | null;
  seasonPitchesPerInning: number | null;
};

export type KPlusEvTrend = {
  l8KPerIP: number | null;
  l4KPerIP: number | null;
  r8: number;
  r4: number;
  trendFactor: number;
};

export type KPlusEvWorkload = {
  expectedPitchCount: number | null;
  expectedPitchCountFellBackToSeason: boolean;
  projectedPitchesPerInning: number | null;
  l8PitchesPerInningFellBackToSeason: boolean;
  l4PitchesPerInningFellBackToSeason: boolean;
  expectedIPRaw: number | null;
  expectedIP: number | null;
};

export type KPlusEvLocation = {
  relevantSplitKs: number | null;
  relevantSplitDecimalIP: number | null;
  relevantSplitStarts: number | null;
  relevantSplitKPerIP: number | null;
  samplePassed: boolean;
  locationRatio: number;
};

export type KPlusEvMatchup = {
  opponentKRatio: number;
  opponentKRatioSource: OpponentKRatioSource;
  locationRatio: number;
  matchupMultiplier: number;
};

export type KPlusEvProjection = {
  seasonKPerIP: number;
  trendFactor: number;
  trendAdjustedKPerIP: number;
  matchupMultiplier: number;
  jkbKPerIP: number;
  expectedIP: number;
  currentProjectedK: number;
  jkbProjectedK: number;
};

export type KPlusEvMarket = {
  isWholeNumberLine: boolean;
  requiredKsOver: number | null;
  currentOverProbability: number | null;
  jkbOverProbability: number | null;
  pushProbability: number | null;
  underProbability: number | null;
  currentRateFairOdds: number | null;
  jkbFairOdds: number | null;
  bookOverOdds: number | null;
  bookUnderOdds: number | null;
  bookImpliedProbability: number | null;
  probabilityEdge: number | null;
  ev: number | null;
};

export type KPlusEvValuation = {
  modelVersion: string;
  available: boolean;
  unavailableReasons: string[];
  pitcher: string;
  team: string;
  opponent: string;
  pitcherHand: "L" | "R" | null;
  isHome: boolean | null;
  eligible: boolean;
  seasonBaseline: KPlusEvSeasonBaseline;
  trend: KPlusEvTrend;
  workload: KPlusEvWorkload;
  location: KPlusEvLocation;
  matchup: KPlusEvMatchup;
  projection: KPlusEvProjection | null;
  market: KPlusEvMarket;
  label: KPlusEvValueLabel;
};

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

export function isEligibleForKPlusEv(seasonDecimalIP: number | null, seasonStarts: number | null): boolean {
  if (!isFiniteNumber(seasonDecimalIP) || !isFiniteNumber(seasonStarts)) return false;
  return seasonDecimalIP > ELIGIBILITY_MIN_DECIMAL_IP && seasonStarts >= ELIGIBILITY_MIN_STARTS;
}

// ---------------------------------------------------------------------------
// Season baseline
// ---------------------------------------------------------------------------

export function computeSeasonBaseline(season: KPlusEvCountWindow): KPlusEvSeasonBaseline {
  const seasonDecimalIP = outsToDecimalInnings(season.outs ?? null);
  const seasonKPerIP = divide(season.strikeouts, seasonDecimalIP);
  const seasonKPerStart = divide(season.strikeouts, season.starts);
  const seasonPitchesPerStart = divide(season.pitches, season.starts);
  const seasonPitchesPerInning = divide(season.pitches, seasonDecimalIP);
  return {
    seasonStrikeouts: season.strikeouts ?? null,
    seasonDecimalIP,
    seasonStarts: season.starts ?? null,
    seasonKPerIP,
    seasonKPerStart,
    seasonPitches: season.pitches ?? null,
    seasonPitchesPerStart,
    seasonPitchesPerInning,
  };
}

// ---------------------------------------------------------------------------
// K Trend
// ---------------------------------------------------------------------------

function windowKPerIP(window: KPlusEvCountWindow | null): number | null {
  if (!window) return null;
  const decimalIP = outsToDecimalInnings(window.outs ?? null);
  return divide(window.strikeouts, decimalIP);
}

export function computeTrend(
  season: KPlusEvCountWindow,
  last8: KPlusEvCountWindow | null,
  last4: KPlusEvCountWindow | null,
): KPlusEvTrend {
  const seasonKPerIP = computeSeasonBaseline(season).seasonKPerIP;
  const l8KPerIP = windowKPerIP(last8);
  const l4KPerIP = windowKPerIP(last4);

  const r8 = seasonKPerIP != null && l8KPerIP != null && seasonKPerIP > 0 ? l8KPerIP / seasonKPerIP : 1;
  const r4 = seasonKPerIP != null && l4KPerIP != null && seasonKPerIP > 0 ? l4KPerIP / seasonKPerIP : 1;

  const trendFactor = clampNumber(TREND_BASE + TREND_L8_WEIGHT * r8 + TREND_L4_WEIGHT * r4, TREND_FACTOR_MIN, TREND_FACTOR_MAX);

  return { l8KPerIP, l4KPerIP, r8, r4, trendFactor };
}

// ---------------------------------------------------------------------------
// Workload / expected IP
// ---------------------------------------------------------------------------

export function computeWorkload(
  season: KPlusEvCountWindow,
  last8: KPlusEvCountWindow | null,
  last4: KPlusEvCountWindow | null,
): KPlusEvWorkload {
  const baseline = computeSeasonBaseline(season);
  const seasonPitchesPerStart = baseline.seasonPitchesPerStart;
  const seasonPitchesPerInning = baseline.seasonPitchesPerInning;

  const l4PitchesPerStart = divide(last4?.pitches ?? null, last4?.starts ?? null);
  const expectedPitchCountFellBackToSeason = l4PitchesPerStart == null;
  const l4PitchesPerStartResolved = l4PitchesPerStart ?? seasonPitchesPerStart;
  const expectedPitchCount = seasonPitchesPerStart != null && l4PitchesPerStartResolved != null
    ? EXPECTED_PITCH_SEASON_WEIGHT * seasonPitchesPerStart + EXPECTED_PITCH_L4_WEIGHT * l4PitchesPerStartResolved
    : null;

  const l8Outs = last8?.outs ?? null;
  const l8DecimalIP = outsToDecimalInnings(l8Outs);
  const l8PitchesPerInning = divide(last8?.pitches ?? null, l8DecimalIP);
  const l8PitchesPerInningFellBackToSeason = l8PitchesPerInning == null;
  const l8PitchesPerInningResolved = l8PitchesPerInning ?? seasonPitchesPerInning;

  const l4Outs = last4?.outs ?? null;
  const l4DecimalIP = outsToDecimalInnings(l4Outs);
  const l4PitchesPerInning = divide(last4?.pitches ?? null, l4DecimalIP);
  const l4PitchesPerInningFellBackToSeason = l4PitchesPerInning == null;
  const l4PitchesPerInningResolved = l4PitchesPerInning ?? seasonPitchesPerInning;

  const projectedPitchesPerInning = seasonPitchesPerInning != null
    && l8PitchesPerInningResolved != null
    && l4PitchesPerInningResolved != null
    ? PPI_SEASON_WEIGHT * seasonPitchesPerInning + PPI_L8_WEIGHT * l8PitchesPerInningResolved + PPI_L4_WEIGHT * l4PitchesPerInningResolved
    : null;

  const expectedIPRaw = divide(expectedPitchCount, projectedPitchesPerInning);
  const expectedIP = expectedIPRaw == null ? null : clampNumber(expectedIPRaw, EXPECTED_IP_MIN, EXPECTED_IP_MAX);

  return {
    expectedPitchCount,
    expectedPitchCountFellBackToSeason,
    projectedPitchesPerInning,
    l8PitchesPerInningFellBackToSeason,
    l4PitchesPerInningFellBackToSeason,
    expectedIPRaw,
    expectedIP,
  };
}

// ---------------------------------------------------------------------------
// Home / away location factor
// ---------------------------------------------------------------------------

export function computeLocation(
  seasonKPerIP: number | null,
  isHome: boolean | null,
  home: KPlusEvHomeAwaySplit | null,
  away: KPlusEvHomeAwaySplit | null,
): KPlusEvLocation {
  const relevantSplit = isHome === true ? home : isHome === false ? away : null;
  const relevantSplitKs = relevantSplit?.strikeouts ?? null;
  const relevantSplitDecimalIP = outsToDecimalInnings(relevantSplit?.outs ?? null);
  const relevantSplitStarts = relevantSplit?.starts ?? null;
  const relevantSplitKPerIP = divide(relevantSplitKs, relevantSplitDecimalIP);

  const samplePassed = isFiniteNumber(relevantSplitStarts) && isFiniteNumber(relevantSplitDecimalIP)
    ? relevantSplitStarts >= LOCATION_SAMPLE_MIN_STARTS || relevantSplitDecimalIP >= LOCATION_SAMPLE_MIN_IP
    : false;

  const locationRatio = samplePassed && relevantSplitKPerIP != null && seasonKPerIP != null && seasonKPerIP > 0
    ? relevantSplitKPerIP / seasonKPerIP
    : 1;

  return { relevantSplitKs, relevantSplitDecimalIP, relevantSplitStarts, relevantSplitKPerIP, samplePassed, locationRatio };
}

// ---------------------------------------------------------------------------
// Matchup multiplier
// ---------------------------------------------------------------------------

export function computeMatchupMultiplier(opponentKRatio: number, locationRatio: number): number {
  return clampNumber(
    1 + MATCHUP_OPPONENT_WEIGHT * (opponentKRatio - 1) + MATCHUP_LOCATION_WEIGHT * (locationRatio - 1),
    MATCHUP_MULTIPLIER_MIN,
    MATCHUP_MULTIPLIER_MAX,
  );
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

export function computeProjection(
  seasonKPerIP: number,
  trendFactor: number,
  matchupMultiplier: number,
  expectedIP: number,
): KPlusEvProjection {
  const trendAdjustedKPerIP = seasonKPerIP * trendFactor;
  const jkbKPerIP = trendAdjustedKPerIP * matchupMultiplier;
  return {
    seasonKPerIP,
    trendFactor,
    trendAdjustedKPerIP,
    matchupMultiplier,
    jkbKPerIP,
    expectedIP,
    currentProjectedK: seasonKPerIP * expectedIP,
    jkbProjectedK: jkbKPerIP * expectedIP,
  };
}

// ---------------------------------------------------------------------------
// Poisson distribution (numerically stable via log-space term recursion)
// ---------------------------------------------------------------------------

export function poissonPmf(k: number, lambda: number): number {
  if (!isFiniteNumber(lambda) || lambda < 0 || !Number.isInteger(k) || k < 0) return 0;
  if (lambda === 0) return k === 0 ? 1 : 0;
  const logPmf = -lambda + k * Math.log(lambda) - logFactorial(k);
  return Math.exp(logPmf);
}

function logFactorial(n: number): number {
  let sum = 0;
  for (let i = 2; i <= n; i += 1) sum += Math.log(i);
  return sum;
}

/** P(X <= k) for X ~ Poisson(lambda). */
export function poissonCdf(k: number, lambda: number): number {
  if (!isFiniteNumber(lambda) || lambda < 0) return 0;
  if (k < 0) return 0;
  let cumulative = 0;
  for (let i = 0; i <= Math.floor(k); i += 1) cumulative += poissonPmf(i, lambda);
  return clampNumber(cumulative, 0, 1);
}

/** P(X >= k) for X ~ Poisson(lambda). */
export function poissonTail(k: number, lambda: number): number {
  if (k <= 0) return 1;
  return clampNumber(1 - poissonCdf(k - 1, lambda), 0, 1);
}

export function requiredKsForHalfLine(line: number): number {
  return Math.floor(line) + 1;
}

// ---------------------------------------------------------------------------
// Fair odds / EV
// ---------------------------------------------------------------------------

export function fairOddsFromProbability(probability: number | null): number | null {
  return probabilityToAmericanOdds(probability);
}

export function computeHalfLineEv(overProbability: number | null, bookOverOddsAmerican: number | null): number | null {
  if (overProbability == null || bookOverOddsAmerican == null) return null;
  return overProbability * americanOddsToDecimal(bookOverOddsAmerican) - 1;
}

export type WholeLineEv = {
  pushProbability: number;
  overProbability: number;
  underProbability: number;
  ev: number;
};

export function computeWholeLineEv(line: number, lambda: number, bookOverOddsAmerican: number): WholeLineEv {
  const pushProbability = poissonPmf(line, lambda);
  const overProbability = poissonTail(line + 1, lambda);
  const underProbability = poissonCdf(line - 1, lambda);
  const ev = overProbability * (americanOddsToDecimal(bookOverOddsAmerican) - 1) - underProbability;
  return { pushProbability, overProbability, underProbability, ev };
}

// ---------------------------------------------------------------------------
// Full evaluation
// ---------------------------------------------------------------------------

export function evaluateKPlusEv(source: KPlusEvSource): KPlusEvValuation {
  const seasonBaseline = computeSeasonBaseline(source.season);
  const eligible = isEligibleForKPlusEv(seasonBaseline.seasonDecimalIP, seasonBaseline.seasonStarts);

  const trend = computeTrend(source.season, source.last8, source.last4);
  const workload = computeWorkload(source.season, source.last8, source.last4);
  const location = computeLocation(seasonBaseline.seasonKPerIP, source.isHome, source.home, source.away);

  const opponentKRatio = source.opponentKRatio ?? 1;
  const matchupMultiplier = computeMatchupMultiplier(opponentKRatio, location.locationRatio);
  const matchup: KPlusEvMatchup = {
    opponentKRatio,
    opponentKRatioSource: source.opponentKRatioSource,
    locationRatio: location.locationRatio,
    matchupMultiplier,
  };

  const unavailableReasons: string[] = [];
  if (!eligible) unavailableReasons.push("Pitcher does not meet V1 eligibility (SeasonDecimalIP > 60.0 and SeasonStarts >= 10).");
  if (seasonBaseline.seasonKPerIP == null) unavailableReasons.push("Season K/IP is unavailable.");
  if (workload.expectedIP == null) unavailableReasons.push("Expected IP could not be computed (missing pitch-count workload inputs).");
  if (source.kLine == null) unavailableReasons.push("No sportsbook K line for this pitcher today.");

  const bookOverOdds = parseAmericanOdds(source.kOddsOverRaw);
  const bookUnderOdds = parseAmericanOdds(source.kOddsUnderRaw);
  if (bookOverOdds == null) unavailableReasons.push("Sportsbook Over odds are missing or unparseable.");

  const projection = seasonBaseline.seasonKPerIP != null && workload.expectedIP != null
    ? computeProjection(seasonBaseline.seasonKPerIP, trend.trendFactor, matchupMultiplier, workload.expectedIP)
    : null;

  const isWholeNumberLine = source.kLine != null && Number.isInteger(source.kLine);
  let market: KPlusEvMarket = {
    isWholeNumberLine,
    requiredKsOver: null,
    currentOverProbability: null,
    jkbOverProbability: null,
    pushProbability: null,
    underProbability: null,
    currentRateFairOdds: null,
    jkbFairOdds: null,
    bookOverOdds,
    bookUnderOdds,
    bookImpliedProbability: americanOddsToImpliedProbability(bookOverOdds),
    probabilityEdge: null,
    ev: null,
  };

  const available = eligible && projection != null && source.kLine != null && bookOverOdds != null;

  if (available && projection && source.kLine != null && bookOverOdds != null) {
    if (isWholeNumberLine) {
      const currentWhole = computeWholeLineEv(source.kLine, projection.currentProjectedK, bookOverOdds);
      const jkbWhole = computeWholeLineEv(source.kLine, projection.jkbProjectedK, bookOverOdds);
      market = {
        ...market,
        requiredKsOver: source.kLine + 1,
        currentOverProbability: currentWhole.overProbability,
        jkbOverProbability: jkbWhole.overProbability,
        pushProbability: jkbWhole.pushProbability,
        underProbability: jkbWhole.underProbability,
        currentRateFairOdds: fairOddsFromProbability(currentWhole.overProbability),
        jkbFairOdds: fairOddsFromProbability(jkbWhole.overProbability),
        probabilityEdge: market.bookImpliedProbability == null ? null : jkbWhole.overProbability - market.bookImpliedProbability,
        ev: jkbWhole.ev,
      };
    } else {
      const requiredKs = requiredKsForHalfLine(source.kLine);
      const currentOverProbability = poissonTail(requiredKs, projection.currentProjectedK);
      const jkbOverProbability = poissonTail(requiredKs, projection.jkbProjectedK);
      market = {
        ...market,
        requiredKsOver: requiredKs,
        currentOverProbability,
        jkbOverProbability,
        currentRateFairOdds: fairOddsFromProbability(currentOverProbability),
        jkbFairOdds: fairOddsFromProbability(jkbOverProbability),
        probabilityEdge: market.bookImpliedProbability == null ? null : jkbOverProbability - market.bookImpliedProbability,
        ev: computeHalfLineEv(jkbOverProbability, bookOverOdds),
      };
    }
  }

  return {
    modelVersion: K_PLUS_EV_MODEL_VERSION,
    available,
    unavailableReasons,
    pitcher: source.pitcher,
    team: source.team,
    opponent: source.opponent,
    pitcherHand: source.pitcherHand,
    isHome: source.isHome,
    eligible,
    seasonBaseline,
    trend,
    workload,
    location,
    matchup,
    projection,
    market,
    label: available ? labelFromEv(market.ev) : "UNAVAILABLE",
  };
}

export function compareKPlusEvRows(left: KPlusEvValuation, right: KPlusEvValuation): number {
  const leftEv = left.market.ev;
  const rightEv = right.market.ev;
  if (leftEv == null && rightEv == null) return left.pitcher.localeCompare(right.pitcher);
  if (leftEv == null) return 1;
  if (rightEv == null) return -1;
  if (rightEv !== leftEv) return rightEv - leftEv;
  return left.pitcher.localeCompare(right.pitcher);
}

export { formatAmericanOdds, formatEvPercent };
