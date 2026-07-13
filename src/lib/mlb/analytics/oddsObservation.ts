/**
 * Normalized odds observation contract (Phase 1 foundation).
 *
 * One record per (game, player, market, side, exact line, book, capture).
 * Exact-line matching is non-negotiable: a 0.5-line difference is a
 * different market and must never be grouped into the same quote.
 *
 * Consensus pricing is a later phase. No-vig probability is only ever
 * computable from coherent two-sided prices at the same book, same line,
 * same capture window — `isNoVigEligible` encodes that gate.
 */

import type { MlbMarket, ValidationResult } from "./types";
import type { PropSide } from "./historySchema";

export type OddsValidationStatus = "valid" | "stale" | "incoherent" | "unsupported-book";

export interface OddsObservation {
  gameId: number;
  /** Null for team-level markets (moneyline). */
  playerId: number | null;
  market: MlbMarket;
  side: PropSide;
  /** Exact line. Anytime-HR yes/no conventionally carries 0.5. */
  line: number;
  bookmaker: string;
  priceAmerican: number;
  /**
   * Market-implied probability from this single price. Includes vig —
   * NOT a fair probability and never displayed as one.
   */
  impliedProbability: number;
  capturedAt: string;
  slateDate: string;
  source: string;
  /** Freshness annotation (e.g. capture-run label); staleness policy is later phase. */
  freshness: string | null;
  validationStatus: OddsValidationStatus;
}

/** Convert an American price to its (vig-inclusive) implied probability. */
export function impliedProbabilityFromAmerican(priceAmerican: number): number {
  if (!Number.isFinite(priceAmerican) || priceAmerican === 0) {
    throw new Error(`Invalid American price: ${priceAmerican}`);
  }
  return priceAmerican > 0
    ? 100 / (priceAmerican + 100)
    : -priceAmerican / (-priceAmerican + 100);
}

/**
 * Grouping key for quotes that describe the SAME market observation.
 * Includes the exact line and side: different lines or sides can never
 * collapse into one quote.
 */
export function buildQuoteKey(observation: {
  gameId: number;
  playerId: number | null;
  market: MlbMarket;
  side: PropSide;
  line: number;
}): string {
  return [
    observation.gameId,
    observation.playerId ?? "team",
    observation.market,
    observation.side,
    observation.line,
  ].join("|");
}

/**
 * A no-vig computation requires both sides of the SAME market at the SAME
 * book with the SAME exact line. One-sided observations are ineligible.
 */
export function isNoVigEligible(observations: OddsObservation[]): boolean {
  const byBookAndLine = new Map<string, Set<PropSide>>();
  for (const observation of observations) {
    if (observation.validationStatus !== "valid") continue;
    const key = [
      observation.gameId,
      observation.playerId ?? "team",
      observation.market,
      observation.line,
      observation.bookmaker,
    ].join("|");
    const sides = byBookAndLine.get(key) ?? new Set<PropSide>();
    sides.add(observation.side);
    byBookAndLine.set(key, sides);
  }
  for (const sides of byBookAndLine.values()) {
    if ((sides.has("over") && sides.has("under")) || (sides.has("yes") && sides.has("no"))) {
      return true;
    }
  }
  return false;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function validateOddsObservation(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, errors: ["observation is not an object"] };
  }
  const o = value as Record<string, unknown>;
  if (!isFiniteNumber(o.gameId) || !Number.isInteger(o.gameId) || o.gameId <= 0) {
    errors.push("gameId must be a positive integer");
  }
  if (o.playerId !== null && (!isFiniteNumber(o.playerId) || !Number.isInteger(o.playerId) || o.playerId <= 0)) {
    errors.push("playerId must be a positive integer or null");
  }
  if (!["hr", "k", "hits", "ml"].includes(String(o.market))) errors.push("market is invalid");
  if (!["over", "under", "yes", "no"].includes(String(o.side))) errors.push("side is invalid");
  if (!isFiniteNumber(o.line)) errors.push("line must be an exact finite number");
  if (typeof o.bookmaker !== "string" || !o.bookmaker.trim()) errors.push("bookmaker is required");
  if (!isFiniteNumber(o.priceAmerican) || o.priceAmerican === 0 || Math.abs(o.priceAmerican) < 100) {
    errors.push("priceAmerican must be a valid American price (|price| >= 100)");
  }
  if (!isFiniteNumber(o.impliedProbability) || o.impliedProbability <= 0 || o.impliedProbability >= 1) {
    errors.push("impliedProbability must be in (0, 1)");
  }
  if (typeof o.capturedAt !== "string" || !o.capturedAt) errors.push("capturedAt is required");
  if (typeof o.slateDate !== "string" || !o.slateDate) errors.push("slateDate is required");
  if (typeof o.source !== "string" || !o.source) errors.push("source is required");
  if (!["valid", "stale", "incoherent", "unsupported-book"].includes(String(o.validationStatus))) {
    errors.push("validationStatus is invalid");
  }
  return { valid: errors.length === 0, errors };
}
