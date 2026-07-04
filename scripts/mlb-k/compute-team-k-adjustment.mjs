export const TEAM_K_ADJUSTMENT_MODEL_VERSION = "team-k-adjustment-v1";

export function toFiniteNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeRate(value) {
  const parsed = toFiniteNumber(value);
  if (parsed == null) return null;
  return parsed > 1.5 ? parsed / 100 : parsed;
}

export function clamp(value, minimum, maximum) {
  if (!Number.isFinite(value)) return null;
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function reliability(sample, prior) {
  const n = toFiniteNumber(sample);
  return n != null && n > 0 ? n / (n + prior) : 0;
}

function regress(observed, prior, sample, priorStrength, fallbackWeight = 0) {
  const rate = normalizeRate(observed);
  const priorRate = normalizeRate(prior);
  if (priorRate == null) return rate;
  if (rate == null) return priorRate;
  const weight = sample == null ? fallbackWeight : reliability(sample, priorStrength);
  return priorRate + weight * (rate - priorRate);
}

function capSigned(value, cap) {
  if (!Number.isFinite(value)) return 0;
  return clamp(value, -cap, cap);
}

function pitcherHand(value) {
  const hand = String(value ?? "").trim().toUpperCase();
  return hand.startsWith("L") ? "L" : hand.startsWith("R") ? "R" : null;
}

export function computeTeamKAdjustment({ pitcher = {}, opponent = {}, league = {}, context = {} } = {}) {
  const flags = new Set();
  const leagueKRate = normalizeRate(league.kRate) ?? 0.225;
  const leagueWhiffRate = normalizeRate(league.whiffRate) ?? 0.25;

  const seasonKRate = normalizeRate(pitcher.seasonKRate);
  const seasonBF = toFiniteNumber(pitcher.seasonBattersFaced);
  const recentKRate = normalizeRate(pitcher.recentKRate);
  const recentBF = toFiniteNumber(pitcher.recentBattersFaced);
  const whiffRate = normalizeRate(pitcher.whiffRate);

  if (seasonKRate == null) flags.add("PITCHER_K_RATE_MISSING");
  if (seasonBF != null && seasonBF < 120) flags.add("LOW_PITCHER_SAMPLE");
  if (whiffRate == null) flags.add("PITCHER_WHIFF_RATE_MISSING");

  const regressedPitcherRate = regress(seasonKRate, leagueKRate, seasonBF, 200, 0.65) ?? leagueKRate;
  const recentPitcherAdjustment = capSigned(
    recentKRate == null ? 0 : Math.min(0.2, reliability(recentBF, 150)) * (recentKRate - regressedPitcherRate),
    0.008,
  );
  const whiffAdjustment = capSigned(
    whiffRate == null ? 0 : (whiffRate - leagueWhiffRate) * 0.1,
    0.006,
  );
  const pitcherBaseline = regressedPitcherRate + recentPitcherAdjustment + whiffAdjustment;

  const opponentSeasonKRate = normalizeRate(opponent.seasonKRate);
  const opponentSeasonPA = toFiniteNumber(opponent.seasonPlateAppearances);
  const opponentRecentKRate = normalizeRate(opponent.recent14KRate);
  const opponentRecentPA = toFiniteNumber(opponent.recent14PlateAppearances);

  if (opponentSeasonKRate == null) flags.add("OPPONENT_K_RATE_MISSING");
  if (opponentSeasonPA != null && opponentSeasonPA < 600) flags.add("LOW_OPPONENT_SEASON_SAMPLE");
  if (opponentRecentKRate == null) flags.add("OPPONENT_RECENT_K_RATE_MISSING");

  const regressedOpponentSeason = regress(opponentSeasonKRate, leagueKRate, opponentSeasonPA, 600, 0.55) ?? leagueKRate;
  const opponentSeasonAdjustment = capSigned((regressedOpponentSeason - leagueKRate) * 0.35, 0.015);
  const opponentRecentAdjustment = capSigned(
    opponentRecentKRate == null
      ? 0
      : Math.min(0.25, reliability(opponentRecentPA, 180)) * (opponentRecentKRate - regressedOpponentSeason) * 0.25,
    0.006,
  );

  const hand = pitcherHand(context.pitcherHand ?? pitcher.hand);
  if (!hand) flags.add("PITCHER_HAND_MISSING");
  const handRate = hand === "L"
    ? normalizeRate(opponent.kRateVsLhp)
    : hand === "R"
      ? normalizeRate(opponent.kRateVsRhp)
      : null;
  const handPA = hand === "L"
    ? toFiniteNumber(opponent.plateAppearancesVsLhp)
    : hand === "R"
      ? toFiniteNumber(opponent.plateAppearancesVsRhp)
      : null;

  if (hand && handRate == null) flags.add("HAND_SPLIT_UNAVAILABLE");
  const regressedHandRate = handRate == null
    ? regressedOpponentSeason
    : regress(handRate, regressedOpponentSeason, handPA, 450, 0.2);
  const handednessAdjustment = capSigned((regressedHandRate - regressedOpponentSeason) * 0.25, 0.004);

  const totalOpponentAdjustment = opponentSeasonAdjustment + opponentRecentAdjustment + handednessAdjustment;
  const uncappedRate = pitcherBaseline + totalOpponentAdjustment;
  const adjustedKRate = clamp(
    clamp(uncappedRate, pitcherBaseline - 0.03, pitcherBaseline + 0.03),
    0.12,
    0.38,
  );

  if (Math.abs(adjustedKRate - uncappedRate) > 0.00001) flags.add("K_RATE_ADJUSTMENT_CAPPED");

  const confidenceScore = clamp(
    0.45 * (seasonKRate == null ? 0 : seasonBF == null ? 0.55 : Math.min(1, seasonBF / 350))
      + 0.35 * (opponentSeasonKRate == null ? 0 : opponentSeasonPA == null ? 0.5 : Math.min(1, opponentSeasonPA / 1500))
      + 0.1 * (recentKRate != null ? 1 : 0)
      + 0.1 * (handRate != null ? 1 : 0),
    0,
    1,
  );

  return {
    modelVersion: TEAM_K_ADJUSTMENT_MODEL_VERSION,
    adjustedKRate: round(adjustedKRate),
    components: {
      leagueKRate: round(leagueKRate),
      pitcher: {
        observedSeasonKRate: round(seasonKRate),
        regressedSeasonKRate: round(regressedPitcherRate),
        recentAdjustment: round(recentPitcherAdjustment),
        whiffAdjustment: round(whiffAdjustment),
        baselineKRate: round(pitcherBaseline),
      },
      opponent: {
        observedSeasonKRate: round(opponentSeasonKRate),
        regressedSeasonKRate: round(regressedOpponentSeason),
        seasonAdjustment: round(opponentSeasonAdjustment),
        recentAdjustment: round(opponentRecentAdjustment),
        observedHandednessKRate: round(handRate),
        regressedHandednessKRate: round(regressedHandRate),
        handednessAdjustment: round(handednessAdjustment),
      },
      totals: {
        opponentAdjustment: round(totalOpponentAdjustment),
        movementFromPitcherBaseline: round(adjustedKRate - pitcherBaseline),
      },
    },
    diagnostics: {
      pitcherHand: hand,
      opponentKEnvironment: adjustedKRate > pitcherBaseline + 0.004 ? "favorable" : adjustedKRate < pitcherBaseline - 0.004 ? "difficult" : "neutral",
      hardBounds: [0.12, 0.38],
    },
    confidence: {
      score: round(confidenceScore, 3),
      grade: confidenceScore >= 0.8 ? "A" : confidenceScore >= 0.65 ? "B" : confidenceScore >= 0.45 ? "C" : "D",
    },
    flags: [...flags],
  };
}

export default computeTeamKAdjustment;
