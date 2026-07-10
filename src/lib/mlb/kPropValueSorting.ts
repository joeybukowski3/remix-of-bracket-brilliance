import type { PitcherStrikeoutTeamRow } from "@/pages/MlbHrProps";
import { resolveKPropStatus, type KPropStatusInput } from "@/lib/mlb/kPropStatus";

export type KPropDirection = "over" | "under" | "neutral";

export type KPropEdgeInfo = {
  projectedKs: number | null;
  kLine: number | null;
  /** projectedKs - kLine. Null when either input is missing/invalid -- never a fabricated 0. */
  projectionEdge: number | null;
  /** Math.abs(projectionEdge). Null under the same conditions as projectionEdge. */
  absoluteProjectionEdge: number | null;
  /** Which side the projection favors. "neutral" when the values are equal, missing, or invalid. */
  direction: KPropDirection;
  /** true only when both projectedKs and kLine are finite numbers. */
  isValid: boolean;
};

function toFiniteOrNull(value: number | null | undefined): number | null {
  if (value == null) return null;
  return Number.isFinite(value) ? value : null;
}

/**
 * Resolves the projection-vs-line edge for one row. Pure and null-safe: a
 * missing/invalid projectedKs or kLine always yields nulls here rather than
 * silently treating a missing value as 0, which would fabricate a fake
 * strong UNDER edge for pitchers the model simply has no projection for.
 */
export function getProjectionEdgeInfo(row: Pick<PitcherStrikeoutTeamRow, "projectedKs" | "kLine">): KPropEdgeInfo {
  const projectedKs = toFiniteOrNull(row?.projectedKs);
  const kLine = toFiniteOrNull(row?.kLine);

  if (projectedKs == null || kLine == null) {
    return { projectedKs, kLine, projectionEdge: null, absoluteProjectionEdge: null, direction: "neutral", isValid: false };
  }

  const projectionEdge = Number((projectedKs - kLine).toFixed(2));
  const direction: KPropDirection = projectionEdge > 0 ? "over" : projectionEdge < 0 ? "under" : "neutral";

  return {
    projectedKs,
    kLine,
    projectionEdge,
    absoluteProjectionEdge: Math.abs(projectionEdge),
    direction,
    isValid: true,
  };
}

/**
 * "Most Strikeouts" sort: highest projected Ks first. Rows with no
 * projection are never given a fabricated 0 -- they always sort after
 * every row with a real projection, regardless of sort direction.
 */
export function sortByProjectedKs<T extends Pick<PitcherStrikeoutTeamRow, "projectedKs">>(rows: T[], direction: "asc" | "desc" = "desc"): T[] {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = toFiniteOrNull(a.projectedKs);
    const right = toFiniteOrNull(b.projectedKs);
    if (left == null && right == null) return 0;
    if (left == null) return 1;
    if (right == null) return -1;
    return (left - right) * multiplier;
  });
}

/**
 * "Best Value" sort: highest absolute projection-vs-line edge first, so a
 * strong UNDER edge and a strong OVER edge both rank highly. Rows missing
 * a valid projection/line stay visible but always sort after every row
 * with a real edge, never mixed in via a fabricated 0 edge.
 *
 * Ties on absolute edge are broken deterministically (never left to
 * whatever order the rows happened to arrive in): higher model/K score
 * first, then higher workload-confidence score, then alphabetical pitcher
 * name. The tie-break fields are optional on T so any caller passing a
 * narrower row shape still compiles -- a missing tie-break field simply
 * sorts last among ties at that step, falling through to the next one.
 */
/**
 * Descending numeric compare where a missing value (null/undefined) always
 * sorts last. Deliberately not `(b ?? -Infinity) - (a ?? -Infinity)`: when
 * *both* sides are missing that subtracts -Infinity from -Infinity, which
 * is NaN, not 0 -- silently breaking the tie-break chain, since a
 * comparator returning NaN doesn't reliably fall through to the next
 * criterion. Handling the both-missing/one-missing cases explicitly keeps
 * this a real, total ordering.
 */
function compareDescendingNullsLast(a: number | null | undefined, b: number | null | undefined): number {
  const left = a ?? null;
  const right = b ?? null;
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return right - left;
}

export function sortByAbsoluteProjectionEdge<
  T extends Pick<PitcherStrikeoutTeamRow, "projectedKs" | "kLine"> &
    Partial<Pick<PitcherStrikeoutTeamRow, "strikeoutMatchupScore" | "workloadConfidenceScore" | "pitcher">>
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const left = getProjectionEdgeInfo(a);
    const right = getProjectionEdgeInfo(b);
    if (!left.isValid && !right.isValid) return 0;
    if (!left.isValid) return 1;
    if (!right.isValid) return -1;

    const edgeDiff = (right.absoluteProjectionEdge as number) - (left.absoluteProjectionEdge as number);
    if (edgeDiff !== 0) return edgeDiff;

    const scoreDiff = compareDescendingNullsLast(a.strikeoutMatchupScore, b.strikeoutMatchupScore);
    if (scoreDiff !== 0) return scoreDiff;

    const confidenceDiff = compareDescendingNullsLast(a.workloadConfidenceScore, b.workloadConfidenceScore);
    if (confidenceDiff !== 0) return confidenceDiff;

    return (a.pitcher ?? "").localeCompare(b.pitcher ?? "");
  });
}

/**
 * Selects rows for a social/export K props graphic: only rows with a real
 * projection and line (never fabricated) AND an explicit VALID status
 * (recomputed fresh here, never trusted from a cached field) -- a row
 * with a low-confidence or invalid-odds projection is excluded even
 * though it technically has finite projectedKs/kLine numbers. Ranked by
 * absolute projection-vs-line edge (not projected Ks or matchup score),
 * highest first. Returns an empty array when there are no valid rows at
 * all -- callers should render an explicit unavailable/empty state in
 * that case rather than falling back to an unrelated ranking.
 */
export function selectTopSocialKRows<T extends Pick<PitcherStrikeoutTeamRow, "projectedKs" | "kLine"> & KPropStatusInput>(rows: T[], limit = 5): T[] {
  const valid = rows.filter((row) => getProjectionEdgeInfo(row).isValid && resolveKPropStatus(row).status === "VALID");
  return sortByAbsoluteProjectionEdge(valid).slice(0, limit);
}
