/**
 * WU3.4 -- bounded configuration for the Grok HANDICAPPING engine
 * (nfl-grok-analysis-adapter.ts). Distinct from nfl-grok-research-config.ts:
 * this is a reasoning-only task over already-supplied context/evidence, so
 * `tools` is always omitted entirely -- no web_search, ever.
 *
 * WU4.6 -- TWO-STAGE MARKET-BLIND HANDICAPPER splits what used to be one
 * "initial"/"update" mode into four: each combination of stage
 * (A = blind football projection, B = market decision) x pass
 * (initial/update) gets its own token budget, since Stage A produces the
 * large structured output (thesis, matchup factors, failure modes,
 * evidence-quality assessment, prediction) and Stage B produces a much
 * smaller one (side, total, market assessment only).
 */

export const GROK_ANALYSIS_MODES = ["stageAInitial", "stageBInitial", "stageAUpdate", "stageBUpdate"] as const;
export type GrokAnalysisMode = (typeof GROK_ANALYSIS_MODES)[number];

export type GrokAnalysisReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

export interface GrokAnalysisConfig {
  mode: GrokAnalysisMode;
  model: string;
  reasoningEffort: GrokAnalysisReasoningEffort;
  maxOutputTokens: number;
  requestTimeoutMs: number;
}

const BASE_CONFIGS: Record<GrokAnalysisMode, GrokAnalysisConfig> = {
  /** Stage A, initial pass: the largest structured output this engine produces -- football thesis, matchup factors, prediction, failure modes, evidence-quality assessment. Built and validated with zero market pricing in its input. */
  stageAInitial: {
    mode: "stageAInitial",
    model: "grok-4.6",
    reasoningEffort: "medium",
    maxOutputTokens: 4000,
    requestTimeoutMs: 180_000,
  },
  /** Stage B, initial pass: side + total + market assessment only, given the already-locked Stage A prediction. Structurally smaller -- no matchupFactors/failureModes/prediction. */
  stageBInitial: {
    mode: "stageBInitial",
    model: "grok-4.6",
    reasoningEffort: "medium",
    maxOutputTokens: 1500,
    requestTimeoutMs: 120_000,
  },
  /** Stage A, update pass: developments + current/revised prediction only -- structurally smaller than the initial Stage A pass. */
  stageAUpdate: {
    mode: "stageAUpdate",
    model: "grok-4.6",
    reasoningEffort: "medium",
    maxOutputTokens: 2500,
    requestTimeoutMs: 150_000,
  },
  /** Stage B, update pass: current side/total decision against the (possibly moved) market. */
  stageBUpdate: {
    mode: "stageBUpdate",
    model: "grok-4.6",
    reasoningEffort: "medium",
    maxOutputTokens: 1200,
    requestTimeoutMs: 120_000,
  },
};

export function resolveGrokAnalysisConfig(mode: GrokAnalysisMode, overrides?: Partial<Omit<GrokAnalysisConfig, "mode">>): GrokAnalysisConfig {
  const base = BASE_CONFIGS[mode];
  if (!base) {
    throw new Error(`Unknown Grok analysis mode "${mode}" -- expected one of ${GROK_ANALYSIS_MODES.join(", ")}`);
  }
  return { ...base, ...overrides, mode };
}

/**
 * AI Picks v2 -- client timeout for the shared v2 handicap stages through Grok
 * (runGrokHandicapV2Stage). Deliberately NOT the v1 `stageBInitial` value: that
 * 120s was sized for a 1,500-token side/total decision, while the v2 Stage B
 * returns the full 250-450 word write-up under a 5,000-token output budget
 * (HANDICAP_V2_OUTPUT_TOKENS), larger than Stage A's 3,500. The first
 * production run's Stage B was aborted by this client timer, and the only
 * recorded Grok reasoning-model latencies in the repo (a v1 handicap, 130.5s
 * and 125.0s, docs/nfl-grok-chatgpt-handicap-architecture.md) are already above
 * 120s for a smaller output. Stage B therefore gets the same ceiling as Stage A.
 * One request per stage, no retry -- a timeout is recorded in the attempt
 * ledger and is not repeated on identical inputs.
 */
export const GROK_HANDICAP_V2_REQUEST_TIMEOUT_MS = { A: 180_000, B: 180_000 } as const;
