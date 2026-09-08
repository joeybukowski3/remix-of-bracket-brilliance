/**
 * WU8 objective feature extraction and normalization.
 *
 * Every raw value here is READ from an existing authority (the JKB production
 * projection artifact, the weekly research companion, the WU6C DFS lineup
 * context artifact, or the uploaded DraftKings CSV). Nothing is recomputed,
 * re-derived or invented.
 *
 * Normalization follows the site convention already used by the WU6C DST
 * matchup score: a midrank percentile, (below + (ties-1)/2) / (n-1) * 100,
 * with a singleton pool scoring 50. Player-level features are normalized
 * WITHIN POSITION against the strategy candidate pool; team-level features are
 * normalized across the DISTINCT TEAMS in that pool. Every percentile is
 * oriented so that higher is better.
 */

import type { WeeklyFantasyProjectionProductionRow } from "@/lib/fantasy/weekly/projections/production/artifactContract";
import { dstPercentile } from "@/lib/nfl/dfs/dstMatchup";
import { ROLE_CERTAINTY_MODIFIERS, ROLE_CLASS_POINTS } from "@/lib/nfl/dfs/policies/lineupObjectivesV1";
import type { DfsEnrichedOffensiveRow } from "@/lib/nfl/dfs/slateAnalyzer";

export type OffensivePosition = "QB" | "RB" | "WR" | "TE";

/** Raw, un-normalized sub-feature keys. */
export const SUB_FEATURES = [
  "jkbProjection",
  "pointsPer1k",
  "matchupEdgeMean",
  "impliedTeamTotal",
  "yardsPerCarry",
  "touchesPerGame",
  "airYardsPerGame",
  "targetShare",
  "targetsPerGame",
  "projectedCarries",
  "projectedTargets",
  "roleOrdinal",
  "dkAvgPointsPerGame",
] as const;
export type SubFeature = (typeof SUB_FEATURES)[number];

/** Team-pooled sub-features. Everything else is pooled within position. */
const TEAM_POOLED: ReadonlySet<SubFeature> = new Set<SubFeature>(["impliedTeamTotal"]);

export const SUB_FEATURE_SOURCES: Record<SubFeature, string> = {
  jkbProjection: "JKB Full PPR weekly projection artifact",
  pointsPer1k: "JKB projection divided by DraftKings salary",
  matchupEdgeMean: "Weekly research matchup edges (EPA, success rate, trenches)",
  impliedTeamTotal: "Production projection scoring-environment context (market implied team total)",
  yardsPerCarry: "Weekly research season-sample yards per carry",
  touchesPerGame: "Weekly research season-sample touches per game",
  airYardsPerGame: "Weekly research season-sample air yards per game",
  targetShare: "Weekly research season-sample target share",
  targetsPerGame: "Weekly research season-sample targets per game",
  projectedCarries: "DFS lineup-context artifact projected carries",
  projectedTargets: "DFS lineup-context artifact projected targets",
  roleOrdinal: "Optimizer eligibility role class, role certainty and starter evidence",
  dkAvgPointsPerGame: "Uploaded DraftKings CSV AvgPointsPerGame benchmark",
};

type SampledMetric = { value: number | null; sampleSize: number } | undefined;

/** A per-game rate derived from a research metric that stores a SAMPLE TOTAL. */
function perGame(metric: SampledMetric): number | null {
  if (!metric || metric.value == null || !Number.isFinite(metric.value)) return null;
  return metric.sampleSize >= 2 ? metric.value / metric.sampleSize : null;
}

/** A research metric that is ALREADY a rate. Still sample-gated. */
function rate(metric: SampledMetric): number | null {
  if (!metric || metric.value == null || !Number.isFinite(metric.value)) return null;
  return metric.sampleSize >= 2 ? metric.value : null;
}

function finite(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null;
}

/** Mean of the available matchup-edge scores. Opponent FPA is deliberately excluded. */
export function matchupEdgeMean(row: DfsEnrichedOffensiveRow): number | null {
  const edges = row.research?.status === "available" ? row.research.matchupEdges : null;
  if (!edges) return null;
  const scores = [edges.epa?.score, edges.success?.score, edges.trenches?.score].filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  return scores.length > 0 ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null;
}

/**
 * Role-certainty ordinal, 0-100. Every level is DEFINED -- an "unknown" role is
 * a genuinely weak floor signal, not a missing measurement, so it does not
 * trigger missing-component renormalization.
 */
export function roleOrdinal(row: DfsEnrichedOffensiveRow): number | null {
  const role = row.roleContext;
  if (!role) return null;
  const base = ROLE_CLASS_POINTS[role.roleClass];
  const modifier = ROLE_CERTAINTY_MODIFIERS[role.roleCertainty];
  const bonus = role.starterEvidence === "confirmed" ? 5 : role.starterEvidence === "backup" ? -5 : 0;
  return Math.max(0, Math.min(100, base + modifier + bonus));
}

export type OffensiveCandidateInput = {
  row: DfsEnrichedOffensiveRow;
  projection: WeeklyFantasyProjectionProductionRow | null;
};

/** Extracts every raw sub-feature for one offensive candidate. */
export function extractSubFeatures(input: OffensiveCandidateInput): Record<SubFeature, number | null> {
  const { row, projection } = input;
  const context = row.research?.status === "available" ? row.research.context : null;
  const evidence = context?.evidence;
  const environment = projection?.context.scoringEnvironment;

  return {
    jkbProjection: finite(row.projectedFantasyPoints),
    pointsPer1k: finite(row.pointsPer1k),
    matchupEdgeMean: matchupEdgeMean(row),
    impliedTeamTotal: environment?.marketContextAvailable ? finite(environment.teamImpliedTotal) : null,
    yardsPerCarry: rate(evidence?.yardsPerCarry),
    touchesPerGame: perGame(evidence?.touches),
    airYardsPerGame: rate(evidence?.airYardsPerGame),
    targetShare: rate(evidence?.targetShare),
    targetsPerGame: rate(evidence?.targetsPerGame),
    projectedCarries: finite(row.roleContext?.projectedUsage.carries),
    projectedTargets: finite(row.roleContext?.projectedUsage.targets),
    roleOrdinal: roleOrdinal(row),
    dkAvgPointsPerGame: finite(row.dkAvgPointsPerGame),
  };
}

export type NormalizedCandidate = {
  dkId: string;
  position: OffensivePosition;
  team: string;
  raw: Record<SubFeature, number | null>;
  /** 0-100, higher is better. Null where the raw value was unavailable. */
  percentile: Record<SubFeature, number | null>;
};

/**
 * Normalizes every sub-feature across the supplied candidate pool.
 *
 * Pools are built ONLY from the candidates passed in -- an off-slate or
 * non-candidate player never enters a normalization pool, exactly as the WU6C
 * DST ranking already guarantees.
 */
export function normalizeCandidates(inputs: readonly OffensiveCandidateInput[]): NormalizedCandidate[] {
  const raws = inputs.map((input) => extractSubFeatures(input));

  // Team-level pools carry one observation per distinct team so a team with
  // many uploaded players cannot dominate its own percentile.
  const teamValues = new Map<SubFeature, Map<string, number>>();
  const positionValues = new Map<string, number[]>();

  SUB_FEATURES.forEach((feature) => {
    if (TEAM_POOLED.has(feature)) {
      const byTeam = new Map<string, number>();
      inputs.forEach((input, index) => {
        const value = raws[index][feature];
        if (value != null) byTeam.set(input.row.team.toUpperCase(), value);
      });
      teamValues.set(feature, byTeam);
      return;
    }
    inputs.forEach((input, index) => {
      const value = raws[index][feature];
      if (value == null) return;
      const key = feature + "::" + input.row.position;
      const list = positionValues.get(key) ?? [];
      list.push(value);
      positionValues.set(key, list);
    });
  });

  return inputs.map((input, index) => {
    const raw = raws[index];
    const percentile = Object.fromEntries(
      SUB_FEATURES.map((feature) => {
        const value = raw[feature];
        if (value == null) return [feature, null];
        const pool = TEAM_POOLED.has(feature)
          ? [...(teamValues.get(feature)?.values() ?? [])]
          : positionValues.get(feature + "::" + input.row.position) ?? [];
        return [feature, dstPercentile(value, pool, true)];
      }),
    ) as Record<SubFeature, number | null>;

    return {
      dkId: input.row.dkId,
      position: input.row.position,
      team: input.row.team.toUpperCase(),
      raw,
      percentile,
    };
  });
}
