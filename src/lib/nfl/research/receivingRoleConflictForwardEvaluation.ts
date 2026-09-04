/**
 * WU4F.2A §9-11: defines (but does not wire into any pipeline) the
 * downstream evaluation contract for asking, once games resolve, whether
 * receiving role conflict (archived by `receivingRoleConflictDiagnostic.ts`
 * via `buildReceivingRoleConflictArchiveEntry`) predicts larger Receiving v2
 * target error. Mirrors the shape of `shadowVsProductionEvaluation.ts`
 * (WU4F.1), but this is a single-model OBSERVATIONAL question, not a
 * shadow-vs-production comparison: Receiving v2 is production, and role
 * conflict is being tested as a cohort variable, not proposed as a
 * replacement model (WU4F.2 already found the obvious replacement -- a
 * team-change share discount -- makes error worse historically; no new
 * candidate is being carried forward here).
 *
 * Critical invariant: `projectedTargets` and every diagnostic field below
 * must come from the IMMUTABLE archived pregame prediction row (the
 * `receiving_role_conflict` object this WU adds to
 * `feature_snapshot.values`, plus `projection.projected_targets`). Never
 * recompute a historical projection or diagnostic after the game using
 * outcome data -- that would be leakage into an evaluation meant to prove
 * (or disprove) a PREGAME signal.
 */

export type NflReceivingConflictLevel = "low" | "medium" | "high";

export interface ReceivingRoleConflictEvaluationRow {
  playerId: string;
  gameId: string;
  season: number;
  week: number;
  position: "WR" | "TE" | "RB";
  /** From the archived row's own production projection -- never recomputed. */
  projectedTargets: number;
  projectedYards: number | null;
  /** Realised outcome, joined in AFTER the game from the immutable outcome archive -- never used to build the projection above. */
  actualTargets: number;
  actualYards: number | null;
  /** From the archived `receiving_role_conflict` entry -- null when unavailable that week (see `ReceivingRoleConflictUnavailableReason`) or legitimately null for a noHistory player. */
  conflictLevel: NflReceivingConflictLevel | null;
  orderingConflict: boolean | null;
  teamChanged: boolean | null;
  roleSourced: boolean;
  depthRank: number | null;
  noHistory: boolean;
  /**
   * WU4G.1 §5: true only when the archived `receiving_role_conflict` entry
   * itself is `{available: true, ...}` -- a genuine structural gap (no v2
   * allocation ran, no depth rank, no rank-prior bucket; see
   * `ReceivingRoleConflictUnavailableReason`). A `noHistory` player with a
   * legitimately null `conflictLevel` is STILL `diagnosticAvailable: true`
   * -- that is a real diagnostic value, not an availability failure. Do not
   * conflate the two when computing coverage.
   */
  diagnosticAvailable: boolean;
}

export interface ReceivingRoleConflictEvaluationErrors {
  playerId: string;
  gameId: string;
  absoluteTargetError: number;
  signedTargetError: number;
  /** null when either the projected or actual yards value is unavailable for this row. */
  receivingYardsError: number | null;
}

/**
 * Pure, deterministic error calculation from an already-archived pregame
 * prediction and an already-resolved outcome. Does not read or write any
 * file; does not recompute the projection.
 */
export function computeReceivingRoleConflictErrors(
  rows: readonly ReceivingRoleConflictEvaluationRow[],
): ReceivingRoleConflictEvaluationErrors[] {
  return rows.map((row) => ({
    playerId: row.playerId,
    gameId: row.gameId,
    absoluteTargetError: Math.abs(row.projectedTargets - row.actualTargets),
    signedTargetError: row.projectedTargets - row.actualTargets,
    receivingYardsError: row.projectedYards == null || row.actualYards == null ? null : Math.abs(row.projectedYards - row.actualYards),
  }));
}

/** WU4F.2A §10: cohort keys the future evaluation must be able to slice by. A row may belong to several. */
export type NflReceivingRoleConflictEvaluationCohort =
  | "overall"
  | "week1"
  | "weeks1to4"
  | "sameTeam"
  | "teamChanged"
  | "roleConflictLow"
  | "roleConflictMedium"
  | "roleConflictHigh"
  | "noHistory"
  | "sourcedWR1"
  | "sourcedWR2"
  | "sourcedTE1"
  | "orderingConflict";

/** Classifies which cohorts one evaluation row belongs to. No promotion/decision logic -- purely a slicing key. */
export function classifyReceivingRoleConflictCohorts(row: ReceivingRoleConflictEvaluationRow): NflReceivingRoleConflictEvaluationCohort[] {
  const cohorts: NflReceivingRoleConflictEvaluationCohort[] = ["overall"];
  if (row.week === 1) cohorts.push("week1");
  if (row.week <= 4) cohorts.push("weeks1to4");
  if (row.teamChanged === true) cohorts.push("teamChanged");
  if (row.teamChanged === false) cohorts.push("sameTeam");
  if (row.conflictLevel === "low") cohorts.push("roleConflictLow");
  if (row.conflictLevel === "medium") cohorts.push("roleConflictMedium");
  if (row.conflictLevel === "high") cohorts.push("roleConflictHigh");
  if (row.noHistory) cohorts.push("noHistory");
  if (row.roleSourced && row.position === "WR" && row.depthRank === 1) cohorts.push("sourcedWR1");
  if (row.roleSourced && row.position === "WR" && row.depthRank === 2) cohorts.push("sourcedWR2");
  if (row.roleSourced && row.position === "TE" && row.depthRank === 1) cohorts.push("sourcedTE1");
  if (row.orderingConflict === true) cohorts.push("orderingConflict");
  return cohorts;
}

export interface NflReceivingRoleConflictCohortSummary {
  cohort: NflReceivingRoleConflictEvaluationCohort;
  n: number;
  meanAbsoluteTargetError: number;
  meanSignedTargetError: number;
}

/**
 * WU4F.2A §11: the primary forward question -- "does high role conflict
 * predict larger Receiving-v2 target error?" -- is answered by comparing
 * `meanAbsoluteTargetError` across `roleConflictLow`/`Medium`/`High`
 * cohorts once enough completed games exist. The secondary question --
 * "within high conflict, does teamChanged matter?" -- is answered by
 * further intersecting `roleConflictHigh` rows with `teamChanged`/`sameTeam`
 * membership. Purely a summarizer: no threshold, no promotion, no
 * production-facing decision.
 */
export function summarizeReceivingRoleConflictCohort(
  cohort: NflReceivingRoleConflictEvaluationCohort,
  rows: readonly ReceivingRoleConflictEvaluationRow[],
  errorsByPlayerGame: ReadonlyMap<string, ReceivingRoleConflictEvaluationErrors>,
): NflReceivingRoleConflictCohortSummary {
  const members = rows.filter((row) => classifyReceivingRoleConflictCohorts(row).includes(cohort));
  const errors = members
    .map((row) => errorsByPlayerGame.get(`${row.gameId}|${row.playerId}`))
    .filter((e): e is ReceivingRoleConflictEvaluationErrors => e != null);
  const n = errors.length;
  const meanAbsoluteTargetError = n > 0 ? errors.reduce((s, e) => s + e.absoluteTargetError, 0) / n : NaN;
  const meanSignedTargetError = n > 0 ? errors.reduce((s, e) => s + e.signedTargetError, 0) / n : NaN;
  return { cohort, n, meanAbsoluteTargetError, meanSignedTargetError };
}
