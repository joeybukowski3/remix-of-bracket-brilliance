import type { PitcherStrikeoutTeamRow } from "@/pages/MlbHrProps";

/**
 * Explicit projection/data-quality status for a K prop row, replacing
 * scattered null checks with one shared classification. Only VALID rows
 * may appear in Best Value / Best Bets / exports / social posts -- see
 * kPropBestBets.ts, kPropValueSorting.ts's selectTopSocialKRows, and
 * MlbGameDetail.tsx's selectTopKValuePlays.
 *
 * - VALID: a real market line + a workload-confident projection agree closely enough to recommend.
 * - LOW_CONFIDENCE: has a line and a projection, but either workload confidence is weak (grade C/D or
 *   critical flags) or the line itself is below MIN_ELIGIBLE_K_LINE (a reliever/opener/nonstandard-role
 *   line, not a primary starting-pitcher line -- see the LOW_K_LINE reason).
 * - INSUFFICIENT_DATA: missing the core inputs (K%/Whiff%, workload) needed to produce any real projection.
 * - INVALID_ODDS: has a line, but the odds themselves fail a sanity check (incoherent market, disallowed book, implausible line for the role).
 * - INVALID_WORKLOAD: the legacy projection diverges sharply from an eligible workload candidate, with no safe number to show.
 * - NO_MARKET: no K line posted at all -- a normal, pre-existing state, not a data-quality problem. Rows stay in the main table.
 */
export type KPropStatus =
  | "VALID"
  | "LOW_CONFIDENCE"
  | "INSUFFICIENT_DATA"
  | "INVALID_ODDS"
  | "INVALID_WORKLOAD"
  | "NO_MARKET";

export type KPropStatusResult = {
  status: KPropStatus;
  reasons: string[];
};

/** Statuses that must never appear in a recommendation/social surface. */
export const K_PROP_EXCLUDED_STATUSES: ReadonlySet<KPropStatus> = new Set([
  "LOW_CONFIDENCE",
  "INSUFFICIENT_DATA",
  "INVALID_ODDS",
  "INVALID_WORKLOAD",
]);

const CRITICAL_WORKLOAD_FLAGS = new Set([
  "NO_STARTS_AVAILABLE",
  "GAME_LOG_FETCH_FAILED",
  "PITCHER_RECENT_K_RATE_MISSING",
  "PITCHER_SEASON_K_RATE_MISSING",
  "RECENT_PITCH_COUNTS_MISSING",
]);

const REASON_LABELS: Record<string, string> = {
  NO_MARKET_LINE: "No market posted",
  INCOHERENT_MARKET_PROBABILITY: "Invalid odds",
  UNSUPPORTED_BOOK_SOURCE: "Unsupported book source",
  K_LINE_OUTSIDE_PLAUSIBLE_RANGE: "K line outside plausible range",
  PUBLIC_RECOMMENDATION_INELIGIBLE: "Workload-role safety override",
  PROJECTION_UNAVAILABLE: "Missing workload",
  NO_WORKLOAD_CONFIDENCE: "Missing workload",
  WORKLOAD_CONFIDENCE_GRADE_D: "Low workload confidence",
  WORKLOAD_CONFIDENCE_GRADE_C: "Low workload confidence",
  NO_STARTS_AVAILABLE: "Insufficient recent starts",
  GAME_LOG_FETCH_FAILED: "Missing workload",
  PITCHER_RECENT_K_RATE_MISSING: "Missing K%",
  PITCHER_SEASON_K_RATE_MISSING: "Missing K%",
  RECENT_PITCH_COUNTS_MISSING: "Missing pitch count history",
  LEGACY_CANDIDATE_DIVERGENCE: "Projection/workload mismatch",
  LOW_K_LINE: "K line below starter threshold",
};

// Below this line, a K prop is presumed to belong to a reliever, opener,
// bulk-relief, or other nonstandard-role pitcher rather than the primary
// starting-pitcher model this page is built around -- even when the line,
// odds, and projection are all otherwise perfectly valid. Checked last, so
// it only ever downgrades a row that would otherwise have been VALID; a
// more specific existing status (NO_MARKET, INVALID_ODDS, INSUFFICIENT_DATA,
// etc.) always takes precedence over this one. Exactly at the threshold
// remains eligible (kLine < MIN_ELIGIBLE_K_LINE, not <=).
export const MIN_ELIGIBLE_K_LINE = 3.5;

/** Human-readable label for a single reason code, for the Low Confidence table's badge/tooltip. */
export function describeKPropStatusReason(reason: string): string {
  return REASON_LABELS[reason] ?? reason.replace(/_/g, " ").toLowerCase();
}

/** Deduplicated, human-readable labels for every reason on a status result. */
export function describeKPropStatusReasons(reasons: string[]): string[] {
  return Array.from(new Set(reasons.map(describeKPropStatusReason)));
}

function toFiniteOrNull(value: number | null | undefined): number | null {
  if (value == null) return null;
  return Number.isFinite(value) ? value : null;
}

function parseAmericanOdds(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function americanToImplied(price: number | null): number | null {
  if (price == null || !Number.isFinite(price)) return null;
  return price > 0 ? 100 / (price + 100) : Math.abs(price) / (Math.abs(price) + 100);
}

// DFS pick'em products have different market structure/limits than a real
// two-sided sportsbook line and should never source a strikeout prop
// recommendation, even if one slips through upstream generation.
const DISALLOWED_K_ODDS_BOOKS = new Set(["underdog", "prizepicks", "sleeper"]);

// A real two-sided sportsbook market's combined implied probability is
// almost always at or above 100% (the vig). This floor is set well below
// that to tolerate unusually thin/near-even real markets without false
// positives, while still catching an egregious mismatch -- see the Jack
// Perkins audit case: +881 over / -100 under implied ~60.2% combined,
// far below any plausible real two-sided market.
const MIN_COMBINED_IMPLIED_PROBABILITY = 0.85;

// Loose, role-aware plausibility band for the K line itself -- a backstop
// behind the market-coherence and book-source checks above, not the
// primary defense.
const K_LINE_PLAUSIBILITY_BANDS: Record<string, { min: number; max: number }> = {
  starter: { min: 1.5, max: 12.5 },
  opener: { min: 0.5, max: 7 },
  reliever: { min: 0.5, max: 5 },
};

function evaluateKOddsPlausibility(row: KPropStatusInput): string[] {
  const reasons: string[] = [];
  const over = parseAmericanOdds(row.kOddsOver);
  const under = parseAmericanOdds(row.kOddsUnder);
  const impliedOver = americanToImplied(over);
  const impliedUnder = americanToImplied(under);
  if (impliedOver != null && impliedUnder != null && impliedOver + impliedUnder < MIN_COMBINED_IMPLIED_PROBABILITY) {
    reasons.push("INCOHERENT_MARKET_PROBABILITY");
  }

  const book = String(row.kOddsBook ?? "").trim().toLowerCase();
  if (book && DISALLOWED_K_ODDS_BOOKS.has(book)) {
    reasons.push("UNSUPPORTED_BOOK_SOURCE");
  }

  // Only applied when the role is actually known -- an unknown role
  // defaulting to "starter" would wrongly flag a legitimate short-relief
  // line (e.g. a 0.5 K line for a true one-batter reliever) as implausible.
  const role = row.workloadRole ?? row.role ?? null;
  const band = role ? K_LINE_PLAUSIBILITY_BANDS[role.toLowerCase()] : null;
  const kLine = toFiniteOrNull(row.kLine);
  if (band != null && kLine != null && (kLine < band.min || kLine > band.max)) {
    reasons.push("K_LINE_OUTSIDE_PLAUSIBLE_RANGE");
  }

  return reasons;
}

// A workload candidate/legacy divergence beyond this many strikeouts is
// treated as a real disagreement between models, not rounding noise.
const INVALID_WORKLOAD_DIVERGENCE_KS = 2.5;

export type KPropStatusInput = Pick<
  PitcherStrikeoutTeamRow,
  | "kLine"
  | "kOddsOver"
  | "kOddsUnder"
  | "kOddsBook"
  | "projectedKs"
  | "projectedIP"
  | "candidateProjectedKs"
  | "projectionSource"
  | "publicRecommendationEligible"
  | "workloadRole"
  | "role"
> &
  Partial<{
    workloadConfidenceGrade: string | null;
    workloadConfidenceScore: number | null;
    workloadFlags: string[] | null;
  }>;

/**
 * Resolves the explicit projection status for one K prop row. Pure and
 * recomputed from the row's own already-present fields -- it does not
 * trust any precomputed/cached status value, so it classifies correctly
 * even for already-generated data that predates this field.
 */
export function resolveKPropStatus(row: KPropStatusInput): KPropStatusResult {
  const kLine = toFiniteOrNull(row.kLine);
  if (kLine == null) {
    return { status: "NO_MARKET", reasons: ["NO_MARKET_LINE"] };
  }

  const oddsIssues = evaluateKOddsPlausibility(row);
  if (oddsIssues.length) {
    return { status: "INVALID_ODDS", reasons: oddsIssues };
  }

  if (row.publicRecommendationEligible === false) {
    return { status: "LOW_CONFIDENCE", reasons: ["PUBLIC_RECOMMENDATION_INELIGIBLE"] };
  }

  const projectedKs = toFiniteOrNull(row.projectedKs);
  const projectedIP = toFiniteOrNull(row.projectedIP);
  if (projectedKs == null || projectedIP == null) {
    return { status: "INSUFFICIENT_DATA", reasons: ["PROJECTION_UNAVAILABLE"] };
  }

  const grade = row.workloadConfidenceGrade ?? null;
  const flags = Array.isArray(row.workloadFlags) ? row.workloadFlags : [];
  const criticalFlags = flags.filter((flag) => CRITICAL_WORKLOAD_FLAGS.has(flag));

  if (grade == null && criticalFlags.length === 0) {
    // No workload confidence data at all (e.g. cached payload predating
    // the workload model, or a shadow-unavailable slate) -- treat as
    // VALID only when there's nothing else flagging a problem; the
    // legacy-vs-candidate divergence check below still applies.
  } else if (grade === "D" || (grade == null && criticalFlags.length > 0)) {
    return { status: "INSUFFICIENT_DATA", reasons: grade === "D" ? ["WORKLOAD_CONFIDENCE_GRADE_D", ...criticalFlags] : criticalFlags };
  } else if (grade === "C" || criticalFlags.length > 0) {
    return { status: "LOW_CONFIDENCE", reasons: (grade === "C" ? ["WORKLOAD_CONFIDENCE_GRADE_C"] : []).concat(criticalFlags) };
  }

  const candidateKs = toFiniteOrNull(row.candidateProjectedKs);
  if (candidateKs != null && row.projectionSource === "legacy" && Math.abs(projectedKs - candidateKs) > INVALID_WORKLOAD_DIVERGENCE_KS) {
    return { status: "INVALID_WORKLOAD", reasons: ["LEGACY_CANDIDATE_DIVERGENCE"] };
  }

  if (kLine < MIN_ELIGIBLE_K_LINE) {
    return { status: "LOW_CONFIDENCE", reasons: ["LOW_K_LINE"] };
  }

  return { status: "VALID", reasons: [] };
}
