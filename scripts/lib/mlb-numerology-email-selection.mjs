export const NUMEROLOGY_EMAIL_SCORE_THRESHOLD = 65;
export const NUMEROLOGY_EMAIL_MINIMUM_PLAYS = 3;

function normalizeIdentityPart(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function numerologyEmailPlayerKey(play) {
  const team = normalizeIdentityPart(play?.team);
  const playerId = normalizeIdentityPart(play?.playerId);
  if (playerId) return `id:${playerId}|team:${team}`;
  return `name:${normalizeIdentityPart(play?.player)}|team:${team}`;
}

/**
 * Email-only selection policy:
 * - include every ranked play scoring strictly above 65;
 * - when fewer than three clear 65, append the next-ranked distinct players
 *   until the email has three (or the source is exhausted).
 *
 * The source card's `plays` array is already sorted by the numerology ranking
 * comparator, so this helper preserves the model's established order and does
 * not alter the underlying board, archives, or performance tracking.
 */
export function selectNumerologyEmailPlays(card, {
  threshold = NUMEROLOGY_EMAIL_SCORE_THRESHOLD,
  minimumPlays = NUMEROLOGY_EMAIL_MINIMUM_PLAYS,
} = {}) {
  const ranked = Array.isArray(card?.plays) ? card.plays : [];
  const seenRanked = new Set();
  const distinctRanked = ranked.filter((play) => {
    if (!play?.player || !play?.team || !Number.isFinite(Number(play?.numerologyScore))) return false;
    const key = numerologyEmailPlayerKey(play);
    if (seenRanked.has(key)) return false;
    seenRanked.add(key);
    return true;
  });
  const aboveThreshold = distinctRanked.filter((play) => Number(play.numerologyScore) > threshold);
  const selectedKeys = new Set(aboveThreshold.map(numerologyEmailPlayerKey));

  if (selectedKeys.size < minimumPlays) {
    for (const play of distinctRanked) {
      selectedKeys.add(numerologyEmailPlayerKey(play));
      if (selectedKeys.size >= minimumPlays) break;
    }
  }

  const selected = distinctRanked.filter((play) => selectedKeys.has(numerologyEmailPlayerKey(play)));

  const topPlay = selected[0] ? { ...selected[0], isTopPlay: true } : null;
  const topKey = topPlay ? numerologyEmailPlayerKey(topPlay) : null;

  const emailSelectedPlays = selected.map((play) => ({
    ...play,
    isTopPlay: numerologyEmailPlayerKey(play) === topKey,
  }));

  return {
    ...card,
    topPlay,
    emailSelectedPlays,
    emailSelectionPolicy: {
      threshold,
      minimumPlays,
      mode: aboveThreshold.length >= minimumPlays ? "all-above-threshold" : "top-minimum",
      aboveThresholdCount: aboveThreshold.length,
      selectedCount: emailSelectedPlays.length,
    },
  };
}

/**
 * Confirmed-lineup selection policy: the email's selected plays are exactly
 * the shared delivery artifact's rows (already confirmed-lineup-only,
 * already ranked, already capped to 1-5 by mlb-numerology-x-selection-core
 * -- see plan-mlb-numerology-delivery.mjs). This does NOT independently
 * re-derive a selection from `card` the way selectNumerologyEmailPlays does
 * -- it exists specifically so email and X can never diverge on which
 * players qualify (both read the same frozen artifact).
 *
 * Throws if the artifact's slate date doesn't match the card's -- delivering
 * against a stale/mismatched artifact must fail loudly, never silently.
 */
export function selectNumerologyEmailPlaysFromArtifact(card, artifact) {
  if (!artifact || !Array.isArray(artifact.rows)) {
    throw new Error("Numerology delivery artifact is missing or malformed (no rows[]).");
  }
  if (artifact.slateDate !== card?.date) {
    throw new Error(`Numerology delivery artifact slate date ${artifact.slateDate} does not match card date ${card?.date}.`);
  }

  const emailSelectedPlays = artifact.rows.map((row, index) => ({ ...row, isTopPlay: index === 0 }));
  const topPlay = emailSelectedPlays[0] ?? null;

  return {
    ...card,
    topPlay,
    emailSelectedPlays,
    emailSelectionPolicy: {
      mode: "confirmed-lineup-artifact",
      selectedCount: emailSelectedPlays.length,
      artifactSelectionStatus: artifact.selectionStatus ?? null,
      artifactConfirmationAsOf: artifact.confirmationAsOf ?? null,
    },
  };
}
