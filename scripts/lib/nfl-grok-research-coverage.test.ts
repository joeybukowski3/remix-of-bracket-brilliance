import { describe, expect, it } from "vitest";
import { summarizeResearchCoverage } from "./nfl-grok-research-coverage";
import type { RawEvidenceCandidate } from "./nfl-evidence-types";

function candidate(category: RawEvidenceCandidate["category"]): RawEvidenceCandidate {
  return {
    model: "grok",
    gameId: "2026_01_BAL_IND",
    claim: `A ${category} claim.`,
    category,
    source: { name: "Fixture", url: "https://example-fixture.test/a", sourceType: "beat_reporter", retrievedAt: "2026-09-12T00:00:00.000Z" },
  };
}

describe("summarizeResearchCoverage", () => {
  it("reports 'covered' for an area with 2+ accepted findings and 'partial' for exactly 1", () => {
    const summary = summarizeResearchCoverage([candidate("injury"), candidate("availability"), candidate("personnel")], []);
    expect(summary.injuryAvailability).toBe("covered");
    expect(summary.personnel).toBe("partial");
  });

  it("reports 'none' for an area with zero accepted findings", () => {
    const summary = summarizeResearchCoverage([], []);
    expect(summary.weather).toBe("none");
    expect(summary.coachingScheme).toBe("none");
    expect(summary.marketContext).toBe("none");
  });

  it("never requires every category to produce evidence -- 'none' is not an error state", () => {
    const summary = summarizeResearchCoverage([candidate("injury"), candidate("injury")], ["Ravens Colts injury report"]);
    expect(summary.weather).toBe("none");
    // weather was never searched in this case, so it must NOT appear as "searched but no material finding"
    expect(summary.searchedButNoMaterialFinding).not.toContain("weather");
  });

  it("distinguishes 'searched but found nothing material' from 'never checked'", () => {
    const summary = summarizeResearchCoverage([], ["Indianapolis weather forecast Sunday kickoff", "Ravens Colts injury report"]);
    expect(summary.weather).toBe("none");
    expect(summary.injuryAvailability).toBe("none");
    expect(summary.searchedButNoMaterialFinding).toContain("weather");
    expect(summary.searchedButNoMaterialFinding).toContain("injuryAvailability");
    // marketContext was never queried and has no findings -- must not be listed as "searched".
    expect(summary.searchedButNoMaterialFinding).not.toContain("marketContext");
  });

  it("does not fabricate coverage from categories outside the five tracked areas", () => {
    const summary = summarizeResearchCoverage([candidate("news"), candidate("situational"), candidate("travel")], []);
    expect(summary.injuryAvailability).toBe("none");
    expect(summary.personnel).toBe("none");
    expect(summary.coachingScheme).toBe("none");
  });
});
