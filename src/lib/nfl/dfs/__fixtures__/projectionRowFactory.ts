// Test-only factory for building minimal, schema-shaped
// WeeklyFantasyProjectionProductionRow fixtures for WU2 identity/analyzer
// tests. Not used by production code.

import type {
  WeeklyFantasyProjectionProductionArtifact,
  WeeklyFantasyProjectionProductionRow,
} from "@/lib/fantasy/weekly/projections/production/artifactContract";
import { WEEKLY_FANTASY_PRODUCTION_CONTEXT_POLICY_VERSION } from "@/lib/fantasy/weekly/projections/production/context";
import { WEEKLY_FANTASY_PROJECTION_DEPLOYMENT_FIT_VERSION } from "@/lib/fantasy/weekly/projections/model/deploymentFit";
import { WEEKLY_FANTASY_PROJECTION_MODEL_VERSION } from "@/lib/fantasy/weekly/projections/model/frozenSpec";
import { WEEKLY_FANTASY_PROJECTION_INFERENCE_POLICY_VERSION } from "@/lib/fantasy/weekly/projections/shadow/inferencePolicy";
import { FANTASY_SCORING_VERSION } from "@/lib/fantasy/weekly/scoring";

export function buildProjectionRow(
  overrides: Partial<WeeklyFantasyProjectionProductionRow> & Pick<WeeklyFantasyProjectionProductionRow, "playerId" | "playerName" | "position">,
): WeeklyFantasyProjectionProductionRow {
  return {
    team: "no",
    opponent: "det",
    homeAway: "home",
    kickoff: "2026-09-13T17:00:00.000Z",
    positionRank: 1,
    projectedFantasyPoints: 15,
    baselineFantasyPoints: 15,
    rosProjectedPpg: null,
    priorSeasonPpg: null,
    seasonPpgPrior: null,
    priorGames: 0,
    modelAuthority: {
      state: "BASELINE_ONLY",
      family: "deterministic-shrinkage-baseline",
      featureBlocks: [],
      alpha: null,
    },
    inferenceAuthority: WEEKLY_FANTASY_PROJECTION_INFERENCE_POLICY_VERSION,
    components: {
      baseline: 15,
      usageAdjustment: 0,
      teamContextAdjustment: 0,
      opponentAdjustment: 0,
      scoringEnvironmentAdjustment: 0,
      opponentFpaAdjustment: 0,
      otherAdjustment: 0,
    },
    context: {
      contextPolicyVersion: WEEKLY_FANTASY_PRODUCTION_CONTEXT_POLICY_VERSION,
      scoringEnvironment: {
        marketContextAvailable: false,
        teamImpliedTotal: null,
        leagueAverageImpliedTeamTotal: null,
        impliedTotalDelta: null,
      },
      opponentFpa: {
        opponentFpaPerGamePriorSeason: null,
        opponentFpaPerGameCurrentSeason: null,
        opponentFpaLeagueAverage: null,
        opponentFpaCurrentSeasonGames: 0,
        opponentFpaCurrentSeasonWeight: 0,
        opponentFpaPriorSeasonWeight: 0,
        opponentFpaBlended: null,
        opponentFpaRatio: null,
        fallbackReason: "missing-both-neutral",
      },
    },
    residualActivated: false,
    residualActivationReason: "model-state-baseline-only",
    confidence: { level: "medium", reasons: [], missingInputs: [] },
    missingInputs: [],
    provenance: [{ source: "test-fixture", sourceVersion: "v1", sourceHash: "test", inputAsOf: "2026-09-10T00:00:00.000Z" }],
    ...overrides,
  };
}

export function buildProjectionArtifact(
  overrides: Partial<WeeklyFantasyProjectionProductionArtifact> & Pick<WeeklyFantasyProjectionProductionArtifact, "season" | "week">,
): WeeklyFantasyProjectionProductionArtifact {
  return {
    schemaVersion: "weekly-fantasy-projection-production-artifact-v2",
    scoringVersion: FANTASY_SCORING_VERSION,
    modelVersion: WEEKLY_FANTASY_PROJECTION_MODEL_VERSION,
    inferencePolicyVersion: WEEKLY_FANTASY_PROJECTION_INFERENCE_POLICY_VERSION,
    deploymentFitVersion: WEEKLY_FANTASY_PROJECTION_DEPLOYMENT_FIT_VERSION,
    generatedAt: "2026-09-10T12:00:00.000Z",
    inputAsOf: "2026-09-10T12:00:00.000Z",
    status: "production",
    provenance: [{ source: "test-fixture", sourceVersion: "v1", sourceHash: "test", inputAsOf: "2026-09-10T12:00:00.000Z" }],
    rows: { QB: [], RB: [], WR: [], TE: [] },
    ...overrides,
  };
}
