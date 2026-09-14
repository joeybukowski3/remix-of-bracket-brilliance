/**
 * WU3 -- pure parsing/trust-boundary layer between xAI's Agent Tools API
 * (`POST /v1/responses`) and RawEvidenceCandidate[] (nfl-evidence-types.ts).
 *
 * No network, no API key. Two responsibilities, kept separate on purpose:
 *
 * 1. parseResponsesOutput() walks the provider's `response.output[]` array
 *    (items: "reasoning" | "web_search_call" | "message") and extracts the
 *    final message text plus the citation URLs the API itself attached via
 *    `content[].annotations[].url_citation`. Those citation URLs are the
 *    ONLY source-of-truth for "xAI actually found this page" -- nothing else
 *    in the response is trusted for that fact.
 *
 * 2. buildRawEvidenceCandidatesFromFindings() takes the structured JSON
 *    findings list Grok is prompted to emit as its final message and maps
 *    each one to a RawEvidenceCandidate -- but ONLY if that finding's
 *    claimed source URL appears in the citation URLs from (1). A finding
 *    whose URL was never actually returned by the API's own search/citation
 *    mechanism is rejected outright, never silently trusted on the model's
 *    say-so. This is the "do not trust provider prose merely because it is
 *    cited" boundary called for in the architecture doc.
 */

import type { EvidenceCategory, EvidenceConfidence, EvidenceModel, EvidenceRelevanceArea, EvidenceSourceType, RawEvidenceCandidate } from "./nfl-evidence-types";

export interface ParsedResponsesOutput {
  messageText: string | null;
  citationUrls: string[];
  webSearchCallCount: number;
  reasoningItemCount: number;
  searchQueries: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Walks a raw `response.output[]` array. Deliberately untyped against a full
 * xAI SDK schema (none is published) -- this defensively narrows only the
 * fields this adapter actually reads.
 */
export function parseResponsesOutput(output: unknown): ParsedResponsesOutput {
  const items = Array.isArray(output) ? output : [];

  let messageText: string | null = null;
  const citationUrls: string[] = [];
  let webSearchCallCount = 0;
  let reasoningItemCount = 0;
  const searchQueries: string[] = [];

  for (const item of items) {
    if (!isRecord(item)) continue;

    if (item.type === "reasoning") {
      reasoningItemCount += 1;
      continue;
    }

    if (item.type === "web_search_call") {
      webSearchCallCount += 1;
      const action = isRecord(item.action) ? item.action : null;
      if (action && typeof action.query === "string") searchQueries.push(action.query);
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
            citationUrls.push(annotation.url);
          }
        }
      }
    }
  }

  return { messageText, citationUrls, webSearchCallCount, reasoningItemCount, searchQueries };
}

export interface GrokUsageTelemetry {
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  cachedTokens: number | null;
  totalTokens: number | null;
  serverSideToolCalls: number | null;
  webSearchCalls: number | null;
  costInUsdTicks: number | null;
}

/** Extracts the documented usage/cost fields; missing fields degrade to null, never guessed. */
export function parseUsageTelemetry(usage: unknown): GrokUsageTelemetry {
  const u = isRecord(usage) ? usage : {};
  const details = isRecord(u.output_tokens_details) ? u.output_tokens_details : {};
  const inputDetails = isRecord(u.input_tokens_details) ? u.input_tokens_details : {};
  const toolDetails = isRecord(u.server_side_tool_usage_details) ? u.server_side_tool_usage_details : {};

  const numOrNull = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

  return {
    inputTokens: numOrNull(u.input_tokens),
    outputTokens: numOrNull(u.output_tokens),
    reasoningTokens: numOrNull(details.reasoning_tokens),
    cachedTokens: numOrNull(inputDetails.cached_tokens),
    totalTokens: numOrNull(u.total_tokens),
    serverSideToolCalls: numOrNull(u.num_server_side_tools_used),
    webSearchCalls: numOrNull(toolDetails.web_search_calls),
    costInUsdTicks: numOrNull(u.cost_in_usd_ticks),
  };
}

/** The structured finding shape Grok is prompted to emit as its sole final message. */
export interface GrokResearchFinding {
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
  if (start < 0) throw new Error("No JSON array found in Grok research message.");
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
  throw new Error("Unterminated JSON array in Grok research message.");
}

/** Parses the findings array out of the model's message text. Throws on malformed/missing JSON -- callers treat that as a hard research-pass failure. */
export function parseGrokFindings(messageText: string): unknown[] {
  const jsonText = extractJsonArrayText(messageText);
  const parsed: unknown = JSON.parse(jsonText);
  if (!Array.isArray(parsed)) throw new Error("Parsed Grok research JSON is not an array.");
  return parsed;
}

export interface RejectedFinding {
  finding: unknown;
  reason: string;
}

export interface BuildCandidatesResult {
  candidates: RawEvidenceCandidate[];
  rejected: RejectedFinding[];
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

/**
 * Structural shape-check ONLY -- category/policy/subject validation is the
 * normalizer's job (nfl-evidence-normalizer.ts). This just confirms the raw
 * JSON item has the fields required to construct a well-formed
 * RawEvidenceCandidate at all.
 */
function validateFindingShape(raw: unknown): { ok: true; finding: GrokResearchFinding } | { ok: false; reason: string } {
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
  return { ok: true, finding: raw as unknown as GrokResearchFinding };
}

/**
 * The trust boundary: builds RawEvidenceCandidate[] from Grok's structured
 * findings, but REJECTS any finding whose sourceUrl is not present in
 * citationUrls (the URLs xAI's own annotations actually attested to). This
 * is intentionally stricter than "the model said it has a source" -- a
 * finding that cites a URL the search tool never actually surfaced is
 * treated the same as an uncited claim.
 */
export function buildRawEvidenceCandidatesFromFindings(
  rawFindings: unknown[],
  options: { model: EvidenceModel; gameId: string; citationUrls: readonly string[]; retrievedAt: string }
): BuildCandidatesResult {
  const citationUrlSet = new Set(options.citationUrls);
  const candidates: RawEvidenceCandidate[] = [];
  const rejected: RejectedFinding[] = [];

  for (const raw of rawFindings) {
    const shapeResult = validateFindingShape(raw);
    if (!shapeResult.ok) {
      rejected.push({ finding: raw, reason: shapeResult.reason });
      continue;
    }
    const finding = shapeResult.finding;

    if (!citationUrlSet.has(finding.sourceUrl)) {
      rejected.push({
        finding: raw,
        reason: `sourceUrl "${finding.sourceUrl}" was not among the URLs xAI's web_search citations actually returned -- untrusted, unverifiable source`,
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
  }

  return { candidates, rejected };
}
