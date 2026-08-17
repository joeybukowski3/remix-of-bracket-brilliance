/**
 * Standalone MLB HR +EV model (V2).
 *
 * This module is independent of the live HR Quality Score. It never
 * reads or writes hrScore, best bets, Sin City, or social-card selection.
 *
 * V2 separates the hitter's raw season HR rate ("Current Rate Fair") from
 * JoeKnowsBall's final adjusted number ("JKB Fair"), and adds a dedicated
 * recent-trend factor built from real calendar-window (L14/L30) HR + PA
 * pulled from MLB StatsAPI game logs -- never AB, games played, or
 * projected/estimated PA.
 */

export const HR_PLUS_EV_MODEL_VERSION = "mlb-hr-plus-ev-v2";

export const EXPECTED_PA_BY_ORDER: Readonly<Record<number, number>> = {
  1: 4.6,
  2: 4.5,
  3: 4.4,
  4: 4.3,
  5: 4.2,
  6: 4.1,
  7: 4.0,
  8: 3.9,
  9: 3.8,
};

export const EXPECTED_PA_FALLBACK = 4.2;

export const MATCHUP_WEIGHTS = {
  starter: 0.3,
  hitterHandedness: 0.2,
  pitcherHandedness: 0.15,
  bullpen: 0.15,
  park: 0.08,
  weather: 0.07,
  recentTrend: 0.05,
} as const;

export const PITCHING_EXPOSURE_WEIGHTS = {
  starter: 0.65,
  bullpen: 0.35,
} as const;

export const TOTAL_MATCHUP_CAP = { min: 0.7, max: 1.3 } as const;
export const RECENT_TREND_CAP = { min: 0.9, max: 1.1 } as const;
export const COMPONENT_RATIO_CAP = { min: 0.7, max: 1.3 } as const;

export const STARTER_SCORE_NEUTRAL = 50;
export const STARTER_SCORE_MAX_SWING = 0.2;

export const VALUE_EV_STRONG = 0.15;
export const VALUE_EV_MODERATE = 0.05;
export const VALUE_EV_FAIR_LOW = -0.05;

/** +EV Table eligibility gate: strictly more than 300 season PA. */
export const PLUS_EV_MIN_SEASON_PA = 300;

/** Trend factor weights: season baseline dominates, L30 > L14. */
export const TREND_BASE = 0.7;
export const TREND_WEIGHTS = { l30: 0.2, l14: 0.1 } as const;

export type HrPlusEvValueLabel =
  | "STRONG +EV"
  | "MODERATE +EV"
  | "FAIR"
  | "OVERPRICED"
  | "UNAVAILABLE";

export type HrPlusEvSampleLabel = "VERY LIMITED" | "LIMITED" | "MODERATE" | "ESTABLISHED";

export type MatchupFactorKey =
  | "starter"
  | "hitterHandedness"
  | "pitcherHandedness"
  | "bullpen"
  | "park"
  | "weather"
  | "recentTrend";

export type MatchupFactor = {
  key: MatchupFactorKey;
  label: string;
  weight: number;
  multiplier: number;
  status: "ok" | "neutral-missing";
  reason: string | null;
};

export type HandednessSplitCounts = {
  plateAppearances: number | null;
  homeRuns: number | null;
};

export type HrPlusEvBatterSource = {
  player: string;
  team: string;
  opponent: string;
  opposingPitcher: string;
  battingOrder?: number | null;
  bats?: "L" | "R" | "S" | null;
  pitcherHand?: string | null;
  parkFactor?: number | null;
  weatherBoost?: number | null;
  opposingPitcherHrVs?: number | null;
  hrOddsYes?: string | null;
  seasonHomeRuns?: number | null;
  seasonPlateAppearances?: number | null;
  /** Real calendar-window (last 14 days) HR + PA from MLB StatsAPI game logs. */
  last14HomeRuns?: number | null;
  last14PlateAppearances?: number | null;
  /** Real calendar-window (last 30 days) HR + PA from MLB StatsAPI game logs. */
  last30HomeRuns?: number | null;
  last30PlateAppearances?: number | null;
  pitcherHrPaVsBatterHand?: number | null;
  leaguePitcherHrPa?: number | null;
  bullpenHrPa?: number | null;
  leagueBullpenHrPa?: number | null;
  handednessSplits?: {
    vsLeft?: HandednessSplitCounts | null;
    vsRight?: HandednessSplitCounts | null;
  } | null;
};

export type HrPlusEvValuation = {
  modelVersion: string;
  available: boolean;
  eligible: boolean;
  unavailableReasons: string[];
  missingComponents: string[];
  player: string;
  team: string;
  opponent: string;
  opposingPitcher: string;
  bats: "L" | "R" | "S" | null;
  pitcherHand: "L" | "R" | null;
  seasonHomeRuns: number | null;
  seasonPlateAppearances: number | null;
  /** Season HR/PA rate, e.g. 0.065. */
  seasonHrPa: number | null;
  /** Season PA per HR, e.g. 15.4. Null when season HR is 0 (undefined ratio). */
  seasonPaPerHr: number | null;
  sampleLabel: HrPlusEvSampleLabel | null;
  hitterHandSplitHomeRuns: number | null;
  hitterHandSplitPlateAppearances: number | null;
  hitterHandHrPa: number | null;
  battingOrder: number | null;
  expectedPa: number;
  expectedPaSource: "batting-order" | "fallback";
  /** Raw season HR/PA rate carried straight to expected-PA probability, no trend or matchup. */
  currentRateHrProbability: number | null;
  currentRateFairOddsAmerican: number | null;
  last30HomeRuns: number | null;
  last30PlateAppearances: number | null;
  last30HrPa: number | null;
  last14HomeRuns: number | null;
  last14PlateAppearances: number | null;
  last14HrPa: number | null;
  /** True when at least one of L14/L30 has a real populated window. */
  trendAvailable: boolean;
  /** Clamped 0.90x-1.10x; 1.00x when both windows are unavailable. */
  trendFactor: number;
  /** seasonHrPa * trendFactor. */
  trendAdjustedHrPa: number | null;
  factors: Record<MatchupFactorKey, MatchupFactor>;
  pitchingExposure: number;
  totalMatchupMultiplier: number;
  /** Final JKB HR/PA rate: trendAdjustedHrPa * totalMatchupMultiplier. */
  jkbHrPa: number | null;
  jkbHrProbability: number | null;
  bookOddsRaw: string | null;
  bookOddsAmerican: number | null;
  bookImpliedProbability: number | null;
  probabilityEdge: number | null;
  fairOddsAmerican: number | null;
  ev: number | null;
  label: HrPlusEvValueLabel;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function computeHrPa(homeRuns: number | null | undefined, plateAppearances: number | null | undefined): number | null {
  if (!isFiniteNumber(homeRuns) || !isFiniteNumber(plateAppearances)) return null;
  if (homeRuns < 0 || plateAppearances <= 0) return null;
  return homeRuns / plateAppearances;
}

/** Season PA per HR. Undefined (null) when season HR is 0 -- never Infinity. */
export function computePaPerHr(homeRuns: number | null | undefined, plateAppearances: number | null | undefined): number | null {
  if (!isFiniteNumber(homeRuns) || !isFiniteNumber(plateAppearances)) return null;
  if (homeRuns <= 0 || plateAppearances <= 0) return null;
  return plateAppearances / homeRuns;
}

export function isPlusEvEligible(seasonPlateAppearances: number | null | undefined): boolean {
  return isFiniteNumber(seasonPlateAppearances) && seasonPlateAppearances > PLUS_EV_MIN_SEASON_PA;
}

export function classifySeasonSample(plateAppearances: number | null | undefined): HrPlusEvSampleLabel | null {
  if (!isFiniteNumber(plateAppearances) || plateAppearances < 0) return null;
  if (plateAppearances < 75) return "VERY LIMITED";
  if (plateAppearances < 125) return "LIMITED";
  if (plateAppearances < 200) return "MODERATE";
  return "ESTABLISHED";
}

export function expectedPaForBattingOrder(battingOrder: number | null | undefined): {
  expectedPa: number;
  source: "batting-order" | "fallback";
} {
  if (isFiniteNumber(battingOrder) && Number.isInteger(battingOrder) && battingOrder in EXPECTED_PA_BY_ORDER) {
    return { expectedPa: EXPECTED_PA_BY_ORDER[battingOrder], source: "batting-order" };
  }
  return { expectedPa: EXPECTED_PA_FALLBACK, source: "fallback" };
}

export function normalizePitcherHand(value: string | null | undefined): "L" | "R" | null {
  const code = String(value ?? "").trim().toUpperCase();
  if (code.startsWith("L")) return "L";
  if (code.startsWith("R")) return "R";
  return null;
}

export function handednessSplitKey(pitcherHand: "L" | "R" | null): "vsLeft" | "vsRight" | null {
  if (pitcherHand === "L") return "vsLeft";
  if (pitcherHand === "R") return "vsRight";
  return null;
}

export function parseAmericanOdds(value: string | number | null | undefined): number | null {
  if (isFiniteNumber(value) && value !== 0) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/^\+/, "");
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed === 0) return null;
  return parsed;
}

export function americanOddsToImpliedProbability(odds: number | null | undefined): number | null {
  if (!isFiniteNumber(odds) || odds === 0) return null;
  if (odds < 0) return (-odds) / (-odds + 100);
  return 100 / (odds + 100);
}

export function probabilityToAmericanOdds(probability: number | null | undefined): number | null {
  if (!isFiniteNumber(probability) || probability <= 0 || probability >= 1) return null;
  if (probability >= 0.5) return Math.round((-100 * probability) / (1 - probability));
  return Math.round((100 * (1 - probability)) / probability);
}

export function americanOddsToDecimal(odds: number): number {
  return odds > 0 ? odds / 100 + 1 : 100 / Math.abs(odds) + 1;
}

export function computeExpectedValue(modelProbability: number, americanOdds: number): number {
  return modelProbability * americanOddsToDecimal(americanOdds) - 1;
}

export function computeHrProbability(hrPaRate: number, expectedPa: number): number {
  const rate = clampNumber(hrPaRate, 0, 1);
  if (expectedPa <= 0) return 0;
  return 1 - (1 - rate) ** expectedPa;
}

export function labelFromEv(ev: number | null): HrPlusEvValueLabel {
  if (ev == null || !Number.isFinite(ev)) return "UNAVAILABLE";
  if (ev >= VALUE_EV_STRONG) return "STRONG +EV";
  if (ev >= VALUE_EV_MODERATE) return "MODERATE +EV";
  if (ev > VALUE_EV_FAIR_LOW) return "FAIR";
  return "OVERPRICED";
}

export function formatAmericanOdds(odds: number | null | undefined): string {
  if (!isFiniteNumber(odds)) return "—";
  const rounded = Math.round(odds);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

export function formatEvPercent(ev: number | null | undefined): string {
  if (!isFiniteNumber(ev)) return "—";
  const pct = ev * 100;
  const abs = Math.abs(pct).toFixed(1);
  return pct > 0 ? `+${abs}%` : pct < 0 ? `-${abs}%` : "0.0%";
}

export function formatMultiplier(value: number | null | undefined, digits = 2): string {
  if (!isFiniteNumber(value)) return "—";
  return `${value.toFixed(digits)}x`;
}

export function formatHrPaRate(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return "—";
  return `${(value * 100).toFixed(2)}%`;
}

export function formatProbabilityPercent(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Season "Season PA/HR" display. Shows a deliberate `0 HR / N PA` string
 * for a true zero-HR season instead of dividing by zero into Infinity.
 */
export function formatSeasonPaHr(
  homeRuns: number | null | undefined,
  plateAppearances: number | null | undefined,
): string {
  if (!isFiniteNumber(homeRuns) || !isFiniteNumber(plateAppearances)) return "—";
  if (homeRuns === 0) return `0 HR / ${plateAppearances} PA`;
  const paPerHr = computePaPerHr(homeRuns, plateAppearances);
  if (paPerHr == null) return "—";
  return `${paPerHr.toFixed(1)} PA/HR`;
}

/**
 * L14/L30 trend-window display. A real populated 0-HR window renders as
 * `0 HR / N PA` (a valid cold signal); a genuinely missing window renders
 * as "unavailable".
 */
export function formatTrendWindow(
  homeRuns: number | null | undefined,
  plateAppearances: number | null | undefined,
): string {
  if (!isFiniteNumber(homeRuns) || !isFiniteNumber(plateAppearances)) return "unavailable";
  if (homeRuns === 0) return `0 HR / ${plateAppearances} PA`;
  const paPerHr = plateAppearances / homeRuns;
  return `${paPerHr.toFixed(1)} PA/HR (${plateAppearances} PA)`;
}

function ratioAroundNeutral(
  numerator: number | null,
  denominator: number | null,
  cap: { min: number; max: number } = COMPONENT_RATIO_CAP,
): number | null {
  if (!isFiniteNumber(numerator) || !isFiniteNumber(denominator) || denominator <= 0) return null;
  return clampNumber(numerator / denominator, cap.min, cap.max);
}

/**
 * Map the generator's pitcher-only HR VS score (0–100, 50 = range/slate
 * midpoint) onto a restrained rate multiplier. The score is built from
 * pitcher xERA, hard-hit %, fly-ball %, and barrel % only — not hitter,
 * park, weather, or trend — so it can be used as starter susceptibility
 * without double-counting those other +EV components.
 */
export function starterSusceptibilityMultiplier(hrVsScore: number | null | undefined): number | null {
  if (!isFiniteNumber(hrVsScore)) return null;
  const unit = clampNumber((hrVsScore - STARTER_SCORE_NEUTRAL) / STARTER_SCORE_NEUTRAL, -1, 1);
  return 1 + unit * STARTER_SCORE_MAX_SWING;
}

export function combineWeightedMultipliers(
  factors: Array<{ multiplier: number; weight: number }>,
): number {
  const weightSum = factors.reduce((sum, factor) => sum + factor.weight, 0);
  if (weightSum <= 0) return 1;
  const excess = factors.reduce((sum, factor) => sum + factor.weight * (factor.multiplier - 1), 0);
  return 1 + excess / weightSum;
}

export function capTotalMatchupMultiplier(value: number): number {
  return clampNumber(value, TOTAL_MATCHUP_CAP.min, TOTAL_MATCHUP_CAP.max);
}

export function pitchingExposureMultiplier(starter: number, bullpen: number): number {
  return combineWeightedMultipliers([
    { multiplier: starter, weight: PITCHING_EXPOSURE_WEIGHTS.starter },
    { multiplier: bullpen, weight: PITCHING_EXPOSURE_WEIGHTS.bullpen },
  ]);
}

/**
 * Recent-vs-season HR/PA ratio for the Trend factor. A real populated
 * window (including a true 0-HR window) yields a genuine hot/cold signal;
 * a genuinely missing window -- or an unavailable/zero season baseline --
 * yields a neutral 1.00 ratio so missing data is never read as cold
 * performance.
 */
export function trendWindowRatio(windowHrPa: number | null, seasonHrPa: number | null): number {
  if (windowHrPa == null || !isFiniteNumber(seasonHrPa) || seasonHrPa <= 0) return 1;
  return windowHrPa / seasonHrPa;
}

/**
 * TrendFactor = 0.70 + 0.20*r30 + 0.10*r14, clamped to 0.90x-1.10x.
 * Season baseline dominates; L30 contributes 20%, L14 contributes 10%.
 * r30 = r14 = 1 (recent rate equals season rate) yields exactly 1.00.
 */
export function computeTrendFactor(r30: number, r14: number): number {
  return clampNumber(
    TREND_BASE + TREND_WEIGHTS.l30 * r30 + TREND_WEIGHTS.l14 * r14,
    RECENT_TREND_CAP.min,
    RECENT_TREND_CAP.max,
  );
}

function resolveSeasonHrPa(source: HrPlusEvBatterSource): { homeRuns: number; plateAppearances: number; hrPa: number } | null {
  const hrPa = computeHrPa(source.seasonHomeRuns ?? null, source.seasonPlateAppearances ?? null);
  if (hrPa == null || source.seasonHomeRuns == null || source.seasonPlateAppearances == null) return null;
  return { homeRuns: source.seasonHomeRuns, plateAppearances: source.seasonPlateAppearances, hrPa };
}

function resolveHitterHandSplit(
  source: HrPlusEvBatterSource,
  pitcherHand: "L" | "R" | null,
): { homeRuns: number; plateAppearances: number; hrPa: number } | null {
  const key = handednessSplitKey(pitcherHand);
  if (!key) return null;
  const side = source.handednessSplits?.[key];
  const hrPa = computeHrPa(side?.homeRuns ?? null, side?.plateAppearances ?? null);
  if (hrPa == null || side?.homeRuns == null || side.plateAppearances == null) return null;
  return { homeRuns: side.homeRuns, plateAppearances: side.plateAppearances, hrPa };
}

type TrendWindow = { homeRuns: number | null; plateAppearances: number | null; hrPa: number | null };

/** Real calendar-window HR + PA. Null/null/null when the window is genuinely unavailable. */
function resolveTrendWindow(
  homeRuns: number | null | undefined,
  plateAppearances: number | null | undefined,
): TrendWindow {
  if (!isFiniteNumber(homeRuns) || !isFiniteNumber(plateAppearances) || plateAppearances <= 0) {
    return { homeRuns: null, plateAppearances: null, hrPa: null };
  }
  return { homeRuns, plateAppearances, hrPa: computeHrPa(homeRuns, plateAppearances) };
}

function makeFactor(
  key: MatchupFactorKey,
  label: string,
  resolved: number | null,
  missingReason: string,
): MatchupFactor {
  if (resolved == null) {
    return {
      key,
      label,
      weight: MATCHUP_WEIGHTS[key],
      multiplier: 1,
      status: "neutral-missing",
      reason: missingReason,
    };
  }
  return {
    key,
    label,
    weight: MATCHUP_WEIGHTS[key],
    multiplier: resolved,
    status: "ok",
    reason: null,
  };
}

export function evaluateHrPlusEv(source: HrPlusEvBatterSource): HrPlusEvValuation {
  const pitcherHand = normalizePitcherHand(source.pitcherHand);
  const season = resolveSeasonHrPa(source);
  const eligible = isPlusEvEligible(source.seasonPlateAppearances ?? null);
  const bookOddsAmerican = parseAmericanOdds(source.hrOddsYes);
  const bookImpliedProbability = americanOddsToImpliedProbability(bookOddsAmerican);
  const order = expectedPaForBattingOrder(source.battingOrder ?? null);
  const hitterHand = resolveHitterHandSplit(source, pitcherHand);

  const starterResolved = starterSusceptibilityMultiplier(source.opposingPitcherHrVs ?? null);
  const hitterHandResolved = season && hitterHand ? ratioAroundNeutral(hitterHand.hrPa, season.hrPa) : null;
  const pitcherHandResolved = ratioAroundNeutral(
    source.pitcherHrPaVsBatterHand ?? null,
    source.leaguePitcherHrPa ?? null,
  );
  const bullpenResolved = ratioAroundNeutral(
    source.bullpenHrPa ?? null,
    source.leagueBullpenHrPa ?? null,
  );
  const parkResolved = isFiniteNumber(source.parkFactor) ? source.parkFactor : null;
  const weatherResolved = null;
  // Recent HR/PA trend is modeled as its own dedicated Trend factor (L14/L30
  // calendar windows, see below) outside the Matchup multiplier, so it is
  // never double-counted here -- this component stays neutral by design.
  const trendResolved = null;

  const factors: Record<MatchupFactorKey, MatchupFactor> = {
    starter: makeFactor(
      "starter",
      "Starter HR susceptibility",
      starterResolved,
      "No starter HR-susceptibility score on this batter row.",
    ),
    hitterHandedness: makeFactor(
      "hitterHandedness",
      "Hitter HR/PA vs starter hand",
      hitterHandResolved,
      pitcherHand
        ? `No reliable ${pitcherHand === "L" ? "vs LHP" : "vs RHP"} HR/PA split.`
        : "Starter handedness is unavailable, so the hitter split cannot be mapped.",
    ),
    pitcherHandedness: makeFactor(
      "pitcherHandedness",
      "Pitcher HR/PA vs hitter hand",
      pitcherHandResolved,
      "Pitcher HR allowed/PA vs hitter handedness is not in the current production artifacts.",
    ),
    bullpen: makeFactor(
      "bullpen",
      "Opponent bullpen HR/PA",
      bullpenResolved,
      "Opponent bullpen HR allowed/PA is not in the current production artifacts.",
    ),
    park: makeFactor(
      "park",
      "Park factor",
      parkResolved,
      "Park factor is missing on this batter row.",
    ),
    weather: makeFactor(
      "weather",
      "Weather",
      weatherResolved,
      "weatherBoost is a PropFinder temp/precip scoring composite on a -10 to +10 point scale, not a calibrated HR-rate multiplier. No defensible conversion exists, so weather is neutral for V2 probability modeling.",
    ),
    recentTrend: makeFactor(
      "recentTrend",
      "Recent HR/PA trend",
      trendResolved,
      "Recent HR/PA trend is applied as a dedicated V2 Trend factor (L14/L30 calendar windows, shown separately) rather than inside Matchup, to avoid double-counting.",
    ),
  };

  const totalMatchupMultiplier = capTotalMatchupMultiplier(
    combineWeightedMultipliers(Object.values(factors)),
  );
  const pitchingExposure = pitchingExposureMultiplier(factors.starter.multiplier, factors.bullpen.multiplier);

  const missingComponents = Object.values(factors)
    .filter((factor) => factor.status === "neutral-missing")
    .map((factor) => factor.label);

  const unavailableReasons: string[] = [];
  if (!eligible) {
    const paDisplay = isFiniteNumber(source.seasonPlateAppearances) ? source.seasonPlateAppearances : "an unavailable number of";
    unavailableReasons.push(
      `+EV requires more than ${PLUS_EV_MIN_SEASON_PA} season plate appearances (this batter has ${paDisplay} PA).`,
    );
  }
  if (!season) {
    unavailableReasons.push("Season HR/PA is unavailable. Authoritative season home runs and plate appearances are required. Handedness-split sums and HR/AB were not substituted.");
  }
  if (bookOddsAmerican == null || bookImpliedProbability == null) {
    unavailableReasons.push("Sportsbook HR YES odds are missing or unparseable.");
  }

  const available = unavailableReasons.length === 0;
  const seasonHrPaRate = season?.hrPa ?? null;
  const isZeroSeasonHr = season != null && season.homeRuns === 0;
  const seasonPaPerHr = season ? computePaPerHr(season.homeRuns, season.plateAppearances) : null;

  const last30Window = resolveTrendWindow(source.last30HomeRuns ?? null, source.last30PlateAppearances ?? null);
  const last14Window = resolveTrendWindow(source.last14HomeRuns ?? null, source.last14PlateAppearances ?? null);
  const trendAvailable = last30Window.hrPa != null || last14Window.hrPa != null;
  const r30 = trendWindowRatio(last30Window.hrPa, seasonHrPaRate);
  const r14 = trendWindowRatio(last14Window.hrPa, seasonHrPaRate);
  const trendFactor = eligible && season != null ? computeTrendFactor(r30, r14) : 1;

  const currentRateHrProbability = eligible && seasonHrPaRate != null
    ? computeHrProbability(seasonHrPaRate, order.expectedPa)
    : null;
  const currentRateFairOddsAmerican = probabilityToAmericanOdds(currentRateHrProbability);

  const trendAdjustedHrPa = eligible && seasonHrPaRate != null ? seasonHrPaRate * trendFactor : null;
  const jkbHrPa = trendAdjustedHrPa != null ? trendAdjustedHrPa * totalMatchupMultiplier : null;
  const jkbHrProbability = eligible && jkbHrPa != null ? computeHrProbability(jkbHrPa, order.expectedPa) : null;
  const fairOddsAmerican = probabilityToAmericanOdds(jkbHrProbability);
  // A true zero-HR season has no defensible price: force EV/label to
  // UNAVAILABLE instead of generating a -100% EV from a 0% probability.
  const ev = isZeroSeasonHr || jkbHrProbability == null || bookOddsAmerican == null
    ? null
    : computeExpectedValue(jkbHrProbability, bookOddsAmerican);
  const probabilityEdge = jkbHrProbability == null || bookImpliedProbability == null
    ? null
    : jkbHrProbability - bookImpliedProbability;

  return {
    modelVersion: HR_PLUS_EV_MODEL_VERSION,
    available,
    eligible,
    unavailableReasons,
    missingComponents,
    player: source.player,
    team: source.team,
    opponent: source.opponent,
    opposingPitcher: source.opposingPitcher,
    bats: source.bats ?? null,
    pitcherHand,
    seasonHomeRuns: season?.homeRuns ?? null,
    seasonPlateAppearances: season?.plateAppearances ?? null,
    seasonHrPa: seasonHrPaRate,
    seasonPaPerHr,
    sampleLabel: classifySeasonSample(season?.plateAppearances ?? null),
    hitterHandSplitHomeRuns: hitterHand?.homeRuns ?? null,
    hitterHandSplitPlateAppearances: hitterHand?.plateAppearances ?? null,
    hitterHandHrPa: hitterHand?.hrPa ?? null,
    battingOrder: isFiniteNumber(source.battingOrder) ? source.battingOrder : null,
    expectedPa: order.expectedPa,
    expectedPaSource: order.source,
    currentRateHrProbability,
    currentRateFairOddsAmerican,
    last30HomeRuns: last30Window.homeRuns,
    last30PlateAppearances: last30Window.plateAppearances,
    last30HrPa: last30Window.hrPa,
    last14HomeRuns: last14Window.homeRuns,
    last14PlateAppearances: last14Window.plateAppearances,
    last14HrPa: last14Window.hrPa,
    trendAvailable,
    trendFactor,
    trendAdjustedHrPa,
    factors,
    pitchingExposure,
    totalMatchupMultiplier,
    jkbHrPa,
    jkbHrProbability,
    bookOddsRaw: source.hrOddsYes ?? null,
    bookOddsAmerican,
    bookImpliedProbability,
    probabilityEdge,
    fairOddsAmerican,
    ev,
    label: labelFromEv(ev),
  };
}

export function comparePlusEvRows(left: HrPlusEvValuation, right: HrPlusEvValuation): number {
  const leftEv = left.ev;
  const rightEv = right.ev;
  if (leftEv == null && rightEv == null) {
    return left.player.localeCompare(right.player);
  }
  if (leftEv == null) return 1;
  if (rightEv == null) return -1;
  if (rightEv !== leftEv) return rightEv - leftEv;
  return left.player.localeCompare(right.player);
}
