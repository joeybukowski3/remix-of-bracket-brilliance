/**
 * mlb-k-prop-selection.mjs
 *
 * Plain-JS mirror of src/lib/mlb/kPropStatus.ts (resolveKPropStatus) and
 * src/lib/mlb/kPropBestBets.ts (buildKPropBestBets), for use by node
 * scripts (which cannot import .ts files directly). This is a faithful
 * port, not a reinterpretation -- same constants, same thresholds, same
 * gating order. If either TS source changes, update this file to match.
 * Do not change the selection rule here independently of the live site.
 */

const CRITICAL_WORKLOAD_FLAGS = new Set([
  "NO_STARTS_AVAILABLE",
  "GAME_LOG_FETCH_FAILED",
  "PITCHER_RECENT_K_RATE_MISSING",
  "PITCHER_SEASON_K_RATE_MISSING",
  "RECENT_PITCH_COUNTS_MISSING",
]);

export const MIN_ELIGIBLE_K_LINE = 3.5;
const INVALID_WORKLOAD_DIVERGENCE_KS = 2.5;
const MIN_COMBINED_IMPLIED_PROBABILITY = 0.85;
const DISALLOWED_K_ODDS_BOOKS = new Set(["underdog", "prizepicks", "sleeper"]);
const K_LINE_PLAUSIBILITY_BANDS = {
  starter: { min: 1.5, max: 12.5 },
  opener: { min: 0.5, max: 7 },
  reliever: { min: 0.5, max: 5 },
};

function toFiniteOrNull(value) {
  if (value == null) return null;
  return Number.isFinite(value) ? value : null;
}

function parseAmericanOdds(value) {
  if (!value) return null;
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function americanToImplied(price) {
  if (price == null || !Number.isFinite(price)) return null;
  return price > 0 ? 100 / (price + 100) : Math.abs(price) / (Math.abs(price) + 100);
}

function evaluateKOddsPlausibility(row) {
  const reasons = [];
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
  const role = row.workloadRole ?? row.role ?? null;
  const band = role ? K_LINE_PLAUSIBILITY_BANDS[role.toLowerCase()] : null;
  const kLine = toFiniteOrNull(row.kLine);
  if (band != null && kLine != null && (kLine < band.min || kLine > band.max)) {
    reasons.push("K_LINE_OUTSIDE_PLAUSIBLE_RANGE");
  }
  return reasons;
}

export function resolveKPropStatus(row) {
  const kLine = toFiniteOrNull(row.kLine);
  const hasOddsOver = Boolean(String(row.kOddsOver ?? "").trim());
  const hasOddsUnder = Boolean(String(row.kOddsUnder ?? "").trim());
  const hasOddsBook = Boolean(String(row.kOddsBook ?? "").trim());
  const hasMeaningfulMarket = (kLine != null && kLine > 0) || hasOddsOver || hasOddsUnder || hasOddsBook;

  if (!hasMeaningfulMarket) return { status: "NO_MARKET", reasons: ["NO_MARKET_LINE"] };
  if (kLine == null || kLine <= 0) return { status: "INVALID_ODDS", reasons: ["K_LINE_OUTSIDE_PLAUSIBLE_RANGE"] };

  const oddsIssues = evaluateKOddsPlausibility(row);
  if (oddsIssues.length) return { status: "INVALID_ODDS", reasons: oddsIssues };

  if (row.publicRecommendationEligible === false) return { status: "LOW_CONFIDENCE", reasons: ["PUBLIC_RECOMMENDATION_INELIGIBLE"] };

  const projectedKs = toFiniteOrNull(row.projectedKs);
  const projectedIP = toFiniteOrNull(row.projectedIP);
  if (projectedKs == null || projectedIP == null) return { status: "INSUFFICIENT_DATA", reasons: ["PROJECTION_UNAVAILABLE"] };

  const grade = row.workloadConfidenceGrade ?? null;
  const flags = Array.isArray(row.workloadFlags) ? row.workloadFlags : [];
  const criticalFlags = flags.filter((flag) => CRITICAL_WORKLOAD_FLAGS.has(flag));

  if (grade == null && criticalFlags.length === 0) {
    // fall through -- treated as VALID unless something else flags a problem
  } else if (grade === "D" || (grade == null && criticalFlags.length > 0)) {
    return { status: "INSUFFICIENT_DATA", reasons: grade === "D" ? ["WORKLOAD_CONFIDENCE_GRADE_D", ...criticalFlags] : criticalFlags };
  } else if (grade === "C" || criticalFlags.length > 0) {
    return { status: "LOW_CONFIDENCE", reasons: (grade === "C" ? ["WORKLOAD_CONFIDENCE_GRADE_C"] : []).concat(criticalFlags) };
  }

  const candidateKs = toFiniteOrNull(row.candidateProjectedKs);
  if (candidateKs != null && row.projectionSource === "legacy" && Math.abs(projectedKs - candidateKs) > INVALID_WORKLOAD_DIVERGENCE_KS) {
    return { status: "INVALID_WORKLOAD", reasons: ["LEGACY_CANDIDATE_DIVERGENCE"] };
  }

  if (kLine < MIN_ELIGIBLE_K_LINE) return { status: "LOW_CONFIDENCE", reasons: ["LOW_K_LINE"] };

  return { status: "VALID", reasons: [] };
}

function priceBonus(odds) {
  const price = parseAmericanOdds(odds);
  if (price == null) return 0;
  if (price >= 100) return Math.min(8, price / 50);
  if (price >= -120) return 2;
  if (price >= -145) return 0;
  return -3;
}

function resolveProjectedKs(row) {
  if (row.projectedKs != null && Number.isFinite(row.projectedKs)) return row.projectedKs;
  return null;
}

/** @param {Array} rows @param {number} [maxPerSide=3] */
export function buildKPropBestBets(rows, maxPerSide = 3) {
  const overs = [];
  const unders = [];

  for (const row of rows) {
    if (resolveKPropStatus(row).status !== "VALID") continue;
    const projectedKs = resolveProjectedKs(row);
    if (row.kLine == null || projectedKs == null || !Number.isFinite(row.kLine)) continue;
    const projectionEdge = Number((projectedKs - row.kLine).toFixed(1));

    if (projectionEdge >= 0.4 && row.kOddsOver) {
      const valueScore = Number((
        projectionEdge * 18
        + row.strikeoutMatchupScore * 0.42
        + row.pitcherKSkillScore * 0.18
        + priceBonus(row.kOddsOver)
      ).toFixed(1));
      overs.push({ side: "over", pitcher: row.pitcher, team: row.team, opponent: row.opponent, gameKey: row.gameKey, line: row.kLine, odds: row.kOddsOver, book: row.kOddsBook ?? null, projectedKs, projectionEdge, matchupScore: row.strikeoutMatchupScore, valueScore, __source: row });
    }

    if (projectionEdge <= -0.4 && row.kOddsUnder) {
      const valueScore = Number((
        Math.abs(projectionEdge) * 20
        + (100 - row.strikeoutMatchupScore) * 0.2
        + (100 - row.pitcherKSkillScore) * 0.12
        + priceBonus(row.kOddsUnder)
      ).toFixed(1));
      unders.push({ side: "under", pitcher: row.pitcher, team: row.team, opponent: row.opponent, gameKey: row.gameKey, line: row.kLine, odds: row.kOddsUnder, book: row.kOddsBook ?? null, projectedKs, projectionEdge, matchupScore: row.strikeoutMatchupScore, valueScore, __source: row });
    }
  }

  const sorter = (a, b) => b.valueScore - a.valueScore || Math.abs(b.projectionEdge) - Math.abs(a.projectionEdge) || a.pitcher.localeCompare(b.pitcher);

  return {
    overs: overs.sort(sorter).slice(0, maxPerSide),
    unders: unders.sort(sorter).slice(0, maxPerSide),
  };
}
