import { describe, expect, it, vi } from "vitest";
import {
  buildCitableEvidenceLines,
  buildStageAInitialPrompt,
  buildStageAUpdatePrompt,
  buildStageBInitialPrompt,
  buildStageBUpdatePrompt,
  runGrokStageAInitial,
  runGrokStageAUpdate,
  runGrokStageBInitial,
  runGrokStageBUpdate,
} from "./nfl-grok-analysis-adapter";
import { resolveGrokAnalysisConfig } from "./nfl-grok-analysis-config";
import { filterEvidenceRecordsForBlindStageA } from "./nfl-ai-context-sanitizer";
import { MATCHUP_FACTOR_AREAS } from "./nfl-grok-analysis-types";
import {
  FIXTURE_ANALYSIS_ALL_EVIDENCE_RECORDS,
  FIXTURE_ANALYSIS_CONTEXT_PACKET,
  FIXTURE_ANALYSIS_CURRENT_MARKET,
  FIXTURE_ANALYSIS_EVIDENCE_AUTHORITY,
  FIXTURE_ANALYSIS_GAME,
  FIXTURE_ANALYSIS_MARKET_COMMENTARY_RECORD,
  FIXTURE_LOCKED_STAGE_A,
  FIXTURE_MALFORMED_ANALYSIS_RESPONSE,
  FIXTURE_MARKET_RECORD_UNCHANGED,
  FIXTURE_PREVIOUS_BLIND_STATE,
  FIXTURE_STAGE_A_BASE,
} from "./__fixtures__/nfl-grok-analysis-fixtures";

function fakeFetch(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) }) as unknown as Response) as unknown as typeof fetch;
}

const ALL_RECORDS_WITH_MARKET_COMMENTARY = [...FIXTURE_ANALYSIS_ALL_EVIDENCE_RECORDS, FIXTURE_ANALYSIS_MARKET_COMMENTARY_RECORD];
const BLIND_RECORDS = filterEvidenceRecordsForBlindStageA(ALL_RECORDS_WITH_MARKET_COMMENTARY);
const BLIND_CITABLE_LINES = buildCitableEvidenceLines(BLIND_RECORDS, FIXTURE_ANALYSIS_EVIDENCE_AUTHORITY);

describe("buildCitableEvidenceLines", () => {
  it("excludes the chatgpt-model record and any rejected record -- Grok never sees what it cannot cite", () => {
    expect(BLIND_CITABLE_LINES.some((line) => line.includes("chatgpt"))).toBe(false);
    expect(BLIND_CITABLE_LINES.every((line) => !line.includes("verification=rejected"))).toBe(true);
  });
});

describe("buildStageAInitialPrompt", () => {
  it("6/7. includes underlying football data and citable Grok evidence, and forbids inventing values", () => {
    const prompt = buildStageAInitialPrompt(FIXTURE_ANALYSIS_GAME, FIXTURE_ANALYSIS_CONTEXT_PACKET, BLIND_CITABLE_LINES);
    expect(prompt).toContain("Indianapolis Colts");
    expect(prompt).toContain("Baltimore Ravens");
    expect(prompt).toContain("teamMetrics.epa");
    expect(prompt).toContain("jkbModels.powerRating");
    for (const line of BLIND_CITABLE_LINES) expect(prompt).toContain(line);
    expect(prompt).toContain("Do not invent injuries, quotes, market movement, trends, or player status");
  });

  it("1/2. never mentions or includes the sportsbook spread or total anywhere", () => {
    const prompt = buildStageAInitialPrompt(FIXTURE_ANALYSIS_GAME, FIXTURE_ANALYSIS_CONTEXT_PACKET, BLIND_CITABLE_LINES);
    const marketHomeLine = FIXTURE_ANALYSIS_CONTEXT_PACKET.market.spread.homeLine;
    const marketTotal = FIXTURE_ANALYSIS_CONTEXT_PACKET.market.total.line;
    expect(prompt).not.toContain(`spread(home)=${marketHomeLine}`);
    expect(prompt).not.toContain(`total=${marketTotal}`);
    expect(prompt).not.toMatch(/"market":/);
  });

  it("5. never exposes JKB's own projected spread/total or model-market edge", () => {
    const prompt = buildStageAInitialPrompt(FIXTURE_ANALYSIS_GAME, FIXTURE_ANALYSIS_CONTEXT_PACKET, BLIND_CITABLE_LINES);
    expect(prompt).not.toContain("jkbModels.projectedSpread");
    expect(prompt).not.toContain("jkbModels.projectedTotal");
    expect(prompt).not.toContain("jkbModels.modelMarketEdge");
    expect(prompt).not.toMatch(new RegExp(String(FIXTURE_ANALYSIS_CONTEXT_PACKET.jkbModels.projectedSpread.homeLine)));
  });

  it("never mentions the other model's pipeline (independence guard)", () => {
    const prompt = buildStageAInitialPrompt(FIXTURE_ANALYSIS_GAME, FIXTURE_ANALYSIS_CONTEXT_PACKET, BLIND_CITABLE_LINES);
    expect(prompt).not.toMatch(/chatgpt|openai/i);
  });

  it("requires the model to build its own independent fair spread and projected total, with no market comparison step at all", () => {
    const prompt = buildStageAInitialPrompt(FIXTURE_ANALYSIS_GAME, FIXTURE_ANALYSIS_CONTEXT_PACKET, BLIND_CITABLE_LINES);
    expect(prompt).toMatch(/STEP 2 -- INDEPENDENT FAIR SPREAD/);
    expect(prompt).toMatch(/STEP 3 -- INDEPENDENT PROJECTED TOTAL/);
    expect(prompt).not.toMatch(/STEP 4|STEP 5|MARKET COMPARISON|BETTING DECISION/);
    expect(prompt).toContain('"prediction"');
  });

  it("WU4.6.4: prints the exact VALID TEAM CODES for this game, in NFL abbreviation casing", () => {
    const prompt = buildStageAInitialPrompt(FIXTURE_ANALYSIS_GAME, FIXTURE_ANALYSIS_CONTEXT_PACKET, BLIND_CITABLE_LINES);
    expect(prompt).toContain("VALID TEAM CODES FOR THIS GAME");
    expect(prompt).toContain(`- ${FIXTURE_ANALYSIS_GAME.homeTeam.toUpperCase()}`);
    expect(prompt).toContain(`- ${FIXTURE_ANALYSIS_GAME.awayTeam.toUpperCase()}`);
  });

  it("WU4.6.4: prints the exact shared matchupFactors[].area enum and forbids 'trenches'", () => {
    const prompt = buildStageAInitialPrompt(FIXTURE_ANALYSIS_GAME, FIXTURE_ANALYSIS_CONTEXT_PACKET, BLIND_CITABLE_LINES);
    for (const area of MATCHUP_FACTOR_AREAS) expect(prompt).toContain(`"${area}"`);
    expect(prompt).toMatch(/Do NOT use "trenches"/);
  });
});

describe("buildStageBInitialPrompt", () => {
  it("reveals the locked Stage A projection verbatim and forbids revising it", () => {
    const prompt = buildStageBInitialPrompt(FIXTURE_ANALYSIS_GAME, FIXTURE_LOCKED_STAGE_A, FIXTURE_ANALYSIS_CURRENT_MARKET);
    expect(prompt).toContain(FIXTURE_LOCKED_STAGE_A.footballThesis);
    expect(prompt).toContain(JSON.stringify(FIXTURE_LOCKED_STAGE_A.prediction.fairSpread));
    expect(prompt).toMatch(/may NOT revise/);
    expect(prompt).toMatch(/Do NOT include a `prediction`/);
  });

  it("reveals the current market for the first time and asks for a bet/pass decision", () => {
    const prompt = buildStageBInitialPrompt(FIXTURE_ANALYSIS_GAME, FIXTURE_LOCKED_STAGE_A, FIXTURE_ANALYSIS_CURRENT_MARKET);
    expect(prompt).toContain(`spread(home)=${FIXTURE_ANALYSIS_CURRENT_MARKET.spread.homeLine}`);
    expect(prompt).toContain(`total=${FIXTURE_ANALYSIS_CURRENT_MARKET.total.line}`);
    expect(prompt).toMatch(/STEP 4 -- MARKET COMPARISON/);
    expect(prompt).toMatch(/STEP 5 -- BETTING DECISION/);
    expect(prompt).toMatch(/PASS is fully valid and expected/);
  });
});

describe("buildStageAUpdatePrompt", () => {
  it("carries forward the prior blind thesis/prediction and never mentions the market", () => {
    const prompt = buildStageAUpdatePrompt(FIXTURE_ANALYSIS_GAME, FIXTURE_ANALYSIS_CONTEXT_PACKET, FIXTURE_PREVIOUS_BLIND_STATE, BLIND_CITABLE_LINES);
    expect(prompt).toContain(FIXTURE_PREVIOUS_BLIND_STATE.thesis!);
    expect(prompt).toContain("DELTA UPDATE");
    expect(prompt).not.toMatch(/"market":/);
    expect(prompt).not.toContain(String(FIXTURE_ANALYSIS_CONTEXT_PACKET.market.spread.homeLine));
  });

  it("permits and expects zero developments when nothing changed", () => {
    const prompt = buildStageAUpdatePrompt(FIXTURE_ANALYSIS_GAME, FIXTURE_ANALYSIS_CONTEXT_PACKET, FIXTURE_PREVIOUS_BLIND_STATE, []);
    expect(prompt).toMatch(/'No material change' is a fully valid result/);
  });
});

describe("buildStageBUpdatePrompt", () => {
  it("reveals the locked (re-affirmed or revised) prediction for this update and the market delta", () => {
    const prompt = buildStageBUpdatePrompt(FIXTURE_ANALYSIS_GAME, FIXTURE_PREVIOUS_BLIND_STATE.fairSpread!, FIXTURE_PREVIOUS_BLIND_STATE.projectedTotal!, FIXTURE_MARKET_RECORD_UNCHANGED);
    expect(prompt).toContain(JSON.stringify(FIXTURE_PREVIOUS_BLIND_STATE.fairSpread));
    expect(prompt).toMatch(/spreadDelta=0/);
    expect(prompt).toMatch(/Do NOT include a `prediction`/);
  });
});

describe("runGrokStageAInitial", () => {
  it("never sends a tools field -- no web_search, ever", async () => {
    const fetchImpl = fakeFetch(FIXTURE_STAGE_A_BASE);
    await runGrokStageAInitial({ game: FIXTURE_ANALYSIS_GAME, packet: FIXTURE_ANALYSIS_CONTEXT_PACKET, evidenceLines: BLIND_CITABLE_LINES, apiKey: "fixture-key", fetchImpl });
    const [, requestInit] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(requestInit.body as string);
    expect(body).not.toHaveProperty("tools");
    expect(body.model).toBe("grok-4.6");
  });

  it("never sends any market pricing in the request body", async () => {
    const fetchImpl = fakeFetch(FIXTURE_STAGE_A_BASE);
    await runGrokStageAInitial({ game: FIXTURE_ANALYSIS_GAME, packet: FIXTURE_ANALYSIS_CONTEXT_PACKET, evidenceLines: BLIND_CITABLE_LINES, apiKey: "fixture-key", fetchImpl });
    const [, requestInit] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(requestInit.body as string);
    const sentPrompt = body.input[0].content as string;
    expect(sentPrompt).not.toContain(`spread(home)=${FIXTURE_ANALYSIS_CONTEXT_PACKET.market.spread.homeLine}`);
    expect(sentPrompt).not.toMatch(/"market":/);
  });

  it("returns the raw parsed JSON payload and telemetry on success", async () => {
    const result = await runGrokStageAInitial({ game: FIXTURE_ANALYSIS_GAME, packet: FIXTURE_ANALYSIS_CONTEXT_PACKET, evidenceLines: BLIND_CITABLE_LINES, apiKey: "fixture-key", fetchImpl: fakeFetch(FIXTURE_STAGE_A_BASE) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.raw).toHaveProperty("footballThesis");
    expect(result.telemetry.toolsEnabled).toBe(false);
  });

  it("fails closed on malformed (non-JSON) model output", async () => {
    const result = await runGrokStageAInitial({ game: FIXTURE_ANALYSIS_GAME, packet: FIXTURE_ANALYSIS_CONTEXT_PACKET, evidenceLines: BLIND_CITABLE_LINES, apiKey: "fixture-key", fetchImpl: fakeFetch(FIXTURE_MALFORMED_ANALYSIS_RESPONSE) });
    expect(result.ok).toBe(false);
  });

  it("fails closed on a non-2xx HTTP response without retrying", async () => {
    const fetchImpl = fakeFetch({ error: "rate limited" }, 429);
    const result = await runGrokStageAInitial({ game: FIXTURE_ANALYSIS_GAME, packet: FIXTURE_ANALYSIS_CONTEXT_PACKET, evidenceLines: BLIND_CITABLE_LINES, apiKey: "fixture-key", fetchImpl });
    expect(result.ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("runGrokStageBInitial", () => {
  it("never sends a tools field", async () => {
    const fetchImpl = fakeFetch(FIXTURE_STAGE_A_BASE);
    await runGrokStageBInitial({ game: FIXTURE_ANALYSIS_GAME, lockedStageA: FIXTURE_LOCKED_STAGE_A, currentMarketState: FIXTURE_ANALYSIS_CURRENT_MARKET, apiKey: "fixture-key", fetchImpl });
    const [, requestInit] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(requestInit.body as string);
    expect(body).not.toHaveProperty("tools");
  });

  it("uses a smaller token budget than Stage A (no matchupFactors/failureModes/prediction to produce)", () => {
    const stageAConfig = resolveGrokAnalysisConfig("stageAInitial");
    const stageBConfig = resolveGrokAnalysisConfig("stageBInitial");
    expect(stageBConfig.maxOutputTokens).toBeLessThan(stageAConfig.maxOutputTokens);
  });
});

describe("runGrokStageAUpdate / runGrokStageBUpdate", () => {
  it("Stage A update never sends a tools field or any market pricing", async () => {
    const fetchImpl = fakeFetch(FIXTURE_STAGE_A_BASE);
    await runGrokStageAUpdate({ game: FIXTURE_ANALYSIS_GAME, packet: FIXTURE_ANALYSIS_CONTEXT_PACKET, previous: FIXTURE_PREVIOUS_BLIND_STATE, newEvidenceLines: [], apiKey: "fixture-key", fetchImpl });
    const [, requestInit] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(requestInit.body as string);
    expect(body).not.toHaveProperty("tools");
    expect(body.input[0].content as string).not.toContain(`spread(home)=${FIXTURE_ANALYSIS_CONTEXT_PACKET.market.spread.homeLine}`);
  });

  it("Stage B update never sends a tools field", async () => {
    const fetchImpl = fakeFetch(FIXTURE_STAGE_A_BASE);
    await runGrokStageBUpdate({
      game: FIXTURE_ANALYSIS_GAME,
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

  it("uses each update stage's own (narrower) config", () => {
    const stageAUpdate = resolveGrokAnalysisConfig("stageAUpdate");
    const stageAInitial = resolveGrokAnalysisConfig("stageAInitial");
    expect(stageAUpdate.maxOutputTokens).toBeLessThan(stageAInitial.maxOutputTokens);
  });
});
