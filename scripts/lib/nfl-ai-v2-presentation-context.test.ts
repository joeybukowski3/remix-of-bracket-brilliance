/**
 * AI Picks v2 -- fresh-CI-checkout regression for the presentation stage.
 *
 * Production (2026_04_NE_BUF, first site-only run): Stage A/B succeeded and the v2 record was persisted, but the
 * presentation failed with "No deterministic game-context artifact at data/nfl/game-context/2026/4/2026_04_NE_BUF.json".
 * That file is reconstructable scratch state (never committed), so a fresh checkout has none; the handicap CLI builds its
 * packet in memory so it never noticed, and in site-only mode nothing else rebuilt it before the exporter read it.
 *
 * No provider call is made: the command runner is a fake, and the game-context reconstruction is injected (it writes the
 * same file the real rebuild does). The exporter, the planner and the record I/O are the real ones.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nflAiHandicapArtifactPath } from "../../src/lib/nfl/aiHandicapPresentation";
import type { CommandOutcome, CommandRunner } from "./nfl-ai-slate-executor";
import { gameContextArtifactPath } from "./nfl-game-context-preflight";
import { V2_COMMIT_PATHSPECS } from "./nfl-ai-v2-persisted-state";
import { executeGamePlanV2 } from "./nfl-ai-v2-slate-executor";
import { applyJobLimit, planGameV2, planProviderV2 } from "./nfl-ai-v2-slate-plan";
import { gameFacts, providerFacts } from "./nfl-ai-v2-slate.fixtures";
import type { EvidenceModel } from "./nfl-evidence-types";
import { buildHandicapV2Record, writeHandicapV2Record } from "./nfl-handicap-v2-record";
import type { HandicapV2Record } from "./nfl-handicap-v2-types";
import { validateStageAV2, validateStageBV2 } from "./nfl-handicap-v2-validator";
import { V2_CONTEXT_HASH, V2_GAME, V2_GAME_ID, V2_MARKET_MINUS_7, V2_PACKET, V2_STAGE_A_TIME, V2_STAGE_B_TIME, stageARaw, stageBRaw, trustedStageA } from "./__fixtures__/nfl-handicap-v2-fixtures";

const GAME_ID = "2026_04_NE_BUF";
const SEASON = 2026;
const WEEK = 4;
const KICKOFF = "2026-10-04T17:00:00.000Z";
const NOW = new Date("2026-10-03T12:00:00.000Z");

/** A genuinely valid site-only record for NE @ BUF, built the way the runner builds one. */
function validRecord(model: EvidenceModel): HandicapV2Record {
  const a = validateStageAV2(stageARaw(model), { model, gameId: V2_GAME_ID, generatedAt: V2_STAGE_A_TIME, contextHash: V2_CONTEXT_HASH, homeTeam: "buf", awayTeam: "lac", contextPacket: V2_PACKET, allEvidenceRecords: [] });
  const stageA = a.ok ? a.analysis : trustedStageA(model);
  const b = validateStageBV2(stageBRaw(model, { injuryParagraph: null, evidenceRefs: [] }), { model, gameId: V2_GAME_ID, generatedAt: V2_STAGE_B_TIME, contextHash: V2_CONTEXT_HASH, game: V2_GAME, lockedStageA: stageA, market: V2_MARKET_MINUS_7, contextPacket: V2_PACKET, allEvidenceRecords: [] });
  if (!b.ok) throw new Error(b.reasons.join(" | "));
  return { ...buildHandicapV2Record({ stageA, stageB: b.analysis, market: V2_MARKET_MINUS_7, evidenceRecords: [], researchMode: "site-only" }), gameId: GAME_ID };
}

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "nfl-ai-v2-pres-ctx-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const contextPath = () => gameContextArtifactPath(root, SEASON, WEEK, GAME_ID);
const artifactPath = () => join(root, "public", nflAiHandicapArtifactPath(SEASON, GAME_ID));

/** What the real rebuild produces, as far as the exporter reads it: identity + kickoff. Counts calls and records the order of events. */
function fakeReconstruction(events: string[], ok = true) {
  const state = { calls: 0 };
  const ensureGameContext = (): { ok: true } | { ok: false; reason: string } => {
    state.calls += 1;
    events.push("ensure-context");
    if (!ok) return { ok: false, reason: "Refusing to persist: kickoff has already passed" };
    mkdirSync(dirname(contextPath()), { recursive: true });
    writeFileSync(contextPath(), JSON.stringify({ identity: { homeTeam: "buf", awayTeam: "ne" }, schedule: { kickoffUtc: KICKOFF } }));
    return { ok: true };
  };
  return { state, ensureGameContext };
}

function fakeRunner(events: string[], onHandicap?: (args: string[]) => void): { runCommand: CommandRunner; calls: string[][] } {
  const calls: string[][] = [];
  const runCommand: CommandRunner = (command, args) => {
    calls.push(args);
    events.push(`run:${args[1]?.split("/").pop()}`);
    onHandicap?.(args);
    return { command, args, ok: true, exitCode: 0, stderr: "", stdout: "" } satisfies CommandOutcome;
  };
  return { runCommand, calls };
}

/** The game as the planner sees it when nothing about the stored record's inputs has moved (same football context hash, same market). */
const game = (over = {}) => gameFacts({ gameId: GAME_ID, week: WEEK, kickoffUtc: KICKOFF, now: NOW, footballContextHash: V2_CONTEXT_HASH, market: V2_MARKET_MINUS_7, ...over });

describe("fresh checkout: persisted v2 record, no data/nfl/game-context/**", () => {
  it("rebuilds the deterministic context, publishes the presentation, and makes NO handicap/provider call", () => {
    const record = validRecord("grok");
    writeHandicapV2Record(root, SEASON, WEEK, record);
    expect(existsSync(contextPath())).toBe(false);
    expect(existsSync(artifactPath())).toBe(false);

    const events: string[] = [];
    const { runCommand, calls } = fakeRunner(events);
    const { state, ensureGameContext } = fakeReconstruction(events);
    const g = game();
    // the planner's view of a fresh checkout: the persisted record exists, the published artifact does not
    const providers = [providerFacts("grok", { record, presentationStale: true }), providerFacts("chatgpt", { record: null, presentationStale: false })];
    const plan = planGameV2(g, providers.slice(0, 1));
    expect(plan.providers.grok).toMatchObject({ action: "presentation_only", handicap: "none", research: "none" });

    const result = executeGamePlanV2(g, providers.slice(0, 1), plan, { root, live: true, runCommand, deps: { ensureGameContext } });

    expect(result.ok, result.failures.join(" | ")).toBe(true);
    expect(result.presentation).toMatchObject({ action: "regenerate", ran: true, ok: true });
    expect(state.calls).toBe(1);
    expect(calls).toEqual([]);
    expect(existsSync(contextPath())).toBe(true);
    const published = JSON.parse(readFileSync(artifactPath(), "utf8"));
    expect(published.handicapV2.grokowski.verdict).toBe(record.verdict);
    expect(published.homeTeam).toBe("buf");
    expect(published.kickoff).toBe(KICKOFF);
  });

  it("the exporter alone still fails without the artifact -- the fix reconstructs it, it does not loosen the exporter", () => {
    writeHandicapV2Record(root, SEASON, WEEK, validRecord("grok"));
    const g = game();
    const providers = [providerFacts("grok", { record: validRecord("grok"), presentationStale: true })];
    const { runCommand } = fakeRunner([]);
    const result = executeGamePlanV2(g, providers, planGameV2(g, providers), { root, live: true, runCommand, deps: { ensureGameContext: () => ({ ok: true }) } });
    expect(result.presentation.ok).toBe(false);
    expect(result.presentation.detail).toMatch(/No deterministic game-context artifact/);
  });

  it("the default path (no injected reconstruction) goes through ensureGameContextArtifact and reports failure instead of throwing", () => {
    writeHandicapV2Record(root, SEASON, WEEK, validRecord("grok"));
    const g = game();
    const providers = [providerFacts("grok", { record: validRecord("grok"), presentationStale: true })];
    const { runCommand, calls } = fakeRunner([]);
    // `root` is a temp dir with no tracked upstream artifacts, so the real rebuild cannot succeed here -- it must fail CLOSED and be reported.
    const result = executeGamePlanV2(g, providers, planGameV2(g, providers), { root, live: true, runCommand });
    expect(result.ok).toBe(false);
    expect(result.presentation).toMatchObject({ action: "regenerate", ran: true, ok: false });
    expect(result.presentation.detail).toMatch(/game context could not be reconstructed/);
    expect(calls).toEqual([]);
    expect(existsSync(artifactPath())).toBe(false);
  });

  it("a failed presentation never reruns Stage A/B: the record stays reusable and the next plan is a free export", () => {
    const record = validRecord("grok");
    writeHandicapV2Record(root, SEASON, WEEK, record);
    const events: string[] = [];
    const { runCommand, calls } = fakeRunner(events);
    const { ensureGameContext } = fakeReconstruction(events, false);
    const g = game();
    const providers = [providerFacts("grok", { record, presentationStale: true })];
    const result = executeGamePlanV2(g, providers, planGameV2(g, providers), { root, live: true, runCommand, deps: { ensureGameContext } });
    expect(result.presentation.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/presentation: cannot resolve the game identity/);
    expect(calls).toEqual([]);
    expect(existsSync(artifactPath())).toBe(false);
    // the record is untouched and the next run plans zero model calls
    expect(planProviderV2(g, providerFacts("grok", { record, presentationStale: true }))).toMatchObject({ action: "presentation_only", handicap: "none", research: "none" });
  });

  it("the other provider's deferred job stays deferred and re-plannable after the presentation is exported", () => {
    const record = validRecord("grok");
    writeHandicapV2Record(root, SEASON, WEEK, record);
    const g = game();
    const providers = [providerFacts("grok", { record, presentationStale: true }), providerFacts("chatgpt", { record: null, presentationStale: false, evidence: { exists: false, generatedAt: null, stageAEvidenceHash: null, count: 0 } })];
    const unlimited = planGameV2(g, providers);
    expect(unlimited.providers.chatgpt).toMatchObject({ action: "handicap_initial", handicap: "initial" });
    const { plans, summary } = applyJobLimit([unlimited], 0);
    expect(summary).toMatchObject({ totalJobs: 1, executing: 0, deferred: 1 });
    expect(plans[0].providers.chatgpt.deferred).toMatchObject({ action: "handicap_initial", handicap: "initial" });

    const { runCommand, calls } = fakeRunner([]);
    const { ensureGameContext } = fakeReconstruction([]);
    const result = executeGamePlanV2(g, providers, plans[0], { root, live: true, runCommand, deps: { ensureGameContext } });
    expect(result.ok, result.failures.join(" | ")).toBe(true);
    expect(calls).toEqual([]);
    // next run: the deferred provider is planned again, Grok needs nothing
    const next = planGameV2(g, [providerFacts("grok", { record, presentationStale: false }), providers[1]]);
    expect(next.providers.chatgpt).toMatchObject({ action: "handicap_initial" });
    expect(next.providers.grok).toMatchObject({ action: "none" });
  });
});

describe("site-only initial execution with no game-context artifact", () => {
  it("Stage A/B succeeds and the presentation succeeds in the SAME run, context rebuilt after the handicap and before the export", () => {
    const events: string[] = [];
    // the stand-in for run-nfl-handicap-v2.ts --live: it persists the v2 record, exactly as the real child does on success
    const { runCommand, calls } = fakeRunner(events, (args) => {
      if (args.some((a) => a === "--research-mode=site-only")) writeHandicapV2Record(root, SEASON, WEEK, validRecord("grok"));
    });
    const { state, ensureGameContext } = fakeReconstruction(events);
    const g = game();
    const fresh = providerFacts("grok", { record: null, presentationStale: false, evidence: { exists: false, generatedAt: null, stageAEvidenceHash: null, count: 0 } });
    const plan = planGameV2(g, [fresh]);
    expect(plan.providers.grok).toMatchObject({ action: "handicap_initial", research: "none", handicap: "initial" });

    const result = executeGamePlanV2(g, [fresh], plan, { root, live: true, runCommand, deps: { ensureGameContext, regatherProviderFacts: () => fresh } });

    expect(result.ok, result.failures.join(" | ")).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(expect.arrayContaining(["--provider=grok", `--game=${GAME_ID}`, "--mode=full", "--research-mode=site-only", "--live"]));
    expect(calls.some((c) => c.some((a) => a.includes("-research.ts")))).toBe(false);
    expect(events).toEqual(["run:run-nfl-handicap-v2.ts", "ensure-context"]);
    expect(state.calls).toBe(1);
    expect(result.presentation).toMatchObject({ ran: true, ok: true });
    expect(JSON.parse(readFileSync(artifactPath(), "utf8")).handicapV2.grokowski.verdict).toBeTruthy();
  });

  it("when Stage A/B fails there is nothing to publish: no context rebuild, no presentation, the failure is reported", () => {
    const events: string[] = [];
    const runCommand: CommandRunner = (command, args) => (events.push("run"), { command, args, ok: false, exitCode: 1, stderr: "Stage B FAILED validation", stdout: "" });
    const { state, ensureGameContext } = fakeReconstruction(events);
    const g = game();
    const fresh = providerFacts("grok", { record: null, presentationStale: false, evidence: { exists: false, generatedAt: null, stageAEvidenceHash: null, count: 0 } });
    const result = executeGamePlanV2(g, [fresh], planGameV2(g, [fresh]), { root, live: true, runCommand, deps: { ensureGameContext, regatherProviderFacts: () => fresh } });
    expect(result.ok).toBe(false);
    expect(state.calls).toBe(0);
    expect(existsSync(artifactPath())).toBe(false);
  });
});

describe("the reconstruction stays free and bounded", () => {
  it("a dry run reconstructs nothing, writes nothing and calls nothing", () => {
    writeHandicapV2Record(root, SEASON, WEEK, validRecord("grok"));
    const events: string[] = [];
    const { runCommand, calls } = fakeRunner(events);
    const { state, ensureGameContext } = fakeReconstruction(events);
    const g = game();
    const providers = [providerFacts("grok", { record: validRecord("grok"), presentationStale: true })];
    const result = executeGamePlanV2(g, providers, planGameV2(g, providers), { root, live: false, runCommand, deps: { ensureGameContext } });
    expect(result.presentation).toMatchObject({ ran: false, ok: true });
    expect(state.calls).toBe(0);
    expect(calls).toEqual([]);
    expect(existsSync(contextPath())).toBe(false);
    expect(existsSync(artifactPath())).toBe(false);
  });

  it("is not attempted when the published artifact is already current (nothing to export)", () => {
    const events: string[] = [];
    const { runCommand } = fakeRunner(events);
    const { state, ensureGameContext } = fakeReconstruction(events);
    const g = game();
    const providers = [providerFacts("grok", { presentationStale: false })];
    const result = executeGamePlanV2(g, providers, planGameV2(g, providers), { root, live: true, runCommand, deps: { ensureGameContext } });
    expect(result.ok).toBe(true);
    expect(state.calls).toBe(0);
  });

  it("post-kickoff behaviour is unchanged: a locked game is never rewritten and its context is not rebuilt for an export that fails closed", () => {
    writeHandicapV2Record(root, SEASON, WEEK, validRecord("grok"));
    const locked = game({ now: new Date("2026-10-04T18:00:00.000Z") });
    const providers = [providerFacts("grok", { record: validRecord("grok"), presentationStale: true })];
    const plan = planGameV2(locked, providers);
    expect(plan.providers.grok).toMatchObject({ action: "presentation_only", handicap: "none" });
    const events: string[] = [];
    const { runCommand, calls } = fakeRunner(events);
    const { ensureGameContext } = fakeReconstruction(events, false);
    const result = executeGamePlanV2(locked, providers, plan, { root, live: true, runCommand, deps: { ensureGameContext } });
    expect(calls).toEqual([]);
    expect(result.presentation.ok).toBe(false);
    expect(result.presentation.detail).toMatch(/kickoff has already passed/);
  });
});

describe("game-context/** is scratch state and stays out of the persisted/commit manifest", () => {
  /** A `:(glob)` pathspec as a regex: `*` stays inside one path segment. */
  const matches = (spec: string, path: string): boolean => new RegExp(`^${spec.replace(":(glob)", "").replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`).test(path);

  it("no commit pathspec can match a game-context path, including the NE-BUF artifact this run rebuilds", () => {
    const rebuilt = ["data/nfl/game-context/2026/4/2026_04_NE_BUF.json", "data/nfl/game-context/2026/4/2026_04_NE_BUF/grok.json"];
    for (const path of rebuilt) for (const spec of V2_COMMIT_PATHSPECS) expect(matches(spec, path), `${spec} vs ${path}`).toBe(false);
    for (const spec of V2_COMMIT_PATHSPECS) expect(spec).not.toMatch(/game-context/);
    // sanity: the matcher does match the files the workflow does persist
    expect(matches(V2_COMMIT_PATHSPECS[1], "data/nfl/analysis/2026/4/2026_04_NE_BUF/grok/evidence.live-test.json")).toBe(true);
    expect(matches(V2_COMMIT_PATHSPECS[2], "data/nfl/analysis/2026/4/2026_04_NE_BUF/grok/handicap-v2/20261002T185314049Z-44f8f11848dc.json")).toBe(true);
    expect(contextPath().replace(/\\/g, "/")).toContain("/data/nfl/game-context/2026/4/2026_04_NE_BUF.json");
  });
});
