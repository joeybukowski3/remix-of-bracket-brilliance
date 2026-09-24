import type { PlayerMatch } from "./sleeper";

export function eligibleForSlot(slot: string, position: string | undefined): boolean {
  if (!position) return false;
  if (slot === position) return true;
  if (slot === "FLEX") return ["RB", "WR", "TE"].includes(position);
  if (slot === "SUPER_FLEX") return ["QB", "RB", "WR", "TE"].includes(position);
  if (slot === "REC_FLEX") return ["WR", "TE"].includes(position);
  if (slot === "WRRB_FLEX") return ["WR", "RB"].includes(position);
  if (slot === "IDP_FLEX") return ["DL", "LB", "DB"].includes(position);
  return false;
}

export function optimizeLineup(slots: readonly string[], players: readonly PlayerMatch[], current: readonly string[], excludedIds: ReadonlySet<string> = new Set()): (string | null)[] {
  const available = players.filter((player) => !excludedIds.has(player.sleeperId));
  const supported = slots.map((slot, index) => ({ slot, index })).filter(({ slot }) => !["BN", "IR", "TAXI"].includes(slot));
  const candidateSlots = supported.filter(({ slot }) => available.some((player) => player.jkb && eligibleForSlot(slot, player.sleeper?.position)));
  const fixed = new Map(supported.filter(({ index }) => !candidateSlots.some((candidate) => candidate.index === index)).map(({ index }) => [index, current[index] && current[index] !== "0" ? current[index] : null]));
  const ordered = [...candidateSlots].sort((a, b) =>
    available.filter((p) => p.jkb && eligibleForSlot(a.slot, p.sleeper?.position)).length - available.filter((p) => p.jkb && eligibleForSlot(b.slot, p.sleeper?.position)).length || a.index - b.index);
  const eligible = available.filter((player) => player.jkb && ![...fixed.values()].includes(player.sleeperId));
  const options = ordered.map(({ slot }) => eligible.map((player, index) => ({ player, index })).filter(({ player }) => eligibleForSlot(slot, player.sleeper?.position)));
  type Solution = { score: number; retained: number; picks: (string | null)[] };
  const memo = new Map<string, Solution>();
  const solve = (depth: number, used: bigint): Solution => {
    if (depth === ordered.length) return { score: 0, retained: 0, picks: [] };
    const key = `${depth}:${used}`;
    const cached = memo.get(key);
    if (cached) return cached;
    const empty = solve(depth + 1, used);
    let best: Solution = { score: empty.score, retained: empty.retained, picks: [null, ...empty.picks] };
    for (const { player, index } of options[depth]) {
      const bit = 1n << BigInt(index);
      if (used & bit) continue;
      const next = solve(depth + 1, used | bit);
      const score = player.jkb!.projectedFantasyPoints + next.score;
      const retained = next.retained + Number(current[ordered[depth].index] === player.sleeperId);
      if (score > best.score || (score === best.score && retained > best.retained)) best = { score, retained, picks: [player.sleeperId, ...next.picks] };
    }
    memo.set(key, best);
    return best;
  };
  const picks = solve(0, 0n).picks;
  const chosen = new Map(ordered.map(({ index }, offset) => [index, picks[offset]]));
  const result = slots.map((_, index) => fixed.get(index) ?? chosen.get(index) ?? null);
  const used = new Set(result.filter((id): id is string => !!id));
  // A slot can remain empty when there are fewer projected players than starts.
  // Fill it with an eligible unprojected player without changing the maximum
  // projected score; keep the current starter first when possible.
  for (const { slot, index } of supported) {
    if (result[index]) continue;
    const currentPlayer = available.find((player) => player.sleeperId === current[index] && !player.jkb && !used.has(player.sleeperId) && eligibleForSlot(slot, player.sleeper?.position));
    const filler = currentPlayer ?? available.find((player) => !player.jkb && !used.has(player.sleeperId) && eligibleForSlot(slot, player.sleeper?.position));
    if (filler) { result[index] = filler.sleeperId; used.add(filler.sleeperId); }
  }
  return result;
}

export function filterAndSortPool(players: readonly PlayerMatch[], position: string): PlayerMatch[] {
  return players.filter((player) => player.jkb && (position === "FLEX" ? ["RB", "WR", "TE"].includes(player.jkb.position) : player.jkb.position === position))
    .sort((a, b) => (b.jkb?.projectedFantasyPoints ?? -Infinity) - (a.jkb?.projectedFantasyPoints ?? -Infinity) || a.sleeperId.localeCompare(b.sleeperId));
}

export function lineupDifference(current: readonly string[], optimal: readonly (string | null)[], slots: readonly string[]) {
  const active = slots.map((slot, index) => index).filter((index) => !["BN", "IR", "TAXI"].includes(slots[index]));
  const currentSet = new Set(active.map((index) => current[index]).filter((id) => id && id !== "0"));
  const optimalSet = new Set(active.map((index) => optimal[index]).filter(Boolean));
  return [...optimalSet].filter((id) => !currentSet.has(id)).length;
}
