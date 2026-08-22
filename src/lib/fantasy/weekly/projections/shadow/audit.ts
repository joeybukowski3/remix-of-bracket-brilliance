import type { FantasyPosition } from "@/lib/fantasy/rankings";
import type { WeeklyFantasyProjectionShadowArtifact, WeeklyFantasyProjectionShadowRow } from "./artifactContract";
import type { Week1UnresolvedCandidate } from "./week1Universe";

function quantile(sorted: readonly number[], q: number): number | null {
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * q;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export type DistributionSummary = { min: number | null; p10: number | null; median: number | null; p90: number | null; max: number | null };

function summarize(values: readonly number[]): DistributionSummary {
  const sorted = [...values].sort((a, b) => a - b);
  return { min: sorted[0] ?? null, p10: quantile(sorted, 0.1), median: quantile(sorted, 0.5), p90: quantile(sorted, 0.9), max: sorted[sorted.length - 1] ?? null };
}

export type PositionDistributionAudit = {
  position: FantasyPosition;
  rowCount: number;
  baselineFantasyPoints: DistributionSummary;
  projectedFantasyPoints: DistributionSummary;
  residualAdjustment: DistributionSummary;
  negativeProjections: number;
  unusuallyHighProjections: number; // > 3x position median, diagnostic only, never clamped
};

function residualOf(row: WeeklyFantasyProjectionShadowRow): number {
  return row.components.usageAdjustment + row.components.teamContextAdjustment + row.components.opponentAdjustment + row.components.otherAdjustment;
}

export function auditPositionDistributions(artifact: WeeklyFantasyProjectionShadowArtifact): Readonly<Record<FantasyPosition, PositionDistributionAudit>> {
  const result = {} as Record<FantasyPosition, PositionDistributionAudit>;
  for (const position of ["QB", "RB", "WR", "TE"] as const) {
    const rows = artifact.rows[position];
    const baseline = rows.map((r) => r.baselineFantasyPoints);
    const projected = rows.map((r) => r.projectedFantasyPoints);
    const residual = rows.map(residualOf);
    const medianProjected = summarize(projected).median ?? 0;
    result[position] = {
      position, rowCount: rows.length,
      baselineFantasyPoints: summarize(baseline),
      projectedFantasyPoints: summarize(projected),
      residualAdjustment: summarize(residual),
      negativeProjections: rows.filter((r) => r.projectedFantasyPoints < 0).length,
      unusuallyHighProjections: rows.filter((r) => medianProjected > 0 && r.projectedFantasyPoints > medianProjected * 3).length,
    };
  }
  return result;
}

export type LargestAdjustmentRow = { playerId: string; playerName: string; position: FantasyPosition; residualAdjustment: number; baselineFantasyPoints: number; projectedFantasyPoints: number };

export function largestAdjustments(artifact: WeeklyFantasyProjectionShadowArtifact, count = 20): { largestPositive: readonly LargestAdjustmentRow[]; largestNegative: readonly LargestAdjustmentRow[] } {
  const all: LargestAdjustmentRow[] = (["QB", "RB", "WR", "TE"] as const).flatMap((position) =>
    artifact.rows[position].map((row) => ({
      playerId: row.playerId, playerName: row.playerName, position,
      residualAdjustment: residualOf(row), baselineFantasyPoints: row.baselineFantasyPoints, projectedFantasyPoints: row.projectedFantasyPoints,
    })));
  return {
    largestPositive: [...all].sort((a, b) => b.residualAdjustment - a.residualAdjustment).slice(0, count),
    largestNegative: [...all].sort((a, b) => a.residualAdjustment - b.residualAdjustment).slice(0, count),
  };
}

export type ColdStartClass = "rookie-or-no-2025-history" | "missing-ros-baseline" | "low-usage-depth";

export type ColdStartAuditEntry = {
  playerClass: ColdStartClass;
  count: number;
  projectionAuthorityUsed: string;
  fallback: string;
  confidenceLevels: Readonly<Record<string, number>>;
  pathologicalOutputs: readonly { playerId: string; playerName: string; position: FantasyPosition; projectedFantasyPoints: number; reason: string }[];
};

export function coldStartAudit(artifact: WeeklyFantasyProjectionShadowArtifact): readonly ColdStartAuditEntry[] {
  const allRows = (["QB", "RB", "WR", "TE"] as const).flatMap((position) => artifact.rows[position]);

  function build(playerClass: ColdStartClass, matches: (row: WeeklyFantasyProjectionShadowRow) => boolean, projectionAuthorityUsed: string, fallback: string): ColdStartAuditEntry {
    const rows = allRows.filter(matches);
    const confidenceLevels: Record<string, number> = {};
    for (const row of rows) confidenceLevels[row.confidence.level] = (confidenceLevels[row.confidence.level] ?? 0) + 1;
    const pathological = rows
      .filter((row) => !Number.isFinite(row.projectedFantasyPoints) || row.projectedFantasyPoints < 0 || row.projectedFantasyPoints > 60)
      .map((row) => ({
        playerId: row.playerId, playerName: row.playerName, position: row.position, projectedFantasyPoints: row.projectedFantasyPoints,
        reason: !Number.isFinite(row.projectedFantasyPoints) ? "non-finite" : row.projectedFantasyPoints < 0 ? "negative" : "implausibly high (>60, diagnostic only, not clamped)",
      }));
    return { playerClass, count: rows.length, projectionAuthorityUsed, fallback, confidenceLevels, pathologicalOutputs: pathological };
  }

  return [
    build("rookie-or-no-2025-history", (row) => row.priorSeasonPpg == null, "shrinkage-blend / rookie fallback (unless ROS available)", "frozen rookie-fallback positionMeanPpgFromTraining"),
    build("missing-ros-baseline", (row) => row.rosProjectedPpg == null, "shrinkage-blend fallback baseline", "2025 priorSeasonPpg or frozen rookie-fallback"),
    build("low-usage-depth", (row) => row.priorSeasonPpg != null && row.priorSeasonPpg < 4, "ROS or shrinkage-blend baseline with usage-only learned adjustment", "none; reported as-is"),
  ];
}

export type SourceFreshnessEntry = { source: string; inputAsOf: string };

export function unresolvedIdentitySummary(unresolved: readonly Week1UnresolvedCandidate[]): Readonly<Record<FantasyPosition, number>> {
  const result: Record<FantasyPosition, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const row of unresolved) result[row.position] += 1;
  return result;
}
