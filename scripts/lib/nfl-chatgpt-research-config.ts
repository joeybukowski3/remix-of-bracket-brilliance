/**
 * WU4 (docs/nfl-grok-chatgpt-handicap-architecture.md §11) -- bounded research
 * configuration for the ChatGPT research-pass adapter, the second of the two
 * isolated model namespaces (see nfl-evidence-types.ts's EvidenceModel).
 *
 * A mandatory capability probe (openai-wu4-capability-probe.json, not
 * synthetic -- a real, billed OpenAI request) confirmed the working shape:
 * `POST https://api.openai.com/v1/responses` with `model: "gpt-5.6-luna"`,
 * `tools: [{ type: "web_search" }]`, and `reasoning: { effort: "none" }`.
 * That probe used `max_output_tokens: 500` and `search_context_size:
 * "medium"` and returned one web_search_call item plus one final cited
 * message in ~5s for 8,470 total tokens.
 *
 * Unlike xAI's Agent Tools API (nfl-grok-research-config.ts), OpenAI's
 * Responses API in this verified configuration exposes no documented
 * per-request "agentic turn budget" field (no `max_turns` analog was present
 * anywhere on the probe's request-echoing response fields) -- the only
 * verified cost/length lever is `max_output_tokens` (plus the tool's own
 * `search_context_size`). This module therefore does NOT invent a turn-budget
 * field the way nfl-grok-research-config.ts's `maxTurns` exists (that field
 * is real for xAI; there is no equivalent confirmed for this OpenAI
 * configuration). Do not add one without a new probe confirming it.
 *
 * `reasoningEffort: "none"` is the only value actually exercised by the live
 * probe. Other GptReasoningEffort values are typed here for forward
 * compatibility (OpenAI's Responses API documents `reasoning.effort` as a
 * general parameter for reasoning-capable models) but are UNVERIFIED for
 * `gpt-5.6-luna` + `web_search` in this repo's environment -- callers must
 * not assume they work without a new probe.
 *
 * Pure config module: no network, no API key handling, no I/O.
 */

export const CHATGPT_RESEARCH_MODES = ["probe", "initial", "update"] as const;
export type ChatGptResearchMode = (typeof CHATGPT_RESEARCH_MODES)[number];

/** Only "none" is confirmed live for gpt-5.6-luna + web_search; see module header comment. */
export type ChatGptReasoningEffort = "none" | "low" | "medium" | "high";

export type ChatGptSearchContextSize = "low" | "medium" | "high";

export interface ChatGptResearchConfig {
  mode: ChatGptResearchMode;
  /** Exact OpenAI model slug for POST /v1/responses, confirmed live by the WU4 capability probe. */
  model: string;
  /** Maps to request field `reasoning.effort`. null omits the `reasoning` field entirely. */
  reasoningEffort: ChatGptReasoningEffort | null;
  /** Maps to request field `max_output_tokens`. null omits the field (provider default). */
  maxOutputTokens: number | null;
  /**
   * The `max_output_tokens` value used for the ONE allowed automatic retry
   * after a provider_output_truncated result (see nfl-chatgpt-research-adapter.ts's
   * truncation-retry policy). null means this mode never auto-retries a
   * truncated response (e.g. "probe", which has no real evidence at stake).
   */
  retryMaxOutputTokens: number | null;
  /** Maps to request field `tools[0].search_context_size`. null omits the field (provider default). */
  searchContextSize: ChatGptSearchContextSize | null;
  /** Client-side fetch timeout; not an OpenAI request field. */
  requestTimeoutMs: number;
}

const BASE_CONFIGS: Record<ChatGptResearchMode, ChatGptResearchConfig> = {
  /** Matches the verified capability-probe shape exactly -- for ad hoc connectivity/schema checks, never for real evidence generation. */
  probe: {
    mode: "probe",
    model: "gpt-5.6-luna",
    reasoningEffort: "none",
    maxOutputTokens: 500,
    retryMaxOutputTokens: null,
    searchContextSize: "medium",
    requestTimeoutMs: 60_000,
  },
  /**
   * WU4's implemented mode: one bounded research pass for a game that has no
   * prior ChatGPT evidence yet. Same verified model/reasoning/search-context
   * as the probe.
   *
   * maxOutputTokens raised from the first live run's 2200 (which hit the
   * exact ceiling and produced a provider-truncated, unterminated findings
   * JSON array -- see nfl-chatgpt-research-adapter.ts's truncation handling)
   * to 4500. Chosen conservatively: enough headroom for a compact
   * ~12-15-finding response (this mode's prompt was also tightened to ask
   * for compact atomic findings, not verbose prose) without gambling on an
   * arbitrarily huge budget.
   *
   * retryMaxOutputTokens is the budget for the ONE automatic retry allowed
   * when a response is provider-truncated (see the adapter's retry policy).
   */
  initial: {
    mode: "initial",
    model: "gpt-5.6-luna",
    reasoningEffort: "none",
    maxOutputTokens: 4500,
    retryMaxOutputTokens: 7000,
    searchContextSize: "medium",
    requestTimeoutMs: 150_000,
  },
  /**
   * WU4.3 -- delta-focused daily-update pass, the ChatGPT counterpart to
   * nfl-grok-research-config.ts's "update" mode. Deliberately narrower than
   * "initial" where practical (lower maxOutputTokens/retry ceiling, smaller
   * search_context_size): buildUpdateResearchPrompt() in
   * nfl-chatgpt-research-adapter.ts supplies prior evidence claims and the
   * current/previous market state up front and only asks "what changed since
   * the cutoff," which is structurally a shorter task than a from-scratch
   * pass. Same verified model/reasoning-effort as "initial" -- unverified
   * for any other combination, per this module's header comment.
   *
   * Per the WU4.3 work order: "Do not assume update mode is cheaper until
   * observed" -- this is a narrower CONFIGURED budget, not a proven-cheaper
   * outcome. A live run's actual telemetry (web-search requests, tokens,
   * latency) is what settles that, never this config alone.
   */
  update: {
    mode: "update",
    model: "gpt-5.6-luna",
    reasoningEffort: "none",
    maxOutputTokens: 2200,
    retryMaxOutputTokens: 3500,
    searchContextSize: "low",
    requestTimeoutMs: 90_000,
  },
};

export function resolveChatGptResearchConfig(mode: ChatGptResearchMode, overrides?: Partial<Omit<ChatGptResearchConfig, "mode">>): ChatGptResearchConfig {
  const base = BASE_CONFIGS[mode];
  if (!base) {
    throw new Error(`Unknown ChatGPT research mode "${mode}" -- expected one of ${CHATGPT_RESEARCH_MODES.join(", ")}`);
  }
  return { ...base, ...overrides, mode };
}
