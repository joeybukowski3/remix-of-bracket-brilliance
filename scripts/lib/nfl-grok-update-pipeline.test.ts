import { describe, expect, it } from "vitest";
import { runGrokUpdatePipeline } from "./nfl-grok-update-pipeline";
import { normalizeExternalEvidence } from "./nfl-evidence-normalizer";
import { FIXTURE_CONTEXT, confirmedInjuryCandidate, conflictingInjuryCandidate, factualClaimWithNonverbatimQuoteCandidate, questionablePlayerCandidate } from "./__fixtures__/nfl-evidence-fixtures";
import { SNAPSHOT_A_INITIAL } from "./__fixtures__/nfl-snapshot-fixtures";
import type { RawEvidenceCandidate } from "./nfl-evidence-types";
import type { SnapshotMarketState } from "./nfl-snapshot-types";

function normalizeOrThrow(candidate: RawEvidenceCandidate) {
  const result = normalizeExternalEvidence(candidate, FIXTURE_CONTEXT);
  if (!result.ok) throw new Error(`fixture failed to normalize: ${result.reasons.join("; ")}`);
  return result.evidence;
}

const EXISTING_RECORD = normalizeOrThrow(confirmedInjuryCandidate);

// The previous snapshot's own evidence-id set must include EXISTING_RECORD's real (content-hashed)
// id -- otherwise computeEvidenceDelta would (correctly) treat it as newly added on every run,
// which is not what these fixtures intend to model ("this record already existed as of the
// previous snapshot").
const PREVIOUS_SNAPSHOT = { ...SNAPSHOT_A_INITIAL, evidence: { ...SNAPSHOT_A_INITIAL.evidence, evidenceIds: [EXISTING_RECORD.evidenceId] } };

const CURRENT_MARKET: SnapshotMarketState = { sportsbook: "draftkings", spread: { homeLine: 3, awayLine: -3 }, total: { line: 44.5 }, moneyline: null, asOf: "2026-09-10T10:00:00.000Z" };

function baseInput(overrides: Partial<Parameters<typeof runGrokUpdatePipeline>[0]> = {}) {
  return {
    model: "grok" as const,
    previousSnapshot: PREVIOUS_SNAPSHOT,
    existingRecords: [EXISTING_RECORD],
    newCandidates: [],
    normalizationContext: FIXTURE_CONTEXT,
    currentMarketState: CURRENT_MARKET,
    newResearchCutoff: "2026-09-10T11:00:00.000Z",
    newContextHash: "fixturecontexthashv2",
    newContextVersion: "nfl-game-context-v1-fixture",
    newContextGeneratedAt: "2026-09-10T10:30:00.000Z", // strictly after PREVIOUS_SNAPSHOT.context.contextGeneratedAt
    snapshotType: "daily_update" as const,
    now: () => new Date("2026-09-10T12:00:00.000Z"),
    ...overrides,
  };
}

describe("runGrokUpdatePipeline", () => {
  it("8/9. appends a genuinely new candidate and reports its append outcome", () => {
    const result = runGrokUpdatePipeline(baseInput({ newCandidates: [questionablePlayerCandidate] }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.appendedOutcomes).toHaveLength(1);
    expect(result.appendedOutcomes[0].outcome).toBe("added");
    expect(result.allRecords).toHaveLength(2);
  });

  it("9. skips a duplicate candidate (same claim + same URL as an existing record) rather than re-appending it", () => {
    const result = runGrokUpdatePipeline(baseInput({ newCandidates: [confirmedInjuryCandidate] })); // identical to EXISTING_RECORD's source candidate
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.appendedOutcomes[0].outcome).toBe("added_duplicate_skipped");
    expect(result.allRecords).toHaveLength(1); // no growth
  });

  it("7. an empty newCandidates array is a valid, successful run -- no evidence appended, snapshot still created", () => {
    const result = runGrokUpdatePipeline(baseInput({ newCandidates: [] }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.appendedOutcomes).toHaveLength(0);
    expect(result.snapshot.evidence.addedEvidenceIds).toEqual([]);
  });

  it("10. preserves a superseding relationship rather than dropping the earlier record", () => {
    const result = runGrokUpdatePipeline(baseInput({ newCandidates: [conflictingInjuryCandidate] })); // earlier/weaker, dominated by EXISTING_RECORD
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.allRecords).toHaveLength(2);
    expect(result.snapshot.evidence.supersededEvidenceIds.length).toBeGreaterThan(0);
  });

  it("11. preserves conflicting evidence in the evidence delta rather than resolving/dropping it", () => {
    // Build a genuine conflict: two independent, non-dominating sources on the same status-bearing subject.
    const first = normalizeOrThrow(confirmedInjuryCandidate);
    const second: RawEvidenceCandidate = {
      ...confirmedInjuryCandidate,
      claim: "A same-tier independent report says [Fixture Player A] is expected to play through the ankle issue.",
      source: { ...confirmedInjuryCandidate.source, name: "Fixture Independent Beat Two", url: "https://example-fixture.test/independent/beat-two", sourceType: "beat_reporter" },
    };
    const result = runGrokUpdatePipeline(baseInput({ existingRecords: [first], newCandidates: [second] }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.snapshot.evidence.conflictingEvidenceIds.length).toBeGreaterThan(0);
  });

  it("(WU3.3.1) a factual candidate with a nonverbatim optional quote is appended exactly once with the quote stripped, not lost", () => {
    const result = runGrokUpdatePipeline(baseInput({ newCandidates: [factualClaimWithNonverbatimQuoteCandidate] }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    const matching = result.allRecords.filter((r) => r.claim === factualClaimWithNonverbatimQuoteCandidate.claim.trim());
    expect(matching).toHaveLength(1);
    expect(matching[0].quote).toBeNull();
    expect(matching[0].quoteSanitization).toBe("removed_nonverbatim");
    expect(result.appendedOutcomes).toHaveLength(1);
    expect(result.normalizeRejections).toHaveLength(0);
  });

  it("14. computes the market delta mechanically from the previous snapshot's market state vs. currentMarketState", () => {
    const result = runGrokUpdatePipeline(baseInput());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.snapshot.market.spreadDelta).toBe(-0.5); // SNAPSHOT_A_INITIAL has 3.5, CURRENT_MARKET has 3
    expect(result.snapshot.market.previousSpread).toEqual({ homeLine: 3.5, awayLine: -3.5 });
  });

  it("15. computes the evidence delta mechanically -- new/unchanged/superseded/conflicting derived from IDs, never LLM-judged", () => {
    const result = runGrokUpdatePipeline(baseInput({ newCandidates: [questionablePlayerCandidate] }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.snapshot.evidence.addedEvidenceIds).toContain(result.appendedOutcomes[0].record.evidenceId);
    expect(result.snapshot.evidence.evidenceIds).toContain(EXISTING_RECORD.evidenceId);
  });

  it("16. links the new snapshot to the previous one via previousSnapshotId", () => {
    const result = runGrokUpdatePipeline(baseInput());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.snapshot.previousSnapshotId).toBe(PREVIOUS_SNAPSHOT.snapshotId);
  });

  it("17. never mutates the previous snapshot object it was given", () => {
    const before = JSON.stringify(PREVIOUS_SNAPSHOT);
    runGrokUpdatePipeline(baseInput({ newCandidates: [questionablePlayerCandidate] }));
    expect(JSON.stringify(PREVIOUS_SNAPSHOT)).toBe(before);
  });

  it("18. a research-only run (no analysis pass) produces a snapshot with analysisState/updateAssessment carried forward / left null as appropriate", () => {
    const researchOnlyPrevious = { ...SNAPSHOT_A_INITIAL, analysisState: null };
    const result = runGrokUpdatePipeline(baseInput({ previousSnapshot: researchOnlyPrevious }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.snapshot.analysisState).toBeNull();
    expect(result.snapshot.updateAssessment).toBeNull();
  });

  it("preserves a non-null analysisState from the previous snapshot verbatim (no opinion re-asked in WU3.3)", () => {
    const withAnalysis = { ...SNAPSHOT_A_INITIAL, analysisState: { thesis: "fixture thesis", side: { lean: "home" as const, confidence: 6, spreadLineAtOpinion: { homeLine: 3.5, awayLine: -3.5 } }, total: { lean: "under" as const, confidence: 5, totalLineAtOpinion: 44.5 } } };
    const result = runGrokUpdatePipeline(baseInput({ previousSnapshot: withAnalysis }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.snapshot.analysisState).toEqual(withAnalysis.analysisState);
    expect(result.snapshot.updateAssessment).toBeNull();
  });

  it("19. rejects a candidate from the wrong model namespace rather than silently writing it into this model's stream", () => {
    const wrongModelCandidate: RawEvidenceCandidate = { ...questionablePlayerCandidate, model: "chatgpt" };
    const result = runGrokUpdatePipeline(baseInput({ newCandidates: [wrongModelCandidate] }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure result");
    expect(result.error).toMatch(/Model isolation violation/);
  });

  it("19b. rejects a previousSnapshot from the wrong model namespace", () => {
    const chatgptSnapshot = { ...SNAPSHOT_A_INITIAL, model: "chatgpt" as const };
    const result = runGrokUpdatePipeline(baseInput({ previousSnapshot: chatgptSnapshot }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure result");
    expect(result.error).toMatch(/Model isolation violation/);
  });

  // WU4.3 -- this pipeline is provider-neutral (parameterized by `model: EvidenceModel`, see its
  // header comment); ChatGPT's update mode reuses it unchanged rather than a ChatGPT-specific copy.
  // These tests exercise the SAME model-isolation guards from the "chatgpt" side to prove ChatGPT's
  // update pipeline can never read/write into the "grok" namespace, per the WU4.3 work order's
  // explicit "ChatGPT update mode must never read data/nfl/analysis/.../grok/" requirement.
  describe("WU4.3 -- ChatGPT reusing this same provider-neutral pipeline", () => {
    const CHATGPT_EXISTING_RECORD = normalizeOrThrow({ ...confirmedInjuryCandidate, model: "chatgpt" });
    const CHATGPT_PREVIOUS_SNAPSHOT = { ...SNAPSHOT_A_INITIAL, model: "chatgpt" as const, evidence: { ...SNAPSHOT_A_INITIAL.evidence, evidenceIds: [CHATGPT_EXISTING_RECORD.evidenceId] } };

    function chatgptBaseInput(overrides: Partial<Parameters<typeof runGrokUpdatePipeline>[0]> = {}) {
      return baseInput({
        model: "chatgpt" as const,
        previousSnapshot: CHATGPT_PREVIOUS_SNAPSHOT,
        existingRecords: [CHATGPT_EXISTING_RECORD],
        ...overrides,
      });
    }

    it("18. runs an ordinary update pass entirely within the 'chatgpt' namespace", () => {
      const chatgptCandidate: RawEvidenceCandidate = { ...questionablePlayerCandidate, model: "chatgpt" };
      const result = runGrokUpdatePipeline(chatgptBaseInput({ newCandidates: [chatgptCandidate] }));
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected ok result");
      expect(result.snapshot.model).toBe("chatgpt");
      expect(result.allRecords.every((r) => r.model === "chatgpt")).toBe(true);
    });

    it("18b. rejects a 'grok' candidate from contaminating a 'chatgpt' update pipeline run", () => {
      const grokCandidate: RawEvidenceCandidate = { ...questionablePlayerCandidate, model: "grok" };
      const result = runGrokUpdatePipeline(chatgptBaseInput({ newCandidates: [grokCandidate] }));
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure result");
      expect(result.error).toMatch(/Model isolation violation/);
    });

    it("18c. rejects a 'grok' previousSnapshot from being read as this 'chatgpt' pipeline's history", () => {
      const grokSnapshot = { ...SNAPSHOT_A_INITIAL, model: "grok" as const };
      const result = runGrokUpdatePipeline(chatgptBaseInput({ previousSnapshot: grokSnapshot }));
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure result");
      expect(result.error).toMatch(/Model isolation violation/);
    });

    it("18d. rejects a 'grok' existingRecords entry from being folded into this 'chatgpt' pipeline's evidence stream", () => {
      const grokRecord = normalizeOrThrow(confirmedInjuryCandidate); // model: "grok"
      const result = runGrokUpdatePipeline(chatgptBaseInput({ existingRecords: [CHATGPT_EXISTING_RECORD, grokRecord] }));
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure result");
      expect(result.error).toMatch(/Model isolation violation/);
    });
  });

  it("22. rejects creation once the pregame stream is locked (post-kickoff)", () => {
    const result = runGrokUpdatePipeline(baseInput({ now: () => new Date("2026-09-13T18:00:00.000Z") })); // after SNAPSHOT_A_INITIAL.kickoff
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure result");
    expect(result.error).toMatch(/locked/);
  });

  it("rejects a newResearchCutoff after kickoff", () => {
    const result = runGrokUpdatePipeline(baseInput({ newResearchCutoff: "2026-09-13T18:00:00.000Z" }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure result");
    expect(result.error).toMatch(/after kickoff/);
  });

  it("rejects a newResearchCutoff earlier than the previous snapshot's own cutoff", () => {
    const result = runGrokUpdatePipeline(baseInput({ newResearchCutoff: "2026-09-08T00:00:00.000Z" })); // before SNAPSHOT_A_INITIAL.researchCutoff
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure result");
    expect(result.error).toMatch(/must not be before/);
  });

  it("23. replaying the exact same candidates against the exact same existing records is idempotent -- no duplicate evidence, identical snapshot", () => {
    const input = baseInput({ newCandidates: [questionablePlayerCandidate] });
    const first = runGrokUpdatePipeline(input);
    const second = runGrokUpdatePipeline(input);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error("expected both to succeed");
    expect(first.snapshot.snapshotId).toBe(second.snapshot.snapshotId);
    expect(first.allRecords.length).toBe(second.allRecords.length);
  });

  it("7. preserves previous+current context version/hash/generatedAt on the new snapshot", () => {
    const result = runGrokUpdatePipeline(baseInput());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.snapshot.context.contextVersion).toBe("nfl-game-context-v1-fixture");
    expect(result.snapshot.context.contextHash).toBe("fixturecontexthashv2");
    expect(result.snapshot.context.contextGeneratedAt).toBe("2026-09-10T10:30:00.000Z");
    // the PREVIOUS snapshot's own context record is untouched -- still queryable independently.
    expect(PREVIOUS_SNAPSHOT.context.contextGeneratedAt).toBe("2026-09-09T10:30:00.000Z");
  });

  it("8. a market state identical to the previous snapshot's produces a true zero delta (values being unchanged is valid, not an error)", () => {
    const unchangedMarket: SnapshotMarketState = { ...PREVIOUS_SNAPSHOT.market };
    const result = runGrokUpdatePipeline(baseInput({ currentMarketState: unchangedMarket }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.snapshot.market.spreadDelta).toBe(0);
    expect(result.snapshot.market.totalDelta).toBe(0);
  });

  it("9. a stale/reused context (newContextGeneratedAt not strictly newer than the previous snapshot's) is detected and rejected", () => {
    const result = runGrokUpdatePipeline(baseInput({ newContextGeneratedAt: PREVIOUS_SNAPSHOT.context.contextGeneratedAt! }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure result");
    expect(result.error).toMatch(/Stale context guard tripped/);
  });

  it("9b. a context generatedAt strictly BEFORE the previous snapshot's is also detected as stale", () => {
    const result = runGrokUpdatePipeline(baseInput({ newContextGeneratedAt: "2026-09-01T00:00:00.000Z" }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure result");
    expect(result.error).toMatch(/Stale context guard tripped/);
  });

  it("10. a genuinely moved market produces a deterministic nonzero delta", () => {
    const movedMarket: SnapshotMarketState = { ...CURRENT_MARKET, spread: { homeLine: 1, awayLine: -1 }, total: { line: 41 } };
    const result = runGrokUpdatePipeline(baseInput({ currentMarketState: movedMarket }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.snapshot.market.spreadDelta).toBe(1 - PREVIOUS_SNAPSHOT.market.spread.homeLine!);
    expect(result.snapshot.market.totalDelta).toBe(41 - PREVIOUS_SNAPSHOT.market.total.line!);
  });

  it("11. Grok's candidates can never mutate the deterministic currentMarketState/context it was handed", () => {
    const marketBefore = JSON.stringify(CURRENT_MARKET);
    runGrokUpdatePipeline(baseInput({ newCandidates: [questionablePlayerCandidate] }));
    expect(JSON.stringify(CURRENT_MARKET)).toBe(marketBefore);
  });

  it("24. never mutates the deterministic normalization context or current market state it was given", () => {
    const contextBefore = JSON.stringify({ ...FIXTURE_CONTEXT, knownTeamAbbrs: [...FIXTURE_CONTEXT.knownTeamAbbrs] });
    const marketBefore = JSON.stringify(CURRENT_MARKET);
    runGrokUpdatePipeline(baseInput({ newCandidates: [questionablePlayerCandidate] }));
    expect(JSON.stringify({ ...FIXTURE_CONTEXT, knownTeamAbbrs: [...FIXTURE_CONTEXT.knownTeamAbbrs] })).toBe(contextBefore);
    expect(JSON.stringify(CURRENT_MARKET)).toBe(marketBefore);
  });
});
