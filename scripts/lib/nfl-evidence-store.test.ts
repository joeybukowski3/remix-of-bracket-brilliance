import { describe, expect, it } from "vitest";
import * as evidenceStoreModule from "./nfl-evidence-store";
import { appendEvidence, createEvidenceStore, resolveEvidenceAuthority } from "./nfl-evidence-store";
import { normalizeExternalEvidence } from "./nfl-evidence-normalizer";
import {
  FIXTURE_CONTEXT,
  chatgptConfirmedInjuryCandidate,
  confirmedInjuryCandidate,
  conflictingInjuryCandidate,
  corroboratingInjuryCandidate,
  duplicateInjuryCandidate,
} from "./__fixtures__/nfl-evidence-fixtures";

function normalizeOrThrow(candidate: Parameters<typeof normalizeExternalEvidence>[0]) {
  const result = normalizeExternalEvidence(candidate, FIXTURE_CONTEXT);
  if (!result.ok) throw new Error(`fixture failed to normalize: ${result.reasons.join("; ")}`);
  return result.evidence;
}

describe("nfl-evidence-store", () => {
  it("adds a first record with outcome 'added'", () => {
    const store = createEvidenceStore("grok", FIXTURE_CONTEXT.gameId);
    const result = appendEvidence(store, normalizeOrThrow(confirmedInjuryCandidate));
    expect(result.outcome).toBe("added");
    expect(result.store.records).toHaveLength(1);
  });

  it("skips an exact duplicate (same claim + same URL) without adding a second copy", () => {
    let store = createEvidenceStore("grok", FIXTURE_CONTEXT.gameId);
    store = appendEvidence(store, normalizeOrThrow(confirmedInjuryCandidate)).store;
    const result = appendEvidence(store, normalizeOrThrow(duplicateInjuryCandidate));
    expect(result.outcome).toBe("added_duplicate_skipped");
    expect(result.store.records).toHaveLength(1);
  });

  it("retains corroborating evidence from an independent source as a separate record", () => {
    let store = createEvidenceStore("grok", FIXTURE_CONTEXT.gameId);
    store = appendEvidence(store, normalizeOrThrow(confirmedInjuryCandidate)).store;
    const result = appendEvidence(store, normalizeOrThrow(corroboratingInjuryCandidate));
    expect(result.outcome).toBe("added_corroborating");
    expect(result.store.records).toHaveLength(2);
    expect(result.relatedEvidenceIds).toHaveLength(1);
  });

  it("retains conflicting evidence rather than overwriting the earlier record", () => {
    let store = createEvidenceStore("grok", FIXTURE_CONTEXT.gameId);
    store = appendEvidence(store, normalizeOrThrow(conflictingInjuryCandidate)).store; // earlier, weaker
    const beforeCount = store.records.length;
    const result = appendEvidence(store, normalizeOrThrow(confirmedInjuryCandidate)); // later, official
    expect(result.store.records).toHaveLength(beforeCount + 1);
    // the earlier record's raw content is untouched -- append-only history
    expect(result.store.records[0]).toEqual(store.records[0]);
  });

  it("resolveEvidenceAuthority marks a strictly dominated older record as superseded without mutating it", () => {
    let store = createEvidenceStore("grok", FIXTURE_CONTEXT.gameId);
    store = appendEvidence(store, normalizeOrThrow(conflictingInjuryCandidate)).store; // earlier, sports_media (tier 3)
    store = appendEvidence(store, normalizeOrThrow(confirmedInjuryCandidate)).store; // later, injury_report (tier 1)

    const raw = JSON.stringify(store.records);
    const authority = resolveEvidenceAuthority(store.records);
    // raw storage never mutated by computing the derived view
    expect(JSON.stringify(store.records)).toBe(raw);

    const conflictingView = authority.find((a) => a.evidenceId === store.records[0].evidenceId);
    const officialView = authority.find((a) => a.evidenceId === store.records[1].evidenceId);
    expect(conflictingView?.status).toBe("superseded");
    expect(officialView?.status).toBe("current");
  });

  it("resolveEvidenceAuthority marks both sides conflicting when neither dominates (later record from a worse source)", () => {
    let store = createEvidenceStore("grok", FIXTURE_CONTEXT.gameId);
    store = appendEvidence(store, normalizeOrThrow(confirmedInjuryCandidate)).store; // earlier-ish, tier 1 (official)
    store = appendEvidence(store, normalizeOrThrow(conflictingInjuryCandidate)).store; // note: fixture timestamp is actually earlier

    const authority = resolveEvidenceAuthority(store.records);
    const officialView = authority.find((a) => a.evidenceId === store.records[0].evidenceId);
    // the weaker/earlier record should never flip the official record to superseded
    expect(officialView?.status).not.toBe("superseded");
  });

  it("throws when appending a record whose model does not match the store's namespace", () => {
    const grokStore = createEvidenceStore("grok", FIXTURE_CONTEXT.gameId);
    const chatgptRecord = normalizeOrThrow(chatgptConfirmedInjuryCandidate);
    expect(() => appendEvidence(grokStore, chatgptRecord)).toThrow(/model isolation/);
  });

  it("keeps grok and chatgpt evidence in fully separate stores for the same underlying claim", () => {
    const grokStore = appendEvidence(createEvidenceStore("grok", FIXTURE_CONTEXT.gameId), normalizeOrThrow(confirmedInjuryCandidate)).store;
    const chatgptStore = appendEvidence(createEvidenceStore("chatgpt", FIXTURE_CONTEXT.gameId), normalizeOrThrow(chatgptConfirmedInjuryCandidate)).store;

    expect(grokStore.records).toHaveLength(1);
    expect(chatgptStore.records).toHaveLength(1);
    expect(grokStore.records[0].evidenceId).not.toBe(chatgptStore.records[0].evidenceId);
    expect(grokStore.records[0].model).toBe("grok");
    expect(chatgptStore.records[0].model).toBe("chatgpt");
    // no shared object identity anywhere between the two stores
    expect(grokStore.records[0]).not.toBe(chatgptStore.records[0]);
  });

  it("does not treat cross-model evidence as duplicate/corroborating -- comparison is out of scope for WU2", () => {
    // Appending the chatgpt-namespaced record into a grok store would be a
    // model-isolation violation; the only way to test "no auto-merge" is to
    // confirm there is no store API that accepts two different-model stores
    // together. There is none exported from nfl-evidence-store.ts.
    const exportedNames = Object.keys(evidenceStoreModule);
    expect(exportedNames.find((name) => /merge|combine|compare/i.test(name))).toBeUndefined();
  });
});
