/**
 * WU4 -- pure parsing/trust-boundary layer between OpenAI's Responses API
 * (`POST /v1/responses`, verified shape in openai-wu4-capability-probe.json)
 * and RawEvidenceCandidate[] (nfl-evidence-types.ts).
 *
 * No network, no API key. Mirrors nfl-grok-research-parsing.ts's shape
 * (separate output-parsing vs. candidate-building responsibilities) but is
 * intentionally its own module, not a shared abstraction with the Grok
 * parser -- the two providers' response shapes differ enough (OpenAI's
 * `action.sources[]` + `queries[]`, snake_case `start_index`/`end_index`
 * annotation fields, no `reasoning` output item observed) that forcing a
 * shared parser would either lose provider-specific fidelity or require
 * speculative generalization neither provider's verified shape justifies.
 *
 * ==================================================
 * CITATION TRUST DISTINCTION (see WU4 + WU4.1 work orders)
 * ==================================================
 * Two independent, non-equivalent grounding facts are tracked separately and
 * MUST NEVER be collapsed into one trust level:
 *
 *   discoveredSource -- URL appeared in some web_search_call's
 *                        `action.sources[]`. This means the provider's own
 *                        search tool actually retrieved the URL -- it is
 *                        provider-returned grounding, just not necessarily
 *                        inline-cited in the final answer text.
 *   citedSource       -- URL appeared in the final message's
 *                        `content[].annotations[]` as a `url_citation`. This
 *                        is the strictly stronger claim: the model's actual
 *                        answer text cites this specific URL.
 *
 * WU4.1 REVISION: the original WU4 policy only accepted "cited" URLs and
 * rejected "discovered_only" as untrusted. That was too strict for this
 * adapter's structured-JSON-only research prompt: OpenAI's `url_citation`
 * annotation mechanism is tied to the model writing natural-language inline
 * citations in prose, which a pure-JSON-array final answer never does --
 * so under the original policy, a structured JSON response could NEVER
 * produce a "cited" URL even when the provider's own web_search tool
 * genuinely retrieved and returned that exact URL. That conflated "not
 * inline-cited in prose" with "not grounded by the provider at all," which
 * is not the same thing.
 *
 * buildRawEvidenceCandidatesFromFindings() below now accepts a finding whose
 * claimed source URL matches EITHER a citedSource OR a discoveredSource --
 * both are provider-returned grounding, just at different strengths. A URL
 * that matches neither structure (i.e. the model typed a URL search never
 * actually returned) is still hard-rejected as "ungrounded" -- a model-typed
 * URL is never sufficient on its own, regardless of how plausible it looks.
 * The "cited" vs. "discovered" distinction is preserved on every accepted
 * candidate (see ChatGptGroundingMetadata) so downstream QA/editorial review
 * can still weigh a discovered-only source as weaker than an explicit
 * citation; it does NOT interact with or bypass WU2 source-quality policy
 * (nfl-evidence-policy.ts) -- those remain fully independent dimensions.
 */

import type { EvidenceCategory, EvidenceConfidence, EvidenceModel, EvidenceRelevanceArea, EvidenceSourceType, RawEvidenceCandidate } from "./nfl-evidence-types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * WU4 -- URL canonicalization for comparison/deduplication only. Two
 * separate fields are always kept where useful (providerReturnedUrl vs.
 * canonicalUrl) so canonicalization never destroys the exact URL the
 * provider actually returned.
 *
 * Deliberately minimal, per the work order's "do not over-canonicalize"
 * instruction:
 *   - lowercases scheme + host (URLs differing only in case there are the
 *     same resource)
 *   - removes the OpenAI-specific tracking parameter `utm_source=openai`
 *     ONLY when its value is exactly "openai" -- a generic `utm_source` with
 *     any other value is left untouched, since that could be a genuinely
 *     different (non-OpenAI-injected) tracking context
 *   - preserves every other query parameter, including other utm_* params
 *   - does not strip trailing slashes, reorder params, or resolve relative
 *     paths -- those could turn genuinely different URLs into the same
 *     canonical value
 * Returns null for a URL that fails to parse -- callers must treat that as
 * "cannot be canonicalized," never as "canonicalizes to empty string."
 */
export function canonicalizeUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    if (url.searchParams.get("utm_source") === "openai") {
      url.searchParams.delete("utm_source");
    }
    return url.toString();
  } catch {
    return null;
  }
}

export interface ChatGptDiscoveredSource {
  providerReturnedUrl: string;
  canonicalUrl: string | null;
}

export interface ChatGptCitedSource extends ChatGptDiscoveredSource {
  title: string | null;
  startIndex: number | null;
  endIndex: number | null;
}

export interface ParsedChatGptResponsesOutput {
  messageText: string | null;
  /** URLs that appeared in some web_search_call's action.sources[] -- "search saw this," not "the answer cited this." */
  discoveredSources: ChatGptDiscoveredSource[];
  /** URLs that appeared in the final message's annotations[] as url_citation -- "the final answer actually cited this." */
  citedSources: ChatGptCitedSource[];
  webSearchCallCount: number;
  /** Deduplicated action.query + action.queries[] strings across all web_search_call items, in encounter order. */
  searchQueries: string[];
  responseId: string | null;
  responseStatus: string | null;
  /**
   * `response.incomplete_details.reason` -- only meaningful when
   * responseStatus === "incomplete". OpenAI's documented reasons include
   * "max_output_tokens" (the response hit its configured output-token
   * ceiling mid-generation) and "content_filter". null when the response is
   * not incomplete, or the field was absent.
   */
  incompleteReason: string | null;
  model: string | null;
  reasoningEffort: string | null;
  createdAt: number | null;
  completedAt: number | null;
}

/**
 * Walks a raw OpenAI `/v1/responses` body. Deliberately untyped against a
 * full OpenAI SDK schema -- this defensively narrows only the fields this
 * adapter actually reads, and tolerates: multiple web_search_call items,
 * multiple message content items, multiple annotations, no citations, an
 * empty source list, and malformed/missing fields (all degrade to
 * null/empty, never thrown, except where the caller explicitly requires
 * messageText to be present -- see nfl-chatgpt-research-adapter.ts).
 */
export function parseChatGptResponsesBody(body: unknown): ParsedChatGptResponsesOutput {
  const record = isRecord(body) ? body : {};
  const items = Array.isArray(record.output) ? record.output : [];

  let messageText: string | null = null;
  const discoveredSources: ChatGptDiscoveredSource[] = [];
  const citedSources: ChatGptCitedSource[] = [];
  let webSearchCallCount = 0;
  const searchQueries: string[] = [];

  for (const item of items) {
    if (!isRecord(item)) continue;

    if (item.type === "web_search_call") {
      webSearchCallCount += 1;
      const action = isRecord(item.action) ? item.action : null;
      if (action) {
        if (typeof action.query === "string") searchQueries.push(action.query);
        if (Array.isArray(action.queries)) {
          for (const q of action.queries) if (typeof q === "string") searchQueries.push(q);
        }
        const sources = Array.isArray(action.sources) ? action.sources : [];
        for (const source of sources) {
          if (isRecord(source) && typeof source.url === "string") {
            discoveredSources.push({ providerReturnedUrl: source.url, canonicalUrl: canonicalizeUrl(source.url) });
          }
        }
      }
      continue;
    }

    if (item.type === "message" && Array.isArray(item.content)) {
      for (const block of item.content) {
        if (!isRecord(block)) continue;
        if (typeof block.text === "string") {
          messageText = messageText == null ? block.text : `${messageText}\n${block.text}`;
        }
        const annotations = Array.isArray(block.annotations) ? block.annotations : [];
        for (const annotation of annotations) {
          if (isRecord(annotation) && annotation.type === "url_citation" && typeof annotation.url === "string") {
            citedSources.push({
              providerReturnedUrl: annotation.url,
              canonicalUrl: canonicalizeUrl(annotation.url),
              title: typeof annotation.title === "string" ? annotation.title : null,
              startIndex: typeof annotation.start_index === "number" ? annotation.start_index : null,
              endIndex: typeof annotation.end_index === "number" ? annotation.end_index : null,
            });
          }
        }
      }
    }
  }

  const dedupedQueries = [...new Set(searchQueries)];
  const reasoning = isRecord(record.reasoning) ? record.reasoning : {};
  const incompleteDetails = isRecord(record.incomplete_details) ? record.incomplete_details : {};

  return {
    messageText,
    discoveredSources,
    citedSources,
    webSearchCallCount,
    searchQueries: dedupedQueries,
    responseId: typeof record.id === "string" ? record.id : null,
    responseStatus: typeof record.status === "string" ? record.status : null,
    incompleteReason: typeof incompleteDetails.reason === "string" ? incompleteDetails.reason : null,
    model: typeof record.model === "string" ? record.model : null,
    reasoningEffort: typeof reasoning.effort === "string" ? reasoning.effort : null,
    createdAt: typeof record.created_at === "number" ? record.created_at : null,
    completedAt: typeof record.completed_at === "number" ? record.completed_at : null,
  };
}

export interface ChatGptUsageTelemetry {
  inputTokens: number | null;
  cachedTokens: number | null;
  cacheWriteTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
  webSearchNumRequests: number | null;
}

/** Extracts the documented usage/tool_usage fields; missing fields degrade to null, never guessed. */
export function parseChatGptUsageTelemetry(usage: unknown, toolUsage: unknown): ChatGptUsageTelemetry {
  const u = isRecord(usage) ? usage : {};
  const inputDetails = isRecord(u.input_tokens_details) ? u.input_tokens_details : {};
  const outputDetails = isRecord(u.output_tokens_details) ? u.output_tokens_details : {};
  const t = isRecord(toolUsage) ? toolUsage : {};
  const webSearch = isRecord(t.web_search) ? t.web_search : {};

  const numOrNull = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

  return {
    inputTokens: numOrNull(u.input_tokens),
    cachedTokens: numOrNull(inputDetails.cached_tokens),
    cacheWriteTokens: numOrNull(inputDetails.cache_write_tokens),
    outputTokens: numOrNull(u.output_tokens),
    reasoningTokens: numOrNull(outputDetails.reasoning_tokens),
    totalTokens: numOrNull(u.total_tokens),
    webSearchNumRequests: numOrNull(webSearch.num_requests),
  };
}

/**
 * ==================================================
 * WU4.2 -- RAW RESPONSE DIAGNOSTICS (private, never canonical evidence)
 * ==================================================
 * Pure, deterministic functions for diagnosing whether OpenAI's raw
 * `/v1/responses` body genuinely lacks grounding metadata (provider
 * behavior) versus this adapter's parser silently dropping metadata that
 * was actually present (a parser bug). These never influence which findings
 * become RawEvidenceCandidate[] -- they exist purely so a live run's raw
 * body and this adapter's parsed view can be compared side by side.
 */

export interface ChatGptOutputItemDiagnostic {
  index: number;
  type: string | null;
  id: string | null;
  status: string | null;
  // web_search_call-specific (undefined for a non-web_search_call item):
  actionType?: string | null;
  actionQuery?: string | null;
  actionQueries?: string[];
  hasSources?: boolean;
  sourcesCount?: number;
  sourceUrls?: string[];
  // message-specific (undefined for a non-message item):
  annotationCount?: number;
  urlCitationCount?: number;
  citationUrls?: string[];
}

export interface ChatGptResponseDiagnostics {
  responseStatus: string | null;
  /** Raw `incomplete_details` value verbatim (object, null, or absent -> null) -- not re-interpreted here. */
  incompleteDetails: unknown;
  model: string | null;
  webSearchNumRequests: number | null;
  items: ChatGptOutputItemDiagnostic[];
  totals: {
    webSearchCallItemCount: number;
    queryStringCount: number;
    discoveredSourceUrlCount: number;
    citedSourceUrlCount: number;
  };
}

/**
 * Walks the SAME raw response body parseChatGptResponsesBody() consumes, but
 * reports per-item shape/counts instead of building discoveredSources/
 * citedSources -- a deliberately independent code path (not a thin wrapper
 * around parseChatGptResponsesBody) so a bug in one is unlikely to also be
 * present in the other, which is the whole point of a consistency check.
 */
export function buildChatGptResponseDiagnostics(raw: unknown): ChatGptResponseDiagnostics {
  const record = isRecord(raw) ? raw : {};
  const items = Array.isArray(record.output) ? record.output : [];
  const toolUsage = isRecord(record.tool_usage) ? record.tool_usage : {};
  const webSearchUsage = isRecord(toolUsage.web_search) ? toolUsage.web_search : {};

  const itemDiagnostics: ChatGptOutputItemDiagnostic[] = [];
  let webSearchCallItemCount = 0;
  let queryStringCount = 0;
  let discoveredSourceUrlCount = 0;
  let citedSourceUrlCount = 0;

  items.forEach((item, index) => {
    if (!isRecord(item)) {
      itemDiagnostics.push({ index, type: null, id: null, status: null });
      return;
    }
    const type = typeof item.type === "string" ? item.type : null;
    const id = typeof item.id === "string" ? item.id : null;
    const status = typeof item.status === "string" ? item.status : null;

    if (type === "web_search_call") {
      webSearchCallItemCount += 1;
      const action = isRecord(item.action) ? item.action : null;
      const actionQueries = action && Array.isArray(action.queries) ? action.queries.filter((q): q is string => typeof q === "string") : [];
      const actionSourcesRaw = action ? action.sources : undefined;
      const hasSources = Array.isArray(actionSourcesRaw);
      const sourceUrls = hasSources ? (actionSourcesRaw as unknown[]).filter((s): s is Record<string, unknown> => isRecord(s)).map((s) => (typeof s.url === "string" ? s.url : null)).filter((u): u is string => u != null) : [];
      queryStringCount += actionQueries.length + (action && typeof action.query === "string" ? 1 : 0);
      discoveredSourceUrlCount += sourceUrls.length;
      itemDiagnostics.push({
        index,
        type,
        id,
        status,
        actionType: action && typeof action.type === "string" ? action.type : null,
        actionQuery: action && typeof action.query === "string" ? action.query : null,
        actionQueries,
        hasSources,
        sourcesCount: sourceUrls.length,
        sourceUrls,
      });
      return;
    }

    if (type === "message" && Array.isArray(item.content)) {
      let annotationCount = 0;
      let urlCitationCount = 0;
      const citationUrls: string[] = [];
      for (const block of item.content) {
        if (!isRecord(block)) continue;
        const annotations = Array.isArray(block.annotations) ? block.annotations : [];
        annotationCount += annotations.length;
        for (const annotation of annotations) {
          if (isRecord(annotation) && annotation.type === "url_citation" && typeof annotation.url === "string") {
            urlCitationCount += 1;
            citationUrls.push(annotation.url);
          }
        }
      }
      citedSourceUrlCount += citationUrls.length;
      itemDiagnostics.push({ index, type, id, status, annotationCount, urlCitationCount, citationUrls });
      return;
    }

    itemDiagnostics.push({ index, type, id, status });
  });

  return {
    responseStatus: typeof record.status === "string" ? record.status : null,
    incompleteDetails: "incomplete_details" in record ? record.incomplete_details : null,
    model: typeof record.model === "string" ? record.model : null,
    webSearchNumRequests: typeof webSearchUsage.num_requests === "number" ? webSearchUsage.num_requests : null,
    items: itemDiagnostics,
    totals: { webSearchCallItemCount, queryStringCount, discoveredSourceUrlCount, citedSourceUrlCount },
  };
}

/**
 * consistent_grounded        -- raw response contains discovered and/or
 *                                cited URLs, and the parser retained all of
 *                                them (no loss).
 * consistent_provider_absent -- raw response genuinely contains zero
 *                                discovered URLs AND zero cited URLs -- this
 *                                is provider behavior, not a parser bug.
 * parser_consistency_error   -- raw response contains at least one
 *                                discovered or cited URL that the parser's
 *                                output does NOT reflect -- a real parser
 *                                bug. Never silently continue past this.
 */
export type ChatGptGroundingProvenanceStatus = "consistent_grounded" | "consistent_provider_absent" | "parser_consistency_error";

export interface ChatGptGroundingProvenance {
  status: ChatGptGroundingProvenanceStatus;
  details: string;
}

/**
 * Deterministic raw-vs-parsed comparison (WU4.2 §3). Compares
 * buildChatGptResponseDiagnostics()'s raw counts against
 * parseChatGptResponsesBody()'s actual discoveredSources/citedSources
 * arrays. This is a COUNT comparison (raw has N URLs, parser retained M),
 * not a set-equality comparison -- sufficient to catch "parser dropped
 * everything" or "parser dropped some," which is the failure mode this
 * exists to catch.
 */
export function checkRawVsParsedConsistency(
  diagnostics: ChatGptResponseDiagnostics,
  parsed: { discoveredSources: readonly ChatGptDiscoveredSource[]; citedSources: readonly ChatGptCitedSource[] }
): ChatGptGroundingProvenance {
  const rawDiscovered = diagnostics.totals.discoveredSourceUrlCount;
  const rawCited = diagnostics.totals.citedSourceUrlCount;
  const parsedDiscovered = parsed.discoveredSources.length;
  const parsedCited = parsed.citedSources.length;

  if ((rawDiscovered > 0 && parsedDiscovered === 0) || (rawCited > 0 && parsedCited === 0)) {
    return {
      status: "parser_consistency_error",
      details:
        `raw response contains ${rawDiscovered} discovered source URL(s) and ${rawCited} cited URL(s) in ` +
        `action.sources[]/annotations[], but the parser retained ${parsedDiscovered}/${parsedCited} -- this is a ` +
        "parser bug (metadata was present and was lost), not provider behavior.",
    };
  }

  if (rawDiscovered === 0 && rawCited === 0) {
    return {
      status: "consistent_provider_absent",
      details: "raw response contains zero web_search_call action.sources URLs and zero url_citation annotations -- the provider itself returned no grounding metadata for this response.",
    };
  }

  return {
    status: "consistent_grounded",
    details: `raw response contains ${rawDiscovered} discovered source URL(s) and ${rawCited} cited URL(s); the parser retained all of them.`,
  };
}

/**
 * Best-effort secret scrubber for a raw provider response body before it is
 * ever written to disk as a diagnostic artifact. OpenAI's response body
 * should never itself echo the Authorization header or API key, but this is
 * a defense-in-depth pass, not the primary control -- the primary control is
 * that this adapter never puts the API key anywhere near the response body
 * in the first place. Operates on the JSON-serialized form so it also
 * catches a secret embedded inside a nested string field, not just a
 * top-level key.
 */
export function redactSecretsFromRawResponse(raw: unknown, secrets: readonly string[]): unknown {
  const meaningfulSecrets = secrets.filter((s) => s.length >= 8);
  if (meaningfulSecrets.length === 0) return raw;
  let serialized: string;
  try {
    serialized = JSON.stringify(raw);
  } catch {
    return raw;
  }
  let redacted = serialized;
  for (const secret of meaningfulSecrets) {
    redacted = redacted.split(secret).join("[REDACTED]");
  }
  try {
    return JSON.parse(redacted);
  } catch {
    return raw;
  }
}

/** The structured finding shape ChatGPT is prompted to emit as its sole final message -- same shape Grok findings use, for a consistent normalizer contract across both models. */
export interface ChatGptResearchFinding {
  claim: string;
  category: string;
  sourceName: string;
  sourceUrl: string;
  sourceType: string;
  author?: string | null;
  publishedAt?: string | null;
  subjects?: { teams?: string[]; players?: string[]; coaches?: string[] };
  confidence?: string;
  relevance?: { summary?: string; areas?: string[] };
  quote?: { speaker: string; exactText: string } | null;
  rawExcerpt?: string | null;
}

function extractJsonArrayText(text: string): string {
  const stripped = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const start = stripped.indexOf("[");
  if (start < 0) throw new Error("No JSON array found in ChatGPT research message.");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < stripped.length; i += 1) {
    const char = stripped[i];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (char === "\\") { escaped = true; continue; }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; continue; }
    if (char === "[") depth += 1;
    if (char === "]") {
      depth -= 1;
      if (depth === 0) return stripped.slice(start, i + 1);
    }
  }
  throw new Error("Unterminated JSON array in ChatGPT research message.");
}

/** Parses the findings array out of the model's message text. Throws on malformed/missing JSON -- callers treat that as a hard research-pass failure. */
export function parseChatGptFindings(messageText: string): unknown[] {
  const jsonText = extractJsonArrayText(messageText);
  const parsed: unknown = JSON.parse(jsonText);
  if (!Array.isArray(parsed)) throw new Error("Parsed ChatGPT research JSON is not an array.");
  return parsed;
}

export interface RejectedChatGptFinding {
  finding: unknown;
  reason: string;
  /**
   * Always "ungrounded" when present -- a "discovered" match is now
   * ACCEPTED (see ChatGptGroundingMetadata), not rejected, so this field
   * only ever fires for a URL that matched neither provider structure.
   * Absent entirely for structural-shape rejections (invalid category,
   * missing claim, etc.) unrelated to grounding.
   */
  groundingState?: "ungrounded";
}

/** The three possible outcomes of matching a finding's sourceUrl against the provider's own grounding structures. "cited" is preferred when a URL matches both. */
export type ChatGptGroundingState = "cited" | "discovered" | "ungrounded";

/**
 * Provider-grounding metadata for one ACCEPTED candidate. Deliberately kept
 * separate from RawEvidenceCandidate/EvidenceRecord (nfl-evidence-types.ts)
 * rather than adding ChatGPT-specific fields to that model-agnostic WU2
 * type -- see nfl-chatgpt-research-adapter.ts's ChatGptResearchResult.grounding,
 * which is a parallel array (same index correspondence as `candidates`).
 */
export interface ChatGptGroundingMetadata {
  groundingState: Extract<ChatGptGroundingState, "cited" | "discovered">;
  providerReturnedUrl: string;
  canonicalUrl: string | null;
  /**
   * true only for "discovered"-only grounding -- weaker than an explicit
   * citation, so retained for later editorial/QA review. This is NEVER used
   * to automatically downgrade verificationStatus/source-quality (WU2 policy
   * in nfl-evidence-normalizer.ts / nfl-evidence-policy.ts is untouched by
   * this flag) -- it exists purely so the distinction is never silently lost.
   */
  groundingNeedsReview: boolean;
}

export interface BuildChatGptCandidatesResult {
  candidates: RawEvidenceCandidate[];
  /** Parallel to `candidates` (same index correspondence): grounding[i] describes candidates[i]'s provider-grounding metadata. */
  grounding: ChatGptGroundingMetadata[];
  rejected: RejectedChatGptFinding[];
}

const VALID_SOURCE_TYPES: readonly EvidenceSourceType[] = [
  "official_team",
  "official_nfl",
  "injury_report",
  "beat_reporter",
  "national_reporter",
  "sports_media",
  "weather_provider",
  "sportsbook",
  "other",
];

const VALID_CATEGORIES: readonly EvidenceCategory[] = [
  "injury",
  "availability",
  "personnel",
  "depth_chart",
  "coaching",
  "scheme",
  "usage",
  "matchup",
  "news",
  "weather",
  "market",
  "scheduling",
  "travel",
  "situational",
  "quote",
  "other",
];

const VALID_CONFIDENCE: readonly EvidenceConfidence[] = ["high", "medium", "low"];
const VALID_RELEVANCE_AREAS: readonly EvidenceRelevanceArea[] = [
  "spread",
  "total",
  "passing",
  "rushing",
  "protection",
  "pass_rush",
  "coverage",
  "run_defense",
  "usage",
  "pace",
  "scheme",
  "weather",
  "market",
  "scheduling",
  "other",
];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Structural shape-check ONLY -- category/policy/subject validation is the normalizer's job (nfl-evidence-normalizer.ts). */
function validateFindingShape(raw: unknown): { ok: true; finding: ChatGptResearchFinding } | { ok: false; reason: string } {
  if (!isRecord(raw)) return { ok: false, reason: "finding is not an object" };
  if (!isNonEmptyString(raw.claim)) return { ok: false, reason: "missing/empty claim" };
  if (!isNonEmptyString(raw.category) || !VALID_CATEGORIES.includes(raw.category as EvidenceCategory)) {
    return { ok: false, reason: `invalid category "${String(raw.category)}"` };
  }
  if (!isNonEmptyString(raw.sourceName)) return { ok: false, reason: "missing sourceName" };
  if (!isNonEmptyString(raw.sourceUrl)) return { ok: false, reason: "missing sourceUrl" };
  if (!isNonEmptyString(raw.sourceType) || !VALID_SOURCE_TYPES.includes(raw.sourceType as EvidenceSourceType)) {
    return { ok: false, reason: `invalid sourceType "${String(raw.sourceType)}"` };
  }
  if (raw.confidence != null && !VALID_CONFIDENCE.includes(raw.confidence as EvidenceConfidence)) {
    return { ok: false, reason: `invalid confidence "${String(raw.confidence)}"` };
  }
  return { ok: true, finding: raw as unknown as ChatGptResearchFinding };
}

interface ResolvedGrounding {
  state: ChatGptGroundingState;
  providerReturnedUrl: string | null;
  canonicalUrl: string | null;
}

/**
 * Matches a finding's claimed sourceUrl against both provider-returned
 * grounding structures via canonicalizeUrl(). "cited" is preferred when a
 * URL matches both citedSources and discoveredSources (which is common --
 * an actually-cited article is very often also a discovered search result).
 * A URL whose canonicalization fails, or that matches neither structure, is
 * "ungrounded" -- there is no partial credit for an unparseable or
 * model-invented URL.
 */
function resolveGrounding(url: string, discoveredSources: readonly ChatGptDiscoveredSource[], citedSources: readonly ChatGptCitedSource[]): ResolvedGrounding {
  const canonical = canonicalizeUrl(url);
  if (canonical == null) return { state: "ungrounded", providerReturnedUrl: null, canonicalUrl: null };

  const cited = citedSources.find((c) => c.canonicalUrl === canonical);
  if (cited) return { state: "cited", providerReturnedUrl: cited.providerReturnedUrl, canonicalUrl: cited.canonicalUrl };

  const discovered = discoveredSources.find((d) => d.canonicalUrl === canonical);
  if (discovered) return { state: "discovered", providerReturnedUrl: discovered.providerReturnedUrl, canonicalUrl: discovered.canonicalUrl };

  return { state: "ungrounded", providerReturnedUrl: null, canonicalUrl: null };
}

/**
 * The trust boundary: builds RawEvidenceCandidate[] from ChatGPT's structured
 * findings. Accepts a finding whose sourceUrl resolves to EITHER "cited" or
 * "discovered" (see resolveGrounding / the module header's WU4.1 citation-
 * trust revision) -- both are genuine provider-returned grounding, just at
 * different strengths, and that strength is preserved on the parallel
 * `grounding` result array, never collapsed away. Only "ungrounded" (a URL
 * neither provider structure ever returned) is rejected -- a model-typed URL
 * is never sufficient on its own, no matter how plausible it looks.
 */
export function buildRawEvidenceCandidatesFromFindings(
  rawFindings: unknown[],
  options: { model: Extract<EvidenceModel, "chatgpt">; gameId: string; discoveredSources: readonly ChatGptDiscoveredSource[]; citedSources: readonly ChatGptCitedSource[]; retrievedAt: string }
): BuildChatGptCandidatesResult {
  const candidates: RawEvidenceCandidate[] = [];
  const grounding: ChatGptGroundingMetadata[] = [];
  const rejected: RejectedChatGptFinding[] = [];

  for (const raw of rawFindings) {
    const shapeResult = validateFindingShape(raw);
    if (!shapeResult.ok) {
      rejected.push({ finding: raw, reason: shapeResult.reason });
      continue;
    }
    const finding = shapeResult.finding;

    const resolved = resolveGrounding(finding.sourceUrl, options.discoveredSources, options.citedSources);
    if (resolved.state === "ungrounded") {
      rejected.push({
        finding: raw,
        reason: `sourceUrl "${finding.sourceUrl}" was not among the URLs OpenAI's web_search actually returned (neither discovered nor cited) -- untrusted, unverifiable source`,
        groundingState: "ungrounded",
      });
      continue;
    }

    const areas = (finding.relevance?.areas ?? []).filter((a): a is EvidenceRelevanceArea => VALID_RELEVANCE_AREAS.includes(a as EvidenceRelevanceArea));

    candidates.push({
      model: options.model,
      gameId: options.gameId,
      claim: finding.claim.trim(),
      category: finding.category as EvidenceCategory,
      source: {
        name: finding.sourceName,
        url: finding.sourceUrl,
        sourceType: finding.sourceType as EvidenceSourceType,
        author: finding.author ?? null,
        publishedAt: finding.publishedAt ?? null,
        retrievedAt: options.retrievedAt,
      },
      subjects: {
        teams: finding.subjects?.teams ?? [],
        players: finding.subjects?.players ?? [],
        coaches: finding.subjects?.coaches ?? [],
      },
      confidence: (finding.confidence as EvidenceConfidence | undefined) ?? undefined,
      relevance: { summary: finding.relevance?.summary ?? "", areas },
      quote: finding.quote ?? null,
      rawExcerpt: finding.rawExcerpt ?? null,
    });
    grounding.push({
      groundingState: resolved.state as Extract<ChatGptGroundingState, "cited" | "discovered">,
      providerReturnedUrl: resolved.providerReturnedUrl as string,
      canonicalUrl: resolved.canonicalUrl,
      groundingNeedsReview: resolved.state === "discovered",
    });
  }

  return { candidates, grounding, rejected };
}
