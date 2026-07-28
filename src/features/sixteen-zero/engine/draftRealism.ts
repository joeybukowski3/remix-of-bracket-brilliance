/**
 * Latest reasonable overall pick for a player at a given consensus overall
 * rank, expressed as ascending, non-overlapping rank buckets. Tight near the
 * top (elite players should never fall far), gradually widening lower in
 * the board. Ranks beyond the last bucket have no fall-limit guardrail.
 */
const LATEST_PICK_BUCKETS: ReadonlyArray<{ maxRank: number; latestPick: number }> = [
  { maxRank: 2, latestPick: 8 },
  { maxRank: 6, latestPick: 12 },
  { maxRank: 12, latestPick: 22 },
  { maxRank: 20, latestPick: 35 },
  { maxRank: 30, latestPick: 50 },
  { maxRank: 45, latestPick: 70 },
  { maxRank: 60, latestPick: 90 },
  { maxRank: 80, latestPick: 115 },
];

/** How many picks out from the hard deadline soft pressure begins ramping up. */
const SOFT_PRESSURE_WINDOW = 6;

/** Additive score bonus (outside the normal weighted-sum proportions) applied at full urgency. */
export const URGENCY_SCORE_BOOST = 0.5;

/**
 * The latest overall pick at which a player of this consensus overall rank
 * should still be reasonably available, or null if no guardrail applies
 * (rank falls outside the modeled top of the board).
 */
export function getLatestReasonablePick(overallRank: number): number | null {
  const bucket = LATEST_PICK_BUCKETS.find((candidate) => overallRank <= candidate.maxRank);
  return bucket ? bucket.latestPick : null;
}

/**
 * 0-1 soft-pressure signal that ramps up as the current pick approaches a
 * player's latest reasonable pick, reaching 1 once the deadline is reached
 * or passed. Returns 0 for players with no guardrail or picks still far
 * from the deadline, preserving normal CPU strategy variety until it matters.
 */
export function getDraftUrgency(overallRank: number, currentPick: number): number {
  const latestPick = getLatestReasonablePick(overallRank);
  if (latestPick === null) return 0;
  if (currentPick >= latestPick) return 1;
  const picksRemaining = latestPick - currentPick;
  if (picksRemaining > SOFT_PRESSURE_WINDOW) return 0;
  return (SOFT_PRESSURE_WINDOW - picksRemaining) / SOFT_PRESSURE_WINDOW;
}

/** True once a player has reached (or passed) their hard fall-limit pick. */
export function isOverdue(overallRank: number, currentPick: number): boolean {
  const latestPick = getLatestReasonablePick(overallRank);
  return latestPick !== null && currentPick >= latestPick;
}
