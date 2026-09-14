/**
 * WU3 (docs/nfl-grok-chatgpt-handicap-architecture.md §11) -- bounded research
 * configuration for the Grok research-pass adapter.
 *
 * Context: a capability probe (see session notes, not committed) confirmed
 * that xAI's Live Search (`search_parameters` on `/v1/chat/completions`) is
 * deprecated (410 Gone). The working replacement is the Agent Tools API:
 * `POST https://api.x.ai/v1/responses` with `tools: [{ type: "web_search" }]`
 * and agentic-loop controls (`reasoning_effort`, `max_turns`,
 * `max_output_tokens`). The same probe's uncontrolled default ran 8-12
 * search turns and ~78K-210K total tokens per call (55-90s) -- too
 * expensive/slow to use unbounded across a slate. Every mode below is a
 * deliberately bounded configuration, never "let the model research as long
 * as it wants."
 *
 * A follow-up SMALL controlled comparison (2 bounded calls, not committed)
 * found grok-4.6 with reasoning_effort:"low" both cheaper ($0.0375) and
 * cleaner (2 search calls, well-formed per-claim citations) than grok-4.3
 * with no reasoning_effort set ($0.0528, 4 search calls, degraded citation
 * mapping) on the same bounded-budget injury-report query. grok-4.6/low is
 * therefore the selected default -- not because it is the most capable
 * model available, but because it was the cheapest configuration that
 * reliably produced current, cited, well-structured research in that test.
 *
 * WU3.1 -- VERIFIED BUDGET SEMANTICS (do not re-litigate without a new probe):
 * `max_turns` bounds "agentic tool-calling turns" per xAI's own docs, but two
 * live probes confirmed this is NOT a hard ceiling on the number of
 * `web_search_call` items actually executed:
 *   - Probe A: `max_turns: 5` on the initial live BAL-IND run -> 8 actual
 *     web_search_call items.
 *   - Probe B: `max_turns: 5` + `max_tool_calls: 2` (a field that appears as
 *     an echoed top-level key on the response object, but is undocumented in
 *     xAI's published guide text) -> the field echoed back as `null` (i.e.
 *     not honored/recognized as set) and the actual web_search_call count
 *     was still 8.
 * Conclusion: as of this writing, xAI's Agent Tools API exposes no verified
 * mechanism that hard-caps web_search_call count. `maxTurns` below is sent
 * as a configured request field because it is real and documented, but code
 * and callers MUST treat it as an influence on the agentic budget, never as
 * a guaranteed ceiling -- see GrokResearchTelemetry.actualWebSearchCalls in
 * nfl-grok-research-adapter.ts for the number that actually matters for
 * cost, and describeSearchBudgetOutcome() below for how to report the
 * relationship between the two without overclaiming enforcement.
 *
 * Pure config module: no network, no API key handling, no I/O.
 */

export const GROK_RESEARCH_MODES = ["probe", "initial", "update"] as const;
export type GrokResearchMode = (typeof GROK_RESEARCH_MODES)[number];

export type GrokReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

export interface GrokResearchConfig {
  mode: GrokResearchMode;
  /** Exact xAI model slug for POST /v1/responses. */
  model: string;
  /** Maps to request field `reasoning_effort`. null omits the field entirely. */
  reasoningEffort: GrokReasoningEffort | null;
  /**
   * Maps to request field `max_turns` -- a configured agentic-turn budget,
   * sent to the API because it is real and documented. NOT a verified hard
   * ceiling on the number of `web_search_call` items the model actually
   * executes -- two live probes showed `max_turns: 5` (with and without an
   * additional, apparently-unhonored `max_tool_calls: 2`) still produced 8
   * actual web_search_call items. Always compare this against
   * GrokResearchTelemetry.actualWebSearchCalls; never assume the configured
   * value was enforced.
   */
  maxTurns: number;
  /** Maps to request field `max_output_tokens`. null omits the field (provider default). */
  maxOutputTokens: number | null;
  /** Client-side fetch timeout; not an xAI request field. */
  requestTimeoutMs: number;
  /**
   * Informational only -- xAI's public docs do not confirm a literal request
   * field for "max results per search turn" on the Agent Tools web_search
   * tool. This value is folded into the prompt's research-strategy
   * instructions instead of an unverified API parameter. Do not add a
   * request-body field for this without re-verifying against the live API.
   */
  targetSearchesPerTurn: number;
  /**
   * Optional soft warning threshold (USD) for logging only -- never blocks a
   * request and is not a production budget. Unset by default per explicit
   * instruction not to invent a production cost ceiling without approval.
   */
  softCostWarningUsd: number | null;
}

const BASE_CONFIGS: Record<GrokResearchMode, GrokResearchConfig> = {
  /**
   * Matches the original capability-probe shape but bounded -- for ad hoc
   * connectivity/schema checks, never for real evidence generation.
   */
  probe: {
    mode: "probe",
    model: "grok-4.6",
    reasoningEffort: "low",
    maxTurns: 3,
    maxOutputTokens: 800,
    requestTimeoutMs: 60_000,
    targetSearchesPerTurn: 1,
    softCostWarningUsd: null,
  },
  /**
   * WU3's implemented mode: one bounded research pass for a game that has no
   * prior evidence yet. Target ~3-5 tool turns per the cost-control
   * requirement (down from the probe's unconstrained 8-12).
   */
  initial: {
    mode: "initial",
    model: "grok-4.6",
    reasoningEffort: "low",
    maxTurns: 5,
    maxOutputTokens: 2200,
    requestTimeoutMs: 150_000,
    targetSearchesPerTurn: 1,
    softCostWarningUsd: null,
  },
  /**
   * WU3.3 -- delta-focused daily-update pass. Deliberately narrower/cheaper
   * than "initial": lower maxTurns (3 vs 5) and maxOutputTokens (1200 vs
   * 2200) because the prompt (buildUpdateResearchPrompt in
   * nfl-grok-research-adapter.ts) supplies prior evidence/market state up
   * front and only asks "what changed since the cutoff" -- there is
   * structurally less to research and less to say than a from-scratch pass.
   */
  update: {
    mode: "update",
    model: "grok-4.6",
    reasoningEffort: "low",
    maxTurns: 3,
    maxOutputTokens: 1200,
    requestTimeoutMs: 90_000,
    targetSearchesPerTurn: 1,
    softCostWarningUsd: null,
  },
};

export function resolveGrokResearchConfig(mode: GrokResearchMode, overrides?: Partial<Omit<GrokResearchConfig, "mode">>): GrokResearchConfig {
  const base = BASE_CONFIGS[mode];
  if (!base) {
    throw new Error(`Unknown Grok research mode "${mode}" -- expected one of ${GROK_RESEARCH_MODES.join(", ")}`);
  }
  return { ...base, ...overrides, mode };
}

/** xAI reports exact request cost as integer "ticks"; 1e10 ticks == $1.00. */
export const COST_TICKS_PER_USD = 10_000_000_000;

export function ticksToUsd(costInUsdTicks: number): number {
  return costInUsdTicks / COST_TICKS_PER_USD;
}

export type SearchBudgetOutcome = "within_configured_turns" | "exceeded_configured_turns" | "unknown";

/**
 * WU3.1 -- purely descriptive, NEVER enforcement. Reports the observed
 * relationship between `configuredMaxTurns` and the actual
 * `web_search_call` count for one run, for logging/telemetry only. Since
 * `max_turns` is not a verified hard ceiling (see this module's header
 * comment), "exceeded_configured_turns" is an expected, non-error outcome --
 * callers must not treat it as a failure.
 */
export function describeSearchBudgetOutcome(configuredMaxTurns: number, actualWebSearchCalls: number | null): SearchBudgetOutcome {
  if (actualWebSearchCalls == null) return "unknown";
  return actualWebSearchCalls <= configuredMaxTurns ? "within_configured_turns" : "exceeded_configured_turns";
}

/**
 * WU3.1 -- pure, reporting-only slate-cost projection from already-observed
 * per-game costs. This is NOT a budget, NOT enforced anywhere, and must
 * never be used to block or throttle a request -- it exists purely so a
 * human can see "if every remaining game costs about what these did, the
 * full slate would cost about $X" before choosing a production cadence.
 */
export function estimateSlateCostUsd(observedCostsUsd: readonly number[], gameCount: number): number {
  if (observedCostsUsd.length === 0) {
    throw new Error("estimateSlateCostUsd requires at least one observed cost -- it must never guess a per-game cost.");
  }
  if (gameCount < 0) {
    throw new Error("estimateSlateCostUsd requires a non-negative gameCount.");
  }
  const meanCostUsd = observedCostsUsd.reduce((sum, cost) => sum + cost, 0) / observedCostsUsd.length;
  return meanCostUsd * gameCount;
}
