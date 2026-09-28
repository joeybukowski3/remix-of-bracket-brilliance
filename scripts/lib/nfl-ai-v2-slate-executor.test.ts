/**
 * AI Picks v2 automation -- slate execution. `runCommand` is always a fake: no
 * process is spawned and no Grok/OpenAI call is ever made. Ledger writes go to a
 * throwaway temp root.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runSlateV2 } from "../run-nfl-ai-handicap-v2-slate";
import type { CommandOutcome, CommandRunner } from "./nfl-ai-slate-executor";
import { attemptLedgerPath, readAttemptLedger } from "./nfl-ai-v2-attempt-ledger";
import { executeGamePlanV2 } from "./nfl-ai-v2-slate-executor";
import { planGameV2, planProviderV2, type V2GameFacts, type V2ProviderFacts } from "./nfl-ai-v2-slate-plan";
import { GAME_ID, NOW, gameFacts, market, providerFacts } from "./nfl-ai-v2-slate.fixtures";
import type { EvidenceModel } from "./nfl-evidence-types";

const GAMEDAY = new Date("2026-09-27T09:00:00.000Z");
const noEvidence = { exists: false, generatedAt: null, stageAEvidenceHash: null, count: 0 };
const staleEvidence = { exists: true, generatedAt: "2026-09-25T10:00:00.000Z", stageAEvidenceHash: "ev1", count: 5 };

interface Call {
  script: string;
  args: string[];
}

function fakeRunner(decide: (call: Call) => boolean = () => true): { runCommand: CommandRunner; calls: Call[] } {
  const calls: Call[] = [];
  const runCommand: CommandRunner = (command, args) => {
    const call = { script: args[1] ?? "", args: args.slice(2) };
    calls.push(call);
    const ok = decide(call);
    return { command, args, ok, exitCode: ok ? 0 : 1, stderr: ok ? "" : "Stage B FAILED validation", stdout: "" } satisfies CommandOutcome;
  };
  return { runCommand, calls };
}

const providerOf = (call: Call): EvidenceModel | null => (call.args.find((a) => a.startsWith("--provider="))?.slice(11) ?? (call.script.includes("grok") ? "grok" : call.script.includes("chatgpt") ? "chatgpt" : null)) as EvidenceModel | null;
const isHandicap = (call: Call) => call.script.endsWith("run-nfl-handicap-v2.ts");
const isResearch = (call: Call) => call.script.includes("-research.ts");
const isBootstrap = (call: Call) => call.script.includes("bootstrap-");
const modeOf = (call: Call) => call.args.find((a) => a.startsWith("--mode="))?.slice(7);

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "nfl-ai-v2-exec-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function run(game: V2GameFacts, providers: V2ProviderFacts[], runCommand: CommandRunner, extra: Partial<Parameters<typeof executeGamePlanV2>[3]> = {}) {
  const written: string[] = [];
  const result = executeGamePlanV2(game, providers, planGameV2(game, providers), {
    root,
    live: true,
    runCommand,
    ...extra,
    deps: { rebuildContext: () => ({ stage: "context", action: "rebuild", ran: true, ok: true, detail: "ok" }), presentationIsStale: () => true, writeGamePresentation: () => (written.push("x"), "/tmp/artifact.json"), ...extra.deps },
  });
  return { result, written };
}

describe("no-op", () => {
  it("makes zero provider calls and writes nothing for a game with no material change", () => {
    const { runCommand, calls } = fakeRunner();
    const { result, written } = run(gameFacts(), [providerFacts("grok"), providerFacts("chatgpt")], runCommand, { deps: { presentationIsStale: () => false } });
    expect(calls).toEqual([]);
    expect(written).toEqual([]);
    expect(result.ok).toBe(true);
    expect(readdirSync(root)).toEqual([]);
  });
});

describe("new game", () => {
  it("runs research, seeds the lineage, runs Stage A + B, then exports the presentation", () => {
    const { runCommand, calls } = fakeRunner();
    const fresh = providerFacts("grok", { evidence: noEvidence, record: null, hasSnapshotLineage: false });
    const { result, written } = run(gameFacts(), [fresh], runCommand, { deps: { regatherProviderFacts: () => providerFacts("grok", { record: null }) } });
    expect(calls.map((c) => (isResearch(c) ? `research:${modeOf(c)}` : isBootstrap(c) ? "bootstrap" : isHandicap(c) ? `handicap:${modeOf(c)}` : "?"))).toEqual(["research:initial", "bootstrap", "handicap:full"]);
    expect(written).toHaveLength(1);
    expect(result.ok).toBe(true);
  });
});

describe("football change", () => {
  it("reruns Stage A + B (full mode) and does not run research", () => {
    const { runCommand, calls } = fakeRunner();
    run(gameFacts({ footballContextHash: "ctx2" }), [providerFacts("grok")], runCommand);
    expect(calls).toHaveLength(1);
    expect(isHandicap(calls[0])).toBe(true);
    expect(modeOf(calls[0])).toBe("full");
  });
});

describe("market-only change", () => {
  it("runs the repricing mode only: one Stage B call, no research, no full pass", () => {
    const { runCommand, calls } = fakeRunner();
    run(gameFacts({ market: market(-6.5) }), [providerFacts("grok")], runCommand);
    expect(calls).toHaveLength(1);
    expect(isHandicap(calls[0])).toBe(true);
    expect(modeOf(calls[0])).toBe("repricing");
  });

  it("repricing on a key-number move is dispatched the same way", () => {
    const { runCommand, calls } = fakeRunner();
    run(gameFacts({ market: market(-7.5) }), [providerFacts("grok")], runCommand);
    expect(modeOf(calls[0])).toBe("repricing");
  });
});

describe("evidence change", () => {
  const stale = () => providerFacts("grok", { evidence: staleEvidence });

  it("gameday research that adds Stage A-visible evidence is followed by a full rerun", () => {
    const { runCommand, calls } = fakeRunner();
    run(gameFacts({ now: GAMEDAY }), [stale()], runCommand, { deps: { regatherProviderFacts: () => providerFacts("grok", { evidence: { ...staleEvidence, stageAEvidenceHash: "ev2", generatedAt: GAMEDAY.toISOString() } }) } });
    expect(calls.map((c) => (isResearch(c) ? "research" : isHandicap(c) ? modeOf(c) : "?"))).toEqual(["research", "full"]);
  });

  it("research that turns up nothing new costs the research call and no model handicap", () => {
    const { runCommand, calls } = fakeRunner();
    run(gameFacts({ now: GAMEDAY }), [stale()], runCommand, { deps: { regatherProviderFacts: () => providerFacts("grok", { evidence: { ...staleEvidence, generatedAt: GAMEDAY.toISOString() } }), presentationIsStale: () => false } });
    expect(calls.map((c) => (isResearch(c) ? "research" : "other"))).toEqual(["research"]);
  });

  it("research with no new evidence but a moved market only reprices Stage B", () => {
    const { runCommand, calls } = fakeRunner();
    run(gameFacts({ now: GAMEDAY, market: market(-6.5) }), [stale()], runCommand, { deps: { regatherProviderFacts: () => providerFacts("grok", { evidence: { ...staleEvidence, generatedAt: GAMEDAY.toISOString() } }) } });
    expect(calls.map((c) => (isResearch(c) ? "research" : modeOf(c)))).toEqual(["research", "repricing"]);
  });

  it("a failed research pass skips that provider's handicap but not the other provider", () => {
    const { runCommand, calls } = fakeRunner((c) => !(isResearch(c) && providerOf(c) === "grok"));
    const { result } = run(gameFacts({ now: GAMEDAY }), [stale(), providerFacts("chatgpt", { evidence: staleEvidence })], runCommand, { deps: { regatherProviderFacts: (p) => providerFacts(p, { evidence: { ...staleEvidence, stageAEvidenceHash: "ev2", generatedAt: GAMEDAY.toISOString() } }) } });
    expect(calls.some((c) => isHandicap(c) && providerOf(c) === "grok")).toBe(false);
    expect(calls.some((c) => isHandicap(c) && providerOf(c) === "chatgpt")).toBe(true);
    expect(result.failures.join(" ")).toMatch(/grok research/);
    expect(readAttemptLedger(root, 2026, 3, GAME_ID, "grok").research?.mode).toBe("update");
  });
});

describe("failure isolation", () => {
  it("one provider's failed handicap does not stop the other provider or the presentation", () => {
    const { runCommand, calls } = fakeRunner((c) => !(isHandicap(c) && providerOf(c) === "grok"));
    const game = gameFacts({ footballContextHash: "ctx2" });
    const { result, written } = run(game, [providerFacts("grok"), providerFacts("chatgpt")], runCommand);
    expect(calls.filter(isHandicap).map(providerOf)).toEqual(["grok", "chatgpt"]);
    expect(result.providers.find((p) => p.provider === "chatgpt")!.handicap.ok).toBe(true);
    expect(result.providers.find((p) => p.provider === "grok")!.handicap.ok).toBe(false);
    expect(result.ok).toBe(false);
    expect(written).toHaveLength(1);
  });

  it("records the failure so the next run does not repeat it on identical inputs, and clears it after a success", () => {
    const game = gameFacts({ footballContextHash: "ctx2" });
    const failing = fakeRunner(() => false);
    run(game, [providerFacts("grok")], failing.runCommand);
    const ledger = readAttemptLedger(root, 2026, 3, GAME_ID, "grok");
    expect(ledger.handicap?.action).toBe("football_update");

    const next = planProviderV2(game, providerFacts("grok", { ledger }));
    expect(next).toMatchObject({ action: "blocked", blockedKind: "failed_attempt" });

    const ok = fakeRunner();
    run(game, [providerFacts("grok", { ledger })], ok.runCommand, {});
    expect(ok.calls).toHaveLength(0); // still blocked: nothing retried automatically

    const forced = executeGamePlanV2(game, [providerFacts("grok", { ledger })], planGameV2(game, [providerFacts("grok", { ledger })], { retryFailed: true }), { root, live: true, retryFailed: true, runCommand: ok.runCommand, deps: { presentationIsStale: () => false } });
    expect(forced.ok).toBe(true);
    expect(readAttemptLedger(root, 2026, 3, GAME_ID, "grok").handicap).toBeUndefined();
  });

  it("a game that throws never stops the rest of the slate", () => {
    const good = gameFacts({ gameId: "2026_03_OK_GAME" });
    const goodProviders = [providerFacts("grok")];
    const entries = [
      // A plan that does not line up with its facts makes the executor itself throw.
      { facts: gameFacts(), providers: [providerFacts("grok")], plan: { gameId: GAME_ID, providers: {}, presentation: "skip" } as never },
      { facts: good, providers: goodProviders, plan: planGameV2(good, goodProviders) },
    ];
    const { runCommand } = fakeRunner();
    const { results } = runSlateV2({ root, season: 2026, live: true, entries, runCommand, deps: { presentationIsStale: () => false } });
    expect(results).toHaveLength(2);
    expect(results[0].ok).toBe(false);
    expect(results[0].failures[0]).toMatch(/unhandled/);
    expect(results[1].ok).toBe(true);
  });
});

describe("post-kickoff lock", () => {
  it("makes no provider call for a game that has kicked off, whatever changed", () => {
    const { runCommand, calls } = fakeRunner();
    const late = gameFacts({ now: new Date("2026-09-27T18:00:00.000Z"), footballContextHash: "ctx2", market: market(-3) });
    const { result } = run(late, [providerFacts("grok"), providerFacts("chatgpt", { record: null, evidence: noEvidence })], runCommand, { deps: { presentationIsStale: () => false } });
    expect(calls).toEqual([]);
    expect(result.providers.every((p) => p.plannedAction === "blocked")).toBe(true);
  });
});

describe("presentation export", () => {
  it("regenerates only this game's artifact after a successful change", () => {
    const { runCommand } = fakeRunner();
    const { written, result } = run(gameFacts({ market: market(-6.5) }), [providerFacts("grok")], runCommand);
    expect(written).toHaveLength(1);
    expect(result.presentation).toMatchObject({ action: "regenerate", ran: true, ok: true });
  });

  it("does not regenerate when every provider failed and the published artifact is already current", () => {
    const { runCommand } = fakeRunner(() => false);
    const { written, result } = run(gameFacts({ market: market(-6.5) }), [providerFacts("grok")], runCommand, { deps: { presentationIsStale: () => false } });
    expect(written).toEqual([]);
    expect(result.presentation.ran).toBe(false);
  });

  it("exports a lagging card with no model call", () => {
    const { runCommand, calls } = fakeRunner();
    const { written } = run(gameFacts(), [providerFacts("grok", { presentationStale: true })], runCommand);
    expect(calls).toEqual([]);
    expect(written).toHaveLength(1);
  });

  it("reports a failed export as a failure without throwing", () => {
    const { runCommand } = fakeRunner();
    const { result } = run(gameFacts({ market: market(-6.5) }), [providerFacts("grok")], runCommand, { deps: { writeGamePresentation: () => { throw new Error("disk full"); } } });
    expect(result.presentation.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/disk full/);
  });
});

describe("dry run", () => {
  it("performs zero paid calls and writes nothing", () => {
    const { runCommand, calls } = fakeRunner();
    const game = gameFacts({ footballContextHash: "ctx2" });
    const providers = [providerFacts("grok"), providerFacts("chatgpt", { evidence: noEvidence, record: null })];
    const { entries, results } = runSlateV2({ root, season: 2026, live: false, runCommand, entries: [{ facts: game, providers, plan: planGameV2(game, providers) }] });
    expect(calls).toEqual([]);
    expect(results).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(readdirSync(root)).toEqual([]);
  });
});

describe("existing state is never destroyed", () => {
  it("leaves v1 snapshots and stored records untouched; the only write is the failure ledger", () => {
    const dir = join(root, "data", "nfl", "analysis", "2026", "3", GAME_ID, "grok");
    mkdirSync(join(dir, "handicap-v2"), { recursive: true });
    writeFileSync(join(dir, "latest.json"), "v1-snapshot");
    writeFileSync(join(dir, "handicap-v2", "r.json"), "stored-record");
    const { runCommand } = fakeRunner(() => false);
    run(gameFacts({ market: market(-6.5) }), [providerFacts("grok")], runCommand);
    expect(readFileSync(join(dir, "latest.json"), "utf8")).toBe("v1-snapshot");
    expect(readFileSync(join(dir, "handicap-v2", "r.json"), "utf8")).toBe("stored-record");
    expect(readdirSync(dir).sort()).toEqual(["handicap-v2", "latest.json", "v2-attempts.json"]);
    expect(existsSync(attemptLedgerPath(root, 2026, 3, GAME_ID, "grok"))).toBe(true);
  });
});
