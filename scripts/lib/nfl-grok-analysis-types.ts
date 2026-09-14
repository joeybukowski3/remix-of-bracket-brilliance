/**
 * WU3.4 (docs/nfl-grok-chatgpt-handicap-architecture.md, "Grok handicap +
 * update-assessment engine") -- typed contract for Grok's STRUCTURED
 * handicapping output. This is a reasoning task, never a research task:
 * nothing here is produced with web_search enabled (see
 * nfl-grok-analysis-config.ts), and every external fact the model uses must
 * already exist as a validated Grok EvidenceRecord (nfl-evidence-types.ts).
 *
 * WU4.6 -- TWO-STAGE MARKET-BLIND HANDICAPPER split what used to be one
 * provider call into two, each with its own untrusted raw shape and its own
 * TRUSTED validated shape:
 *
 *   GrokStageAProposal / GrokStageAV1        -- the BLIND football
 *     projection. Built and validated with ZERO sportsbook pricing anywhere
 *     in its input (see nfl-ai-context-sanitizer.ts's blind packet) --
 *     structurally, this shape has no field where a market number could
 *     even be reported. `prediction` (fair spread + projected total) is
 *     LOCKED the moment this validates; nothing downstream may revise it.
 *
 *   GrokStageBProposal / GrokStageBV1        -- the MARKET decision, given
 *     the ALREADY-LOCKED Stage A prediction plus the current sportsbook
 *     price. Deliberately has NO `prediction` field at all -- the provider
 *     cannot report a "revised" fair spread/total here even if it tried;
 *     nfl-grok-analysis-validator.ts's validateGrokStageB() never reads a
 *     `prediction` key off the raw payload into the trusted shape.
 *
 *   GrokStageAUpdateProposal / GrokStageBUpdateProposal -- the update-mode
 *     analogues, used when a daily update pass re-runs (or reaffirms) the
 *     blind projection and then re-evaluates the current market. Same
 *     blindness/locking rules apply.
 *
 * Every "TRUSTED" (V1) shape here is produced ONLY by a successful
 * nfl-grok-analysis-validator.ts validation call -- never constructed by
 * hand from an untrusted payload.
 */

import type { EvidenceModel } from "./nfl-evidence-types";
import {
  MATCHUP_FACTOR_AREAS,
  MATCHUP_FACTOR_IMPORTANCE,
  MATCHUP_FACTOR_SUPPORTS,
  type EvidenceQualityAssessment,
  type FailureMode,
  type IndependentPrediction,
  type MatchupFactor,
  type MatchupFactorArea,
  type MatchupFactorImportance,
  type MatchupFactorSupports,
  type PredictedFairSpread,
  type SideLean,
  type SpreadLineAtOpinion,
  type TotalLean,
  type UpdateDevelopment,
} from "./nfl-snapshot-types";

export const GROK_ANALYSIS_SCHEMA_VERSION = "nfl-grok-analysis-v1" as const;

/**
 * WU5 moved the canonical definitions of these to nfl-snapshot-types.ts (so
 * SnapshotAnalysisState, the PERSISTED record, can reference them without a
 * circular import back into this module). Re-exported verbatim here so
 * existing call sites importing from "./nfl-grok-analysis-types" are
 * unaffected.
 */
export { MATCHUP_FACTOR_AREAS, MATCHUP_FACTOR_IMPORTANCE, MATCHUP_FACTOR_SUPPORTS };
export type { EvidenceQualityAssessment, FailureMode, IndependentPrediction, MatchupFactor, MatchupFactorArea, MatchupFactorImportance, MatchupFactorSupports, PredictedFairSpread };

/**
 * WU4.5 -- market interpretation ONLY, built entirely from JKB's underlying
 * football/market data the model IS shown (nfl-full-game-context.ts's
 * `market` section) -- never from JKB's own fair-line opinion
 * (`jkbModels.projectedSpread`/`projectedTotal`), which is withheld from
 * analysis input entirely. `currentHomeLine`/`currentAwayLine`/`currentTotal`
 * are mechanically cross-checked against the supplied current market state
 * in the validator ("no invented market values"). `sideEdgePoints`/
 * `totalEdgePoints` are NEVER trusted from the model -- they are simple
 * arithmetic the validator computes mechanically (nfl-market-edge.ts) from
 * the LOCKED Stage A `prediction` against the current market, and overwrite
 * whatever placeholder the model submitted. This is a Stage B-only concept
 * (WU4.6) -- Stage A never sees the market and so never reports one.
 */
export interface MarketAssessment {
  currentHomeLine: number | null;
  currentAwayLine: number | null;
  currentTotal: number | null;
  sideEdgePoints: number | null;
  totalEdgePoints: number | null;
  interpretation: string;
}

/** 1-10, required on every side/total opinion including "pass"/"undecided" -- this schema deliberately always asks for a confidence value (how confident is the model in THIS recommendation, pass included), unlike AnalysisSnapshot's own null-for-pass convention (see the mapping note in nfl-grok-analysis-pipeline.ts). */
export type GrokConfidence = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface GrokSideOpinion {
  lean: SideLean;
  /** The actual team abbr Grok is on, present only when lean is "home"/"away". */
  team?: string | null;
  /** Present only when lean is "home"/"away" -- must equal the supplied current market spread exactly (validated). */
  lineAtOpinion?: SpreadLineAtOpinion | null;
  confidence: GrokConfidence;
  rationale: string;
}

export interface GrokTotalOpinion {
  lean: TotalLean;
  /** Present only when lean is "over"/"under" -- must equal the supplied current market total exactly (validated). */
  totalAtOpinion?: number | null;
  confidence: GrokConfidence;
  rationale: string;
}

/**
 * WU4.6 -- Raw shape the provider must emit for STAGE A (the blind football
 * projection). Untrusted until validateGrokStageA() succeeds. There is
 * deliberately no field anywhere on this shape for a sportsbook spread,
 * total, moneyline, or JKB fair-line opinion -- Stage A's input packet
 * (nfl-ai-context-sanitizer.ts's blind packet) never carries one, so there
 * is nothing for the model to echo back even if it wanted to.
 *
 * WU4.6.5 -- deliberately has NO `generatedAt` field. The provider must
 * never author a trusted lifecycle timestamp: `GrokStageAV1.generatedAt`
 * below is assigned ONLY by validateGrokStageA(), from the caller-supplied
 * trusted orchestration timestamp on `GrokStageAValidationContext`. Even if
 * a raw payload smuggles a `generatedAt` key in anyway, it is never read --
 * validateGrokStageA() builds the trusted shape by explicit field
 * selection, not by spreading the raw payload.
 */
export interface GrokStageAProposal {
  schemaVersion: string;
  model: string;
  gameId: string;
  contextHash: string;
  evidenceIdsUsed: string[];
  footballThesis: string;
  matchupFactors: MatchupFactor[];
  /** The model's OWN independent fair spread/total, formed with zero knowledge of the market. LOCKED the moment this validates. */
  prediction: IndependentPrediction;
  failureModes: FailureMode[];
  evidenceQualityAssessment: EvidenceQualityAssessment;
}

/** The TRUSTED Stage A record, produced ONLY by a successful validateGrokStageA() call. `model` is `EvidenceModel` (shared provider-neutral contract, see nfl-grok-analysis-validator.ts). `generatedAt` is the trusted orchestration timestamp the validator assigned -- never provider-authored (see GrokStageAProposal above). */
export type GrokStageAV1 = GrokStageAProposal & { schemaVersion: typeof GROK_ANALYSIS_SCHEMA_VERSION; model: EvidenceModel; generatedAt: string };

/**
 * WU4.6 -- Raw shape the provider must emit for STAGE B (the market
 * decision), given the ALREADY-LOCKED Stage A projection revealed in the
 * prompt. Deliberately has NO `prediction` field: the provider cannot
 * report a replacement fair spread/projected total here, and even if a raw
 * payload smuggled one in, validateGrokStageB() never reads it into the
 * trusted GrokStageBV1 shape (see nfl-grok-analysis-validator.ts).
 *
 * WU4.6.5 -- also deliberately has NO `generatedAt` field, for the same
 * reason as GrokStageAProposal above.
 */
export interface GrokStageBProposal {
  schemaVersion: string;
  model: string;
  gameId: string;
  contextHash: string;
  side: GrokSideOpinion;
  total: GrokTotalOpinion;
  marketAssessment: MarketAssessment;
}

/** The TRUSTED Stage B record, produced ONLY by a successful validateGrokStageB() call. `generatedAt` is the trusted orchestration timestamp the validator assigned -- never provider-authored. */
export type GrokStageBV1 = GrokStageBProposal & { schemaVersion: typeof GROK_ANALYSIS_SCHEMA_VERSION; model: EvidenceModel; generatedAt: string };

/**
 * WU4.6 -- update-mode Stage A: re-runs (or reaffirms) the blind football
 * projection given new evidence since the prior snapshot. Same blindness
 * rule as the initial Stage A proposal -- still no market field exists here.
 * Deliberately does NOT include previousLean/previousConfidence/change-kind
 * fields -- those are computed deterministically downstream
 * (nfl-grok-analysis-pipeline.ts), never trusted from the model's own echo.
 *
 * WU4.6.5 -- `generatedAt` here is the TRUSTED shape's field, not the raw
 * provider payload's: validateGrokStageAUpdate() always assigns it from the
 * caller-supplied trusted orchestration timestamp on
 * `GrokStageAValidationContext`, by explicit field selection -- any
 * `generatedAt` the provider's raw payload happens to carry is ignored.
 */
export interface GrokStageAUpdateProposal {
  schemaVersion: string;
  model: string;
  gameId: string;
  generatedAt: string;
  contextHash: string;
  evidenceIdsUsed: string[];
  /** Football/evidence-driven developments only -- market-movement observations belong to Stage B, which is the only stage that ever sees the market. */
  developments: UpdateDevelopment[];
  /** The current football-only thesis text -- if unchanged, restates the prior one; the ENGINE decides "did it change" by comparing to the previous snapshot's stored thesis text (see nfl-grok-analysis-pipeline.ts). */
  currentFootballThesis: string;
  thesisChangeExplanation: string;
  /** The model's CURRENT independent fair spread/total, re-affirmed or revised in light of new evidence. Still zero knowledge of the market. LOCKED once this validates. */
  prediction: IndependentPrediction;
}

/**
 * WU4.6 -- update-mode Stage B: the current bet/pass decision against the
 * (possibly moved) market, given the LOCKED Stage A prediction for this
 * pass. No `prediction` field, exactly like the initial Stage B.
 *
 * WU4.6.5 -- `generatedAt` is likewise always validator-assigned from the
 * trusted `GrokStageBValidationContext.generatedAt`, never read from the raw
 * provider payload (see GrokStageAUpdateProposal above).
 */
export interface GrokStageBUpdateProposal {
  schemaVersion: string;
  model: string;
  gameId: string;
  generatedAt: string;
  contextHash: string;
  side: GrokSideOpinion;
  total: GrokTotalOpinion;
  marketAssessment: MarketAssessment;
  conciseCommentary: string;
}
