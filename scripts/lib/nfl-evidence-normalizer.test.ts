import { describe, expect, it } from "vitest";
import { normalizeExternalEvidence } from "./nfl-evidence-normalizer";
import {
  FIXTURE_CONTEXT,
  coachQuoteCandidate,
  confirmedInjuryCandidate,
  factualClaimWithNoQuoteCandidate,
  factualClaimWithNonverbatimQuoteCandidate,
  factualClaimWithNonverbatimQuoteNoSourceCandidate,
  factualClaimWithVerbatimQuoteCandidate,
  homepageCitationCandidate,
  jkbMetricMasqueradeCandidate,
  missingUrlCandidate,
  paraphraseAsQuoteCandidate,
  postKickoffContaminationCandidate,
  questionablePlayerCandidate,
  quotePrimaryNonverbatimCandidate,
  rejectedRumorCandidate,
  sectionIndexCitationCandidate,
  unknownTeamSubjectCandidate,
  unsupportedSharpMoneyCandidate,
  weatherCandidate,
  wrongGameCandidate,
} from "./__fixtures__/nfl-evidence-fixtures";

describe("normalizeExternalEvidence", () => {
  it("1. accepts a valid official injury claim as verified + pregameSafe", () => {
    const result = normalizeExternalEvidence(confirmedInjuryCandidate, FIXTURE_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.evidence.verificationStatus).toBe("verified");
    expect(result.evidence.pregameSafe).toBe(true);
    expect(result.evidence.category).toBe("injury");
  });

  it("2. accepts a valid beat-reporter personnel/injury claim as single_source", () => {
    const result = normalizeExternalEvidence(questionablePlayerCandidate, FIXTURE_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.evidence.verificationStatus).toBe("single_source");
    expect(result.evidence.pregameSafe).toBe(true);
  });

  it("3. accepts a valid quote when exactText appears verbatim in rawExcerpt", () => {
    const result = normalizeExternalEvidence(coachQuoteCandidate, FIXTURE_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.evidence.quote?.exactText).toBe(coachQuoteCandidate.quote?.exactText);
  });

  it("4. rejects a paraphrase presented as a quote (exactText missing from rawExcerpt)", () => {
    const result = normalizeExternalEvidence(paraphraseAsQuoteCandidate, FIXTURE_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toMatch(/verbatim/);
  });

  it("5. rejects a candidate with a missing/malformed source URL", () => {
    const result = normalizeExternalEvidence(missingUrlCandidate, FIXTURE_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toMatch(/url/i);
  });

  it("6. flags post-kickoff evidence as not pregame-safe rather than dropping it", () => {
    const result = normalizeExternalEvidence(postKickoffContaminationCandidate, FIXTURE_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.evidence.pregameSafe).toBe(false);
  });

  it("7. classifies staleness/freshness against the documented per-category thresholds", () => {
    const stale = normalizeExternalEvidence(
      {
        ...confirmedInjuryCandidate,
        source: { ...confirmedInjuryCandidate.source, publishedAt: "2026-09-06T12:00:00.000Z", retrievedAt: "2026-09-06T12:05:00.000Z" },
      },
      FIXTURE_CONTEXT
    );
    expect(stale.ok).toBe(true);
    if (!stale.ok) return;
    expect(stale.evidence.freshness).toBe("stale");

    const fresh = normalizeExternalEvidence(confirmedInjuryCandidate, FIXTURE_CONTEXT);
    expect(fresh.ok).toBe(true);
    if (!fresh.ok) return;
    expect(fresh.evidence.freshness).toBe("fresh");
  });

  it("8. rejects an unknown team as a hard structural failure", () => {
    const result = normalizeExternalEvidence(unknownTeamSubjectCandidate, FIXTURE_CONTEXT);
    expect(result.ok).toBe(false);
  });

  it("9. rejects evidence associated with the wrong game", () => {
    const result = normalizeExternalEvidence(wrongGameCandidate, FIXTURE_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toMatch(/gameId/);
  });

  it("10. does not hard-fail a synthetic rumor, but marks it unverified/rejected", () => {
    const result = normalizeExternalEvidence(rejectedRumorCandidate, FIXTURE_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.evidence.verificationStatus).toBe("rejected");
    expect(result.evidence.confidence).toBe("low");
  });

  it("11. produces deterministic evidenceIds for identical input", () => {
    const first = normalizeExternalEvidence(confirmedInjuryCandidate, FIXTURE_CONTEXT);
    const second = normalizeExternalEvidence(confirmedInjuryCandidate, FIXTURE_CONTEXT);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.evidence.evidenceId).toBe(second.evidence.evidenceId);
  });

  it("12. never marks a rejected record verified", () => {
    const result = normalizeExternalEvidence(rejectedRumorCandidate, FIXTURE_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.evidence.verificationStatus).not.toBe("verified");
  });

  it("13. rejects unsupported 'sharp money' market language from a low-tier source", () => {
    const result = normalizeExternalEvidence(unsupportedSharpMoneyCandidate, FIXTURE_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.evidence.verificationStatus).toBe("rejected");
  });

  it("14. flags a claim that masquerades as an internal JKB metric", () => {
    const result = normalizeExternalEvidence(jkbMetricMasqueradeCandidate, FIXTURE_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.evidence.verificationStatus).toBe("rejected");
  });

  it("15. represents a weather claim with the documented weather schema fields", () => {
    const result = normalizeExternalEvidence(weatherCandidate, FIXTURE_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.evidence.category).toBe("weather");
    expect(result.evidence.source.sourceType).toBe("weather_provider");
  });

  it("16. never mutates the raw candidate object passed in", () => {
    const before = JSON.stringify(confirmedInjuryCandidate);
    normalizeExternalEvidence(confirmedInjuryCandidate, FIXTURE_CONTEXT);
    expect(JSON.stringify(confirmedInjuryCandidate)).toBe(before);
  });

  it("17. never mutates the deterministic JKB context input", () => {
    const before = JSON.stringify({ ...FIXTURE_CONTEXT, knownTeamAbbrs: [...FIXTURE_CONTEXT.knownTeamAbbrs] });
    normalizeExternalEvidence(confirmedInjuryCandidate, FIXTURE_CONTEXT);
    const after = JSON.stringify({ ...FIXTURE_CONTEXT, knownTeamAbbrs: [...FIXTURE_CONTEXT.knownTeamAbbrs] });
    expect(after).toBe(before);
  });

  it("18. rejects an invalid model namespace", () => {
    const result = normalizeExternalEvidence({ ...confirmedInjuryCandidate, model: "claude" as never }, FIXTURE_CONTEXT);
    expect(result.ok).toBe(false);
  });

  it("19. rejects a candidate with an invalid category", () => {
    const result = normalizeExternalEvidence({ ...confirmedInjuryCandidate, category: "not_a_category" as never }, FIXTURE_CONTEXT);
    expect(result.ok).toBe(false);
  });

  it("20. always populates provenance on a successfully normalized record", () => {
    const result = normalizeExternalEvidence(confirmedInjuryCandidate, FIXTURE_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.evidence.provenance.candidateHash).toBeTruthy();
    expect(result.evidence.provenance.normalizerVersion).toBeTruthy();
  });

  it("21. (WU3.1) a specific article URL is classified exact_document and needs no citation review", () => {
    const result = normalizeExternalEvidence(confirmedInjuryCandidate, FIXTURE_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.evidence.source.citationSpecificity).toBe("exact_document");
    expect(result.evidence.citationNeedsReview).toBe(false);
  });

  it("22. (WU3.1) retains a section/index-URL claim rather than rejecting it, but flags it for citation review", () => {
    const result = normalizeExternalEvidence(sectionIndexCitationCandidate, FIXTURE_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.evidence.source.citationSpecificity).toBe("section_or_index");
    expect(result.evidence.citationNeedsReview).toBe(true);
  });

  it("23. (WU3.1) retains a homepage-only claim rather than rejecting it, but flags it for citation review", () => {
    const result = normalizeExternalEvidence(homepageCitationCandidate, FIXTURE_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.evidence.source.citationSpecificity).toBe("homepage");
    expect(result.evidence.citationNeedsReview).toBe(true);
  });

  it("24. (WU3.1) a homepage citation is never treated as equivalent to a direct article citation", () => {
    const exact = normalizeExternalEvidence(confirmedInjuryCandidate, FIXTURE_CONTEXT);
    const homepage = normalizeExternalEvidence(homepageCitationCandidate, FIXTURE_CONTEXT);
    if (!exact.ok || !homepage.ok) throw new Error("expected both to normalize");
    expect(exact.evidence.citationNeedsReview).not.toBe(homepage.evidence.citationNeedsReview);
  });
});

describe("normalizeExternalEvidence quote sanitization (WU3.3.1)", () => {
  it("1/replay. the real Madubuike-shaped case: a valid, cited factual claim with a paraphrased optional quote is ACCEPTED, quote stripped, diagnostic recorded", () => {
    const result = normalizeExternalEvidence(factualClaimWithNonverbatimQuoteCandidate, FIXTURE_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.evidence.claim).toContain("ruled out");
    expect(result.evidence.quote).toBeNull();
    expect(result.evidence.quoteSanitization).toBe("removed_nonverbatim");
    expect(result.evidence.verificationStatus).not.toBe("rejected");
  });

  it("2. a true verbatim optional quote is retained, tagged 'verified'", () => {
    const result = normalizeExternalEvidence(factualClaimWithVerbatimQuoteCandidate, FIXTURE_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.evidence.quote).toEqual(factualClaimWithVerbatimQuoteCandidate.quote);
    expect(result.evidence.quoteSanitization).toBe("verified");
  });

  it("3. a quote-primary (category 'quote') candidate with an unsupported exactText is still hard-rejected, unchanged", () => {
    const result = normalizeExternalEvidence(quotePrimaryNonverbatimCandidate, FIXTURE_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toMatch(/verbatim/);
  });

  it("4. no quote at all -- unchanged normal behavior, tagged 'not_applicable'", () => {
    const result = normalizeExternalEvidence(factualClaimWithNoQuoteCandidate, FIXTURE_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.evidence.quote).toBeNull();
    expect(result.evidence.quoteSanitization).toBe("not_applicable");
  });

  it("5. a factual claim with a bad quote but no source URL still fails under existing trust rules (quote sanitization does not bypass other structural checks)", () => {
    const result = normalizeExternalEvidence(factualClaimWithNonverbatimQuoteNoSourceCandidate, FIXTURE_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toMatch(/source\.url/);
  });

  it("never rewrites a paraphrase into a fabricated verbatim quote -- the stripped quote is null, never a modified/invented exactText", () => {
    const result = normalizeExternalEvidence(factualClaimWithNonverbatimQuoteCandidate, FIXTURE_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.evidence.quote).toBeNull();
  });

  it("preserves the original rawExcerpt even when the quote is stripped", () => {
    const result = normalizeExternalEvidence(factualClaimWithNonverbatimQuoteCandidate, FIXTURE_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.evidence.rawExcerpt).toBe(factualClaimWithNonverbatimQuoteCandidate.rawExcerpt);
  });

  it("never mutates the input candidate's quote object while sanitizing", () => {
    const before = JSON.stringify(factualClaimWithNonverbatimQuoteCandidate);
    normalizeExternalEvidence(factualClaimWithNonverbatimQuoteCandidate, FIXTURE_CONTEXT);
    expect(JSON.stringify(factualClaimWithNonverbatimQuoteCandidate)).toBe(before);
  });
});
