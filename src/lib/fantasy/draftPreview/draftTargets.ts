/**
 * Phase 2D personal target board: a manual, client-side-only watchlist of
 * "players I like for round N". Not a calculated ranking -- every entry
 * here comes from an explicit user action (the Target star), and manual
 * within-round order is a simple move-up/move-down list, never a computed
 * score. Nothing here reads or writes `DraftPreviewRow` source data, and
 * nothing here touches Sleeper Rank, JKB Rank, PAR, or Model Rank.
 *
 * Player identity: Sleeper Rank. The board has no canonical player id for
 * unresolved rows (Sleeper supplies no stable id at all), and Sleeper Rank
 * is already this app's deterministic, unique, 1-267 row identifier (the
 * same key `myDraft.ts` uses for `isPlayerDrafted`), so it's reused here
 * rather than inventing a second identity scheme.
 */

export const DRAFT_TARGETS_STORAGE_KEY = "jkb-fantasy-draft-targets-v1";
export const DRAFT_TARGETS_SCHEMA_VERSION = 1 as const;

/** Round number (1-based, stringified) -> ordered list of Sleeper Ranks, best-first. */
export type DraftTargetsState = {
  version: typeof DRAFT_TARGETS_SCHEMA_VERSION;
  rounds: Readonly<Record<string, readonly number[]>>;
};

export function createEmptyDraftTargetsState(): DraftTargetsState {
  return { version: DRAFT_TARGETS_SCHEMA_VERSION, rounds: {} };
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/** Round keys are always normalized to their canonical string form (e.g. round 3 -> "3"). */
function roundKey(round: number): string {
  return String(round);
}

/**
 * Adds `sleeperRank` to `round`'s target list (appended at the end -- lowest
 * priority within the round until manually reordered). A no-op, immutable
 * copy is returned if the player is already targeted in that round --
 * duplicates within one round are never created.
 */
export function addTarget(state: DraftTargetsState, round: number, sleeperRank: number): DraftTargetsState {
  const key = roundKey(round);
  const existing = state.rounds[key] ?? [];
  if (existing.includes(sleeperRank)) return state;
  return { ...state, rounds: { ...state.rounds, [key]: [...existing, sleeperRank] } };
}

/** Removes `sleeperRank` from `round`'s target list only. Other rounds' target lists (for the same or other players) are untouched. */
export function removeTarget(state: DraftTargetsState, round: number, sleeperRank: number): DraftTargetsState {
  const key = roundKey(round);
  const existing = state.rounds[key];
  if (!existing || !existing.includes(sleeperRank)) return state;
  const next = existing.filter((rank) => rank !== sleeperRank);
  const rounds = { ...state.rounds };
  if (next.length > 0) rounds[key] = next;
  else delete rounds[key];
  return { ...state, rounds };
}

/** Removes `sleeperRank` from every round's target list (the player's "Clear all targets" action). */
export function removePlayerFromAllTargets(state: DraftTargetsState, sleeperRank: number): DraftTargetsState {
  const rounds: Record<string, readonly number[]> = {};
  let changed = false;
  for (const [key, ranks] of Object.entries(state.rounds)) {
    if (ranks.includes(sleeperRank)) {
      changed = true;
      const next = ranks.filter((rank) => rank !== sleeperRank);
      if (next.length > 0) rounds[key] = next;
    } else {
      rounds[key] = ranks;
    }
  }
  return changed ? { ...state, rounds } : state;
}

function swapAdjacent(state: DraftTargetsState, round: number, sleeperRank: number, direction: -1 | 1): DraftTargetsState {
  const key = roundKey(round);
  const existing = state.rounds[key];
  if (!existing) return state;
  const index = existing.indexOf(sleeperRank);
  const swapWith = index + direction;
  if (index === -1 || swapWith < 0 || swapWith >= existing.length) return state;
  const next = [...existing];
  [next[index], next[swapWith]] = [next[swapWith], next[index]];
  return { ...state, rounds: { ...state.rounds, [key]: next } };
}

/** Moves `sleeperRank` one position earlier (higher priority) within `round`'s manual order. A no-op if already first or not targeted in that round. */
export function moveTargetUp(state: DraftTargetsState, round: number, sleeperRank: number): DraftTargetsState {
  return swapAdjacent(state, round, sleeperRank, -1);
}

/** Moves `sleeperRank` one position later (lower priority) within `round`'s manual order. A no-op if already last or not targeted in that round. */
export function moveTargetDown(state: DraftTargetsState, round: number, sleeperRank: number): DraftTargetsState {
  return swapAdjacent(state, round, sleeperRank, 1);
}

/** Sleeper Ranks targeted for `round`, in saved manual order. Empty when nothing is saved for that round. */
export function getTargetsForRound(state: DraftTargetsState, round: number): readonly number[] {
  return state.rounds[roundKey(round)] ?? [];
}

/** Every round `sleeperRank` is targeted in, ascending. Empty when the player has no targets. */
export function getRoundsForPlayer(state: DraftTargetsState, sleeperRank: number): readonly number[] {
  const rounds: number[] = [];
  for (const [key, ranks] of Object.entries(state.rounds)) {
    if (ranks.includes(sleeperRank)) rounds.push(Number(key));
  }
  return rounds.sort((a, b) => a - b);
}

/** Total number of targeted (round, player) memberships across every round -- used for "Rn (count)" chips. */
export function countTargetsByRound(state: DraftTargetsState): ReadonlyMap<number, number> {
  const counts = new Map<number, number>();
  for (const [key, ranks] of Object.entries(state.rounds)) {
    if (ranks.length > 0) counts.set(Number(key), ranks.length);
  }
  return counts;
}

/**
 * Validates and normalizes an arbitrary parsed JSON value into a
 * `DraftTargetsState`. Fails closed to an empty state on anything
 * malformed or on a schema version this build doesn't recognize --
 * never throws, never guesses at a partially-valid shape.
 */
export function parseDraftTargetsState(value: unknown): DraftTargetsState {
  if (typeof value !== "object" || value === null) return createEmptyDraftTargetsState();
  const candidate = value as { version?: unknown; rounds?: unknown };
  if (candidate.version !== DRAFT_TARGETS_SCHEMA_VERSION) return createEmptyDraftTargetsState();
  if (typeof candidate.rounds !== "object" || candidate.rounds === null || Array.isArray(candidate.rounds)) {
    return createEmptyDraftTargetsState();
  }

  const rounds: Record<string, readonly number[]> = {};
  for (const [key, rawRanks] of Object.entries(candidate.rounds as Record<string, unknown>)) {
    const round = Number(key);
    if (!isPositiveInteger(round)) continue;
    if (!Array.isArray(rawRanks)) continue;
    const seen = new Set<number>();
    const ranks: number[] = [];
    for (const rawRank of rawRanks) {
      if (!isPositiveInteger(rawRank) || seen.has(rawRank)) continue;
      seen.add(rawRank);
      ranks.push(rawRank);
    }
    if (ranks.length > 0) rounds[roundKey(round)] = ranks;
  }
  return { version: DRAFT_TARGETS_SCHEMA_VERSION, rounds };
}

/**
 * Loads the saved target board from `localStorage`. Never throws: missing
 * storage (SSR/private browsing), malformed JSON, a wrong/missing schema
 * version, or any other unexpected shape all fail closed to an empty
 * board rather than crashing the page.
 */
export function loadDraftTargetsState(): DraftTargetsState {
  if (typeof window === "undefined") return createEmptyDraftTargetsState();
  try {
    const raw = window.localStorage.getItem(DRAFT_TARGETS_STORAGE_KEY);
    if (!raw) return createEmptyDraftTargetsState();
    return parseDraftTargetsState(JSON.parse(raw));
  } catch {
    return createEmptyDraftTargetsState();
  }
}

/** Persists the target board to `localStorage`. Silently no-ops when storage is unavailable (SSR, private-browsing quota errors, etc.) -- never crashes the page. */
export function saveDraftTargetsState(state: DraftTargetsState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DRAFT_TARGETS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable/quota exceeded -- targets simply won't persist this session.
  }
}
