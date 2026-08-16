/**
 * Standalone MLB HR +EV model (V1).
 *
 * This module is independent of the live HR Quality Score. It never
 * reads or writes hrScore, best bets, Sin City, or social-card selection.
 */

export const HR_PLUS_EV_MODEL_VERSION = "mlb-hr-plus-ev-v1";

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
export const WEATHER_BOOST_PER_POINT = 0.007;

export const VALUE_EV_STRONG = 0.15;
export const VALUE_EV_MODERATE = 0.05;
export const VALUE_EV_FAIR_LOW = -0.05;

export const LAST50_TREND_BLEND = 0.6;
export const LAST100_TREND_BLEND = 0.4;

export type HrPlusEvValueLabel =
  | "STRONG +EV"
  | "MODERATE +EV"
  | "FAIR"
  | "OVERPRICED"
  | "UNAVAILABLE";

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

export type RollingPaGame = {
  plateAppearances: number | null;
  homeRuns: number | null;
  date?: string | null;
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
  last50PaHomeRuns?: number | null;
  last50PaPlateAppearances?: number | null;
  last100PaHomeRuns?: number | null;
  last100PaPlateAppearances?: number | null;
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
  seasonHrPa: number | null;
  last100HomeRuns: number | null;
  last100PlateAppearances: number | null;
  last100HrPa: number | null;
  last50HomeRuns: number | null;
  last50PlateAppearances: number | null;
  last50HrPa: number | null;
  hitterHandSplitHomeRuns: number | null;
  hitterHandSplitPlateAppearances: number | null;
  hitterHandHrPa: number | null;
  battingOrder: number | null;
  expectedPa: number;
  expectedPaSource: "batting-order" | "fallback";
  factors: Record<MatchupFactorKey, MatchupFactor>;
  pitchingExposure: number;
  totalMatchupMultiplier: number;
  adjustedHrPa: number | null;
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

export function computeHrProbability(adjustedHrPa: number, expectedPa: number): number {
  const rate = clampNumber(adjustedHrPa, 0, 1);
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

function ratioAroundNeutral(
  numerator: number | null,
  denominator: number | null,
  cap: { min: number; max: number } = COMPONENT_RATIO_CAP,
): number | null {
  if (!isFiniteNumber(numerator) || !isFiniteNumber(denominator) || denominator <= 0) return null;
  return clampNumber(numerator / denominator, cap.min, cap.max);
}

export function starterSusceptibilityMultiplier(hrVsScore: number | null | undefined): number | null {
  if (!isFiniteNumber(hrVsScore)) return null;
  const unit = clampNumber((hrVsScore - STARTER_SCORE_NEUTRAL) / STARTER_SCORE_NEUTRAL, -1, 1);
  return 1 + unit * STARTER_SCORE_MAX_SWING;
}

export function weatherMultiplier(weatherBoost: number | null | undefined): number | null {
  if (!isFiniteNumber(weatherBoost)) return null;
  return 1 + weatherBoost * WEATHER_BOOST_PER_POINT;
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
 * Walk completed plate appearances from newest to oldest until the target
 * PA window is filled. Returns null when fewer than `targetPa` completed
 * PAs exist. Never substitutes last-X-games.
 */
export function computeRollingPaHrRate(
  games: readonly RollingPaGame[],
  targetPa: number,
): { homeRuns: number; plateAppearances: number; hrPa: number } | null {
  if (!Number.isFinite(targetPa) || targetPa <= 0 || !Array.isArray(games) || games.length === 0) {
    return null;
  }

  const chronologicalNewestFirst = [...games].sort((left, right) => {
    const leftTime = Date.parse(String(left.date ?? ""));
    const rightTime = Date.parse(String(right.date ?? ""));
    const leftOk = Number.isFinite(leftTime);
    const rightOk = Number.isFinite(rightTime);
    if (leftOk && rightOk) return rightTime - leftTime;
    if (leftOk) return -1;
    if (rightOk) return 1;
    return 0;
  });

  let homeRuns = 0;
  let plateAppearances = 0;
  for (const game of chronologicalNewestFirst) {
    if (!isFiniteNumber(game.plateAppearances) || game.plateAppearances <= 0) continue;
    if (!isFiniteNumber(game.homeRuns) || game.homeRuns < 0) continue;
    homeRuns += game.homeRuns;
    plateAppearances += game.plateAppearances;
    if (plateAppearances >= targetPa) {
      return { homeRuns, plateAppearances, hrPa: homeRuns / plateAppearances };
    }
  }
  return null;
}

function seasonFromExplicit(source: HrPlusEvBatterSource): { homeRuns: number; plateAppearances: number } | null {
  const hrPa = computeHrPa(source.seasonHomeRuns ?? null, source.seasonPlateAppearances ?? null);
  if (hrPa == null || source.seasonHomeRuns == null || source.seasonPlateAppearances == null) return null;
  return { homeRuns: source.seasonHomeRuns, plateAppearances: source.seasonPlateAppearances };
}

function seasonFromHandSplits(source: HrPlusEvBatterSource): { homeRuns: number; plateAppearances: number } | null {
  const vsLeft = source.handednessSplits?.vsLeft;
  const vsRight = source.handednessSplits?.vsRight;
  if (!vsLeft || !vsRight) return null;
  if (!isFiniteNumber(vsLeft.homeRuns) || !isFiniteNumber(vsLeft.plateAppearances)) return null;
  if (!isFiniteNumber(vsRight.homeRuns) || !isFiniteNumber(vsRight.plateAppearances)) return null;
  if (vsLeft.plateAppearances <= 0 || vsRight.plateAppearances <= 0) return null;
  if (vsLeft.homeRuns < 0 || vsRight.homeRuns < 0) return null;
  return {
    homeRuns: vsLeft.homeRuns + vsRight.homeRuns,
    plateAppearances: vsLeft.plateAppearances + vsRight.plateAppearances,
  };
}

function resolveSeasonHrPa(source: HrPlusEvBatterSource): { homeRuns: number; plateAppearances: number; hrPa: number } | null {
  const explicit = seasonFromExplicit(source);
  const fromSplits = seasonFromHandSplits(source);
  const chosen = explicit ?? fromSplits;
  if (!chosen) return null;
  const hrPa = computeHrPa(chosen.homeRuns, chosen.plateAppearances);
  if (hrPa == null) return null;
  return { ...chosen, hrPa };
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

function resolvePersistedRolling(
  homeRuns: number | null | undefined,
  plateAppearances: number | null | undefined,
  targetPa: number,
): { homeRuns: number; plateAppearances: number; hrPa: number } | null {
  const hrPa = computeHrPa(homeRuns ?? null, plateAppearances ?? null);
  if (hrPa == null || homeRuns == null || plateAppearances == null) return null;
  if (plateAppearances < targetPa) return null;
  return { homeRuns, plateAppearances, hrPa };
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
  const bookOddsAmerican = parseAmericanOdds(source.hrOddsYes);
  const bookImpliedProbability = americanOddsToImpliedProbability(bookOddsAmerican);
  const order = expectedPaForBattingOrder(source.battingOrder ?? null);
  const hitterHand = resolveHitterHandSplit(source, pitcherHand);
  const last100 = resolvePersistedRolling(source.last100PaHomeRuns, source.last100PaPlateAppearances, 100);
  const last50 = resolvePersistedRolling(source.last50PaHomeRuns, source.last50PaPlateAppearances, 50);

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
  const weatherResolved = weatherMultiplier(source.weatherBoost ?? null);

  let trendResolved: number | null = null;
  if (season) {
    const last50Ratio = last50 ? last50.hrPa / season.hrPa : null;
    const last100Ratio = last100 ? last100.hrPa / season.hrPa : null;
    if (last50Ratio != null && last100Ratio != null) {
      trendResolved = clampNumber(
        LAST50_TREND_BLEND * last50Ratio + LAST100_TREND_BLEND * last100Ratio,
        RECENT_TREND_CAP.min,
        RECENT_TREND_CAP.max,
      );
    } else if (last50Ratio != null) {
      trendResolved = clampNumber(last50Ratio, RECENT_TREND_CAP.min, RECENT_TREND_CAP.max);
    } else if (last100Ratio != null) {
      trendResolved = clampNumber(last100Ratio, RECENT_TREND_CAP.min, RECENT_TREND_CAP.max);
    }
  }

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
      "Weather boost is missing on this batter row.",
    ),
    recentTrend: makeFactor(
      "recentTrend",
      "Recent HR/PA trend",
      trendResolved,
      "Last 50/100 PA HR/PA is unavailable. Existing last-7/30-day HR counts are not a PA window and were not substituted.",
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
  if (!season) {
    unavailableReasons.push("Season HR/PA is unavailable. Need season HR and PA, or complete vsL+vsR PA/HR splits. HR/AB was not substituted.");
  }
  if (bookOddsAmerican == null || bookImpliedProbability == null) {
    unavailableReasons.push("Sportsbook HR YES odds are missing or unparseable.");
  }

  const available = unavailableReasons.length === 0 && season != null && bookOddsAmerican != null;
  const adjustedHrPa = available && season ? season.hrPa * totalMatchupMultiplier : null;
  const jkbHrProbability = adjustedHrPa == null ? null : computeHrProbability(adjustedHrPa, order.expectedPa);
  const ev = jkbHrProbability == null || bookOddsAmerican == null
    ? null
    : computeExpectedValue(jkbHrProbability, bookOddsAmerican);
  const probabilityEdge = jkbHrProbability == null || bookImpliedProbability == null
    ? null
    : jkbHrProbability - bookImpliedProbability;

  return {
    modelVersion: HR_PLUS_EV_MODEL_VERSION,
    available,
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
    seasonHrPa: season?.hrPa ?? null,
    last100HomeRuns: last100?.homeRuns ?? null,
    last100PlateAppearances: last100?.plateAppearances ?? null,
    last100HrPa: last100?.hrPa ?? null,
    last50HomeRuns: last50?.homeRuns ?? null,
    last50PlateAppearances: last50?.plateAppearances ?? null,
    last50HrPa: last50?.hrPa ?? null,
    hitterHandSplitHomeRuns: hitterHand?.homeRuns ?? null,
    hitterHandSplitPlateAppearances: hitterHand?.plateAppearances ?? null,
    hitterHandHrPa: hitterHand?.hrPa ?? null,
    battingOrder: isFiniteNumber(source.battingOrder) ? source.battingOrder : null,
    expectedPa: order.expectedPa,
    expectedPaSource: order.source,
    factors,
    pitchingExposure,
    totalMatchupMultiplier,
    adjustedHrPa,
    jkbHrProbability,
    bookOddsRaw: source.hrOddsYes ?? null,
    bookOddsAmerican,
    bookImpliedProbability,
    probabilityEdge,
    fairOddsAmerican: probabilityToAmericanOdds(jkbHrProbability),
    ev,
    label: available ? labelFromEv(ev) : "UNAVAILABLE",
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
