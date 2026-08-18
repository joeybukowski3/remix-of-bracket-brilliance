/**
 * mlb-social-composition.mjs
 *
 * Phase 1 social-composition layer. Sits AFTER the existing MLB analytic
 * ranking functions (selectConfirmedKRows / selectConfirmedHrProps) and
 * turns their ranked candidate output into a canonical, in-memory
 * `SocialPostPlan` (see mlb-social-post-plan.mjs).
 *
 * Responsibility split, kept strict:
 *   - analytic layer answers "how strong is this betting opportunity?"
 *     (unchanged -- this module never rewrites a score or a rank order)
 *   - this module answers "which of these already-ranked opportunities
 *     make up the final public card?"
 *
 * Nothing here is wired into live posting, workflows, captions, or
 * graphics. It is inert until a later integration phase imports it.
 */

import { selectConfirmedKRows } from "./mlb-k-x-selection-core.mjs";
import { selectConfirmedHrProps } from "./mlb-hr-x-selection-core.mjs";
import { buildSocialPostPlan } from "./mlb-social-post-plan.mjs";

export const SOCIAL_PRODUCT = Object.freeze({
  K: "mlb-k-props",
  HR: "mlb-hr-props",
});

/**
 * Candidate-pool size requested from the existing analytic selection
 * functions before composition runs. The live display limit is 5
 * (K_TARGET_TABLE_SIZE / HR_TARGET_TABLE_SIZE in the posting scripts); this
 * is intentionally larger so diversity substitution has real alternates to
 * consider beyond rank 5, without asking for the whole slate.
 *
 * This is a deliberately deep COMPOSITION candidate pool, not a claim that
 * it retrieves every eligible candidate on every possible slate. Its job is
 * only to comfortably exceed the display max (5) and the diversity
 * rank-distance guardrail (see DIVERSITY_RANK_WINDOW) so a substitution
 * search never runs out of room to look. Chosen as a conservative fixed
 * multiple of the display max (5x), not an unbounded value.
 *
 * Real-data sanity check (not a guarantee) against
 * public/data/mlb/hr-props-raw.json (2026-08-18 slate): 234 batter rows
 * carry a finite hrScore and 26 pitcher rows carry a finite projection edge
 * BEFORE eligibility filtering (VALID market / confirmed lineup / current
 * starter / no-game-started all still to come), so the fully eligible pool
 * on a normal day was well under this bound on that sample. If a future
 * slate's eligible pool regularly exceeds 25, that is an observation to
 * revisit this constant against -- not a reason to make it dynamic or
 * unbounded now.
 */
export const SOCIAL_COMPOSITION_POOL_SIZE = 25;

export const DISPLAY_MIN_ROWS = 2;
export const DISPLAY_MAX_ROWS = 5;

/** Soft preference: normally no more than this many rows from one gameId. Never a hard filter. */
export const SOFT_MAX_ROWS_PER_GAME = 2;

/**
 * Maximum rank-position distance (index gap in the deduped ranked pool)
 * between a row being considered for diversity replacement and its
 * candidate substitute. Keeps substitution "nearby alternatives only" --
 * the algorithm never reaches far down the board purely for cosmetic
 * diversity.
 *
 * Calibration: inspected the 2026-08-18 pitcher pool sorted by |projectedKs
 * - kLine| and the batter pool sorted by hrScore (see tolerance constants
 * below for the actual numbers). Adjacent-rank gaps in the rank-4-through-10
 * neighborhood are small and clustered; a window of 3 positions is enough to
 * find a genuinely comparable neighbor when one exists, without ever
 * comparing rank 5 against, say, rank 20.
 */
export const DIVERSITY_RANK_WINDOW = 3;

/**
 * K diversity tolerance, in strikeout-edge units (|projectedKs - kLine|).
 * Calibration sample: 2026-08-18 pitcher pool, top 20 by absolute edge:
 *   2.60, 1.70, 1.60, 0.90, 0.80, 0.70, 0.60, 0.50, 0.50, 0.50, 0.50, 0.40,
 *   0.40, 0.40, 0.40, 0.30, 0.30, 0.30, 0.30, 0.20
 * Adjacent-rank gaps from rank 4 onward are almost entirely <= 0.1, with
 * occasional 0.2-0.3 steps. 0.3 comfortably spans "the next tier down" while
 * still excluding the larger top-of-board gaps (0.9, 0.7, 0.6) that mark a
 * genuinely stronger play -- a materially stronger same-game candidate is
 * never swapped out for a materially weaker one just for diversity.
 */
export const K_EDGE_DIVERSITY_TOLERANCE = 0.3;

/**
 * HR diversity tolerance, in hrScore points.
 * Calibration sample: 2026-08-18 batter pool, top 20 by hrScore:
 *   87.1, 84.3, 75.8, 73.8, 73.4, 73.1, 70.9, 69.1, 67.1, 65.9, 64.3, 63.5,
 *   63.2, 63.0, 62.3, 62.0, 61.9, 61.8, 61.2, 61.1
 * Adjacent-rank gaps from rank 4 onward run mostly 0.1-2.2, with one 8.5
 * outlier gap between rank 2 and rank 3. 3.0 comfortably covers the normal
 * rank-4-plus neighborhood gaps while staying well below that outlier, so a
 * candidate that is analytically that much stronger is never treated as
 * "comparable" for diversity purposes.
 */
export const HR_SCORE_DIVERSITY_TOLERANCE = 3.0;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Request a larger-than-display ranked K candidate pool from the existing
 * (unmodified) analytic selector, for social composition to choose from.
 * Does not change selectConfirmedKRows itself -- only the maxTableSize asked
 * of it.
 *
 * @param {object} params  forwarded to selectConfirmedKRows, minus maxTableSize
 * @param {number} [params.poolSize]
 * @returns {Array<object>} ranked candidate rows, analytic order preserved
 */
export function getKCandidatePool({ poolSize = SOCIAL_COMPOSITION_POOL_SIZE, ...rest } = {}) {
  return selectConfirmedKRows({ ...rest, maxTableSize: poolSize }).selected;
}

/**
 * Request a larger-than-display ranked HR candidate pool from the existing
 * (unmodified) analytic selector, for social composition to choose from.
 *
 * @param {object} params  forwarded to selectConfirmedHrProps, minus maxTableSize
 * @param {number} [params.poolSize]
 * @returns {Array<object>} ranked candidate rows, analytic order preserved
 */
export function getHrCandidatePool({ poolSize = SOCIAL_COMPOSITION_POOL_SIZE, ...rest } = {}) {
  return selectConfirmedHrProps({ ...rest, maxTableSize: poolSize }).selected;
}

function normalizeIdentityPart(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Canonical betting-opportunity identity. Same player + same game is the
 * same opportunity, even for two rows scraped/generated separately. Same
 * player + a DIFFERENT gameId (doubleheader legs) is deliberately two
 * distinct opportunities and must never collapse to one.
 *
 * Identity hierarchy, most to least reliable:
 *   1. PREFERRED -- `product + playerId/pitcherId + gameId`, when both the
 *      stable numeric id and gameId exist. Authoritative: two rows sharing
 *      this identity are the same opportunity regardless of any other field
 *      (e.g. a re-scraped row with a slightly different name string).
 *   2. FALLBACK -- `product + normalized player/pitcher name + normalized
 *      team + gameId`, used only when gameId is known but the upstream
 *      numeric id is missing. Name/team are lowercased and trimmed so
 *      "Aaron Judge"/"AARON JUDGE" and "NYY"/"nyy" collapse to the same
 *      opportunity rather than surviving as two purely because upstream id
 *      metadata didn't come through. Still gameId-scoped, so doubleheader
 *      legs stay distinct even under this fallback.
 *   3. UNKNOWN -- returns null (never a fabricated identity) when gameId
 *      itself is missing, OR when gameId is known but neither a stable id
 *      nor a usable name+team pair is available. Deliberately conservative:
 *      without a known gameId this function does NOT dedupe by player
 *      name/team alone, because that could wrongly collapse two distinct
 *      betting opportunities (e.g. different games) whose per-game identity
 *      just isn't known yet. Callers must treat a null identity as "assume
 *      distinct," not as "safe to merge."
 */
export function getOpportunityIdentity(row, product) {
  const gameId = row?.gameId;
  if (gameId === null || gameId === undefined) return null;

  const playerId = product === SOCIAL_PRODUCT.K ? row?.pitcherId : row?.playerId;
  if (playerId !== null && playerId !== undefined) {
    return `${product}:id:${playerId}:${gameId}`;
  }

  const name = normalizeIdentityPart(product === SOCIAL_PRODUCT.K ? row?.pitcher : row?.player);
  const team = normalizeIdentityPart(row?.team);
  if (name && team) {
    return `${product}:name:${name}:${team}:${gameId}`;
  }

  return null;
}

function gameKeyOf(row) {
  const gameId = row?.gameId;
  return gameId === null || gameId === undefined ? null : `game:${gameId}`;
}

function kQualityMetric(row) {
  const projectedKs = toFiniteNumber(row?.projectedKs);
  const kLine = toFiniteNumber(row?.kLine);
  if (projectedKs == null || kLine == null) return null;
  return Math.abs(projectedKs - kLine);
}

function hrQualityMetric(row) {
  return toFiniteNumber(row?.hrScore);
}

function resolveKSide(row) {
  if (row?.direction === "OVER" || row?.direction === "UNDER") return row.direction;
  const projectedKs = toFiniteNumber(row?.projectedKs);
  const kLine = toFiniteNumber(row?.kLine);
  if (projectedKs == null || kLine == null) return null;
  if (projectedKs > kLine) return "OVER";
  if (projectedKs < kLine) return "UNDER";
  return null;
}

/**
 * Canonical game label. Base `TEAM vs OPP` always; a ` — G1`/` — G2` suffix
 * is appended ONLY when the row is positively known to be a doubleheader leg
 * (`isDoubleheader === true`) AND carries a trustworthy `gameNumber`. A
 * doubleheader row with an unknown gameNumber falls back to the plain label
 * rather than inventing a leg number -- `isDoubleheader`/`gameId` stay on the
 * row for any future handling, but the label itself never guesses.
 */
function resolveGameLabel(team, opponent, { isDoubleheader = false, gameNumber = null } = {}) {
  const base = team && opponent ? `${team} vs ${opponent}` : team || opponent || null;
  if (!base) return base;
  if (isDoubleheader && Number.isInteger(gameNumber)) return `${base} — G${gameNumber}`;
  return base;
}

function toPostRow(row, product) {
  const team = normalizeText(row?.team) || null;
  const opponent = normalizeText(row?.opponent) || null;
  const gameId = row?.gameId ?? null;
  const gameNumber = Number.isInteger(row?.gameNumber) ? row.gameNumber : null;
  const gameStartTime = row?.gameStartTime ?? row?.gameDate ?? null;
  const isDoubleheader = row?.isDoubleheader === true;
  const gameLabel = resolveGameLabel(team, opponent, { isDoubleheader, gameNumber });

  if (product === SOCIAL_PRODUCT.K) {
    const side = resolveKSide(row);
    const projectedKs = toFiniteNumber(row?.projectedKs);
    const kLine = toFiniteNumber(row?.kLine);
    const edge = projectedKs != null && kLine != null ? Number((projectedKs - kLine).toFixed(2)) : null;
    const odds = side === "OVER" ? row?.oddsOver ?? null : side === "UNDER" ? row?.oddsUnder ?? null : null;
    return {
      playerId: row?.pitcherId ?? null,
      playerName: normalizeText(row?.pitcher) || null,
      team,
      opponent,
      gameId,
      gameNumber,
      gameStartTime,
      isDoubleheader,
      gameLabel,
      content: { kind: "k", side, kLine, projectedKs, edge, odds },
    };
  }

  return {
    playerId: row?.playerId ?? null,
    playerName: normalizeText(row?.player) || null,
    team,
    opponent,
    gameId,
    gameNumber,
    gameStartTime,
    isDoubleheader,
    gameLabel,
    content: {
      kind: "hr",
      hrScore: toFiniteNumber(row?.hrScore),
      odds: row?.hrOddsYes ?? null,
      opposingPitcher: normalizeText(row?.opposingPitcher) || null,
      barrelRate: toFiniteNumber(row?.barrelRate),
      hardHitRate: toFiniteNumber(row?.hardHitRate),
      last7HR: toFiniteNumber(row?.last7HR),
      last30HR: toFiniteNumber(row?.last30HR),
    },
  };
}

/**
 * Remove exact duplicate opportunities defensively, preserving analytic rank
 * order (first occurrence -- i.e. the higher-ranked one -- wins). A row
 * whose identity can't be computed is never treated as a duplicate of
 * anything else.
 */
function dedupeByOpportunity(candidatePool, product) {
  const seen = new Set();
  const deduped = [];
  candidatePool.forEach((row, index) => {
    const identity = getOpportunityIdentity(row, product) ?? `__no-identity-${index}`;
    if (seen.has(identity)) return;
    seen.add(identity);
    deduped.push(row);
  });
  return deduped;
}

/**
 * Soft diversity substitution over an initial top-N selection. Never touches
 * slot 0 (the analytic #1). For any later slot whose game already appears
 * more than SOFT_MAX_ROWS_PER_GAME times among the slots filled so far, look
 * for a not-yet-selected, different-game candidate within
 * DIVERSITY_RANK_WINDOW of that slot's pool position whose quality gap is
 * within `tolerance`. Swap only if one exists; otherwise the analytically
 * stronger same-game row stays exactly where it is.
 *
 * Returns the (possibly modified) array of pool indices, in original slot
 * order.
 */
function applyDiversitySubstitution(deduped, initialPoolIndices, qualityMetric, tolerance) {
  const poolIndices = [...initialPoolIndices];

  for (let slot = 1; slot < poolIndices.length; slot += 1) {
    const poolIndex = poolIndices[slot];
    const gameKey = gameKeyOf(deduped[poolIndex]);
    if (gameKey == null) continue;

    const occurrenceCount = poolIndices.slice(0, slot + 1).filter((pi) => gameKeyOf(deduped[pi]) === gameKey).length;
    if (occurrenceCount <= SOFT_MAX_ROWS_PER_GAME) continue;

    const rowQuality = qualityMetric(deduped[poolIndex]);
    if (rowQuality == null) continue;

    const lo = Math.max(0, poolIndex - DIVERSITY_RANK_WINDOW);
    const hi = Math.min(deduped.length - 1, poolIndex + DIVERSITY_RANK_WINDOW);

    let substituteIndex = null;
    for (let candidateIndex = lo; candidateIndex <= hi; candidateIndex += 1) {
      if (poolIndices.includes(candidateIndex)) continue;
      const candidateGameKey = gameKeyOf(deduped[candidateIndex]);
      if (candidateGameKey == null || candidateGameKey === gameKey) continue;

      const candidateGameCountInSelection = poolIndices.filter((pi) => gameKeyOf(deduped[pi]) === candidateGameKey).length;
      if (candidateGameCountInSelection >= SOFT_MAX_ROWS_PER_GAME) continue;

      const candidateQuality = qualityMetric(deduped[candidateIndex]);
      if (candidateQuality == null) continue;

      if (Math.abs(rowQuality - candidateQuality) > tolerance) continue;

      // Ascending scan -> first hit is the best-ranked (strongest) valid
      // substitute, which is also the most deterministic choice.
      substituteIndex = candidateIndex;
      break;
    }

    if (substituteIndex != null) {
      poolIndices[slot] = substituteIndex;
    }
  }

  return poolIndices;
}

/**
 * Compose the final SocialPostPlan from an already-ranked analytic candidate
 * pool (e.g. from getKCandidatePool / getHrCandidatePool). Pure,
 * deterministic, non-mutating -- never reorders or rescoring the input pool
 * itself, only decides which already-ranked rows become the final card.
 *
 * @param {object} params
 * @param {"mlb-k-props"|"mlb-hr-props"} params.product
 * @param {string} params.slateDate
 * @param {Array<object>} params.candidatePool   ranked analytic rows (K or HR selection output)
 * @param {string} params.title
 * @param {string|null} [params.subtitle]
 * @param {string} params.generatedAt
 * @param {string[]} [params.sourceSummary]
 * @returns {import("./mlb-social-post-plan.mjs").SocialPostPlan|null} null when fewer than
 *   DISPLAY_MIN_ROWS qualified, distinct opportunities are available
 */
export function composeSocialPostPlan({
  product,
  slateDate,
  candidatePool = [],
  title,
  subtitle = null,
  generatedAt,
  sourceSummary = [],
}) {
  if (product !== SOCIAL_PRODUCT.K && product !== SOCIAL_PRODUCT.HR) {
    throw new Error(`composeSocialPostPlan: unsupported product "${product}"`);
  }

  const deduped = dedupeByOpportunity(candidatePool, product);
  if (deduped.length < DISPLAY_MIN_ROWS) return null;

  const initialCount = Math.min(DISPLAY_MAX_ROWS, deduped.length);
  const initialPoolIndices = Array.from({ length: initialCount }, (_, i) => i);

  const qualityMetric = product === SOCIAL_PRODUCT.K ? kQualityMetric : hrQualityMetric;
  const tolerance = product === SOCIAL_PRODUCT.K ? K_EDGE_DIVERSITY_TOLERANCE : HR_SCORE_DIVERSITY_TOLERANCE;

  const finalPoolIndices = applyDiversitySubstitution(deduped, initialPoolIndices, qualityMetric, tolerance)
    .slice()
    .sort((a, b) => a - b);

  const rows = finalPoolIndices.map((poolIndex) => toPostRow(deduped[poolIndex], product));

  return buildSocialPostPlan({ product, slateDate, rows, title, subtitle, generatedAt, sourceSummary });
}
