/**
 * mlb-bullpen-workload.mjs
 *
 * Pure, bounded recent-workload and fatigue calculator for a team's
 * reliever pool. Deliberately decoupled from raw MLB StatsAPI shapes --
 * callers extract each reliever's per-game appearance from boxscore data
 * first (see mlb-bullpen-stats.mjs), then pass a normalized list here.
 * This keeps the fatigue math itself fully deterministic and testable
 * without mocking network calls.
 *
 * This metric is intentionally distinct from season bullpen quality
 * (mlb-bullpen-season-aggregate.mjs): a bullpen can have a great season
 * ERA and still be fatigued this week, or vice versa.
 *
 * @typedef {object} RelieverAppearance
 * @property {number} pitcherId
 * @property {string} officialDate - "YYYY-MM-DD"
 * @property {string|number} gamePk
 * @property {number|null} outs - outs recorded in this appearance
 * @property {number|null} numberOfPitches
 * @property {"N"|"Y"|"S"} [doubleHeader] - StatsAPI doubleHeader code
 */

import { outsToBaseballNotation } from "./mlb-bullpen-innings.mjs";

// --- Documented, bounded thresholds -----------------------------------
// These are intentionally simple and conservative; the goal is a
// directional fatigue signal, not a precise workload model.
export const LAST3_WINDOW_DAYS = 3;
export const LAST7_WINDOW_DAYS = 7;
export const HIGH_WORKLOAD_PITCH_THRESHOLD = 25; // pitches in a single relief outing
export const HIGH_WORKLOAD_APPEARANCE_THRESHOLD = 3; // appearances within the last 7 days
export const CONSECUTIVE_DAY_MIN_STREAK = 2; // 2+ appearances on back-to-back calendar days

// Fatigue score is bounded 0-100. Weights are additive and capped;
// documented here so the formula can be audited/tuned without touching
// the calculation logic.
const FATIGUE_WEIGHTS = {
  perLast3Out: 3, // per out recorded by the bullpen in the last 3 days (bounded below)
  perConsecutiveDayReliever: 12, // per reliever used on consecutive days
  perHighWorkloadReliever: 10, // per reliever flagged high-workload
  doubleHeaderInWindow: 8, // flat bump if a doubleheader occurred in the last 3 days
};
const FATIGUE_SCORE_MAX = 100;

function daysBetween(dateA, dateB) {
  const a = Date.parse(`${dateA}T00:00:00Z`);
  const b = Date.parse(`${dateB}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

function addDaysIso(dateStr, delta) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/**
 * @param {RelieverAppearance[]} appearances - all reliever-pool appearances within the lookback window
 * @param {{ asOfDate: string, lookbackDays?: number }} options - asOfDate: "YYYY-MM-DD", the slate date these appearances are being evaluated relative to
 */
export function computeBullpenWorkload(appearances, options) {
  const { asOfDate } = options;
  if (!asOfDate) throw new Error("computeBullpenWorkload requires options.asOfDate");

  const normalized = (appearances ?? []).filter((appearance) => {
    const delta = daysBetween(appearance.officialDate, asOfDate);
    return delta !== null && delta >= 1; // strictly before the slate date
  });

  const last3 = normalized.filter((a) => daysBetween(a.officialDate, asOfDate) <= LAST3_WINDOW_DAYS);
  const last7 = normalized.filter((a) => daysBetween(a.officialDate, asOfDate) <= LAST7_WINDOW_DAYS);

  const last3Outs = sumOuts(last3);
  const last7Outs = sumOuts(last7);

  const relieversUsedLast3Days = new Set(last3.map((a) => a.pitcherId)).size;

  // Consecutive-day usage: for each pitcher, sort their appearance dates
  // within the last7 window and look for any run of CONSECUTIVE_DAY_MIN_STREAK+
  // calendar days in a row with an appearance.
  const appearanceDatesByPitcher = new Map();
  for (const appearance of last7) {
    if (!appearanceDatesByPitcher.has(appearance.pitcherId)) appearanceDatesByPitcher.set(appearance.pitcherId, new Set());
    appearanceDatesByPitcher.get(appearance.pitcherId).add(appearance.officialDate);
  }
  const pitchersUsedOnConsecutiveDays = [];
  for (const [pitcherId, dateSet] of appearanceDatesByPitcher.entries()) {
    const dates = [...dateSet].sort();
    let streak = 1;
    let maxStreak = 1;
    for (let i = 1; i < dates.length; i += 1) {
      if (addDaysIso(dates[i - 1], 1) === dates[i]) {
        streak += 1;
        maxStreak = Math.max(maxStreak, streak);
      } else {
        streak = 1;
      }
    }
    if (maxStreak >= CONSECUTIVE_DAY_MIN_STREAK) pitchersUsedOnConsecutiveDays.push(pitcherId);
  }

  // High-workload relievers: elevated pitch count in any single outing,
  // OR elevated appearance frequency over the last 7 days.
  const appearanceCountByPitcher = new Map();
  const maxPitchesByPitcher = new Map();
  for (const appearance of last7) {
    appearanceCountByPitcher.set(appearance.pitcherId, (appearanceCountByPitcher.get(appearance.pitcherId) ?? 0) + 1);
    const pitches = Number(appearance.numberOfPitches);
    if (Number.isFinite(pitches)) {
      maxPitchesByPitcher.set(appearance.pitcherId, Math.max(maxPitchesByPitcher.get(appearance.pitcherId) ?? 0, pitches));
    }
  }
  const highWorkloadRelievers = [...new Set([...appearanceCountByPitcher.keys(), ...maxPitchesByPitcher.keys()])].filter(
    (pitcherId) =>
      (appearanceCountByPitcher.get(pitcherId) ?? 0) >= HIGH_WORKLOAD_APPEARANCE_THRESHOLD ||
      (maxPitchesByPitcher.get(pitcherId) ?? 0) >= HIGH_WORKLOAD_PITCH_THRESHOLD
  );

  const doubleHeaderDetected = last3.some((a) => a.doubleHeader === "Y" || a.doubleHeader === "S");

  const rawScore =
    Math.min(last3Outs, 30) * FATIGUE_WEIGHTS.perLast3Out * 0.1 + // capped contribution from raw last-3-day volume
    pitchersUsedOnConsecutiveDays.length * FATIGUE_WEIGHTS.perConsecutiveDayReliever +
    highWorkloadRelievers.length * FATIGUE_WEIGHTS.perHighWorkloadReliever +
    (doubleHeaderDetected ? FATIGUE_WEIGHTS.doubleHeaderInWindow : 0);
  const bullpenFatigueScore = Math.round(Math.min(rawScore, FATIGUE_SCORE_MAX));

  const bullpenFatigueTier = bullpenFatigueScore >= 50 ? "tired" : bullpenFatigueScore >= 20 ? "normal" : "fresh";

  return {
    last3BullpenIp: outsToBaseballNotation(last3Outs),
    last7BullpenIp: outsToBaseballNotation(last7Outs),
    relieversUsedLast3Days,
    pitchersUsedOnConsecutiveDays,
    highWorkloadRelievers,
    doubleHeaderInLast3Days: doubleHeaderDetected,
    bullpenFatigueScore,
    bullpenFatigueTier,
    fatigueFormula: {
      weights: FATIGUE_WEIGHTS,
      maxScore: FATIGUE_SCORE_MAX,
      thresholds: {
        highWorkloadPitchThreshold: HIGH_WORKLOAD_PITCH_THRESHOLD,
        highWorkloadAppearanceThreshold: HIGH_WORKLOAD_APPEARANCE_THRESHOLD,
        consecutiveDayMinStreak: CONSECUTIVE_DAY_MIN_STREAK,
        last3WindowDays: LAST3_WINDOW_DAYS,
        last7WindowDays: LAST7_WINDOW_DAYS,
      },
    },
  };
}

// Appearances already carry outs as an integer (not a baseball-notation
// string), so this sums them directly rather than going through
// mlb-bullpen-innings.mjs's string parser.
function sumOuts(appearances) {
  let total = 0;
  for (const appearance of appearances) {
    const outs = Number(appearance.outs);
    if (Number.isFinite(outs)) total += outs;
  }
  return total;
}
