/**
 * AI Picks v2 WU3 -- typed contracts for the handicap-oriented v2 output.
 *
 * Two stages, exactly as before, but each much smaller:
 *
 *   STAGE A (market-blind): the model's own fair spread and total, 3-5 key
 *     drivers, one main risk, and how uncertain it is. No unit taxonomy, no
 *     failure-mode list, no evidence-quality essay.
 *   STAGE B (market-aware): given Stage A's LOCKED projection plus the current
 *     line, it answers "what do you think about this game and spread?" -- the
 *     side it prefers at the exact number, its own cover probabilities, a
 *     BET / LEAN / PASS verdict, and a 250-450 word write-up.
 *
 * Judgment vs mechanics. The model makes every betting judgment (preferred
 * side, cover probabilities, verdict, confidence). The engine only attaches
 * MECHANICAL fields: the market numbers, the derived fair score, the sources,
 * timestamps and the word count. Validators reject internal contradictions;
 * they never replace a judgment with a formula.
 *
 * Every "TRUSTED" shape is produced only by nfl-handicap-v2-validator.ts.
 * Existing (v1) snapshots and artifacts are untouched and remain readable;
 * v2 records live in their own store (nfl-handicap-v2-store.ts).
 */
import type { EvidenceModel } from "./nfl-evidence-types";
import type { HandicapV2MarketContext, KeyNumberContext } from "./nfl-handicap-v2-market";

export const HANDICAP_V2_SCHEMA_VERSION = "nfl-handicap-v2" as const;

/** Bump when either prompt's instructions or output contract changes; stored on every record. */
export const HANDICAP_V2_PROMPT_VERSION = "nfl-handicap-v2-prompts-1" as const;

export const UNCERTAINTY_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export type Uncertainty = (typeof UNCERTAINTY_LEVELS)[number];

export const CONFIDENCE_LEVELS = ["LOW", "MEDIUM", "MEDIUM_HIGH", "HIGH"] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const VERDICTS = ["BET", "LEAN", "PASS"] as const;
export type Verdict = (typeof VERDICTS)[number];

/**
 * Output-token budgets for the two v2 calls. Both providers use the same
 * numbers (reasoning tokens count against the budget on the Responses API, so
 * these are generous relative to the roughly 500-1,200 tokens of visible JSON).
 * `retry` is the one truncation retry ChatGPT's transport already supports.
 */
export const HANDICAP_V2_OUTPUT_TOKENS = {
  A: { first: 3500, retry: 5000 },
  B: { first: 5000, retry: 7000 },
} as const;

export const KEY_DRIVERS_MIN = 3;
export const KEY_DRIVERS_MAX = 5;

export interface PredictedFairSpread {
  /** The favored team's abbreviation. */
  team: string;
  /** <= 0 for the favored team, e.g. -7.5. */
  line: number;
}

export interface KeyDriver {
  /** 1-2 plain-English sentences: the fact AND why it moves the projection. */
  summary: string;
  /** Dot-paths into the supplied football data, e.g. "teamForm.away.recentGame.facts.efficiency.offense.epaPerPlay". */
  factRefs: string[];
  /** evidenceIds from the citable evidence list. */
  evidenceRefs: string[];
}

/* -------------------------------------------------------------------------- */
/* Stage A                                                                    */
/* -------------------------------------------------------------------------- */

/** Raw, UNTRUSTED provider shape for Stage A. Has no field where a market number could be reported. */
export interface StageAV2Proposal {
  schemaVersion: string;
  model: string;
  gameId: string;
  contextHash: string;
  fairSpread: PredictedFairSpread;
  projectedTotal: number;
  keyDrivers: KeyDriver[];
  mainRisk: string;
  uncertainty: Uncertainty;
}

export interface FairScore {
  home: number;
  away: number;
}

/** TRUSTED Stage A record. `generatedAt` and `fairScore` are assigned by the validator, never by the provider. */
export interface StageAV2 extends Omit<StageAV2Proposal, "schemaVersion" | "model"> {
  schemaVersion: typeof HANDICAP_V2_SCHEMA_VERSION;
  model: EvidenceModel;
  generatedAt: string;
  /** Derived deterministically from fairSpread + projectedTotal (see deriveFairScore). */
  fairScore: FairScore;
}

/* -------------------------------------------------------------------------- */
/* Stage B                                                                    */
/* -------------------------------------------------------------------------- */

/** Raw, UNTRUSTED provider shape for Stage B. No market numbers and no fair spread/total: those are attached mechanically. */
export interface StageBV2Proposal {
  schemaVersion: string;
  model: string;
  gameId: string;
  contextHash: string;
  verdict: Verdict;
  /** Abbreviation of the side the analysis prefers AT THIS EXACT NUMBER -- required even for PASS ("the side I would be on if forced"). */
  preferredTeam: string;
  /** Percent (0-100), the model's own estimate that the preferred side covers the exact displayed line. */
  coverProbabilityPreferred: number;
  /** Percent (0-100) for the other side. Preferred + other may be < 100 only when the line is a whole number (push). */
  coverProbabilityOther: number;
  confidence: Confidence;
  /** Where the number becomes meaningfully better/worse. Required when the line is near a key number; otherwise null. */
  keyNumberSensitivity: string | null;
  /** The strongest realistic reason the preferred side fails to cover at this exact line. */
  counterargument: string;
  analysisMarkdown: string;
  factRefsUsed: string[];
  evidenceRefsUsed: string[];
}

export type PreferredSide = "home" | "away";

export interface HandicapV2Source {
  label: string;
  /** null for JKB-internal sources (the market artifact, deterministic team-game data); never model-authored. */
  url: string | null;
  type: "market" | "injury" | "news" | "weather" | "other";
  /** The validated evidenceId this source came from, when it came from evidence. */
  evidenceId?: string;
}

/** TRUSTED Stage B record. Mechanical fields are attached by the validator. */
export interface StageBV2 extends Omit<StageBV2Proposal, "schemaVersion" | "model"> {
  schemaVersion: typeof HANDICAP_V2_SCHEMA_VERSION;
  model: EvidenceModel;
  generatedAt: string;
  preferredSide: PreferredSide;
  /** The preferred side's line at the displayed book, e.g. -7. */
  preferredLine: number;
  otherLine: number;
  /** 100 - (preferred + other): the implied push probability. 0 for half-point lines. */
  impliedPushProbability: number;
  wordCount: number;
  /** Non-fatal observations (e.g. length slightly outside the 250-450 target, probability far from a normal-model reference). */
  warnings: string[];
}

/* -------------------------------------------------------------------------- */
/* Final record                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The published v2 handicap for one game and one provider. Field names follow
 * the requested contract; `marketSpread` is an object (both sides, prices,
 * book, as-of) rather than a bare number so home/away can never be inverted.
 */
export interface HandicapV2Record {
  schemaVersion: typeof HANDICAP_V2_SCHEMA_VERSION;
  gameId: string;
  provider: EvidenceModel;
  generatedAt: string;
  stageAGeneratedAt: string;
  contextHash: string;
  promptVersion: typeof HANDICAP_V2_PROMPT_VERSION;

  marketSpread: { sportsbook: string | null; homeLine: number; awayLine: number; homePrice: number | null; awayPrice: number | null; asOf: string | null };
  marketTotal: number | null;

  preferredSide: PreferredSide;
  preferredTeam: string;
  preferredLine: number;
  coverProbabilityPreferred: number;
  coverProbabilityOther: number;
  impliedPushProbability: number;

  fairSpread: PredictedFairSpread;
  fairScoreAway: number;
  fairScoreHome: number;
  projectedTotal: number;

  confidence: Confidence;
  uncertainty: Uncertainty;
  verdict: Verdict;

  keyNumberSensitivity: string | null;
  /** Deterministic key-number metadata the model was shown (arithmetic about the number, not a view on it). */
  keyNumberContext: KeyNumberContext;

  keyDrivers: KeyDriver[];
  mainRisk: string;
  counterargument: string;

  analysisMarkdown: string;
  wordCount: number;
  factRefsUsed: string[];
  evidenceRefsUsed: string[];
  sources: HandicapV2Source[];
  warnings: string[];
}

export type { HandicapV2MarketContext };
