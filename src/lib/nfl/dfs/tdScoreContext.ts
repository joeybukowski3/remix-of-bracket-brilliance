// TD Score column join for the DFS board.
//
// Reuses the canonical Touchdown Preview artifact's JKB TD Score exactly --
// never recomputes the model. Join is by stable identity (playerId + gameId),
// gated on the artifact matching the DFS slate's own season/week so a stale
// or wrong-week artifact can never silently attach to this week's board.

import type { TouchdownPreviewArtifact } from "@/lib/nfl/touchdown-preview/types";

export type DfsTdScoreEntry = {
  jkbTdScore: number | null;
  scoreRank: number | null;
  scorePoolSize: number;
};

export type DfsTdScoreLookup = ReadonlyMap<string, DfsTdScoreEntry>;

function tdScoreKey(playerId: string, gameId: string): string {
  return `${playerId}:${gameId}`;
}

/**
 * Builds the playerId+gameId -> TD Score lookup from the touchdown-preview
 * artifact's `defaultWindow` -- the same window the TD Scorer page shows by
 * default. Returns an empty map (not a stale one) when the artifact's own
 * season/week does not match the DFS slate being displayed.
 */
export function buildDfsTdScoreContext(
  artifact: TouchdownPreviewArtifact | null | undefined,
  season: number,
  week: number,
): DfsTdScoreLookup {
  const map = new Map<string, DfsTdScoreEntry>();
  if (!artifact || artifact.season !== season || artifact.week !== week) return map;
  for (const player of artifact.players) {
    const window = player.windows[artifact.defaultWindow];
    if (!window) continue;
    map.set(tdScoreKey(player.playerId, player.gameId), {
      jkbTdScore: window.jkbTdScore,
      scoreRank: window.scoreRank,
      scorePoolSize: window.scorePoolSize,
    });
  }
  return map;
}

/** `null` when either identity key is missing or the join has no match (wrong week, absent player, etc). */
export function resolveDfsTdScore(lookup: DfsTdScoreLookup, playerId: string | null | undefined, gameId: string | null | undefined): DfsTdScoreEntry | null {
  if (!playerId || !gameId) return null;
  return lookup.get(tdScoreKey(playerId, gameId)) ?? null;
}
