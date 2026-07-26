/**
 * mlb-hr-handedness-frequency.mjs
 *
 * Pure handedness-specific home-run frequency for the live HR props model.
 * Selects batter season AB/HR against only the opposing starter's throwing
 * hand from the existing batter-hand-splits cache (StatsAPI sitCodes vl/vr).
 *
 * Never combines vs-LHP and vs-RHP. Uses at-bats (not plate appearances).
 * Never fabricates values; never emits Infinity/NaN/negatives.
 */

/** Matches hand-split shrinkage sample K so small samples shrink toward neutral. */
export const HAND_FREQ_SAMPLE_K = 80;

/** Initial live HR Quality Score weight for this component (smallest allowed). */
export const HAND_FREQ_SCORE_WEIGHT = 0.10;

/** Fixed scoring curve for AB-per-HR (lower is better). Not a data fallback. */
const AB_PER_HR_BEST = 12;
const AB_PER_HR_WORST = 55;

export const SPLIT_STATUS = {
  OK: "ok",
  ZERO_HR: "zero_hr",
  SPLIT_UNAVAILABLE: "split_unavailable",
  PITCHER_HAND_UNAVAILABLE: "pitcher_hand_unavailable",
};

function toNonNegFinite(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function round1(value) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * @param {string|null|undefined} pitcherHand
 * @returns {"L"|"R"|null}
 */
export function normalizePitcherHandCode(pitcherHand) {
  const code = String(pitcherHand ?? "").trim().toUpperCase();
  if (code === "L" || code.startsWith("L")) return "L";
  if (code === "R" || code.startsWith("R")) return "R";
  return null;
}

/**
 * @param {"L"|"R"} hand
 * @returns {"vsLeft"|"vsRight"}
 */
export function splitSideKeyForHand(hand) {
  return hand === "L" ? "vsLeft" : "vsRight";
}

/**
 * @param {"L"|"R"} hand
 * @returns {"LHP"|"RHP"}
 */
export function handLabel(hand) {
  return hand === "L" ? "LHP" : "RHP";
}

/**
 * Read raw season AB/HR for one platoon side. Prefer raw metrics when present.
 * @param {object|null|undefined} splitRecord
 * @returns {{ atBats: number|null, homeRuns: number|null }}
 */
export function readSplitAbHr(splitRecord) {
  const raw = splitRecord?.raw ?? null;
  const atBats = toNonNegFinite(raw?.atBats ?? splitRecord?.atBats);
  const homeRuns = toNonNegFinite(raw?.homeRuns ?? splitRecord?.homeRuns);
  return { atBats, homeRuns };
}

/**
 * @param {object} input
 * @param {string|null|undefined} input.pitcherHand
 * @param {object|null|undefined} input.batterHandSplits  cache entry for one playerId
 * @returns {object} persisted frequency fields + display helpers
 */
export function selectHandednessHrFrequency({ pitcherHand = null, batterHandSplits = null } = {}) {
  const hand = normalizePitcherHandCode(pitcherHand);
  if (!hand) {
    return {
      splitSide: null,
      splitAtBats: null,
      splitHomeRuns: null,
      splitAbPerHr: null,
      splitStatus: SPLIT_STATUS.PITCHER_HAND_UNAVAILABLE,
      splitHandLabel: null,
      displayPrimary: "Pitcher hand unavailable",
      displaySecondary: null,
      scoreComponent: null,
    };
  }

  const sideKey = splitSideKeyForHand(hand);
  const label = handLabel(hand);
  const splitRecord = batterHandSplits?.splits?.[sideKey] ?? null;
  const { atBats, homeRuns } = readSplitAbHr(splitRecord);

  if (atBats == null || homeRuns == null || atBats <= 0 || homeRuns > atBats) {
    return {
      splitSide: sideKey,
      splitAtBats: null,
      splitHomeRuns: null,
      splitAbPerHr: null,
      splitStatus: SPLIT_STATUS.SPLIT_UNAVAILABLE,
      splitHandLabel: label,
      displayPrimary: "Split unavailable",
      displaySecondary: null,
      scoreComponent: null,
    };
  }

  if (homeRuns === 0) {
    return {
      splitSide: sideKey,
      splitAtBats: atBats,
      splitHomeRuns: 0,
      splitAbPerHr: null,
      splitStatus: SPLIT_STATUS.ZERO_HR,
      splitHandLabel: label,
      displayPrimary: `0 HR in ${formatAb(atBats)} AB`,
      displaySecondary: null,
      scoreComponent: scoreHandednessFrequency({ atBats, homeRuns: 0, abPerHr: null }),
    };
  }

  const abPerHr = atBats / homeRuns;
  if (!Number.isFinite(abPerHr) || abPerHr < 0) {
    return {
      splitSide: sideKey,
      splitAtBats: atBats,
      splitHomeRuns: homeRuns,
      splitAbPerHr: null,
      splitStatus: SPLIT_STATUS.SPLIT_UNAVAILABLE,
      splitHandLabel: label,
      displayPrimary: "Split unavailable",
      displaySecondary: null,
      scoreComponent: null,
    };
  }

  const abPerHrRounded = round1(abPerHr);
  return {
    splitSide: sideKey,
    splitAtBats: atBats,
    splitHomeRuns: homeRuns,
    splitAbPerHr: abPerHrRounded,
    splitStatus: SPLIT_STATUS.OK,
    splitHandLabel: label,
    displayPrimary: `1 HR / ${abPerHrRounded.toFixed(1)} AB`,
    displaySecondary: `${homeRuns} HR in ${formatAb(atBats)} AB`,
    scoreComponent: scoreHandednessFrequency({ atBats, homeRuns, abPerHr }),
  };
}

function formatAb(atBats) {
  return Number.isInteger(atBats) ? String(atBats) : String(round1(atBats));
}

/**
 * Deterministic 0–100 score. Lower AB/HR is better. Zero HR uses rate 0.
 * Small samples shrink toward neutral 50 via AB / (AB + K).
 *
 * @returns {number|null} null => omit from weighted score (neutral)
 */
export function scoreHandednessFrequency({ atBats, homeRuns, abPerHr }) {
  const ab = toNonNegFinite(atBats);
  const hr = toNonNegFinite(homeRuns);
  if (ab == null || hr == null || ab <= 0) return null;

  let rawScore;
  if (hr === 0) {
    // No homers in the split: poor raw signal, still sample-shrunk.
    rawScore = 15;
  } else {
    const ratio = Number.isFinite(abPerHr) ? abPerHr : ab / hr;
    if (!Number.isFinite(ratio) || ratio < 0) return null;
    // Invert: fewer AB per HR => higher score.
    const t = (ratio - AB_PER_HR_BEST) / (AB_PER_HR_WORST - AB_PER_HR_BEST);
    rawScore = clamp(100 - t * 100, 0, 100);
  }

  const sampleWeight = ab / (ab + HAND_FREQ_SAMPLE_K);
  const blended = sampleWeight * rawScore + (1 - sampleWeight) * 50;
  if (!Number.isFinite(blended)) return null;
  return round1(clamp(blended, 0, 100));
}

/**
 * Build the persisted row fields from a selection result.
 * Scoring remains single-side (opposing starter hand only).
 * @param {ReturnType<typeof selectHandednessHrFrequency>} selected
 */
export function toPersistedHandednessFrequencyFields(selected) {
  return {
    splitSide: selected.splitSide,
    splitAtBats: selected.splitAtBats,
    splitHomeRuns: selected.splitHomeRuns,
    splitAbPerHr: selected.splitAbPerHr,
    splitStatus: selected.splitStatus,
    splitHandLabel: selected.splitHandLabel,
    // Score input only; consumers may omit from public UI.
    splitHrFrequencyScore: selected.scoreComponent,
  };
}

function round3(value) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 1000) / 1000;
}

function rateOrNull(numerator, denominator) {
  const n = toNonNegFinite(numerator);
  const d = toNonNegFinite(denominator);
  if (n == null || d == null || d <= 0) return null;
  return n / d;
}

/**
 * Build one side of the dual-handedness display payload from a cache split
 * record. Uses only raw season counts already present in the hand-split
 * cache — never fabricates hard-hit or other Statcast metrics.
 *
 * @param {object|null|undefined} splitRecord
 * @returns {object}
 */
export function buildHandednessSplitSide(splitRecord) {
  const raw = splitRecord?.raw ?? null;
  const plateAppearances = toNonNegFinite(raw?.plateAppearances ?? splitRecord?.plateAppearances);
  const atBats = toNonNegFinite(raw?.atBats ?? splitRecord?.atBats);
  const hits = toNonNegFinite(raw?.hits ?? splitRecord?.hits);
  const homeRuns = toNonNegFinite(raw?.homeRuns ?? splitRecord?.homeRuns);
  const walks = toNonNegFinite(raw?.walks ?? splitRecord?.walks);
  const strikeouts = toNonNegFinite(raw?.strikeouts ?? splitRecord?.strikeouts);
  const battingAverage = toNonNegFinite(raw?.battingAverage ?? splitRecord?.battingAverage);
  const onBasePercentage = toNonNegFinite(raw?.onBasePercentage ?? splitRecord?.onBasePercentage);
  const sluggingPercentage = toNonNegFinite(raw?.sluggingPercentage ?? splitRecord?.sluggingPercentage);
  const ops = toNonNegFinite(raw?.ops ?? splitRecord?.ops);
  const hrRateRaw = toNonNegFinite(raw?.hrRate ?? splitRecord?.hrRate);
  const hrRate =
    hrRateRaw != null
      ? hrRateRaw
      : plateAppearances != null && plateAppearances > 0 && homeRuns != null
        ? homeRuns / plateAppearances
        : null;

  const sampleSizeTier =
    typeof splitRecord?.sampleSizeTier === "string" && splitRecord.sampleSizeTier.trim()
      ? splitRecord.sampleSizeTier
      : null;

  if (atBats == null || homeRuns == null || atBats <= 0 || homeRuns > atBats) {
    return {
      plateAppearances: plateAppearances ?? null,
      atBats: null,
      hits: null,
      homeRuns: null,
      walks: null,
      strikeouts: null,
      battingAverage: null,
      onBasePercentage: null,
      sluggingPercentage: null,
      ops: null,
      hrRate: null,
      abPerHr: null,
      strikeoutRate: null,
      walkRate: null,
      status: SPLIT_STATUS.SPLIT_UNAVAILABLE,
      sampleSizeTier,
    };
  }

  const status = homeRuns === 0 ? SPLIT_STATUS.ZERO_HR : SPLIT_STATUS.OK;
  const abPerHr = homeRuns > 0 ? round1(atBats / homeRuns) : null;
  const strikeoutRate = rateOrNull(strikeouts, plateAppearances);
  const walkRate = rateOrNull(walks, plateAppearances);

  return {
    plateAppearances: plateAppearances ?? null,
    atBats,
    hits,
    homeRuns,
    walks,
    strikeouts,
    battingAverage: round3(battingAverage),
    onBasePercentage: round3(onBasePercentage),
    sluggingPercentage: round3(sluggingPercentage),
    ops: round3(ops),
    hrRate: hrRate != null && Number.isFinite(hrRate) ? hrRate : null,
    abPerHr,
    strikeoutRate: strikeoutRate != null && Number.isFinite(strikeoutRate) ? strikeoutRate : null,
    walkRate: walkRate != null && Number.isFinite(walkRate) ? walkRate : null,
    status,
    sampleSizeTier,
  };
}

/**
 * Persist both platoon sides for expanded batter UI comparison.
 * Independent of opposing pitcher hand — scoring still uses
 * selectHandednessHrFrequency (single side only).
 *
 * @param {object|null|undefined} batterHandSplits
 * @returns {{ vsLeft: object, vsRight: object }}
 */
export function buildHandednessSplits(batterHandSplits) {
  return {
    vsLeft: buildHandednessSplitSide(batterHandSplits?.splits?.vsLeft ?? null),
    vsRight: buildHandednessSplitSide(batterHandSplits?.splits?.vsRight ?? null),
  };
}
