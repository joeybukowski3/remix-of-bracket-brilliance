import { describe, expect, it } from "vitest";
import { normalizeExternalEvidence } from "./nfl-evidence-normalizer";
import {
  FIXTURE_CONTEXT,
  FIXTURE_CONTEXT_WITH_SUBJECT_IDENTITY,
  chatgptValidIndPlayerSubjectCandidate,
  confirmedInjuryCandidate,
  unknownPlayerSubjectCandidate,
  validBalPlayerSubjectCandidate,
  validCoachSubjectCandidate,
  validIndPlayerSubjectCandidate,
  wrongTeamCoachSubjectCandidate,
  wrongTeamPlayerSubjectCandidate,
} from "./__fixtures__/nfl-evidence-fixtures";

describe("normalizeExternalEvidence subject identity validation (WU2.1)", () => {
  it("1. confirms a valid BAL player against the roster source", () => {
    const result = normalizeExternalEvidence(validBalPlayerSubjectCandidate, FIXTURE_CONTEXT_WITH_SUBJECT_IDENTITY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.evidence.subjectValidation.players).toHaveLength(1);
    expect(result.evidence.subjectValidation.players[0].status).toBe("confirmed");
    expect(result.evidence.subjectValidation.players[0].team).toBe("bal");
    expect(result.evidence.subjectValidation.players[0].canonicalPlayerId).toBe("00-fixture-003");
  });

  it("2. confirms a valid IND player against the roster source", () => {
    const result = normalizeExternalEvidence(validIndPlayerSubjectCandidate, FIXTURE_CONTEXT_WITH_SUBJECT_IDENTITY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.evidence.subjectValidation.players[0].status).toBe("confirmed");
    expect(result.evidence.subjectValidation.players[0].team).toBe("ind");
  });

  it("3. hard-rejects a player conclusively rostered on an unrelated third team", () => {
    const result = normalizeExternalEvidence(wrongTeamPlayerSubjectCandidate, FIXTURE_CONTEXT_WITH_SUBJECT_IDENTITY);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toMatch(/wrong-team player association/);
  });

  it("4. treats an unknown player name as unresolved, not fabricated confirmation or rejection", () => {
    const result = normalizeExternalEvidence(unknownPlayerSubjectCandidate, FIXTURE_CONTEXT_WITH_SUBJECT_IDENTITY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.evidence.subjectValidation.players[0].status).toBe("unresolved");
    expect(result.evidence.subjectValidation.players[0].reason).toBe("not_found_in_roster_source");
  });

  it("5. degrades to unresolved (never confirmed) when no roster source is available", () => {
    const result = normalizeExternalEvidence(validIndPlayerSubjectCandidate, FIXTURE_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.evidence.subjectValidation.players[0].status).toBe("unresolved");
    expect(result.evidence.subjectValidation.players[0].reason).toBe("roster_source_unavailable");
  });

  it("6. confirms a valid coach against the coach source", () => {
    const result = normalizeExternalEvidence(validCoachSubjectCandidate, FIXTURE_CONTEXT_WITH_SUBJECT_IDENTITY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.evidence.subjectValidation.coaches[0].status).toBe("confirmed");
    expect(result.evidence.subjectValidation.coaches[0].team).toBe("ind");
  });

  it("7. hard-rejects a coach conclusively associated with an unrelated third team", () => {
    const result = normalizeExternalEvidence(wrongTeamCoachSubjectCandidate, FIXTURE_CONTEXT_WITH_SUBJECT_IDENTITY);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toMatch(/wrong-team coach association/);
  });

  it("8. resolves identity independently per model namespace (grok/chatgpt isolation intact)", () => {
    const grok = normalizeExternalEvidence(validIndPlayerSubjectCandidate, FIXTURE_CONTEXT_WITH_SUBJECT_IDENTITY);
    const chatgpt = normalizeExternalEvidence(chatgptValidIndPlayerSubjectCandidate, FIXTURE_CONTEXT_WITH_SUBJECT_IDENTITY);
    expect(grok.ok && chatgpt.ok).toBe(true);
    if (!grok.ok || !chatgpt.ok) return;
    expect(grok.evidence.model).toBe("grok");
    expect(chatgpt.evidence.model).toBe("chatgpt");
    expect(grok.evidence.subjectValidation.players[0].status).toBe("confirmed");
    expect(chatgpt.evidence.subjectValidation.players[0].status).toBe("confirmed");
    expect(grok.evidence.evidenceId).not.toBe(chatgpt.evidence.evidenceId);
  });

  it("9. never mutates the subjectIdentity source or the candidate's subjects", () => {
    const beforeContext = JSON.stringify({
      ...FIXTURE_CONTEXT_WITH_SUBJECT_IDENTITY,
      knownTeamAbbrs: [...FIXTURE_CONTEXT_WITH_SUBJECT_IDENTITY.knownTeamAbbrs],
    });
    const beforeCandidate = JSON.stringify(validIndPlayerSubjectCandidate);
    normalizeExternalEvidence(validIndPlayerSubjectCandidate, FIXTURE_CONTEXT_WITH_SUBJECT_IDENTITY);
    const afterContext = JSON.stringify({
      ...FIXTURE_CONTEXT_WITH_SUBJECT_IDENTITY,
      knownTeamAbbrs: [...FIXTURE_CONTEXT_WITH_SUBJECT_IDENTITY.knownTeamAbbrs],
    });
    expect(afterContext).toBe(beforeContext);
    expect(JSON.stringify(validIndPlayerSubjectCandidate)).toBe(beforeCandidate);
  });

  it("10. existing WU2 behavior (team-level validation, freshness, quotes) is unaffected", () => {
    const result = normalizeExternalEvidence(confirmedInjuryCandidate, FIXTURE_CONTEXT_WITH_SUBJECT_IDENTITY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.evidence.verificationStatus).toBe("verified");
    expect(result.evidence.pregameSafe).toBe(true);
    // Existing WU2 fixtures use slug-style subject identifiers that don't match
    // this identity source's display names -- unresolved, not a hard failure.
    expect(result.evidence.subjectValidation.players[0].status).toBe("unresolved");
  });
});
