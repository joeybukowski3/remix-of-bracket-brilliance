/**
 * WU4 (docs/nfl-grok-chatgpt-handicap-architecture.md §11, research pass) --
 * ChatGPT research adapter targeting OpenAI's Responses API
 * (`POST https://api.openai.com/v1/responses`, `tools: [{ type: "web_search" }]`),
 * confirmed live by a mandatory capability probe
 * (openai-wu4-capability-probe.json).
 *
 * This is the ChatGPT counterpart to nfl-grok-research-adapter.ts. It is
 * deliberately a SEPARATE module, not a generalized shared adapter -- see
 * nfl-chatgpt-research-parsing.ts's header comment for why the two response
 * shapes don't justify forcing a shared abstraction.
 *
 * MODEL ISOLATION (work order requirement): this module and everything it
 * imports never reads or references `data/nfl/analysis/**\/grok/` in any
 * form. `runChatGptResearch()`'s `model` parameter is typed as the literal
 * `"chatgpt"` (not the general `EvidenceModel` union Grok's adapter accepts)
 * specifically so a caller cannot accidentally pass `"grok"` through this
 * pipeline -- see the runtime guard below, which throws defensively even
 * though the type system already prevents this at compile time.
 *
 * STRUCTURED OUTPUT: the WU4 work order asks for OpenAI's native structured
 * output (`text.format: { type: "json_schema", ... }`) to be attempted
 * first. This adapter deliberately does NOT use that feature. The verified
 * capability probe's request used `text.format.type: "text"` -- native
 * structured output was never exercised together with `tools: [{ type:
 * "web_search" }]` in this repo's environment, and this codebase's existing
 * precedent (see nfl-grok-research-config.ts's header comment on `max_turns`)
 * is to never encode an unverified assumption into a production request
 * shape. Instead this adapter reuses the SAME proven pattern
 * nfl-grok-research-adapter.ts already uses successfully: the prompt itself
 * instructs the model to reply with only a JSON array, which is then parsed
 * defensively (nfl-chatgpt-research-parsing.ts's parseChatGptFindings). This
 * satisfies "prefer structured output over letting free-form prose become
 * canonical evidence" (the JSON array IS the canonical structure; nothing
 * outside it is ever trusted) without gambling a real API call on an
 * unverified request-shape combination.
 *
 * Cost discipline: exactly one HTTP request per runChatGptResearch() call,
 * bounded by max_output_tokens (see nfl-chatgpt-research-config.ts). Never
 * retries with a bigger budget on its own judgment.
 */

import type { EvidenceModel, RawEvidenceCandidate } from "./nfl-evidence-types";
import { resolveChatGptResearchConfig, type ChatGptResearchConfig, type ChatGptResearchMode } from "./nfl-chatgpt-research-config";
import {
  buildChatGptResponseDiagnostics,
  buildRawEvidenceCandidatesFromFindings,
  checkRawVsParsedConsistency,
  parseChatGptFindings,
  parseChatGptResponsesBody,
  parseChatGptUsageTelemetry,
  redactSecretsFromRawResponse,
  type ChatGptCitedSource,
  type ChatGptDiscoveredSource,
  type ChatGptGroundingMetadata,
  type ChatGptGroundingProvenance,
  type ChatGptResponseDiagnostics,
  type RejectedChatGptFinding,
} from "./nfl-chatgpt-research-parsing";
import { summarizeResearchCoverage, type ResearchCoverageSummary } from "./nfl-grok-research-coverage";
import type { ResearchDeltaContext, SnapshotMarketState } from "./nfl-snapshot-types";

const RESPONSES_API_URL = "https://api.openai.com/v1/responses";

export interface ChatGptResearchGameFacts {
  gameId: string;
  season: number;
  week: number;
  homeTeam: string; // teams.json abbr, lowercase
  awayTeam: string;
  homeTeamFull: string;
  awayTeamFull: string;
  kickoffUtc: string;
  isDome: boolean;
}

export interface ChatGptResearchInput {
  mode: ChatGptResearchMode;
  game: ChatGptResearchGameFacts;
  apiKey: string;
  /** Fixed to the literal "chatgpt" -- see this module's header comment on model isolation. */
  model: Extract<EvidenceModel, "chatgpt">;
  configOverrides?: Partial<Omit<ChatGptResearchConfig, "mode">>;
  /**
   * WU4.3 -- required for mode:"update", ignored otherwise. Reuses WU3.2's
   * provider-neutral ResearchDeltaContext unchanged (nfl-snapshot-types.ts) --
   * no ChatGPT-specific delta type exists, mirroring Grok's update mode.
   */
  deltaContext?: ResearchDeltaContext;
  /**
   * WU4.3 -- required for mode:"update". The CURRENT deterministic market
   * read (from JKB's market artifact) -- included in the prompt so ChatGPT
   * never has to search for it, and never asked to explain a move without
   * sourced evidence.
   */
  currentMarketState?: SnapshotMarketState;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable for tests; defaults to Date.now-based ISO timestamp. */
  now?: () => Date;
}

export interface ChatGptResearchTelemetry {
  mode: ChatGptResearchMode;
  model: string;
  reasoningEffort: string | null;
  configuredMaxOutputTokens: number | null;
  httpStatus: number | null;
  latencyMs: number;
  responseId: string | null;
  responseStatus: string | null;
  /** `response.incomplete_details.reason` when responseStatus === "incomplete" (e.g. "max_output_tokens"); null otherwise. */
  incompleteReason: string | null;
  actualWebSearchCalls: number | null;
  searchQueries: readonly string[];
  usage: {
    inputTokens: number | null;
    cachedTokens: number | null;
    cacheWriteTokens: number | null;
    outputTokens: number | null;
    reasoningTokens: number | null;
    totalTokens: number | null;
  };
  webSearchNumRequests: number | null;
  /** True only when this result reflects the second (retry) request of the truncation-retry policy below. */
  wasTruncationRetry: boolean;
}

/**
 * Discriminates WHY a request failed, distinct from the human-readable
 * `error` string. `provider_output_truncated` specifically means: the HTTP
 * request itself succeeded, but OpenAI's response has `status: "incomplete"`
 * with `incomplete_details.reason: "max_output_tokens"` -- the model ran out
 * of output budget mid-generation. This must never be reported merely as
 * "malformed_json", even though a truncated findings array also fails JSON
 * parsing -- the two failure causes require different remediation (raise the
 * budget / retry, vs. fix the prompt or normalizer).
 */
export type ChatGptResearchErrorType =
  | "http_error"
  | "network_error"
  | "invalid_json_body"
  | "no_message_text"
  | "provider_output_truncated"
  | "malformed_json"
  /**
   * WU4.3 -- mode:"update" was requested without both deltaContext and
   * currentMarketState. Caught BEFORE any HTTP request is made (see the
   * guard at the top of runChatGptResearch) -- a delta-focused update pass
   * cannot run without knowing what came before, mirroring Grok's identical
   * guard in nfl-grok-research-adapter.ts.
   */
  | "missing_update_context"
  /**
   * WU4.2 -- the raw response body contains at least one discovered/cited
   * source URL that parseChatGptResponsesBody() failed to retain. This is a
   * parser bug detected at runtime, not a provider-behavior or trust-policy
   * outcome -- per WU4.2 §3 ("do not silently continue"), the adapter fails
   * closed rather than quietly returning fewer accepted candidates than the
   * raw response actually supports.
   */
  | "parser_consistency_error";

/**
 * WU4.1 -- separates "how many findings did the model return" from "how many
 * survived which stage," so these counts are never collapsed into a single
 * citation count. findingsReturned counts every element of the parsed JSON
 * array (before any validation); groundedByCitation/groundedByDiscoveredSource
 * partition the accepted candidates by grounding strength (mutually
 * exclusive, "cited" preferred when both apply -- see resolveGrounding in
 * nfl-chatgpt-research-parsing.ts); ungroundedRejected and structurallyRejected
 * partition the rejected findings by cause. All five always sum to
 * findingsReturned.
 */
export interface ChatGptGroundingSummary {
  findingsReturned: number;
  groundedByCitation: number;
  groundedByDiscoveredSource: number;
  ungroundedRejected: number;
  structurallyRejected: number;
}

export type ChatGptResearchResult =
  | {
      ok: true;
      candidates: RawEvidenceCandidate[];
      /** Parallel to `candidates` (same index correspondence): per-candidate provider-grounding metadata. */
      grounding: ChatGptGroundingMetadata[];
      rejectedFindings: RejectedChatGptFinding[];
      groundingSummary: ChatGptGroundingSummary;
      discoveredSources: ChatGptDiscoveredSource[];
      citedSources: ChatGptCitedSource[];
      coverage: ResearchCoverageSummary;
      telemetry: ChatGptResearchTelemetry;
      /** WU4.2 -- the exact parsed raw response body (diagnostic only; never canonical evidence). Secrets-redacted by the caller before persisting, not here. */
      rawResponseBody: unknown;
      /** WU4.2 -- per-output-item raw diagnostic breakdown, independent of parseChatGptResponsesBody's own walk. */
      diagnostics: ChatGptResponseDiagnostics;
      /** WU4.2 -- raw-vs-parsed consistency verdict for this response. */
      groundingProvenance: ChatGptGroundingProvenance;
    }
  | {
      ok: false;
      error: string;
      errorType: ChatGptResearchErrorType;
      telemetry: ChatGptResearchTelemetry | null;
      /** WU4.2 -- null only when no parseable JSON body was ever obtained (network_error/invalid_json_body/http_error). */
      rawResponseBody: unknown | null;
      diagnostics: ChatGptResponseDiagnostics | null;
      groundingProvenance: ChatGptGroundingProvenance | null;
    };

/** The structured finding JSON shape both buildResearchPrompt and buildUpdateResearchPrompt ask for -- kept as one constant so the two prompts never drift out of sync on the contract the shared normalizer/parser expect. */
const FINDING_JSON_SHAPE_LINES = [
  "{",
  '  "claim": string,               // one atomic, factual, single-sentence statement',
  '  "category": string,            // one of: injury, availability, personnel, depth_chart, coaching, scheme, usage, matchup, news, weather, market, scheduling, travel, situational, quote, other',
  '  "sourceName": string,          // publication/outlet name',
  '  "sourceUrl": string,           // the exact URL of the page you found this on -- must be a URL you actually retrieved via search, never invented',
  '  "sourceType": string,          // one of: official_team, official_nfl, injury_report, beat_reporter, national_reporter, sports_media, weather_provider, sportsbook, other',
  '  "author": string | null,',
  '  "publishedAt": string | null,  // ISO-8601 timestamp if known',
  '  "subjects": { "teams": string[], "players": string[], "coaches": string[] }, // teams as lowercase abbrs, only this game\'s two teams',
  '  "confidence": "high" | "medium" | "low",',
  '  "relevance": { "summary": string, "areas": string[] },',
  '  "quote": { "speaker": string, "exactText": string } | null,  // exactText must be verbatim, not paraphrased',
  '  "rawExcerpt": string | null    // a short verbatim excerpt supporting the claim',
  "}",
];

/** WU4.3 -- a forecast is only useful within ~5 days of kickoff, and only matters outdoors. Mirrors nfl-grok-research-adapter.ts's isWeatherWindowRelevant(); duplicated here (not imported) per this module's deliberate no-shared-abstraction-with-Grok policy. */
export function isWeatherWindowRelevant(isDome: boolean, hoursToKickoff: number): boolean {
  if (isDome) return false;
  return hoursToKickoff >= 0 && hoursToKickoff <= 120;
}

/**
 * Factual-only research prompt (WU4 work order's 8 priorities, in order).
 * Never asks for a side/total lean, confidence, fair spread, article, or any
 * betting recommendation -- those are explicitly out of scope for a research
 * pass and are enforced by omission here, not by after-the-fact filtering.
 */
export function buildResearchPrompt(game: ChatGptResearchGameFacts, config: ChatGptResearchConfig): string {
  return [
    `Research pregame information for the NFL game ${game.awayTeamFull} at ${game.homeTeamFull} ` +
      `(${game.awayTeam.toUpperCase()} @ ${game.homeTeam.toUpperCase()}), kickoff ${game.kickoffUtc}, ` +
      `season ${game.season} week ${game.week} (gameId ${game.gameId}).`,
    "",
    "Use web search. Prioritize these categories, roughly in order:",
    "1. Injuries and practice participation.",
    "2. Player availability.",
    "3. Personnel and depth-chart changes.",
    "4. Credible beat and national reporting.",
    "5. Relevant head coach or coordinator comments.",
    "6. Meaningful usage or scheme developments.",
    "7. Weather, only if it is likely to materially affect play (wind/precipitation/temperature extremes).",
    "8. Other important roster or news developments.",
    "",
    "Do NOT research or restate market odds, point spreads, totals, power ratings, EPA/play, " +
      "yards-per-play, or other statistical model outputs -- that data comes from a separate, " +
      "already-deterministic source and is out of scope for this research pass.",
    "Do not handicap this game. Do not return a side lean, a total lean, a confidence level, a fair " +
      "spread, an article, or any betting recommendation -- this is a factual research pass only.",
    "Do not broadly research general team history, past results, or unrelated storylines.",
    "",
    "Prefer nfl.com, official team sites, established local beat/national reporters, ESPN, and " +
      "other major national outlets; use a reputable weather source only for the weather category. " +
      "Do not rely on anonymous social posts, rumor accounts, or betting-tout content.",
    "",
    `You have a bounded research budget for this pass (mode: "${config.mode}") -- work efficiently ` +
      "and do not keep searching once you have reasonable coverage of the categories above.",
    "",
    "When you are done researching, respond with ONLY a single JSON array (no prose before or " +
      "after, no markdown code fence) of finding objects. Return at most 12-15 findings -- the " +
      "highest-value factual findings across the categories above, not every article you saw. Keep " +
      "the response compact: each claim, summary, and excerpt must be short and non-redundant -- do " +
      "not repeat the same fact in multiple findings, do not quote long passages of source text, and " +
      "do not add any explanation outside the JSON array. Each object must have exactly this shape:",
    ...FINDING_JSON_SHAPE_LINES,
    "Only include findings you can attribute to a specific URL you actually visited during this research pass.",
    "If you find nothing meaningful for a category, omit it rather than inventing a finding.",
  ].join("\n");
}

/**
 * WU4.3 -- delta-focused update prompt, the ChatGPT counterpart to
 * nfl-grok-research-adapter.ts's buildUpdateResearchPrompt(). Same inverted
 * shape: instead of "research the matchup," this asks "what changed since
 * the last cutoff," supplies everything already known (prior claims +
 * current/previous deterministic market) so ChatGPT never re-derives it, and
 * explicitly allows/expects an empty result. Never asks about a bet, lean,
 * confidence, or whether the market is "right" -- out of scope for
 * research/update ingestion (a future analysis WU's job).
 */
export function buildUpdateResearchPrompt(
  game: ChatGptResearchGameFacts,
  config: ChatGptResearchConfig,
  deltaContext: ResearchDeltaContext,
  currentMarketState: SnapshotMarketState,
  nowIso: string
): string {
  const hoursToKickoff = (Date.parse(game.kickoffUtc) - Date.parse(nowIso)) / (60 * 60 * 1000);
  const weatherRelevant = isWeatherWindowRelevant(game.isDome, hoursToKickoff);

  const priorClaimsLines =
    deltaContext.priorEvidenceClaims && deltaContext.priorEvidenceClaims.length > 0
      ? deltaContext.priorEvidenceClaims.map((c) => `- ${c.claim}`)
      : ["- (none recorded yet)"];

  const previousMarket = deltaContext.previousMarketState;

  return [
    `You are running a DELTA UPDATE, not a fresh research pass, for the NFL game ${game.awayTeamFull} at ${game.homeTeamFull} ` +
      `(${game.awayTeam.toUpperCase()} @ ${game.homeTeam.toUpperCase()}), kickoff ${game.kickoffUtc}, gameId ${game.gameId}.`,
    "",
    `The previous research cutoff was ${deltaContext.previousResearchCutoff ?? "unknown"}. Search ONLY for developments that happened AFTER that cutoff. ` +
      "Do not re-research or restate the matchup from scratch.",
    "",
    "Facts already recorded from the previous research pass -- do NOT return these again unless something about them " +
      "has genuinely changed (a status update, a new corroborating source, or a conflicting new report):",
    ...priorClaimsLines,
    "",
    "Market state already known (do NOT search for these numbers):",
    previousMarket
      ? `  previous (as of ${previousMarket.asOf ?? "unknown"}): ${previousMarket.sportsbook ?? "unknown book"} spread ${previousMarket.spread.homeLine ?? "?"}, total ${previousMarket.total.line ?? "?"}`
      : "  previous: not available",
    `  current (as of ${currentMarketState.asOf ?? "unknown"}): ${currentMarketState.sportsbook ?? "unknown book"} spread ${currentMarketState.spread.homeLine ?? "?"}, total ${currentMarketState.total.line ?? "?"}`,
    "If the market moved, do not assume or claim a reason (e.g. \"sharp money\") unless you find an actual sourced report explaining it.",
    "",
    "Prioritize NEW developments, roughly in this order:",
    "1. Official injury/practice report changes.",
    "2. Availability changes.",
    "3. Transactions / depth-chart / lineup changes.",
    "4. Credible beat-reporter updates.",
    "5. Coach comments with football relevance.",
    "6. Meaningful scheme/usage changes.",
    weatherRelevant
      ? "7. Weather -- this game is outdoors and within the useful forecast window, so check current conditions/forecast."
      : "7. Weather -- SKIP this category (either an indoor venue or outside the useful forecast window for this cutoff).",
    "8. Other relevant current news.",
    "",
    "Do NOT spend search budget reproducing: JKB model values, schedule facts, the prior evidence listed above, " +
      "unchanged injury statuses (unless the new report is itself meaningful, e.g. an upgrade/downgrade), or the " +
      "current market numbers already supplied above.",
    "Prefer official NFL/team injury reports, official transactions, team press conferences/transcripts, credible " +
      "beat/national reporting, and reputable weather providers. Avoid generic matchup previews, power rankings, " +
      "betting touts, speculative social posts, and repeated aggregation of information you already have above.",
    "",
    `You have a narrow, bounded research budget for this update pass (mode: "${config.mode}") -- work efficiently. ` +
      "Injury/practice reports, personnel moves, and weather near kickoff are inherently time-sensitive and always " +
      "worth a quick check regardless of what was known before; for other categories, do not search further once " +
      "the prior evidence above already looks complete and nothing suggests new information is likely.",
    "",
    "IMPORTANT: if nothing materially changed since the cutoff, respond with an empty JSON array: []. " +
      "That is a valid, successful result -- do not force a finding just to have something to report.",
    "",
    "When you are done, respond with ONLY a single JSON array (no prose before or after, no markdown code fence) " +
      "of finding objects for genuinely NEW or CHANGED developments only. Return at most 10 findings -- compact, " +
      "atomic, non-redundant. Each object must have exactly this shape:",
    ...FINDING_JSON_SHAPE_LINES,
    "Only include findings you can attribute to a specific URL you actually visited during this research pass.",
  ].join("\n");
}

/**
 * WU4.2 -- the previously verified capability-probe RESPONSE
 * (openai-wu4-capability-probe.json) shows populated
 * `web_search_call.action.sources[]`, but this adapter's request body never
 * actually sent `include: ["web_search_call.action.sources"]`. OpenAI's
 * Responses API treats `action.sources` as opt-in output (it is not returned
 * by default) -- the probe's exact request body was never captured in this
 * repo, so it is unverified whether the probe implicitly relied on
 * account/model default behavior or an `include` this adapter simply never
 * replicated. Given the real first non-truncated live WU4 run returned
 * `web_search_call` items with EMPTY `action.sources` and zero citations
 * (see WU4.1's saved-run replay), this is the leading suspect and is now
 * sent explicitly, matching the probe's response shape rather than assuming
 * defaults. This does not change WU4.1's grounding acceptance rules --
 * whether it actually fixes anything is verified by a real live run's raw
 * response, not assumed here.
 */
const RESPONSE_INCLUDE_FIELDS = ["web_search_call.action.sources"] as const;

function buildRequestBody(
  game: ChatGptResearchGameFacts,
  config: ChatGptResearchConfig,
  nowIso: string,
  deltaContext?: ResearchDeltaContext,
  currentMarketState?: SnapshotMarketState
): Record<string, unknown> {
  const prompt =
    config.mode === "update" && deltaContext && currentMarketState
      ? buildUpdateResearchPrompt(game, config, deltaContext, currentMarketState, nowIso)
      : buildResearchPrompt(game, config);
  const tool: Record<string, unknown> = { type: "web_search" };
  if (config.searchContextSize) tool.search_context_size = config.searchContextSize;

  const body: Record<string, unknown> = {
    model: config.model,
    input: [{ role: "user", content: prompt }],
    tools: [tool],
    include: [...RESPONSE_INCLUDE_FIELDS],
  };
  if (config.reasoningEffort) body.reasoning = { effort: config.reasoningEffort };
  if (config.maxOutputTokens != null) body.max_output_tokens = config.maxOutputTokens;
  return body;
}

function buildTelemetry(
  config: ChatGptResearchConfig,
  httpStatus: number | null,
  latencyMs: number,
  parsed: ReturnType<typeof parseChatGptResponsesBody> | null,
  usage: ReturnType<typeof parseChatGptUsageTelemetry> | null,
  wasTruncationRetry: boolean
): ChatGptResearchTelemetry {
  return {
    mode: config.mode,
    model: config.model,
    reasoningEffort: config.reasoningEffort,
    configuredMaxOutputTokens: config.maxOutputTokens,
    httpStatus,
    latencyMs,
    responseId: parsed?.responseId ?? null,
    responseStatus: parsed?.responseStatus ?? null,
    incompleteReason: parsed?.incompleteReason ?? null,
    actualWebSearchCalls: parsed?.webSearchCallCount ?? null,
    searchQueries: parsed?.searchQueries ?? [],
    usage: {
      inputTokens: usage?.inputTokens ?? null,
      cachedTokens: usage?.cachedTokens ?? null,
      cacheWriteTokens: usage?.cacheWriteTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      reasoningTokens: usage?.reasoningTokens ?? null,
      totalTokens: usage?.totalTokens ?? null,
    },
    webSearchNumRequests: usage?.webSearchNumRequests ?? null,
    wasTruncationRetry,
  };
}

/** A single HTTP round-trip's outcome: either a hard failure (already a full ChatGptResearchResult) or a successfully-parsed response body ready for truncation/findings inspection. */
type AttemptOutcome =
  | { kind: "failure"; result: Extract<ChatGptResearchResult, { ok: false }> }
  | { kind: "parsed"; parsed: ReturnType<typeof parseChatGptResponsesBody>; telemetry: ChatGptResearchTelemetry; record: Record<string, unknown> };

/** Makes exactly one bounded, timeout-guarded HTTP request to OpenAI's Responses API. Does not itself decide truncation/retry policy -- see runChatGptResearch. */
async function attemptChatGptRequest(input: ChatGptResearchInput, config: ChatGptResearchConfig, doFetch: typeof fetch, wasTruncationRetry: boolean, nowIso: string): Promise<AttemptOutcome> {
  const body = buildRequestBody(input.game, config, nowIso, input.deltaContext, input.currentMarketState);
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  const started = Date.now();
  let httpStatus: number | null = null;
  let responseText: string;
  try {
    const response = await doFetch(RESPONSES_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    httpStatus = response.status;
    responseText = await response.text();
    if (!response.ok) {
      // Best-effort: an error body is sometimes valid JSON (OpenAI's error envelope), sometimes not -- either way this is diagnostic-only, never used for grounding decisions.
      let errorBody: unknown = null;
      try {
        errorBody = JSON.parse(responseText);
      } catch {
        errorBody = responseText.slice(0, 2000);
      }
      return {
        kind: "failure",
        result: {
          ok: false,
          error: `HTTP ${response.status} from OpenAI /v1/responses: ${responseText.slice(0, 500)}`,
          errorType: "http_error",
          telemetry: buildTelemetry(config, httpStatus, Date.now() - started, null, null, wasTruncationRetry),
          rawResponseBody: errorBody,
          diagnostics: null,
          groundingProvenance: null,
        },
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      kind: "failure",
      result: {
        ok: false,
        error: `Request to OpenAI /v1/responses failed: ${message}`,
        errorType: "network_error",
        telemetry: buildTelemetry(config, httpStatus, Date.now() - started, null, null, wasTruncationRetry),
        rawResponseBody: null,
        diagnostics: null,
        groundingProvenance: null,
      },
    };
  } finally {
    clearTimeout(timeoutHandle);
  }

  const latencyMs = Date.now() - started;

  let data: unknown;
  try {
    data = JSON.parse(responseText);
  } catch {
    return {
      kind: "failure",
      result: {
        ok: false,
        error: "OpenAI /v1/responses returned non-JSON body.",
        errorType: "invalid_json_body",
        telemetry: buildTelemetry(config, httpStatus, latencyMs, null, null, wasTruncationRetry),
        rawResponseBody: responseText.slice(0, 2000),
        diagnostics: null,
        groundingProvenance: null,
      },
    };
  }

  const record = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
  const parsed = parseChatGptResponsesBody(record);
  const usage = parseChatGptUsageTelemetry(record.usage, record.tool_usage);
  const telemetry = buildTelemetry(config, httpStatus, latencyMs, parsed, usage, wasTruncationRetry);
  return { kind: "parsed", parsed, telemetry, record };
}

/** True only when the provider itself reports truncation caused by hitting the configured output-token ceiling -- never inferred from a JSON-parse failure alone. */
function isProviderOutputTruncated(parsed: ReturnType<typeof parseChatGptResponsesBody>): boolean {
  return parsed.responseStatus === "incomplete" && parsed.incompleteReason === "max_output_tokens";
}

/**
 * Makes a bounded, timeout-guarded request to OpenAI's Responses API and
 * returns RawEvidenceCandidate[] plus full usage telemetry.
 *
 * Truncation-retry policy: allows AT MOST ONE automatic retry, and only when
 * every one of these holds: the HTTP request succeeded, the provider itself
 * reports `status: "incomplete"` with `incomplete_details.reason:
 * "max_output_tokens"` (see isProviderOutputTruncated), and no evidence has
 * been built or persisted from the truncated attempt (the truncated attempt
 * never reaches findings parsing at all -- see below). The retry uses
 * config.retryMaxOutputTokens. This is the ONLY condition that triggers a
 * retry -- thin research, zero findings, normalization rejection, and low
 * coverage are all successful, non-truncated outcomes and are never retried
 * here.
 */
export async function runChatGptResearch(input: ChatGptResearchInput): Promise<ChatGptResearchResult> {
  if (input.model !== "chatgpt") {
    // Defensive runtime guard -- the type system already restricts this to
    // the literal "chatgpt", but model isolation is important enough that
    // this adapter refuses to silently proceed if that is ever bypassed
    // (e.g. an untyped caller, a future refactor).
    throw new Error(`nfl-chatgpt-research-adapter model isolation violation: expected model "chatgpt", got "${String(input.model)}"`);
  }

  if (input.mode === "update" && (!input.deltaContext || !input.currentMarketState)) {
    return {
      ok: false,
      error: 'mode "update" requires both deltaContext and currentMarketState -- a delta-focused update pass cannot run without knowing what came before.',
      errorType: "missing_update_context",
      telemetry: null,
      rawResponseBody: null,
      diagnostics: null,
      groundingProvenance: null,
    };
  }

  const nowFn = input.now ?? (() => new Date());
  const nowIso = nowFn().toISOString();
  const config = resolveChatGptResearchConfig(input.mode, input.configOverrides);
  const doFetch = input.fetchImpl ?? fetch;

  const firstAttempt = await attemptChatGptRequest(input, config, doFetch, false, nowIso);
  if (firstAttempt.kind === "failure") return firstAttempt.result;

  let { parsed, telemetry, record } = firstAttempt;

  if (isProviderOutputTruncated(parsed) && config.retryMaxOutputTokens != null) {
    const retryConfig = resolveChatGptResearchConfig(input.mode, { ...input.configOverrides, maxOutputTokens: config.retryMaxOutputTokens });
    const retryAttempt = await attemptChatGptRequest(input, retryConfig, doFetch, true, nowIso);
    if (retryAttempt.kind === "failure") return retryAttempt.result;
    parsed = retryAttempt.parsed;
    telemetry = retryAttempt.telemetry;
    record = retryAttempt.record;
  }

  // WU4.2 -- diagnostics/consistency are computed against whichever attempt's
  // raw body is FINAL (post-retry-decision) and are attached to every return
  // from this point on, success or failure, since the whole point is to let
  // a caller compare "what the provider actually sent" against "what this
  // adapter did with it" regardless of how the request ultimately resolved.
  const rawResponseBody: unknown = record;
  const diagnostics = buildChatGptResponseDiagnostics(record);
  const groundingProvenance = checkRawVsParsedConsistency(diagnostics, parsed);

  if (groundingProvenance.status === "parser_consistency_error") {
    return {
      ok: false,
      error: `Raw-vs-parsed grounding consistency check failed: ${groundingProvenance.details}`,
      errorType: "parser_consistency_error",
      telemetry,
      rawResponseBody,
      diagnostics,
      groundingProvenance,
    };
  }

  if (isProviderOutputTruncated(parsed)) {
    return {
      ok: false,
      error:
        `OpenAI /v1/responses returned an incomplete response truncated by max_output_tokens ` +
        `(configuredMaxOutputTokens=${telemetry.configuredMaxOutputTokens}, outputTokens=${telemetry.usage.outputTokens}, ` +
        `reasoningTokens=${telemetry.usage.reasoningTokens}, responseId=${telemetry.responseId}, wasTruncationRetry=${telemetry.wasTruncationRetry}). ` +
        "No evidence was built or persisted from this incomplete result.",
      errorType: "provider_output_truncated",
      telemetry,
      rawResponseBody,
      diagnostics,
      groundingProvenance,
    };
  }

  if (!parsed.messageText) {
    return { ok: false, error: "No final message text found in OpenAI /v1/responses output.", errorType: "no_message_text", telemetry, rawResponseBody, diagnostics, groundingProvenance };
  }

  let rawFindings: unknown[];
  try {
    rawFindings = parseChatGptFindings(parsed.messageText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Failed to parse ChatGPT findings JSON: ${message}`, errorType: "malformed_json", telemetry, rawResponseBody, diagnostics, groundingProvenance };
  }

  const { candidates, grounding, rejected } = buildRawEvidenceCandidatesFromFindings(rawFindings, {
    model: "chatgpt",
    gameId: input.game.gameId,
    discoveredSources: parsed.discoveredSources,
    citedSources: parsed.citedSources,
    retrievedAt: nowFn().toISOString(),
  });

  const groundingSummary: ChatGptGroundingSummary = {
    findingsReturned: rawFindings.length,
    groundedByCitation: grounding.filter((g) => g.groundingState === "cited").length,
    groundedByDiscoveredSource: grounding.filter((g) => g.groundingState === "discovered").length,
    ungroundedRejected: rejected.filter((r) => r.groundingState === "ungrounded").length,
    structurallyRejected: rejected.filter((r) => r.groundingState == null).length,
  };

  // summarizeResearchCoverage (nfl-grok-research-coverage.ts) is provider-neutral
  // despite its filename -- it operates purely on RawEvidenceCandidate[] +
  // search-query strings, with no Grok-specific logic. Reused here per the
  // work order's "reuse all provider-neutral WU2/WU3 infrastructure."
  const coverage = summarizeResearchCoverage(candidates, parsed.searchQueries);

  return {
    ok: true,
    candidates,
    grounding,
    rejectedFindings: rejected,
    groundingSummary,
    discoveredSources: parsed.discoveredSources,
    citedSources: parsed.citedSources,
    coverage,
    telemetry,
    rawResponseBody,
    diagnostics,
    groundingProvenance,
  };
}
