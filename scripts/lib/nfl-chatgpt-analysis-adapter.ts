/**
 * WU4.4 -- ChatGPT HANDICAPPING adapter, the ChatGPT counterpart to
 * nfl-grok-analysis-adapter.ts. Targets OpenAI's `/v1/responses` endpoint
 * (same URL as nfl-chatgpt-research-adapter.ts) but NEVER sends a `tools`
 * field -- this is a reasoning task over already-supplied context/evidence,
 * never a research task. No web_search, ever (see
 * nfl-chatgpt-analysis-config.ts).
 *
 * WU4.6 -- TWO-STAGE MARKET-BLIND HANDICAPPER: mirrors
 * nfl-grok-analysis-adapter.ts's Stage A (blind football projection, built
 * from the market-free packet/evidence set) / Stage B (market decision,
 * given the Stage A output revealed as an already-locked fact) split
 * exactly, with the SAME prompt structure and rules in substance -- the two
 * providers must be held to the identical standard.
 *
 * Reuses nfl-chatgpt-research-parsing.ts's parseChatGptResponsesBody()/
 * parseChatGptUsageTelemetry() unchanged -- both are generic to the
 * `/v1/responses` shape and do not assume a `tools` field was sent (mirrors
 * how nfl-grok-analysis-adapter.ts reuses nfl-grok-research-parsing.ts).
 *
 * MODEL ISOLATION: this module and everything it imports never reads or
 * references `data/nfl/analysis/**\/grok/` in any form. `buildCitableEvidenceLines`
 * filters strictly to `model === "chatgpt"` records -- ChatGPT is never shown
 * a Grok evidence line, so it cannot cite what it never saw (defense in
 * depth alongside the shared validator's own hard cross-model checks).
 *
 * Trust boundary: the raw parsed JSON from EITHER stage is handed to the
 * SHARED nfl-grok-analysis-validator.ts (called here with `model: "chatgpt"`)
 * and NEVER trusted otherwise. This module makes exactly one HTTP request
 * per stage call (plus at most one truncation retry) and never retries with
 * a different prompt because the first result "looks wrong."
 */

import type { EvidenceRecord } from "./nfl-evidence-types";
import type { EvidenceAuthorityView } from "./nfl-evidence-store";
import type { NflGameContextPacket } from "./nfl-full-game-context";
import { sanitizeGameContextPacketForBlindStageA } from "./nfl-ai-context-sanitizer";
import { resolveChatGptAnalysisConfig, type ChatGptAnalysisConfig, type ChatGptAnalysisMode } from "./nfl-chatgpt-analysis-config";
import { parseChatGptResponsesBody, parseChatGptUsageTelemetry } from "./nfl-chatgpt-research-parsing";
import { MATCHUP_FACTOR_AREAS, type GrokStageAV1 } from "./nfl-grok-analysis-types";
import type { SnapshotMarketRecord, SnapshotMarketState } from "./nfl-snapshot-types";
import { buildValidTeamCodesLines, formatCurrentMarketLine, formatMarketDeltaLines, type AnalysisGameFacts, type PreviousBlindState } from "./nfl-grok-analysis-adapter";

const RESPONSES_API_URL = "https://api.openai.com/v1/responses";

export type { AnalysisGameFacts, PreviousBlindState };

/** Per-attempt diagnostics -- one of these exists for every HTTP round-trip this adapter makes (at most two: the first attempt, and the one allowed truncation retry). */
export interface ChatGptAnalysisAttemptTelemetry {
  responseId: string | null;
  responseStatus: string | null;
  incompleteReason: string | null;
  httpStatus: number | null;
  latencyMs: number;
  maxOutputTokens: number;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    reasoningTokens: number | null;
    cachedTokens: number | null;
    totalTokens: number | null;
  };
}

export interface ChatGptAnalysisTelemetry {
  mode: ChatGptAnalysisMode;
  model: string;
  reasoningEffort: string;
  /** The FINAL accepted (or final-failed) attempt's HTTP status. */
  httpStatus: number | null;
  /** Total wall-clock latency across every attempt made (first attempt plus the retry, when one occurred). */
  latencyMs: number;
  toolsEnabled: false;
  /** The FINAL accepted (or final-failed) attempt's response id/status/incompleteReason. */
  responseId: string | null;
  responseStatus: string | null;
  incompleteReason: string | null;
  /** The mode's base `max_output_tokens` budget (config.maxOutputTokens) -- never the retry override. */
  configuredMaxOutputTokens: number;
  /** The `max_output_tokens` budget used for the one allowed truncation retry; null when this mode has no retry budget configured. */
  retryMaxOutputTokens: number | null;
  /** True only when the accepted/final result reflects the second (retry) request of the truncation-retry policy. */
  wasTruncationRetry: boolean;
  /** Diagnostics for the truncated FIRST attempt -- present only when a retry actually happened (wasTruncationRetry === true). */
  firstAttempt: ChatGptAnalysisAttemptTelemetry | null;
  /** Token usage for the FINAL accepted (or final-failed) attempt. */
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    reasoningTokens: number | null;
    cachedTokens: number | null;
    totalTokens: number | null;
  };
  /** OpenAI's Responses API does not expose a per-request USD cost field (unlike xAI's cost_in_usd_ticks) -- always null, never estimated. */
  costUsd: null;
}

export type ChatGptAnalysisRawResult = { ok: true; raw: unknown; telemetry: ChatGptAnalysisTelemetry } | { ok: false; error: string; telemetry: ChatGptAnalysisTelemetry | null };

function buildAttemptTelemetry(
  maxOutputTokens: number,
  httpStatus: number | null,
  latencyMs: number,
  parsed: ReturnType<typeof parseChatGptResponsesBody> | null,
  usage: ReturnType<typeof parseChatGptUsageTelemetry> | null
): ChatGptAnalysisAttemptTelemetry {
  return {
    responseId: parsed?.responseId ?? null,
    responseStatus: parsed?.responseStatus ?? null,
    incompleteReason: parsed?.incompleteReason ?? null,
    httpStatus,
    latencyMs,
    maxOutputTokens,
    usage: {
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      reasoningTokens: usage?.reasoningTokens ?? null,
      cachedTokens: usage?.cachedTokens ?? null,
      totalTokens: usage?.totalTokens ?? null,
    },
  };
}

function buildTelemetry(
  config: ChatGptAnalysisConfig,
  finalAttempt: ChatGptAnalysisAttemptTelemetry,
  totalLatencyMs: number,
  wasTruncationRetry: boolean,
  firstAttempt: ChatGptAnalysisAttemptTelemetry | null
): ChatGptAnalysisTelemetry {
  return {
    mode: config.mode,
    model: config.model,
    reasoningEffort: config.reasoningEffort,
    httpStatus: finalAttempt.httpStatus,
    latencyMs: totalLatencyMs,
    toolsEnabled: false,
    responseId: finalAttempt.responseId,
    responseStatus: finalAttempt.responseStatus,
    incompleteReason: finalAttempt.incompleteReason,
    configuredMaxOutputTokens: config.maxOutputTokens,
    retryMaxOutputTokens: config.retryMaxOutputTokens,
    wasTruncationRetry,
    firstAttempt,
    usage: finalAttempt.usage,
    costUsd: null,
  };
}

function formatEvidenceLine(record: EvidenceRecord, authority: EvidenceAuthorityView | undefined): string {
  const authorityStatus = authority?.status ?? "current";
  return (
    `[${record.evidenceId}] (category=${record.category}, sourceType=${record.source.sourceType}, verification=${record.verificationStatus}, ` +
    `freshness=${record.freshness}, citation=${record.source.citationSpecificity}${record.citationNeedsReview ? "(needs review)" : ""}, authority=${authorityStatus}) ` +
    `${record.claim}`
  );
}

/**
 * MODEL ISOLATION: only `model === "chatgpt"` records are ever shown to the
 * model -- Grok evidence is filtered out here, not merely flagged, so
 * ChatGPT cannot cite (or even see) a Grok finding. Mirrors
 * nfl-grok-analysis-adapter.ts's buildCitableEvidenceLines exactly, with the
 * model filter flipped. Callers building Stage A's evidence set MUST
 * pre-filter `records` through
 * nfl-ai-context-sanitizer.ts's filterEvidenceRecordsForBlindStageA() first.
 */
export function buildCitableEvidenceLines(records: readonly EvidenceRecord[], authority: readonly EvidenceAuthorityView[]): string[] {
  const authorityById = new Map(authority.map((a) => [a.evidenceId, a] as const));
  return records
    .filter((r) => r.model === "chatgpt" && r.verificationStatus !== "rejected" && r.pregameSafe)
    .map((r) => formatEvidenceLine(r, authorityById.get(r.evidenceId)));
}

const BLIND_CONTEXT_SUMMARY_LINES = (packet: ReturnType<typeof sanitizeGameContextPacketForBlindStageA>): string[] => [
  `identity: ${packet.identity.awayTeamFull} (away) at ${packet.identity.homeTeamFull} (home), season ${packet.identity.season} week ${packet.identity.week}`,
  `jkbModels.powerRating: home=${packet.jkbModels.powerRating.home ?? "?"} away=${packet.jkbModels.powerRating.away ?? "?"}`,
  `teamMetrics.epa (periodWindow=${packet.teamMetrics.periodWindow}): ${JSON.stringify(packet.teamMetrics.epa)}`,
  `teamMetrics.ypp: ${JSON.stringify(packet.teamMetrics.ypp)}`,
  `matchup.trenches: ${JSON.stringify(packet.matchup.trenches)}`,
  `matchup.offenseVsDefense: ${JSON.stringify(packet.matchup.offenseVsDefense)}`,
  `coaching: ${JSON.stringify(packet.coaching)}`,
  `situational: ${JSON.stringify(packet.situational)}`,
  `schedule: kickoff=${packet.schedule.kickoffUtc} venue=${packet.schedule.venue.stadium} isDome=${packet.schedule.venue.isDome}`,
  `weather: ${JSON.stringify(packet.weather)}`,
];

const BLIND_ANTI_HALLUCINATION_RULES = [
  "You are NOT given the sportsbook spread, total, moneyline, opening line, or any line movement -- do not guess, estimate, or assume one. You are also NOT given JKB's own fair-line opinion (no projected spread/total/model-market edge) -- you must form your own from the football data alone.",
  "Use ONLY the supplied JKB football DATA above for any statistic -- never estimate, round, or restate a number you were not given.",
  "Use ONLY the supplied validated evidence for any external fact (injury, personnel, coaching, news, weather) -- do not perform new research (you have no web_search tool in this call).",
  "Do not invent injuries, quotes, market movement, trends, or player status of any kind.",
  "Distinguish FACT (traceable to an evidenceId or jkbContextRef) from INTERPRETATION (your own football judgment) in every finding.",
  "Do not optimize for entertainment value, hot takes, or confident-sounding prose over accuracy.",
];

const BLIND_OUTPUT_DISCIPLINE = [
  "Respond with ONLY a single JSON object (no prose before or after, no markdown code fence) matching the exact schema given below.",
  `matchupFactors[].area MUST be exactly one of these values, and no other: ${MATCHUP_FACTOR_AREAS.map((a) => `"${a}"`).join(", ")}.`,
  "Do NOT use \"trenches\", \"total\", \"side\", \"offense\", or \"defense\" as an area value -- none of those are legal. " +
    "\"trenches\" is not a real category here -- split trench-play findings into \"protection\", \"pass_rush\", or \"run_defense\" as appropriate. " +
    "The total/side bet-type recommendation is a Stage 2 concept -- it does not exist in this stage at all.",
  "Every matchupFactors[].evidenceIds entry must be an evidenceId from the citable evidence list above -- never invent an id.",
  "Every matchupFactors[].jkbContextRefs entry must be a dot-path into the context sections listed above (e.g. \"jkbModels.powerRating\", \"teamMetrics.epa\") -- there is no \"market\" section to reference; it was never supplied to you.",
];

/**
 * WU4.6 STAGE A -- the blind football projection. Never mentions the
 * sportsbook market anywhere in its instructions because it CANNOT: the
 * supplied `packet` has already had its `market` key removed entirely
 * (nfl-ai-context-sanitizer.ts's sanitizeGameContextPacketForBlindStageA).
 */
export function buildStageAInitialPrompt(game: AnalysisGameFacts, packet: NflGameContextPacket, evidenceLines: readonly string[]): string {
  const blindPacket = sanitizeGameContextPacketForBlindStageA(packet);
  return [
    `You are an expert NFL handicapper competing in a professional handicapping contest for ${game.awayTeamFull} at ${game.homeTeamFull} ` +
      `(gameId ${game.gameId}, kickoff ${game.kickoffUtc}).`,
    "",
    "This is STAGE 1 of a two-stage handicap: a BLIND football projection. You are deliberately NOT shown the sportsbook line -- you must form your own " +
      "independent fair spread and projected total using ONLY football data and your own evidence. A second, separate stage will later reveal the market " +
      "price and ask for a bet/pass decision; you will not see or influence that stage from here.",
    "",
    "Reason in this order:",
    "STEP 1 -- FOOTBALL ASSESSMENT: evaluate quarterback, offense, defense, trenches, personnel, injuries, coaching, matchup, situational context, weather, and your evidence.",
    "STEP 2 -- INDEPENDENT FAIR SPREAD: form your own point spread (prediction.fairSpread).",
    "STEP 3 -- INDEPENDENT PROJECTED TOTAL: form your own expected game total (prediction.projectedTotal), independently derived.",
    "",
    "=== JKB FOOTBALL DATA (authoritative facts -- never override or restate incorrectly; this is DATA, not a betting conclusion, and contains no market pricing of any kind) ===",
    ...BLIND_CONTEXT_SUMMARY_LINES(blindPacket),
    "",
    "=== CITABLE CHATGPT EVIDENCE (only these ids may be cited; each is tagged with verification/freshness/citation-quality/authority status -- weigh weaker/superseded/conflicting evidence accordingly) ===",
    ...(evidenceLines.length > 0 ? evidenceLines : ["(no citable evidence available)"]),
    "",
    "=== ANTI-HALLUCINATION RULES ===",
    ...BLIND_ANTI_HALLUCINATION_RULES,
    "",
    "=== ANALYSIS DISCIPLINE ===",
    "For every matchup factor, follow this internal structure even though only the concise output fields are stored: OBSERVATION -> EVIDENCE -> FOOTBALL IMPLICATION -> MATCHUP CONSEQUENCE. " +
      "Do not dump statistics -- every metric you cite should answer \"why does this matter for THIS game.\"",
    "Require 2-3 SPECIFIC, non-generic failure modes that would directly break your central football thesis (not \"anything can happen\").",
    "",
    ...buildValidTeamCodesLines(game),
    "",
    "=== OUTPUT SCHEMA (JSON object) ===",
    ...BLIND_OUTPUT_DISCIPLINE,
    "Sign convention for prediction.fairSpread: `line` is <= 0 for the favored `team` (e.g. { team: \"IND\", line: -1.5 } means you favor IND by 1.5). `team` must be one of the two VALID TEAM CODES listed above.",
    JSON.stringify(
      {
        schemaVersion: "<leave as empty string -- the engine fills this in>",
        model: "chatgpt",
        gameId: game.gameId,
        contextHash: "<leave as empty string -- the engine fills this in>",
        evidenceIdsUsed: ["<evidenceId>", "..."],
        footballThesis: "<1-3 sentence thesis -- your own independent football view, with no reference to any market price>",
        matchupFactors: [
          {
            area: MATCHUP_FACTOR_AREAS.join("|"),
            finding: "<concise finding, fact separated from interpretation>",
            supports: "home|away|over|under|mixed|neutral",
            importance: "major|moderate|minor",
            jkbContextRefs: ["<dot-path>"],
            evidenceIds: ["<evidenceId>"],
          },
        ],
        prediction: {
          fairSpread: { team: "<home or away team abbr>", line: -1.5 },
          projectedTotal: 46.5,
        },
        failureModes: [{ scenario: "<specific scenario>", whyItMatters: "<why this breaks the thesis>" }],
        evidenceQualityAssessment: { strengths: ["<...>"], limitations: ["<...>"] },
      },
      null,
      2
    ),
  ].join("\n");
}

/**
 * WU4.6 STAGE B -- the market decision. `lockedStageA` is the ALREADY
 * VALIDATED Stage A output, revealed here verbatim as a locked fact -- the
 * prompt explicitly forbids revising it, and the output schema has no field
 * for a replacement prediction.
 */
export function buildStageBInitialPrompt(game: AnalysisGameFacts, lockedStageA: GrokStageAV1, currentMarketState: SnapshotMarketState): string {
  return [
    `This is STAGE 2 of a two-stage handicap for ${game.awayTeamFull} at ${game.homeTeamFull} (gameId ${game.gameId}). ` +
      "STAGE 1 already produced your LOCKED, independent, blind football projection below -- you formed it with zero knowledge of the sportsbook price. " +
      "You may NOT revise, restate differently, or second-guess that projection here. Your only job now is to compare it to the market and decide whether there is a bet.",
    "",
    "=== YOUR LOCKED STAGE 1 PROJECTION (immutable -- do not alter) ===",
    `footballThesis: ${lockedStageA.footballThesis}`,
    `fairSpread: ${JSON.stringify(lockedStageA.prediction.fairSpread)}`,
    `projectedTotal: ${lockedStageA.prediction.projectedTotal}`,
    "",
    "=== CURRENT DETERMINISTIC MARKET STATE (do not search for these numbers -- you have no web_search tool in this call; this is the FIRST time you are seeing a market price for this game) ===",
    formatCurrentMarketLine(game, currentMarketState),
    `HOME team is ${game.homeTeam} (${game.homeTeamFull}). AWAY team is ${game.awayTeam} (${game.awayTeamFull}). These are the exact, authoritative lines -- you do not restate or echo them anywhere in your output below; the engine attaches them mechanically. Never invert HOME/AWAY, never flip a sign, and never convert a favorite-centric line into a team-centric one.`,
    "",
    "=== YOUR TASK ===",
    "STEP 4 -- MARKET COMPARISON: compare your locked fair spread/total to the current market price.",
    "STEP 5 -- BETTING DECISION: choose side (home/away/pass) and total (over/under/pass) independently. PASS is fully valid and expected when there is no edge -- do not force a play.",
    "Do not assume the sportsbook line is correct, and do not try to force disagreement with it either -- follow your locked projection and the market numbers where they lead.",
    "Confidence (1-10) reflects evidence quality + matchup clarity + market value + uncertainty -- a strong football advantage does NOT automatically mean high betting confidence.",
    "Never write 'sharp money', 'smart money', or 'professional action' unless you have independent evidence supporting that claim.",
    "",
    "=== OUTPUT SCHEMA (JSON object) ===",
    "Respond with ONLY a single JSON object (no prose before or after, no markdown code fence). Do NOT include a `prediction`, `fairSpread`, or `projectedTotal` field -- those are already locked from Stage 1 and are not yours to resubmit here.",
    "Do NOT include `side.lineAtOpinion`, `total.totalAtOpinion`, or `marketAssessment.currentHomeLine`/`currentAwayLine`/`currentTotal` -- the engine attaches the authoritative market values to your decision mechanically after validation, so there is nothing for you to copy or compute here. Leave marketAssessment.sideEdgePoints/totalEdgePoints as 0 -- the engine computes those mechanically from your locked Stage 1 prediction.",
    JSON.stringify(
      {
        schemaVersion: "<leave as empty string -- the engine fills this in>",
        model: "chatgpt",
        gameId: game.gameId,
        contextHash: "<leave as empty string -- the engine fills this in>",
        side: { lean: "home|away|pass|undecided", team: "<team abbr or omit>", confidence: 5, rationale: "<concise>" },
        total: { lean: "over|under|pass|undecided", confidence: 5, rationale: "<concise>" },
        marketAssessment: {
          sideEdgePoints: 0,
          totalEdgePoints: 0,
          interpretation: "<concise interpretation of your locked fair line vs the market>",
        },
      },
      null,
      2
    ),
  ].join("\n");
}

/** WU4.6 STAGE A UPDATE -- re-runs (or reaffirms) the blind football projection given new evidence. Still no market field anywhere in its input. */
export function buildStageAUpdatePrompt(game: AnalysisGameFacts, packet: NflGameContextPacket, previous: PreviousBlindState, newEvidenceLines: readonly string[]): string {
  const blindPacket = sanitizeGameContextPacketForBlindStageA(packet);
  return [
    `This is STAGE 1 of a two-stage DELTA UPDATE for ${game.awayTeamFull} at ${game.homeTeamFull} (gameId ${game.gameId}). ` +
      "You are, as always, blind to the sportsbook market in this stage. Do NOT regenerate your football view from scratch -- evaluate what changed and whether it moves your projection.",
    "",
    "=== YOUR PRIOR BLIND PROJECTION (preserve unless the new evidence below genuinely changes it) ===",
    `previous football thesis: ${previous.thesis ?? "(none)"}`,
    `previous fair spread: ${previous.fairSpread ? JSON.stringify(previous.fairSpread) : "(none)"}`,
    `previous projected total: ${previous.projectedTotal ?? "(none)"}`,
    "",
    "=== NEW/CHANGED CITABLE CHATGPT EVIDENCE SINCE YOUR PRIOR PROJECTION (only these ids may be cited as developments; any market-pricing evidence has already been excluded from this list) ===",
    ...(newEvidenceLines.length > 0 ? newEvidenceLines : ["(no new material evidence -- this is a valid, expected outcome; developments may be an empty array)"]),
    "",
    "=== JKB FOOTBALL DATA (current, authoritative facts -- this is DATA, not a betting conclusion, and contains no market pricing) ===",
    ...BLIND_CONTEXT_SUMMARY_LINES(blindPacket),
    "",
    "=== ANTI-HALLUCINATION RULES ===",
    ...BLIND_ANTI_HALLUCINATION_RULES,
    "",
    "=== RULES FOR THIS UPDATE ===",
    "Only report a development for a GENUINELY new or changed football fact -- do not restate unchanged prior evidence as if newly discovered.",
    "'No material change' is a fully valid result: developments may be [], and your fair spread/projected total may be identical to your prior state.",
    "Preserve your prior football thesis verbatim in currentFootballThesis unless the new evidence genuinely changes your view -- do not paraphrase-drift.",
    "Re-affirm or revise your independent prediction.fairSpread/prediction.projectedTotal based ONLY on football evidence -- you still have no market information.",
    "",
    ...buildValidTeamCodesLines(game),
    "",
    "=== OUTPUT SCHEMA (JSON object) ===",
    "Respond with ONLY a single JSON object (no prose before or after, no markdown code fence):",
    "Sign convention for prediction.fairSpread: `line` is <= 0 for the favored `team`. `team` must be one of the two VALID TEAM CODES listed above.",
    JSON.stringify(
      {
        schemaVersion: "<leave as empty string -- the engine fills this in>",
        model: "chatgpt",
        gameId: game.gameId,
        contextHash: "<leave as empty string -- the engine fills this in>",
        evidenceIdsUsed: ["<evidenceId>"],
        developments: [{ developmentId: "<short id>", evidenceIds: ["<evidenceId>"], summary: "<...>", significance: "major|moderate|minor|neutral", direction: "home_positive|away_positive|over_positive|under_positive|mixed|neutral", affectedAreas: ["<area>"], footballImpact: "<...>", marketRelevance: "<...>" }],
        currentFootballThesis: "<your current football thesis, unchanged unless justified>",
        thesisChangeExplanation: "<explain what changed, or state 'unchanged' if it did not>",
        prediction: {
          fairSpread: { team: "<home or away team abbr>", line: -1.5 },
          projectedTotal: 46.5,
        },
      },
      null,
      2
    ),
  ].join("\n");
}

/** WU4.6 STAGE B UPDATE -- the current bet/pass decision against the (possibly moved) market, given the LOCKED Stage A update prediction. */
export function buildStageBUpdatePrompt(game: AnalysisGameFacts, lockedFairSpread: GrokStageAV1["prediction"]["fairSpread"], lockedProjectedTotal: number, marketRecord: SnapshotMarketRecord): string {
  return [
    `This is STAGE 2 of a two-stage DELTA UPDATE for ${game.awayTeamFull} at ${game.homeTeamFull} (gameId ${game.gameId}). ` +
      "STAGE 1 already produced your LOCKED, blind football projection for this update below. You may NOT revise it here -- your only job is to compare it to the current market and decide whether there is a bet.",
    "",
    "=== YOUR LOCKED STAGE 1 PROJECTION FOR THIS UPDATE (immutable -- do not alter) ===",
    `fairSpread: ${JSON.stringify(lockedFairSpread)}`,
    `projectedTotal: ${lockedProjectedTotal}`,
    "",
    "=== DETERMINISTIC MARKET DELTA (do not search for these numbers -- you have no web_search tool in this call) ===",
    ...formatMarketDeltaLines(game, marketRecord),
    `HOME team is ${game.homeTeam} (${game.homeTeamFull}). AWAY team is ${game.awayTeam} (${game.awayTeamFull}). These are the exact, authoritative lines -- you do not restate or echo them anywhere in your output below; the engine attaches them mechanically. Never invert HOME/AWAY, never flip a sign, and never convert a favorite-centric line into a team-centric one.`,
    "If the market moved, do not assume or claim a reason (e.g. \"sharp money\") unless you have independent evidence for it.",
    "",
    "=== YOUR TASK ===",
    "Compare your locked fair spread/total to the current market and choose side (home/away/pass) and total (over/under/pass) independently. 'No material change' is fully valid -- your lean/confidence may be identical to your prior decision.",
    "",
    "=== OUTPUT SCHEMA (JSON object) ===",
    "Respond with ONLY a single JSON object (no prose before or after, no markdown code fence). Do NOT include a `prediction`, `fairSpread`, or `projectedTotal` field -- those are already locked from Stage 1.",
    "Do NOT include `side.lineAtOpinion`, `total.totalAtOpinion`, or `marketAssessment.currentHomeLine`/`currentAwayLine`/`currentTotal` -- the engine attaches the authoritative market values to your decision mechanically after validation.",
    JSON.stringify(
      {
        schemaVersion: "<leave as empty string -- the engine fills this in>",
        model: "chatgpt",
        gameId: game.gameId,
        contextHash: "<leave as empty string -- the engine fills this in>",
        side: { lean: "home|away|pass|undecided", team: "<team abbr or omit>", confidence: 5, rationale: "<concise>" },
        total: { lean: "over|under|pass|undecided", confidence: 5, rationale: "<concise>" },
        marketAssessment: {
          sideEdgePoints: 0,
          totalEdgePoints: 0,
          interpretation: "<concise interpretation of your locked fair line vs the current market>",
        },
        conciseCommentary: "<1-2 sentence summary of this update>",
      },
      null,
      2
    ),
  ].join("\n");
}

/** A single HTTP round-trip's outcome: either a hard failure (attempt-level diagnostics only) or a successfully-parsed response body ready for truncation/JSON-payload inspection. */
type AttemptOutcome =
  | { kind: "failure"; error: string; attempt: ChatGptAnalysisAttemptTelemetry }
  | { kind: "parsed"; parsed: ReturnType<typeof parseChatGptResponsesBody>; attempt: ChatGptAnalysisAttemptTelemetry };

/** Makes exactly one bounded, timeout-guarded HTTP request to OpenAI's Responses API with the given `max_output_tokens` budget. Does not itself decide truncation/retry policy -- see callChatGptAnalysis. */
async function attemptChatGptAnalysisRequest(prompt: string, maxOutputTokens: number, config: ChatGptAnalysisConfig, apiKey: string, fetchImpl: typeof fetch): Promise<AttemptOutcome> {
  const body = {
    model: config.model,
    input: [{ role: "user", content: prompt }],
    reasoning: { effort: config.reasoningEffort },
    max_output_tokens: maxOutputTokens,
    // Deliberately NO `tools` field -- this is a reasoning task, never a research task.
  };

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  const started = Date.now();
  let httpStatus: number | null = null;
  let responseText: string;
  try {
    const response = await fetchImpl(RESPONSES_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    httpStatus = response.status;
    responseText = await response.text();
    if (!response.ok) {
      return {
        kind: "failure",
        error: `HTTP ${response.status} from OpenAI /v1/responses: ${responseText.slice(0, 500)}`,
        attempt: buildAttemptTelemetry(maxOutputTokens, httpStatus, Date.now() - started, null, null),
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { kind: "failure", error: `Request to OpenAI /v1/responses failed: ${message}`, attempt: buildAttemptTelemetry(maxOutputTokens, httpStatus, Date.now() - started, null, null) };
  } finally {
    clearTimeout(timeoutHandle);
  }

  const latencyMs = Date.now() - started;
  let data: unknown;
  try {
    data = JSON.parse(responseText);
  } catch {
    return { kind: "failure", error: "OpenAI /v1/responses returned non-JSON body.", attempt: buildAttemptTelemetry(maxOutputTokens, httpStatus, latencyMs, null, null) };
  }

  const record = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
  const parsed = parseChatGptResponsesBody(record);
  const usage = parseChatGptUsageTelemetry(record.usage, record.tool_usage);
  return { kind: "parsed", parsed, attempt: buildAttemptTelemetry(maxOutputTokens, httpStatus, latencyMs, parsed, usage) };
}

/** True only when the provider itself reports truncation caused by hitting the configured output-token ceiling -- never inferred from a JSON-parse failure alone. Mirrors nfl-chatgpt-research-adapter.ts's identically-named/identically-behaved helper. */
function isProviderOutputTruncated(parsed: ReturnType<typeof parseChatGptResponsesBody>): boolean {
  return parsed.responseStatus === "incomplete" && parsed.incompleteReason === "max_output_tokens";
}

/**
 * Makes a bounded, timeout-guarded request to OpenAI's Responses API and
 * returns the raw parsed analysis JSON payload plus full attempt telemetry.
 *
 * Truncation-retry policy (mirrors nfl-chatgpt-research-adapter.ts's
 * identical, already-proven policy): allows AT MOST ONE automatic retry, and
 * only when every one of these holds: the HTTP request succeeded, and the
 * provider itself reports `status: "incomplete"` with `incomplete_details.reason:
 * "max_output_tokens"` (see isProviderOutputTruncated). The retry uses
 * config.retryMaxOutputTokens and reuses the exact same prompt (built once by
 * the caller from the exact same context/evidence/prior-state/market inputs)
 * -- nothing about the request is rebuilt or mutated between attempts except
 * the output-token budget. This is the ONLY condition that triggers a retry
 * -- validation failures, bad evidence ids, cross-model contamination, stale
 * context, postgame language, provider auth errors, and malformed factual
 * content are never retried here (validation happens downstream of this
 * adapter, against the SHARED validator, and is never even reached until a
 * non-truncated response is obtained). The truncated first attempt never
 * reaches JSON-payload parsing at all, so nothing is ever built or persisted
 * from it.
 */
async function callChatGptAnalysis(prompt: string, config: ChatGptAnalysisConfig, apiKey: string, fetchImpl: typeof fetch): Promise<ChatGptAnalysisRawResult> {
  const firstOutcome = await attemptChatGptAnalysisRequest(prompt, config.maxOutputTokens, config, apiKey, fetchImpl);
  if (firstOutcome.kind === "failure") {
    return { ok: false, error: firstOutcome.error, telemetry: buildTelemetry(config, firstOutcome.attempt, firstOutcome.attempt.latencyMs, false, null) };
  }

  let finalOutcome: Extract<AttemptOutcome, { kind: "parsed" }> = firstOutcome;
  let wasTruncationRetry = false;
  let firstAttemptDiagnostics: ChatGptAnalysisAttemptTelemetry | null = null;
  let totalLatencyMs = firstOutcome.attempt.latencyMs;

  if (isProviderOutputTruncated(firstOutcome.parsed) && config.retryMaxOutputTokens != null) {
    const retryOutcome = await attemptChatGptAnalysisRequest(prompt, config.retryMaxOutputTokens, config, apiKey, fetchImpl);
    totalLatencyMs += retryOutcome.attempt.latencyMs;
    if (retryOutcome.kind === "failure") {
      return { ok: false, error: retryOutcome.error, telemetry: buildTelemetry(config, retryOutcome.attempt, totalLatencyMs, true, firstOutcome.attempt) };
    }
    finalOutcome = retryOutcome;
    wasTruncationRetry = true;
    firstAttemptDiagnostics = firstOutcome.attempt;
  }

  const telemetry = buildTelemetry(config, finalOutcome.attempt, totalLatencyMs, wasTruncationRetry, firstAttemptDiagnostics);

  if (finalOutcome.parsed.responseStatus === "incomplete") {
    return {
      ok: false,
      error: `OpenAI /v1/responses returned an incomplete response (reason: ${finalOutcome.parsed.incompleteReason ?? "unknown"}, wasTruncationRetry=${wasTruncationRetry}). No analysis was built or persisted from this incomplete result.`,
      telemetry,
    };
  }

  if (!finalOutcome.parsed.messageText) {
    return { ok: false, error: "No final message text found in OpenAI /v1/responses output.", telemetry };
  }

  let raw: unknown;
  try {
    const cleaned = finalOutcome.parsed.messageText
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "");
    raw = JSON.parse(cleaned);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Failed to parse analysis JSON: ${message}`, telemetry };
  }

  return { ok: true, raw, telemetry };
}

export interface RunChatGptStageAInitialInput {
  game: AnalysisGameFacts;
  packet: NflGameContextPacket;
  evidenceLines: readonly string[];
  apiKey: string;
  configOverrides?: Partial<Omit<ChatGptAnalysisConfig, "mode">>;
  fetchImpl?: typeof fetch;
}

/** WU4.6 -- makes the Stage A request. Deliberately takes NO `currentMarketState` parameter at all -- there is no way to accidentally pass market pricing into this call. */
export async function runChatGptStageAInitial(input: RunChatGptStageAInitialInput): Promise<ChatGptAnalysisRawResult> {
  const config = resolveChatGptAnalysisConfig("stageAInitial", input.configOverrides);
  const prompt = buildStageAInitialPrompt(input.game, input.packet, input.evidenceLines);
  return callChatGptAnalysis(prompt, config, input.apiKey, input.fetchImpl ?? fetch);
}

export interface RunChatGptStageBInitialInput {
  game: AnalysisGameFacts;
  lockedStageA: GrokStageAV1;
  currentMarketState: SnapshotMarketState;
  apiKey: string;
  configOverrides?: Partial<Omit<ChatGptAnalysisConfig, "mode">>;
  fetchImpl?: typeof fetch;
}

export async function runChatGptStageBInitial(input: RunChatGptStageBInitialInput): Promise<ChatGptAnalysisRawResult> {
  const config = resolveChatGptAnalysisConfig("stageBInitial", input.configOverrides);
  const prompt = buildStageBInitialPrompt(input.game, input.lockedStageA, input.currentMarketState);
  return callChatGptAnalysis(prompt, config, input.apiKey, input.fetchImpl ?? fetch);
}

export interface RunChatGptStageAUpdateInput {
  game: AnalysisGameFacts;
  packet: NflGameContextPacket;
  previous: PreviousBlindState;
  newEvidenceLines: readonly string[];
  apiKey: string;
  configOverrides?: Partial<Omit<ChatGptAnalysisConfig, "mode">>;
  fetchImpl?: typeof fetch;
}

export async function runChatGptStageAUpdate(input: RunChatGptStageAUpdateInput): Promise<ChatGptAnalysisRawResult> {
  const config = resolveChatGptAnalysisConfig("stageAUpdate", input.configOverrides);
  const prompt = buildStageAUpdatePrompt(input.game, input.packet, input.previous, input.newEvidenceLines);
  return callChatGptAnalysis(prompt, config, input.apiKey, input.fetchImpl ?? fetch);
}

export interface RunChatGptStageBUpdateInput {
  game: AnalysisGameFacts;
  lockedFairSpread: GrokStageAV1["prediction"]["fairSpread"];
  lockedProjectedTotal: number;
  marketRecord: SnapshotMarketRecord;
  apiKey: string;
  configOverrides?: Partial<Omit<ChatGptAnalysisConfig, "mode">>;
  fetchImpl?: typeof fetch;
}

export async function runChatGptStageBUpdate(input: RunChatGptStageBUpdateInput): Promise<ChatGptAnalysisRawResult> {
  const config = resolveChatGptAnalysisConfig("stageBUpdate", input.configOverrides);
  const prompt = buildStageBUpdatePrompt(input.game, input.lockedFairSpread, input.lockedProjectedTotal, input.marketRecord);
  return callChatGptAnalysis(prompt, config, input.apiKey, input.fetchImpl ?? fetch);
}
