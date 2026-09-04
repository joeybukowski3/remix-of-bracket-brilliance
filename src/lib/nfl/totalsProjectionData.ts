/**
 * JKB projected team-total consumption (jkb-nfl-total-ridge-v1.0.0).
 *
 * Reads the generated public/data/nfl/team-totals.json artifact — a small,
 * deterministic read view over the live team_total prediction archive
 * (data/nfl/predictions/<season>/<week>/nfl-total-ridge.jsonl), produced by
 * scripts/generate-nfl-team-totals-view.mts. No modelling happens in the
 * browser, no archive JSONL is ever fetched or parsed client-side, and the
 * archive/producer/workflow are untouched by this module.
 *
 * The model itself is market-independent: every source row this artifact is
 * built from carries market_reference_status: "not_applicable" and no
 * market_snapshot_refs. The market appears only here, in the consumer
 * layer, purely as a side-by-side comparison after the projection already
 * exists — exactly the same separation projectionData.ts (the JKB spread
 * model) already establishes for this page.
 */

import type { MarketCurrentGame } from "@/lib/nfl/marketData";

export const TEAM_TOTALS_ARTIFACT_PATH = "/data/nfl/team-totals.json";
export const JKB_TOTAL_RIDGE_MODEL_VERSION = "jkb-nfl-total-ridge-v1.0.0";

const NA = "N/A";

export type TeamTotalProjection = {
  gameId: string;
  season: number;
  week: number;
  kickoffUtc: string;
  homeTeam: string;
  awayTeam: string;
  homeExpectedPoints: number;
  awayExpectedPoints: number;
  projectedGameTotal: number;
  modelVersion: string;
  predictionTimestamp: string;
  status: "projected" | "eligible_insufficient_history" | "not_eligible" | "unavailable";
};

export type TeamTotalsArtifact = {
  _meta: { schemaVersion: string; generatedAt: string; source: string };
  schemaVersion: string;
  modelVersion: string | null;
  projections: Record<string, TeamTotalProjection>;
  provenance: { generatedAt: string; gamesProjected: number; archiveRoot: string };
};

/** This game's team-total projection, or null when none has been archived yet. */
export function teamTotalFor(
  artifact: TeamTotalsArtifact | null,
  gameId: string | null | undefined
): TeamTotalProjection | null {
  if (!artifact || !gameId) return null;
  return artifact.projections[gameId] ?? null;
}

/** One decimal place, e.g. "24.9". Never a bare "N/A" digit count mismatch. */
export function formatTeamPoints(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return NA;
  return value.toFixed(1);
}

export type JkbTotalVsMarket = {
  jkbTotal: number;
  vegasTotal: number | null;
  /** jkbTotal − vegasTotal. Null when there is no Vegas total to compare against. */
  difference: number | null;
  /** Neutral descriptive lean — never a pick, edge, confidence or probability. */
  lean: "OVER LEAN" | "UNDER LEAN" | "NEUTRAL" | null;
};

/**
 * Half a point is the smallest meaningful gap given both figures round to one
 * decimal place — anything smaller is display noise, not a real lean.
 */
const LEAN_THRESHOLD = 0.5;

export function compareTotalToMarket(
  projection: TeamTotalProjection | null,
  market: MarketCurrentGame | null | undefined
): JkbTotalVsMarket | null {
  if (!projection) return null;
  const vegasTotal = market?.total ?? null;
  if (vegasTotal == null || !Number.isFinite(vegasTotal)) {
    return { jkbTotal: projection.projectedGameTotal, vegasTotal: null, difference: null, lean: null };
  }
  const difference = projection.projectedGameTotal - vegasTotal;
  const lean: JkbTotalVsMarket["lean"] =
    difference >= LEAN_THRESHOLD ? "OVER LEAN" : difference <= -LEAN_THRESHOLD ? "UNDER LEAN" : "NEUTRAL";
  return { jkbTotal: projection.projectedGameTotal, vegasTotal, difference, lean };
}

/** Signed one-decimal difference, e.g. "+2.5" / "−1.5" / "0.0". */
export function formatTotalDifference(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return NA;
  const rounded = Number(value.toFixed(1));
  if (rounded === 0) return (0).toFixed(1);
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(1)}`;
}
