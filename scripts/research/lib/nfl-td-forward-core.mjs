/**
 * RESEARCH ONLY — prospective 2026 JKB TD Score forward-validation core.
 *
 * Pure, dependency-light helpers shared by the forward-validation scripts:
 *   - snapshot-nfl-td-forward-validation.mjs   (pregame archive writer)
 *   - grade-nfl-td-forward-validation.mjs      (post-game append-only grader)
 *   - run-nfl-td-forward-validation-summary.mjs (weekly summary + gates)
 *
 * NOTHING here is wired into production. It never touches the production TD
 * Score math, the touchdown-preview artifact, the production sportsbook
 * selection path, or any UI. The candidate calibrator is a RESEARCH field
 * only and its coefficients are always DERIVED from the committed research
 * artifact (`data/nfl/research/td-calibration/candidate-model.json`) — never
 * hardcoded from prose.
 */

import { americanToImplied, noVigProbabilities } from "../../lib/nfl-research-odds-math.mjs";

export { americanToImplied, noVigProbabilities };

export const EARLY_SEASON_MAX_WEEK = 4;

/**
 * Resolve the research candidate calibrator from the parsed
 * `candidate-model.json` artifact. Throws if the artifact does not carry a
 * reproducible logistic model — we never fall back to a hardcoded model.
 *
 * @param {Record<string, unknown>} artifact  parsed candidate-model.json
 * @returns {{
 *   version: string,
 *   method: string,
 *   trailingWindowStrategy: string | null,
 *   transformDivisor: number,
 *   base: { intercept: number, slope: number },
 *   teamChanged: { a: number, bScore: number, cTeamChanged: number } | null,
 * }}
 */
export function resolveCandidateCalibrator(artifact) {
  if (!artifact || typeof artifact !== "object") {
    throw new Error("resolveCandidateCalibrator: artifact missing or not an object");
  }
  const method = String(artifact.method ?? "");
  if (method !== "global-logistic") {
    throw new Error(`resolveCandidateCalibrator: unsupported method "${method}" (expected global-logistic)`);
  }
  const version = String(artifact.version ?? "").trim();
  if (!version) throw new Error("resolveCandidateCalibrator: artifact.version missing");

  const coeffs = artifact.coefficients;
  const intercept = Number(coeffs?.intercept);
  const slope = Number(coeffs?.slope);
  if (!Number.isFinite(intercept) || !Number.isFinite(slope)) {
    throw new Error("resolveCandidateCalibrator: base coefficients not reproducibly present in artifact");
  }

  // transform: "x = jkbTdScore / 100" — parse the divisor rather than assume it
  const transform = String(artifact.transform ?? "x = jkbTdScore / 100");
  const divisorMatch = transform.match(/\/\s*(\d+(?:\.\d+)?)\s*$/);
  const transformDivisor = divisorMatch ? Number(divisorMatch[1]) : 100;
  if (!Number.isFinite(transformDivisor) || transformDivisor <= 0) {
    throw new Error(`resolveCandidateCalibrator: could not parse transform divisor from "${transform}"`);
  }

  let teamChanged = null;
  const tcTerm = artifact.optionalTeamChangedTerm;
  if (tcTerm && typeof tcTerm === "object") {
    const a = Number(tcTerm.coefficients?.a);
    const bScore = Number(tcTerm.coefficients?.bScore);
    const cTeamChanged = Number(tcTerm.coefficients?.cTeamChanged);
    if ([a, bScore, cTeamChanged].every(Number.isFinite)) {
      teamChanged = { a, bScore, cTeamChanged };
    }
  }

  return {
    version,
    method,
    trailingWindowStrategy: artifact.trailingWindowStrategy != null ? String(artifact.trailingWindowStrategy) : null,
    transformDivisor,
    base: { intercept, slope },
    teamChanged,
  };
}

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

/**
 * Candidate calibrated anytime-TD probability for one JKB TD Score.
 * RESEARCH FIELD ONLY.
 *
 * When `teamChanged` is an explicit boolean AND the artifact carried a
 * reproducible team-changed term, the team-changed model is applied exactly
 * as recorded (`logit(p) = a + bScore*x + cTeamChanged*isTeamChanged`).
 * Otherwise the one-parameter base model is used.
 *
 * @param {ReturnType<typeof resolveCandidateCalibrator>} calibrator
 * @param {{ jkbTdScore: number | null | undefined, teamChanged?: boolean | null }} input
 * @returns {number | null}
 */
export function calibratedTdProbability(calibrator, { jkbTdScore, teamChanged = null }) {
  if (jkbTdScore == null || jkbTdScore === "") return null;
  const score = Number(jkbTdScore);
  if (!Number.isFinite(score)) return null;
  const x = score / calibrator.transformDivisor;

  if (typeof teamChanged === "boolean" && calibrator.teamChanged) {
    const { a, bScore, cTeamChanged } = calibrator.teamChanged;
    return sigmoid(a + bScore * x + cTeamChanged * (teamChanged ? 1 : 0));
  }
  const { intercept, slope } = calibrator.base;
  return sigmoid(intercept + slope * x);
}

/**
 * Anytime-TD outcome label. 1 iff the player logged >= 1 rushing OR receiving
 * touchdown. Passing TDs, defensive TDs, special-teams TDs and two-point
 * conversions are all excluded by construction (only rush + rec are summed).
 *
 * @param {{ rushingTds?: number | null, receivingTds?: number | null }} stat
 * @returns {0 | 1 | null}  null when neither field is present (ungradeable)
 */
export function gradeActualTd(stat) {
  const rush = stat?.rushingTds;
  const rec = stat?.receivingTds;
  if (rush == null && rec == null) return null;
  const total = (Number(rush) || 0) + (Number(rec) || 0);
  return total >= 1 ? 1 : 0;
}

/** Week band used across the forward-validation strata. */
export function weekBand(week) {
  const w = Number(week);
  if (!Number.isFinite(w)) return null;
  if (w <= 1) return "w1";
  if (w <= EARLY_SEASON_MAX_WEEK) return "w2-4";
  return "w5-plus";
}

/** Early-season flag: weeks 1..EARLY_SEASON_MAX_WEEK. Mirrors the historical study. */
export function earlySeasonFlag(week) {
  const w = Number(week);
  return Number.isFinite(w) && w <= EARLY_SEASON_MAX_WEEK;
}

/**
 * teamChanged from the player's available prior game history: true iff the
 * chronologically most-recent prior game was for a different team than this
 * week's team. `null` when there is no usable prior history (rookie / unknown).
 *
 * @param {{ team?: string | null }[]} priorGames  games strictly before this week
 * @param {string} currentTeam
 * @returns {boolean | null}
 */
export function deriveTeamChanged(priorGames, currentTeam) {
  const team = String(currentTeam ?? "").toLowerCase();
  if (!team || !Array.isArray(priorGames) || priorGames.length === 0) return null;
  const sorted = [...priorGames].sort(
    (a, b) => (Number(b.season) - Number(a.season)) || (Number(b.week) - Number(a.week)),
  );
  const mostRecentTeam = String(sorted[0]?.team ?? "").toLowerCase();
  if (!mostRecentTeam) return null;
  return mostRecentTeam !== team;
}

/** Deterministic append-only key: one snapshot per (playerId, gameId, observedAt). */
export function snapshotKey({ playerId, gameId, observedAt }) {
  return `${playerId ?? ""}|${gameId ?? ""}|${observedAt ?? ""}`;
}

/**
 * Filter `candidates` down to rows whose key is not already present in the
 * archive — prior observations are never overwritten or re-appended.
 *
 * @template T
 * @param {Iterable<string>} existingKeys
 * @param {T[]} candidates
 * @param {(row: T) => string} keyOf
 * @returns {{ toAppend: T[], skipped: number }}
 */
export function dedupeAppendOnly(existingKeys, candidates, keyOf) {
  const seen = new Set(existingKeys);
  const toAppend = [];
  let skipped = 0;
  for (const row of candidates) {
    const key = keyOf(row);
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    toAppend.push(row);
  }
  return { toAppend, skipped };
}

/**
 * Two-sided no-vig P(over) for a line=0.5 anytime-TD market:
 *   pNoVigOver = pOver / (pOver + pUnder)
 * where pOver, pUnder are the vig-inclusive implied probabilities of each
 * American price. Null unless BOTH sides are valid.
 *
 * @param {number | null} overPrice  American odds
 * @param {number | null} underPrice American odds
 * @returns {number | null}
 */
export function noVigOverProbability(overPrice, underPrice) {
  const { overProb } = noVigProbabilities(overPrice, underPrice);
  return overProb;
}

/** Parse an append-only JSONL archive/grades file's text into rows. */
export function parseJsonl(text) {
  return String(text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

/** Serialize rows to append-only JSONL (no trailing newline). */
export function toJsonl(rows) {
  return rows.map((row) => JSON.stringify(row)).join("\n");
}
