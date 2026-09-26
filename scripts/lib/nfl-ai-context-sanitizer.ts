/**
 * WU4.5 -- TRUE INDEPENDENT HANDICAPPER ARCHITECTURE. Grokowski and Chatty
 * Ice must never see JKB's own fair-line opinion (projectedSpread/
 * projectedTotal/modelMarketEdge, nfl-full-game-context.ts's
 * GameContextJkbModels) -- only the underlying football/market DATA that
 * opinion was built from. This is enforced by construction: the sanitized
 * packet this module produces simply does not carry those keys, so there is
 * nothing for a prompt-builder to print and nothing for a jkbContextRef to
 * resolve against, regardless of prompt wording.
 *
 * `jkbModels.powerRating` remains -- it is descriptive team-strength data,
 * not a betting conclusion (no favored team, no line, no market comparison).
 *
 * WU4.6 -- TWO-STAGE MARKET-BLIND HANDICAPPER adds a SECOND, STRICTER
 * sanitizer for Stage A (the blind football projection): it removes the
 * ENTIRE `market` section (sportsbook spread/total/moneyline/movement) in
 * addition to everything WU4.5 already removes, so Stage A physically
 * cannot receive a sportsbook price of any kind -- not sanitized to null,
 * the key does not exist on the object at all. Stage B (the market
 * decision) uses the WU4.5 sanitizer plus the real `SnapshotMarketState`
 * passed separately, exactly as before.
 *
 * Used by BOTH nfl-grok-analysis-adapter.ts and
 * nfl-chatgpt-analysis-adapter.ts (building prompts) and by
 * nfl-grok-analysis-validator.ts (resolving jkbContextRefs / cross-checking
 * marketAssessment) -- the exact same sanitized view is what the model saw
 * AND what its output is checked against, so a jkbContextRef into a removed
 * field fails validation the same way an entirely bogus path would.
 */

import type { NflGameContextPacket } from "./nfl-full-game-context";
import type { CoachRecordContext, CoachingContext, EpaContext, TrenchesContext, YppContext } from "./nfl-game-context";
import type { EvidenceRecord } from "./nfl-evidence-types";

/**
 * AI Picks v2 WU2 -- the AI-visible packet is an explicit ALLOWLIST projection,
 * not "the packet minus a few keys". The model receives raw football
 * ingredients only; anything that already encodes a JKB judgment about which
 * team is better is withheld:
 *
 *   - `jkbModels` entirely: projectedSpread / projectedTotal / modelMarketEdge
 *     (WU4.5) AND powerRating (WU2 -- a composite team-strength number whose
 *     home/away gap is effectively a spread).
 *   - `players` entirely: yardage projections, matchupScore, TD scores are all
 *     JKB model outputs.
 *   - `matchup.offenseVsDefense`: a JKB-computed "home/away" advantage label.
 *   - `coaching`: the composite rating, differential and advantage team, the
 *     rating version, AND the ATS records (market-derived, so also barred from
 *     the market-blind Stage A). Descriptive coach identity and W-L records stay.
 *   - `teamMetrics.epa` / `.ypp` / `matchup.trenches` keep their raw home/away
 *     values but lose the JKB `*_advantage_team` and `*_differential` labels.
 *   - `teamMetrics.sos`: a JKB rank-derived field (always unavailable today).
 *
 * `teamForm` (nfl-team-form-facts.ts) is the current-season raw fact layer and
 * is passed through unchanged.
 *
 * Enforced by construction: the projected object simply does not carry those
 * keys, so there is nothing for a prompt-builder to print and nothing for a
 * jkbContextRef to resolve against, regardless of prompt wording.
 *
 * WU4.6 -- TWO-STAGE MARKET-BLIND HANDICAPPER adds a SECOND, STRICTER
 * sanitizer for Stage A (the blind football projection): it removes the
 * ENTIRE `market` section (sportsbook spread/total/moneyline/movement) in
 * addition to everything above, so Stage A physically cannot receive a
 * sportsbook price of any kind -- not sanitized to null, the key does not
 * exist on the object at all.
 *
 * Used by BOTH nfl-grok-analysis-adapter.ts and
 * nfl-chatgpt-analysis-adapter.ts (building prompts), by
 * nfl-grok-analysis-validator.ts (resolving jkbContextRefs / cross-checking
 * marketAssessment) and by nfl-full-game-context.ts's footballContextIdentity
 * (the Stage A rerun hash) -- the exact same sanitized view is what the model
 * saw, what its output is checked against, and what decides whether Stage A
 * must rerun.
 */

export type AiSafeEpaContext = Omit<EpaContext, "epa_advantage_team" | "epa_differential">;
export type AiSafeYppContext = Omit<YppContext, "ypp_advantage_team" | "ypp_differential">;
export type AiSafeTrenchesContext = Omit<TrenchesContext, "trenches_advantage_team" | "trenches_differential">;

/** Descriptive coach record only -- no ATS (market-derived) fields. */
export type AiSafeCoachRecord = Pick<CoachRecordContext, "career_wl" | "tenure_wl" | "season_wl" | "tenure_year" | "first_year" | "interim" | "small_sample">;

export interface AiSafeCoachingFacts {
  home_coach: string | null;
  away_coach: string | null;
  home_coach_record: AiSafeCoachRecord | null;
  away_coach_record: AiSafeCoachRecord | null;
  coaching_context_status: CoachingContext["coaching_context_status"];
}

export type AiSafeGameContextPacket = Pick<
  NflGameContextPacket,
  "identity" | "schedule" | "market" | "teamForm" | "availability" | "situational" | "trends" | "weather" | "provenance" | "generatedAt"
> & {
  teamMetrics: { epa: AiSafeEpaContext; ypp: AiSafeYppContext; periodWindow: NflGameContextPacket["teamMetrics"]["periodWindow"]; priorSeasonBaseline: NflGameContextPacket["teamMetrics"]["priorSeasonBaseline"] };
  matchup: { trenches: AiSafeTrenchesContext };
  coaching: AiSafeCoachingFacts;
};

function toAiSafeCoachRecord(record: CoachRecordContext | null): AiSafeCoachRecord | null {
  if (!record) return null;
  return {
    career_wl: record.career_wl,
    tenure_wl: record.tenure_wl,
    season_wl: record.season_wl,
    tenure_year: record.tenure_year,
    first_year: record.first_year,
    interim: record.interim,
    small_sample: record.small_sample,
  };
}

export function sanitizeGameContextPacketForAiInput(packet: NflGameContextPacket): AiSafeGameContextPacket {
  const { epa_advantage_team: _epaAdvantage, epa_differential: _epaDifferential, ...epa } = packet.teamMetrics.epa;
  const { ypp_advantage_team: _yppAdvantage, ypp_differential: _yppDifferential, ...ypp } = packet.teamMetrics.ypp;
  const { trenches_advantage_team: _trenchAdvantage, trenches_differential: _trenchDifferential, ...trenches } = packet.matchup.trenches;
  return {
    identity: packet.identity,
    schedule: packet.schedule,
    market: packet.market,
    teamForm: packet.teamForm ?? { home: null, away: null, provenance_status: "unavailable" },
    teamMetrics: { epa, ypp, periodWindow: packet.teamMetrics.periodWindow, priorSeasonBaseline: packet.teamMetrics.priorSeasonBaseline ?? { season: null, home: null, away: null, provenance_status: "unavailable" } },
    matchup: { trenches },
    coaching: {
      home_coach: packet.coaching.home_coach,
      away_coach: packet.coaching.away_coach,
      home_coach_record: toAiSafeCoachRecord(packet.coaching.home_coach_context),
      away_coach_record: toAiSafeCoachRecord(packet.coaching.away_coach_context),
      coaching_context_status: packet.coaching.coaching_context_status,
    },
    availability: packet.availability,
    situational: packet.situational,
    trends: packet.trends,
    weather: packet.weather,
    provenance: packet.provenance,
    generatedAt: packet.generatedAt,
  };
}

/** WU4.6 Stage A packet shape -- `market` is REMOVED entirely (not nulled), on top of everything AiSafeGameContextPacket already strips. */
export type AiBlindGameContextPacket = Omit<AiSafeGameContextPacket, "market">;

/**
 * Produces the packet Stage A (the blind football projection) is allowed to
 * see: the AI-safe projection above PLUS complete removal of the sportsbook
 * `market` section. There is no sportsbook spread, total, moneyline, line
 * movement, or freshness field anywhere on the returned object -- a prompt
 * builder that tried to reference `packet.market` would fail to compile/would
 * read `undefined`, not print a null.
 */
export function sanitizeGameContextPacketForBlindStageA(packet: NflGameContextPacket): AiBlindGameContextPacket {
  const { market: _market, ...blind } = sanitizeGameContextPacketForAiInput(packet);
  return blind;
}

/**
 * WU4.6 -- an evidence record counts as market-pricing commentary (and must
 * be excluded from Stage A's blind evidence set) when EITHER its category is
 * the evidence schema's own "market" category, OR its claim text contains
 * sportsbook-pricing language (a line/total/odds number, "opened at",
 * "moved to", moneyline-style prices) that a miscategorized record might
 * still carry. This is a conservative, pattern-based filter -- a false
 * positive (excluding a borderline record from Stage A) is always the safe
 * failure mode; a false negative (leaking a market number into Stage A)
 * is not acceptable, so the pattern list is intentionally broad.
 */
const MARKET_PRICING_CLAIM_PATTERN =
  /\b(spread|point\s*spread|money\s*line|moneyline|over\/under|the\s+total(\s+of)?|opening\s+line|closing\s+line|line\s+(has\s+)?moved|line\s+movement|-?\d+(\.\d+)?\s*(-\d{2,4}|\+\d{2,4})|favored\s+by\s+\d|\bo\/u\b)/i;

export function isMarketPricingEvidence(record: Pick<EvidenceRecord, "category" | "claim">): boolean {
  if (record.category === "market") return true;
  return MARKET_PRICING_CLAIM_PATTERN.test(record.claim);
}

/**
 * Filters a full evidence-record set down to what Stage A may cite, by
 * removing every market-pricing record BEFORE the caller builds citable
 * lines from it (nfl-grok-analysis-adapter.ts's/nfl-chatgpt-analysis-adapter.ts's
 * buildCitableEvidenceLines(filterEvidenceRecordsForBlindStageA(records), authority)) --
 * filtering records first, rather than post-filtering an already-built lines
 * array, avoids any risk of index misalignment between the two.
 */
export function filterEvidenceRecordsForBlindStageA(records: readonly EvidenceRecord[]): EvidenceRecord[] {
  return records.filter((record) => !isMarketPricingEvidence(record) && !isBettingOpinionEvidence(record));
}

/**
 * AI Picks v2 WU3 -- external research is FACT INPUT (injuries, participation,
 * QB status, personnel, weather, credible team/NFL reporting), never a way to
 * outsource the pick. A record whose claim is someone's betting opinion --
 * a pick or prediction, "best bet", public/sharp action, ATS trends, a
 * consensus or model win probability -- is excluded from every v2 handicap
 * stage. Like the market-pricing filter this is deliberately broad: excluding a
 * borderline record is the safe failure mode; letting an outside pick steer the
 * handicap is not.
 */
const BETTING_OPINION_CLAIM_PATTERN =
  /\b(best bets?|betting (?:pick|tip|trend|angle|percentages?|public|handle)|public (?:money|betting|action)|sharp (?:money|action|bettors?|side)|sharps|smart money|against the spread|ATS|covers? the (?:spread|number)|(?:experts?|analysts?|consensus|models?|FPI)\s+(?:picks?|predicts?|predictions?|projects?|projections?)|win probability|chances? to win|to (?:win|cover) (?:by|the))\b/i;

export function isBettingOpinionEvidence(record: Pick<EvidenceRecord, "claim">): boolean {
  return BETTING_OPINION_CLAIM_PATTERN.test(record.claim);
}

/** Stage B's evidence set: market-pricing commentary is redundant (the deterministic market is supplied) but harmless; outside betting opinion is not allowed. */
export function filterEvidenceRecordsForStageBV2(records: readonly EvidenceRecord[]): EvidenceRecord[] {
  return records.filter((record) => !isBettingOpinionEvidence(record));
}

/**
 * WU4.6.1 -- STAGE A MARKET-BLIND AUDIT DIAGNOSTICS.
 *
 * The original defense-in-depth audit (run-nfl-grok-handicap.ts /
 * run-nfl-chatgpt-handicap.ts's now-removed local
 * auditStageAPromptHasNoMarketPricing()) failed BOTH providers on the first
 * live WU4.6 run even though no leak existed. Root cause: it rejected the
 * prompt on ANY occurrence of the quoted substring `"market"`, and Stage
 * A's own output-schema instructions legitimately say
 * `there is no "market" section to reference; it was never supplied to you`
 * (nfl-grok-analysis-adapter.ts's/nfl-chatgpt-analysis-adapter.ts's
 * BLIND_OUTPUT_DISCIPLINE) -- a sentence that EXISTS to reinforce
 * blindness, not a leak of it. A naive substring check cannot tell
 * instructional prose about market-blindness apart from an actual leaked
 * price, so it isn't safe defense-in-depth; it just breaks the feature.
 *
 * This module replaces that check with two layers:
 *   1. STRUCTURAL assertions on the parsed objects BEFORE they are ever
 *      serialized into a prompt (assertBlindPacketHasNoMarketLeakage /
 *      assertBlindEvidenceHasNoMarketPricing) -- the real source of truth,
 *      since a leak can only originate from one of these two objects.
 *   2. A narrow, pattern-based scan of the final prompt STRING
 *      (auditStageAPromptForMarketPricing) that only matches
 *      identifiers/shapes that are structurally impossible to appear in
 *      Stage A's own legitimate instructions or output-schema example --
 *      e.g. `currentHomeLine` (a Stage-B-only field name), a serialized
 *      `"market":` object key, or the actual current sportsbook
 *      spread/total numbers appearing in a `spread(home)=`/`total=`
 *      assignment shape (Stage B's prompt format, never Stage A's). It
 *      never matches on the bare word/quoted word "market", "sportsbook",
 *      "market-blind", or generic football statistics -- those are exactly
 *      the false-positive class that broke the first live run.
 */

export interface StageAAuditFinding {
  /** The pattern/rule name that matched, or "structural" for a Part-C object-level check. */
  matched: string;
  /** A short surrounding excerpt -- never the full prompt, and never a secret (this is Stage A's own local prompt text/evidence claims, not a credential). */
  snippet: string;
  sourceClass: "context" | "evidence" | "prompt_instructions" | "schema_example" | "other";
  /** Always true for a finding this module reports -- every pattern here is scoped to be leak-only; nothing it matches is a known-safe false positive. */
  isRealLeak: boolean;
}

export interface StageAAuditResult {
  pass: boolean;
  findings: StageAAuditFinding[];
}

/** JKB judgment keys that must never appear on the AI-visible packet, however nested: a composite rating, an advantage label, a differential, or a model projection/score. */
const FORBIDDEN_BLIND_KEYS: readonly string[] = [
  "jkbModels",
  "projectedSpread",
  "projectedTotal",
  "modelMarketEdge",
  "powerRating",
  "offenseVsDefense",
  "players",
  "yardageProjections",
  "matchupScore",
  "tdScores",
  "tdScore",
  "epa_advantage_team",
  "epa_differential",
  "ypp_advantage_team",
  "ypp_differential",
  "trenches_advantage_team",
  "trenches_differential",
  "home_coaching_rating",
  "away_coaching_rating",
  "coaching_differential",
  "coaching_advantage_team",
  "sos",
  "home_coach_context",
  "away_coach_context",
];

function collectForbiddenKeyPaths(value: unknown, path: string, out: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectForbiddenKeyPaths(item, `${path}[${index}]`, out));
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_BLIND_KEYS.includes(key)) out.push(childPath);
    collectForbiddenKeyPaths(child, childPath, out);
  }
}

/** Part C -- structural check #1: the blind packet itself must never carry a `market` key, any JKB fair-line field, or any JKB composite/advantage/projection field at any depth. */
export function assertBlindPacketHasNoMarketLeakage(packet: AiBlindGameContextPacket): string[] {
  const issues: string[] = [];
  if ("market" in (packet as unknown as Record<string, unknown>)) issues.push('blind Stage A packet still carries a top-level "market" key');
  const forbidden: string[] = [];
  collectForbiddenKeyPaths(packet, "", forbidden);
  for (const path of forbidden) issues.push(`blind Stage A packet still carries JKB judgment field "${path}"`);
  return issues;
}

/** Part C -- structural check #2: every evidence record actually handed to Stage A must not be market-pricing commentary. */
export function assertBlindEvidenceHasNoMarketPricing(records: readonly EvidenceRecord[]): string[] {
  return records
    .filter((r) => isMarketPricingEvidence(r) || isBettingOpinionEvidence(r))
    .map((r) => `evidence record ${r.evidenceId} (category=${r.category}) is market-pricing or betting-opinion commentary and must not reach Stage A: "${r.claim}"`);
}

interface StageAPromptLeakPattern {
  name: string;
  pattern: RegExp;
  sourceClass: StageAAuditFinding["sourceClass"];
}

/**
 * Every pattern here matches a shape that only occurs when a real
 * sportsbook/JKB-fair-line figure has been serialized into the prompt --
 * never a shape that appears in Stage A's own legitimate instructions,
 * anti-hallucination rules, or JSON output-schema example (verified against
 * buildStageAInitialPrompt/buildStageAUpdatePrompt's literal text for both
 * providers). In particular this deliberately does NOT match the bare word
 * "market" (quoted or not), "sportsbook" on its own, "market-blind", or
 * "fair spread" -- those appear legitimately in Stage A's own blindness
 * instructions.
 */
const STAGE_A_PROMPT_LEAK_PATTERNS: readonly StageAPromptLeakPattern[] = [
  { name: "serialized-market-object-key", pattern: /"market"\s*:\s*[{[]/, sourceClass: "context" },
  { name: "jkb-projected-spread-path", pattern: /jkbModels\.projectedSpread/i, sourceClass: "context" },
  { name: "jkb-projected-total-path", pattern: /jkbModels\.projectedTotal/i, sourceClass: "context" },
  { name: "jkb-model-market-edge", pattern: /modelMarketEdge/i, sourceClass: "context" },
  // currentHomeLine/currentAwayLine/currentTotal are Stage B-only field names (buildStageBInitialPrompt's marketAssessment schema) -- they never appear anywhere in a legitimate Stage A prompt.
  { name: "stage-b-current-home-line-field", pattern: /currentHomeLine/, sourceClass: "context" },
  { name: "stage-b-current-away-line-field", pattern: /currentAwayLine/, sourceClass: "context" },
  { name: "stage-b-current-total-field", pattern: /currentTotal\b/, sourceClass: "context" },
  // Stage B's own current-market summary line format ("sportsbook=X spread(home)=Y total=Z asOf=W") -- structurally impossible in a Stage A prompt, unlike the bare word "sportsbook" which Stage A's blindness instructions legitimately use.
  { name: "stage-b-sportsbook-value-assignment", pattern: /sportsbook=\S/, sourceClass: "context" },
  { name: "stage-b-spread-home-assignment", pattern: /spread\(home\)=-?\d/, sourceClass: "context" },
  { name: "stage-b-total-assignment", pattern: /(?<!projected)total=-?\d/i, sourceClass: "context" },
  { name: "moneyline-odds-value", pattern: /money\s*line\D{0,15}[+-]\d{2,4}\b/i, sourceClass: "evidence" },
  // A team abbreviation directly followed by a signed number reads as a real spread line (e.g. "BAL -3.5", "IND +3.5") -- a JKB football-data metric never carries this shape.
  { name: "team-abbr-signed-spread", pattern: /\b(ARI|ATL|BAL|BUF|CAR|CHI|CIN|CLE|DAL|DEN|DET|GB|HOU|IND|JAX|KC|LAC|LAR|LV|MIA|MIN|NE|NO|NYG|NYJ|PHI|PIT|SEA|SF|TB|TEN|WAS)\s[+-]\d+(\.\d+)?\b/, sourceClass: "evidence" },
  // "total 47.5"/"total of 47.5" in prose reads as a sportsbook over/under -- distinct from a bare stat number (e.g. "yards/play 6.1") which never pairs with the word "total".
  { name: "prose-total-figure", pattern: /\btotal\s+(?:of\s+)?\d{2}(?:\.\d)?\b/i, sourceClass: "evidence" },
];

function snippetAround(haystack: string, index: number, matchLength: number): string {
  const start = Math.max(0, index - 40);
  const end = Math.min(haystack.length, index + matchLength + 40);
  return haystack.slice(start, end);
}

/**
 * The full Stage A audit: structural checks on the packet/evidence Stage A
 * was actually given, PLUS a narrow scan of the fully-built prompt string
 * for shapes that can only mean a real leak. Called BEFORE any provider API
 * request is sent (run-nfl-grok-handicap.ts / run-nfl-chatgpt-handicap.ts)
 * and by the no-cost dry-run diagnostic (scripts/diagnose-stage-a-audit.ts).
 */
export function auditStageAPromptForMarketPricing(
  prompt: string,
  blindPacket: AiBlindGameContextPacket,
  blindEvidenceRecords: readonly EvidenceRecord[]
): StageAAuditResult {
  const findings: StageAAuditFinding[] = [];

  for (const issue of assertBlindPacketHasNoMarketLeakage(blindPacket)) {
    findings.push({ matched: "structural-packet", snippet: issue, sourceClass: "context", isRealLeak: true });
  }
  for (const issue of assertBlindEvidenceHasNoMarketPricing(blindEvidenceRecords)) {
    findings.push({ matched: "structural-evidence", snippet: issue, sourceClass: "evidence", isRealLeak: true });
  }

  for (const { name, pattern, sourceClass } of STAGE_A_PROMPT_LEAK_PATTERNS) {
    const match = pattern.exec(prompt);
    if (match) {
      findings.push({ matched: name, snippet: snippetAround(prompt, match.index, match[0].length), sourceClass, isRealLeak: true });
    }
  }

  return { pass: findings.length === 0, findings };
}
