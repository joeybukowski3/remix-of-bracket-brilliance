/**
 * Phase 2C roster-slot position: a wider scope than the JKB-only
 * `canonicalPosition` (QB/RB/WR/TE, used for the JKB ranking/PAR join and
 * left completely untouched by this module). This adds K/DST so the
 * Starting Roster table can carry a K and DST slot, and applies the
 * hand-reviewed identity-audit corrections (`identityCorrections.ts`) and
 * the confirmed duplicate-group canonical identity
 * (`presentationSuppression.ts`) to DISPLAY team/position only -- the raw
 * Sleeper `team`/`sourcePosition` fields on `DraftPreviewRow` are never
 * rewritten.
 */
import type { FantasyPosition } from "@/lib/fantasy/rankings";
import { DRAFT_PREVIEW_IDENTITY_CORRECTIONS_BY_RANK } from "@/lib/fantasy/draftPreview/identityCorrections";
import { DUPLICATE_GROUP_BY_RETAINED_RANK } from "@/lib/fantasy/draftPreview/presentationSuppression";

export type RosterPosition = FantasyPosition | "K" | "DST";

const ROSTER_POSITIONS = new Set<string>(["QB", "RB", "WR", "TE", "K", "DST"]);

/** Same source POS vocabulary as `identity.ts`'s `SOURCE_POSITION_TO_CANONICAL`, extended with K/DEF instead of dropping them. */
const SOURCE_POSITION_TO_ROSTER_POSITION: Readonly<Record<string, RosterPosition | null>> = {
  QB: "QB",
  RB: "RB",
  WR: "WR",
  TE: "TE",
  DEF: "DST",
  K: "K",
  "DB/WR": "WR",
};

/**
 * The roster-slot position to display/draft-by for this Sleeper Rank, in
 * priority order:
 * 1. an audited B/C/D stale-position correction for this exact rank
 * 2. the confirmed canonical position for a duplicate group this rank
 *    retains (the group's own resolved identity, not a per-row correction)
 * 3. the source POS mapped through the table above
 * `null` only when none of the above resolve a roster-slot position at all.
 */
export function computeRosterPosition(sleeperRank: number, sourcePosition: string): RosterPosition | null {
  const correction = DRAFT_PREVIEW_IDENTITY_CORRECTIONS_BY_RANK.get(sleeperRank);
  if (correction?.canonicalPosition && ROSTER_POSITIONS.has(correction.canonicalPosition)) {
    return correction.canonicalPosition as RosterPosition;
  }
  const duplicateGroup = DUPLICATE_GROUP_BY_RETAINED_RANK.get(sleeperRank);
  if (duplicateGroup && ROSTER_POSITIONS.has(duplicateGroup.canonicalPosition)) {
    return duplicateGroup.canonicalPosition as RosterPosition;
  }
  return SOURCE_POSITION_TO_ROSTER_POSITION[sourcePosition] ?? null;
}

/** The team to display for this Sleeper Rank: an audited correction, then a retained duplicate group's canonical team, then the raw source team. */
export function computeDisplayTeam(sleeperRank: number, sourceTeam: string | null): string | null {
  const correction = DRAFT_PREVIEW_IDENTITY_CORRECTIONS_BY_RANK.get(sleeperRank);
  if (correction?.canonicalTeam) return correction.canonicalTeam;
  const duplicateGroup = DUPLICATE_GROUP_BY_RETAINED_RANK.get(sleeperRank);
  if (duplicateGroup) return duplicateGroup.canonicalTeam;
  return sourceTeam;
}
