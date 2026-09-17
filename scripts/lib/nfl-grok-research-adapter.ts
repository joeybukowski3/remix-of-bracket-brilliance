/**
 * WU3 (docs/nfl-grok-chatgpt-handicap-architecture.md §11, research pass) --
 * Grok research adapter targeting xAI's Agent Tools API
 * (`POST https://api.x.ai/v1/responses`, `tools: [{ type: "web_search" }]`).
 *
 * Live Search (`search_parameters` on `/v1/chat/completions`, the pattern
 * `callGrokWithRetry` in scripts/generate-pga-best-bets.mjs uses) is
 * deprecated -- confirmed via a live 410 Gone response. This adapter targets
 * the confirmed-working replacement exclusively and does not touch the old
 * endpoint.
 *
 * Cost discipline: every request is bounded (reasoning_effort, max_turns,
 * max_output_tokens -- see nfl-grok-research-config.ts) and this module makes
 * exactly one HTTP request per runGrokResearch() call. It never retries with
 * a bigger budget because the first result "looks thin" -- that judgment
 * belongs to whoever reads the returned telemetry, not to this adapter.
 *
 * Trust boundary: the provider's free-form message text is parsed for a
 * structured JSON findings array (see nfl-grok-research-parsing.ts), and
 * each finding is accepted into RawEvidenceCandidate[] ONLY if its claimed
 * source URL is among the URLs xAI's own citation annotations returned.
 * Findings never survive on the model's unverified say-so.
 */

import type { EvidenceModel, RawEvidenceCandidate } from "./nfl-evidence-types";
import { describeSearchBudgetOutcome, resolveGrokResearchConfig, ticksToUsd, type GrokResearchConfig, type GrokResearchMode, type SearchBudgetOutcome } from "./nfl-grok-research-config";
import { buildRawEvidenceCandidatesFromFindings, parseGrokFindings, parseResponsesOutput, parseUsageTelemetry, type RejectedFinding } from "./nfl-grok-research-parsing";
import { summarizeResearchCoverage, type ResearchCoverageSummary } from "./nfl-grok-research-coverage";
import type { ResearchDeltaContext, SnapshotMarketState } from "./nfl-snapshot-types";

const RESPONSES_API_URL = "https://api.x.ai/v1/responses";

export interface GrokResearchGameFacts {
  gameId: string;
  season: number;
  week: number;
  homeTeam: string; // teams.json abbr, lowercase
  awayTeam: string;
  homeTeamFull: string;
  awayTeamFull: string;
  kickoffUtc: string;
  /** WU3.3 -- drives whether update mode's weather category is in-window (see isWeatherWindowRelevant()). Not needed for mode:"initial"/"probe", which always includes weather as a research category. */
  isDome: boolean;
}

export interface GrokResearchInput {
  mode: GrokResearchMode;
  game: GrokResearchGameFacts;
  apiKey: string;
  model: EvidenceModel;
  configOverrides?: Partial<Omit<GrokResearchConfig, "mode">>;
  /**
   * WU3.3 -- required for mode:"update", ignored otherwise. Reuses WU3.2's
   * provider-neutral ResearchDeltaContext unchanged (nfl-snapshot-types.ts) --
   * no Grok-specific delta type exists.
   */
  deltaContext?: ResearchDeltaContext;
  /**
   * WU3.3 -- required for mode:"update". The CURRENT deterministic market
   * read (from JKB's market artifact) -- included in the prompt so Grok
   * never has to search for it, and never asked to explain a move without
   * sourced evidence.
   */
  currentMarketState?: SnapshotMarketState;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable for tests; defaults to Date.now-based ISO timestamp. */
  now?: () => Date;
}

export interface GrokResearchTelemetry {
  mode: GrokResearchMode;
  model: string;
  reasoningEffort: string | null;
  /** Configured request budget only -- see nfl-grok-research-config.ts's header comment: NOT a verified ceiling on actualWebSearchCalls. */
  configuredMaxTurns: number;
  configuredMaxOutputTokens: number | null;
  httpStatus: number | null;
  latencyMs: number;
  /** The number that actually matters for cost -- compare against configuredMaxTurns via searchBudgetOutcome, never assume they match. */
  actualWebSearchCalls: number | null;
  actualReasoningItems: number | null;
  /** Descriptive only (see describeSearchBudgetOutcome) -- "exceeded_configured_turns" is an expected outcome, not an error. */
  searchBudgetOutcome: SearchBudgetOutcome;
  searchQueries: readonly string[];
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    reasoningTokens: number | null;
    cachedTokens: number | null;
    totalTokens: number | null;
    serverSideToolCalls: number | null;
  };
  costInUsdTicks: number | null;
  costUsd: number | null;
}

export type GrokResearchResult =
  | { ok: true; candidates: RawEvidenceCandidate[]; rejectedFindings: RejectedFinding[]; citationUrls: string[]; coverage: ResearchCoverageSummary; telemetry: GrokResearchTelemetry; rawResponseBody: unknown }
  | { ok: false; error: string; telemetry: GrokResearchTelemetry | null; rawResponseBody: unknown | null };

/**
 * Targeted per the architecture's "RESEARCH STRATEGY" requirement -- this is
 * deliberately NOT "research everything about the matchup." The deterministic
 * Game Context Packet already owns market lines, JKB power ratings, EPA/YPP,
 * and schedule context; re-deriving those wastes search-turn budget.
 */
export function buildResearchPrompt(game: GrokResearchGameFacts, config: GrokResearchConfig): string {
  return [
    `Research pregame information for the NFL game ${game.awayTeamFull} at ${game.homeTeamFull} ` +
      `(${game.awayTeam.toUpperCase()} @ ${game.homeTeam.toUpperCase()}), kickoff ${game.kickoffUtc}, ` +
      `season ${game.season} week ${game.week} (gameId ${game.gameId}).`,
    "",
    "Use web search. Prioritize these categories, roughly in order:",
    "1. Official injury/practice reports for both teams.",
    "2. Team transactions and player availability (signings, elevations, IR moves).",
    "3. Meaningful offensive-line, quarterback, skill-position, or defensive personnel changes.",
    "4. Credible beat-reporter updates from the last few days.",
    "5. Relevant head coach or coordinator comments.",
    "6. Weather for the game, only if it is likely to materially affect play (wind/precipitation/temperature extremes).",
    "7. Any other major news that plausibly changes how this specific game is played.",
    "",
    "Do NOT research or restate market odds, point spreads, totals, power ratings, EPA/play, " +
      "yards-per-play, or other statistical model outputs -- that data comes from a separate, " +
      "already-deterministic source and is out of scope for this research pass.",
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
      "after, no markdown code fence) of finding objects. Each object must have exactly this shape:",
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
    "Only include findings you can attribute to a specific URL you actually visited during this research pass.",
    "If you find nothing meaningful for a category, omit it rather than inventing a finding.",
  ].join("\n");
}

/** WU3.3 -- a forecast is only useful within ~5 days of kickoff, and only matters outdoors. Pure/exported so the "coverage" story (checked vs. never checked) is auditable independent of any live call. */
export function isWeatherWindowRelevant(isDome: boolean, hoursToKickoff: number): boolean {
  if (isDome) return false;
  return hoursToKickoff >= 0 && hoursToKickoff <= 120;
}

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

/**
 * WU3.3 -- delta-focused update prompt. Deliberately the opposite shape of
 * buildResearchPrompt(): instead of "research the matchup," this asks "what
 * changed since the last cutoff," supplies everything already known (prior
 * claims + current deterministic market) so Grok never re-derives it, and
 * explicitly allows/expects an empty result. Never asks about a bet, lean,
 * confidence, or the market being "right" -- that is out of scope for
 * research/update ingestion (a future analysis WU's job).
 */
export function buildUpdateResearchPrompt(
  game: GrokResearchGameFacts,
  config: GrokResearchConfig,
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
      "of finding objects for genuinely NEW or CHANGED developments only. Each object must have exactly this shape:",
    ...FINDING_JSON_SHAPE_LINES,
    "Only include findings you can attribute to a specific URL you actually visited during this research pass.",
  ].join("\n");
}

function buildRequestBody(game: GrokResearchGameFacts, config: GrokResearchConfig, nowIso: string, deltaContext?: ResearchDeltaContext, currentMarketState?: SnapshotMarketState): Record<string, unknown> {
  const prompt =
    config.mode === "update" && deltaContext && currentMarketState
      ? buildUpdateResearchPrompt(game, config, deltaContext, currentMarketState, nowIso)
      : buildResearchPrompt(game, config);

  const body: Record<string, unknown> = {
    model: config.model,
    input: [{ role: "user", content: prompt }],
    tools: [{ type: "web_search" }],
    max_turns: config.maxTurns,
  };
  if (config.reasoningEffort) body.reasoning_effort = config.reasoningEffort;
  if (config.maxOutputTokens != null) body.max_output_tokens = config.maxOutputTokens;
  return body;
}

function buildTelemetry(
  config: GrokResearchConfig,
  httpStatus: number | null,
  latencyMs: number,
  parsedOutput: ReturnType<typeof parseResponsesOutput> | null,
  usage: ReturnType<typeof parseUsageTelemetry> | null
): GrokResearchTelemetry {
  return {
    mode: config.mode,
    model: config.model,
    reasoningEffort: config.reasoningEffort,
    configuredMaxTurns: config.maxTurns,
    configuredMaxOutputTokens: config.maxOutputTokens,
    httpStatus,
    latencyMs,
    actualWebSearchCalls: parsedOutput?.webSearchCallCount ?? null,
    actualReasoningItems: parsedOutput?.reasoningItemCount ?? null,
    searchBudgetOutcome: describeSearchBudgetOutcome(config.maxTurns, parsedOutput?.webSearchCallCount ?? null),
    searchQueries: parsedOutput?.searchQueries ?? [],
    usage: {
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      reasoningTokens: usage?.reasoningTokens ?? null,
      cachedTokens: usage?.cachedTokens ?? null,
      totalTokens: usage?.totalTokens ?? null,
      serverSideToolCalls: usage?.serverSideToolCalls ?? null,
    },
    costInUsdTicks: usage?.costInUsdTicks ?? null,
    costUsd: usage?.costInUsdTicks != null ? ticksToUsd(usage.costInUsdTicks) : null,
  };
}

/**
 * Makes exactly one bounded, timeout-guarded request to xAI's Agent Tools
 * API and returns RawEvidenceCandidate[] plus full cost/latency telemetry.
 * Never retries with an expanded budget on its own judgment.
 */
export async function runGrokResearch(input: GrokResearchInput): Promise<GrokResearchResult> {
  const nowFn = input.now ?? (() => new Date());

  if (input.mode === "update" && (!input.deltaContext || !input.currentMarketState)) {
    return {
      ok: false,
      error: "mode \"update\" requires both deltaContext and currentMarketState -- a delta-focused update pass cannot run without knowing what came before.",
      telemetry: null,
      rawResponseBody: null,
    };
  }

  const config = resolveGrokResearchConfig(input.mode, input.configOverrides);
  const doFetch = input.fetchImpl ?? fetch;
  const body = buildRequestBody(input.game, config, nowFn().toISOString(), input.deltaContext, input.currentMarketState);

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
      return { ok: false, error: `HTTP ${response.status} from xAI /v1/responses: ${responseText.slice(0, 500)}`, telemetry: buildTelemetry(config, httpStatus, Date.now() - started, null, null), rawResponseBody: responseText.slice(0, 2000) };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Request to xAI /v1/responses failed: ${message}`, telemetry: buildTelemetry(config, httpStatus, Date.now() - started, null, null), rawResponseBody: null };
  } finally {
    clearTimeout(timeoutHandle);
  }

  const latencyMs = Date.now() - started;

  let data: unknown;
  try {
    data = JSON.parse(responseText);
  } catch {
    return { ok: false, error: "xAI /v1/responses returned non-JSON body.", telemetry: buildTelemetry(config, httpStatus, latencyMs, null, null), rawResponseBody: responseText.slice(0, 2000) };
  }

  const record = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
  const parsedOutput = parseResponsesOutput(record.output);
  const usage = parseUsageTelemetry(record.usage);
  const telemetry = buildTelemetry(config, httpStatus, latencyMs, parsedOutput, usage);

  if (!parsedOutput.messageText) {
    return { ok: false, error: "No final message text found in xAI /v1/responses output.", telemetry, rawResponseBody: data };
  }

  let rawFindings: unknown[];
  try {
    rawFindings = parseGrokFindings(parsedOutput.messageText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Failed to parse Grok findings JSON: ${message}`, telemetry, rawResponseBody: data };
  }

  const { candidates, rejected } = buildRawEvidenceCandidatesFromFindings(rawFindings, {
    model: input.model,
    gameId: input.game.gameId,
    citationUrls: parsedOutput.citationUrls,
    retrievedAt: nowFn().toISOString(),
  });

  const coverage = summarizeResearchCoverage(candidates, parsedOutput.searchQueries);

  return { ok: true, candidates, rejectedFindings: rejected, citationUrls: parsedOutput.citationUrls, coverage, telemetry, rawResponseBody: data };
}
