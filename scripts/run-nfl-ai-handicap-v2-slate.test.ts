/**
 * AI Picks v2 automation -- operator command: argument defaults, the dry-run
 * report the operator reads before spending, and the live summary. No provider
 * call is made anywhere in this suite.
 */
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatDryRunReport, formatLiveSummary, parseSlateV2Args, runSlateV2 as runSlateV2Mode } from "./run-nfl-ai-handicap-v2-slate";
import type { CommandRunner } from "./lib/nfl-ai-slate-executor";
import { planGameV2 as planGameV2Mode } from "./lib/nfl-ai-v2-slate-plan";
import { gameFacts, market, providerFacts } from "./lib/nfl-ai-v2-slate.fixtures";

// These cases pin the LIVE-research lifecycle (research passes, cadence, backoff, evidence change). The planner/executor default is
// now "site-only", so they request live explicitly -- which is also what proves live mode is preserved.
const planGameV2: typeof planGameV2Mode = (game, providers, opts = {}) => planGameV2Mode(game, providers, { researchMode: "live", ...opts });
const runSlateV2: typeof runSlateV2Mode = (options) => runSlateV2Mode({ researchMode: "live", ...options });

const noEvidence = { exists: false, generatedAt: null, stageAEvidenceHash: null, count: 0 };

describe("arguments", () => {
  it("defaults to a dry run and only spends with --live", () => {
    expect(parseSlateV2Args(["--season=2026", "--week=3"]).live).toBe(false);
    expect(parseSlateV2Args(["--season=2026", "--week=3", "--live"]).live).toBe(true);
    expect(parseSlateV2Args(["--live", "--dry-run"]).live).toBe(false);
  });

  it("parses season, week, game, repeated providers and the force/retry switches", () => {
    const args = parseSlateV2Args(["--season=2026", "--week=3", "--game=2026_03_LAC_BUF", "--provider=grok", "--provider=chatgpt", "--force-research", "--retry-failed"]);
    expect(args).toMatchObject({ season: 2026, week: 3, gameId: "2026_03_LAC_BUF", providers: ["grok", "chatgpt"], forceResearch: true, forceHandicap: false, retryFailed: true });
  });

  it("falls back to both providers, the next kickoff's week and the current year", () => {
    expect(parseSlateV2Args([], 2031)).toMatchObject({ season: 2031, week: null, providers: ["grok", "chatgpt"] });
    expect(parseSlateV2Args(["--provider=bogus"]).providers).toEqual(["grok", "chatgpt"]);
  });
});

describe("dry-run report", () => {
  const now = new Date("2026-09-27T09:00:00.000Z");
  const plans = [
    planGameV2(gameFacts({ market: market(-6.5) }), [providerFacts("grok"), providerFacts("chatgpt")]),
    planGameV2(gameFacts({ gameId: "2026_03_NEW_GAME", now: new Date("2026-09-25T12:00:00.000Z") }), [providerFacts("grok", { record: null, evidence: noEvidence }), providerFacts("chatgpt")]),
    planGameV2(gameFacts({ gameId: "2026_03_OLD_GAME", now: new Date("2026-09-27T18:00:00.000Z") }), [providerFacts("grok"), providerFacts("chatgpt")]),
    planGameV2(gameFacts({ gameId: "2026_03_NO_MARKET", market: null }), [providerFacts("grok")]),
    planGameV2(gameFacts({ gameId: "2026_03_GAMEDAY", now }), [providerFacts("grok")]),
  ];
  const report = formatDryRunReport(plans);

  it("states games considered, provider actions, expected calls, locks, blocks and presentations", () => {
    expect(report).toMatch(/Games considered: 5/);
    expect(report).toMatch(/post-kickoff locks: 1/);
    expect(report).toMatch(/blocked \(not locked\): 1/);
    expect(report).toMatch(/market_reprice/);
    expect(report).toMatch(/research_initial/);
    expect(report).toMatch(/research_update/);
    expect(report).toMatch(/Expected calls: 2 research, 1 Stage A, 3 Stage B/);
    expect(report).toMatch(/only if a research pass adds new evidence/);
    expect(report).toMatch(/presentations to regenerate: 3/);
    expect(report).toMatch(/2026_03_OLD_GAME.*\[LOCKED\]/);
  });

  it("says plainly that no dry run is billed", () => {
    expect(report).toMatch(/no provider calls, nothing written/);
  });
});

describe("dry run performs no paid calls", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "nfl-ai-v2-cli-"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("never invokes a command and never writes, even with a plan full of paid work", () => {
    const calls: string[][] = [];
    const runCommand: CommandRunner = (command, args) => {
      calls.push(args);
      return { command, args, ok: true, exitCode: 0, stderr: "", stdout: "" };
    };
    const game = gameFacts({ footballContextHash: "ctx2" });
    const providers = [providerFacts("grok"), providerFacts("chatgpt", { record: null, evidence: noEvidence })];
    const run = runSlateV2({ root, season: 2026, live: false, runCommand, entries: [{ facts: game, providers, plan: planGameV2(game, providers) }] });
    expect(calls).toEqual([]);
    expect(run.results).toEqual([]);
    expect(readdirSync(root)).toEqual([]);
  });
});

describe("live summary", () => {
  it("lists every failure and the per-stage tallies", () => {
    const summary = formatLiveSummary([
      {
        gameId: "2026_03_A",
        ok: false,
        context: null,
        providers: [{ provider: "grok", plannedAction: "football_update", handicapAction: "update", research: { stage: "research", action: "none", ran: false, ok: true, detail: "" }, handicap: { stage: "handicap", action: "update", ran: true, ok: false, detail: "Stage B FAILED" } }],
        presentation: { stage: "presentation", action: "skip", ran: false, ok: true, detail: "" },
        failures: ["grok handicap: Stage B FAILED"],
      },
    ]);
    expect(summary).toMatch(/Handicap: 0\/1 succeeded/);
    expect(summary).toMatch(/Failures \(1\)/);
    expect(summary).toMatch(/2026_03_A: grok handicap: Stage B FAILED/);
  });
});
