/**
 * WU4.4 -- exercises the SHARED validator (nfl-grok-analysis-validator.ts,
 * called with model:"chatgpt") against the ChatGPT-namespace fixtures. This
 * intentionally mirrors nfl-grok-analysis-validator.ts's test structure so
 * the two model namespaces are checked against the same standard.
 *
 * WU4.6 -- updated for the two-stage (Stage A blind projection / Stage B
 * market decision) split.
 */
import { describe, expect, it } from "vitest";
import { validateGrokStageA, validateGrokStageB, validateGrokStageBUpdate, type GrokStageAValidationContext, type GrokStageBValidationContext } from "./nfl-grok-analysis-validator";
import {
  FIXTURE_CHATGPT_ANALYSIS_ALL_EVIDENCE_RECORDS,
  FIXTURE_CHATGPT_ANALYSIS_CONTEXT_HASH,
  FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET,
  FIXTURE_CHATGPT_ANALYSIS_CURRENT_MARKET,
  FIXTURE_CHATGPT_ANALYSIS_EVIDENCE_ID,
  FIXTURE_PREDICTION,
  FIXTURE_STAGE_A_BASE,
  FIXTURE_STAGE_A_EVIDENCE_CONFLICT,
  FIXTURE_STAGE_B_CAPPED_CONFIDENCE,
  FIXTURE_STAGE_B_HOME_LEAN,
  FIXTURE_STAGE_B_PASS_DESPITE_EDGE,
  FIXTURE_STAGE_B_SIDE_PASS,
  FIXTURE_STAGE_B_TOTAL_OVER,
  FIXTURE_STAGE_B_TOTAL_PASS,
  FIXTURE_STAGE_B_UPDATE_STRENGTHENS,
} from "./__fixtures__/nfl-chatgpt-analysis-fixtures";

function extractPayload(fixtureResponse: { output: Array<{ type: string; content?: Array<{ text: string }> }> }): unknown {
  const message = fixtureResponse.output.find((o) => o.type === "message");
  return JSON.parse(message!.content![0].text);
}

const STAGE_A_CONTEXT: GrokStageAValidationContext = {
  model: "chatgpt",
  gameId: "2026_01_BAL_IND",
  generatedAt: "2026-09-13T00:00:00.000Z",
  contextHash: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_HASH,
  contextPacket: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET,
  homeTeam: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET.identity.homeTeam,
  awayTeam: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET.identity.awayTeam,
  allEvidenceRecords: FIXTURE_CHATGPT_ANALYSIS_ALL_EVIDENCE_RECORDS,
};

const STAGE_B_CONTEXT: GrokStageBValidationContext = {
  model: "chatgpt",
  gameId: "2026_01_BAL_IND",
  generatedAt: "2026-09-13T00:05:00.000Z",
  contextHash: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_HASH,
  currentMarketState: FIXTURE_CHATGPT_ANALYSIS_CURRENT_MARKET,
  homeTeam: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET.identity.homeTeam,
  lockedPrediction: FIXTURE_PREDICTION,
};

describe("validateGrokStageA (chatgpt namespace)", () => {
  it("accepts a well-formed blind football projection", () => {
    const result = validateGrokStageA(extractPayload(FIXTURE_STAGE_A_BASE), STAGE_A_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.model).toBe("chatgpt");
    expect(result.analysis.contextHash).toBe(FIXTURE_CHATGPT_ANALYSIS_CONTEXT_HASH);
  });

  it("rejects a payload declaring model:'grok' against a chatgpt validation context", () => {
    const payload = extractPayload(FIXTURE_STAGE_A_BASE) as Record<string, unknown>;
    const bad = { ...payload, model: "grok" };
    const result = validateGrokStageA(bad, STAGE_A_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toMatch(/model "grok" must be "chatgpt"/);
  });

  it("rejects a citation to a nonexistent evidenceId", () => {
    const payload = extractPayload(FIXTURE_STAGE_A_BASE) as Record<string, unknown>;
    const bad = { ...payload, evidenceIdsUsed: ["chatgpt-2026_01_BAL_IND-does-not-exist"] };
    const result = validateGrokStageA(bad, STAGE_A_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toMatch(/does not exist in the supplied Chatgpt evidence set/);
  });

  it("rejects citation of a genuinely rejected (verificationStatus:'rejected') evidenceId", () => {
    const payload = extractPayload(FIXTURE_STAGE_A_BASE) as Record<string, unknown>;
    const factor = (payload.matchupFactors as Record<string, unknown>[])[0];
    const bad = { ...payload, matchupFactors: [{ ...factor, evidenceIds: [FIXTURE_CHATGPT_ANALYSIS_EVIDENCE_ID.rejectedRumor] }] };
    const result = validateGrokStageA(bad, STAGE_A_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toMatch(/rejected evidence cannot be cited/);
  });

  it("MODEL ISOLATION: rejects a citation to a Grok-namespace evidenceId (cross-model) -- ChatGPT can never cite Grok evidence", () => {
    const payload = extractPayload(FIXTURE_STAGE_A_BASE) as Record<string, unknown>;
    const bad = { ...payload, evidenceIdsUsed: [FIXTURE_CHATGPT_ANALYSIS_EVIDENCE_ID.grokOnly] };
    const result = validateGrokStageA(bad, STAGE_A_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toMatch(/belongs to model "grok", not chatgpt -- cross-model citation is forbidden/);
  });

  it("rejects an analysis with fewer than 2 failureModes", () => {
    const payload = extractPayload(FIXTURE_STAGE_A_BASE) as Record<string, unknown>;
    const bad = { ...payload, failureModes: [{ scenario: "one only", whyItMatters: "not enough" }] };
    const result = validateGrokStageA(bad, STAGE_A_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toMatch(/failureModes must be an array with at least 2 entries/);
  });

  it("accepts an evidence-conflict scenario", () => {
    const result = validateGrokStageA(extractPayload(FIXTURE_STAGE_A_EVIDENCE_CONFLICT), STAGE_A_CONTEXT);
    expect(result.ok).toBe(true);
  });

  it("WU4.5: requires an independent prediction with a valid sign convention", () => {
    const payload = extractPayload(FIXTURE_STAGE_A_BASE) as Record<string, unknown>;
    const bad = { ...payload, prediction: { fairSpread: { team: "ind", line: 1.5 }, projectedTotal: 46.5 } };
    const result = validateGrokStageA(bad, STAGE_A_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toMatch(/must be <= 0/);
  });
});

describe("validateGrokStageB (chatgpt namespace)", () => {
  it("accepts a well-formed market decision (home lean)", () => {
    const result = validateGrokStageB(extractPayload(FIXTURE_STAGE_B_HOME_LEAN), STAGE_B_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.model).toBe("chatgpt");
  });

  // WU7.5 -- root cause of the WU7.4 CAR_ATL incident (this exact "chatgpt namespace" validator):
  // the model was asked to echo currentHomeLine/currentAwayLine/currentTotal and
  // side.lineAtOpinion back, and inverted home/away doing so. Neither is part of the raw contract
  // anymore -- the engine always attaches the authoritative currentMarketState mechanically, so a
  // provider literally cannot invert, flip, or otherwise misreport these values.
  it("WU7.5: ignores an inverted/garbage marketAssessment.currentHomeLine -- the trusted output always reflects the authoritative currentMarketState instead", () => {
    const payload = extractPayload(FIXTURE_STAGE_B_HOME_LEAN) as Record<string, unknown>;
    const bad = { ...payload, marketAssessment: { ...(payload.marketAssessment as Record<string, unknown>), currentHomeLine: -99, currentAwayLine: 99 } };
    const result = validateGrokStageB(bad, STAGE_B_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.marketAssessment.currentHomeLine).toBe(STAGE_B_CONTEXT.currentMarketState.spread.homeLine);
    expect(result.analysis.marketAssessment.currentAwayLine).toBe(STAGE_B_CONTEXT.currentMarketState.spread.awayLine);
  });

  it("WU7.5: reproduces the exact CAR_ATL incident shape (inverted side.lineAtOpinion) and confirms it is now ignored, never rejected or trusted", () => {
    // Away: CAR, Home: ATL. Supplied market: home ATL +2.5, away CAR -2.5. The model in the real
    // incident reported currentHomeLine=-2.5/currentAwayLine=+2.5 (inverted) and a matching
    // inverted side.lineAtOpinion -- exactly reproduced here.
    const payload = extractPayload(FIXTURE_STAGE_B_HOME_LEAN) as Record<string, unknown>;
    const bad = {
      ...payload,
      marketAssessment: { ...(payload.marketAssessment as Record<string, unknown>), currentHomeLine: -2.5, currentAwayLine: 2.5 },
      side: { ...(payload.side as Record<string, unknown>), lineAtOpinion: { homeLine: -2.5, awayLine: 2.5 } },
    };
    const result = validateGrokStageB(bad, STAGE_B_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.marketAssessment.currentHomeLine).toBe(STAGE_B_CONTEXT.currentMarketState.spread.homeLine);
    expect(result.analysis.marketAssessment.currentAwayLine).toBe(STAGE_B_CONTEXT.currentMarketState.spread.awayLine);
    expect(result.analysis.side.lineAtOpinion).toEqual({ homeLine: STAGE_B_CONTEXT.currentMarketState.spread.homeLine, awayLine: STAGE_B_CONTEXT.currentMarketState.spread.awayLine });
  });

  it("side and total validate independently -- side PASS and total OVER both validate on their own terms", () => {
    const sidePass = validateGrokStageB(extractPayload(FIXTURE_STAGE_B_SIDE_PASS), STAGE_B_CONTEXT);
    const totalOver = validateGrokStageB(extractPayload(FIXTURE_STAGE_B_TOTAL_OVER), STAGE_B_CONTEXT);
    expect(sidePass.ok).toBe(true);
    expect(totalOver.ok).toBe(true);
    if (sidePass.ok) expect(sidePass.analysis.side.lean).toBe("pass");
    if (totalOver.ok) expect(totalOver.analysis.total.lean).toBe("over");
  });

  it("PASS is a valid, accepted lean for both side and total with no lineAtOpinion/totalAtOpinion required", () => {
    const result = validateGrokStageB(extractPayload(FIXTURE_STAGE_B_TOTAL_PASS), STAGE_B_CONTEXT);
    expect(result.ok).toBe(true);
  });

  it("accepts an evidence-conflict-driven confidence cap", () => {
    const result = validateGrokStageB(extractPayload(FIXTURE_STAGE_B_CAPPED_CONFIDENCE), STAGE_B_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.side.confidence).toBeLessThanOrEqual(5);
  });

  it("15. PASS is valid despite a nonzero deterministic edge", () => {
    const result = validateGrokStageB(extractPayload(FIXTURE_STAGE_B_PASS_DESPITE_EDGE), STAGE_B_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.side.lean).toBe("pass");
    expect(result.analysis.marketAssessment.sideEdgePoints).not.toBe(0);
  });

  it("11/12. ignores any smuggled prediction/fairSpread/projectedTotal fields", () => {
    const payload = extractPayload(FIXTURE_STAGE_B_HOME_LEAN) as Record<string, unknown>;
    const smuggled = { ...payload, prediction: { fairSpread: { team: "bal", line: -9 }, projectedTotal: 12 } };
    const result = validateGrokStageB(smuggled, STAGE_B_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis).not.toHaveProperty("prediction");
  });
});

describe("validateGrokStageBUpdate (chatgpt namespace)", () => {
  it("MODEL ISOLATION: accepts a well-formed update market decision", () => {
    const result = validateGrokStageBUpdate(extractPayload(FIXTURE_STAGE_B_UPDATE_STRENGTHENS), STAGE_B_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposal.model).toBe("chatgpt");
  });
});
