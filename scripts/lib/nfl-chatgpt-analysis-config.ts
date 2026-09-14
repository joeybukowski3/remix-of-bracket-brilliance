/**
 * WU4.4 -- bounded configuration for the ChatGPT HANDICAPPING engine
 * (nfl-chatgpt-analysis-adapter.ts), the ChatGPT counterpart to
 * nfl-grok-analysis-config.ts. Targets the same OpenAI `/v1/responses`
 * endpoint as the ChatGPT research adapter (nfl-chatgpt-research-config.ts),
 * but this is a reasoning-only task over already-supplied context/evidence --
 * `tools` is always omitted entirely, no web_search, ever (mirrors Grok's
 * analysis config's posture exactly).
 *
 * MODEL SELECTION: the WU4.4 work order's starting point is `gpt-5.6-sol`
 * with `reasoning_effort: "medium"`. That model slug has never been probed
 * or exercised anywhere in this repo -- the ONLY OpenAI model confirmed live
 * in this environment is `gpt-5.6-luna` (openai-wu4-capability-probe.json,
 * nfl-chatgpt-research-config.ts), and only in combination with `tools:
 * [{ type: "web_search" }]` and `reasoning.effort: "none"`. Per the work
 * order's own fallback rule ("if not available, use the strongest current
 * model already verified for structured reasoning") and this repo's
 * established precedent of never encoding an unverified request-shape
 * assumption into production config (see nfl-chatgpt-research-config.ts's
 * header comment on `max_turns`), this module uses `gpt-5.6-luna` rather
 * than gambling a real billed call on an unconfirmed model slug.
 *
 * `reasoningEffort: "medium"` (this module's default) is therefore UNVERIFIED
 * for `gpt-5.6-luna` WITHOUT `tools` in this repo's environment -- the only
 * previously-verified combination paired "none" with web_search enabled. The
 * first live run of scripts/run-nfl-chatgpt-handicap.ts is what actually
 * confirms whether "medium" works as expected for this reasoning-only,
 * no-tools shape; if it fails or behaves unexpectedly, the fix is here, in
 * this one config module -- never a silent fallback baked into the adapter.
 *
 * Pure config module: no network, no API key handling, no I/O.
 */

/**
 * WU4.6 -- TWO-STAGE MARKET-BLIND HANDICAPPER splits what used to be one
 * "initial"/"update" mode into four: each combination of stage (A = blind
 * football projection, B = market decision) x pass (initial/update) gets
 * its own token budget, mirroring nfl-grok-analysis-config.ts's identical
 * split.
 */
export const CHATGPT_ANALYSIS_MODES = ["stageAInitial", "stageBInitial", "stageAUpdate", "stageBUpdate"] as const;
export type ChatGptAnalysisMode = (typeof CHATGPT_ANALYSIS_MODES)[number];

/** UNVERIFIED beyond "none" (with web_search) in this repo's environment -- see module header comment. */
export type ChatGptAnalysisReasoningEffort = "none" | "low" | "medium" | "high";

export interface ChatGptAnalysisConfig {
  mode: ChatGptAnalysisMode;
  /** Exact OpenAI model slug for POST /v1/responses. See module header comment on model selection. */
  model: string;
  /** Maps to request field `reasoning.effort`. */
  reasoningEffort: ChatGptAnalysisReasoningEffort;
  /** Maps to request field `max_output_tokens`. */
  maxOutputTokens: number;
  /**
   * WU4.4.3 -- the `max_output_tokens` value used for the ONE allowed
   * automatic retry after a provider_output_truncated result (see
   * nfl-chatgpt-analysis-adapter.ts's truncation-retry policy, mirroring the
   * already-proven policy in nfl-chatgpt-research-adapter.ts). null means
   * this mode never auto-retries a truncated response.
   */
  retryMaxOutputTokens: number | null;
  /** Client-side fetch timeout; not an OpenAI request field. */
  requestTimeoutMs: number;
}

const BASE_CONFIGS: Record<ChatGptAnalysisMode, ChatGptAnalysisConfig> = {
  /**
   * Stage A, initial pass -- structurally identical scope to Grok's
   * "stageAInitial" mode (nfl-grok-analysis-config.ts): football thesis,
   * matchup factors, prediction, failure modes, evidence-quality assessment.
   * Built and validated with zero market pricing in its input.
   *
   * WU4.4.3 -- maxOutputTokens raised from 4000 to 4500 (headroom above the
   * live update-mode failure's 2500 ceiling, scaled up for the larger
   * response shape) with a 7000 retryMaxOutputTokens budget for the one
   * allowed truncation retry. Carried forward unchanged for Stage A.
   */
  stageAInitial: {
    mode: "stageAInitial",
    model: "gpt-5.6-luna",
    reasoningEffort: "medium",
    maxOutputTokens: 4500,
    retryMaxOutputTokens: 7000,
    requestTimeoutMs: 180_000,
  },
  /** Stage B, initial pass -- side + total + market assessment only, given the already-locked Stage A prediction. Structurally smaller. */
  stageBInitial: {
    mode: "stageBInitial",
    model: "gpt-5.6-luna",
    reasoningEffort: "medium",
    maxOutputTokens: 2000,
    retryMaxOutputTokens: 3500,
    requestTimeoutMs: 120_000,
  },
  /**
   * Stage A, update pass: developments + current/revised prediction only.
   *
   * WU4.4.3 -- the first live --mode=update run hit HTTP 200 with
   * `status: "incomplete"` / `incomplete_details.reason: "max_output_tokens"`
   * at the old 2500 ceiling (outputTokens=2500, reasoningTokens=1141) despite
   * reaching the correct prior opinion. Raised to 4000 (materially above the
   * observed ceiling) with a 6500 retryMaxOutputTokens budget for the one
   * allowed truncation retry. Carried forward unchanged for Stage A update.
   */
  stageAUpdate: {
    mode: "stageAUpdate",
    model: "gpt-5.6-luna",
    reasoningEffort: "medium",
    maxOutputTokens: 4000,
    retryMaxOutputTokens: 6500,
    requestTimeoutMs: 150_000,
  },
  /** Stage B, update pass: current side/total decision against the (possibly moved) market. */
  stageBUpdate: {
    mode: "stageBUpdate",
    model: "gpt-5.6-luna",
    reasoningEffort: "medium",
    maxOutputTokens: 1800,
    retryMaxOutputTokens: 3000,
    requestTimeoutMs: 120_000,
  },
};

export function resolveChatGptAnalysisConfig(mode: ChatGptAnalysisMode, overrides?: Partial<Omit<ChatGptAnalysisConfig, "mode">>): ChatGptAnalysisConfig {
  const base = BASE_CONFIGS[mode];
  if (!base) {
    throw new Error(`Unknown ChatGPT analysis mode "${mode}" -- expected one of ${CHATGPT_ANALYSIS_MODES.join(", ")}`);
  }
  return { ...base, ...overrides, mode };
}
