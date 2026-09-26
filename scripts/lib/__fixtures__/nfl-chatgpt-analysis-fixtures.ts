/**
 * WU4.4 -- SYNTHETIC fixtures for the ChatGPT handicapping engine, mirroring
 * nfl-grok-analysis-fixtures.ts's structure/scenario coverage exactly but for
 * the `model: "chatgpt"` namespace and OpenAI's `/v1/responses` envelope
 * shape (no `web_search_call` item -- the analysis adapter never enables
 * `tools`, and OpenAI's usage fields are `input_tokens`/`output_tokens`/
 * `input_tokens_details.cached_tokens`/`output_tokens_details.reasoning_tokens`,
 * per the real captured shape in nfl-chatgpt-research-fixtures.ts's
 * FIXTURE_REAL_PROBE_RESPONSE).
 *
 * WU4.6 -- TWO-STAGE MARKET-BLIND HANDICAPPER split every fixture that used
 * to be one combined analysis payload into a STAGE A (blind football
 * projection) fixture and a STAGE B (market decision) fixture, mirroring
 * nfl-grok-analysis-fixtures.ts's identical split.
 *
 * Every thesis, rationale, confidence value, and failure mode here is
 * invented for testing the shared nfl-grok-analysis-validator.ts /
 * nfl-grok-analysis-pipeline.ts (called with model:"chatgpt") without a
 * network call. The DETERMINISTIC context packet is the real, committed
 * 2026_01_BAL_IND Game Context Packet, same as the Grok fixtures.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeExternalEvidence } from "../nfl-evidence-normalizer";
import { resolveEvidenceAuthority } from "../nfl-evidence-store";
import { FIXTURE_CONTEXT, confirmedInjuryCandidate, conflictingInjuryCandidate, personnelUpdateCandidate, questionablePlayerCandidate, rejectedRumorCandidate } from "./nfl-evidence-fixtures";
import type { NflGameContextPacket } from "../nfl-full-game-context";
import type { AnalysisGameFacts, PreviousBlindState } from "../nfl-chatgpt-analysis-adapter";
import type { GrokStageAV1 } from "../nfl-grok-analysis-types";
import type { EditorialArticle, SnapshotAnalysisState, SnapshotMarketRecord, SnapshotMarketState } from "../nfl-snapshot-types";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export const FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET: NflGameContextPacket = JSON.parse(
  readFileSync(join(ROOT, "data", "nfl", "game-context", "2026", "1", "2026_01_BAL_IND.json"), "utf8")
);

export const FIXTURE_CHATGPT_ANALYSIS_GAME: AnalysisGameFacts = {
  gameId: "2026_01_BAL_IND",
  homeTeamFull: "Indianapolis Colts",
  awayTeamFull: "Baltimore Ravens",
  homeTeam: "ind",
  awayTeam: "bal",
  kickoffUtc: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET.schedule.kickoffUtc,
};

export const FIXTURE_CHATGPT_ANALYSIS_CONTEXT_HASH = "fixture-chatgpt-analysis-context-hash-0001";

export const FIXTURE_CHATGPT_ANALYSIS_CURRENT_MARKET: SnapshotMarketState = {
  sportsbook: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET.market.sportsbook,
  spread: { homeLine: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET.market.spread.homeLine, awayLine: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET.market.spread.awayLine },
  total: { line: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET.market.total.line },
  moneyline: { homePrice: null, awayPrice: null },
  asOf: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET.provenance.builtAt,
};

const MARKET_SPREAD = FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET.market.spread.homeLine!;
const MARKET_TOTAL = FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET.market.total.line!;

/** WU4.5 -- synthetic INDEPENDENT prediction (never JKB's projectedSpread/projectedTotal, which the model is never shown). Home team (IND) favored by 1.5. WU4.6: this is Stage A's LOCKED output -- never revised by Stage B. */
const FIXTURE_PREDICTION = { fairSpread: { team: "ind", line: -1.5 }, projectedTotal: MARKET_TOTAL - 1 };

function normalizeOrThrow(candidate: Parameters<typeof normalizeExternalEvidence>[0]) {
  const result = normalizeExternalEvidence(candidate, FIXTURE_CONTEXT);
  if (!result.ok) throw new Error(`chatgpt analysis fixture evidence failed to normalize: ${result.reasons.join("; ")}`);
  return result.evidence;
}

/** Re-points each grok-namespace fixture candidate at a distinct URL and the "chatgpt" model, so the SAME underlying scenario variety (confirmed/questionable/conflicting/personnel/rejected) exists in the chatgpt namespace. */
function asChatGptCandidate(candidate: Parameters<typeof normalizeExternalEvidence>[0], urlSuffix: string) {
  return { ...candidate, model: "chatgpt" as const, source: { ...candidate.source, url: `${candidate.source.url}?chatgpt-fixture=${urlSuffix}` } };
}

/** Synthetic ChatGPT evidence stream: injury (confirmed OUT, official), questionable player (beat), conflicting earlier report, personnel update, rejected rumor -- the chatgpt-namespace mirror of nfl-grok-analysis-fixtures.ts's FIXTURE_ANALYSIS_EVIDENCE_RECORDS. */
export const FIXTURE_CHATGPT_ANALYSIS_EVIDENCE_RECORDS = [
  normalizeOrThrow(asChatGptCandidate(confirmedInjuryCandidate, "1")),
  normalizeOrThrow(asChatGptCandidate(questionablePlayerCandidate, "2")),
  normalizeOrThrow(asChatGptCandidate(conflictingInjuryCandidate, "3")),
  normalizeOrThrow(asChatGptCandidate(personnelUpdateCandidate, "4")),
  normalizeOrThrow(asChatGptCandidate(rejectedRumorCandidate, "5")),
];

export const FIXTURE_CHATGPT_ANALYSIS_EVIDENCE_AUTHORITY = resolveEvidenceAuthority(FIXTURE_CHATGPT_ANALYSIS_EVIDENCE_RECORDS);

/** A grok-model record deliberately included so cross-model-citation isolation tests have a real Grok id to reference -- ChatGPT must never be able to cite this. */
export const FIXTURE_CHATGPT_ANALYSIS_GROK_RECORD = (() => {
  const result = normalizeExternalEvidence({ ...confirmedInjuryCandidate, source: { ...confirmedInjuryCandidate.source, url: "https://example-fixture.test/grok-only/never-cite-me-from-chatgpt" } }, FIXTURE_CONTEXT);
  if (!result.ok) throw new Error("grok fixture record failed to normalize");
  return result.evidence;
})();

/** WU4.6 -- a market-pricing evidence record (category:"market") in the chatgpt namespace, mirroring nfl-grok-analysis-fixtures.ts's identical fixture. */
export const FIXTURE_CHATGPT_ANALYSIS_MARKET_COMMENTARY_RECORD = (() => {
  const result = normalizeExternalEvidence(
    asChatGptCandidate({ ...confirmedInjuryCandidate, category: "market", claim: "The spread opened at IND -3 and has since moved to IND -1.5 as of Thursday." }, "market-commentary"),
    FIXTURE_CONTEXT
  );
  if (!result.ok) throw new Error("market-commentary fixture record failed to normalize");
  return result.evidence;
})();

export const FIXTURE_CHATGPT_ANALYSIS_ALL_EVIDENCE_RECORDS = [...FIXTURE_CHATGPT_ANALYSIS_EVIDENCE_RECORDS, FIXTURE_CHATGPT_ANALYSIS_GROK_RECORD];

const EVIDENCE_ID = {
  confirmedInjury: FIXTURE_CHATGPT_ANALYSIS_EVIDENCE_RECORDS[0].evidenceId,
  questionablePlayer: FIXTURE_CHATGPT_ANALYSIS_EVIDENCE_RECORDS[1].evidenceId,
  conflictingInjury: FIXTURE_CHATGPT_ANALYSIS_EVIDENCE_RECORDS[2].evidenceId,
  personnelUpdate: FIXTURE_CHATGPT_ANALYSIS_EVIDENCE_RECORDS[3].evidenceId,
  rejectedRumor: FIXTURE_CHATGPT_ANALYSIS_EVIDENCE_RECORDS[4].evidenceId,
  grokOnly: FIXTURE_CHATGPT_ANALYSIS_GROK_RECORD.evidenceId,
  marketCommentary: FIXTURE_CHATGPT_ANALYSIS_MARKET_COMMENTARY_RECORD.evidenceId,
};

function baseMarketAssessment(overrides: Partial<Record<string, number | string | null>> = {}) {
  return {
    currentHomeLine: MARKET_SPREAD,
    currentAwayLine: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET.market.spread.awayLine,
    currentTotal: MARKET_TOTAL,
    sideEdgePoints: 0,
    totalEdgePoints: 0,
    interpretation: "Synthetic: my locked fair line and the market disagree meaningfully on the spread; total is roughly in line.",
    ...overrides,
  };
}

function baseFactor(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    area: "protection",
    finding: "Synthetic: a starting interior defender's absence (per cited evidence) plausibly softens the pass rush this week.",
    supports: "mixed",
    importance: "moderate",
    jkbContextRefs: ["teamMetrics.epa"],
    evidenceIds: [EVIDENCE_ID.confirmedInjury],
    ...overrides,
  };
}

function baseFailureModes() {
  return [
    { scenario: "Synthetic: the QB matchup swings hard the other way if pass protection breaks down early.", whyItMatters: "Synthetic: a fast negative game script would invalidate the total thesis." },
    { scenario: "Synthetic: a returning player (per cited evidence) plays more snaps than expected.", whyItMatters: "Synthetic: this would materially firm up the unit this analysis flags as weakened." },
  ];
}

/** WU7.9 -- a minimal but schema-valid long-form editorial article for Stage B initial fixtures. */
function baseEditorialArticle(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    headline: "Synthetic: Baltimore at Indianapolis, a Week 1 read.",
    dek: "Synthetic: a front-seven question mark keeps this closer than the raw talent gap suggests.",
    openingRead: ["Synthetic opening paragraph one.", "Synthetic opening paragraph two."],
    awayOffenseVsHomeDefense: { heading: "When Baltimore Has the Ball", paragraphs: ["Synthetic paragraph about the away offense."] },
    homeOffenseVsAwayDefense: { heading: "When Indianapolis Has the Ball", paragraphs: ["Synthetic paragraph about the home offense."] },
    trenchesAndGameControl: ["Synthetic trenches paragraph."],
    personnelAndAvailability: ["Synthetic personnel paragraph."],
    gameScript: ["Synthetic game-script paragraph."],
    matchupKeys: [{ title: "Synthetic matchup key title", analysis: "Synthetic matchup key analysis." }],
    swingFactors: [{ title: "Synthetic swing factor title", analysis: "Synthetic swing factor analysis." }],
    sideAnalysis: ["Synthetic side analysis paragraph."],
    totalAnalysis: ["Synthetic total analysis paragraph."],
    finalWord: ["Synthetic closing paragraph."],
    ...overrides,
  };
}

/** The TRUSTED (already-validated-shaped) editorial article, for tests that construct a GrokStageBV1/MarketDecisionRecord directly without going through the validator. */
export const FIXTURE_EDITORIAL_ARTICLE: EditorialArticle = { isLegacyPreview: false, ...baseEditorialArticle() } as EditorialArticle;

/** OpenAI `/v1/responses` envelope shape -- no web_search_call item (tools is never sent for analysis calls), matching the real captured shape's usage field names. */
function analysisResponse(payload: unknown) {
  return {
    id: "resp_fixture_chatgpt_analysis_0001",
    object: "response",
    status: "completed",
    model: "gpt-5.6-luna",
    created_at: 1789200000,
    completed_at: 1789200004,
    reasoning: { context: "all_turns", effort: "medium", mode: "standard", summary: null },
    output: [
      {
        id: "msg_fixture_chatgpt_analysis_1",
        type: "message",
        status: "completed",
        role: "assistant",
        phase: "final_answer",
        content: [{ type: "output_text", annotations: [], logprobs: [], text: JSON.stringify(payload) }],
      },
    ],
    usage: {
      input_tokens: 15000,
      input_tokens_details: { cache_write_tokens: 0, cached_tokens: 1500 },
      output_tokens: 1100,
      output_tokens_details: { reasoning_tokens: 700 },
      total_tokens: 16100,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* STAGE A -- blind football projection (initial pass)                        */
/* -------------------------------------------------------------------------- */

function stageAPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    schemaVersion: "nfl-grok-analysis-v1",
    model: "chatgpt",
    gameId: "2026_01_BAL_IND",
    generatedAt: "2026-09-12T00:00:00.000Z",
    contextHash: "",
    evidenceIdsUsed: [EVIDENCE_ID.confirmedInjury],
    footballThesis: "Synthetic: IND's front seven questions plausibly matter more than the raw talent gap suggests.",
    matchupFactors: [baseFactor()],
    prediction: FIXTURE_PREDICTION,
    failureModes: baseFailureModes(),
    evidenceQualityAssessment: { strengths: ["Synthetic: one official injury report."], limitations: ["Synthetic: limited beat coverage overall."] },
    ...overrides,
  };
}

export const FIXTURE_STAGE_A_BASE = analysisResponse(stageAPayload());

export const FIXTURE_STAGE_A_EVIDENCE_CONFLICT = analysisResponse(
  stageAPayload({
    evidenceIdsUsed: [EVIDENCE_ID.confirmedInjury, EVIDENCE_ID.conflictingInjury],
    matchupFactors: [
      baseFactor({
        finding: "Synthetic: conflicting reports on this player's status make the protection read genuinely uncertain.",
        evidenceIds: [EVIDENCE_ID.confirmedInjury, EVIDENCE_ID.conflictingInjury],
      }),
    ],
  })
);

/** The TRUSTED (already-validated-shaped) Stage A record used to build Stage B prompts directly in prompt-builder tests. Matches FIXTURE_STAGE_A_BASE's payload exactly. */
export const FIXTURE_LOCKED_STAGE_A: GrokStageAV1 = {
  ...(stageAPayload() as Omit<GrokStageAV1, "model">),
  model: "chatgpt",
};

/* -------------------------------------------------------------------------- */
/* STAGE B -- market decision (initial pass)                                  */
/* -------------------------------------------------------------------------- */

function stageBPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    schemaVersion: "nfl-grok-analysis-v1",
    model: "chatgpt",
    gameId: "2026_01_BAL_IND",
    generatedAt: "2026-09-12T00:05:00.000Z",
    contextHash: "",
    side: { lean: "undecided", confidence: 5, rationale: "Synthetic placeholder rationale." },
    total: { lean: "undecided", confidence: 5, rationale: "Synthetic placeholder rationale." },
    marketAssessment: baseMarketAssessment(),
    editorialArticle: baseEditorialArticle(),
    ...overrides,
  };
}

/** A. Strong home (IND) lean. */
export const FIXTURE_STAGE_B_HOME_LEAN = analysisResponse(
  stageBPayload({ side: { lean: "home", team: "ind", lineAtOpinion: { homeLine: MARKET_SPREAD, awayLine: -MARKET_SPREAD }, confidence: 8, rationale: "Synthetic: strong home lean rationale." } })
);

/** B. Strong away (BAL) lean. */
export const FIXTURE_STAGE_B_AWAY_LEAN = analysisResponse(
  stageBPayload({ side: { lean: "away", team: "bal", lineAtOpinion: { homeLine: MARKET_SPREAD, awayLine: -MARKET_SPREAD }, confidence: 7, rationale: "Synthetic: strong away lean rationale." } })
);

/** C. Side PASS. */
export const FIXTURE_STAGE_B_SIDE_PASS = analysisResponse(stageBPayload({ side: { lean: "pass", confidence: 4, rationale: "Synthetic: pass rationale -- no clear side edge." } }));

/** D. Total OVER. */
export const FIXTURE_STAGE_B_TOTAL_OVER = analysisResponse(stageBPayload({ total: { lean: "over", totalAtOpinion: MARKET_TOTAL, confidence: 7, rationale: "Synthetic: over rationale." } }));

/** E. Total UNDER. */
export const FIXTURE_STAGE_B_TOTAL_UNDER = analysisResponse(stageBPayload({ total: { lean: "under", totalAtOpinion: MARKET_TOTAL, confidence: 6, rationale: "Synthetic: under rationale." } }));

/** F. Total PASS. */
export const FIXTURE_STAGE_B_TOTAL_PASS = analysisResponse(stageBPayload({ total: { lean: "pass", confidence: 4, rationale: "Synthetic: pass rationale -- total looks efficiently priced." } }));

/** G. Evidence-conflict pairing: home lean with capped confidence (pairs with FIXTURE_STAGE_A_EVIDENCE_CONFLICT). */
export const FIXTURE_STAGE_B_CAPPED_CONFIDENCE = analysisResponse(
  stageBPayload({ side: { lean: "home", team: "ind", lineAtOpinion: { homeLine: MARKET_SPREAD, awayLine: -MARKET_SPREAD }, confidence: 4, rationale: "Synthetic: conflicting evidence on a key player caps confidence despite a directional lean." } })
);

/** H (15). PASS despite a nonzero deterministic edge. */
export const FIXTURE_STAGE_B_PASS_DESPITE_EDGE = analysisResponse(
  stageBPayload({
    marketAssessment: baseMarketAssessment({ interpretation: "Synthetic: my locked fair line and the market disagree by a real margin, but uncertainty is too high to translate that gap into a bet." }),
    side: { lean: "pass", confidence: 5, rationale: "Synthetic: a real edge exists on paper, but personnel uncertainty is too high to act on it." },
  })
);

/* -------------------------------------------------------------------------- */
/* Update mode                                                                */
/* -------------------------------------------------------------------------- */

function stageAUpdatePayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    schemaVersion: "nfl-grok-analysis-v1",
    model: "chatgpt",
    gameId: "2026_01_BAL_IND",
    generatedAt: "2026-09-12T12:00:00.000Z",
    contextHash: "",
    evidenceIdsUsed: [EVIDENCE_ID.personnelUpdate],
    developments: [
      {
        developmentId: "fixture-dev-1",
        evidenceIds: [EVIDENCE_ID.personnelUpdate],
        summary: "Synthetic: a personnel update since the prior projection.",
        significance: "moderate",
        direction: "home_positive",
        affectedAreas: ["usage"],
        footballImpact: "Synthetic placeholder impact.",
        marketRelevance: "Synthetic placeholder relevance.",
      },
    ],
    currentFootballThesis: "Synthetic: IND's front seven questions plausibly matter more than the raw talent gap suggests.",
    thesisChangeExplanation: "unchanged",
    prediction: FIXTURE_PREDICTION,
    ...overrides,
  };
}

export const FIXTURE_STAGE_A_UPDATE_REAFFIRM = analysisResponse(stageAUpdatePayload());

export const FIXTURE_STAGE_A_UPDATE_NO_MATERIAL_CHANGE = analysisResponse(stageAUpdatePayload({ evidenceIdsUsed: [], developments: [], thesisChangeExplanation: "unchanged" }));

function stageBUpdatePayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    schemaVersion: "nfl-grok-analysis-v1",
    model: "chatgpt",
    gameId: "2026_01_BAL_IND",
    generatedAt: "2026-09-12T12:05:00.000Z",
    contextHash: "",
    side: { lean: "home", team: "ind", lineAtOpinion: { homeLine: MARKET_SPREAD, awayLine: -MARKET_SPREAD }, confidence: 8, rationale: "Synthetic: strong home lean rationale." },
    total: { lean: "undecided", confidence: 5, rationale: "Synthetic: no strong total view." },
    marketAssessment: baseMarketAssessment(),
    conciseCommentary: "Synthetic: minor update, decision intact.",
    ...overrides,
  };
}

export const FIXTURE_PREVIOUS_ANALYSIS_STATE_HOME_LEAN: SnapshotAnalysisState = {
  thesis: "Synthetic: IND's front seven questions plausibly matter more than the raw talent gap suggests.",
  side: { lean: "home", confidence: 6, spreadLineAtOpinion: { homeLine: MARKET_SPREAD, awayLine: -MARKET_SPREAD } },
  total: { lean: "undecided", confidence: null, totalLineAtOpinion: null },
  independentPrediction: FIXTURE_PREDICTION,
  blindPrediction: { generatedAt: "2026-09-11T12:00:00.000Z", fairSpread: FIXTURE_PREDICTION.fairSpread, projectedTotal: FIXTURE_PREDICTION.projectedTotal, footballThesis: "Synthetic: IND's front seven questions plausibly matter more than the raw talent gap suggests." },
  marketDecision: {
    generatedAt: "2026-09-11T12:05:00.000Z",
    marketAtDecision: { spread: FIXTURE_CHATGPT_ANALYSIS_CURRENT_MARKET.spread, total: FIXTURE_CHATGPT_ANALYSIS_CURRENT_MARKET.total.line, asOf: FIXTURE_CHATGPT_ANALYSIS_CURRENT_MARKET.asOf },
    side: { lean: "home", confidence: 6, spreadLineAtOpinion: { homeLine: MARKET_SPREAD, awayLine: -MARKET_SPREAD } },
    total: { lean: "undecided", confidence: null, totalLineAtOpinion: null },
    sideEdgePoints: 5,
    totalEdgePoints: -1,
  },
};

export const FIXTURE_PREVIOUS_BLIND_STATE: PreviousBlindState = {
  thesis: FIXTURE_PREVIOUS_ANALYSIS_STATE_HOME_LEAN.thesis,
  fairSpread: FIXTURE_PREVIOUS_ANALYSIS_STATE_HOME_LEAN.independentPrediction!.fairSpread,
  projectedTotal: FIXTURE_PREVIOUS_ANALYSIS_STATE_HOME_LEAN.independentPrediction!.projectedTotal,
};

export const FIXTURE_MARKET_RECORD_UNCHANGED: SnapshotMarketRecord = {
  sportsbook: FIXTURE_CHATGPT_ANALYSIS_CURRENT_MARKET.sportsbook,
  spread: FIXTURE_CHATGPT_ANALYSIS_CURRENT_MARKET.spread,
  total: FIXTURE_CHATGPT_ANALYSIS_CURRENT_MARKET.total,
  moneyline: FIXTURE_CHATGPT_ANALYSIS_CURRENT_MARKET.moneyline,
  asOf: FIXTURE_CHATGPT_ANALYSIS_CURRENT_MARKET.asOf,
  previousSpread: FIXTURE_CHATGPT_ANALYSIS_CURRENT_MARKET.spread,
  previousTotal: FIXTURE_CHATGPT_ANALYSIS_CURRENT_MARKET.total.line,
  spreadDelta: 0,
  totalDelta: 0,
  moneylineHomeDelta: null,
  moneylineAwayDelta: null,
  sportsbookChanged: false,
  asOfDeltaMs: 3_600_000,
};

/** I. Update strengthens the prior home lean (confidence 6 -> 8, same lean/line). */
export const FIXTURE_STAGE_B_UPDATE_STRENGTHENS = analysisResponse(
  stageBUpdatePayload({ side: { lean: "home", team: "ind", lineAtOpinion: { homeLine: MARKET_SPREAD, awayLine: -MARKET_SPREAD }, confidence: 8, rationale: "Synthetic: new evidence reinforces the home lean." } })
);

/** J. Update weakens the prior home lean (confidence 6 -> 4, same lean/line). */
export const FIXTURE_STAGE_B_UPDATE_WEAKENS = analysisResponse(
  stageBUpdatePayload({ side: { lean: "home", team: "ind", lineAtOpinion: { homeLine: MARKET_SPREAD, awayLine: -MARKET_SPREAD }, confidence: 4, rationale: "Synthetic: new evidence tempers the home lean." } })
);

/** K. Update changes side (home -> away). */
export const FIXTURE_STAGE_B_UPDATE_CHANGES_SIDE = analysisResponse(
  stageBUpdatePayload({ side: { lean: "away", team: "bal", lineAtOpinion: { homeLine: MARKET_SPREAD, awayLine: -MARKET_SPREAD }, confidence: 6, rationale: "Synthetic: new evidence flips the side entirely." } })
);

/** L. Update moves the prior home lean to PASS. */
export const FIXTURE_STAGE_B_UPDATE_MOVES_TO_PASS = analysisResponse(stageBUpdatePayload({ side: { lean: "pass", confidence: 4, rationale: "Synthetic: material opposing news removes the prior edge." } }));

/** M. No-material-change update: identical lean/confidence to the prior state. */
export const FIXTURE_STAGE_B_UPDATE_NO_MATERIAL_CHANGE = analysisResponse(
  stageBUpdatePayload({ side: { lean: "home", team: "ind", lineAtOpinion: { homeLine: MARKET_SPREAD, awayLine: -MARKET_SPREAD }, confidence: 6, rationale: "Synthetic: nothing material changed." } })
);

/**
 * WU4.4.3 -- modeled on the real first live --mode=update run: HTTP 200,
 * `status: "incomplete"`, `incomplete_details.reason: "max_output_tokens"`,
 * output_tokens exactly equal to the configured max_output_tokens, and a
 * message whose text is a genuinely unterminated JSON object (the model was
 * cut off mid-emission while still reaching the correct prior opinion).
 * Mirrors nfl-chatgpt-research-fixtures.ts's FIXTURE_TRUNCATED_MAX_OUTPUT_TOKENS_RESPONSE
 * shape, minus the web_search_call item (the analysis adapter never sends `tools`).
 */
export function truncatedAnalysisResponse(maxOutputTokens: number): unknown {
  return {
    id: "resp_fixture_chatgpt_analysis_truncated_0001",
    object: "response",
    status: "incomplete",
    incomplete_details: { reason: "max_output_tokens" },
    model: "gpt-5.6-luna",
    created_at: 1_789_200_000,
    completed_at: 1_789_200_006,
    reasoning: { context: "all_turns", effort: "medium", mode: "standard", summary: null },
    output: [
      {
        id: "msg_fixture_chatgpt_analysis_truncated_1",
        type: "message",
        status: "incomplete",
        role: "assistant",
        phase: "final_answer",
        // Deliberately unterminated -- a dangling, unclosed JSON object.
        content: [{ type: "output_text", annotations: [], logprobs: [], text: `{"schemaVersion":"","model":"chatgpt","gameId":"2026_01_BAL_IND","footballThesis":"Synthetic: cut off mid-` }],
      },
    ],
    usage: {
      input_tokens: 3027,
      input_tokens_details: { cache_write_tokens: 0, cached_tokens: 0 },
      output_tokens: maxOutputTokens,
      output_tokens_details: { reasoning_tokens: 1141 },
      total_tokens: 3027 + maxOutputTokens,
    },
  };
}

/** `status: "incomplete"` but for an unrelated reason (e.g. a content filter) -- must NOT be classified as a retriable truncation and must NOT trigger a retry. */
export function incompleteNonTokenReasonAnalysisResponse(): unknown {
  const base = truncatedAnalysisResponse(2500) as Record<string, unknown>;
  return { ...base, incomplete_details: { reason: "content_filter" } };
}

/** Malformed-JSON provider response (prose, no JSON object) -- must fail closed. */
export const FIXTURE_MALFORMED_ANALYSIS_RESPONSE = {
  ...analysisResponse({}),
  output: [
    {
      id: "msg_fixture_chatgpt_bad_1",
      type: "message",
      status: "completed",
      role: "assistant",
      phase: "final_answer",
      content: [{ type: "output_text", annotations: [], logprobs: [], text: "Here is my analysis in plain prose, not JSON." }],
    },
  ],
};

export { EVIDENCE_ID as FIXTURE_CHATGPT_ANALYSIS_EVIDENCE_ID, FIXTURE_PREDICTION };
