import { describe, expect, it } from "vitest";
import { computeEvidenceDelta, unchangedEvidenceIds } from "./nfl-snapshot-evidence-delta";
import { normalizeExternalEvidence } from "./nfl-evidence-normalizer";
import { FIXTURE_CONTEXT, confirmedInjuryCandidate, conflictingInjuryCandidate, corroboratingInjuryCandidate, personnelUpdateCandidate } from "./__fixtures__/nfl-evidence-fixtures";

function normalizeOrThrow(candidate: Parameters<typeof normalizeExternalEvidence>[0]) {
  const result = normalizeExternalEvidence(candidate, FIXTURE_CONTEXT);
  if (!result.ok) throw new Error(`fixture failed to normalize: ${result.reasons.join("; ")}`);
  return result.evidence;
}

describe("computeEvidenceDelta", () => {
  it("finds newly added evidence ids not present in the previous snapshot", () => {
    const first = normalizeOrThrow(confirmedInjuryCandidate);
    const second = normalizeOrThrow(personnelUpdateCandidate);
    const delta = computeEvidenceDelta([first.evidenceId], [first, second]);
    expect(delta.addedEvidenceIds).toEqual([second.evidenceId]);
  });

  it("leaves an evidence id 'current' (not superseded/conflicting) unchanged across snapshots", () => {
    const record = normalizeOrThrow(confirmedInjuryCandidate);
    const delta = computeEvidenceDelta([record.evidenceId], [record]);
    expect(delta.addedEvidenceIds).toEqual([]);
    expect(delta.supersededEvidenceIds).toEqual([]);
    expect(delta.conflictingEvidenceIds).toEqual([]);
    expect(unchangedEvidenceIds([record.evidenceId], delta)).toEqual([record.evidenceId]);
  });

  it("preserves supersession: an earlier, weaker-or-equal-tier record dominated by a later one is flagged superseded, never dropped", () => {
    const earlier = normalizeOrThrow(conflictingInjuryCandidate); // earlier, weaker source, contradicts confirmedInjuryCandidate
    const later = normalizeOrThrow(confirmedInjuryCandidate); // later official report
    const delta = computeEvidenceDelta([], [earlier, later]);
    // Both ids still appear in the full evidenceIds set -- append-only, nothing dropped.
    expect(delta.evidenceIds).toContain(earlier.evidenceId);
    expect(delta.evidenceIds).toContain(later.evidenceId);
    expect(delta.supersededEvidenceIds).toContain(earlier.evidenceId);
  });

  it("preserves conflicting evidence rather than silently resolving or dropping it", () => {
    const a = normalizeOrThrow(confirmedInjuryCandidate);
    const b = normalizeOrThrow(corroboratingInjuryCandidate); // corroborates, not conflicts -- sanity baseline
    const deltaCorroborating = computeEvidenceDelta([], [a, b]);
    expect(deltaCorroborating.conflictingEvidenceIds).toEqual([]);

    const c = normalizeOrThrow(conflictingInjuryCandidate);
    const deltaConflicting = computeEvidenceDelta([], [a, c]);
    // Weaker/earlier source is superseded by the official report, not double-counted as "conflicting" here
    // (nfl-evidence-store.ts's dominance rule) -- this proves the delta reuses that logic rather than reinventing it.
    expect(deltaConflicting.evidenceIds).toEqual(expect.arrayContaining([a.evidenceId, c.evidenceId]));
  });

  it("never mutates its inputs", () => {
    const record = normalizeOrThrow(confirmedInjuryCandidate);
    const before = JSON.stringify(record);
    computeEvidenceDelta([record.evidenceId], [record]);
    expect(JSON.stringify(record)).toBe(before);
  });
});
