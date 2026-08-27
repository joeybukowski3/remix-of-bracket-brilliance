/** Shared Draft Preview row fixture builder for tests only. Not imported by production code. */
import type { DraftPreviewRow } from "@/lib/fantasy/draftPreview/draftPreviewBoard";

export function makeDraftPreviewRow(
  overrides: Partial<DraftPreviewRow> & { sleeperRank: number; player: string },
): DraftPreviewRow {
  return {
    sleeperRank: overrides.sleeperRank,
    player: overrides.player,
    team: overrides.team ?? null,
    sourcePosition: overrides.sourcePosition ?? "RB",
    canonicalPosition: overrides.canonicalPosition ?? "RB",
    displayTeam: overrides.displayTeam ?? overrides.team ?? null,
    rosterPosition: overrides.rosterPosition ?? overrides.canonicalPosition ?? "RB",
    bye: overrides.bye ?? null,
    sleeperProjectedPoints: overrides.sleeperProjectedPoints ?? 0,
    sleeperProjectedPpg: overrides.sleeperProjectedPpg ?? 0,
    jkb: overrides.jkb,
    jkbProjectedPpg: overrides.jkbProjectedPpg,
    jkbParPerGame: overrides.jkbParPerGame,
    modelRank: overrides.modelRank ?? null,
    seasonPointsRank2025: overrides.seasonPointsRank2025,
    seasonPpgRank2025: overrides.seasonPpgRank2025,
    lastEightPointsRank: overrides.lastEightPointsRank,
    isDuplicatePresentation: overrides.isDuplicatePresentation ?? false,
    isMalformedSourceRow: overrides.isMalformedSourceRow ?? false,
  };
}
