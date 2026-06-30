/**
 * mlb-hr-explanation.mjs
 *
 * Deterministic, rule-based explanation generator for HR candidates.
 * Uses only existing structured data — no LLM call, no hallucination risk.
 * Reusable in both the UI and as factual input to the social-post LLM
 * wording step (the LLM may rephrase this text but must not invent facts
 * beyond what is provided here).
 */

const PROHIBITED_PHRASES = ["lock", "guaranteed", "printing", "easy money", "can't miss", "sure thing"];

function describePower(player) {
  const parts = [];
  if (player.barrelRate != null && player.barrelRate >= 14) parts.push("elite barrel rate");
  else if (player.barrelRate != null && player.barrelRate >= 9) parts.push("solid barrel rate");
  if (player.iso != null && player.iso >= 0.22) parts.push("strong ISO power");
  if (parts.length === 0) return "Power profile is unremarkable in the available data";
  return `${parts.join(" and ")} drives the power profile`;
}

function describeRecentForm(player) {
  const l7 = player.last7HR ?? 0;
  const l30 = player.last30HR ?? 0;
  if (l7 >= 2) return `hot recent form with ${l7} HR in the last 7 days`;
  if (l30 >= 5) return `consistent recent power with ${l30} HR over the last 30 days`;
  if (l7 === 0 && l30 <= 1) return "recent HR form is quiet";
  return "recent HR form is neutral";
}

function describePitcherVulnerability(player) {
  const hrVs = player.opposingPitcherHrVs;
  if (hrVs == null) return "opposing pitcher HR vulnerability is unavailable";
  if (hrVs >= 65) return `a pitcher allowing elevated HR damage (HR vulnerability ${hrVs.toFixed(0)})`;
  if (hrVs >= 50) return `a moderately hittable pitcher (HR vulnerability ${hrVs.toFixed(0)})`;
  return `a pitcher who has limited HR damage so far (HR vulnerability ${hrVs.toFixed(0)})`;
}

function describeEnvironment(player) {
  const park = player.parkFactor;
  const weather = player.weatherBoost ?? 0;
  const parkText = park != null
    ? (park >= 1.1 ? "a favorable HR park" : park <= 0.92 ? "a pitcher-friendly park" : "a neutral park")
    : "park context unavailable";
  const weatherText = weather >= 3 ? "with weather adding lift" : weather <= -3 ? "with weather working against the ball" : "with neutral weather";
  return `${parkText}, ${weatherText}`;
}

function describeMarketPrice(player) {
  if (player.hrOddsYes) return `priced at ${player.hrOddsYes}`;
  return "no market price currently available";
}

function describeMainRisk(player) {
  const risks = [];
  if (player.opposingPitcherHrVs != null && player.opposingPitcherHrVs < 45) risks.push("the pitcher has limited HR exposure on the season");
  if (player.whiffRate != null && player.whiffRate >= 30) risks.push("an elevated whiff rate raises swing-and-miss risk");
  if (player.last7HR === 0 && player.last30HR === 0) risks.push("no HRs in the recent sample");
  if (player.hrOddsYes) {
    const numeric = parseFloat(String(player.hrOddsYes).replace("+", ""));
    if (Number.isFinite(numeric) && numeric > 0 && numeric < 200) risks.push("the short market price limits payout");
  }
  if (risks.length === 0) return "No standout risk flagged in the available data";
  return risks[0].charAt(0).toUpperCase() + risks[0].slice(1);
}

/**
 * Build a deterministic 1–3 sentence explanation for an HR candidate.
 * Uses only fields already present on the player object — never invents data.
 *
 * @param {object} player  Validated batter row (barrelRate, iso, last7HR, last30HR,
 *                          opposingPitcherHrVs, parkFactor, weatherBoost, hrOddsYes, whiffRate)
 * @returns {string}
 */
export function buildHrExplanation(player) {
  const sentence1 = `${describePower(player)} against ${describePitcherVulnerability(player)}.`;
  const sentence2 = `The park and weather context is ${describeEnvironment(player)}, while ${describeRecentForm(player)}.`;
  const sentence3 = `Currently ${describeMarketPrice(player)}; the main risk is that ${describeMainRisk(player).toLowerCase()}.`;
  return [sentence1, sentence2, sentence3].join(" ");
}

/** Returns true if the text contains none of the prohibited certainty phrases. */
export function isExplanationLanguageSafe(text) {
  const lower = text.toLowerCase();
  return !PROHIBITED_PHRASES.some((phrase) => lower.includes(phrase));
}

export { PROHIBITED_PHRASES };
