import { z } from "zod";
import { FANTASY_SCORING_VERSION } from "@/lib/fantasy/weekly/scoring";
import { WEEKLY_FANTASY_PROJECTION_MODEL_VERSION } from "../model/frozenSpec";
import { WEEKLY_FANTASY_PROJECTION_DEPLOYMENT_FIT_VERSION } from "../model/deploymentFit";
import { WEEKLY_FANTASY_PROJECTION_TRAINING_ROW_SCHEMA_VERSION } from "../contract";
import { WEEKLY_FANTASY_PROJECTION_INFERENCE_POLICY_VERSION } from "./inferencePolicy";

/**
 * Phase 3 SHADOW output contract. Distinct schema/location from the
 * production `weekly-fantasy-ranking-artifact-v1` (`productionAuthority.ts`)
 * -- `status` is always the literal `"shadow"` so nothing can mistake this
 * for a public consumer artifact.
 */
export const WEEKLY_FANTASY_PROJECTION_SHADOW_ARTIFACT_SCHEMA_VERSION =
  "weekly-fantasy-projection-shadow-artifact-v1" as const;

const provenanceSchema = z.object({
  source: z.string().min(1), sourceVersion: z.string().min(1),
  sourceHash: z.string().min(1), inputAsOf: z.string(),
}).strict();

const componentsSchema = z.object({
  baseline: z.number().finite(),
  usageAdjustment: z.number().finite(),
  teamContextAdjustment: z.number().finite(),
  opponentAdjustment: z.number().finite(),
  otherAdjustment: z.number().finite(),
}).strict();

const modelAuthoritySchema = z.object({
  state: z.enum(["BASELINE_ONLY", "READY_FOR_2026_SHADOW", "NOT_READY"]),
  family: z.enum(["deterministic-shrinkage-baseline", "residual-ridge", "residual-elastic-net", "direct-ridge"]),
  featureBlocks: z.array(z.string()),
  alpha: z.number().nullable(),
}).strict();

const confidenceSchema = z.object({
  level: z.enum(["high", "medium", "low"]),
  reasons: z.array(z.string()),
  missingInputs: z.array(z.string()),
}).strict();

export const weeklyFantasyProjectionShadowRowSchema = z.object({
  playerId: z.string().regex(/^gsis:\S+$/),
  playerName: z.string().min(1),
  position: z.enum(["QB", "RB", "WR", "TE"]),
  team: z.string().min(1),
  opponent: z.string().min(1),
  homeAway: z.enum(["home", "away", "neutral"]),
  kickoff: z.string().nullable(),

  projectedFantasyPoints: z.number().finite(),
  baselineFantasyPoints: z.number().finite(),

  rosProjectedPpg: z.number().finite().nullable(),
  priorSeasonPpg: z.number().finite().nullable(),
  seasonPpgPrior: z.number().finite().nullable(),
  priorGames: z.number().int().nonnegative(),

  modelAuthority: modelAuthoritySchema,
  components: componentsSchema,
  inferencePolicyVersion: z.literal(WEEKLY_FANTASY_PROJECTION_INFERENCE_POLICY_VERSION),
  residualActivated: z.boolean(),
  residualActivationReason: z.enum([
    "model-state-baseline-only",
    "no-selected-current-season-features-observed",
    "selected-current-season-feature-observed",
  ]),
  confidence: confidenceSchema,

  availability: z.record(z.string(), z.unknown()).nullable(),
  provenance: z.array(provenanceSchema),
}).strict();

export const weeklyFantasyProjectionShadowArtifactSchema = z.object({
  schemaVersion: z.literal(WEEKLY_FANTASY_PROJECTION_SHADOW_ARTIFACT_SCHEMA_VERSION),
  season: z.number().int(), week: z.number().int().min(1).max(18),
  scoringVersion: z.literal(FANTASY_SCORING_VERSION),
  modelVersion: z.literal(WEEKLY_FANTASY_PROJECTION_MODEL_VERSION),
  deploymentFitVersion: z.literal(WEEKLY_FANTASY_PROJECTION_DEPLOYMENT_FIT_VERSION),
  datasetSchemaVersion: z.literal(WEEKLY_FANTASY_PROJECTION_TRAINING_ROW_SCHEMA_VERSION),
  generatedAt: z.string(), inputAsOf: z.string(),
  status: z.literal("shadow"),
  provenance: z.array(provenanceSchema).min(1),
  rows: z.object({
    QB: z.array(weeklyFantasyProjectionShadowRowSchema),
    RB: z.array(weeklyFantasyProjectionShadowRowSchema),
    WR: z.array(weeklyFantasyProjectionShadowRowSchema),
    TE: z.array(weeklyFantasyProjectionShadowRowSchema),
  }).strict(),
}).strict();

export type WeeklyFantasyProjectionShadowRow = z.infer<typeof weeklyFantasyProjectionShadowRowSchema>;
export type WeeklyFantasyProjectionShadowArtifact = z.infer<typeof weeklyFantasyProjectionShadowArtifactSchema>;
