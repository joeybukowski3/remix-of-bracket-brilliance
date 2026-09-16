/**
 * WU3.2 (docs/nfl-grok-chatgpt-handicap-architecture.md, "Recurring pregame
 * snapshot lifecycle") -- model-agnostic types for an immutable, append-only
 * sequence of pregame research/analysis snapshots per (model, game).
 *
 * Nothing here is model-generated content. Every field either comes from
 * deterministic sources already built in WU1 (Game Context Packet / market)
 * and WU2 (EvidenceRecord/EvidenceStore), or is a typed placeholder a FUTURE
 * analysis pass populates (thesis, developments, commentary, prose
 * explanations). WU3.2 defines and validates these contracts; it does not
 * fill in the model-generated ones.
 *
 * Canonical terminology reused, not reinvented:
 *   - side/total pick vocabulary ("home"|"away"|"pass", "over"|"under"|"pass")
 *     and the 1-10 confidence scale come from NflAnalysisV1's SideOpinion /
 *     TotalOpinion (architecture doc §6) -- this module adds "undecided" for
 *     "no opinion has been formed yet", which §6 has no slot for because it
 *     assumes an opinion always exists.
 *   - EvidenceModel ("grok"|"chatgpt") is reused verbatim from
 *     nfl-evidence-types.ts -- never redefined here.
 */

import type { EvidenceModel } from "./nfl-evidence-types";
import type { ResearchCoverageSummary } from "./nfl-grok-research-coverage";

export const SNAPSHOT_SCHEMA_VERSION = "nfl-snapshot-v1" as const;

export type SnapshotModel = EvidenceModel;

/** The three points on the recurring-update lifecycle this WU wires storage/locking for. Cadence (which weekday triggers which type) is deliberately NOT encoded here -- see architecture doc's "Daily update cadence" note. */
export type SnapshotType = "initial" | "daily_update" | "gameday";
export const SNAPSHOT_TYPES: readonly SnapshotType[] = ["initial", "daily_update", "gameday"];

/** "undecided" = no opinion has been formed yet (e.g. a research-only snapshot with no analysisState). Movement is never mandatory: "pass" and "undecided" are both first-class, stable resting states, not failure states. */
export type SideLean = "home" | "away" | "pass" | "undecided";
export const SIDE_LEANS: readonly SideLean[] = ["home", "away", "pass", "undecided"];

export type TotalLean = "over" | "under" | "pass" | "undecided";
export const TOTAL_LEANS: readonly TotalLean[] = ["over", "under", "pass", "undecided"];

/**
 * The exact market spread in effect at the moment a side opinion was formed
 * -- see architecture doc's "LINE-AT-OPINION" requirement. Never collapsed
 * to a team name; two snapshots with the same lean but different lines are
 * NOT the same opinion-state for auditing purposes.
 */
export interface SpreadLineAtOpinion {
  homeLine: number | null;
  awayLine: number | null;
}

export interface SideOpinionState {
  lean: SideLean;
  /** 1-10, architecture §6 scale. Null when lean is "undecided" (no opinion yet) or "pass" (no directional confidence to report once no play is being made). */
  confidence: number | null;
  spreadLineAtOpinion: SpreadLineAtOpinion | null;
  /** WU5 -- concise, public-safe rationale prose for this market's opinion (present even when lean is "pass"). Optional so pre-WU5 snapshots on disk (written before this field existed) keep parsing unchanged. */
  rationale?: string;
}

export interface TotalOpinionState {
  lean: TotalLean;
  /** Same null convention as SideOpinionState.confidence. */
  confidence: number | null;
  totalLineAtOpinion: number | null;
  /** See SideOpinionState.rationale. */
  rationale?: string;
}

/**
 * WU5 -- provider-neutral matchup-factor/failure-mode/evidence-quality
 * shapes. Originally defined in nfl-grok-analysis-types.ts (the raw
 * provider-output contract); moved here so SnapshotAnalysisState (the
 * PERSISTED record) can reference them without nfl-grok-analysis-types.ts
 * importing back from this module. nfl-grok-analysis-types.ts re-exports
 * these verbatim for existing call sites.
 */
export const MATCHUP_FACTOR_AREAS = [
  "quarterback",
  "passing",
  "rushing",
  "protection",
  "pass_rush",
  "coverage",
  "run_defense",
  "personnel",
  "coaching",
  "situational",
  "weather",
  "market",
  "other",
] as const;
export type MatchupFactorArea = (typeof MATCHUP_FACTOR_AREAS)[number];

export const MATCHUP_FACTOR_SUPPORTS = ["home", "away", "over", "under", "mixed", "neutral"] as const;
export type MatchupFactorSupports = (typeof MATCHUP_FACTOR_SUPPORTS)[number];

export const MATCHUP_FACTOR_IMPORTANCE = ["major", "moderate", "minor"] as const;
export type MatchupFactorImportance = (typeof MATCHUP_FACTOR_IMPORTANCE)[number];

/**
 * One matchup factor. `finding` must separate FACT (traceable to
 * `evidenceIds`/`jkbContextRefs`) from INTERPRETATION (the model's own
 * football judgment) -- enforced by prompt instruction plus mechanical
 * evidenceId/jkbContextRef existence checks in nfl-grok-analysis-validator.ts.
 */
export interface MatchupFactor {
  area: MatchupFactorArea;
  finding: string;
  supports: MatchupFactorSupports;
  importance: MatchupFactorImportance;
  /** Dot-path references into the supplied NflGameContextPacket, e.g. "jkbModels.projectedSpread". Validated to exist on the actual packet. */
  jkbContextRefs: string[];
  /** Must be evidenceIds that exist, belong to this model, and are not rejected/postgame-unsafe. */
  evidenceIds: string[];
}

export interface FailureMode {
  scenario: string;
  whyItMatters: string;
}

export interface EvidenceQualityAssessment {
  strengths: string[];
  limitations: string[];
}

/**
 * WU4.5 -- the model's OWN independent fair-line projection, formed BEFORE
 * it ever compares to the market. Never derived from JKB's projectedSpread/
 * projectedTotal (nfl-full-game-context.ts's GameContextJkbModels) -- those
 * fields are deliberately withheld from Grok/ChatGPT's analysis input (see
 * nfl-grok-analysis-adapter.ts / nfl-chatgpt-analysis-adapter.ts).
 *
 * Sign convention (explicit, never an unlabeled signed number): `line` is
 * always <= 0 for the favored `team` -- e.g. `{ team: "IND", line: -1.5 }`
 * means the model favors IND by 1.5. `team` must be one of the game's two
 * teams. Both are enforced in nfl-grok-analysis-validator.ts, never trusted
 * from the raw provider payload.
 */
export interface PredictedFairSpread {
  team: string;
  line: number;
}

export interface IndependentPrediction {
  fairSpread: PredictedFairSpread;
  projectedTotal: number;
}

/**
 * WU4.6 -- TWO-STAGE MARKET-BLIND HANDICAPPER. The exact fair spread/total a
 * handicapper committed to BEFORE it was ever shown the sportsbook price
 * (Stage A of nfl-grok-analysis-adapter.ts / nfl-chatgpt-analysis-adapter.ts).
 * Persisted distinctly from `marketDecision` below so a reader can PROVE the
 * prediction was locked pre-market, not merely trust a claim in prose.
 * `fairSpread`/`projectedTotal` here are always identical to the top-level
 * `SnapshotAnalysisState`'s legacy `independentPrediction` field (which is
 * still populated, unchanged, for existing readers) -- `blindPrediction`
 * additionally carries the generation timestamp and the football-only
 * thesis text that were locked at the same moment.
 */
export interface BlindPrediction {
  /** Stage A's own generatedAt -- strictly before marketDecision.generatedAt. */
  generatedAt: string;
  fairSpread: PredictedFairSpread;
  projectedTotal: number;
  /** Football-only reasoning, written with zero knowledge of the market price. */
  footballThesis: string;
}

/** The deterministic current-market snapshot Stage B was actually shown -- built by the engine from the same authoritative market read as `SnapshotMarketRecord`, never echoed back from provider output. */
export interface MarketAtDecision {
  spread: { homeLine: number | null; awayLine: number | null };
  total: number | null;
  asOf: string | null;
}

/**
 * WU7.9 -- one named section of a long-form editorial article: a heading
 * plus one or more prose paragraphs. Used for the two offense-vs-defense
 * breakdowns, which are the only sections structured enough to warrant their
 * own heading distinct from the section title the UI already renders.
 */
export interface EditorialArticleSection {
  heading: string;
  paragraphs: string[];
}

/** One "Matchup Keys" callout -- a short, named analytical point with 1-3 sentences of explanation. `supportingStats` are prose-formatted (e.g. "41% pressure rate"), never a raw metric key/value pair. */
export interface EditorialMatchupKey {
  title: string;
  analysis: string;
  supportingStats?: string[];
}

/** One "What Could Flip the Handicap" swing factor -- a legitimate way the analyst's view could be wrong, never a generic disclaimer. */
export interface EditorialSwingFactor {
  title: string;
  analysis: string;
}

/**
 * WU7.9 -- the finished long-form public handicap article, written during
 * the SAME Stage B call that already produces side/total/marketAssessment
 * (see MarketDecisionRecord.editorialArticle below) -- no new paid provider
 * call. Pure editorial prose: this shape has no numeric fairSpread/
 * projectedTotal field of its own, so it structurally cannot carry a
 * "revised" football judgment -- Stage A's blindPrediction remains the only
 * source of those numbers, exactly as before this article existed.
 *
 * Nullable sections are a deliberate first-class "not enough validated
 * evidence to write this section" state -- never backfilled with invented
 * prose. `isLegacyPreview` is true only for a snapshot written before this
 * schema existed, whose article was assembled by the deterministic
 * nfl-legacy-editorial-adapter.ts from pre-existing thesis/factors/failure
 * modes/rationale (see that module) rather than authored by the provider in
 * one pass -- it is a preview of the new layout, never presented as the
 * provider's own finished long-form work.
 */
export interface EditorialArticle {
  isLegacyPreview: boolean;
  headline: string;
  dek: string;
  openingRead: string[];
  awayOffenseVsHomeDefense: EditorialArticleSection | null;
  homeOffenseVsAwayDefense: EditorialArticleSection | null;
  trenchesAndGameControl: string[] | null;
  personnelAndAvailability: string[] | null;
  gameScript: string[] | null;
  matchupKeys: EditorialMatchupKey[];
  swingFactors: EditorialSwingFactor[];
  sideAnalysis: string[] | null;
  totalAnalysis: string[] | null;
  finalWord: string[];
}

/**
 * WU4.6 -- the Stage B bet/pass decision, persisted as an audit record
 * distinct from the locked `blindPrediction` above. `sideEdgePoints`/
 * `totalEdgePoints` are the SAME mechanically-computed values
 * (nfl-market-edge.ts) as everywhere else in this pipeline -- never trusted
 * from provider arithmetic, and computed from `blindPrediction` (never from
 * anything Stage B itself reports as a "revised" prediction, which does not
 * structurally exist on the Stage B contract in the first place).
 *
 * `editorialArticle` is optional so every pre-WU7.9 snapshot (written before
 * this field existed) keeps parsing unchanged; those historical snapshots
 * are immutable and never backfilled -- the public presentation layer
 * synthesizes a legacy preview for them instead (see
 * nfl-legacy-editorial-adapter.ts).
 */
export interface MarketDecisionRecord {
  generatedAt: string;
  marketAtDecision: MarketAtDecision;
  side: SideOpinionState;
  total: TotalOpinionState;
  sideEdgePoints: number | null;
  totalEdgePoints: number | null;
  editorialArticle?: EditorialArticle;
}

/**
 * The model's current handicap state. Optional at the snapshot level -- a
 * research-only snapshot (no analysis pass has run yet) legitimately has
 * none. matchupFactors/failureModes/evidenceQualityAssessment are WU5
 * additions carrying concise, public-safe structured reasoning (never raw
 * provider output or hidden reasoning) -- all optional so snapshots written
 * before WU5 keep parsing unchanged. independentPrediction is a WU4.5
 * addition -- also optional so pre-WU4.5 snapshots (written before this
 * field existed) keep parsing unchanged; those historical snapshots are
 * immutable and are never backfilled. blindPrediction/marketDecision are
 * WU4.6 additions -- likewise optional; a pre-WU4.6 snapshot has
 * independentPrediction but no blindPrediction/marketDecision, and remains
 * fully valid.
 */
/**
 * WU6.8 -- distinguishes a full football re-projection (Stage A re-ran, the
 * blind prediction may have moved) from a market-only Stage-B-only
 * repricing (Stage A is byte-for-byte reused from the prior snapshot; only
 * the market decision changed). Optional so every pre-WU6.8 snapshot (which
 * never had this concept) keeps parsing unchanged -- absence does NOT imply
 * either value, it means "written before this distinction existed."
 * "initial" snapshots (no prior opinion to compare against) never set this.
 */
export type AnalysisUpdateKind = "football_update" | "market_reprice";
export const ANALYSIS_UPDATE_KINDS: readonly AnalysisUpdateKind[] = ["football_update", "market_reprice"];

export interface SnapshotAnalysisState {
  thesis: string | null;
  side: SideOpinionState;
  total: TotalOpinionState;
  matchupFactors?: MatchupFactor[];
  failureModes?: FailureMode[];
  blindPrediction?: BlindPrediction;
  marketDecision?: MarketDecisionRecord;
  evidenceQualityAssessment?: EvidenceQualityAssessment;
  independentPrediction?: IndependentPrediction;
  analysisUpdateKind?: AnalysisUpdateKind;
}

/**
 * Evidence-stream state as of this snapshot, computed purely from WU2 IDs/
 * authority status (see nfl-snapshot-evidence-delta.ts) -- never LLM-judged.
 */
export interface SnapshotEvidenceState {
  /** Every evidenceId in this model's store as of this snapshot (the full set, not just new ones). */
  evidenceIds: string[];
  /** Present in this snapshot's evidenceIds but absent from the previous snapshot's. */
  addedEvidenceIds: string[];
  /** resolveEvidenceAuthority() status "superseded" as of this snapshot. */
  supersededEvidenceIds: string[];
  /** resolveEvidenceAuthority() status "conflicting" as of this snapshot. */
  conflictingEvidenceIds: string[];
}

/** A minimal, provider-neutral read of JKB's deterministic market artifact -- see scripts/lib/nfl-full-game-context.ts's GameContextMarket, which is the authority this is derived FROM, never re-derived independently. */
export interface SnapshotMarketState {
  sportsbook: string | null;
  spread: { homeLine: number | null; awayLine: number | null };
  total: { line: number | null };
  moneyline: { homePrice: number | null; awayPrice: number | null } | null;
  /** The market read's own timestamp (observedAt/generatedAt), not this snapshot's createdAt. */
  asOf: string | null;
}

/** SnapshotMarketState plus the deterministic delta against the previous snapshot's market state -- see nfl-snapshot-market-delta.ts. All delta/previous fields are null on an "initial" snapshot (no previous state exists). */
export interface SnapshotMarketRecord extends SnapshotMarketState {
  previousSpread: { homeLine: number | null; awayLine: number | null } | null;
  previousTotal: number | null;
  spreadDelta: number | null;
  totalDelta: number | null;
  moneylineHomeDelta: number | null;
  moneylineAwayDelta: number | null;
  sportsbookChanged: boolean;
  /** current.asOf - previous.asOf, in milliseconds. Null if either timestamp is missing/unparseable. */
  asOfDeltaMs: number | null;
}

export const UPDATE_AFFECTED_AREAS = [
  "passing",
  "rushing",
  "protection",
  "pass_rush",
  "coverage",
  "run_defense",
  "usage",
  "pace",
  "weather",
  "market",
  "other",
] as const;
export type UpdateAffectedArea = (typeof UPDATE_AFFECTED_AREAS)[number];

export type DevelopmentSignificance = "major" | "moderate" | "minor" | "neutral";
export const DEVELOPMENT_SIGNIFICANCES: readonly DevelopmentSignificance[] = ["major", "moderate", "minor", "neutral"];

export type DevelopmentDirection = "home_positive" | "away_positive" | "over_positive" | "under_positive" | "mixed" | "neutral";
export const DEVELOPMENT_DIRECTIONS: readonly DevelopmentDirection[] = ["home_positive", "away_positive", "over_positive", "under_positive", "mixed", "neutral"];

/** One model-identified change since the previous snapshot. Model-generated content -- WU3.2 only types/validates this shape, never produces it. */
export interface UpdateDevelopment {
  developmentId: string;
  evidenceIds: string[];
  summary: string;
  significance: DevelopmentSignificance;
  direction: DevelopmentDirection;
  affectedAreas: UpdateAffectedArea[];
  footballImpact: string;
  marketRelevance: string;
}

export type SideChangeKind = "none" | "strengthened" | "weakened" | "changed_side" | "moved_to_pass" | "pass_to_play";
export const SIDE_CHANGE_KINDS: readonly SideChangeKind[] = ["none", "strengthened", "weakened", "changed_side", "moved_to_pass", "pass_to_play"];

export type TotalChangeKind = "none" | "strengthened" | "weakened" | "changed_total" | "moved_to_pass" | "pass_to_play";
export const TOTAL_CHANGE_KINDS: readonly TotalChangeKind[] = ["none", "strengthened", "weakened", "changed_total", "moved_to_pass", "pass_to_play"];

/** The mechanical (previous vs current lean/confidence) part is deterministic -- see nfl-snapshot-opinion-delta.ts. `explanation` is model-generated prose, typed here but never produced by WU3.2. */
export interface SideAssessment {
  previousLean: SideLean;
  currentLean: SideLean;
  change: SideChangeKind;
  previousConfidence: number | null;
  currentConfidence: number | null;
  explanation: string;
}

export interface TotalAssessment {
  previousLean: TotalLean;
  currentLean: TotalLean;
  change: TotalChangeKind;
  previousConfidence: number | null;
  currentConfidence: number | null;
  explanation: string;
}

export interface ThesisAssessment {
  changed: boolean;
  explanation: string;
}

export type OverallChange = "material" | "minor" | "none";
export const OVERALL_CHANGES: readonly OverallChange[] = ["material", "minor", "none"];

/**
 * Provider-neutral update-assessment contract (architecture doc "UPDATE
 * ASSESSMENT SCHEMA"). "No material change" is a fully valid, expected
 * outcome -- developments MAY be an empty array, thesisAssessment.changed
 * MAY be false, and both side/total change MAY be "none". Nothing here
 * requires movement.
 */
export interface UpdateAssessment {
  developments: UpdateDevelopment[];
  thesisAssessment: ThesisAssessment;
  sideAssessment: SideAssessment;
  totalAssessment: TotalAssessment;
  overallChange: OverallChange;
  conciseCommentary: string;
}

/** Ties a snapshot to the exact deterministic Game Context Packet it was built against (see nfl-full-game-context.ts). */
export interface SnapshotContextRef {
  contextVersion: string;
  contextHash: string;
  /**
   * WU3.3.1 -- the Game Context Packet's own `generatedAt`/`provenance.builtAt`
   * (the moment it was built/read, NOT this snapshot's own `createdAt`).
   * Preserved so a future update pass can prove its context was freshly
   * regenerated/read rather than reusing this snapshot's prior context
   * artifact -- see nfl-snapshot-context-freshness.ts. Null only for
   * snapshots written before this field existed.
   */
  contextGeneratedAt: string | null;
}

export interface AnalysisSnapshot {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  snapshotId: string;
  model: SnapshotModel;
  gameId: string;
  season: number;
  week: number;
  snapshotType: SnapshotType;
  /** When this snapshot record was written. */
  createdAt: string;
  /** The cutoff research was bounded to -- MUST be <= kickoff (see nfl-snapshot-lock.ts). */
  researchCutoff: string;
  kickoff: string;
  /** null only for the first ("initial") snapshot in a model's history for this game. */
  previousSnapshotId: string | null;
  context: SnapshotContextRef;
  evidence: SnapshotEvidenceState;
  market: SnapshotMarketRecord;
  /** Absent/null on a research-only snapshot -- an analysis pass has not run yet. */
  analysisState: SnapshotAnalysisState | null;
  /** Absent/null on "initial" (there is no previous snapshot to compare against) and on any snapshot an analysis pass hasn't processed yet. */
  updateAssessment: UpdateAssessment | null;
}

/**
 * Provider-neutral input a FUTURE research adapter (Grok's update mode,
 * ChatGPT's update mode) would receive for a delta-focused pass -- "what
 * materially changed after the cutoff?" instead of full re-research. No
 * Grok-specific or OpenAI-specific field belongs here; this type must stay
 * usable unchanged by both.
 */
export interface ResearchDeltaContext {
  previousSnapshotId: string | null;
  previousResearchCutoff: string | null;
  priorEvidenceIds: readonly string[];
  priorEvidenceClaims?: readonly { evidenceId: string; claim: string }[];
  /**
   * Reuses WU3.1's coverage-summary shape (nfl-grok-research-coverage.ts).
   * That module is Grok-named for its current call site, but the type
   * itself (covered/partial/none per research area) has no provider-specific
   * field -- ChatGPT's future adapter can populate/consume it unchanged.
   */
  priorCoverage?: ResearchCoverageSummary;
  previousMarketState?: SnapshotMarketState;
}
