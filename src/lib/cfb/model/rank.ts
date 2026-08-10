/**
 * Generic, deterministic rank generation from a rating value.
 *
 * Ranks are derived FROM ratings — nothing should ever hand-maintain a rank
 * independently of its rating (see repo requirement: jkbRank must be generated,
 * not manually authored, going forward).
 *
 * Tie handling: ties are broken by teamId ascending. This keeps every rank
 * 1..N unique and fully deterministic, which is required for a stable Top 25
 * slice and for SOS rank #1-is-hardest semantics. (Standard "competition
 * ranking," where ties share a rank and the next rank skips, was considered
 * but rejected: it would let genuinely-tied SOS or power values collide at
 * rank 25/26 on the Top 25 boundary in an order-dependent way.)
 */

export type CfbRankableItem = { teamId: string; value: number | null };

/**
 * Ranks items by value. direction "desc" (default) gives rank 1 to the
 * highest value — used for both "higher = better" ratings and "higher = harder"
 * SOS ratings, since both conventions want their best/most-extreme value first.
 * Items with a null value receive rank null and sort after all ranked items.
 */
export function generateRanks(
  items: ReadonlyArray<CfbRankableItem>,
  direction: "desc" | "asc" = "desc",
): Map<string, number | null> {
  const ranked = items.filter((i) => i.value !== null) as Array<{ teamId: string; value: number }>;
  const unranked = items.filter((i) => i.value === null);

  ranked.sort((a, b) => {
    if (a.value !== b.value) {
      return direction === "desc" ? b.value - a.value : a.value - b.value;
    }
    return a.teamId.localeCompare(b.teamId);
  });

  const result = new Map<string, number | null>();
  ranked.forEach((item, index) => {
    result.set(item.teamId, index + 1);
  });
  for (const item of unranked) {
    result.set(item.teamId, null);
  }
  return result;
}
