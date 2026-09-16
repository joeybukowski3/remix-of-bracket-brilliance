import { describe, expect, it } from "vitest";
import { validateGrokStageA, validateGrokStageAUpdate, validateGrokStageB, validateGrokStageBUpdate, type GrokStageAValidationContext, type GrokStageBValidationContext } from "./nfl-grok-analysis-validator";
import { MATCHUP_FACTOR_AREAS } from "./nfl-grok-analysis-types";
import {
  FIXTURE_ANALYSIS_ALL_EVIDENCE_RECORDS,
  FIXTURE_ANALYSIS_CONTEXT_HASH,
  FIXTURE_ANALYSIS_CONTEXT_PACKET,
  FIXTURE_ANALYSIS_CURRENT_MARKET,
  FIXTURE_ANALYSIS_EVIDENCE_ID,
  FIXTURE_LOCKED_STAGE_A,
  FIXTURE_PREDICTION,
  FIXTURE_STAGE_A_BASE,
  FIXTURE_STAGE_A_EVIDENCE_CONFLICT,
  FIXTURE_STAGE_A_UPDATE_NO_MATERIAL_CHANGE,
  FIXTURE_STAGE_A_UPDATE_REAFFIRM,
  FIXTURE_STAGE_B_CAPPED_CONFIDENCE,
  FIXTURE_STAGE_B_HOME_LEAN,
  FIXTURE_STAGE_B_PASS_DESPITE_EDGE,
  FIXTURE_STAGE_B_SIDE_PASS,
  FIXTURE_STAGE_B_TOTAL_OVER,
  FIXTURE_STAGE_B_TOTAL_PASS,
  FIXTURE_STAGE_B_UPDATE_STRENGTHENS,
} from "./__fixtures__/nfl-grok-analysis-fixtures";

function extractPayload(fixtureResponse: { output: Array<{ type: string; content?: Array<{ text: string }> }> }): unknown {
  const message = fixtureResponse.output.find((o) => o.type === "message");
  return JSON.parse(message!.content![0].text);
}

const TRUSTED_STAGE_A_GENERATED_AT = "2026-09-13T00:00:00.000Z";
const TRUSTED_STAGE_B_GENERATED_AT = "2026-09-13T00:05:00.000Z";

const STAGE_A_CONTEXT: GrokStageAValidationContext = {
  model: "grok",
  gameId: "2026_01_BAL_IND",
  generatedAt: TRUSTED_STAGE_A_GENERATED_AT,
  contextHash: FIXTURE_ANALYSIS_CONTEXT_HASH,
  contextPacket: FIXTURE_ANALYSIS_CONTEXT_PACKET,
  homeTeam: FIXTURE_ANALYSIS_CONTEXT_PACKET.identity.homeTeam,
  awayTeam: FIXTURE_ANALYSIS_CONTEXT_PACKET.identity.awayTeam,
  allEvidenceRecords: FIXTURE_ANALYSIS_ALL_EVIDENCE_RECORDS,
};

const STAGE_B_CONTEXT: GrokStageBValidationContext = {
  model: "grok",
  gameId: "2026_01_BAL_IND",
  generatedAt: TRUSTED_STAGE_B_GENERATED_AT,
  contextHash: FIXTURE_ANALYSIS_CONTEXT_HASH,
  currentMarketState: FIXTURE_ANALYSIS_CURRENT_MARKET,
  homeTeam: FIXTURE_ANALYSIS_CONTEXT_PACKET.identity.homeTeam,
  lockedPrediction: FIXTURE_PREDICTION,
};

describe("validateGrokStageA", () => {
  it("1. accepts a well-formed blind football projection", () => {
    const result = validateGrokStageA(extractPayload(FIXTURE_STAGE_A_BASE), STAGE_A_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.schemaVersion).toBe("nfl-grok-analysis-v1");
    expect(result.analysis.model).toBe("grok");
    expect(result.analysis.contextHash).toBe(FIXTURE_ANALYSIS_CONTEXT_HASH);
  });

  it("2. rejects malformed (non-object) input", () => {
    const result = validateGrokStageA("not an object", STAGE_A_CONTEXT);
    expect(result.ok).toBe(false);
  });

  it("4. rejects a citation to a nonexistent evidenceId", () => {
    const payload = extractPayload(FIXTURE_STAGE_A_BASE) as Record<string, unknown>;
    const bad = { ...payload, evidenceIdsUsed: ["grok-2026_01_BAL_IND-does-not-exist"] };
    const result = validateGrokStageA(bad, STAGE_A_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toMatch(/does not exist in the supplied Grok evidence set/);
  });

  it("5. rejects citation of a genuinely rejected (verificationStatus:'rejected') evidenceId", () => {
    const payload = extractPayload(FIXTURE_STAGE_A_BASE) as Record<string, unknown>;
    const factor = (payload.matchupFactors as Record<string, unknown>[])[0];
    const bad = { ...payload, matchupFactors: [{ ...factor, evidenceIds: [FIXTURE_ANALYSIS_EVIDENCE_ID.rejectedRumor] }] };
    const result = validateGrokStageA(bad, STAGE_A_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toMatch(/rejected evidence cannot be cited/);
  });

  it("6. rejects a citation to a ChatGPT-namespace evidenceId (cross-model)", () => {
    const payload = extractPayload(FIXTURE_STAGE_A_BASE) as Record<string, unknown>;
    const bad = { ...payload, evidenceIdsUsed: [FIXTURE_ANALYSIS_EVIDENCE_ID.chatgptOnly] };
    const result = validateGrokStageA(bad, STAGE_A_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toMatch(/cross-model citation is forbidden/);
  });

  it("11. rejects an analysis with fewer than 2 failureModes", () => {
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

  it("rejects a jkbContextRef that does not point to a real (blind) context section", () => {
    const payload = extractPayload(FIXTURE_STAGE_A_BASE) as Record<string, unknown>;
    const factor = (payload.matchupFactors as Record<string, unknown>[])[0];
    const bad = { ...payload, matchupFactors: [{ ...factor, jkbContextRefs: ["notARealSection.foo"] }] };
    const result = validateGrokStageA(bad, STAGE_A_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toMatch(/does not refer to a real Game Context Packet section/);
  });

  it("WU4.6: rejects a jkbContextRef into the (removed) market section -- 'market' is not a valid blind-packet prefix", () => {
    const payload = extractPayload(FIXTURE_STAGE_A_BASE) as Record<string, unknown>;
    const factor = (payload.matchupFactors as Record<string, unknown>[])[0];
    const bad = { ...payload, matchupFactors: [{ ...factor, jkbContextRefs: ["market.spread"] }] };
    const result = validateGrokStageA(bad, STAGE_A_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toMatch(/does not refer to a real Game Context Packet section/);
  });

  describe("independent prediction (WU4.5/WU4.6)", () => {
    function withPrediction(prediction: unknown) {
      const payload = extractPayload(FIXTURE_STAGE_A_BASE) as Record<string, unknown>;
      return { ...payload, prediction };
    }

    it("9. requires the model to return an independent fair spread", () => {
      const result = validateGrokStageA(withPrediction(undefined), STAGE_A_CONTEXT);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reasons.join(" ")).toMatch(/prediction is not an object/);
    });

    it("10. requires the model to return an independent projected total", () => {
      const result = validateGrokStageA(withPrediction({ fairSpread: { team: "ind", line: -1.5 } }), STAGE_A_CONTEXT);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reasons.join(" ")).toMatch(/prediction.projectedTotal must be a finite number/);
    });

    it("fair-spread team must be one of the two actual game teams", () => {
      const result = validateGrokStageA(withPrediction({ fairSpread: { team: "kc", line: -1.5 }, projectedTotal: 46.5 }), STAGE_A_CONTEXT);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reasons.join(" ")).toMatch(/must be one of the game's teams/);
    });

    it("sign convention is validated -- the favored team's line must be <= 0", () => {
      const result = validateGrokStageA(withPrediction({ fairSpread: { team: "ind", line: 1.5 }, projectedTotal: 46.5 }), STAGE_A_CONTEXT);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reasons.join(" ")).toMatch(/must be <= 0/);
    });

    describe("team-code casing normalization (WU4.6.4)", () => {
      /** Reproduces the exact live DEN_KC failure shape: internal canonical codes are lowercase ("kc"/"den"), providers naturally answer with the NFL abbreviation casing shown in the prompt ("KC"). */
      const DEN_KC_CONTEXT: GrokStageAValidationContext = { ...STAGE_A_CONTEXT, homeTeam: "kc", awayTeam: "den" };

      it("1. 'KC' is accepted and normalized to the canonical 'kc'", () => {
        const result = validateGrokStageA(withPrediction({ fairSpread: { team: "KC", line: -1.5 }, projectedTotal: 46.5 }), DEN_KC_CONTEXT);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.analysis.prediction.fairSpread.team).toBe("kc");
      });

      it("2. already-lowercase 'kc' remains 'kc'", () => {
        const result = validateGrokStageA(withPrediction({ fairSpread: { team: "kc", line: -1.5 }, projectedTotal: 46.5 }), DEN_KC_CONTEXT);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.analysis.prediction.fairSpread.team).toBe("kc");
      });

      it("3. mixed-case 'Den' is normalized to the canonical 'den'", () => {
        const result = validateGrokStageA(withPrediction({ fairSpread: { team: "Den", line: -1.5 }, projectedTotal: 46.5 }), DEN_KC_CONTEXT);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.analysis.prediction.fairSpread.team).toBe("den");
      });

      it("4. an unrelated team code is rejected, never guessed at -- casing normalization is not a semantic alias table", () => {
        const result = validateGrokStageA(withPrediction({ fairSpread: { team: "LAC", line: -1.5 }, projectedTotal: 46.5 }), DEN_KC_CONTEXT);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reasons.join(" ")).toMatch(/must be one of the game's teams/);
      });

      it("5. a normalized code that does not belong to THIS actual game still fails -- casing normalization never widens which teams are legal", () => {
        // "IND" case-folds to "ind", which is a real canonical team code elsewhere in the league, but not one of THIS game's two teams (kc/den).
        const result = validateGrokStageA(withPrediction({ fairSpread: { team: "IND", line: -1.5 }, projectedTotal: 46.5 }), DEN_KC_CONTEXT);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reasons.join(" ")).toMatch(/must be one of the game's teams/);
      });
    });
  });

  describe("matchupFactors[].area (WU4.4.1)", () => {
    function withArea(area: unknown) {
      const payload = extractPayload(FIXTURE_STAGE_A_BASE) as Record<string, unknown>;
      const factor = (payload.matchupFactors as Record<string, unknown>[])[0];
      return { ...payload, matchupFactors: [{ ...factor, area }] };
    }

    it("1. accepts every legal area enum value", () => {
      for (const area of MATCHUP_FACTOR_AREAS) {
        const result = validateGrokStageA(withArea(area), STAGE_A_CONTEXT);
        expect(result.ok).toBe(true);
        if (!result.ok) continue;
        expect(result.analysis.matchupFactors[0].area).toBe(area);
      }
    });

    it("2. rejects \"total\" -- the bet-type recommendation is a Stage B concept, not matchupFactors[].area", () => {
      const result = validateGrokStageA(withArea("total"), STAGE_A_CONTEXT);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reasons.join(" ")).toMatch(/matchupFactors\[0\]\.area "total" is invalid/);
    });

    it("4. normalizes harmless spelling/formatting aliases (space/hyphen vs. underscore) to the canonical enum value", () => {
      const spaced = validateGrokStageA(withArea("pass rush"), STAGE_A_CONTEXT);
      expect(spaced.ok).toBe(true);
      if (spaced.ok) expect(spaced.analysis.matchupFactors[0].area).toBe("pass_rush");
    });

    it("WU4.6.4: rejects the live Grok failure value \"trenches\" -- a broad structural label that cannot be mapped mechanically to exactly one legal category, so it is never guessed at", () => {
      const result = validateGrokStageA(withArea("trenches"), STAGE_A_CONTEXT);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reasons.join(" ")).toMatch(/matchupFactors\[0\]\.area "trenches" is invalid/);
    });

    it("WU4.6.4: existing safe aliases (space/hyphen run-defense variants) still work alongside the trenches rejection", () => {
      const result = validateGrokStageA(withArea("run defense"), STAGE_A_CONTEXT);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.analysis.matchupFactors[0].area).toBe("run_defense");
    });
  });
});

describe("validateGrokStageB", () => {
  it("accepts a well-formed market decision (home lean)", () => {
    const result = validateGrokStageB(extractPayload(FIXTURE_STAGE_B_HOME_LEAN), STAGE_B_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.side.lean).toBe("home");
  });

  it("rejects malformed (non-object) input", () => {
    const result = validateGrokStageB("not an object", STAGE_B_CONTEXT);
    expect(result.ok).toBe(false);
  });

  it("accepts and passes through a well-formed editorialArticle, marked isLegacyPreview: false", () => {
    const result = validateGrokStageB(extractPayload(FIXTURE_STAGE_B_HOME_LEAN), STAGE_B_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.editorialArticle.isLegacyPreview).toBe(false);
    expect(result.analysis.editorialArticle.headline.length).toBeGreaterThan(0);
    expect(result.analysis.editorialArticle.matchupKeys.length).toBeGreaterThan(0);
  });

  it("rejects editorialArticle entirely missing from the payload", () => {
    const payload = extractPayload(FIXTURE_STAGE_B_HOME_LEAN) as Record<string, unknown>;
    const missing = { ...payload };
    delete missing.editorialArticle;
    const result = validateGrokStageB(missing, STAGE_B_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.some((reason) => reason.includes("editorialArticle"))).toBe(true);
  });

  it("accepts a nullable section (e.g. gameScript: null) as a fully valid 'not enough evidence' state, never coercing it", () => {
    const payload = extractPayload(FIXTURE_STAGE_B_HOME_LEAN) as Record<string, unknown>;
    const article = { ...(payload.editorialArticle as Record<string, unknown>), gameScript: null, personnelAndAvailability: null };
    const result = validateGrokStageB({ ...payload, editorialArticle: article }, STAGE_B_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.editorialArticle.gameScript).toBeNull();
    expect(result.analysis.editorialArticle.personnelAndAvailability).toBeNull();
  });

  it("rejects an editorialArticle missing required sections (matchupKeys)", () => {
    const payload = extractPayload(FIXTURE_STAGE_B_HOME_LEAN) as Record<string, unknown>;
    const article = { ...(payload.editorialArticle as Record<string, unknown>) };
    delete article.matchupKeys;
    const result = validateGrokStageB({ ...payload, editorialArticle: article }, STAGE_B_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.some((reason) => reason.includes("matchupKeys"))).toBe(true);
  });

  it("rejects an editorialArticle whose prose exposes internal FACT:/INTERPRETATION: labels", () => {
    const payload = extractPayload(FIXTURE_STAGE_B_HOME_LEAN) as Record<string, unknown>;
    const article = { ...(payload.editorialArticle as Record<string, unknown>), headline: "FACT: this leaked from the internal schema" };
    const result = validateGrokStageB({ ...payload, editorialArticle: article }, STAGE_B_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.some((reason) => reason.includes("machine/internal language"))).toBe(true);
  });

  it("rejects an editorialArticle whose prose exposes a raw snake_case internal field name", () => {
    const payload = extractPayload(FIXTURE_STAGE_B_HOME_LEAN) as Record<string, unknown>;
    const article = { ...(payload.editorialArticle as Record<string, unknown>), openingRead: ["The def_pass_rush_win_rate favors the home team."] };
    const result = validateGrokStageB({ ...payload, editorialArticle: article }, STAGE_B_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.some((reason) => reason.includes("snake_case"))).toBe(true);
  });

  it("rejects an editorialArticle whose prose exposes a raw camelCase internal field name", () => {
    const payload = extractPayload(FIXTURE_STAGE_B_HOME_LEAN) as Record<string, unknown>;
    const article = { ...(payload.editorialArticle as Record<string, unknown>), finalWord: ["The team's offEpaPerPlay was the deciding factor."] };
    const result = validateGrokStageB({ ...payload, editorialArticle: article }, STAGE_B_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.some((reason) => reason.includes("camelCase"))).toBe(true);
  });

  it("Stage B has structurally no field for a revised fair spread/projected total -- the editorial article cannot carry one either", () => {
    const payload = extractPayload(FIXTURE_STAGE_B_HOME_LEAN) as Record<string, unknown>;
    expect(payload).not.toHaveProperty("prediction");
    expect(payload).not.toHaveProperty("fairSpread");
    expect(payload).not.toHaveProperty("projectedTotal");
    const article = payload.editorialArticle as Record<string, unknown>;
    expect(article).not.toHaveProperty("fairSpread");
    expect(article).not.toHaveProperty("projectedTotal");
  });

  // WU7.5 -- root cause of the WU7.4 CAR_ATL incident: the model was asked to echo
  // currentHomeLine/currentAwayLine/currentTotal and side.lineAtOpinion/total.totalAtOpinion back,
  // and inverted home/away in doing so. Neither is part of the raw contract anymore -- the engine
  // always attaches the authoritative currentMarketState mechanically, so a provider literally
  // cannot invert, flip, or otherwise misreport these values: whatever garbage (or nothing) it
  // sends for them is ignored, never validated, and never reaches the trusted output.
  it("WU7.5: ignores an inverted/garbage marketAssessment.currentHomeLine -- the trusted output always reflects the authoritative currentMarketState instead", () => {
    const payload = extractPayload(FIXTURE_STAGE_B_HOME_LEAN) as Record<string, unknown>;
    const bad = { ...payload, marketAssessment: { ...(payload.marketAssessment as Record<string, unknown>), currentHomeLine: -99, currentAwayLine: 99 } };
    const result = validateGrokStageB(bad, STAGE_B_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.marketAssessment.currentHomeLine).toBe(STAGE_B_CONTEXT.currentMarketState.spread.homeLine);
    expect(result.analysis.marketAssessment.currentAwayLine).toBe(STAGE_B_CONTEXT.currentMarketState.spread.awayLine);
  });

  it("WU7.5: ignores an inverted/garbage side.lineAtOpinion -- the trusted output always reflects the authoritative currentMarketState instead", () => {
    const payload = extractPayload(FIXTURE_STAGE_B_HOME_LEAN) as Record<string, unknown>;
    const bad = { ...payload, side: { ...(payload.side as Record<string, unknown>), lineAtOpinion: { homeLine: 999, awayLine: -999 } } };
    const result = validateGrokStageB(bad, STAGE_B_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.side.lineAtOpinion).toEqual({ homeLine: STAGE_B_CONTEXT.currentMarketState.spread.homeLine, awayLine: STAGE_B_CONTEXT.currentMarketState.spread.awayLine });
  });

  it("WU7.5: an entirely missing marketAssessment.currentHomeLine/side.lineAtOpinion in the raw payload is fine -- neither is part of the contract anymore", () => {
    const payload = extractPayload(FIXTURE_STAGE_B_HOME_LEAN) as Record<string, unknown>;
    const marketAssessment = { ...(payload.marketAssessment as Record<string, unknown>) };
    delete marketAssessment.currentHomeLine;
    delete marketAssessment.currentAwayLine;
    delete marketAssessment.currentTotal;
    const side = { ...(payload.side as Record<string, unknown>) };
    delete side.lineAtOpinion;
    const result = validateGrokStageB({ ...payload, marketAssessment, side }, STAGE_B_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.marketAssessment.currentHomeLine).toBe(STAGE_B_CONTEXT.currentMarketState.spread.homeLine);
    expect(result.analysis.side.lineAtOpinion).toEqual({ homeLine: STAGE_B_CONTEXT.currentMarketState.spread.homeLine, awayLine: STAGE_B_CONTEXT.currentMarketState.spread.awayLine });
  });

  it("side and total are validated/accepted independently -- a side PASS and a total OVER-shaped payload both validate on their own terms", () => {
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

  it("accepts an evidence-conflict-driven confidence cap (paired with Stage A's evidence-conflict scenario)", () => {
    const result = validateGrokStageB(extractPayload(FIXTURE_STAGE_B_CAPPED_CONFIDENCE), STAGE_B_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.side.confidence).toBeLessThanOrEqual(5);
  });

  it("15. PASS is valid despite a nonzero deterministic edge -- confidence-to-bet is never forced by the mechanical edge alone", () => {
    const result = validateGrokStageB(extractPayload(FIXTURE_STAGE_B_PASS_DESPITE_EDGE), STAGE_B_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.side.lean).toBe("pass");
    // The mechanical edge is still computed and nonzero even though the model passed.
    expect(result.analysis.marketAssessment.sideEdgePoints).not.toBe(0);
  });

  describe("locked-prediction enforcement (WU4.6, 11/12/13)", () => {
    it("11/12. ignores any 'prediction'/'fairSpread'/'projectedTotal' the raw Stage B payload tries to smuggle in -- the trusted output has no such field", () => {
      const payload = extractPayload(FIXTURE_STAGE_B_HOME_LEAN) as Record<string, unknown>;
      const smuggled = { ...payload, prediction: { fairSpread: { team: "bal", line: -9 }, projectedTotal: 12 }, fairSpread: { team: "bal", line: -9 }, projectedTotal: 12 };
      const result = validateGrokStageB(smuggled, STAGE_B_CONTEXT);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.analysis).not.toHaveProperty("prediction");
      expect(result.analysis).not.toHaveProperty("fairSpread");
      expect(result.analysis).not.toHaveProperty("projectedTotal");
    });

    it("13. side/total edge is computed mechanically from context.lockedPrediction, never from the raw payload's marketAssessment", () => {
      const payload = extractPayload(FIXTURE_STAGE_B_HOME_LEAN) as Record<string, unknown>;
      const bad = { ...payload, marketAssessment: { ...(payload.marketAssessment as Record<string, unknown>), sideEdgePoints: 999, totalEdgePoints: -999 } };
      const result = validateGrokStageB(bad, STAGE_B_CONTEXT);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const expectedSideEdge = STAGE_B_CONTEXT.currentMarketState.spread.homeLine! - -1.5; // lockedPrediction favors ind by 1.5
      expect(result.analysis.marketAssessment.sideEdgePoints).toBeCloseTo(expectedSideEdge);
      expect(result.analysis.marketAssessment.sideEdgePoints).not.toBe(999);
      expect(result.analysis.marketAssessment.totalEdgePoints).not.toBe(-999);
    });

    it("14. (WU7.5) marketAtDecision-equivalent fields (currentHomeLine/currentAwayLine/currentTotal) always reflect the authoritative currentMarketState, never an arbitrary provider value", () => {
      const payload = extractPayload(FIXTURE_STAGE_B_HOME_LEAN) as Record<string, unknown>;
      const bad = { ...payload, marketAssessment: { ...(payload.marketAssessment as Record<string, unknown>), currentTotal: 12345 } };
      const result = validateGrokStageB(bad, STAGE_B_CONTEXT);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.analysis.marketAssessment.currentTotal).toBe(STAGE_B_CONTEXT.currentMarketState.total.line);
      expect(result.analysis.marketAssessment.currentTotal).not.toBe(12345);
    });
  });
});

describe("validateGrokStageAUpdate", () => {
  it("accepts a well-formed blind re-projection", () => {
    const result = validateGrokStageAUpdate(extractPayload(FIXTURE_STAGE_A_UPDATE_REAFFIRM), STAGE_A_CONTEXT);
    expect(result.ok).toBe(true);
  });

  it("accepts an update proposal with zero developments (no material change is valid)", () => {
    const result = validateGrokStageAUpdate(extractPayload(FIXTURE_STAGE_A_UPDATE_NO_MATERIAL_CHANGE), STAGE_A_CONTEXT);
    expect(result.ok).toBe(true);
  });

  it("rejects a development with no cited evidenceIds", () => {
    const payload = extractPayload(FIXTURE_STAGE_A_UPDATE_REAFFIRM) as Record<string, unknown>;
    const bad = { ...payload, developments: [{ ...(payload.developments as Record<string, unknown>[])[0], evidenceIds: [] }] };
    const result = validateGrokStageAUpdate(bad, STAGE_A_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toMatch(/must cite at least one evidence id/);
  });

  it("rejects a cross-model evidenceId citation in an update proposal", () => {
    const payload = extractPayload(FIXTURE_STAGE_A_UPDATE_REAFFIRM) as Record<string, unknown>;
    const bad = { ...payload, evidenceIdsUsed: [FIXTURE_ANALYSIS_EVIDENCE_ID.chatgptOnly] };
    const result = validateGrokStageAUpdate(bad, STAGE_A_CONTEXT);
    expect(result.ok).toBe(false);
  });

  it("re-affirmed or revised prediction is still sign-convention-validated", () => {
    const payload = extractPayload(FIXTURE_STAGE_A_UPDATE_REAFFIRM) as Record<string, unknown>;
    const bad = { ...payload, prediction: { fairSpread: { team: "ind", line: 2 }, projectedTotal: 46 } };
    const result = validateGrokStageAUpdate(bad, STAGE_A_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toMatch(/must be <= 0/);
  });
});

describe("validateGrokStageBUpdate", () => {
  it("accepts a well-formed update market decision", () => {
    const result = validateGrokStageBUpdate(extractPayload(FIXTURE_STAGE_B_UPDATE_STRENGTHENS), STAGE_B_CONTEXT);
    expect(result.ok).toBe(true);
  });

  it("ignores any smuggled 'prediction' field on the raw payload", () => {
    const payload = extractPayload(FIXTURE_STAGE_B_UPDATE_STRENGTHENS) as Record<string, unknown>;
    const smuggled = { ...payload, prediction: { fairSpread: { team: "bal", line: -9 }, projectedTotal: 12 } };
    const result = validateGrokStageBUpdate(smuggled, STAGE_B_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposal).not.toHaveProperty("prediction");
  });

  it("computes edge mechanically from context.lockedPrediction here too", () => {
    const result = validateGrokStageBUpdate(extractPayload(FIXTURE_STAGE_B_UPDATE_STRENGTHENS), STAGE_B_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expectedSideEdge = STAGE_B_CONTEXT.currentMarketState.spread.homeLine! - -1.5;
    expect(result.proposal.marketAssessment.sideEdgePoints).toBeCloseTo(expectedSideEdge);
  });
});

/**
 * WU4.4 -- proves the SHARED validator enforces identically for model:"grok"
 * and model:"chatgpt": same acceptance behavior on a well-formed payload,
 * same rejection on a cross-model evidence citation pointed the other
 * direction, and the trusted output's `model` field always echoes back
 * whichever model the caller supplied on the validation context -- never
 * hardcoded.
 */
describe("shared validator model-parity (WU4.4)", () => {
  const grokContext = STAGE_A_CONTEXT;
  const chatgptContext = { ...STAGE_A_CONTEXT, model: "chatgpt" as const };

  it("accepts a well-formed payload identically for model:'grok' and model:'chatgpt' (with matching model field)", () => {
    const grokPayload = extractPayload(FIXTURE_STAGE_A_BASE) as Record<string, unknown>;
    const factor = (grokPayload.matchupFactors as Record<string, unknown>[])[0];
    const chatgptPayload = {
      ...grokPayload,
      model: "chatgpt",
      evidenceIdsUsed: [FIXTURE_ANALYSIS_EVIDENCE_ID.chatgptOnly],
      matchupFactors: [{ ...factor, evidenceIds: [FIXTURE_ANALYSIS_EVIDENCE_ID.chatgptOnly] }],
    };

    const grokResult = validateGrokStageA(grokPayload, grokContext);
    const chatgptResult = validateGrokStageA(chatgptPayload, chatgptContext);

    expect(grokResult.ok).toBe(true);
    expect(chatgptResult.ok).toBe(true);
    if (!grokResult.ok || !chatgptResult.ok) return;
    expect(grokResult.analysis.model).toBe("grok");
    expect(chatgptResult.analysis.model).toBe("chatgpt");
  });

  it("rejects a payload declaring model:'grok' when validated against a model:'chatgpt' context, and vice versa", () => {
    const grokPayload = extractPayload(FIXTURE_STAGE_A_BASE) as Record<string, unknown>;
    const wrongWay = validateGrokStageA(grokPayload, chatgptContext);
    expect(wrongWay.ok).toBe(false);
    if (wrongWay.ok) return;
    expect(wrongWay.reasons.join(" ")).toMatch(/model "grok" must be "chatgpt"/);
  });

  it("a chatgpt-context validation rejects citation of a grok-namespace evidenceId as cross-model", () => {
    const grokPayload = extractPayload(FIXTURE_STAGE_A_BASE) as Record<string, unknown>;
    const chatgptPayload = { ...grokPayload, model: "chatgpt", evidenceIdsUsed: [FIXTURE_ANALYSIS_EVIDENCE_ID.confirmedInjury] };
    const result = validateGrokStageA(chatgptPayload, chatgptContext);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toMatch(/belongs to model "grok", not chatgpt -- cross-model citation is forbidden/);
  });
});

describe("FIXTURE_LOCKED_STAGE_A sanity", () => {
  it("matches FIXTURE_STAGE_A_BASE's payload when independently validated", () => {
    const result = validateGrokStageA(extractPayload(FIXTURE_STAGE_A_BASE), STAGE_A_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.prediction).toEqual(FIXTURE_LOCKED_STAGE_A.prediction);
    expect(result.analysis.footballThesis).toEqual(FIXTURE_LOCKED_STAGE_A.footballThesis);
  });
});

/**
 * WU4.6.5 -- DETERMINISTIC BLIND-PREDICTION TIMESTAMPS. Proves the provider can never author a
 * trusted lifecycle timestamp: whatever (if anything) a raw payload's own `generatedAt` says,
 * the validated output's `generatedAt` always equals the caller-supplied trusted context value.
 * Exercised for both Stage A/B initial and Stage A/B update, and for both model namespaces.
 */
describe("WU4.6.5 -- provider cannot author generatedAt (trusted-timestamp provenance)", () => {
  const HALLUCINATED_FUTURE_TIMESTAMP = "2099-01-01T00:00:00.000Z";

  it("1. validateGrokStageA: accepted generatedAt equals the trusted context timestamp, not the raw payload's", () => {
    const payload = extractPayload(FIXTURE_STAGE_A_BASE) as Record<string, unknown>;
    const result = validateGrokStageA(payload, STAGE_A_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.generatedAt).toBe(TRUSTED_STAGE_A_GENERATED_AT);
  });

  it("2. validateGrokStageA: a hallucinated/future provider-supplied generatedAt is silently ignored, never adopted", () => {
    const payload = extractPayload(FIXTURE_STAGE_A_BASE) as Record<string, unknown>;
    const smuggled = { ...payload, generatedAt: HALLUCINATED_FUTURE_TIMESTAMP };
    const result = validateGrokStageA(smuggled, STAGE_A_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.generatedAt).toBe(TRUSTED_STAGE_A_GENERATED_AT);
    expect(result.analysis.generatedAt).not.toBe(HALLUCINATED_FUTURE_TIMESTAMP);
  });

  it("3. validateGrokStageB: accepted generatedAt equals the trusted context timestamp, not the raw payload's", () => {
    const payload = extractPayload(FIXTURE_STAGE_B_HOME_LEAN) as Record<string, unknown>;
    const result = validateGrokStageB(payload, STAGE_B_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.generatedAt).toBe(TRUSTED_STAGE_B_GENERATED_AT);
  });

  it("4. validateGrokStageB: a hallucinated/future provider-supplied generatedAt is silently ignored, never adopted", () => {
    const payload = extractPayload(FIXTURE_STAGE_B_HOME_LEAN) as Record<string, unknown>;
    const smuggled = { ...payload, generatedAt: HALLUCINATED_FUTURE_TIMESTAMP };
    const result = validateGrokStageB(smuggled, STAGE_B_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.generatedAt).toBe(TRUSTED_STAGE_B_GENERATED_AT);
    expect(result.analysis.generatedAt).not.toBe(HALLUCINATED_FUTURE_TIMESTAMP);
  });

  it("5. validateGrokStageAUpdate: accepted generatedAt equals the trusted context timestamp, ignoring a hallucinated one", () => {
    const payload = extractPayload(FIXTURE_STAGE_A_UPDATE_REAFFIRM) as Record<string, unknown>;
    const smuggled = { ...payload, generatedAt: HALLUCINATED_FUTURE_TIMESTAMP };
    const result = validateGrokStageAUpdate(smuggled, STAGE_A_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposal.generatedAt).toBe(TRUSTED_STAGE_A_GENERATED_AT);
    expect(result.proposal.generatedAt).not.toBe(HALLUCINATED_FUTURE_TIMESTAMP);
  });

  it("6. validateGrokStageBUpdate: accepted generatedAt equals the trusted context timestamp, ignoring a hallucinated one", () => {
    const payload = extractPayload(FIXTURE_STAGE_B_UPDATE_STRENGTHENS) as Record<string, unknown>;
    const smuggled = { ...payload, generatedAt: HALLUCINATED_FUTURE_TIMESTAMP };
    const result = validateGrokStageBUpdate(smuggled, STAGE_B_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposal.generatedAt).toBe(TRUSTED_STAGE_B_GENERATED_AT);
    expect(result.proposal.generatedAt).not.toBe(HALLUCINATED_FUTURE_TIMESTAMP);
  });

  it("7. validateGrokStageA: a raw payload with NO generatedAt field at all (matches the updated provider contract) still validates and still gets the trusted timestamp", () => {
    const payload = extractPayload(FIXTURE_STAGE_A_BASE) as Record<string, unknown>;
    const { generatedAt: _omit, ...withoutGeneratedAt } = payload;
    const result = validateGrokStageA(withoutGeneratedAt, STAGE_A_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.generatedAt).toBe(TRUSTED_STAGE_A_GENERATED_AT);
  });

  it("8. Grok and ChatGPT contexts behave identically -- same trusted generatedAt provenance regardless of model namespace", () => {
    const grokPayload = extractPayload(FIXTURE_STAGE_A_BASE) as Record<string, unknown>;
    const factor = (grokPayload.matchupFactors as Record<string, unknown>[])[0];
    const chatgptContext: GrokStageAValidationContext = { ...STAGE_A_CONTEXT, model: "chatgpt" };
    const chatgptPayload = {
      ...grokPayload,
      model: "chatgpt",
      generatedAt: HALLUCINATED_FUTURE_TIMESTAMP,
      evidenceIdsUsed: [FIXTURE_ANALYSIS_EVIDENCE_ID.chatgptOnly],
      matchupFactors: [{ ...factor, evidenceIds: [FIXTURE_ANALYSIS_EVIDENCE_ID.chatgptOnly] }],
    };

    const grokResult = validateGrokStageA({ ...grokPayload, generatedAt: HALLUCINATED_FUTURE_TIMESTAMP }, STAGE_A_CONTEXT);
    const chatgptResult = validateGrokStageA(chatgptPayload, chatgptContext);

    expect(grokResult.ok).toBe(true);
    expect(chatgptResult.ok).toBe(true);
    if (!grokResult.ok || !chatgptResult.ok) return;
    expect(grokResult.analysis.generatedAt).toBe(TRUSTED_STAGE_A_GENERATED_AT);
    expect(chatgptResult.analysis.generatedAt).toBe(TRUSTED_STAGE_A_GENERATED_AT);
  });
});
