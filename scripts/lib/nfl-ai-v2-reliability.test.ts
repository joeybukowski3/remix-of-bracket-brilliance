/**
 * AI Picks v2 -- production-reliability hardening after the first live slate
 * (2026_04_PIT_CLE): a ChatGPT answer that cited a near-valid evidence id, a
 * Grok Stage B request that hit its client timeout, and failed paid attempts
 * that must be remembered without storing raw model output.
 *
 * No provider call is made: transports take an injected `fetchImpl`, the slate
 * executor takes a fake command runner, and ledger writes go to a temp root.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { filterEvidenceRecordsForBlindStageA, filterEvidenceRecordsForStageBV2 } from "./nfl-ai-context-sanitizer";
import { attemptLedgerPath, readAttemptLedger } from "./nfl-ai-v2-attempt-ledger";
import { classifyProviderError, formatFailureMarker, parseHandicapFailure, providerCallFailure, validationFailure } from "./nfl-ai-v2-failure";
import { executeGamePlanV2 as executeGamePlanV2Mode } from "./nfl-ai-v2-slate-executor";
import { handicapInputKey as handicapInputKeyMode, planGameV2 as planGameV2Mode, planProviderV2 as planProviderV2Mode } from "./nfl-ai-v2-slate-plan";
import { parseSlateV2Args } from "../run-nfl-ai-handicap-v2-slate";
import { GAME_ID, gameFacts, market, providerFacts } from "./nfl-ai-v2-slate.fixtures";
import type { CommandOutcome, CommandRunner } from "./nfl-ai-slate-executor";
import { buildCitableEvidenceLines as chatgptEvidenceLines, runChatGptHandicapV2Stage } from "./nfl-chatgpt-analysis-adapter";
import { resolveEvidenceAuthority } from "./nfl-evidence-store";
import type { EvidenceModel } from "./nfl-evidence-types";
import { buildCitableEvidenceLines as grokEvidenceLines, resolveGrokHandicapV2Config, runGrokHandicapV2Stage } from "./nfl-grok-analysis-adapter";
import { GROK_HANDICAP_V2_REQUEST_TIMEOUT_MS, resolveGrokAnalysisConfig } from "./nfl-grok-analysis-config";
import { buildEvidenceAliasMap } from "./nfl-handicap-v2-evidence-aliases";
import { EVIDENCE_REF_RULES, buildStageAV2Prompt, buildStageBV2Prompt } from "./nfl-handicap-v2-prompts";
import { HANDICAP_V2_OUTPUT_TOKENS } from "./nfl-handicap-v2-types";
import { validateStageAV2, validateStageBV2, type StageAV2ValidationContext, type StageBV2ValidationContext } from "./nfl-handicap-v2-validator";
import { V2_CONTEXT_HASH, V2_EVIDENCE, V2_FACT_REFS, V2_GAME, V2_GAME_ID, V2_MARKET_MINUS_7, V2_PACKET, V2_STAGE_A_TIME, V2_STAGE_B_TIME, stageARaw, stageBRaw, trustedStageA } from "./__fixtures__/nfl-handicap-v2-fixtures";

// These cases pin the LIVE-research lifecycle (research passes, cadence, backoff, evidence change). The planner/executor default is
// now "site-only", so they request live explicitly -- which is also what proves live mode is preserved.
const planGameV2: typeof planGameV2Mode = (game, providers, opts = {}) => planGameV2Mode(game, providers, { researchMode: "live", ...opts });
const planProviderV2: typeof planProviderV2Mode = (game, facts, opts = {}) => planProviderV2Mode(game, facts, { researchMode: "live", ...opts });
const handicapInputKey: typeof handicapInputKeyMode = (action, game, facts, mode = "live") => handicapInputKeyMode(action, game, facts, mode);
const executeGamePlanV2: typeof executeGamePlanV2Mode = (game, providerFacts, plan, options) => executeGamePlanV2Mode(game, providerFacts, plan, { researchMode: "live", ...options });

const PROVIDERS: EvidenceModel[] = ["grok", "chatgpt"];
const RAW_CANARY = "RAW_MODEL_OUTPUT_CANARY_must_never_be_stored";

function stageACtx(model: EvidenceModel, records = V2_EVIDENCE[model].all): StageAV2ValidationContext {
  return { model, gameId: V2_GAME_ID, generatedAt: V2_STAGE_A_TIME, contextHash: V2_CONTEXT_HASH, homeTeam: "buf", awayTeam: "lac", contextPacket: V2_PACKET, allEvidenceRecords: records };
}

function stageBCtx(model: EvidenceModel): StageBV2ValidationContext {
  return { model, gameId: V2_GAME_ID, generatedAt: V2_STAGE_B_TIME, contextHash: V2_CONTEXT_HASH, game: V2_GAME, lockedStageA: trustedStageA(model), market: V2_MARKET_MINUS_7, contextPacket: V2_PACKET, allEvidenceRecords: V2_EVIDENCE[model].all };
}

function evidenceLines(model: EvidenceModel, records = V2_EVIDENCE[model].all): string[] {
  return (model === "grok" ? grokEvidenceLines : chatgptEvidenceLines)(records, resolveEvidenceAuthority(V2_EVIDENCE[model].all));
}

/** The real id with its last character dropped: the exact failure mode of the production run (a 15-hex id where 16 are required). */
const nearValid = (id: string): string => id.slice(0, -1);

describe("1. evidence refs: the canonical validator stays strict; the model cites short aliases", () => {
  describe.each(PROVIDERS)("(%s)", (model) => {
    const injuryId = () => V2_EVIDENCE[model].injury.evidenceId;
    const withDriverRefs = (evidenceRefs: string[]) => {
      const raw = stageARaw(model) as { keyDrivers: Array<Record<string, unknown>> };
      return { ...raw, keyDrivers: [raw.keyDrivers[0], raw.keyDrivers[1], { ...raw.keyDrivers[2], evidenceRefs }] };
    };

    it("rejects a near-valid evidence id in Stage A and does not repair or strip it", () => {
      const bad = nearValid(injuryId());
      expect(bad).not.toBe(injuryId());
      const result = validateStageAV2(withDriverRefs([bad]), stageACtx(model));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reasons.join(" | ")).toContain(`cites evidenceId "${bad}" which does not exist in the supplied`);
      // the failed result carries no analysis at all -- nothing was silently corrected into something publishable
      expect(result).not.toHaveProperty("analysis");
    });

    it("rejects a near-valid evidence id in the Stage B write-up refs", () => {
      const result = validateStageBV2({ ...stageBRaw(model), evidenceRefsUsed: [nearValid(injuryId())] }, stageBCtx(model));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reasons.join(" | ")).toMatch(/does not exist in the supplied/);
    });

    it("accepts the exact supplied id", () => {
      const result = validateStageAV2(withDriverRefs([injuryId()]), stageACtx(model));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.analysis.keyDrivers[2].evidenceRefs).toEqual([injuryId()]);
    });

    it("does not require any evidence when every driver rests on deterministic factRefs", () => {
      const raw = stageARaw(model) as { keyDrivers: Array<Record<string, unknown>> };
      const factOnly = {
        ...raw,
        keyDrivers: [
          { ...raw.keyDrivers[0], evidenceRefs: [] },
          { ...raw.keyDrivers[1], evidenceRefs: [] },
          { summary: raw.keyDrivers[2].summary, factRefs: [V2_FACT_REFS.bufPoints], evidenceRefs: [] },
        ],
      };
      expect(validateStageAV2(factOnly, stageACtx(model)).ok).toBe(true);
      // ...and with no evidence record in the world at all
      expect(validateStageAV2(factOnly, stageACtx(model, [])).ok).toBe(true);
    });

    it("still requires SOME tie to the data: a driver with neither factRefs nor evidenceRefs fails", () => {
      const raw = stageARaw(model) as { keyDrivers: Array<Record<string, unknown>> };
      const result = validateStageAV2({ ...raw, keyDrivers: [raw.keyDrivers[0], raw.keyDrivers[1], { ...raw.keyDrivers[2], factRefs: [], evidenceRefs: [] }] }, stageACtx(model));
      expect(result.ok).toBe(false);
    });

    // The model-facing evidence is aliased (E1..); the validator-level tests above and the alias suite (nfl-ai-v2-evidence-aliases.test.ts) cover the mapping itself.
    const aliases = () => buildEvidenceAliasMap(V2_EVIDENCE[model].all, model);
    const stageA = () => buildStageAV2Prompt({ provider: model, game: V2_GAME, packet: V2_PACKET, evidenceLines: evidenceLines(model, filterEvidenceRecordsForBlindStageA(V2_EVIDENCE[model].all)), evidenceAliases: aliases() });
    const stageB = () => buildStageBV2Prompt({ provider: model, game: V2_GAME, packet: V2_PACKET, lockedStageA: trustedStageA(model), market: V2_MARKET_MINUS_7, evidenceLines: evidenceLines(model, filterEvidenceRecordsForStageBV2(V2_EVIDENCE[model].all)), evidenceAliases: aliases() });

    it.each([["Stage A", stageA], ["Stage B", stageB]])("%s prompt tells the model to cite only the printed short references, smallest set, [] when unsupported", (_name, build) => {
      const prompt = build();
      for (const rule of EVIDENCE_REF_RULES) expect(prompt).toContain(rule);
      expect(prompt).toMatch(/only the short references \(E1, E2, \.\.\.\) printed in the evidence list, exactly as printed/);
      expect(prompt).toMatch(/Never invent, combine, renumber or extend a reference/);
      expect(prompt).toMatch(/smallest set of evidence records/);
      expect(prompt).toMatch(/leave evidenceRefs \/ evidenceRefsUsed empty \(\[\]\)/);
    });

    it.each([["Stage A", stageA], ["Stage B", stageB]])("%s prompt never shows an opaque canonical evidence id, so none has to be copied", (_name, build) => {
      const prompt = build();
      for (const record of V2_EVIDENCE[model].all) expect(prompt).not.toContain(record.evidenceId);
      expect(prompt).not.toMatch(new RegExp(`${model}-\\d{4}_\\d{2}_[A-Z]{3}_[A-Z]{3}-[0-9a-f]`));
      expect(prompt).not.toMatch(/ab12\.\.\./);
    });

    it("tells the model every evidence array must be empty when no evidence exists", () => {
      const prompt = buildStageAV2Prompt({ provider: model, game: V2_GAME, packet: V2_PACKET, evidenceLines: [], evidenceAliases: buildEvidenceAliasMap([], model) });
      expect(prompt).toMatch(/no citable evidence available/);
      expect(prompt).toMatch(/every evidenceRefs \/ evidenceRefsUsed array must be empty/);
      expect(prompt).not.toContain("Cite evidence ONLY by its short reference");
    });
  });

  it("refuses to build a prompt whose evidence line does not begin with its id (a record the model could see but not cite)", () => {
    expect(() => buildStageAV2Prompt({ provider: "grok", game: V2_GAME, packet: V2_PACKET, evidenceLines: ["no bracketed id here"], evidenceAliases: buildEvidenceAliasMap([], "grok") })).toThrow(/bracketed evidenceId/);
  });

  it("refuses to build a prompt that shows a record the alias map does not contain", () => {
    expect(() => buildStageAV2Prompt({ provider: "grok", game: V2_GAME, packet: V2_PACKET, evidenceLines: evidenceLines("grok"), evidenceAliases: buildEvidenceAliasMap([], "grok") })).toThrow(/has no alias/);
  });
});

describe("2. Grok stage timeouts and abort reporting", () => {
  /** A fetch that never answers on its own and rejects exactly as undici does when its signal aborts. */
  function hangingFetch(): { fetchImpl: typeof fetch; calls: () => number } {
    let calls = 0;
    const fetchImpl = ((_url: string, init: { signal: AbortSignal }) => {
      calls += 1;
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new DOMException("This operation was aborted", "AbortError")));
      });
    }) as unknown as typeof fetch;
    return { fetchImpl, calls: () => calls };
  }

  afterEach(() => vi.useRealTimers());

  it("gives the v2 Stage B the same 180s ceiling as Stage A, sized for its 5,000-token write-up", () => {
    expect(GROK_HANDICAP_V2_REQUEST_TIMEOUT_MS).toEqual({ A: 180_000, B: 180_000 });
    expect(resolveGrokHandicapV2Config("B")).toMatchObject({ requestTimeoutMs: 180_000, maxOutputTokens: HANDICAP_V2_OUTPUT_TOKENS.B.first });
    expect(resolveGrokHandicapV2Config("A")).toMatchObject({ requestTimeoutMs: 180_000, maxOutputTokens: HANDICAP_V2_OUTPUT_TOKENS.A.first });
  });

  it("leaves the v1 Stage B timeout, and every other Grok mode, exactly as it was", () => {
    expect(resolveGrokAnalysisConfig("stageBInitial").requestTimeoutMs).toBe(120_000);
    expect(resolveGrokAnalysisConfig("stageBUpdate").requestTimeoutMs).toBe(120_000);
    expect(resolveGrokAnalysisConfig("stageAInitial").requestTimeoutMs).toBe(180_000);
    expect(resolveGrokAnalysisConfig("stageAUpdate").requestTimeoutMs).toBe(150_000);
  });

  it("reports OUR client timeout as a timeout, makes exactly one request, and never retries", async () => {
    const { fetchImpl, calls } = hangingFetch();
    const result = await runGrokHandicapV2Stage({ stage: "B", prompt: "P", apiKey: "k", fetchImpl, requestTimeoutMs: 20 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/^Request to xAI \/v1\/responses timed out: client timeout: no complete response within 20ms \(stageBInitial, aborted after \d+ms\)$/);
    expect(result.error).not.toMatch(/This operation was aborted/);
    expect(classifyProviderError(result.error)).toBe("transport_timeout");
    expect(result.telemetry?.latencyMs).toBeGreaterThanOrEqual(15);
    expect(calls()).toBe(1);
  });

  it("keeps a non-timeout network failure distinguishable from a timeout", async () => {
    const fetchImpl = (async () => {
      throw new Error("fetch failed");
    }) as unknown as typeof fetch;
    const result = await runGrokHandicapV2Stage({ stage: "B", prompt: "P", apiKey: "k", fetchImpl });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Request to xAI /v1/responses failed: fetch failed");
    expect(classifyProviderError(result.error)).toBe("transport_error");
  });

  it("applies the ChatGPT stage timeout the same way (one request, classified as a timeout)", async () => {
    vi.useFakeTimers();
    const { fetchImpl, calls } = hangingFetch();
    const pending = runChatGptHandicapV2Stage({ stage: "B", prompt: "P", apiKey: "k", fetchImpl });
    await vi.advanceTimersByTimeAsync(120_001);
    const result = await pending;
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/^Request to OpenAI \/v1\/responses timed out: client timeout: no complete response within 120000ms/);
    expect(classifyProviderError(result.error)).toBe("transport_timeout");
    expect(calls()).toBe(1);
  });
});

describe("3. failure classification is structured and never carries raw model output", () => {
  it.each([
    ["Request to xAI /v1/responses timed out: client timeout: no complete response within 180000ms (stageBInitial, aborted after 180004ms)", "transport_timeout"],
    ["Request to OpenAI /v1/responses failed: fetch failed", "transport_error"],
    ["HTTP 504 from xAI /v1/responses: upstream request timed out", "provider_http"],
    ["HTTP 429 from OpenAI /v1/responses: rate limited", "provider_http"],
    ["No final message text found in xAI /v1/responses output.", "provider_output"],
    ["Failed to parse analysis JSON: Unexpected token", "provider_output"],
    ["OpenAI /v1/responses returned an incomplete response (reason: max_output_tokens, wasTruncationRetry=true).", "provider_output"],
    ["something nobody anticipated", "unknown"],
  ])("classifies %j as %s", (error, kind) => {
    expect(classifyProviderError(error)).toBe(kind);
  });

  it("round-trips a failure through the stderr marker", () => {
    const failure = providerCallFailure("B", "Request to xAI /v1/responses timed out: client timeout: no complete response within 180000ms");
    const stderr = ["Stage B FAILED: ...", formatFailureMarker(failure), "Raw Stage B output: {}"].join("\n");
    expect(parseHandicapFailure(stderr)).toEqual(failure);
    expect(failure).toMatchObject({ kind: "transport_timeout", stage: "B" });
  });

  it("falls back to 'unknown' and cuts everything from the raw-output section when there is no marker", () => {
    const parsed = parseHandicapFailure(`Stage A FAILED validation:\n  - some reason\nRaw Stage A output: {"x":"${RAW_CANARY}"}`);
    expect(parsed.kind).toBe("unknown");
    expect(parsed.summary).toContain("some reason");
    expect(parsed.summary).not.toContain(RAW_CANARY);
  });

  it("treats a garbled marker like a missing one", () => {
    const parsed = parseHandicapFailure(`V2_HANDICAP_FAILURE {not json\nRaw Stage B output: ${RAW_CANARY}`);
    expect(parsed.kind).toBe("unknown");
    expect(parsed.summary).not.toContain(RAW_CANARY);
  });

  it("bounds the summary", () => {
    expect(validationFailure("A", ["x".repeat(5_000)]).summary.length).toBeLessThan(700);
  });
});

describe("4. attempt ledger: both failure types are recorded, blocked on identical inputs, and free of raw output", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "nfl-ai-v2-reliability-"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const noEvidence = { exists: false, generatedAt: null, stageAEvidenceHash: null, count: 0 };
  const ok = (command: string, args: string[]): CommandOutcome => ({ command, args, ok: true, exitCode: 0, stderr: "", stdout: "" });

  /** The two PIT-CLE failures: Grok Stage B aborted, ChatGPT Stage A cited a bad id. Research succeeds for both. */
  function runProductionFailures(): ReturnType<typeof executeGamePlanV2> {
    const grokStderr = [formatFailureMarker(providerCallFailure("B", "Request to xAI /v1/responses timed out: client timeout: no complete response within 120000ms (stageBInitial, aborted after 120003ms)")), `Stage B FAILED: ... ${RAW_CANARY}`].join("\n");
    const chatgptStderr = [formatFailureMarker(validationFailure("A", ['keyDrivers[1] evidenceRefs cites evidenceId "chatgpt-2026_04_PIT_CLE-3d7eaa2d634cbf7" which does not exist in the supplied ChatGPT evidence set'])), "Stage A FAILED validation:", `Raw Stage A output: {"keyDrivers":"${RAW_CANARY}"}`].join("\n");
    const runCommand: CommandRunner = (command, args) => {
      const script = args[1] ?? "";
      if (!script.endsWith("run-nfl-handicap-v2.ts")) return ok(command, args);
      const provider = args.find((a) => a.startsWith("--provider="));
      return { command, args, ok: false, exitCode: 1, stderr: provider === "--provider=grok" ? grokStderr : chatgptStderr, stdout: "" };
    };
    const fresh = (p: EvidenceModel) => providerFacts(p, { evidence: noEvidence, record: null, hasSnapshotLineage: false });
    const game = gameFacts();
    const providers = [fresh("grok"), fresh("chatgpt")];
    return executeGamePlanV2(game, providers, planGameV2(game, providers), {
      root,
      live: true,
      runCommand,
      deps: { rebuildContext: () => ({ stage: "context", action: "rebuild", ran: true, ok: true, detail: "ok" }), regatherProviderFacts: (p) => providerFacts(p, { record: null }), presentationIsStale: () => false },
    });
  }

  it("records a Grok transport timeout and a ChatGPT validation failure as different kinds, with stage and safe text", () => {
    runProductionFailures();
    const grok = readAttemptLedger(root, 2026, 3, GAME_ID, "grok");
    const chatgpt = readAttemptLedger(root, 2026, 3, GAME_ID, "chatgpt");
    expect(grok.research).toBeUndefined();
    expect(chatgpt.research).toBeUndefined();
    expect(grok.handicap).toMatchObject({ action: "handicap_initial", kind: "transport_timeout", stage: "B" });
    expect(grok.handicap?.error).toMatch(/timed out: client timeout/);
    expect(chatgpt.handicap).toMatchObject({ action: "handicap_initial", kind: "validation", stage: "A" });
    expect(chatgpt.handicap?.error).toContain("chatgpt-2026_04_PIT_CLE-3d7eaa2d634cbf7");
  });

  it("never writes raw model output to the ledger file or into the run's failure text", () => {
    const result = runProductionFailures();
    for (const provider of PROVIDERS) expect(readFileSync(attemptLedgerPath(root, 2026, 3, GAME_ID, provider), "utf8")).not.toContain(RAW_CANARY);
    expect(result.failures.join("\n")).not.toContain(RAW_CANARY);
    expect(result.ok).toBe(false);
    expect(result.failures).toHaveLength(2);
  });

  it("blocks an identical paid retry on the next run, and allows one only after a real input change or --retry-failed", () => {
    runProductionFailures();
    for (const provider of PROVIDERS) {
      const ledger = readAttemptLedger(root, 2026, 3, GAME_ID, provider);
      const facts = providerFacts(provider, { record: null, ledger });
      const same = planProviderV2(gameFacts(), facts);
      expect(same).toMatchObject({ action: "blocked", blockedKind: "failed_attempt", handicap: "none", research: "none" });
      expect(same.reasons.join(" ")).toMatch(/not retried automatically/);
      // a moved line is a real input change: one new bounded attempt is allowed
      expect(planProviderV2(gameFacts({ market: market(-6.5) }), facts)).toMatchObject({ action: "handicap_initial", handicap: "initial" });
      expect(planProviderV2(gameFacts(), facts, { retryFailed: true })).toMatchObject({ action: "handicap_initial", handicap: "initial" });
    }
  });

  it("does not re-buy research on the next run: evidence exists, so only the (blocked) handicap is considered", () => {
    runProductionFailures();
    const ledger = readAttemptLedger(root, 2026, 3, GAME_ID, "grok");
    expect(planProviderV2(gameFacts(), providerFacts("grok", { record: null, ledger })).research).toBe("none");
  });
});

describe("5-7. manual retry control at the planner: PIT-CLE shape (Grok succeeded, ChatGPT failed Stage A)", () => {
  const noEvidenceChange = { exists: true, generatedAt: "2026-09-25T10:00:00.000Z", stageAEvidenceHash: "ev1", count: 12 };

  /** Grok has its record and no failure; ChatGPT has evidence, no record, and a failed Stage A attempt recorded on exactly today's inputs. */
  function pitCleFacts() {
    const game = gameFacts();
    const chatgptKey = handicapInputKey("handicap_initial", game, providerFacts("chatgpt", { record: null, evidence: noEvidenceChange }));
    const failed = { failedAt: "2026-10-01T19:39:53.558Z", action: "handicap_initial", inputKey: chatgptKey, kind: "validation", stage: "A" as const, error: "Stage A validation failed: bad evidence reference" };
    return { game, grok: providerFacts("grok", { evidence: noEvidenceChange }), chatgpt: providerFacts("chatgpt", { record: null, evidence: noEvidenceChange, ledger: { handicap: failed } }) };
  }

  it("5. by default the failed attempt blocks an identical paid retry, and Grok needs nothing", () => {
    const { game, grok, chatgpt } = pitCleFacts();
    const plan = planGameV2(game, [grok, chatgpt]);
    expect(plan.providers.chatgpt).toMatchObject({ action: "blocked", blockedKind: "failed_attempt", handicap: "none", research: "none" });
    expect(plan.providers.chatgpt.reasons.join(" ")).toMatch(/not retried automatically/);
    expect(plan.providers.grok.action).toBe("none");
  });

  it("6. ChatGPT becomes runnable only when the explicit retry flag is supplied -- one Stage A + B attempt, no research", () => {
    const { game, grok, chatgpt } = pitCleFacts();
    expect(planProviderV2(game, chatgpt).action).toBe("blocked");
    const retried = planProviderV2(game, chatgpt, { retryFailed: true });
    expect(retried).toMatchObject({ action: "handicap_initial", handicap: "initial", research: "none" });
    expect(planGameV2(game, [grok, chatgpt], { retryFailed: true }).providers.chatgpt.action).toBe("handicap_initial");
  });

  it("7. Grok stays 'none' and is not rerun, with or without the flag", () => {
    const { game, grok, chatgpt } = pitCleFacts();
    for (const opts of [{}, { retryFailed: true }]) {
      expect(planGameV2(game, [grok, chatgpt], opts).providers.grok).toMatchObject({ action: "none", handicap: "none", research: "none" });
    }
  });

  it("the flag does not delete or bypass the ledger: the failure stays on file and a changed line is still the only other way through", () => {
    const { game, chatgpt } = pitCleFacts();
    planProviderV2(game, chatgpt, { retryFailed: true });
    expect(chatgpt.ledger.handicap?.kind).toBe("validation");
    expect(planProviderV2(game, chatgpt).action).toBe("blocked");
  });

  it("the CLI flag is off unless --retry-failed is given", () => {
    expect(parseSlateV2Args(["--game=2026_04_PIT_CLE"]).retryFailed).toBe(false);
    expect(parseSlateV2Args(["--game=2026_04_PIT_CLE", "--retry-failed"]).retryFailed).toBe(true);
  });
});
