/**
 * mlb-hr-environment.mjs
 *
 * Deterministic 0-100 game-level HR environment score using ONLY data
 * already available in the pipeline: park factor, weather boost, starting
 * pitcher HR vulnerability, and qualifying-hitter concentration.
 *
 * Per the audit, bullpen HR vulnerability and team implied totals are not
 * currently available/reliable, so they are intentionally excluded here.
 *
 * This score is informational only — it must never feed into or alter
 * individual player HR Quality Scores.
 *
 * Weights: Park 30%, Weather 25%, Starting pitchers 30%, Qualifying hitter
 * concentration 15%.
 */

export const GAME_ENVIRONMENT_WEIGHTS = {
  park: 0.30,
  weather: 0.25,
  pitchers: 0.30,
  qualifyingHitters: 0.15,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Park factor ~0.85-1.40 in this repo's static table -> 0-100 scale */
function normalizePark(parkFactor) {
  if (parkFactor == null) return null;
  return clamp(((parkFactor - 0.85) / (1.40 - 0.85)) * 100, 0, 100);
}

/** Weather boost ~ -6..+6 in computeWeatherBoost -> 0-100 scale */
function normalizeWeather(weatherBoost) {
  if (weatherBoost == null) return 50; // neutral when unknown
  return clamp(((weatherBoost + 6) / 12) * 100, 0, 100);
}

/** Average opposing-pitcher HR-vulnerability score (already 0-100 scale) across both starters */
function normalizePitcherVulnerability(hrVsValues) {
  const valid = hrVsValues.filter((v) => v != null && Number.isFinite(v));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

/** Count of batters with hrScore >= threshold, scaled against a reasonable max per game (~10) */
function normalizeQualifyingHitters(count, max = 10) {
  return clamp((count / max) * 100, 0, 100);
}

/**
 * @param {object} game
 * @param {number|null} game.parkFactor
 * @param {number|null} game.weatherBoost          // average or representative weatherBoost for the game
 * @param {number[]} game.pitcherHrVulnerabilities  // [awayPitcherHrVs, homePitcherHrVs]
 * @param {number} game.qualifyingHitterCount        // batters with hrScore >= QUALIFYING_THRESHOLD in this game
 * @returns {{ gameHrEnvironmentScore: number|null, components: object }}
 */
export function computeGameHrEnvironmentScore(game) {
  const parkNorm = normalizePark(game.parkFactor);
  const weatherNorm = normalizeWeather(game.weatherBoost);
  const pitcherNorm = normalizePitcherVulnerability(game.pitcherHrVulnerabilities ?? []);
  const hittersNorm = normalizeQualifyingHitters(game.qualifyingHitterCount ?? 0);

  const components = {
    park: parkNorm,
    weather: weatherNorm,
    pitchers: pitcherNorm,
    qualifyingHitters: hittersNorm,
  };

  let weightedSum = 0;
  let totalWeight = 0;
  for (const [key, weight] of Object.entries(GAME_ENVIRONMENT_WEIGHTS)) {
    const val = components[key];
    if (val != null && Number.isFinite(val)) {
      weightedSum += weight * val;
      totalWeight += weight;
    }
  }

  if (totalWeight === 0) return { gameHrEnvironmentScore: null, components };

  const gameHrEnvironmentScore = Math.round((weightedSum / totalWeight) * 10) / 10;
  return { gameHrEnvironmentScore, components };
}

export const QUALIFYING_HR_SCORE_THRESHOLD = 50;
