import { FANTASY_SCORING_VERSION } from "@/lib/fantasy/weekly/scoring";
import type { FantasyPosition } from "@/lib/fantasy/rankings";
import { WEEKLY_FANTASY_PROJECTION_DEPLOYMENT_FIT_VERSION, type WeeklyFantasyProjectionDeploymentBundle } from "../model/deploymentFit";
import { WEEKLY_FANTASY_PROJECTION_MODEL_VERSION } from "../model/frozenSpec";
import { WEEKLY_FANTASY_PROJECTION_TRAINING_ROW_SCHEMA_VERSION } from "../contract";
import { computeShadowProjection } from "./inference";
import {
  WEEKLY_FANTASY_PROJECTION_SHADOW_ARTIFACT_SCHEMA_VERSION,
  weeklyFantasyProjectionShadowArtifactSchema,
  type WeeklyFantasyProjectionShadowArtifact,
  type WeeklyFantasyProjectionShadowRow,
} from "./artifactContract";
import type { WeeklyFantasyProjectionTrainingRow } from "../contract";

const POSITIONS: readonly FantasyPosition[] = ["QB", "RB", "WR", "TE"];

export function buildWeeklyFantasyProjectionShadowArtifact(input: {
  season: number; week: number; generatedAt: string; inputAsOf: string;
  rows: readonly { row: WeeklyFantasyProjectionTrainingRow; rosProjectedPpg: number | null }[];
  deploymentBundle: WeeklyFantasyProjectionDeploymentBundle;
  provenance: WeeklyFantasyProjectionShadowArtifact["provenance"];
}): WeeklyFantasyProjectionShadowArtifact {
  const grouped: Record<FantasyPosition, WeeklyFantasyProjectionShadowRow[]> = { QB: [], RB: [], WR: [], TE: [] };

  for (const { row, rosProjectedPpg } of input.rows) {
    const bundle = row.position === "QB" ? null : input.deploymentBundle.positions[row.position];
    const projection = computeShadowProjection(row, rosProjectedPpg, bundle);
    grouped[row.position].push({
      playerId: row.playerId, playerName: row.playerName, team: row.team, opponent: row.opponent,
      homeAway: row.homeAway, kickoff: row.kickoff,
      availability: null,
      provenance: input.provenance,
      ...projection,
    });
  }

  for (const position of POSITIONS) {
    grouped[position].sort((left, right) => right.projectedFantasyPoints - left.projectedFantasyPoints || left.playerId.localeCompare(right.playerId));
  }

  const artifact: WeeklyFantasyProjectionShadowArtifact = {
    schemaVersion: WEEKLY_FANTASY_PROJECTION_SHADOW_ARTIFACT_SCHEMA_VERSION,
    season: input.season, week: input.week,
    scoringVersion: FANTASY_SCORING_VERSION,
    modelVersion: WEEKLY_FANTASY_PROJECTION_MODEL_VERSION,
    deploymentFitVersion: WEEKLY_FANTASY_PROJECTION_DEPLOYMENT_FIT_VERSION,
    datasetSchemaVersion: WEEKLY_FANTASY_PROJECTION_TRAINING_ROW_SCHEMA_VERSION,
    generatedAt: input.generatedAt, inputAsOf: input.inputAsOf, status: "shadow",
    provenance: input.provenance,
    rows: grouped,
  };
  return weeklyFantasyProjectionShadowArtifactSchema.parse(artifact);
}
