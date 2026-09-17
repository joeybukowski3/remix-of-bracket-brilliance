import { describe, expect, it, vi } from "vitest";
import {
  buildCitableEvidenceLines,
  buildStageAInitialPrompt,
  buildStageAUpdatePrompt,
  buildStageBInitialPrompt,
  runChatGptStageAInitial,
  runChatGptStageAUpdate,
  runChatGptStageBInitial,
  runChatGptStageBUpdate,
} from "./nfl-chatgpt-analysis-adapter";
import { resolveChatGptAnalysisConfig } from "./nfl-chatgpt-analysis-config";
import { filterEvidenceRecordsForBlindStageA } from "./nfl-ai-context-sanitizer";
import { MATCHUP_FACTOR_AREAS } from "./nfl-grok-analysis-types";
import {
  FIXTURE_CHATGPT_ANALYSIS_ALL_EVIDENCE_RECORDS,
  FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET,
  FIXTURE_CHATGPT_ANALYSIS_CURRENT_MARKET,
  FIXTURE_CHATGPT_ANALYSIS_EVIDENCE_AUTHORITY,
  FIXTURE_CHATGPT_ANALYSIS_GAME,
  FIXTURE_CHATGPT_ANALYSIS_MARKET_COMMENTARY_RECORD,
  FIXTURE_LOCKED_STAGE_A,
  FIXTURE_MALFORMED_ANALYSIS_RESPONSE,
  FIXTURE_MARKET_RECORD_UNCHANGED,
  FIXTURE_PREVIOUS_BLIND_STATE,
  FIXTURE_STAGE_A_BASE,
  incompleteNonTokenReasonAnalysisResponse,
  truncatedAnalysisResponse,
} from "./__fixtures__/nfl-chatgpt-analysis-fixtures";

function fakeFetch(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) }) as unknown as Response) as unknown as typeof fetch;
}

/** Returns a fetch mock that replays one response body per call, in order (for testing multi-request retry behavior). Mirrors nfl-chatgpt-research-adapter.test.ts's identical helper. */
function sequentialFakeFetch(bodies: readonly unknown[], status = 200): typeof fetch {
  let call = 0;
  return vi.fn(async () => {
    const body = bodies[Math.min(call, bodies.length - 1)];
    call += 1;
    return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) } as unknown as Response;
  }) as unknown as typeof fetch;
}

const ALL_RECORDS_WITH_MARKET_COMMENTARY = [...FIXTURE_CHATGPT_ANALYSIS_ALL_EVIDENCE_RECORDS, FIXTURE_CHATGPT_ANALYSIS_MARKET_COMMENTARY_RECORD];
const BLIND_RECORDS = filterEvidenceRecordsForBlindStageA(ALL_RECORDS_WITH_MARKET_COMMENTARY);
const CITABLE_LINES = buildCitableEvidenceLines(BLIND_RECORDS, FIXTURE_CHATGPT_ANALYSIS_EVIDENCE_AUTHORITY);

describe("buildCitableEvidenceLines (chatgpt)", () => {
  it("MODEL ISOLATION: excludes the grok-model record and any rejected record -- ChatGPT never sees what it cannot cite", () => {
    const grokRecord = FIXTURE_CHATGPT_ANALYSIS_ALL_EVIDENCE_RECORDS.find((r) => r.model === "grok")!;
    expect(CITABLE_LINES.some((line) => line.includes(grokRecord.evidenceId))).toBe(false);
    expect(CITABLE_LINES.every((line) => !line.includes("verification=rejected"))).toBe(true);
  });
});

describe("buildStageAInitialPrompt (chatgpt)", () => {
  it("includes underlying football data and citable evidence, and forbids inventing values", () => {
    const prompt = buildStageAInitialPrompt(FIXTURE_CHATGPT_ANALYSIS_GAME, FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET, CITABLE_LINES);
    expect(prompt).toContain("Indianapolis Colts");
    expect(prompt).toContain("Baltimore Ravens");
    expect(prompt).toContain("jkbModels.powerRating");
    expect(prompt).toContain("Do not invent injuries, quotes, market movement, trends, or player status");
  });

  it("MODEL ISOLATION: never mentions Grok's pipeline (independence guard)", () => {
    const prompt = buildStageAInitialPrompt(FIXTURE_CHATGPT_ANALYSIS_GAME, FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET, CITABLE_LINES);
    expect(prompt).not.toMatch(/\bgrok\b/i);
  });

  it("1/2. never mentions or includes the sportsbook spread or total anywhere", () => {
    const prompt = buildStageAInitialPrompt(FIXTURE_CHATGPT_ANALYSIS_GAME, FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET, CITABLE_LINES);
    expect(prompt).not.toContain(`spread(home)=${FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET.market.spread.homeLine}`);
    expect(prompt).not.toContain(`total=${FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET.market.total.line}`);
    expect(prompt).not.toMatch(/"market":/);
  });

  it("3/4. never exposes JKB's own projected spread/total or model-market edge", () => {
    const prompt = buildStageAInitialPrompt(FIXTURE_CHATGPT_ANALYSIS_GAME, FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET, CITABLE_LINES);
    expect(prompt).not.toContain("jkbModels.projectedSpread");
    expect(prompt).not.toContain("jkbModels.projectedTotal");
    expect(prompt).not.toContain("jkbModels.modelMarketEdge");
    expect(prompt).not.toMatch(new RegExp(String(FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET.jkbModels.projectedSpread.homeLine)));
  });

  it("6/7. still exposes underlying football metrics and citable evidence", () => {
    const prompt = buildStageAInitialPrompt(FIXTURE_CHATGPT_ANALYSIS_GAME, FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET, CITABLE_LINES);
    expect(prompt).toContain("teamMetrics.epa");
    expect(prompt).toContain("matchup.trenches");
    for (const line of CITABLE_LINES) expect(prompt).toContain(line);
  });

  it("has no market-comparison or betting-decision step at all", () => {
    const prompt = buildStageAInitialPrompt(FIXTURE_CHATGPT_ANALYSIS_GAME, FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET, CITABLE_LINES);
    expect(prompt).toMatch(/STEP 2 -- INDEPENDENT FAIR SPREAD/);
    expect(prompt).toMatch(/STEP 3 -- INDEPENDENT PROJECTED TOTAL/);
    expect(prompt).not.toMatch(/STEP 4|STEP 5|MARKET COMPARISON|BETTING DECISION/);
  });

  it("WU4.4.1: explicitly lists every legal matchupFactors[].area enum value, sourced from the shared type", () => {
    const prompt = buildStageAInitialPrompt(FIXTURE_CHATGPT_ANALYSIS_GAME, FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET, CITABLE_LINES);
    expect(prompt).toMatch(/area MUST be exactly one of these values/);
    for (const area of MATCHUP_FACTOR_AREAS) {
      expect(prompt).toContain(`"${area}"`);
    }
  });

  it("WU4.4.1/WU4.6.4: explicitly forbids the bet-type/structural labels that caused live rejections (\"trenches\", \"total\", \"side\", \"offense\", \"defense\") as area values", () => {
    const prompt = buildStageAInitialPrompt(FIXTURE_CHATGPT_ANALYSIS_GAME, FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET, CITABLE_LINES);
    expect(prompt).toMatch(/Do NOT use "trenches", "total", "side", "offense", or "defense" as an area value/);
  });

  it("WU4.6.4: prints the exact VALID TEAM CODES for this game, in NFL abbreviation casing", () => {
    const prompt = buildStageAInitialPrompt(FIXTURE_CHATGPT_ANALYSIS_GAME, FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET, CITABLE_LINES);
    expect(prompt).toContain("VALID TEAM CODES FOR THIS GAME");
    expect(prompt).toContain(`- ${FIXTURE_CHATGPT_ANALYSIS_GAME.homeTeam.toUpperCase()}`);
    expect(prompt).toContain(`- ${FIXTURE_CHATGPT_ANALYSIS_GAME.awayTeam.toUpperCase()}`);
  });
});

describe("buildStageBInitialPrompt (chatgpt)", () => {
  it("reveals the locked Stage A projection verbatim, the market for the first time, and forbids revising the projection", () => {
    const prompt = buildStageBInitialPrompt(FIXTURE_CHATGPT_ANALYSIS_GAME, FIXTURE_LOCKED_STAGE_A, FIXTURE_CHATGPT_ANALYSIS_CURRENT_MARKET);
    expect(prompt).toContain(FIXTURE_LOCKED_STAGE_A.footballThesis);
    expect(prompt).toContain(`HOME(${FIXTURE_CHATGPT_ANALYSIS_GAME.homeTeam})=${FIXTURE_CHATGPT_ANALYSIS_CURRENT_MARKET.spread.homeLine}`);
    expect(prompt).toContain(`AWAY(${FIXTURE_CHATGPT_ANALYSIS_GAME.awayTeam})=${FIXTURE_CHATGPT_ANALYSIS_CURRENT_MARKET.spread.awayLine}`);
    expect(prompt).toMatch(/may NOT revise/);
    expect(prompt).toMatch(/Do NOT include a `prediction`/);
  });
});

describe("buildStageAUpdatePrompt (chatgpt)", () => {
  it("carries forward the prior blind thesis/prediction and never mentions the market", () => {
    const prompt = buildStageAUpdatePrompt(FIXTURE_CHATGPT_ANALYSIS_GAME, FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET, FIXTURE_PREVIOUS_BLIND_STATE, CITABLE_LINES);
    expect(prompt).toContain(FIXTURE_PREVIOUS_BLIND_STATE.thesis!);
    expect(prompt).toContain("DELTA UPDATE");
    expect(prompt).not.toMatch(/"market":/);
  });

  it("permits and expects zero developments when nothing changed", () => {
    const prompt = buildStageAUpdatePrompt(FIXTURE_CHATGPT_ANALYSIS_GAME, FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET, FIXTURE_PREVIOUS_BLIND_STATE, []);
    expect(prompt).toMatch(/'No material change' is a fully valid result/);
  });
});

describe("runChatGptStageAInitial", () => {
  it("never sends a tools field -- no web_search, ever", async () => {
    const fetchImpl = fakeFetch(FIXTURE_STAGE_A_BASE);
    await runChatGptStageAInitial({ game: FIXTURE_CHATGPT_ANALYSIS_GAME, packet: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET, evidenceLines: CITABLE_LINES, apiKey: "fixture-key", fetchImpl });
    const [, requestInit] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(requestInit.body as string);
    expect(body).not.toHaveProperty("tools");
    expect(body.model).toBe("gpt-5.6-luna");
    expect(body.reasoning).toEqual({ effort: "medium" });
  });

  it("never sends any market pricing in the request body", async () => {
    const fetchImpl = fakeFetch(FIXTURE_STAGE_A_BASE);
    await runChatGptStageAInitial({ game: FIXTURE_CHATGPT_ANALYSIS_GAME, packet: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET, evidenceLines: CITABLE_LINES, apiKey: "fixture-key", fetchImpl });
    const [, requestInit] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(requestInit.body as string);
    const sentPrompt = body.input[0].content as string;
    expect(sentPrompt).not.toContain(`spread(home)=${FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET.market.spread.homeLine}`);
  });

  it("returns the raw parsed JSON payload and telemetry on success", async () => {
    const result = await runChatGptStageAInitial({ game: FIXTURE_CHATGPT_ANALYSIS_GAME, packet: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET, evidenceLines: CITABLE_LINES, apiKey: "fixture-key", fetchImpl: fakeFetch(FIXTURE_STAGE_A_BASE) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.raw).toHaveProperty("footballThesis");
    expect(result.telemetry.toolsEnabled).toBe(false);
    expect(result.telemetry.usage.inputTokens).toBeGreaterThan(0);
    expect(result.telemetry.costUsd).toBeNull();
  });

  it("fails closed on malformed (non-JSON) model output", async () => {
    const result = await runChatGptStageAInitial({ game: FIXTURE_CHATGPT_ANALYSIS_GAME, packet: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET, evidenceLines: CITABLE_LINES, apiKey: "fixture-key", fetchImpl: fakeFetch(FIXTURE_MALFORMED_ANALYSIS_RESPONSE) });
    expect(result.ok).toBe(false);
  });

  it("fails closed on a non-2xx HTTP response without retrying", async () => {
    const fetchImpl = fakeFetch({ error: "rate limited" }, 429);
    const result = await runChatGptStageAInitial({ game: FIXTURE_CHATGPT_ANALYSIS_GAME, packet: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET, evidenceLines: CITABLE_LINES, apiKey: "fixture-key", fetchImpl });
    expect(result.ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("runChatGptStageBInitial", () => {
  it("never sends a tools field", async () => {
    const fetchImpl = fakeFetch(FIXTURE_STAGE_A_BASE);
    await runChatGptStageBInitial({ game: FIXTURE_CHATGPT_ANALYSIS_GAME, lockedStageA: FIXTURE_LOCKED_STAGE_A, currentMarketState: FIXTURE_CHATGPT_ANALYSIS_CURRENT_MARKET, apiKey: "fixture-key", fetchImpl });
    const [, requestInit] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(requestInit.body as string);
    expect(body).not.toHaveProperty("tools");
  });

  it("uses a smaller token budget than Stage A", () => {
    const stageAConfig = resolveChatGptAnalysisConfig("stageAInitial");
    const stageBConfig = resolveChatGptAnalysisConfig("stageBInitial");
    expect(stageBConfig.maxOutputTokens).toBeLessThan(stageAConfig.maxOutputTokens);
  });
});

describe("runChatGptStageBUpdate", () => {
  it("never sends a tools field", async () => {
    const fetchImpl = fakeFetch(FIXTURE_STAGE_A_BASE);
    await runChatGptStageBUpdate({
      game: FIXTURE_CHATGPT_ANALYSIS_GAME,
      lockedFairSpread: FIXTURE_PREVIOUS_BLIND_STATE.fairSpread!,
      lockedProjectedTotal: FIXTURE_PREVIOUS_BLIND_STATE.projectedTotal!,
      marketRecord: FIXTURE_MARKET_RECORD_UNCHANGED,
      apiKey: "fixture-key",
      fetchImpl,
    });
    const [, requestInit] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(requestInit.body as string);
    expect(body).not.toHaveProperty("tools");
  });
});

/**
 * WU4.4.3 -- truncation-retry hardening. The first live --mode=update run
 * reached the correct prior opinion but hit HTTP 200 / status:"incomplete" /
 * incomplete_details.reason:"max_output_tokens" at the old 2500-token
 * ceiling. These tests cover both runChatGptStageAUpdate and
 * runChatGptStageAInitial against the shared retry policy implemented in
 * callChatGptAnalysis (nfl-chatgpt-analysis-adapter.ts). WU4.6 renamed the
 * exercised functions (Stage A initial/update) but the retry policy itself,
 * and its token budgets, are unchanged from WU4.4.3.
 */
describe("truncation-retry hardening (WU4.4.3)", () => {
  const updateInput = {
    game: FIXTURE_CHATGPT_ANALYSIS_GAME,
    packet: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET,
    previous: FIXTURE_PREVIOUS_BLIND_STATE,
    newEvidenceLines: CITABLE_LINES,
    apiKey: "fixture-key",
  };
  const initialInput = {
    game: FIXTURE_CHATGPT_ANALYSIS_GAME,
    packet: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET,
    evidenceLines: CITABLE_LINES,
    apiKey: "fixture-key",
  };

  it("1/2. update mode: a max_output_tokens-truncated first response triggers exactly one retry, using the mode's larger retryMaxOutputTokens budget", async () => {
    const fetchImpl = sequentialFakeFetch([truncatedAnalysisResponse(4000), FIXTURE_STAGE_A_BASE]);
    const result = await runChatGptStageAUpdate({ ...updateInput, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const secondCallBody = JSON.parse((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[1][1].body as string);
    expect(secondCallBody.max_output_tokens).toBe(6500); // stageAUpdate's retryMaxOutputTokens

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.telemetry.wasTruncationRetry).toBe(true);
    expect(result.telemetry.configuredMaxOutputTokens).toBe(4000);
    expect(result.telemetry.retryMaxOutputTokens).toBe(6500);
  });

  it("3. retry happens at most once -- if the retry attempt is ALSO truncated, it fails closed without a third request", async () => {
    const fetchImpl = sequentialFakeFetch([truncatedAnalysisResponse(4000), truncatedAnalysisResponse(6500)]);
    const result = await runChatGptStageAUpdate({ ...updateInput, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
    expect(result.telemetry?.wasTruncationRetry).toBe(true);
    expect(result.telemetry?.responseStatus).toBe("incomplete");
  });

  it("4. a completed (non-truncated) first response does not retry", async () => {
    const fetchImpl = sequentialFakeFetch([FIXTURE_STAGE_A_BASE, FIXTURE_STAGE_A_BASE]);
    const result = await runChatGptStageAUpdate({ ...updateInput, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.telemetry.wasTruncationRetry).toBe(false);
    expect(result.telemetry.firstAttempt).toBeNull();
  });

  it("5. a non-truncation incomplete reason (e.g. content_filter) does not retry", async () => {
    const fetchImpl = sequentialFakeFetch([incompleteNonTokenReasonAnalysisResponse(), FIXTURE_STAGE_A_BASE]);
    const result = await runChatGptStageAUpdate({ ...updateInput, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    expect(result.telemetry?.wasTruncationRetry).toBe(false);
    expect(result.telemetry?.incompleteReason).toBe("content_filter");
  });

  it("6. a well-formed, complete response that later fails downstream validation is never retried by this adapter", async () => {
    const fetchImpl = fakeFetch(FIXTURE_MALFORMED_ANALYSIS_RESPONSE);
    const result = await runChatGptStageAUpdate({ ...updateInput, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
  });

  it("7. the first (truncated) incomplete response never surfaces a `raw` payload -- nothing is built or persisted from it", async () => {
    const fetchImpl = sequentialFakeFetch([truncatedAnalysisResponse(4000), truncatedAnalysisResponse(6500)]);
    const result = await runChatGptStageAUpdate({ ...updateInput, fetchImpl });
    expect(result.ok).toBe(false);
    expect("raw" in result).toBe(false);
  });

  it("8. a successful retry produces exactly one accepted (ok:true) result carrying exactly one raw payload", async () => {
    const fetchImpl = sequentialFakeFetch([truncatedAnalysisResponse(4000), FIXTURE_STAGE_A_BASE]);
    const result = await runChatGptStageAUpdate({ ...updateInput, fetchImpl });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.raw).toBeTruthy();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("preserves the exact same prompt across the first attempt and the retry", async () => {
    const fetchImpl = sequentialFakeFetch([truncatedAnalysisResponse(4000), FIXTURE_STAGE_A_BASE]);
    await runChatGptStageAUpdate({ ...updateInput, fetchImpl });
    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const firstBody = JSON.parse(calls[0][1].body as string);
    const secondBody = JSON.parse(calls[1][1].body as string);
    expect(secondBody.input).toEqual(firstBody.input);
    expect(secondBody.reasoning).toEqual(firstBody.reasoning);
    expect(secondBody.max_output_tokens).not.toBe(firstBody.max_output_tokens);
  });

  it("10/initial mode: retains equivalent safe truncation-retry behavior with its own (larger) budgets", async () => {
    const fetchImpl = sequentialFakeFetch([truncatedAnalysisResponse(4500), FIXTURE_STAGE_A_BASE]);
    const result = await runChatGptStageAInitial({ ...initialInput, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const secondCallBody = JSON.parse((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[1][1].body as string);
    expect(secondCallBody.max_output_tokens).toBe(7000); // stageAInitial's retryMaxOutputTokens

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.telemetry.wasTruncationRetry).toBe(true);
    expect(result.telemetry.configuredMaxOutputTokens).toBe(4500);
    expect(result.telemetry.retryMaxOutputTokens).toBe(7000);
  });

  it("initial mode: a completed first response never retries", async () => {
    const fetchImpl = sequentialFakeFetch([FIXTURE_STAGE_A_BASE]);
    const result = await runChatGptStageAInitial({ ...initialInput, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.telemetry.wasTruncationRetry).toBe(false);
  });
});
