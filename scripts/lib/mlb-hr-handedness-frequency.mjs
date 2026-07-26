/**
 * mlb-hr-handedness-frequency.mjs
 *
 * Handedness matchup component for the live HR props model.
 * Selects the batter's current-season split against only the opposing
 * starter's throwing hand (StatsAPI sitCodes vl/vr via hand-split cache).
 *
 * Scoring is a composite Handedness Matchup Score (not HR-frequency alone):
 *   HR Rate = HR / AB   (higher better)
 *   ISO     = SLG - AVG (higher better)
 *   K Rate  = K / PA    (lower better)
 *
 * Never combines vs-LHP and vs-RHP for the score. Never fabricates values;
 * never emits Infinity/NaN/negatives.
 */

/** Matches hand-split shrinkage sample K so small samples shrink toward neutral. */
export const HAND_FREQ_SAMPLE_K = 80;

/** Live HR Quality Score weight for the handedness matchup component. */
export const HAND_FREQ_SCORE_WEIGHT = 0.10;

/**
 * Within-component weights for Handedness Matchup Score (sum = 1).
 * Missing sub-components are dropped and the remainder renormalized.
 */
export const MATCHUP_COMPONENT_WEIGHTS = {
  hrRate: 0.45,
  iso: 0.35,
  kRate: 0.20,
};

/** Fixed scoring anchors (curve constants — not data fallbacks). */
const HR_RATE_BEST = 1 / 12; // ~0.0833 HR/AB
const HR_RATE_WORST = 1 / 55; // ~0.0182 HR/AB
const ISO_BEST = 0.28;
const ISO_WORST = 0.08;
const K_RATE_BEST = 0.15; // lower is better
const K_RATE_WORST = 0.32;

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
  const sideMetrics = buildHandednessSplitSide(splitRecord);
  const { atBats, homeRuns } = readSplitAbHr(splitRecord);

  if (sideMetrics.status === SPLIT_STATUS.SPLIT_UNAVAILABLE || atBats == null || homeRuns == null) {
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
      scoreComponent: scoreHandednessMatchup(sideMetrics),
    };
  }

  const abPerHrRounded = sideMetrics.abPerHr;
  if (abPerHrRounded == null) {
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

  return {
    splitSide: sideKey,
    splitAtBats: atBats,
    splitHomeRuns: homeRuns,
    splitAbPerHr: abPerHrRounded,
    splitStatus: SPLIT_STATUS.OK,
    splitHandLabel: label,
    displayPrimary: `1 HR / ${abPerHrRounded.toFixed(1)} AB`,
    displaySecondary: `${homeRuns} HR in ${formatAb(atBats)} AB`,
    scoreComponent: scoreHandednessMatchup(sideMetrics),
  };
}

function formatAb(atBats) {
  return Number.isInteger(atBats) ? String(atBats) : String(round1(atBats));
}

function scaleHigherBetter(value, worst, best) {
  if (value == null || !Number.isFinite(value)) return null;
  if (!(best > worst)) return null;
  const t = (value - worst) / (best - worst);
  return clamp(t * 100, 0, 100);
}

function scaleLowerBetter(value, best, worst) {
  // best < worst numerically (e.g. K% 15% better than 32%)
  if (value == null || !Number.isFinite(value)) return null;
  if (!(worst > best)) return null;
  const t = (value - best) / (worst - best);
  return clamp(100 - t * 100, 0, 100);
}

/**
 * Handedness Matchup Score (0–100) from the facing-hand split only.
 * Composite of HR/AB, ISO (SLG−AVG), and K/PA. Small samples shrink toward 50.
 *
 * @param {object|null|undefined} side  buildHandednessSplitSide result or equivalent
 * @returns {number|null} null => omit from weighted HR score (neutral)
 */
export function scoreHandednessMatchup(side) {
  const ab = toNonNegFinite(side?.atBats);
  const hr = toNonNegFinite(side?.homeRuns);
  if (ab == null || hr == null || ab <= 0 || hr > ab) return null;

  const parts = [];

  // HR Rate = HR / AB (higher better). Zero HR is a valid poor power signal.
  const hrRate = hr / ab;
  if (Number.isFinite(hrRate) && hrRate >= 0) {
    const hrScore = hr === 0 ? 12 : scaleHigherBetter(hrRate, HR_RATE_WORST, HR_RATE_BEST);
    if (hrScore != null) parts.push({ value: hrScore, weight: MATCHUP_COMPONENT_WEIGHTS.hrRate });
  }

  // ISO = SLG - AVG (higher better)
  const avg = toNonNegFinite(side?.battingAverage);
  const slg = toNonNegFinite(side?.sluggingPercentage);
  if (avg != null && slg != null && slg + 1e-12 >= avg) {
    const iso = slg - avg;
    const isoScore = scaleHigherBetter(iso, ISO_WORST, ISO_BEST);
    if (isoScore != null) parts.push({ value: isoScore, weight: MATCHUP_COMPONENT_WEIGHTS.iso });
  }

  // K Rate = K / PA (lower better)
  const pa = toNonNegFinite(side?.plateAppearances);
  const strikeouts = toNonNegFinite(side?.strikeouts);
  if (pa != null && pa > 0 && strikeouts != null) {
    const kRate = strikeouts / pa;
    if (Number.isFinite(kRate) && kRate >= 0 && kRate <= 1) {
      const kScore = scaleLowerBetter(kRate, K_RATE_BEST, K_RATE_WORST);
      if (kScore != null) parts.push({ value: kScore, weight: MATCHUP_COMPONENT_WEIGHTS.kRate });
    }
  }

  if (parts.length === 0) return null;

  let weightSum = 0;
  let weighted = 0;
  for (const part of parts) {
    if (!Number.isFinite(part.value) || !Number.isFinite(part.weight) || part.weight <= 0) continue;
    weightSum += part.weight;
    weighted += part.value * part.weight;
  }
  if (weightSum <= 0) return null;

  const rawComposite = weighted / weightSum;
  if (!Number.isFinite(rawComposite)) return null;

  const sampleWeight = ab / (ab + HAND_FREQ_SAMPLE_K);
  const blended = sampleWeight * rawComposite + (1 - sampleWeight) * 50;
  if (!Number.isFinite(blended)) return null;
  return round1(clamp(blended, 0, 100));
}

/**
 * @deprecated Prefer scoreHandednessMatchup. Kept for older tests that pass AB/HR only.
 * Maps minimal AB/HR inputs into the matchup scorer (ISO/K omitted → renormalized).
 */
export function scoreHandednessFrequency({ atBats, homeRuns, abPerHr }) {
  return scoreHandednessMatchup({
    atBats,
    homeRuns,
    plateAppearances: null,
    battingAverage: null,
    sluggingPercentage: null,
    strikeouts: null,
    // abPerHr ignored — derived from AB/HR when present
  });
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
    // Handedness Matchup Score (0–100); field name retained for payload compatibility.
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
