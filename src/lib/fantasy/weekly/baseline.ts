import { z } from "zod";
import type { FantasyPosition } from "@/lib/fantasy/rankings";

export const WEEKLY_FANTASY_BASELINE_SCHEMA_VERSION = "weekly-fantasy-baseline-v1" as const;

export const baselineAuthoritySchema = z.enum(["preseason-ros", "current-season", "fallback"]);
export const baselineConfidenceSchema = z.enum(["high", "medium", "low"]);

export const weeklyFantasyBaselineSchema = z.object({
  schemaVersion: z.literal(WEEKLY_FANTASY_BASELINE_SCHEMA_VERSION),
  season: z.number().int().min(2000),
  week: z.number().int().min(1).max(18),
  playerId: z.string().min(1),
  position: z.enum(["QB", "RB", "WR", "TE"]),
  sourceAuthority: baselineAuthoritySchema,
  baselineRank: z.number().int().positive(),
  baselineProjectedPpg: z.number().finite().nullable(),
  historyGames: z.number().int().nonnegative(),
  confidence: baselineConfidenceSchema,
  fallbackReason: z.string().min(1).nullable(),
  provenance: z.object({
    source: z.string().min(1),
    sourceVersion: z.string().min(1),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
  generatedAt: z.string().datetime(),
  inputAsOf: z.string().datetime(),
}).strict();

export type WeeklyFantasyBaseline = z.infer<typeof weeklyFantasyBaselineSchema>;
export type BaselineAuthority = z.infer<typeof baselineAuthoritySchema>;
export type BaselineConfidence = z.infer<typeof baselineConfidenceSchema>;

export type BaselineSource = {
  rank: number;
  projectedPpg: number | null;
  source: string;
  sourceVersion: string;
  sourceHash: string;
  inputAsOf: string;
};

export type SelectWeeklyBaselineInput = {
  season: number;
  week: number;
  playerId: string;
  position: FantasyPosition;
  historyGames: number;
  currentSeason?: BaselineSource | null;
  preseasonRos?: BaselineSource | null;
  historicalFallback?: BaselineSource | null;
  minimumHistoryGames: number;
  generatedAt: string;
};

function materialize(
  input: SelectWeeklyBaselineInput,
  source: BaselineSource,
  sourceAuthority: BaselineAuthority,
  confidence: BaselineConfidence,
  fallbackReason: string | null,
): WeeklyFantasyBaseline {
  return weeklyFantasyBaselineSchema.parse({
    schemaVersion: WEEKLY_FANTASY_BASELINE_SCHEMA_VERSION,
    season: input.season,
    week: input.week,
    playerId: input.playerId,
    position: input.position,
    sourceAuthority,
    baselineRank: source.rank,
    baselineProjectedPpg: sourceAuthority === "preseason-ros" ? source.projectedPpg : null,
    historyGames: input.historyGames,
    confidence,
    fallbackReason,
    provenance: {
      source: source.source,
      sourceVersion: source.sourceVersion,
      sourceHash: source.sourceHash,
    },
    generatedAt: input.generatedAt,
    inputAsOf: source.inputAsOf,
  });
}

/** Selects player strength only. Eligibility and weekly adjustments are intentionally separate. */
export function selectWeeklyFantasyBaseline(input: SelectWeeklyBaselineInput): WeeklyFantasyBaseline | null {
  if (input.historyGames < 0 || input.minimumHistoryGames < 1) {
    throw new Error("historyGames must be nonnegative and minimumHistoryGames must be positive");
  }
  if (input.historyGames >= input.minimumHistoryGames && input.currentSeason) {
    return materialize(input, input.currentSeason, "current-season", "high", null);
  }
  if (input.preseasonRos) {
    return materialize(input, input.preseasonRos, "preseason-ros", "medium", null);
  }
  if (input.historicalFallback) {
    const reason = input.currentSeason
      ? "insufficient-current-season-history-and-missing-preseason-ros"
      : "missing-preseason-ros-and-current-season-authority";
    return materialize(input, input.historicalFallback, "fallback", "low", reason);
  }
  return null;
}

export type RankTransitionSummary = {
  rows: number;
  medianAbsoluteMovement: number | null;
  p75AbsoluteMovement: number | null;
  p90AbsoluteMovement: number | null;
  maximumAbsoluteMovement: number | null;
};

function percentile(values: readonly number[], proportion: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(proportion * sorted.length) - 1];
}

export function summarizeRankTransition(
  rows: readonly { priorRank: number; currentRank: number }[],
): RankTransitionSummary {
  const movements = rows.map((row) => Math.abs(row.currentRank - row.priorRank));
  return {
    rows: movements.length,
    medianAbsoluteMovement: percentile(movements, 0.5),
    p75AbsoluteMovement: percentile(movements, 0.75),
    p90AbsoluteMovement: percentile(movements, 0.9),
    maximumAbsoluteMovement: movements.length ? Math.max(...movements) : null,
  };
}
