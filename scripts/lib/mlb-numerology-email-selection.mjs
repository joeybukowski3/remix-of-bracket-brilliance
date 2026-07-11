export const NUMEROLOGY_EMAIL_SCORE_THRESHOLD = 65;
export const NUMEROLOGY_EMAIL_MINIMUM_PLAYS = 3;

/**
 * Email-only selection policy:
 * - include every ranked play scoring strictly above 65;
 * - when fewer than three clear 65, use the top three ranked plays instead.
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
  const aboveThreshold = ranked.filter((play) => Number(play?.numerologyScore) > threshold);
  const selected = aboveThreshold.length >= minimumPlays
    ? aboveThreshold
    : ranked.slice(0, minimumPlays);

  const topPlay = selected[0] ? { ...selected[0], isTopPlay: true } : null;
  const topKey = topPlay
    ? `${topPlay.playerId ?? topPlay.player}|${topPlay.team ?? ""}`
    : null;

  const plays = selected.map((play) => ({
    ...play,
    isTopPlay: `${play.playerId ?? play.player}|${play.team ?? ""}` === topKey,
  }));

  return {
    ...card,
    scoreThreshold: threshold,
    topPlay,
    allQualifiedPlaysOver50: plays,
    emailSelectionPolicy: {
      threshold,
      minimumPlays,
      mode: aboveThreshold.length >= minimumPlays ? "all-above-threshold" : "top-minimum",
      aboveThresholdCount: aboveThreshold.length,
      selectedCount: plays.length,
    },
  };
}
