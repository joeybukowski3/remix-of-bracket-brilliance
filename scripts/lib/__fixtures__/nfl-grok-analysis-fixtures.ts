/**
 * WU3.4 -- SYNTHETIC fixtures for the Grok handicapping engine. Every
 * thesis, rationale, confidence value, and failure mode here is invented
 * for testing nfl-grok-analysis-validator.ts / nfl-grok-analysis-pipeline.ts
 * without a network call. The DETERMINISTIC context packet is the real,
 * committed 2026_01_BAL_IND Game Context Packet (read from disk) -- reusing
 * real market numbers so validator cross-checks (marketAssessment vs.
 * context) exercise real values, while every analysis JUDGMENT remains
 * synthetic.
 *
 * WU4.6 -- TWO-STAGE MARKET-BLIND HANDICAPPER split every fixture that used
 * to be one combined analysis payload into a STAGE A (blind football
 * projection) fixture and a STAGE B (market decision) fixture. Stage A never
 * carries side/total/marketAssessment; Stage B never carries
 * footballThesis/matchupFactors/prediction/failureModes/evidenceQualityAssessment.
 *
 * Provider response shape mirrors nfl-grok-research-fixtures.ts's real,
 * confirmed `/v1/responses` shape, minus any `web_search_call` items --
 * the analysis engine never enables `tools`.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeExternalEvidence } from "../nfl-evidence-normalizer";
import { resolveEvidenceAuthority } from "../nfl-evidence-store";
import { FIXTURE_CONTEXT, confirmedInjuryCandidate, conflictingInjuryCandidate, personnelUpdateCandidate, questionablePlayerCandidate, rejectedRumorCandidate } from "./nfl-evidence-fixtures";
import type { NflGameContextPacket } from "../nfl-full-game-context";
import type { AnalysisGameFacts, PreviousBlindState } from "../nfl-grok-analysis-adapter";
import type { GrokStageAV1 } from "../nfl-grok-analysis-types";
import type { EditorialArticle, SnapshotAnalysisState, SnapshotMarketRecord, SnapshotMarketState } from "../nfl-snapshot-types";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export const FIXTURE_ANALYSIS_CONTEXT_PACKET: NflGameContextPacket = JSON.parse(
  readFileSync(join(ROOT, "data", "nfl", "game-context", "2026", "1", "2026_01_BAL_IND.json"), "utf8")
);

export const FIXTURE_ANALYSIS_GAME: AnalysisGameFacts = {
  gameId: "2026_01_BAL_IND",
  homeTeamFull: "Indianapolis Colts",
  awayTeamFull: "Baltimore Ravens",
  homeTeam: "ind",
  awayTeam: "bal",
  kickoffUtc: FIXTURE_ANALYSIS_CONTEXT_PACKET.schedule.kickoffUtc,
};

export const FIXTURE_ANALYSIS_CONTEXT_HASH = "fixture-analysis-context-hash-0001";

export const FIXTURE_ANALYSIS_CURRENT_MARKET: SnapshotMarketState = {
  sportsbook: FIXTURE_ANALYSIS_CONTEXT_PACKET.market.sportsbook,
  spread: { homeLine: FIXTURE_ANALYSIS_CONTEXT_PACKET.market.spread.homeLine, awayLine: FIXTURE_ANALYSIS_CONTEXT_PACKET.market.spread.awayLine },
  total: { line: FIXTURE_ANALYSIS_CONTEXT_PACKET.market.total.line },
  moneyline: { homePrice: null, awayPrice: null },
  asOf: FIXTURE_ANALYSIS_CONTEXT_PACKET.provenance.builtAt,
};

const MARKET_SPREAD = FIXTURE_ANALYSIS_CONTEXT_PACKET.market.spread.homeLine!;
const MARKET_TOTAL = FIXTURE_ANALYSIS_CONTEXT_PACKET.market.total.line!;

/** WU4.5 -- synthetic INDEPENDENT prediction (never JKB's projectedSpread/projectedTotal, which the model is never shown). Home team (IND) favored by 1.5. WU4.6: this is Stage A's LOCKED output -- never revised by Stage B. */
const FIXTURE_PREDICTION = { fairSpread: { team: "ind", line: -1.5 }, projectedTotal: MARKET_TOTAL - 1 };

function normalizeOrThrow(candidate: Parameters<typeof normalizeExternalEvidence>[0]) {
  const result = normalizeExternalEvidence(candidate, FIXTURE_CONTEXT);
  if (!result.ok) throw new Error(`analysis fixture evidence failed to normalize: ${result.reasons.join("; ")}`);
  return result.evidence;
}

/** Synthetic Grok evidence stream: injury (confirmed OUT, official), questionable player (beat), conflicting earlier report, personnel update, rejected rumor -- enough variety to exercise authority annotation and rejected-evidence citation rejection. */
export const FIXTURE_ANALYSIS_EVIDENCE_RECORDS = [
  normalizeOrThrow(confirmedInjuryCandidate),
  normalizeOrThrow(questionablePlayerCandidate),
  normalizeOrThrow(conflictingInjuryCandidate),
  normalizeOrThrow(personnelUpdateCandidate),
  normalizeOrThrow(rejectedRumorCandidate),
];

export const FIXTURE_ANALYSIS_EVIDENCE_AUTHORITY = resolveEvidenceAuthority(FIXTURE_ANALYSIS_EVIDENCE_RECORDS);

/** A chatgpt-model record deliberately included so cross-model-citation tests have a real id to reference. */
export const FIXTURE_ANALYSIS_CHATGPT_RECORD = (() => {
  const result = normalizeExternalEvidence({ ...confirmedInjuryCandidate, model: "chatgpt", source: { ...confirmedInjuryCandidate.source, url: "https://example-fixture.test/chatgpt-only/never-cite-me" } }, FIXTURE_CONTEXT);
  if (!result.ok) throw new Error("chatgpt fixture record failed to normalize");
  return result.evidence;
})();

/** WU4.6 -- a market-pricing evidence record (category:"market") deliberately included so "excluded from blind Stage A" tests have a real id to reference. Citable by model/verification/pregameSafe rules, but must never survive filterEvidenceRecordsForBlindStageA(). */
export const FIXTURE_ANALYSIS_MARKET_COMMENTARY_RECORD = (() => {
  const result = normalizeExternalEvidence(
    { ...confirmedInjuryCandidate, category: "market", claim: "The spread opened at IND -3 and has since moved to IND -1.5 as of Thursday.", source: { ...confirmedInjuryCandidate.source, url: "https://example-fixture.test/grok-only/market-commentary" } },
    FIXTURE_CONTEXT
  );
  if (!result.ok) throw new Error("market-commentary fixture record failed to normalize");
  return result.evidence;
})();

export const FIXTURE_ANALYSIS_ALL_EVIDENCE_RECORDS = [...FIXTURE_ANALYSIS_EVIDENCE_RECORDS, FIXTURE_ANALYSIS_CHATGPT_RECORD];

const EVIDENCE_ID = {
  confirmedInjury: FIXTURE_ANALYSIS_EVIDENCE_RECORDS[0].evidenceId,
  questionablePlayer: FIXTURE_ANALYSIS_EVIDENCE_RECORDS[1].evidenceId,
  conflictingInjury: FIXTURE_ANALYSIS_EVIDENCE_RECORDS[2].evidenceId,
  personnelUpdate: FIXTURE_ANALYSIS_EVIDENCE_RECORDS[3].evidenceId,
  rejectedRumor: FIXTURE_ANALYSIS_EVIDENCE_RECORDS[4].evidenceId,
  chatgptOnly: FIXTURE_ANALYSIS_CHATGPT_RECORD.evidenceId,
  marketCommentary: FIXTURE_ANALYSIS_MARKET_COMMENTARY_RECORD.evidenceId,
};

function baseMarketAssessment(overrides: Partial<Record<string, number | string | null>> = {}) {
  return {
    currentHomeLine: MARKET_SPREAD,
    currentAwayLine: FIXTURE_ANALYSIS_CONTEXT_PACKET.market.spread.awayLine,
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

function analysisResponse(payload: unknown, costTicks = 90_000_000) {
  return {
    id: "resp_fixture_analysis_0001",
    model: "grok-4.6",
    object: "response",
    status: "completed",
    output: [
      { id: "rs_fixture_analysis_1", type: "reasoning", status: "completed", summary: [{ type: "summary_text", text: "Synthesizing structured handicap from supplied context/evidence." }] },
      {
        id: "msg_fixture_analysis_1",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: JSON.stringify(payload), annotations: [] }],
      },
    ],
    usage: {
      input_tokens: 18000,
      input_tokens_details: { cached_tokens: 2000 },
      output_tokens: 1200,
      output_tokens_details: { reasoning_tokens: 800 },
      total_tokens: 19200,
      cost_in_usd_ticks: costTicks,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* STAGE A -- blind football projection (initial pass)                        */
/* -------------------------------------------------------------------------- */

function stageAPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    schemaVersion: "nfl-grok-analysis-v1",
    model: "grok",
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

/** The baseline Stage A (blind) response every Stage B fixture below is implicitly paired with. */
export const FIXTURE_STAGE_A_BASE = analysisResponse(stageAPayload());

/** Evidence conflict scenario -- cites the conflicting-status evidence, exercised together with a Stage B confidence cap. */
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

/** The TRUSTED (already-validated-shaped) Stage A record used to build Stage B prompts directly in prompt-builder tests, without invoking the validator from this fixtures module. Matches FIXTURE_STAGE_A_BASE's payload exactly. */
export const FIXTURE_LOCKED_STAGE_A: GrokStageAV1 = {
  ...(stageAPayload() as Omit<GrokStageAV1, "model">),
  model: "grok",
};

/* -------------------------------------------------------------------------- */
/* STAGE B -- market decision (initial pass)                                  */
/* -------------------------------------------------------------------------- */

function stageBPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    schemaVersion: "nfl-grok-analysis-v1",
    model: "grok",
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
  stageBPayload({
    side: { lean: "home", team: "ind", lineAtOpinion: { homeLine: MARKET_SPREAD, awayLine: -MARKET_SPREAD }, confidence: 8, rationale: "Synthetic: strong home lean rationale." },
  })
);

/** B. Strong away (BAL) lean. */
export const FIXTURE_STAGE_B_AWAY_LEAN = analysisResponse(
  stageBPayload({
    side: { lean: "away", team: "bal", lineAtOpinion: { homeLine: MARKET_SPREAD, awayLine: -MARKET_SPREAD }, confidence: 7, rationale: "Synthetic: strong away lean rationale." },
  })
);

/** C. Side PASS. */
export const FIXTURE_STAGE_B_SIDE_PASS = analysisResponse(
  stageBPayload({
    side: { lean: "pass", confidence: 4, rationale: "Synthetic: pass rationale -- no clear side edge." },
  })
);

/** D. Total OVER. */
export const FIXTURE_STAGE_B_TOTAL_OVER = analysisResponse(
  stageBPayload({
    total: { lean: "over", totalAtOpinion: MARKET_TOTAL, confidence: 7, rationale: "Synthetic: over rationale." },
  })
);

/** E. Total UNDER. */
export const FIXTURE_STAGE_B_TOTAL_UNDER = analysisResponse(
  stageBPayload({
    total: { lean: "under", totalAtOpinion: MARKET_TOTAL, confidence: 6, rationale: "Synthetic: under rationale." },
  })
);

/** F. Total PASS. */
export const FIXTURE_STAGE_B_TOTAL_PASS = analysisResponse(
  stageBPayload({
    total: { lean: "pass", confidence: 4, rationale: "Synthetic: pass rationale -- total looks efficiently priced." },
  })
);

/** G. Evidence-conflict pairing: home lean with capped confidence (pairs with FIXTURE_STAGE_A_EVIDENCE_CONFLICT). */
export const FIXTURE_STAGE_B_CAPPED_CONFIDENCE = analysisResponse(
  stageBPayload({
    side: { lean: "home", team: "ind", lineAtOpinion: { homeLine: MARKET_SPREAD, awayLine: -MARKET_SPREAD }, confidence: 4, rationale: "Synthetic: conflicting evidence on a key player caps confidence despite a directional lean." },
  })
);

/** H (15). PASS despite a nonzero deterministic edge -- proves PASS is valid even when the mechanical edge computation is not zero. */
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
    model: "grok",
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

/** Reaffirms the prior blind projection unchanged -- pairs with any Stage B update fixture below. */
export const FIXTURE_STAGE_A_UPDATE_REAFFIRM = analysisResponse(stageAUpdatePayload());

/** No-material-change Stage A update: empty developments, identical thesis/prediction. */
export const FIXTURE_STAGE_A_UPDATE_NO_MATERIAL_CHANGE = analysisResponse(
  stageAUpdatePayload({ evidenceIdsUsed: [], developments: [], thesisChangeExplanation: "unchanged" })
);

function stageBUpdatePayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    schemaVersion: "nfl-grok-analysis-v1",
    model: "grok",
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
  side: { lean: "home", confidence: 6, spreadLineAtOpinion: { homeLine: MARKET_SPREAD, awayLine: -MARKET_SPREAD }, rationale: "Synthetic: prior home lean rationale." },
  total: { lean: "undecided", confidence: null, totalLineAtOpinion: null, rationale: "Synthetic: prior no strong total view." },
  matchupFactors: [baseFactor()],
  failureModes: baseFailureModes(),
  evidenceQualityAssessment: { strengths: ["Synthetic: one official injury report."], limitations: ["Synthetic: limited beat coverage overall."] },
  independentPrediction: FIXTURE_PREDICTION,
  blindPrediction: { generatedAt: "2026-09-11T12:00:00.000Z", fairSpread: FIXTURE_PREDICTION.fairSpread, projectedTotal: FIXTURE_PREDICTION.projectedTotal, footballThesis: "Synthetic: IND's front seven questions plausibly matter more than the raw talent gap suggests." },
  marketDecision: {
    generatedAt: "2026-09-11T12:05:00.000Z",
    marketAtDecision: { spread: FIXTURE_ANALYSIS_CURRENT_MARKET.spread, total: FIXTURE_ANALYSIS_CURRENT_MARKET.total.line, asOf: FIXTURE_ANALYSIS_CURRENT_MARKET.asOf },
    side: { lean: "home", confidence: 6, spreadLineAtOpinion: { homeLine: MARKET_SPREAD, awayLine: -MARKET_SPREAD }, rationale: "Synthetic: prior home lean rationale." },
    total: { lean: "undecided", confidence: null, totalLineAtOpinion: null, rationale: "Synthetic: prior no strong total view." },
    sideEdgePoints: 5,
    totalEdgePoints: -1,
  },
};

/** WU4.6 -- the PreviousBlindState an update-mode Stage A prompt is built from, derived from FIXTURE_PREVIOUS_ANALYSIS_STATE_HOME_LEAN. */
export const FIXTURE_PREVIOUS_BLIND_STATE: PreviousBlindState = {
  thesis: FIXTURE_PREVIOUS_ANALYSIS_STATE_HOME_LEAN.thesis,
  fairSpread: FIXTURE_PREVIOUS_ANALYSIS_STATE_HOME_LEAN.independentPrediction!.fairSpread,
  projectedTotal: FIXTURE_PREVIOUS_ANALYSIS_STATE_HOME_LEAN.independentPrediction!.projectedTotal,
};

export const FIXTURE_MARKET_RECORD_UNCHANGED: SnapshotMarketRecord = {
  sportsbook: FIXTURE_ANALYSIS_CURRENT_MARKET.sportsbook,
  spread: FIXTURE_ANALYSIS_CURRENT_MARKET.spread,
  total: FIXTURE_ANALYSIS_CURRENT_MARKET.total,
  moneyline: FIXTURE_ANALYSIS_CURRENT_MARKET.moneyline,
  asOf: FIXTURE_ANALYSIS_CURRENT_MARKET.asOf,
  previousSpread: FIXTURE_ANALYSIS_CURRENT_MARKET.spread,
  previousTotal: FIXTURE_ANALYSIS_CURRENT_MARKET.total.line,
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
export const FIXTURE_STAGE_B_UPDATE_MOVES_TO_PASS = analysisResponse(
  stageBUpdatePayload({ side: { lean: "pass", confidence: 4, rationale: "Synthetic: material opposing news removes the prior edge." } })
);

/** M. No-material-change update: identical lean/confidence to the prior state. */
export const FIXTURE_STAGE_B_UPDATE_NO_MATERIAL_CHANGE = analysisResponse(
  stageBUpdatePayload({
    side: { lean: "home", team: "ind", lineAtOpinion: { homeLine: MARKET_SPREAD, awayLine: -MARKET_SPREAD }, confidence: 6, rationale: "Synthetic: nothing material changed." },
  })
);

/** Malformed-JSON provider response (prose, no JSON object) -- must fail closed. Reusable for either stage. */
export const FIXTURE_MALFORMED_ANALYSIS_RESPONSE = {
  ...analysisResponse({}),
  output: [
    { id: "rs_fixture_bad_1", type: "reasoning", status: "completed", summary: [] },
    { id: "msg_fixture_bad_1", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Here is my analysis in plain prose, not JSON.", annotations: [] }] },
  ],
};

export { EVIDENCE_ID as FIXTURE_ANALYSIS_EVIDENCE_ID, FIXTURE_PREDICTION };
