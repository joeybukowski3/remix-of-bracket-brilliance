/**
 * Versioned append-only historical observation schema (Phase 1 foundation).
 *
 * Every future capability (calibration, fair probability, no-vig value,
 * closing-line validation) is a function of settled records with this
 * shape. The record pins every version/hash needed to replay a score
 * deterministically without calling live providers.
 *
 * Canonical identity is numeric (`playerId`, `gameId`). The display alias
 * `gameKey` ("MIL@PIT") is intentionally NOT part of this schema — it must
 * never be used as a history key.
 *
 * Probability fields do not exist in this version. `finalScore` is a 0–100
 * weighted-evidence index, never a probability. A future record version may
 * add calibrated-probability fields once the calibration gates pass.
 */

import type { MetricContribution, MlbMarket, ValidationResult } from "./types";

export const HISTORY_RECORD_VERSION = 1;

/**
 * Immutable snapshot labels. Snapshot identity is explicit — never inferred
 * from array order.
 */
export const SNAPSHOT_TYPES = [
  "OPENING_OBSERVED",
  "PUBLICATION",
  "T_MINUS_60",
  "FINAL_PRE_LOCK",
  "CLOSING_CONFIRMED",
  "SETTLEMENT",
] as const;

export type SnapshotType = (typeof SNAPSHOT_TYPES)[number];

export type PropSide = "over" | "under" | "yes" | "no";

/** Settlement outcomes. Placeholders in Phase 1 — grading is not yet implemented. */
export type ObservationResult = "win" | "loss" | "push" | "void" | "dnp" | "pending";

export interface HistoryOddsObservationRef {
  bookmaker: string;
  priceAmerican: number;
  capturedAt: string;
}

export interface HistorySettlementPlaceholder {
  result: ObservationResult;
  isVoid: boolean;
  isDnp: boolean;
  isPostponed: boolean;
  pitcherChanged: boolean;
  unitsRisked: number | null;
  unitsReturned: number | null;
  settledAt: string | null;
}

export interface HrHistoryObservation {
  recordVersion: number;
  snapshotType: SnapshotType;

  // Canonical identity — numeric MLB ids only.
  playerId: number;
  gameId: number;
  teamId: number | null;
  opposingPitcherId: number | null;

  market: MlbMarket;
  side: PropSide;
  /** Exact prop line (e.g. 0.5 HR, 5.5 K). Different lines are different markets. */
  line: number;
  slateDate: string;
  capturedAt: string;

  // Replay pins.
  modelId: string;
  modelVersion: string;
  scoreVersion: string;
  registryVersion: string;
  generatorCommitSha: string | null;
  registryArtifactHash: string | null;
  modelArtifactHash: string | null;
  rangeArtifactHash: string | null;

  // Score snapshot (deterministically recomputable from rawMetrics + pins;
  // stored values double as a replay checksum).
  rawMetrics: Record<string, number | null>;
  normalizedMetrics: Record<string, number>;
  contributions: MetricContribution[];
  /** 0–100 weighted-evidence index. NOT a probability. */
  finalScore: number | null;
  slateRank: number | null;
  completenessPercent: number;
  confidencePercent: number;

  // Context.
  lineupStatus: string;
  battingOrder: number | null;
  starterConfirmed: boolean | null;
  sourceFreshness: string | null;

  // Market observations (book-level; consensus is a Phase 2 computation).
  oddsObservations: HistoryOddsObservationRef[];
  consensusQuote: null;

  settlement: HistorySettlementPlaceholder;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}
function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
function isPositiveInteger(v: unknown): v is number {
  return isFiniteNumber(v) && Number.isInteger(v) && v > 0;
}
function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

const SNAPSHOT_SET: ReadonlySet<string> = new Set(SNAPSHOT_TYPES);
const SIDES: ReadonlySet<string> = new Set(["over", "under", "yes", "no"]);
const MARKETS: ReadonlySet<string> = new Set(["hr", "k", "hits", "ml"]);

export function validateHistoryObservation(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["observation is not an object"] };

  if (value.recordVersion !== HISTORY_RECORD_VERSION) {
    errors.push(`recordVersion must be ${HISTORY_RECORD_VERSION}`);
  }
  if (!isNonEmptyString(value.snapshotType) || !SNAPSHOT_SET.has(value.snapshotType)) {
    errors.push("snapshotType must be one of the declared snapshot labels");
  }
  if (!isPositiveInteger(value.playerId)) {
    errors.push("playerId must be a positive integer MLB id — never a name or gameKey");
  }
  if (!isPositiveInteger(value.gameId)) {
    errors.push("gameId must be a positive integer MLB gamePk — never a display gameKey");
  }
  if (!isNonEmptyString(value.market) || !MARKETS.has(value.market)) {
    errors.push("market is invalid");
  }
  if (!isNonEmptyString(value.side) || !SIDES.has(value.side)) {
    errors.push("side is invalid");
  }
  if (!isFiniteNumber(value.line)) errors.push("line must be an exact finite number");
  if (!isNonEmptyString(value.slateDate)) errors.push("slateDate is required");
  if (!isNonEmptyString(value.capturedAt)) errors.push("capturedAt is required");
  if (!isNonEmptyString(value.modelId)) errors.push("modelId is required");
  if (!isNonEmptyString(value.modelVersion)) errors.push("modelVersion is required");
  if (!isNonEmptyString(value.scoreVersion)) errors.push("scoreVersion is required");
  if (!isNonEmptyString(value.registryVersion)) errors.push("registryVersion is required");
  if (!isRecord(value.rawMetrics)) errors.push("rawMetrics snapshot is required");
  if (!isRecord(value.normalizedMetrics)) errors.push("normalizedMetrics snapshot is required");
  if (!Array.isArray(value.contributions)) errors.push("contributions vector is required");
  if (value.finalScore !== null && !isFiniteNumber(value.finalScore)) {
    errors.push("finalScore must be a finite number or null");
  }
  if (!isRecord(value.settlement)) {
    errors.push("settlement placeholder is required");
  }
  // Guard against display aliases sneaking in as identity.
  if ("gameKey" in value) {
    errors.push("gameKey is a display alias and must not appear in history records");
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Uniqueness key for append-only stores. One observation per
 * (market, slate, snapshot, player, game, side, line, model).
 */
export function historyObservationKey(observation: HrHistoryObservation): string {
  return [
    observation.market,
    observation.slateDate,
    observation.snapshotType,
    observation.playerId,
    observation.gameId,
    observation.side,
    observation.line,
    observation.modelId,
  ].join("|");
}

export function createPendingSettlement(): HistorySettlementPlaceholder {
  return {
    result: "pending",
    isVoid: false,
    isDnp: false,
    isPostponed: false,
    pitcherChanged: false,
    unitsRisked: null,
    unitsReturned: null,
    settledAt: null,
  };
}
