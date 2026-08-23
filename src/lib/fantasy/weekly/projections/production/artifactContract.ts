import { z } from "zod";
import { FANTASY_SCORING_VERSION } from "@/lib/fantasy/weekly/scoring";
import { WEEKLY_FANTASY_PROJECTION_MODEL_VERSION } from "../model/frozenSpec";
import { WEEKLY_FANTASY_PROJECTION_DEPLOYMENT_FIT_VERSION } from "../model/deploymentFit";
import { WEEKLY_FANTASY_PROJECTION_INFERENCE_POLICY_VERSION } from "../shadow/inferencePolicy";
import { WEEKLY_FANTASY_PRODUCTION_CONTEXT_POLICY_VERSION } from "./context";

/**
 * PRODUCTION projected-fantasy-points artifact. Distinct schema and public
 * location from the Phase 2 baseline-ranking artifact
 * (`productionAuthority.ts`, `weekly-fantasy-ranking-artifact-v1`,
 * `/data/fantasy/weekly/<season>/week-<NN>.json`) and from the Phase 3
 * gitignored shadow artifact (`artifactContract.ts` in `../shadow`,
 * `data/fantasy/projections/shadow/...`).
 *
 * `status` is always the literal `"production"`. Rows are grouped by
 * position and PRE-SORTED descending by `projectedFantasyPoints` (ties
 * broken by `playerId`) with an explicit `positionRank` recorded on each row
 * -- this artifact IS the sole ranking authority; no consumer may re-sort or
 * recompute rank from any other field.
 *
 * V1-validated components: `usageAdjustment` (RB/WR/TE residual-ridge, when
 * activated) and `teamContextAdjustment` (RB only, when activated).
 * `opponentAdjustment` exists in the schema for forward compatibility with
 * the frozen spec's feature-block vocabulary (`opponentContext`), but no
 * promoted V1 feature block is ever keyed to it, so it is always `0` under
 * this model version. Rejected V2 research (learned implied-team-total
 * coefficients, learned opponent-adjusted defense, QB calibration) is never
 * read or exposed here.
 *
 * On top of the V1 model sits an independently-versioned PRODUCT POLICY
 * context layer (`./context.ts`, `weekly-fantasy-production-context-v1`):
 * `scoringEnvironmentAdjustment` (team scoring environment, from the market
 * implied team total) and `opponentFpaAdjustment` (opponent fantasy points
 * allowed vs. position, blended year-over-year). Both are small, bounded,
 * deterministic product-policy adjustments -- never learned/fit coefficients
 * -- applied to every position, including QB. `context` on each row carries
 * the full transparent inputs/fallback metadata behind those two numbers.
 */
export const WEEKLY_FANTASY_PROJECTION_PRODUCTION_ARTIFACT_SCHEMA_VERSION =
  "weekly-fantasy-projection-production-artifact-v2" as const;

const provenanceSchema = z.object({
  source: z.string().min(1),
  sourceVersion: z.string().min(1),
  sourceHash: z.string().min(1),
  inputAsOf: z.string(),
}).strict();

const componentsSchema = z.object({
  baseline: z.number().finite(),
  usageAdjustment: z.number().finite(),
  teamContextAdjustment: z.number().finite(),
  opponentAdjustment: z.number().finite(),
  scoringEnvironmentAdjustment: z.number().finite(),
  opponentFpaAdjustment: z.number().finite(),
  otherAdjustment: z.number().finite(),
}).strict();

const scoringEnvironmentContextSchema = z.object({
  marketContextAvailable: z.boolean(),
  teamImpliedTotal: z.number().finite().nullable(),
  leagueAverageImpliedTeamTotal: z.number().finite().nullable(),
  impliedTotalDelta: z.number().finite().nullable(),
}).strict();

const opponentFpaContextSchema = z.object({
  opponentFpaPerGamePriorSeason: z.number().finite().nullable(),
  opponentFpaPerGameCurrentSeason: z.number().finite().nullable(),
  opponentFpaLeagueAverage: z.number().finite().nullable(),
  opponentFpaCurrentSeasonGames: z.number().int().nonnegative(),
  opponentFpaCurrentSeasonWeight: z.number().finite(),
  opponentFpaPriorSeasonWeight: z.number().finite(),
  opponentFpaBlended: z.number().finite().nullable(),
  opponentFpaRatio: z.number().finite().nullable(),
  fallbackReason: z.enum([
    "none",
    "current-season-missing-use-prior",
    "missing-prior-season-neutral",
    "missing-both-neutral",
  ]),
}).strict();

const productionContextSchema = z.object({
  contextPolicyVersion: z.literal(WEEKLY_FANTASY_PRODUCTION_CONTEXT_POLICY_VERSION),
  scoringEnvironment: scoringEnvironmentContextSchema,
  opponentFpa: opponentFpaContextSchema,
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

export const weeklyFantasyProjectionProductionRowSchema = z.object({
  playerId: z.string().regex(/^gsis:\S+$/),
  playerName: z.string().min(1),
  position: z.enum(["QB", "RB", "WR", "TE"]),
  team: z.string().min(1),
  opponent: z.string().min(1),
  homeAway: z.enum(["home", "away", "neutral"]),
  kickoff: z.string().nullable(),

  positionRank: z.number().int().positive(),
  projectedFantasyPoints: z.number().finite(),
  baselineFantasyPoints: z.number().finite(),

  rosProjectedPpg: z.number().finite().nullable(),
  priorSeasonPpg: z.number().finite().nullable(),
  seasonPpgPrior: z.number().finite().nullable(),
  priorGames: z.number().int().nonnegative(),

  modelAuthority: modelAuthoritySchema,
  inferenceAuthority: z.literal(WEEKLY_FANTASY_PROJECTION_INFERENCE_POLICY_VERSION),
  components: componentsSchema,
  context: productionContextSchema,
  residualActivated: z.boolean(),
  residualActivationReason: z.enum([
    "model-state-baseline-only",
    "no-selected-current-season-features-observed",
    "selected-current-season-feature-observed",
  ]),
  confidence: confidenceSchema,
  missingInputs: z.array(z.string()),

  provenance: z.array(provenanceSchema),
}).strict();

export const weeklyFantasyProjectionProductionArtifactSchema = z.object({
  schemaVersion: z.literal(WEEKLY_FANTASY_PROJECTION_PRODUCTION_ARTIFACT_SCHEMA_VERSION),
  season: z.number().int(),
  week: z.number().int().min(1).max(18),
  scoringVersion: z.literal(FANTASY_SCORING_VERSION),
  modelVersion: z.literal(WEEKLY_FANTASY_PROJECTION_MODEL_VERSION),
  inferencePolicyVersion: z.literal(WEEKLY_FANTASY_PROJECTION_INFERENCE_POLICY_VERSION),
  deploymentFitVersion: z.literal(WEEKLY_FANTASY_PROJECTION_DEPLOYMENT_FIT_VERSION),
  generatedAt: z.string(),
  inputAsOf: z.string(),
  status: z.literal("production"),
  provenance: z.array(provenanceSchema).min(1),
  rows: z.object({
    QB: z.array(weeklyFantasyProjectionProductionRowSchema),
    RB: z.array(weeklyFantasyProjectionProductionRowSchema),
    WR: z.array(weeklyFantasyProjectionProductionRowSchema),
    TE: z.array(weeklyFantasyProjectionProductionRowSchema),
  }).strict(),
}).strict();

export type WeeklyFantasyProjectionProductionRow = z.infer<typeof weeklyFantasyProjectionProductionRowSchema>;
export type WeeklyFantasyProjectionProductionArtifact = z.infer<typeof weeklyFantasyProjectionProductionArtifactSchema>;

export function weeklyFantasyProjectionProductionArtifactPath(season: number, week: number): string {
  if (!Number.isInteger(season) || !Number.isInteger(week) || week < 1 || week > 18) {
    throw new Error("Invalid production projection artifact season/week");
  }
  return `/data/fantasy/projections/${season}/week-${String(week).padStart(2, "0")}.json`;
}

/**
 * Validates positionRank/sort invariants that the zod row schema alone cannot
 * express: strictly ascending 1..N per position and monotonically
 * non-increasing `projectedFantasyPoints`.
 */
export function assertProductionArtifactRankInvariants(artifact: WeeklyFantasyProjectionProductionArtifact): void {
  for (const position of ["QB", "RB", "WR", "TE"] as const) {
    const rows = artifact.rows[position];
    const seenPlayerIds = new Set<string>();
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (row.positionRank !== index + 1) {
        throw new Error(`${position} row ${index} has positionRank ${row.positionRank}, expected ${index + 1}.`);
      }
      if (index > 0 && rows[index - 1].projectedFantasyPoints < row.projectedFantasyPoints) {
        throw new Error(`${position} rows are not sorted descending by projectedFantasyPoints at index ${index}.`);
      }
      if (seenPlayerIds.has(row.playerId)) {
        throw new Error(`Duplicate playerId "${row.playerId}" within position "${position}".`);
      }
      seenPlayerIds.add(row.playerId);
    }
  }
}
