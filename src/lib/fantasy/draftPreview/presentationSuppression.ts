/**
 * Typed loader for the generated presentation-suppression artifact. Produced
 * by `scripts/audit-fantasy-draft-preview-identity.ts` (see
 * `docs/fantasy-draft-preview-identity-audit-2026.md`) -- this module never
 * computes identity itself, only exposes the already-reviewed result.
 *
 * Two kinds of row this drives:
 *
 * 1. Duplicate groups: 2+ raw Sleeper rows confirmed (exact normalized name
 *    + single unambiguous canonical nflverse roster match, identical for
 *    every row in the group) to be the SAME real player. The lowest
 *    Sleeper Rank in the group is retained as the one rendered/draftable
 *    row (with its own Sleeper projections, untouched); every other rank in
 *    the group is suppressed from the board. A duplicate name group is only
 *    ever collapsed when every row resolves to the identical canonical
 *    identity -- never when uncertain.
 * 2. Malformed rows: a source row confirmed not to represent a real
 *    player (e.g. a team name in the player column with a fabricated stat
 *    line). Suppressed outright, never a draftable row.
 *
 * Every raw Sleeper row stays in `DRAFT_PREVIEW_ROWS_2026` and in the
 * Sleeper source artifact regardless -- this module only flags which ranks
 * a rendered/draftable board must exclude.
 */
import presentationSuppressionArtifact from "../../../../data/fantasy/draft-preview/2026-presentation-suppression.json";

export type DuplicatePlayerGroup = {
  canonicalPlayer: string;
  canonicalTeam: string;
  canonicalPosition: string;
  sourceRanks: readonly number[];
  retainedRank: number;
  suppressedRanks: readonly number[];
};

export type MalformedRow = {
  sleeperRank: number;
  player: string;
  reason: string;
};

type PresentationSuppressionArtifact = {
  _meta: {
    schemaVersion: string;
    source: string;
    generatedBy: string;
    duplicateGroupCount: number;
    suppressedDuplicateRankCount: number;
    malformedRankCount: number;
  };
  duplicateGroups: readonly DuplicatePlayerGroup[];
  suppressedDuplicateRanks: readonly number[];
  malformedRanks: readonly MalformedRow[];
};

const ARTIFACT = presentationSuppressionArtifact as PresentationSuppressionArtifact;

export const DRAFT_PREVIEW_DUPLICATE_GROUPS: readonly DuplicatePlayerGroup[] = ARTIFACT.duplicateGroups;

export const SUPPRESSED_DUPLICATE_RANKS: ReadonlySet<number> = new Set(ARTIFACT.suppressedDuplicateRanks);

export const MALFORMED_RANKS: ReadonlySet<number> = new Set(ARTIFACT.malformedRanks.map((row) => row.sleeperRank));

export const DRAFT_PREVIEW_MALFORMED_ROWS: readonly MalformedRow[] = ARTIFACT.malformedRanks;

/** Canonical team/position for the RETAINED rank of a duplicate group, or `undefined` when this rank doesn't retain a group. */
export const DUPLICATE_GROUP_BY_RETAINED_RANK: ReadonlyMap<number, DuplicatePlayerGroup> = new Map(
  DRAFT_PREVIEW_DUPLICATE_GROUPS.map((group) => [group.retainedRank, group]),
);

export function isSuppressedFromBoard(sleeperRank: number): boolean {
  return SUPPRESSED_DUPLICATE_RANKS.has(sleeperRank) || MALFORMED_RANKS.has(sleeperRank);
}
