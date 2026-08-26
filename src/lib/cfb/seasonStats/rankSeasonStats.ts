export type RankDirection = "higher-is-better" | "lower-is-better";

/**
 * Metric -> rank direction contract for every ranked field in CfbSeasonStats.
 * Used both by the artifact builder (to compute ranks) and by any future
 * presentation layer (to know which direction "better" points).
 */
export const CFB_SEASON_STAT_RANK_DIRECTIONS = Object.freeze({
  pointsPerGame: "higher-is-better",
  yardsPerPlay: "higher-is-better",
  pointsPerPlay: "higher-is-better",
  rushYardsPerGame: "higher-is-better",
  yardsPerRush: "higher-is-better",
  passYardsPerGame: "higher-is-better",
  yardsPerPass: "higher-is-better",
  thirdDownPct: "higher-is-better",
  completionPct: "higher-is-better",
  pointsAllowedPerGame: "lower-is-better",
  yardsPerPlayAllowed: "lower-is-better",
  opponentPointsPerPlay: "lower-is-better",
  rushYardsAllowedPerGame: "lower-is-better",
  yardsPerRushAllowed: "lower-is-better",
  passYardsAllowedPerGame: "lower-is-better",
  yardsPerPassAllowed: "lower-is-better",
  opponentThirdDownPct: "lower-is-better",
  opponentCompletionPct: "lower-is-better",
} as const satisfies Record<string, RankDirection>);

export type CfbRankedStatMetric = keyof typeof CFB_SEASON_STAT_RANK_DIRECTIONS;

/**
 * Competition ranking (1, 2, 2, 4 — a tie consumes the ranks it spans, the
 * next distinct value resumes at its true position). Teams with a null value
 * are excluded entirely (unranked), never assigned a trailing rank.
 *
 * Deterministic: equal values are grouped by value only, so tie membership
 * never depends on input order; the returned map is independent of the order
 * `entries` was supplied in.
 */
export function computeCompetitionRanks(
  entries: ReadonlyArray<{ teamId: string; value: number | null }>,
  direction: RankDirection,
): ReadonlyMap<string, number> {
  const ranked = entries.filter(
    (entry): entry is { teamId: string; value: number } => entry.value !== null && Number.isFinite(entry.value),
  );
  const sorted = [...ranked].sort((a, b) =>
    direction === "higher-is-better" ? b.value - a.value : a.value - b.value,
  );

  const result = new Map<string, number>();
  let position = 1;
  let index = 0;
  while (index < sorted.length) {
    const value = sorted[index].value;
    let groupEnd = index;
    while (groupEnd < sorted.length && sorted[groupEnd].value === value) groupEnd += 1;
    for (let i = index; i < groupEnd; i += 1) result.set(sorted[i].teamId, position);
    position += groupEnd - index;
    index = groupEnd;
  }
  return result;
}
