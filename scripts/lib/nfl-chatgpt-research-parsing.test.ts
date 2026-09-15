/**
 * WU6.4 -- regression coverage for buildRawEvidenceCandidatesFromFindings(),
 * added after a live WU6.3 run against 2026_02_DET_BUF: ChatGPT returned 12
 * evidence candidates, 11 well-formed and one with `subjects` as a flat
 * array (`["buf","det"]`) instead of `{teams,players,coaches}` and no
 * `confidence`/`relevance`/`quote` at all. That malformed candidate reached
 * normalizeExternalEvidence()'s canonical hashing with an explicit
 * `confidence: undefined` own-property (from `confidence: x ?? undefined`
 * always creating the key) and crashed the ENTIRE research pass with an
 * uncaught exception, discarding all 11 otherwise-usable candidates from an
 * already-paid-for API response.
 *
 * This file proves, at the parsing layer (before normalizeExternalEvidence
 * is ever called): the malformed candidate is quarantined here with an
 * explicit, auditable reason, the surrounding valid candidates are
 * unaffected, and no candidate this function returns can carry an
 * explicit `confidence: undefined` own-property.
 */
import { describe, expect, it } from "vitest";
import { buildRawEvidenceCandidatesFromFindings, type ChatGptCitedSource, type ChatGptDiscoveredSource } from "./nfl-chatgpt-research-parsing";

const CITED_URL = "https://www.buffalobills.com/schedule/";
const CITED_URL_2 = "https://www.detroitlions.com/news/injury-report";

const CITED_SOURCES: ChatGptCitedSource[] = [
  { providerReturnedUrl: CITED_URL, canonicalUrl: CITED_URL, title: "Bills Schedule", startIndex: null, endIndex: null },
  { providerReturnedUrl: CITED_URL_2, canonicalUrl: CITED_URL_2, title: "Lions Injury Report", startIndex: null, endIndex: null },
];
const DISCOVERED_SOURCES: ChatGptDiscoveredSource[] = [];

function validFinding(overrides: Record<string, unknown> = {}) {
  return {
    claim: "A well-formed, fully cited claim about the matchup.",
    category: "injury",
    sourceName: "Detroit Lions",
    sourceUrl: CITED_URL_2,
    sourceType: "official_team",
    author: null,
    publishedAt: null,
    subjects: { teams: ["buf", "det"], players: [], coaches: [] },
    confidence: "high",
    relevance: { summary: "test", areas: [] },
    ...overrides,
  };
}

/** The exact defect shape observed live: subjects as a flat array, confidence/relevance/quote absent. */
const MALFORMED_DET_BUF_CANDIDATE = {
  claim: "The Bills' official schedule identifies Detroit at Buffalo for Thursday, September 17, at 8:15 p.m. EDT at Highmark Stadium.",
  category: "scheduling",
  sourceName: "Buffalo Bills",
  sourceUrl: CITED_URL,
  sourceType: "official_team",
  author: null,
  publishedAt: null,
  subjects: ["buf", "det"],
  players: [],
  coaches: [],
};

describe("buildRawEvidenceCandidatesFromFindings -- WU6.4 DET_BUF malformed-candidate regression", () => {
  it("quarantines a candidate whose subjects is a flat array, with an explicit reason", () => {
    const result = buildRawEvidenceCandidatesFromFindings([MALFORMED_DET_BUF_CANDIDATE], {
      model: "chatgpt",
      gameId: "2026_02_DET_BUF",
      discoveredSources: DISCOVERED_SOURCES,
      citedSources: CITED_SOURCES,
      retrievedAt: "2026-09-15T12:47:19.000Z",
    });
    expect(result.candidates).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toMatch(/subjects: expected object with optional teams\/players\/coaches arrays, received an array/);
  });

  it("never throws on the malformed candidate", () => {
    expect(() =>
      buildRawEvidenceCandidatesFromFindings([MALFORMED_DET_BUF_CANDIDATE], {
        model: "chatgpt",
        gameId: "2026_02_DET_BUF",
        discoveredSources: DISCOVERED_SOURCES,
        citedSources: CITED_SOURCES,
        retrievedAt: "2026-09-15T12:47:19.000Z",
      })
    ).not.toThrow();
  });

  it("one malformed candidate among many valid ones only quarantines the malformed one -- the rest normalize", () => {
    const findings = [validFinding(), validFinding({ claim: "Second valid claim." }), MALFORMED_DET_BUF_CANDIDATE, validFinding({ claim: "Third valid claim." })];
    const result = buildRawEvidenceCandidatesFromFindings(findings, {
      model: "chatgpt",
      gameId: "2026_02_DET_BUF",
      discoveredSources: DISCOVERED_SOURCES,
      citedSources: CITED_SOURCES,
      retrievedAt: "2026-09-15T12:47:19.000Z",
    });
    expect(result.candidates).toHaveLength(3);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].finding).toBe(MALFORMED_DET_BUF_CANDIDATE); // raw candidate retained for diagnostics
  });

  it("a candidate whose source finding omits confidence has NO confidence key at all -- never an explicit `confidence: undefined`", () => {
    const findingWithoutConfidence = validFinding();
    delete (findingWithoutConfidence as Record<string, unknown>).confidence;
    const result = buildRawEvidenceCandidatesFromFindings([findingWithoutConfidence], {
      model: "chatgpt",
      gameId: "2026_02_DET_BUF",
      discoveredSources: DISCOVERED_SOURCES,
      citedSources: CITED_SOURCES,
      retrievedAt: "2026-09-15T12:47:19.000Z",
    });
    expect(result.candidates).toHaveLength(1);
    expect("confidence" in result.candidates[0]).toBe(false);
    // The strict boundary contentHash()/canonicalJson() enforce elsewhere in this codebase: an
    // explicit `undefined`-valued own property is exactly what would fail this assertion.
    expect(Object.entries(result.candidates[0]).every(([, value]) => value !== undefined)).toBe(true);
  });
});
