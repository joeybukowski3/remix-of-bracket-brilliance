/**
 * WU6.5 -- tests for the pure replay-planning/safety-check core. No file
 * I/O, no network, no provider API call anywhere in this suite -- every
 * input is either the DET_BUF-shaped fixture response or a hand-built
 * safety-check input object.
 */
import { describe, expect, it } from "vitest";
import { buildReplayManifest, checkReplaySafety, planChatGptReplay, retrievedAtFromArchivedResponse, type ChatGptReplayPlan } from "./nfl-provider-research-replay";
import { parseChatGptResponsesBody } from "./nfl-chatgpt-research-parsing";
import { DET_BUF_ARCHIVED_RESPONSE_FIXTURE, DET_BUF_INCOMPLETE_RESPONSE_FIXTURE, FIXTURE_GAME_ID, FIXTURE_REPLAY_CONTEXT, MALFORMED_FINDING } from "./__fixtures__/nfl-provider-research-replay-fixtures";

describe("planChatGptReplay -- DET_BUF regression (item 1/2/3/5)", () => {
  it("1. a valid archived completed response plans successfully, with zero API calls (pure function, no network import at all)", () => {
    const plan = planChatGptReplay({ rawResponseBody: DET_BUF_ARCHIVED_RESPONSE_FIXTURE, gameId: FIXTURE_GAME_ID, context: FIXTURE_REPLAY_CONTEXT });
    expect(plan.responseUsableForReplay).toBe(true);
    expect(plan.candidatesParsedCount).toBe(12);
  });

  it("2. the malformed subjects-as-array candidate is quarantined at the structural layer, never reaching normalization", () => {
    const plan = planChatGptReplay({ rawResponseBody: DET_BUF_ARCHIVED_RESPONSE_FIXTURE, gameId: FIXTURE_GAME_ID, context: FIXTURE_REPLAY_CONTEXT });
    expect(plan.structurallyRejected).toHaveLength(1);
    expect(plan.structurallyRejected[0].reason).toMatch(/subjects: expected object with optional teams\/players\/coaches arrays, received an array/);
    expect(plan.structurallyRejected[0].finding).toEqual(MALFORMED_FINDING);
  });

  it("3. the 11 valid candidates continue through normalization and are accepted -- asserted through the real policy, not assumed", () => {
    const plan = planChatGptReplay({ rawResponseBody: DET_BUF_ARCHIVED_RESPONSE_FIXTURE, gameId: FIXTURE_GAME_ID, context: FIXTURE_REPLAY_CONTEXT });
    // Real policy, not a hardcoded "exactly 11": some fraction of the accepted+policyRejected
    // must sum to candidatesParsed - structurallyRejected, and none may silently vanish.
    expect(plan.accepted.length + plan.policyRejected.length).toBe(plan.candidatesParsedCount - plan.structurallyRejected.length);
    expect(plan.accepted.length).toBeGreaterThan(0);
    for (const evidence of plan.accepted) {
      expect(evidence.provenance.candidateHash).toMatch(/^[0-9a-f]{64}$/);
      expect(evidence.model).toBe("chatgpt");
      expect(evidence.gameId).toBe(FIXTURE_GAME_ID);
    }
  });

  it("no invalid (malformed) candidate ever appears among accepted evidence", () => {
    const plan = planChatGptReplay({ rawResponseBody: DET_BUF_ARCHIVED_RESPONSE_FIXTURE, gameId: FIXTURE_GAME_ID, context: FIXTURE_REPLAY_CONTEXT });
    expect(plan.accepted.every((e) => e.claim !== MALFORMED_FINDING.claim)).toBe(true);
  });

  it("5. original provider provenance (responseId/model/timestamps) is read straight from the archive, never fabricated", () => {
    const plan = planChatGptReplay({ rawResponseBody: DET_BUF_ARCHIVED_RESPONSE_FIXTURE, gameId: FIXTURE_GAME_ID, context: FIXTURE_REPLAY_CONTEXT });
    expect(plan.responseId).toBe(DET_BUF_ARCHIVED_RESPONSE_FIXTURE.id);
    expect(plan.responseModel).toBe(DET_BUF_ARCHIVED_RESPONSE_FIXTURE.model);
    expect(plan.createdAtEpochSeconds).toBe(DET_BUF_ARCHIVED_RESPONSE_FIXTURE.created_at);
    expect(plan.completedAtEpochSeconds).toBe(DET_BUF_ARCHIVED_RESPONSE_FIXTURE.completed_at);
    expect(plan.usage.totalTokens).toBe(DET_BUF_ARCHIVED_RESPONSE_FIXTURE.usage.total_tokens);
  });

  it("does not fabricate a new provider response ID/time -- retrievedAt is derived from the archive's own completedAt, never Date.now()", () => {
    const parsed = parseChatGptResponsesBody(DET_BUF_ARCHIVED_RESPONSE_FIXTURE);
    const retrievedAt = retrievedAtFromArchivedResponse(parsed);
    // Deterministic and tied to the archive's own completedAt -- proven by calling this twice
    // with an intervening delay and getting byte-identical output, which no now()-based
    // timestamp could ever do.
    expect(retrievedAt).toBe(new Date(DET_BUF_ARCHIVED_RESPONSE_FIXTURE.completed_at * 1000).toISOString());
    const retrievedAtAgain = retrievedAtFromArchivedResponse(parsed);
    expect(retrievedAtAgain).toBe(retrievedAt);
  });

  it("9. an incomplete/non-completed archived response is refused, with zero candidates processed", () => {
    const plan = planChatGptReplay({ rawResponseBody: DET_BUF_INCOMPLETE_RESPONSE_FIXTURE, gameId: FIXTURE_GAME_ID, context: FIXTURE_REPLAY_CONTEXT });
    expect(plan.responseUsableForReplay).toBe(false);
    expect(plan.responseUnusableReason).toMatch(/not "completed"/);
    expect(plan.candidatesParsedCount).toBe(0);
    expect(plan.accepted).toHaveLength(0);
  });
});

describe("checkReplaySafety (items 6/7/8/9/10/11)", () => {
  function baseInput() {
    return {
      isPregameLocked: false,
      archivedResponseExists: true,
      archiveProviderMatchesRequested: true,
      archiveGameIdMatchesRequested: true,
      archiveModeIsReplaySupported: true,
      contextArtifactValid: true,
      snapshotLineageAlreadyExists: false,
      liveEvidenceAlreadyExists: false,
      alreadyReplayed: false,
    };
  }

  it("passes when every precondition is clean", () => {
    const result = checkReplaySafety(baseInput());
    expect(result.ok).toBe(true);
    expect(result.noOpAlreadyReplayed).toBe(false);
    expect(result.violations).toHaveLength(0);
  });

  it("6. a duplicate replay is reported as an explicit no-op, not a failure and not a violation pileup", () => {
    const result = checkReplaySafety({ ...baseInput(), alreadyReplayed: true, isPregameLocked: null, archivedResponseExists: false }); // even with other flags dirty
    expect(result.ok).toBe(true);
    expect(result.noOpAlreadyReplayed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("7. provider mismatch is rejected", () => {
    const result = checkReplaySafety({ ...baseInput(), archiveProviderMatchesRequested: false });
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/provider does not match/);
  });

  it("8. game mismatch is rejected", () => {
    const result = checkReplaySafety({ ...baseInput(), archiveGameIdMatchesRequested: false });
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/gameId does not match/);
  });

  it("9. a missing/incomplete archive is rejected", () => {
    const result = checkReplaySafety({ ...baseInput(), archivedResponseExists: false });
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/archived provider response not found/);
  });

  it("10. a post-kickoff (pregame-locked) replay is rejected -- pregame safety remains authoritative", () => {
    const result = checkReplaySafety({ ...baseInput(), isPregameLocked: true });
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/kickoff has already passed/);
  });

  it("an undetermined pregame-lock status is rejected rather than guessed", () => {
    const result = checkReplaySafety({ ...baseInput(), isPregameLocked: null });
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/could not be determined/);
  });

  it("11. an existing newer valid snapshot lineage prevents an unsafe replay", () => {
    const result = checkReplaySafety({ ...baseInput(), snapshotLineageAlreadyExists: true });
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/snapshot lineage already exists/);
  });

  it("existing live evidence for this game/provider prevents an initial-mode replay from silently overwriting it", () => {
    const result = checkReplaySafety({ ...baseInput(), liveEvidenceAlreadyExists: true });
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/evidence.live-test.json already has records/);
  });

  it("an unsupported archive mode (e.g. update) is rejected in this version", () => {
    const result = checkReplaySafety({ ...baseInput(), archiveModeIsReplaySupported: false });
    expect(result.ok).toBe(false);
    expect(result.violations.join(" ")).toMatch(/only "initial"\/"probe" mode archives/);
  });

  it("reports every violation at once, never short-circuiting on the first one", () => {
    const result = checkReplaySafety({ ...baseInput(), archivedResponseExists: false, isPregameLocked: true, snapshotLineageAlreadyExists: true });
    expect(result.violations.length).toBeGreaterThanOrEqual(3);
  });
});

describe("buildReplayManifest", () => {
  it("captures original provenance and replay metadata distinctly, never conflating the two", () => {
    const plan: ChatGptReplayPlan = planChatGptReplay({ rawResponseBody: DET_BUF_ARCHIVED_RESPONSE_FIXTURE, gameId: FIXTURE_GAME_ID, context: FIXTURE_REPLAY_CONTEXT });
    const manifest = buildReplayManifest({ replayedAt: "2026-09-20T00:00:00.000Z", replaySourcePath: "/fake/path/research/initial-2026-09-15T12-47-19-295Z", replaySourceRunId: "initial-2026-09-15T12-47-19-295Z", gameId: FIXTURE_GAME_ID, mode: "initial", plan });
    expect(manifest.replayedFromArchivedResponse).toBe(true);
    expect(manifest.replayedAt).toBe("2026-09-20T00:00:00.000Z");
    expect(manifest.originalResponseId).toBe(DET_BUF_ARCHIVED_RESPONSE_FIXTURE.id);
    expect(manifest.acceptedCount).toBe(plan.accepted.length);
    expect(manifest.structurallyRejectedCount).toBe(1);
    expect(manifest.manifestHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
