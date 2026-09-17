/**
 * WU3.4 -- pure, deterministic validation boundary for Grok's structured
 * handicapping output. Mirrors nfl-evidence-normalizer.ts's role for
 * research evidence: normalizeExternalEvidence() is the only door a raw
 * research finding may pass through; the validate*() functions here are the
 * only doors a raw analysis proposal may pass through. No network, no API
 * key, no mutation of inputs.
 *
 * WU4.6 -- TWO-STAGE MARKET-BLIND HANDICAPPER split validation into four
 * functions instead of two:
 *
 *   validateGrokStageA()        -- the blind football projection (initial).
 *   validateGrokStageB()        -- the market decision (initial), given the
 *                                   ALREADY-LOCKED Stage A prediction.
 *   validateGrokStageAUpdate()  -- update-mode blind re-projection.
 *   validateGrokStageBUpdate()  -- update-mode market decision.
 *
 * Stage A validation resolves jkbContextRefs against the BLIND packet
 * (nfl-ai-context-sanitizer.ts's sanitizeGameContextPacketForBlindStageA) --
 * a ref into the (removed) `market` section fails the same way a bogus path
 * would. Stage B validation never re-checks or re-derives the fair
 * spread/projected total: it is handed the LOCKED Stage A prediction only to
 * compute `sideEdgePoints`/`totalEdgePoints` mechanically
 * (nfl-market-edge.ts) -- it never reads a `prediction` field off the raw
 * Stage B payload, because GrokStageBProposal has no such field to read.
 */

import { FORBIDDEN_POSTGAME_PATTERN } from "./nfl-evidence-normalizer";
import type { EvidenceModel, EvidenceRecord } from "./nfl-evidence-types";
import type { NflGameContextPacket } from "./nfl-full-game-context";
import { sanitizeGameContextPacketForBlindStageA, type AiBlindGameContextPacket } from "./nfl-ai-context-sanitizer";
import { computeSideEdgePoints, computeTotalEdgePoints } from "./nfl-market-edge";
import {
  GROK_ANALYSIS_SCHEMA_VERSION,
  MATCHUP_FACTOR_AREAS,
  MATCHUP_FACTOR_IMPORTANCE,
  MATCHUP_FACTOR_SUPPORTS,
  type EditorialArticle,
  type FailureMode,
  type GrokSideOpinion,
  type GrokStageAProposal,
  type GrokStageAUpdateProposal,
  type GrokStageAV1,
  type GrokStageBProposal,
  type GrokStageBUpdateProposal,
  type GrokStageBV1,
  type GrokTotalOpinion,
  type IndependentPrediction,
  type MarketAssessment,
  type MatchupFactor,
} from "./nfl-grok-analysis-types";
import { SIDE_LEANS, TOTAL_LEANS, type SnapshotMarketState } from "./nfl-snapshot-types";

/** The real top-level sections of the BLIND packet a jkbContextRef may point into -- deliberately excludes "market" (Stage A's packet never has that key at all). Kept as a literal list (not Object.keys at runtime) so a ref is validated against the TYPE's contract. */
const VALID_BLIND_CONTEXT_REF_PREFIXES = [
  "identity",
  "schedule",
  "jkbModels",
  "teamMetrics",
  "matchup",
  "coaching",
  "players",
  "availability",
  "situational",
  "trends",
  "weather",
] as const;

export interface GrokStageAValidationContext {
  /** WU4.4: which provider namespace this analysis must belong to ("grok" | "chatgpt"). */
  model: EvidenceModel;
  gameId: string;
  /** WU4.6.5 -- the TRUSTED orchestration timestamp for this stage, minted by the caller (e.g. `new Date().toISOString()` at the moment this stage's output is accepted). Never sourced from provider output -- validateGrokStageA()/validateGrokStageAUpdate() assign this verbatim onto the trusted shape's `generatedAt`, ignoring whatever (if anything) the raw payload supplies. */
  generatedAt: string;
  contextHash: string;
  /** The FULL context packet -- this validator sanitizes it down to the blind view internally, the same view Stage A's prompt was built from. */
  contextPacket: NflGameContextPacket;
  homeTeam: string;
  awayTeam: string;
  /** The full set of evidence records this validator may cite from -- both models included so cross-model citation can be caught and rejected, not merely absent. Market-pricing records are expected to already be excluded by the caller (nfl-ai-context-sanitizer.ts's filterEvidenceRecordsForBlindStageA) before evidenceIdsUsed/matchupFactors[].evidenceIds are checked here, but this validator does not re-derive that filter -- it only checks citation legitimacy (exists/not-rejected/pregame-safe/own-model), matching every other evidence check in this module. */
  allEvidenceRecords: readonly EvidenceRecord[];
}

export interface GrokStageBValidationContext {
  model: EvidenceModel;
  gameId: string;
  /** WU4.6.5 -- same trusted-timestamp contract as GrokStageAValidationContext.generatedAt above, for this stage. */
  generatedAt: string;
  contextHash: string;
  currentMarketState: SnapshotMarketState;
  homeTeam: string;
  /** The LOCKED Stage A prediction -- used ONLY to compute sideEdgePoints/totalEdgePoints mechanically. Stage B's raw payload is never trusted to supply or revise this. */
  lockedPrediction: IndependentPrediction;
}

export type StageAValidateResult = { ok: true; analysis: GrokStageAV1 } | { ok: false; reasons: string[] };
export type StageBValidateResult = { ok: true; analysis: GrokStageBV1 } | { ok: false; reasons: string[] };
export type StageAUpdateValidateResult = { ok: true; proposal: GrokStageAUpdateProposal } | { ok: false; reasons: string[] };
export type StageBUpdateValidateResult = { ok: true; proposal: GrokStageBUpdateProposal } | { ok: false; reasons: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isInteger1To10(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 10;
}

function containsPostgameLanguage(...texts: (string | undefined | null)[]): string | null {
  for (const text of texts) {
    if (text && FORBIDDEN_POSTGAME_PATTERN.test(text)) return text;
  }
  return null;
}

/** WU4.4: parameterized by `model` so the same index-builder serves any provider's namespace (grok, chatgpt, ...) -- never hardcoded to one model. */
function buildModelEvidenceIndex(records: readonly EvidenceRecord[], model: EvidenceModel): Map<string, EvidenceRecord> {
  return new Map(records.filter((r) => r.model === model).map((r) => [r.evidenceId, r]));
}

/** Every id in `ids` must exist in `modelEvidenceById`, and must not be rejected or postgame-unsafe. Returns violation messages, empty if all clean. */
function validateEvidenceIdCitations(ids: readonly string[], allRecords: readonly EvidenceRecord[], modelEvidenceById: Map<string, EvidenceRecord>, expectedModel: EvidenceModel, label: string): string[] {
  const reasons: string[] = [];
  const allById = new Map(allRecords.map((r) => [r.evidenceId, r]));
  for (const id of ids) {
    const record = modelEvidenceById.get(id);
    if (!record) {
      const anyRecord = allById.get(id);
      if (anyRecord && anyRecord.model !== expectedModel) {
        reasons.push(`${label} cites evidenceId "${id}" which belongs to model "${anyRecord.model}", not ${expectedModel} -- cross-model citation is forbidden`);
      } else {
        const modelLabel = expectedModel.charAt(0).toUpperCase() + expectedModel.slice(1);
        reasons.push(`${label} cites evidenceId "${id}" which does not exist in the supplied ${modelLabel} evidence set`);
      }
      continue;
    }
    if (record.verificationStatus === "rejected") {
      reasons.push(`${label} cites evidenceId "${id}" which is verificationStatus:"rejected" -- rejected evidence cannot be cited`);
    }
    if (!record.pregameSafe) {
      reasons.push(`${label} cites evidenceId "${id}" which is not pregameSafe`);
    }
  }
  return reasons;
}

/**
 * WU3.4.1 -- dangerous key names that must never be traversed, regardless of
 * whether they happen to exist on the runtime object (every JS object
 * inherits `__proto__`/`constructor`, and `Object.prototype` carries
 * `constructor`/`hasOwnProperty`/etc.). Checked per-segment so a ref cannot
 * smuggle one of these in at any depth (e.g. "market.__proto__.constructor").
 */
const FORBIDDEN_PATH_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);

/**
 * Resolves one dotted path against the actual supplied context object,
 * traversing only the object's OWN enumerable properties (never inherited/
 * prototype properties, and never the forbidden segments above). Returns
 * whether the full path resolves to a defined value. Deterministic: the
 * same (path, object) pair always produces the same result, and arrays are
 * traversed the same way as plain objects (numeric-looking segments index
 * into them via ordinary property lookup, which is exactly how JS arrays
 * already work -- no special-casing needed).
 */
function resolveContextPath(path: string, root: unknown): boolean {
  const segments = path.split(".");
  let current: unknown = root;
  for (const segment of segments) {
    if (segment.length === 0) return false;
    if (FORBIDDEN_PATH_SEGMENTS.has(segment)) return false;
    if (current === null || typeof current !== "object") return false;
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return false;
    current = (current as Record<string, unknown>)[segment];
  }
  return current !== undefined;
}

/**
 * Validates every ref as a FULL dotted path against the actual BLIND packet
 * Stage A's prompt was built from -- not merely its top-level section name.
 * A ref like "market.spread" now hard-fails not because of a special check,
 * but because "market" is not even in VALID_BLIND_CONTEXT_REF_PREFIXES and
 * the key does not exist on the blind packet at all.
 */
function validateJkbContextRefs(refs: readonly string[], packet: AiBlindGameContextPacket, label: string): string[] {
  const reasons: string[] = [];
  for (const ref of refs) {
    const topLevel = ref.split(".")[0];
    if (!VALID_BLIND_CONTEXT_REF_PREFIXES.includes(topLevel as (typeof VALID_BLIND_CONTEXT_REF_PREFIXES)[number])) {
      reasons.push(`${label} jkbContextRefs entry "${ref}" does not refer to a real Game Context Packet section`);
      continue;
    }
    if (!resolveContextPath(ref, packet)) {
      reasons.push(`${label} jkbContextRefs entry "${ref}" does not resolve to an actual value in the supplied Game Context Packet`);
    }
  }
  return reasons;
}

/**
 * WU4.4.1 -- deterministic, purely mechanical spelling/formatting aliases for
 * `MatchupFactor.area`. Every mapping here is a 1:1 rename of a legal enum
 * value (underscore vs. space/hyphen) -- never a semantic guess about which
 * category a provider's own bet-type label (e.g. "total", "side") should
 * become. An unrecognized area value must still hard-fail validation.
 */
const MATCHUP_FACTOR_AREA_ALIASES: Readonly<Record<string, MatchupFactor["area"]>> = {
  "pass rush": "pass_rush",
  "pass-rush": "pass_rush",
  "run defense": "run_defense",
  "run-defense": "run_defense",
};

function normalizeMatchupFactorArea(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (MATCHUP_FACTOR_AREAS.includes(value as MatchupFactor["area"])) return value;
  return MATCHUP_FACTOR_AREA_ALIASES[value.trim().toLowerCase()] ?? value;
}

function validateMatchupFactor(factor: unknown, index: number): { reasons: string[]; normalized: unknown } {
  const label = `matchupFactors[${index}]`;
  if (!isRecord(factor)) return { reasons: [`${label} is not an object`], normalized: factor };
  const reasons: string[] = [];
  const normalizedArea = normalizeMatchupFactorArea(factor.area);
  const normalized = { ...factor, area: normalizedArea };
  if (!MATCHUP_FACTOR_AREAS.includes(normalizedArea as MatchupFactor["area"])) reasons.push(`${label}.area "${String(factor.area)}" is invalid`);
  if (typeof factor.finding !== "string" || factor.finding.trim().length === 0) reasons.push(`${label}.finding is required`);
  if (!MATCHUP_FACTOR_SUPPORTS.includes(factor.supports as MatchupFactor["supports"])) reasons.push(`${label}.supports "${String(factor.supports)}" is invalid`);
  if (!MATCHUP_FACTOR_IMPORTANCE.includes(factor.importance as MatchupFactor["importance"])) reasons.push(`${label}.importance "${String(factor.importance)}" is invalid`);
  if (!Array.isArray(factor.jkbContextRefs)) reasons.push(`${label}.jkbContextRefs must be an array`);
  if (!Array.isArray(factor.evidenceIds)) reasons.push(`${label}.evidenceIds must be an array`);
  const postgame = containsPostgameLanguage(typeof factor.finding === "string" ? factor.finding : null);
  if (postgame) reasons.push(`${label}.finding contains postgame language: "${postgame}"`);
  return { reasons, normalized };
}

/**
 * WU7.5 -- the model is no longer asked for (and this no longer validates)
 * `currentHomeLine`/`currentAwayLine`/`currentTotal` at all: the WU7.4
 * CAR_ATL incident showed a provider can invert home/away when asked to
 * echo the market back, and there was never any information value in that
 * echo -- once validated it is guaranteed equal to the deterministic value
 * already known in code (see mechanicalizeMarketAssessment below, which now
 * attaches those three fields directly from `currentMarketState`, never
 * from the raw payload). Only `interpretation` -- genuine provider-authored
 * free text -- is still validated here.
 */
function validateMarketAssessmentAgainstContext(assessment: unknown): string[] {
  const reasons: string[] = [];
  if (!isRecord(assessment)) return ["marketAssessment is not an object"];
  if (typeof assessment.interpretation !== "string" || assessment.interpretation.trim().length === 0) reasons.push("marketAssessment.interpretation is required");
  const postgame = containsPostgameLanguage(typeof assessment.interpretation === "string" ? assessment.interpretation : null);
  if (postgame) reasons.push(`marketAssessment.interpretation contains postgame language: "${postgame}"`);
  return reasons;
}

/** WU7.5 -- attaches the authoritative deterministic market values to a validated marketAssessment,
 * mechanically overwriting sideEdgePoints/totalEdgePoints (unchanged from before WU7.5) AND
 * currentHomeLine/currentAwayLine/currentTotal (new in WU7.5 -- these are no longer ever sourced
 * from the raw payload, so a provider can no longer invert or misreport them). */
function mechanicalizeMarketAssessment(raw: { interpretation: string }, currentMarketState: SnapshotMarketState, sideEdgePoints: number | null, totalEdgePoints: number | null): MarketAssessment {
  return {
    currentHomeLine: currentMarketState.spread.homeLine,
    currentAwayLine: currentMarketState.spread.awayLine,
    currentTotal: currentMarketState.total.line,
    sideEdgePoints,
    totalEdgePoints,
    interpretation: raw.interpretation,
  };
}

/** WU7.5 -- `lineAtOpinion` is no longer asked of (or validated from) the model: when `lean` is a
 * real pick, its only correct value is always exactly `currentMarketState.spread`, so the code
 * attaches it directly rather than trusting the provider to copy it without inverting home/away. */
function mechanicalizeSideOpinion(raw: GrokSideOpinion, currentMarketState: SnapshotMarketState): GrokSideOpinion {
  const isPlay = raw.lean === "home" || raw.lean === "away";
  return {
    lean: raw.lean,
    team: isPlay ? (raw.team ?? null) : null,
    confidence: raw.confidence,
    rationale: raw.rationale,
    lineAtOpinion: isPlay ? { homeLine: currentMarketState.spread.homeLine, awayLine: currentMarketState.spread.awayLine } : null,
  };
}

/** WU7.5 -- same reasoning as mechanicalizeSideOpinion: `totalAtOpinion`'s only correct value when
 * `lean` is over/under is always exactly `currentMarketState.total.line`. */
function mechanicalizeTotalOpinion(raw: GrokTotalOpinion, currentMarketState: SnapshotMarketState): GrokTotalOpinion {
  const isPlay = raw.lean === "over" || raw.lean === "under";
  return {
    lean: raw.lean,
    confidence: raw.confidence,
    rationale: raw.rationale,
    totalAtOpinion: isPlay ? currentMarketState.total.line : null,
  };
}

/**
 * WU4.6.4 -- deterministic, purely mechanical casing normalization for
 * `PredictedFairSpread.team`. Providers naturally answer with the NFL
 * abbreviation shown in the prompt (e.g. "KC", "Den") while the internal
 * canonical game identity is lowercase (nfl-full-game-context.ts's
 * `identity.homeTeam`/`identity.awayTeam`, e.g. "kc", "den"). This performs
 * ONLY a case-insensitive match against the two ACTUAL game teams -- it is
 * never a semantic alias table. An unrelated code (e.g. "LAC" for a DEN/KC
 * game) is returned unchanged and still fails validation below.
 */
function normalizeProviderTeamCode(value: unknown, homeTeam: string, awayTeam: string): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (trimmed.toLowerCase() === homeTeam.toLowerCase()) return homeTeam;
  if (trimmed.toLowerCase() === awayTeam.toLowerCase()) return awayTeam;
  return value;
}

/**
 * Validates the model's OWN independent fair spread/total (Stage A only).
 * Sign convention is mechanically enforced here, never trusted from prose:
 * `fairSpread.team` must be one of the two actual game teams (after
 * mechanical casing normalization -- see normalizeProviderTeamCode), and
 * `fairSpread.line` must be <= 0. Returns the normalized `prediction` shape
 * so callers can persist the trusted (canonical-cased) team code rather than
 * the provider's raw casing.
 */
function validatePrediction(prediction: unknown, homeTeam: string, awayTeam: string): { reasons: string[]; normalized: unknown } {
  const reasons: string[] = [];
  if (!isRecord(prediction)) return { reasons: ["prediction is not an object"], normalized: prediction };

  const fairSpread = prediction.fairSpread;
  let normalizedFairSpread: unknown = fairSpread;
  if (!isRecord(fairSpread)) {
    reasons.push("prediction.fairSpread is not an object");
  } else {
    const normalizedTeam = normalizeProviderTeamCode(fairSpread.team, homeTeam, awayTeam);
    normalizedFairSpread = { ...fairSpread, team: normalizedTeam };
    if (normalizedTeam !== homeTeam && normalizedTeam !== awayTeam) {
      reasons.push(`prediction.fairSpread.team "${String(fairSpread.team)}" must be one of the game's teams ("${homeTeam}"/"${awayTeam}")`);
    }
    if (typeof fairSpread.line !== "number" || !Number.isFinite(fairSpread.line)) {
      reasons.push("prediction.fairSpread.line must be a finite number");
    } else if (fairSpread.line > 0) {
      reasons.push(`prediction.fairSpread.line (${fairSpread.line}) must be <= 0 -- the favored team's line is never reported as positive`);
    }
  }

  if (typeof prediction.projectedTotal !== "number" || !Number.isFinite(prediction.projectedTotal) || prediction.projectedTotal <= 0) {
    reasons.push("prediction.projectedTotal must be a finite number > 0");
  }

  return { reasons, normalized: { ...prediction, fairSpread: normalizedFairSpread } };
}

/**
 * WU7.5 -- `lineAtOpinion` is no longer part of the raw contract at all (see
 * mechanicalizeSideOpinion): the model is never asked to echo the market
 * spread back, so there is nothing here to require or cross-check anymore.
 * Only lean/confidence/rationale (and team, structurally, via `isRecord`)
 * are genuine provider judgment.
 */
function validateSideOpinion(side: unknown, label: string): string[] {
  const reasons: string[] = [];
  if (!isRecord(side)) return [`${label} is not an object`];
  if (!SIDE_LEANS.includes(side.lean as (typeof SIDE_LEANS)[number])) reasons.push(`${label}.lean "${String(side.lean)}" is invalid`);
  if (!isInteger1To10(side.confidence)) reasons.push(`${label}.confidence must be an integer 1-10`);
  if (typeof side.rationale !== "string" || side.rationale.trim().length === 0) reasons.push(`${label}.rationale is required`);
  const postgame = containsPostgameLanguage(typeof side.rationale === "string" ? side.rationale : null);
  if (postgame) reasons.push(`${label}.rationale contains postgame language: "${postgame}"`);
  return reasons;
}

/** WU7.5 -- `totalAtOpinion` is no longer part of the raw contract at all (see mechanicalizeTotalOpinion). */
function validateTotalOpinion(total: unknown, label: string): string[] {
  const reasons: string[] = [];
  if (!isRecord(total)) return [`${label} is not an object`];
  if (!TOTAL_LEANS.includes(total.lean as (typeof TOTAL_LEANS)[number])) reasons.push(`${label}.lean "${String(total.lean)}" is invalid`);
  if (!isInteger1To10(total.confidence)) reasons.push(`${label}.confidence must be an integer 1-10`);
  if (typeof total.rationale !== "string" || total.rationale.trim().length === 0) reasons.push(`${label}.rationale is required`);
  const postgame = containsPostgameLanguage(typeof total.rationale === "string" ? total.rationale : null);
  if (postgame) reasons.push(`${label}.rationale contains postgame language: "${postgame}"`);
  return reasons;
}

function validateFailureModes(modes: unknown): string[] {
  const reasons: string[] = [];
  if (!Array.isArray(modes) || modes.length < 2) {
    reasons.push("failureModes must be an array with at least 2 entries");
    return reasons;
  }
  modes.forEach((mode: unknown, index) => {
    if (!isRecord(mode) || typeof mode.scenario !== "string" || mode.scenario.trim().length === 0 || typeof mode.whyItMatters !== "string" || mode.whyItMatters.trim().length === 0) {
      reasons.push(`failureModes[${index}] must have non-empty scenario and whyItMatters strings`);
    }
  });
  return reasons;
}

function validateModelAndGameId(raw: Record<string, unknown>, context: { model: EvidenceModel; gameId: string }): string[] {
  const reasons: string[] = [];
  if (raw.model !== context.model) reasons.push(`model "${String(raw.model)}" must be "${context.model}"`);
  if (raw.gameId !== context.gameId) reasons.push(`gameId "${String(raw.gameId)}" does not match expected "${context.gameId}"`);
  return reasons;
}

/**
 * WU7.9 -- literal substrings that must never reach the reader-facing
 * article (see docs on EditorialArticle). Checked case-insensitively against
 * every prose field the editorial contract carries. This is a content gate,
 * not a UI filter -- an article containing any of these fails validation
 * outright rather than being sanitized/truncated.
 */
const BANNED_EDITORIAL_PHRASES = ["fact:", "interpretation:", "source_unavailable", "context packet", "evidence record", "supplied context", "data object", "json key", "json object", " sql ", "schema", "pipeline", "validator", "artifact"];

/** Snake_case/camelCase are essentially never legitimate English prose -- both are a strong signal of a leaked internal field name (e.g. `off_epaPerPlay`, `def_pass_rush_win_rate`). */
function containsMachineLanguage(text: string): string | null {
  const lower = text.toLowerCase();
  for (const phrase of BANNED_EDITORIAL_PHRASES) {
    if (lower.includes(phrase)) return phrase;
  }
  if (/[a-zA-Z]_[a-zA-Z]/.test(text)) return "a snake_case token";
  if (/\b[a-z]+[A-Z][a-zA-Z]*\b/.test(text)) return "a camelCase token";
  return null;
}

/** Runs containsPostgameLanguage + containsMachineLanguage against every string in `texts`, prefixing violations with `label`. */
function validateProseStrings(texts: readonly string[], label: string): string[] {
  const reasons: string[] = [];
  texts.forEach((text, index) => {
    const postgame = containsPostgameLanguage(text);
    if (postgame) reasons.push(`${label}[${index}] contains postgame language: "${postgame}"`);
    const machine = containsMachineLanguage(text);
    if (machine) reasons.push(`${label}[${index}] contains machine/internal language (${machine}): "${text}"`);
  });
  return reasons;
}

function validateNonEmptyStringArray(value: unknown, label: string): string[] {
  const reasons: string[] = [];
  if (!Array.isArray(value) || value.length === 0) {
    reasons.push(`${label} must be a non-empty array of strings`);
    return reasons;
  }
  value.forEach((entry, index) => {
    if (typeof entry !== "string" || entry.trim().length === 0) reasons.push(`${label}[${index}] must be a non-empty string`);
  });
  if (reasons.length === 0) reasons.push(...validateProseStrings(value as string[], label));
  return reasons;
}

/** Same as validateNonEmptyStringArray, but `null` (the section's "not enough validated evidence" state) is a fully valid, expected result -- never coerced to an empty array. */
function validateNullableStringArray(value: unknown, label: string): string[] {
  if (value === null) return [];
  return validateNonEmptyStringArray(value, label);
}

function validateEditorialSection(value: unknown, label: string): string[] {
  if (value === null) return [];
  if (!isRecord(value)) return [`${label} must be an object or null`];
  const reasons: string[] = [];
  if (typeof value.heading !== "string" || value.heading.trim().length === 0) reasons.push(`${label}.heading must be a non-empty string`);
  else reasons.push(...validateProseStrings([value.heading], `${label}.heading`));
  reasons.push(...validateNonEmptyStringArray(value.paragraphs, `${label}.paragraphs`));
  return reasons;
}

function validateMatchupKeys(value: unknown): string[] {
  const reasons: string[] = [];
  if (!Array.isArray(value) || value.length === 0) return ["editorialArticle.matchupKeys must be a non-empty array"];
  value.forEach((key: unknown, index) => {
    const label = `editorialArticle.matchupKeys[${index}]`;
    if (!isRecord(key)) {
      reasons.push(`${label} is not an object`);
      return;
    }
    if (typeof key.title !== "string" || key.title.trim().length === 0) reasons.push(`${label}.title must be a non-empty string`);
    if (typeof key.analysis !== "string" || key.analysis.trim().length === 0) reasons.push(`${label}.analysis must be a non-empty string`);
    else reasons.push(...validateProseStrings([key.analysis], `${label}.analysis`));
    if (key.supportingStats !== undefined) reasons.push(...validateNonEmptyStringArray(key.supportingStats, `${label}.supportingStats`));
  });
  return reasons;
}

function validateSwingFactors(value: unknown): string[] {
  const reasons: string[] = [];
  if (!Array.isArray(value) || value.length === 0) return ["editorialArticle.swingFactors must be a non-empty array"];
  value.forEach((factor: unknown, index) => {
    const label = `editorialArticle.swingFactors[${index}]`;
    if (!isRecord(factor)) {
      reasons.push(`${label} is not an object`);
      return;
    }
    if (typeof factor.title !== "string" || factor.title.trim().length === 0) reasons.push(`${label}.title must be a non-empty string`);
    if (typeof factor.analysis !== "string" || factor.analysis.trim().length === 0) reasons.push(`${label}.analysis must be a non-empty string`);
    else reasons.push(...validateProseStrings([factor.analysis], `${label}.analysis`));
  });
  return reasons;
}

/**
 * WU7.9 -- validates the Stage B-authored long-form editorial article.
 * Purely a content/shape gate: there is no numeric field anywhere on this
 * contract, so nothing here can smuggle a "revised" fair spread/total past
 * Stage A's lock. Nullable sections (the analyst's own "not enough validated
 * evidence" signal) are accepted as-is, never coerced or padded.
 */
function validateEditorialArticle(raw: unknown): string[] {
  if (!isRecord(raw)) return ["editorialArticle is not an object"];
  const reasons: string[] = [];

  if (typeof raw.headline !== "string" || raw.headline.trim().length === 0) reasons.push("editorialArticle.headline must be a non-empty string");
  else reasons.push(...validateProseStrings([raw.headline], "editorialArticle.headline"));

  if (typeof raw.dek !== "string" || raw.dek.trim().length === 0) reasons.push("editorialArticle.dek must be a non-empty string");
  else reasons.push(...validateProseStrings([raw.dek], "editorialArticle.dek"));

  reasons.push(...validateNonEmptyStringArray(raw.openingRead, "editorialArticle.openingRead"));
  reasons.push(...validateEditorialSection(raw.awayOffenseVsHomeDefense, "editorialArticle.awayOffenseVsHomeDefense"));
  reasons.push(...validateEditorialSection(raw.homeOffenseVsAwayDefense, "editorialArticle.homeOffenseVsAwayDefense"));
  reasons.push(...validateNullableStringArray(raw.trenchesAndGameControl ?? null, "editorialArticle.trenchesAndGameControl"));
  reasons.push(...validateNullableStringArray(raw.personnelAndAvailability ?? null, "editorialArticle.personnelAndAvailability"));
  reasons.push(...validateNullableStringArray(raw.gameScript ?? null, "editorialArticle.gameScript"));
  reasons.push(...validateMatchupKeys(raw.matchupKeys));
  reasons.push(...validateSwingFactors(raw.swingFactors));
  reasons.push(...validateNullableStringArray(raw.sideAnalysis ?? null, "editorialArticle.sideAnalysis"));
  reasons.push(...validateNullableStringArray(raw.totalAnalysis ?? null, "editorialArticle.totalAnalysis"));
  reasons.push(...validateNonEmptyStringArray(raw.finalWord, "editorialArticle.finalWord"));

  return reasons;
}

/** Builds the trusted EditorialArticle by explicit field selection -- never by spreading the raw payload. Call only after validateEditorialArticle() returns zero reasons. `isLegacyPreview` is always false here: this is the provider's own freshly-authored article, never the deterministic legacy adapter's output (see nfl-legacy-editorial-adapter.ts). */
function mechanicalizeEditorialArticle(raw: Record<string, unknown>): EditorialArticle {
  return {
    isLegacyPreview: false,
    headline: raw.headline as string,
    dek: raw.dek as string,
    openingRead: raw.openingRead as string[],
    awayOffenseVsHomeDefense: (raw.awayOffenseVsHomeDefense ?? null) as EditorialArticle["awayOffenseVsHomeDefense"],
    homeOffenseVsAwayDefense: (raw.homeOffenseVsAwayDefense ?? null) as EditorialArticle["homeOffenseVsAwayDefense"],
    trenchesAndGameControl: (raw.trenchesAndGameControl ?? null) as string[] | null,
    personnelAndAvailability: (raw.personnelAndAvailability ?? null) as string[] | null,
    gameScript: (raw.gameScript ?? null) as string[] | null,
    matchupKeys: raw.matchupKeys as EditorialArticle["matchupKeys"],
    swingFactors: raw.swingFactors as EditorialArticle["swingFactors"],
    sideAnalysis: (raw.sideAnalysis ?? null) as string[] | null,
    totalAnalysis: (raw.totalAnalysis ?? null) as string[] | null,
    finalWord: raw.finalWord as string[],
  };
}

/**
 * WU4.6 -- Validates one raw STAGE A (blind football projection) proposal.
 * jkbContextRefs are checked against the BLIND packet (no `market` section
 * exists on it at all), and `prediction` is validated/locked here -- nothing
 * downstream is permitted to revise it.
 */
export function validateGrokStageA(raw: unknown, context: GrokStageAValidationContext): StageAValidateResult {
  const reasons: string[] = [];
  if (!isRecord(raw)) return { ok: false, reasons: ["stage A proposal is not an object"] };

  reasons.push(...validateModelAndGameId(raw, context));
  if (typeof raw.footballThesis !== "string" || raw.footballThesis.trim().length === 0) reasons.push("footballThesis is required");
  const thesisPostgame = containsPostgameLanguage(typeof raw.footballThesis === "string" ? raw.footballThesis : null);
  if (thesisPostgame) reasons.push(`footballThesis contains postgame language: "${thesisPostgame}"`);

  let normalizedMatchupFactors: unknown = raw.matchupFactors;
  if (!Array.isArray(raw.matchupFactors) || raw.matchupFactors.length === 0) {
    reasons.push("matchupFactors must be a non-empty array");
  } else {
    normalizedMatchupFactors = raw.matchupFactors.map((factor, index) => {
      const { reasons: factorReasons, normalized } = validateMatchupFactor(factor, index);
      reasons.push(...factorReasons);
      return normalized;
    });
  }

  const predictionResult = validatePrediction(raw.prediction, context.homeTeam, context.awayTeam);
  reasons.push(...predictionResult.reasons);
  reasons.push(...validateFailureModes(raw.failureModes));

  if (!isRecord(raw.evidenceQualityAssessment) || !Array.isArray(raw.evidenceQualityAssessment.strengths) || !Array.isArray(raw.evidenceQualityAssessment.limitations)) {
    reasons.push("evidenceQualityAssessment.strengths and .limitations must be arrays");
  }

  const blindPacket = sanitizeGameContextPacketForBlindStageA(context.contextPacket);
  const modelEvidenceById = buildModelEvidenceIndex(context.allEvidenceRecords, context.model);
  const evidenceIdsUsed = Array.isArray(raw.evidenceIdsUsed) ? (raw.evidenceIdsUsed as unknown[]).filter((x): x is string => typeof x === "string") : [];
  if (!Array.isArray(raw.evidenceIdsUsed)) reasons.push("evidenceIdsUsed must be an array");
  reasons.push(...validateEvidenceIdCitations(evidenceIdsUsed, context.allEvidenceRecords, modelEvidenceById, context.model, "evidenceIdsUsed"));

  if (Array.isArray(raw.matchupFactors)) {
    raw.matchupFactors.forEach((factor, index) => {
      if (!isRecord(factor)) return;
      const factorEvidenceIds = Array.isArray(factor.evidenceIds) ? (factor.evidenceIds as unknown[]).filter((x): x is string => typeof x === "string") : [];
      reasons.push(...validateEvidenceIdCitations(factorEvidenceIds, context.allEvidenceRecords, modelEvidenceById, context.model, `matchupFactors[${index}].evidenceIds`));
      const factorRefs = Array.isArray(factor.jkbContextRefs) ? (factor.jkbContextRefs as unknown[]).filter((x): x is string => typeof x === "string") : [];
      reasons.push(...validateJkbContextRefs(factorRefs, blindPacket, `matchupFactors[${index}]`));
    });
  }

  if (reasons.length > 0) return { ok: false, reasons };

  // WU4.6.5 -- built by EXPLICIT field selection, never by spreading `raw`: a raw payload's
  // own `generatedAt` (or any other untrusted extra field) must never reach the trusted shape.
  // `generatedAt` always comes from the caller-supplied trusted orchestration timestamp.
  const analysis: GrokStageAV1 = {
    schemaVersion: GROK_ANALYSIS_SCHEMA_VERSION,
    model: context.model,
    gameId: context.gameId,
    generatedAt: context.generatedAt,
    contextHash: context.contextHash,
    evidenceIdsUsed,
    footballThesis: raw.footballThesis as string,
    matchupFactors: normalizedMatchupFactors as unknown as GrokStageAProposal["matchupFactors"],
    prediction: predictionResult.normalized as GrokStageAProposal["prediction"],
    failureModes: raw.failureModes as GrokStageAProposal["failureModes"],
    evidenceQualityAssessment: raw.evidenceQualityAssessment as GrokStageAProposal["evidenceQualityAssessment"],
  };
  return { ok: true, analysis };
}

/**
 * WU4.6 -- Validates one raw STAGE B (market decision) proposal against the
 * LOCKED Stage A prediction supplied on the context. Never re-derives or
 * accepts a "revised" prediction from the raw payload -- GrokStageBProposal
 * has no such field, and `sideEdgePoints`/`totalEdgePoints` are always
 * mechanically overwritten from `context.lockedPrediction`, never from
 * whatever the provider submitted.
 */
export function validateGrokStageB(raw: unknown, context: GrokStageBValidationContext): StageBValidateResult {
  const reasons: string[] = [];
  if (!isRecord(raw)) return { ok: false, reasons: ["stage B proposal is not an object"] };

  reasons.push(...validateModelAndGameId(raw, context));
  reasons.push(...validateMarketAssessmentAgainstContext(raw.marketAssessment));
  reasons.push(...validateSideOpinion(raw.side, "side"));
  reasons.push(...validateTotalOpinion(raw.total, "total"));
  reasons.push(...validateEditorialArticle(raw.editorialArticle));

  if (reasons.length > 0) return { ok: false, reasons };

  // WU7.5 -- market values (currentHomeLine/currentAwayLine/currentTotal, side.lineAtOpinion,
  // total.totalAtOpinion) are never trusted from the model at all anymore -- see
  // mechanicalizeMarketAssessment/mechanicalizeSideOpinion/mechanicalizeTotalOpinion. Simple
  // arithmetic (sideEdgePoints/totalEdgePoints) is likewise always computed mechanically here from
  // the LOCKED Stage A prediction against the current market. Raw Stage B fields other than
  // side/total/marketAssessment/schemaVersion/model/gameId/generatedAt/contextHash are
  // deliberately never copied onto the trusted shape -- there is no `prediction` field to
  // even consider, by construction.
  const analysis: GrokStageBV1 = {
    schemaVersion: GROK_ANALYSIS_SCHEMA_VERSION,
    model: context.model,
    gameId: context.gameId,
    // WU4.6.5 -- the trusted orchestration timestamp, never the raw payload's own `generatedAt`.
    generatedAt: context.generatedAt,
    contextHash: context.contextHash,
    side: mechanicalizeSideOpinion(raw.side as GrokSideOpinion, context.currentMarketState),
    total: mechanicalizeTotalOpinion(raw.total as GrokTotalOpinion, context.currentMarketState),
    marketAssessment: mechanicalizeMarketAssessment(
      raw.marketAssessment as { interpretation: string },
      context.currentMarketState,
      computeSideEdgePoints(context.lockedPrediction, context.homeTeam, context.currentMarketState.spread.homeLine),
      computeTotalEdgePoints(context.lockedPrediction, context.currentMarketState.total.line)
    ),
    editorialArticle: mechanicalizeEditorialArticle(raw.editorialArticle as Record<string, unknown>),
  };
  return { ok: true, analysis };
}

/** Validates one raw update-mode STAGE A (blind re-projection) proposal. Deliberately does not check previousLean/change-kind fields -- those do not exist on this shape; they are computed downstream, never asked of the model. */
export function validateGrokStageAUpdate(raw: unknown, context: GrokStageAValidationContext): StageAUpdateValidateResult {
  const reasons: string[] = [];
  if (!isRecord(raw)) return { ok: false, reasons: ["stage A update proposal is not an object"] };

  reasons.push(...validateModelAndGameId(raw, context));
  if (typeof raw.currentFootballThesis !== "string" || raw.currentFootballThesis.trim().length === 0) reasons.push("currentFootballThesis is required");
  if (typeof raw.thesisChangeExplanation !== "string") reasons.push("thesisChangeExplanation must be a string");

  const postgame = containsPostgameLanguage(typeof raw.currentFootballThesis === "string" ? raw.currentFootballThesis : null, typeof raw.thesisChangeExplanation === "string" ? raw.thesisChangeExplanation : null);
  if (postgame) reasons.push(`update proposal contains postgame language: "${postgame}"`);

  const predictionResult = validatePrediction(raw.prediction, context.homeTeam, context.awayTeam);
  reasons.push(...predictionResult.reasons);

  const modelEvidenceById = buildModelEvidenceIndex(context.allEvidenceRecords, context.model);
  const evidenceIdsUsed = Array.isArray(raw.evidenceIdsUsed) ? (raw.evidenceIdsUsed as unknown[]).filter((x): x is string => typeof x === "string") : [];
  if (!Array.isArray(raw.evidenceIdsUsed)) reasons.push("evidenceIdsUsed must be an array");
  reasons.push(...validateEvidenceIdCitations(evidenceIdsUsed, context.allEvidenceRecords, modelEvidenceById, context.model, "evidenceIdsUsed"));

  if (!Array.isArray(raw.developments)) {
    reasons.push("developments must be an array (may be empty when nothing material changed)");
  } else {
    raw.developments.forEach((dev: unknown, index) => {
      if (!isRecord(dev)) {
        reasons.push(`developments[${index}] is not an object`);
        return;
      }
      if (typeof dev.summary !== "string" || dev.summary.trim().length === 0) reasons.push(`developments[${index}].summary is required`);
      const devEvidenceIds = Array.isArray(dev.evidenceIds) ? (dev.evidenceIds as unknown[]).filter((x): x is string => typeof x === "string") : [];
      if (devEvidenceIds.length === 0) reasons.push(`developments[${index}].evidenceIds must cite at least one evidence id`);
      reasons.push(...validateEvidenceIdCitations(devEvidenceIds, context.allEvidenceRecords, modelEvidenceById, context.model, `developments[${index}].evidenceIds`));
    });
  }

  if (reasons.length > 0) return { ok: false, reasons };

  // WU4.6.5 -- built by EXPLICIT field selection, never by spreading `raw` (same reasoning as
  // validateGrokStageA above): `generatedAt` always comes from the trusted orchestration
  // timestamp on the context, never from whatever (if anything) the raw payload supplies.
  const proposal: GrokStageAUpdateProposal = {
    schemaVersion: GROK_ANALYSIS_SCHEMA_VERSION,
    model: context.model,
    gameId: context.gameId,
    generatedAt: context.generatedAt,
    contextHash: context.contextHash,
    evidenceIdsUsed,
    developments: raw.developments as GrokStageAUpdateProposal["developments"],
    currentFootballThesis: raw.currentFootballThesis as string,
    thesisChangeExplanation: raw.thesisChangeExplanation as string,
    prediction: predictionResult.normalized as GrokStageAUpdateProposal["prediction"],
  };
  return { ok: true, proposal };
}

/** Validates one raw update-mode STAGE B (market decision) proposal against the LOCKED (re-run or reaffirmed) Stage A prediction for this pass. */
export function validateGrokStageBUpdate(raw: unknown, context: GrokStageBValidationContext): StageBUpdateValidateResult {
  const reasons: string[] = [];
  if (!isRecord(raw)) return { ok: false, reasons: ["stage B update proposal is not an object"] };

  reasons.push(...validateModelAndGameId(raw, context));
  if (typeof raw.conciseCommentary !== "string" || raw.conciseCommentary.trim().length === 0) reasons.push("conciseCommentary is required");
  const postgame = containsPostgameLanguage(typeof raw.conciseCommentary === "string" ? raw.conciseCommentary : null);
  if (postgame) reasons.push(`update proposal contains postgame language: "${postgame}"`);

  reasons.push(...validateMarketAssessmentAgainstContext(raw.marketAssessment));
  reasons.push(...validateSideOpinion(raw.side, "side"));
  reasons.push(...validateTotalOpinion(raw.total, "total"));

  if (reasons.length > 0) return { ok: false, reasons };

  // WU7.5 -- see validateGrokStageB's identical comment: market values are never trusted from the
  // model, always attached mechanically from context.currentMarketState.
  const proposal: GrokStageBUpdateProposal = {
    schemaVersion: GROK_ANALYSIS_SCHEMA_VERSION,
    model: context.model,
    gameId: context.gameId,
    // WU4.6.5 -- the trusted orchestration timestamp, never the raw payload's own `generatedAt`.
    generatedAt: context.generatedAt,
    contextHash: context.contextHash,
    side: mechanicalizeSideOpinion(raw.side as GrokSideOpinion, context.currentMarketState),
    total: mechanicalizeTotalOpinion(raw.total as GrokTotalOpinion, context.currentMarketState),
    marketAssessment: mechanicalizeMarketAssessment(
      raw.marketAssessment as { interpretation: string },
      context.currentMarketState,
      computeSideEdgePoints(context.lockedPrediction, context.homeTeam, context.currentMarketState.spread.homeLine),
      computeTotalEdgePoints(context.lockedPrediction, context.currentMarketState.total.line)
    ),
    conciseCommentary: raw.conciseCommentary as string,
  };
  return { ok: true, proposal };
}

export { VALID_BLIND_CONTEXT_REF_PREFIXES };
export type { FailureMode, GrokSideOpinion, GrokTotalOpinion };
