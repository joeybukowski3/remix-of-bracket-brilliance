import { z } from "zod";
import { FANTASY_SCORING_VERSION } from "@/lib/fantasy/weekly/scoring";
import { WEEKLY_RESEARCH_CONTEXT_VERSION } from "@/lib/fantasy/weekly/researchContext";
import { matchupRankDifference } from "@/lib/nfl/matchupEdges";

export const WEEKLY_FANTASY_RESEARCH_ARTIFACT_SCHEMA_VERSION =
  "weekly-fantasy-research-artifact-v1" as const;

const sampleGameSchema = z.object({
  season: z.number().int(),
  week: z.number().int().min(1).max(18),
}).strict();

export const weeklyResearchMetricSchema = z.object({
  value: z.number().finite().nullable(),
  rank: z.number().int().positive().nullable(),
  poolSize: z.number().int().nonnegative(),
  sampleSize: z.number().int().nonnegative(),
  sampleSeason: z.number().int().nullable(),
  games: z.array(sampleGameSchema),
}).strict();

const evidenceSchema = z.object({
  touches: weeklyResearchMetricSchema,
  redZoneTouches: weeklyResearchMetricSchema,
  yardsPerCarry: weeklyResearchMetricSchema,
  receivingTargets: weeklyResearchMetricSchema,
  targetShare: weeklyResearchMetricSchema,
  airYardsPerGame: weeklyResearchMetricSchema,
  targetsPerGame: weeklyResearchMetricSchema,
}).strict();

export const weeklyFantasyResearchContextSchema = z.object({
  version: z.literal(WEEKLY_RESEARCH_CONTEXT_VERSION),
  seasonPpg: weeklyResearchMetricSchema,
  last5Ppg: weeklyResearchMetricSchema,
  opponentFpaSeason: weeklyResearchMetricSchema,
  opponentFpaLast5: weeklyResearchMetricSchema,
  evidence: evidenceSchema,
}).strict();

const matchupEdgeComponentSchema = z.object({
  team: z.string().min(1),
  label: z.string().min(1),
  value: z.number().finite(),
  formattedValue: z.string().min(1),
  rank: z.number().int().min(1).max(32),
}).strict();

export const nflMatchupEdgeSchema = z.object({
  score: z.number().finite().min(-100).max(100).nullable(),
  offenseRank: z.number().int().min(1).max(32).nullable().optional(),
  defenseRank: z.number().int().min(1).max(32).nullable().optional(),
  rankDifference: z.number().int().min(-31).max(31).nullable().optional(),
  offense: matchupEdgeComponentSchema.nullable(),
  defense: matchupEdgeComponentSchema.nullable(),
  source: z.string().min(1),
  sampleLabel: z.string().min(1),
}).strict().superRefine((edge, context) => {
  const offenseRank = edge.offenseRank ?? edge.offense?.rank ?? null;
  const defenseRank = edge.defenseRank ?? edge.defense?.rank ?? null;
  const expectedDifference = matchupRankDifference(offenseRank, defenseRank);
  if (edge.offenseRank != null && edge.offense?.rank != null && edge.offenseRank !== edge.offense.rank) {
    context.addIssue({ code: "custom", path: ["offenseRank"], message: "offenseRank must match the offense component rank" });
  }
  if (edge.defenseRank != null && edge.defense?.rank != null && edge.defenseRank !== edge.defense.rank) {
    context.addIssue({ code: "custom", path: ["defenseRank"], message: "defenseRank must match the defense component rank" });
  }
  if (edge.rankDifference !== undefined && edge.rankDifference !== expectedDifference) {
    context.addIssue({ code: "custom", path: ["rankDifference"], message: "rankDifference must equal defenseRank - offenseRank" });
  }
}).transform((edge) => {
  const offenseRank = edge.offenseRank ?? edge.offense?.rank ?? null;
  const defenseRank = edge.defenseRank ?? edge.defense?.rank ?? null;
  return {
    ...edge,
    offenseRank,
    defenseRank,
    rankDifference: matchupRankDifference(offenseRank, defenseRank),
  };
});

const matchupEdgesSchema = z.object({
  trenches: nflMatchupEdgeSchema,
  epa: nflMatchupEdgeSchema,
  success: nflMatchupEdgeSchema,
  mode: z.enum(["pass", "rush"]),
}).strict();

const matchupGradeSchema = z.enum(["great", "good", "neutral", "tough", "very-tough"]);

export const weeklyFantasyResearchRowSchema = z.object({
  playerId: z.string().regex(/^gsis:\S+$/),
  position: z.enum(["QB", "RB", "WR", "TE"]),
  context: weeklyFantasyResearchContextSchema,
  matchupGrade: matchupGradeSchema.nullable(),
  matchupEdges: matchupEdgesSchema,
}).strict();

const provenanceSchema = z.object({
  source: z.string().min(1),
  sourceVersion: z.string().min(1),
  sourceHash: z.string().min(1),
  inputAsOf: z.string().min(1),
}).strict();

export const weeklyFantasyResearchArtifactSchema = z.object({
  schemaVersion: z.literal(WEEKLY_FANTASY_RESEARCH_ARTIFACT_SCHEMA_VERSION),
  researchContextVersion: z.literal(WEEKLY_RESEARCH_CONTEXT_VERSION),
  season: z.number().int(),
  week: z.number().int().min(1).max(18),
  scoringVersion: z.literal(FANTASY_SCORING_VERSION),
  generatedAt: z.string().min(1),
  inputAsOf: z.string().min(1),
  projectionArtifact: z.object({
    path: z.string().min(1),
    schemaVersion: z.string().min(1),
    sourceHash: z.string().min(1),
  }).strict(),
  matchupGradeAuthority: z.object({
    input: z.literal("opponentFpaSeason.rank"),
    bands: z.literal("1-6 Great; 7-12 Good; 13-20 Neutral; 21-26 Tough; 27-32 Very Tough"),
  }).strict(),
  provenance: z.array(provenanceSchema).min(1),
  rows: z.array(weeklyFantasyResearchRowSchema),
}).strict();

export type WeeklyFantasyResearchArtifact = z.infer<typeof weeklyFantasyResearchArtifactSchema>;
export type WeeklyFantasyResearchArtifactRow = z.infer<typeof weeklyFantasyResearchRowSchema>;

export function weeklyFantasyResearchArtifactPath(season: number, week: number): string {
  if (!Number.isInteger(season) || !Number.isInteger(week) || week < 1 || week > 18) {
    throw new Error("Invalid weekly fantasy research artifact season/week");
  }
  return `/data/fantasy/weekly-research/${season}/week-${String(week).padStart(2, "0")}.json`;
}

export function assertWeeklyFantasyResearchArtifactIdentity(artifact: WeeklyFantasyResearchArtifact): void {
  const seen = new Set<string>();
  for (const row of artifact.rows) {
    if (seen.has(row.playerId)) throw new Error(`Duplicate weekly research playerId "${row.playerId}".`);
    seen.add(row.playerId);
    if ((row.position === "RB") !== (row.matchupEdges.mode === "rush")) {
      throw new Error(`Weekly research matchup mode disagrees with position for "${row.playerId}".`);
    }
  }
}
