export const PPR_AUDIT_TOLERANCE = 1e-9;

export type PprAuditRow = {
  season: number;
  week: number;
  playerId: string;
  calculated: number;
  upstream: number | null;
};

export function auditPprOutcomes(rows: readonly PprAuditRow[], tolerance = PPR_AUDIT_TOLERANCE) {
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error("PPR audit tolerance must be non-negative.");
  const mismatches: Array<PprAuditRow & { delta: number }> = [];
  let exactMatches = 0;
  let missingUpstream = 0;
  let maximumDelta = 0;
  for (const row of rows) {
    if (row.upstream == null || !Number.isFinite(row.upstream)) {
      missingUpstream += 1;
      continue;
    }
    const delta = Math.abs(row.calculated - row.upstream);
    maximumDelta = Math.max(maximumDelta, delta);
    if (delta <= tolerance) exactMatches += 1;
    else mismatches.push({ ...row, delta });
  }
  return {
    tolerance,
    rows: rows.length,
    auditedRows: rows.length - missingUpstream,
    exactMatches,
    mismatchCount: mismatches.length,
    missingUpstream,
    maximumDelta,
    mismatches: mismatches.slice(0, 100),
    mismatchPolicy: "Do not alter frozen scoring. Investigate source convention or field mapping before backtesting.",
  };
}
