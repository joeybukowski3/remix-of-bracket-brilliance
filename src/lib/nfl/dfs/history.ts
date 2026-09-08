import type { DfsPlayerResearch } from "./research";
import type { NflYardageHistoryArtifact } from "@/lib/nfl/props/types/yardageHistory";
import type { IndividualYardageHistoryContext } from "@/lib/nfl/history/contracts";

/** Consumes an already compatibility-checked canonical research join; no FPA math. */
export function adaptDfsFantasyPointsAllowed(research: DfsPlayerResearch | null) {
  const context = research?.status === "available" ? research.context : null;
  return {
    opponentFpaSeason: context?.opponentFpaSeason ?? null,
    opponentFpaLast5: context?.opponentFpaLast5 ?? null,
  };
}

/**
 * Bounded last-N data cannot be safely re-sliced for an earlier cutoff (older
 * rows may already have been truncated). Require the exact materialized target.
 * Old v1 artifacts remain valid for Yardage Review but unavailable to this adapter.
 */
export function resolveDfsHistoryContext(
  artifact: NflYardageHistoryArtifact | null,
  target: { season: number; week: number; asOf: string },
): IndividualYardageHistoryContext | null {
  const context = artifact?.individualContext;
  const cutoff = Date.parse(target.asOf);
  if (!context || context.schemaVersion !== "nfl-individual-yardage-history-v1" || !Number.isFinite(cutoff)) return null;
  if (artifact.season !== target.season || artifact.week !== target.week || context.season !== target.season || context.week !== target.week || Date.parse(context.asOf) !== cutoff) return null;
  const excluded = new Set(context.targetGameIds);
  const rows = [...Object.values(context.players).flat(), ...Object.values(context.defenseMatchups).flat()];
  if (rows.some((row) => !Number.isFinite(Date.parse(row.dateUtc)) || Date.parse(row.dateUtc) >= cutoff || excluded.has(row.gameId))) return null;
  return context;
}
