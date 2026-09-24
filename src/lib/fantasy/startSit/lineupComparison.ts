import { eligibleForSlot } from "./lineup";
import type { PlayerMatch } from "./sleeper";

export type LineupSwap = { currentId: string; optimalId: string; currentPoints: number; optimalPoints: number; improvementRatio: number; meaningfulUpgrade: boolean };

/** Compare players entering/leaving the lineup, never corresponding display rows.
 * A retained player moved between RB/FLEX is not a swap. The 10% threshold uses
 * the lower projection as denominator and only marks a positive improvement.
 */
export function compareLineupSwaps(
  slots: readonly string[], current: readonly (string | null)[], optimal: readonly (string | null)[], players: ReadonlyMap<string, PlayerMatch>,
): LineupSwap[] {
  const active = slots.map((slot, index) => ({ slot, index })).filter(({ slot }) => !["BN", "IR", "TAXI"].includes(slot));
  const currentSet = new Set(active.map(({ index }) => current[index]).filter((id): id is string => !!id && id !== "0"));
  const optimalSet = new Set(active.map(({ index }) => optimal[index]).filter((id): id is string => !!id && id !== "0"));
  const leaving = [...currentSet].filter((id) => !optimalSet.has(id) && players.get(id)?.jkb);
  const entering = [...optimalSet].filter((id) => !currentSet.has(id) && players.get(id)?.jkb);
  const result: LineupSwap[] = [];
  for (const optimalId of entering) {
    const incoming = players.get(optimalId)!;
    const matching = leaving.map((currentId) => {
      const outgoing = players.get(currentId)!;
      const samePosition = outgoing.jkb!.position === incoming.jkb!.position;
      const sharedSlot = active.some(({ slot }) => eligibleForSlot(slot, outgoing.jkb!.position) && eligibleForSlot(slot, incoming.jkb!.position));
      return { currentId, samePosition, sharedSlot, distance: Math.abs(outgoing.jkb!.projectedFantasyPoints - incoming.jkb!.projectedFantasyPoints) };
    }).filter((candidate) => candidate.sharedSlot)
      .sort((a, b) => Number(b.samePosition) - Number(a.samePosition) || a.distance - b.distance);
    const selected = matching[0];
    if (!selected) continue;
    leaving.splice(leaving.indexOf(selected.currentId), 1);
    const currentPoints = players.get(selected.currentId)!.jkb!.projectedFantasyPoints;
    const optimalPoints = incoming.jkb!.projectedFantasyPoints;
    const lower = Math.min(currentPoints, optimalPoints);
    const improvementRatio = optimalPoints > currentPoints ? (lower > 0 ? (optimalPoints - currentPoints) / lower : Infinity) : 0;
    result.push({ currentId: selected.currentId, optimalId, currentPoints, optimalPoints, improvementRatio, meaningfulUpgrade: improvementRatio > 0.1 });
  }
  return result;
}
