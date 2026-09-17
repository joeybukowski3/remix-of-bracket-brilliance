import { describe, expect, it, vi } from "vitest";
import { buildResearchPrompt, buildUpdateResearchPrompt, isWeatherWindowRelevant, runGrokResearch, type GrokResearchGameFacts } from "./nfl-grok-research-adapter";
import { resolveGrokResearchConfig } from "./nfl-grok-research-config";
import type { ResearchDeltaContext, SnapshotMarketState } from "./nfl-snapshot-types";
import {
  FIXTURE_CITATION_URL_A,
  FIXTURE_CITATION_URL_B,
  FIXTURE_MALFORMED_MESSAGE_RESPONSE,
  FIXTURE_NO_MESSAGE_RESPONSE,
  FIXTURE_SUCCESS_RESPONSE,
  FIXTURE_UPDATE_A_NEW_INJURY_STATUS,
  FIXTURE_UPDATE_C_NO_NEW_INFO,
  FIXTURE_UPDATE_CITATION_URL_INJURY,
  FIXTURE_UPDATE_D_CONFLICTING,
  FIXTURE_UPDATE_DUPLICATE_URL,
  FIXTURE_UPDATE_E_SUPERSEDING,
  FIXTURE_UPDATE_F_WEAK_CITATION,
  FIXTURE_UPDATE_G_DUPLICATE_OLD_FINDING,
} from "./__fixtures__/nfl-grok-research-fixtures";

const GAME: GrokResearchGameFacts = {
  gameId: "2026_01_BAL_IND",
  season: 2026,
  week: 1,
  homeTeam: "ind",
  awayTeam: "bal",
  homeTeamFull: "Indianapolis Colts",
  awayTeamFull: "Baltimore Ravens",
  kickoffUtc: "2026-09-13T17:00:00.000Z",
  isDome: false,
};

const DELTA_CONTEXT: ResearchDeltaContext = {
  previousSnapshotId: "grok-2026_01_BAL_IND-initial-fixtureaaaaaaaa",
  previousResearchCutoff: "2026-09-11T17:38:31.740Z",
  priorEvidenceIds: ["grok-2026_01_BAL_IND-fixture0001", "grok-2026_01_BAL_IND-fixture0002"],
  priorEvidenceClaims: [
    { evidenceId: "grok-2026_01_BAL_IND-fixture0001", claim: "Ravens WR [Fixture Player A] (hamstring) was a full participant in Thursday's practice." },
    { evidenceId: "grok-2026_01_BAL_IND-fixture0002", claim: "Colts DT [Fixture Player B] (rest) did not practice Thursday and is questionable." },
  ],
  previousMarketState: { sportsbook: "draftkings", spread: { homeLine: 3.5, awayLine: -3.5 }, total: { line: 47.5 }, moneyline: { homePrice: 145, awayPrice: -175 }, asOf: "2026-09-11T14:07:09.715Z" },
};

const CURRENT_MARKET: SnapshotMarketState = {
  sportsbook: "draftkings",
  spread: { homeLine: 3, awayLine: -3 },
  total: { line: 47 },
  moneyline: { homePrice: 140, awayPrice: -170 },
  asOf: "2026-09-12T14:00:00.000Z",
};

function fakeFetch(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
    }) as unknown as Response
  ) as unknown as typeof fetch;
}

describe("buildResearchPrompt", () => {
  it("targets the seven prioritized categories and forbids re-deriving JKB/market numbers", () => {
    const prompt = buildResearchPrompt(GAME, resolveGrokResearchConfig("initial"));
    expect(prompt).toContain("Official injury/practice reports");
    expect(prompt).toContain("Do NOT research or restate market odds, point spreads, totals, power ratings");
    expect(prompt).toContain("Baltimore Ravens");
    expect(prompt).toContain("Indianapolis Colts");
  });

  it("never mentions the other model's pipeline (independence guard, architecture §13 item 4)", () => {
    const prompt = buildResearchPrompt(GAME, resolveGrokResearchConfig("initial"));
    expect(prompt).not.toMatch(/chatgpt|openai/i);
  });
});

describe("runGrokResearch", () => {
  it("returns accepted candidates, rejected findings, and full cost/usage telemetry on success", async () => {
    const result = await runGrokResearch({
      mode: "initial",
      game: GAME,
      apiKey: "fixture-key",
      model: "grok",
      fetchImpl: fakeFetch(FIXTURE_SUCCESS_RESPONSE),
      now: () => new Date("2026-09-12T00:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.candidates).toHaveLength(2);
    expect(result.rejectedFindings).toHaveLength(1);
    expect(result.citationUrls).toEqual([FIXTURE_CITATION_URL_A, FIXTURE_CITATION_URL_B]);
    expect(result.telemetry.costUsd).toBeCloseTo(0.037502, 6);
    expect(result.telemetry.costInUsdTicks).toBe(375020000);
    expect(result.telemetry.actualWebSearchCalls).toBe(2);
    expect(result.telemetry.model).toBe("grok-4.6");
    expect(result.telemetry.reasoningEffort).toBe("low");
    expect(result.telemetry.configuredMaxTurns).toBeGreaterThanOrEqual(3);
    expect(result.telemetry.httpStatus).toBe(200);
  });

  it("(WU3.1) reports searchBudgetOutcome descriptively rather than treating max_turns as a hard ceiling", async () => {
    // FIXTURE_SUCCESS_RESPONSE has 2 web_search_call items; force a configured maxTurns below that to exercise "exceeded".
    const exceeded = await runGrokResearch({
      mode: "initial",
      game: GAME,
      apiKey: "fixture-key",
      model: "grok",
      configOverrides: { maxTurns: 1 },
      fetchImpl: fakeFetch(FIXTURE_SUCCESS_RESPONSE),
    });
    expect(exceeded.ok).toBe(true);
    if (!exceeded.ok) throw new Error("expected ok result");
    expect(exceeded.telemetry.actualWebSearchCalls).toBe(2);
    expect(exceeded.telemetry.configuredMaxTurns).toBe(1);
    expect(exceeded.telemetry.searchBudgetOutcome).toBe("exceeded_configured_turns");

    const withinBudget = await runGrokResearch({
      mode: "initial",
      game: GAME,
      apiKey: "fixture-key",
      model: "grok",
      configOverrides: { maxTurns: 5 },
      fetchImpl: fakeFetch(FIXTURE_SUCCESS_RESPONSE),
    });
    expect(withinBudget.ok).toBe(true);
    if (!withinBudget.ok) throw new Error("expected ok result");
    expect(withinBudget.telemetry.searchBudgetOutcome).toBe("within_configured_turns");
  });

  it("(WU3.1) includes a research coverage summary built only from accepted candidates", async () => {
    const result = await runGrokResearch({ mode: "initial", game: GAME, apiKey: "fixture-key", model: "grok", fetchImpl: fakeFetch(FIXTURE_SUCCESS_RESPONSE) });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    // Both accepted fixture findings are category "injury" -> injuryAvailability covered.
    expect(result.coverage.injuryAvailability).toBe("covered");
    expect(result.coverage.weather).toBe("none");
  });

  it("sends max_turns, reasoning_effort, and max_output_tokens on the request body", async () => {
    const fetchImpl = fakeFetch(FIXTURE_SUCCESS_RESPONSE);
    await runGrokResearch({ mode: "initial", game: GAME, apiKey: "fixture-key", model: "grok", fetchImpl });
    const [, requestInit] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(requestInit.body as string);
    expect(body.model).toBe("grok-4.6");
    expect(body.reasoning_effort).toBe("low");
    expect(typeof body.max_turns).toBe("number");
    expect(typeof body.max_output_tokens).toBe("number");
    expect(body.tools).toEqual([{ type: "web_search" }]);
  });

  it("fails closed (ok:false) with telemetry attached on a non-2xx HTTP response, without retrying", async () => {
    const fetchImpl = fakeFetch({ error: "rate limited" }, 429);
    const result = await runGrokResearch({ mode: "initial", game: GAME, apiKey: "fixture-key", model: "grok", fetchImpl });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure result");
    expect(result.error).toMatch(/HTTP 429/);
    expect(result.telemetry?.httpStatus).toBe(429);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fails closed when no message item is present in the output", async () => {
    const result = await runGrokResearch({ mode: "initial", game: GAME, apiKey: "fixture-key", model: "grok", fetchImpl: fakeFetch(FIXTURE_NO_MESSAGE_RESPONSE) });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure result");
    expect(result.error).toMatch(/No final message text/);
  });

  it("fails closed when the message contains no parseable JSON findings array", async () => {
    const result = await runGrokResearch({ mode: "initial", game: GAME, apiKey: "fixture-key", model: "grok", fetchImpl: fakeFetch(FIXTURE_MALFORMED_MESSAGE_RESPONSE) });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure result");
    expect(result.error).toMatch(/Failed to parse Grok findings JSON/);
  });

  describe("WU7.3 -- rawResponseBody (persisted by run-nfl-grok-research.ts as provider-response.raw.json)", () => {
    it("returns the full parsed response body verbatim on success", async () => {
      const result = await runGrokResearch({ mode: "initial", game: GAME, apiKey: "fixture-key", model: "grok", fetchImpl: fakeFetch(FIXTURE_SUCCESS_RESPONSE) });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected ok result");
      expect(result.rawResponseBody).toEqual(FIXTURE_SUCCESS_RESPONSE);
    });

    it("still returns the raw body (for diagnostics) when the output has no parseable findings", async () => {
      const result = await runGrokResearch({ mode: "initial", game: GAME, apiKey: "fixture-key", model: "grok", fetchImpl: fakeFetch(FIXTURE_MALFORMED_MESSAGE_RESPONSE) });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure result");
      expect(result.rawResponseBody).toEqual(FIXTURE_MALFORMED_MESSAGE_RESPONSE);
    });

    it("returns null rawResponseBody when the request never reaches a parseable body (network failure)", async () => {
      const throwingFetch = vi.fn(async () => { throw new Error("network unreachable"); }) as unknown as typeof fetch;
      const result = await runGrokResearch({ mode: "initial", game: GAME, apiKey: "fixture-key", model: "grok", fetchImpl: throwingFetch });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure result");
      expect(result.rawResponseBody).toBeNull();
    });

    it("never makes a real network call -- fetchImpl is always the injected fake", async () => {
      const fetchImpl = fakeFetch(FIXTURE_SUCCESS_RESPONSE);
      await runGrokResearch({ mode: "initial", game: GAME, apiKey: "fixture-key", model: "grok", fetchImpl });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(fetchImpl).not.toBe(fetch);
    });
  });

  it("1. (WU3.3) mode:'update' is no longer rejected outright when deltaContext + currentMarketState are supplied", async () => {
    const result = await runGrokResearch({
      mode: "update",
      game: GAME,
      apiKey: "fixture-key",
      model: "grok",
      deltaContext: DELTA_CONTEXT,
      currentMarketState: CURRENT_MARKET,
      fetchImpl: fakeFetch(FIXTURE_UPDATE_A_NEW_INJURY_STATUS),
    });
    expect(result.ok).toBe(true);
  });

  it("rejects mode:'update' when deltaContext or currentMarketState is missing, without making a network call", async () => {
    const fetchImpl = fakeFetch(FIXTURE_UPDATE_A_NEW_INJURY_STATUS);
    const missingDelta = await runGrokResearch({ mode: "update", game: GAME, apiKey: "fixture-key", model: "grok", currentMarketState: CURRENT_MARKET, fetchImpl });
    expect(missingDelta.ok).toBe(false);
    if (missingDelta.ok) throw new Error("expected failure result");
    expect(missingDelta.error).toMatch(/requires both deltaContext and currentMarketState/);
    expect(missingDelta.telemetry).toBeNull();

    const missingMarket = await runGrokResearch({ mode: "update", game: GAME, apiKey: "fixture-key", model: "grok", deltaContext: DELTA_CONTEXT, fetchImpl });
    expect(missingMarket.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("7. an empty findings array (no new material information) is a valid, successful result", async () => {
    const result = await runGrokResearch({
      mode: "update",
      game: GAME,
      apiKey: "fixture-key",
      model: "grok",
      deltaContext: DELTA_CONTEXT,
      currentMarketState: CURRENT_MARKET,
      fetchImpl: fakeFetch(FIXTURE_UPDATE_C_NO_NEW_INFO),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.candidates).toEqual([]);
    expect(result.rejectedFindings).toEqual([]);
  });

  it("8. a genuinely new finding (status upgrade) is accepted as a candidate", async () => {
    const result = await runGrokResearch({
      mode: "update",
      game: GAME,
      apiKey: "fixture-key",
      model: "grok",
      deltaContext: DELTA_CONTEXT,
      currentMarketState: CURRENT_MARKET,
      fetchImpl: fakeFetch(FIXTURE_UPDATE_A_NEW_INJURY_STATUS),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].source.url).toBe(FIXTURE_UPDATE_CITATION_URL_INJURY);
  });

  it("11. a conflicting update is still accepted as a candidate here -- resolving the conflict is the evidence store's job, not the adapter's", async () => {
    const result = await runGrokResearch({
      mode: "update",
      game: GAME,
      apiKey: "fixture-key",
      model: "grok",
      deltaContext: DELTA_CONTEXT,
      currentMarketState: CURRENT_MARKET,
      fetchImpl: fakeFetch(FIXTURE_UPDATE_D_CONFLICTING),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.candidates).toHaveLength(1);
  });

  it("10. a superseding update is accepted as a candidate -- supersession itself is resolved later by resolveEvidenceAuthority", async () => {
    const result = await runGrokResearch({
      mode: "update",
      game: GAME,
      apiKey: "fixture-key",
      model: "grok",
      deltaContext: DELTA_CONTEXT,
      currentMarketState: CURRENT_MARKET,
      fetchImpl: fakeFetch(FIXTURE_UPDATE_E_SUPERSEDING),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.candidates).toHaveLength(1);
  });

  it("12. (WU3.1 unchanged) citation trust still applies in update mode -- a weak (section/index) citation is accepted as a candidate but remains classifiable for review downstream", async () => {
    const result = await runGrokResearch({
      mode: "update",
      game: GAME,
      apiKey: "fixture-key",
      model: "grok",
      deltaContext: DELTA_CONTEXT,
      currentMarketState: CURRENT_MARKET,
      fetchImpl: fakeFetch(FIXTURE_UPDATE_F_WEAK_CITATION),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].source.url.endsWith("/")).toBe(true); // section/index shape, unchanged citation-trust behavior
  });

  it("9. a finding matching an already-known claim+URL is still returned by the adapter -- de-duplication against prior evidence happens at the store layer (appendEvidence), not the adapter", async () => {
    const result = await runGrokResearch({
      mode: "update",
      game: GAME,
      apiKey: "fixture-key",
      model: "grok",
      deltaContext: DELTA_CONTEXT,
      currentMarketState: CURRENT_MARKET,
      fetchImpl: fakeFetch(FIXTURE_UPDATE_G_DUPLICATE_OLD_FINDING),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].source.url).toBe(FIXTURE_UPDATE_DUPLICATE_URL);
  });

  it("21. (WU3.3) update-mode telemetry still records exact cost, latency, and token usage", async () => {
    const result = await runGrokResearch({
      mode: "update",
      game: GAME,
      apiKey: "fixture-key",
      model: "grok",
      deltaContext: DELTA_CONTEXT,
      currentMarketState: CURRENT_MARKET,
      fetchImpl: fakeFetch(FIXTURE_UPDATE_A_NEW_INJURY_STATUS),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.telemetry.costUsd).toBeCloseTo(0.0042, 6);
    expect(result.telemetry.costInUsdTicks).toBe(42000000);
    expect(result.telemetry.usage.totalTokens).toBe(12300);
    expect(result.telemetry.configuredMaxTurns).toBe(3); // update mode's narrower budget vs initial's 5
    expect(result.telemetry.mode).toBe("update");
  });

  it("24. (WU3.3) never mutates the deterministic delta context or current market state it was given", async () => {
    const deltaBefore = JSON.stringify(DELTA_CONTEXT);
    const marketBefore = JSON.stringify(CURRENT_MARKET);
    await runGrokResearch({
      mode: "update",
      game: GAME,
      apiKey: "fixture-key",
      model: "grok",
      deltaContext: DELTA_CONTEXT,
      currentMarketState: CURRENT_MARKET,
      fetchImpl: fakeFetch(FIXTURE_UPDATE_A_NEW_INJURY_STATUS),
    });
    expect(JSON.stringify(DELTA_CONTEXT)).toBe(deltaBefore);
    expect(JSON.stringify(CURRENT_MARKET)).toBe(marketBefore);
  });
});

describe("isWeatherWindowRelevant", () => {
  it("is never relevant for a dome, regardless of timing", () => {
    expect(isWeatherWindowRelevant(true, 24)).toBe(false);
    expect(isWeatherWindowRelevant(true, 0)).toBe(false);
  });

  it("is relevant outdoors within the ~5-day forecast window", () => {
    expect(isWeatherWindowRelevant(false, 24)).toBe(true);
    expect(isWeatherWindowRelevant(false, 120)).toBe(true);
  });

  it("is not relevant outdoors well outside the forecast window", () => {
    expect(isWeatherWindowRelevant(false, 121)).toBe(false);
    expect(isWeatherWindowRelevant(false, -1)).toBe(false);
  });
});

describe("buildUpdateResearchPrompt", () => {
  it("2. includes the previous research cutoff", () => {
    const prompt = buildUpdateResearchPrompt(GAME, resolveGrokResearchConfig("update"), DELTA_CONTEXT, CURRENT_MARKET, "2026-09-12T00:00:00.000Z");
    expect(prompt).toContain(DELTA_CONTEXT.previousResearchCutoff!);
  });

  it("3. includes concise prior evidence claims so Grok knows not to re-report them", () => {
    const prompt = buildUpdateResearchPrompt(GAME, resolveGrokResearchConfig("update"), DELTA_CONTEXT, CURRENT_MARKET, "2026-09-12T00:00:00.000Z");
    expect(prompt).toContain(DELTA_CONTEXT.priorEvidenceClaims![0].claim);
  });

  it("4. includes the current deterministic market state without asking Grok to search for it", () => {
    const prompt = buildUpdateResearchPrompt(GAME, resolveGrokResearchConfig("update"), DELTA_CONTEXT, CURRENT_MARKET, "2026-09-12T00:00:00.000Z");
    expect(prompt).toContain(String(CURRENT_MARKET.spread.homeLine));
    expect(prompt).toContain("do NOT search for these numbers");
  });

  it("5. is delta-focused: frames the task as a delta update, not full matchup research, and never asks about the bet/lean/confidence", () => {
    const prompt = buildUpdateResearchPrompt(GAME, resolveGrokResearchConfig("update"), DELTA_CONTEXT, CURRENT_MARKET, "2026-09-12T00:00:00.000Z");
    expect(prompt).toMatch(/DELTA UPDATE/);
    expect(prompt).not.toMatch(/whether.*(bet|lean|confidence)/i);
    expect(prompt).not.toMatch(/is the market right/i);
  });

  it("6. explicitly tells Grok an unchanged prior fact does not need to be returned", () => {
    const prompt = buildUpdateResearchPrompt(GAME, resolveGrokResearchConfig("update"), DELTA_CONTEXT, CURRENT_MARKET, "2026-09-12T00:00:00.000Z");
    expect(prompt).toContain("do NOT return these again unless something about them");
  });

  it("permits and expects an empty array when nothing changed", () => {
    const prompt = buildUpdateResearchPrompt(GAME, resolveGrokResearchConfig("update"), DELTA_CONTEXT, CURRENT_MARKET, "2026-09-12T00:00:00.000Z");
    expect(prompt).toContain("respond with an empty JSON array: []");
  });

  it("never fabricates a market-move explanation instruction -- explicitly forbids inferring 'sharp money' without sourced evidence", () => {
    const prompt = buildUpdateResearchPrompt(GAME, resolveGrokResearchConfig("update"), DELTA_CONTEXT, CURRENT_MARKET, "2026-09-12T00:00:00.000Z");
    expect(prompt).toMatch(/sharp money/i);
    expect(prompt).toMatch(/unless you find an actual sourced report/i);
  });

  it("includes the weather category when outdoors and within the forecast window", () => {
    const near = { ...GAME, isDome: false };
    const prompt = buildUpdateResearchPrompt(near, resolveGrokResearchConfig("update"), DELTA_CONTEXT, CURRENT_MARKET, "2026-09-11T00:00:00.000Z"); // 41h before kickoff
    expect(prompt).toContain("check current conditions/forecast");
  });

  it("skips the weather category for a dome", () => {
    const dome = { ...GAME, isDome: true };
    const prompt = buildUpdateResearchPrompt(dome, resolveGrokResearchConfig("update"), DELTA_CONTEXT, CURRENT_MARKET, "2026-09-11T00:00:00.000Z");
    expect(prompt).toContain("SKIP this category");
  });

  it("skips the weather category when well outside the forecast window", () => {
    const prompt = buildUpdateResearchPrompt(GAME, resolveGrokResearchConfig("update"), DELTA_CONTEXT, CURRENT_MARKET, "2026-09-01T00:00:00.000Z"); // ~12 days before kickoff
    expect(prompt).toContain("SKIP this category");
  });

  it("never mentions the other model's pipeline (independence guard)", () => {
    const prompt = buildUpdateResearchPrompt(GAME, resolveGrokResearchConfig("update"), DELTA_CONTEXT, CURRENT_MARKET, "2026-09-12T00:00:00.000Z");
    expect(prompt).not.toMatch(/chatgpt|openai/i);
  });
});
