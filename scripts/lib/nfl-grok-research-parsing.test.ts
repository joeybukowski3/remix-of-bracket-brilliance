import { describe, expect, it } from "vitest";
import { buildRawEvidenceCandidatesFromFindings, parseGrokFindings, parseResponsesOutput, parseUsageTelemetry } from "./nfl-grok-research-parsing";
import {
  FIXTURE_CITATION_URL_A,
  FIXTURE_CITATION_URL_B,
  FIXTURE_MALFORMED_MESSAGE_RESPONSE,
  FIXTURE_NO_MESSAGE_RESPONSE,
  FIXTURE_SUCCESS_RESPONSE,
  FIXTURE_SUCCESS_RESPONSE_FENCED,
  FIXTURE_UNCITED_URL,
} from "./__fixtures__/nfl-grok-research-fixtures";

describe("parseResponsesOutput", () => {
  it("extracts message text, citation URLs, and tool-call counts from a well-formed response.output[]", () => {
    const result = parseResponsesOutput(FIXTURE_SUCCESS_RESPONSE.output);
    expect(result.messageText).toContain("Fixture Player A");
    expect(result.citationUrls).toEqual([FIXTURE_CITATION_URL_A, FIXTURE_CITATION_URL_B]);
    expect(result.webSearchCallCount).toBe(2);
    expect(result.reasoningItemCount).toBe(1);
    expect(result.searchQueries).toEqual(["Ravens Colts injury report", "Colts official injury report"]);
  });

  it("returns null messageText when no message item is present", () => {
    const result = parseResponsesOutput(FIXTURE_NO_MESSAGE_RESPONSE.output);
    expect(result.messageText).toBeNull();
    expect(result.citationUrls).toEqual([]);
  });

  it("degrades gracefully on non-array input instead of throwing", () => {
    const result = parseResponsesOutput(undefined);
    expect(result.messageText).toBeNull();
    expect(result.webSearchCallCount).toBe(0);
  });
});

describe("parseUsageTelemetry", () => {
  it("extracts every documented usage/cost field", () => {
    const telemetry = parseUsageTelemetry(FIXTURE_SUCCESS_RESPONSE.usage);
    expect(telemetry).toEqual({
      inputTokens: 42000,
      outputTokens: 900,
      reasoningTokens: 650,
      cachedTokens: 5000,
      totalTokens: 42900,
      serverSideToolCalls: 2,
      webSearchCalls: 2,
      costInUsdTicks: 375020000,
    });
  });

  it("degrades missing fields to null rather than guessing", () => {
    const telemetry = parseUsageTelemetry({});
    expect(telemetry.costInUsdTicks).toBeNull();
    expect(telemetry.inputTokens).toBeNull();
  });
});

describe("parseGrokFindings", () => {
  it("parses a plain JSON array message", () => {
    const output = parseResponsesOutput(FIXTURE_SUCCESS_RESPONSE.output);
    const findings = parseGrokFindings(output.messageText!);
    expect(findings).toHaveLength(3);
  });

  it("parses a markdown-fenced JSON array message", () => {
    const output = parseResponsesOutput(FIXTURE_SUCCESS_RESPONSE_FENCED.output);
    const findings = parseGrokFindings(output.messageText!);
    expect(findings).toHaveLength(3);
  });

  it("throws on prose with no JSON array", () => {
    const output = parseResponsesOutput(FIXTURE_MALFORMED_MESSAGE_RESPONSE.output);
    expect(() => parseGrokFindings(output.messageText!)).toThrow(/No JSON array/);
  });
});

describe("buildRawEvidenceCandidatesFromFindings", () => {
  it("accepts findings whose sourceUrl matches an actual citation and rejects the rest", () => {
    const output = parseResponsesOutput(FIXTURE_SUCCESS_RESPONSE.output);
    const findings = parseGrokFindings(output.messageText!);
    const result = buildRawEvidenceCandidatesFromFindings(findings, {
      model: "grok",
      gameId: "2026_01_BAL_IND",
      citationUrls: output.citationUrls,
      retrievedAt: "2026-09-12T00:00:00.000Z",
    });

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.every((c) => c.source.url !== FIXTURE_UNCITED_URL)).toBe(true);
    expect(result.candidates[0].source.retrievedAt).toBe("2026-09-12T00:00:00.000Z");

    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toMatch(/was not among the URLs/);
  });

  it("rejects a structurally invalid finding without throwing", () => {
    const result = buildRawEvidenceCandidatesFromFindings([{ claim: "" }], {
      model: "grok",
      gameId: "2026_01_BAL_IND",
      citationUrls: [],
      retrievedAt: "2026-09-12T00:00:00.000Z",
    });
    expect(result.candidates).toHaveLength(0);
    expect(result.rejected[0].reason).toMatch(/missing\/empty claim|category/);
  });

  it("is a hard trust boundary: a finding can never be accepted with a URL absent from citationUrls, even if well-formed", () => {
    const result = buildRawEvidenceCandidatesFromFindings(
      [
        {
          claim: "A perfectly well-formed but unverifiable claim.",
          category: "news",
          sourceName: "Fixture Outlet",
          sourceUrl: FIXTURE_UNCITED_URL,
          sourceType: "sports_media",
          subjects: { teams: [], players: [], coaches: [] },
          confidence: "medium",
          relevance: { summary: "test", areas: [] },
        },
      ],
      { model: "grok", gameId: "2026_01_BAL_IND", citationUrls: [FIXTURE_CITATION_URL_A], retrievedAt: "2026-09-12T00:00:00.000Z" }
    );
    expect(result.candidates).toHaveLength(0);
  });
});
