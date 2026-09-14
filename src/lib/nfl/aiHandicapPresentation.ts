/**
 * WU5 -- provider-neutral, presentation-safe contract for showing the
 * latest independent Grok ("Grokowski") and ChatGPT ("Chatty Ice") NFL
 * handicaps side by side.
 *
 * This is a PRESENTATION contract only. It is produced by
 * scripts/generate-nfl-ai-handicap-presentation.ts, which sanitizes the
 * internal AnalysisSnapshot chain (scripts/lib/nfl-snapshot-types.ts) --
 * never a new handicap, never a comparison, never a merged/averaged
 * opinion. Grokowski and Chatty Ice remain two fully independent
 * handicappers; nothing here computes or stores a consensus, a winner, or
 * a third opinion.
 *
 * Deliberately excluded, even though the internal snapshot may carry
 * richer detail: provider request/response IDs, raw provider responses,
 * hidden reasoning/chain-of-thought, internal research prompts,
 * filesystem paths, rejected findings, internal diagnostics, token/cost
 * telemetry, and evidence IDs (kept internal -- the UI never needs them).
 */

export type AiHandicapProvider = "grok" | "chatgpt";

/** "pass"/"undecided" are first-class resting states, never treated as a missing opinion. */
export type AiHandicapSideLean = "home" | "away" | "pass" | "undecided";
export type AiHandicapTotalLean = "over" | "under" | "pass" | "undecided";

export interface AiHandicapSideOpinion {
  lean: AiHandicapSideLean;
  /** Resolved team abbreviation (e.g. "ind"), present only when lean is "home"/"away". */
  team: string | null;
  /** The exact market spread line in effect when this opinion was formed. Null when lean has no directional line (pass/undecided). */
  line: number | null;
  /** 1-10. Null when lean is "pass"/"undecided" -- no directional confidence to report once no play is being made. */
  confidence: number | null;
  /** Concise, public-safe rationale prose. Null only for snapshots written before WU5 added this field. */
  rationale: string | null;
}

export interface AiHandicapTotalOpinion {
  lean: AiHandicapTotalLean;
  line: number | null;
  confidence: number | null;
  rationale: string | null;
}

/**
 * WU4.5 -- the handicapper's OWN independent fair-line projection, formed
 * BEFORE it ever looked at the market. Never JKB's projectedSpread/
 * projectedTotal -- those are withheld from analysis input entirely. Null
 * only for a snapshot written before WU4.5 added this field (immutable
 * historical snapshots are never backfilled).
 */
export interface AiHandicapFairSpread {
  team: string;
  line: number;
}

export interface AiHandicapPrediction {
  fairSpread: AiHandicapFairSpread;
  projectedTotal: number;
}

/** The deterministic current sportsbook market for this game, shown alongside the fair line regardless of whether the handicapper is playing or passing. */
export interface AiHandicapMarket {
  spread: { homeLine: number | null; awayLine: number | null };
  total: number | null;
}

/** Mechanically computed (never model-reported) from `prediction` vs `market` -- see scripts/lib/nfl-market-edge.ts. Null when the required market value is unavailable, or when `prediction` itself is null. */
export interface AiHandicapEdges {
  /** Home-oriented: positive means value on the home team, negative means value on the away team. */
  sidePoints: number | null;
  /** Over-oriented: positive means value on the over, negative means value on the under. */
  totalPoints: number | null;
}

export const AI_HANDICAP_FACTOR_SUPPORTS = ["home", "away", "over", "under", "mixed", "neutral"] as const;
export type AiHandicapFactorSupports = (typeof AI_HANDICAP_FACTOR_SUPPORTS)[number];

export const AI_HANDICAP_FACTOR_IMPORTANCE = ["major", "moderate", "minor"] as const;
export type AiHandicapFactorImportance = (typeof AI_HANDICAP_FACTOR_IMPORTANCE)[number];

/** Public-safe projection of MatchupFactor -- evidenceIds/jkbContextRefs (internal) are dropped. */
export interface AiHandicapKeyFactor {
  area: string;
  finding: string;
  supports: AiHandicapFactorSupports;
  importance: AiHandicapFactorImportance;
}

export interface AiHandicapFailureMode {
  scenario: string;
  whyItMatters: string;
}

export interface AiHandicapEvidenceQualitySummary {
  strengths: string[];
  limitations: string[];
}

/** A handicapper with a resolved, analysis-bearing opinion. */
export interface AiHandicapReady {
  status: "ok";
  provider: AiHandicapProvider;
  displayName: string;
  /** Internal snapshotId -- kept for support/debugging traceability, never a provider request/response id. */
  analysisSnapshotId: string;
  /** The resolved snapshot's own createdAt -- when this opinion was actually generated. */
  analyzedAt: string;
  /** Null only for a snapshot written before WU4.5 added independent predictions. */
  prediction: AiHandicapPrediction | null;
  market: AiHandicapMarket;
  edges: AiHandicapEdges;
  side: AiHandicapSideOpinion;
  total: AiHandicapTotalOpinion;
  centralThesis: string | null;
  keyFactors: AiHandicapKeyFactor[];
  failureModes: AiHandicapFailureMode[];
  evidenceQualitySummary: AiHandicapEvidenceQualitySummary | null;
}

/**
 * A handicapper with no publicly-eligible handicap opinion yet -- never
 * faked. Covers both "no analysis pass has run at all" and, since WU4.6.1,
 * "the latest analysis-bearing snapshot predates the market-blind
 * architecture (no blindPrediction/marketDecision)" -- a legacy snapshot's
 * thesis/side/total/factors must never be surfaced as the current opinion.
 */
export interface AiHandicapUnavailable {
  status: "analysis_unavailable";
  provider: AiHandicapProvider;
  displayName: string;
  reason: "no_analysis_yet" | "independent_handicap_not_generated";
}

export type AiHandicapCard = AiHandicapReady | AiHandicapUnavailable;

export const NFL_AI_HANDICAP_SCHEMA_VERSION = "nfl-ai-handicap-presentation-v1" as const;

export interface NflAiHandicapPresentation {
  schemaVersion: typeof NFL_AI_HANDICAP_SCHEMA_VERSION;
  gameId: string;
  season: number;
  week: number;
  kickoff: string;
  homeTeam: string;
  awayTeam: string;
  /** When this public artifact was generated -- never the analysis's own analyzedAt. */
  generatedAt: string;
  handicappers: {
    grokowski: AiHandicapCard;
    chattyIce: AiHandicapCard;
  };
}

export function nflAiHandicapArtifactPath(season: number, gameId: string): string {
  return `/data/nfl/${season}/ai-handicaps/${gameId}.json`;
}
