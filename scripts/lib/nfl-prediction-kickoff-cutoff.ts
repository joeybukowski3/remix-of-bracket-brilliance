/**
 * Splits prediction captures into those made before their game's kickoff and
 * those made at/after it. Production archive snapshots must precede kickoff
 * (validatePredictionSnapshot throws otherwise), so callers partition BEFORE
 * finalizing snapshots: a slate whose Thursday game has already started must
 * still archive its remaining games instead of aborting the whole run.
 *
 * Unparseable timestamps are kept in `preKickoff` on purpose so snapshot
 * validation still fails loudly on malformed data rather than silently
 * dropping the row.
 */
export type KickoffTiming = { predictionTimestamp: string; kickoffUtc: string };

export function partitionByKickoff<T>(
  items: readonly T[],
  timing: (item: T) => KickoffTiming,
): { preKickoff: T[]; postKickoff: T[] } {
  const preKickoff: T[] = [];
  const postKickoff: T[] = [];
  for (const item of items) {
    const { predictionTimestamp, kickoffUtc } = timing(item);
    const predictedAt = Date.parse(predictionTimestamp);
    const kickoff = Date.parse(kickoffUtc);
    if (Number.isFinite(predictedAt) && Number.isFinite(kickoff) && predictedAt >= kickoff) postKickoff.push(item);
    else preKickoff.push(item);
  }
  return { preKickoff, postKickoff };
}
