/**
 * AI Picks v2 automation hardening -- research cadence, the rollout job limit,
 * duplicate-trigger behaviour, and "identical inputs resolve to none". Pure or
 * fake-runner only: no provider call is made anywhere in this suite.
 */
import { describe, expect, it } from "vitest";
import { formatDryRunReport, estimateCalls, parseSlateV2Args, runSlateV2 } from "../run-nfl-ai-handicap-v2-slate";
import type { CommandRunner } from "./nfl-ai-slate-executor";
import { DEFAULT_V2_LIFECYCLE_POLICY, applyJobLimit, planGameV2, planProviderV2, type V2ProviderFacts } from "./nfl-ai-v2-slate-plan";
import { GAME_ID, KICKOFF, gameFacts, market, providerFacts, record } from "./nfl-ai-v2-slate.fixtures";
import type { EvidenceModel } from "./nfl-evidence-types";

const HOUR = 3_600_000;
const kickoffMs = Date.parse(KICKOFF);
const before = (hours: number) => new Date(kickoffMs - hours * HOUR);
const evidenceAt = (date: Date) => ({ exists: true, generatedAt: date.toISOString(), stageAEvidenceHash: "ev1", count: 5 });
const noEvidence = { exists: false, generatedAt: null, stageAEvidenceHash: null, count: 0 };

describe("late-week research refresh", () => {
  it("refreshes 50h before kickoff when the last pass was 30h ago, even with no local injury change", () => {
    const now = before(50);
    const plan = planProviderV2(gameFacts({ now }), providerFacts("grok", { evidence: evidenceAt(new Date(now.getTime() - 30 * HOUR)) }));
    expect(plan).toMatchObject({ action: "research_update", research: "update" });
    expect(plan.reasons.join(" ")).toMatch(/late-week refresh: last research was 30h ago/);
  });

  it("does nothing 50h before kickoff when the last pass was only 8h ago", () => {
    const now = before(50);
    expect(planProviderV2(gameFacts({ now }), providerFacts("grok", { evidence: evidenceAt(new Date(now.getTime() - 8 * HOUR)) })).research).toBe("none");
  });

  it("uses the 24h cadence as a hard edge", () => {
    const now = before(50);
    expect(planProviderV2(gameFacts({ now }), providerFacts("grok", { evidence: evidenceAt(new Date(now.getTime() - 23 * HOUR)) })).research).toBe("none");
    expect(planProviderV2(gameFacts({ now }), providerFacts("grok", { evidence: evidenceAt(new Date(now.getTime() - 24 * HOUR)) })).research).toBe("update");
  });

  it("does not repeat research outside the 72h window", () => {
    const now = before(80);
    expect(planProviderV2(gameFacts({ now }), providerFacts("grok", { evidence: evidenceAt(new Date(now.getTime() - 40 * HOUR)) })).research).toBe("none");
  });

  it("lets a deterministic availability change trigger sooner than the cadence, but never inside the 6h minimum", () => {
    const now = before(50);
    const eightHoursAgo = evidenceAt(new Date(now.getTime() - 8 * HOUR));
    const threeHoursAgo = evidenceAt(new Date(now.getTime() - 3 * HOUR));
    const sooner = planProviderV2(gameFacts({ now, availabilityHash: "av2" }), providerFacts("grok", { evidence: eightHoursAgo }));
    expect(sooner.research).toBe("update");
    expect(sooner.reasons.join(" ")).toMatch(/availability/);
    expect(planProviderV2(gameFacts({ now, availabilityHash: "av2" }), providerFacts("grok", { evidence: threeHoursAgo })).research).toBe("none");
  });

  it("runs one final gameday pass 10h before kickoff when none has run since the window opened", () => {
    const now = before(10);
    const plan = planProviderV2(gameFacts({ now }), providerFacts("grok", { evidence: evidenceAt(before(20)) }));
    expect(plan.research).toBe("update");
    expect(plan.reasons.join(" ")).toMatch(/gameday pass/);
  });

  it("does not run a second gameday pass once one has run inside the window", () => {
    expect(planProviderV2(gameFacts({ now: before(6) }), providerFacts("grok", { evidence: evidenceAt(before(11)) })).research).toBe("none");
  });

  it("does nothing after kickoff, whatever the evidence age", () => {
    const now = new Date(kickoffMs + HOUR);
    const plan = planProviderV2(gameFacts({ now }), providerFacts("grok", { evidence: evidenceAt(before(100)) }));
    expect(plan).toMatchObject({ action: "blocked", blockedKind: "locked", research: "none", handicap: "none" });
  });

  it("still honours the failure backoff on a recent failed research attempt", () => {
    const now = before(50);
    const stale = evidenceAt(new Date(now.getTime() - 30 * HOUR));
    const failed = (hoursAgo: number) => ({ research: { failedAt: new Date(now.getTime() - hoursAgo * HOUR).toISOString(), mode: "update", error: "provider 500" } });
    expect(planProviderV2(gameFacts({ now }), providerFacts("grok", { evidence: stale, ledger: failed(3) })).research).toBe("none");
    expect(planProviderV2(gameFacts({ now }), providerFacts("grok", { evidence: stale, ledger: failed(13) })).research).toBe("update");
  });

  it("keeps a whole week of hourly runs bounded: a few passes, never closer than 6h", () => {
    let last = before(100);
    const passes: number[] = [];
    for (let h = 100; h > 0; h -= 1) {
      const now = before(h);
      const plan = planProviderV2(gameFacts({ now }), providerFacts("grok", { evidence: evidenceAt(last) }));
      if (plan.research === "update") {
        passes.push(now.getTime());
        last = now;
      }
    }
    expect(passes.length).toBeLessThanOrEqual(4);
    expect(passes.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < passes.length; i += 1) expect(passes[i] - passes[i - 1]).toBeGreaterThanOrEqual(DEFAULT_V2_LIFECYCLE_POLICY.minResearchIntervalHours * HOUR);
  });
});

describe("no accidental double invocation", () => {
  /** A run that performs whatever research the plan asks for and records its time as the new "last researched". */
  function runOnce(now: Date, last: Date, kickoff = KICKOFF): { researched: boolean; last: Date } {
    const plan = planProviderV2(gameFacts({ now, kickoffUtc: kickoff }), providerFacts("grok", { evidence: evidenceAt(last) }));
    return plan.research === "update" ? { researched: true, last: now } : { researched: false, last };
  }

  it("a second run on the same trigger minute or a couple of hours later is free", () => {
    for (const hoursToKickoff of [70, 50, 30, 14, 10, 4]) {
      const first = before(hoursToKickoff);
      const { researched, last } = runOnce(first, before(hoursToKickoff + 60));
      expect(researched).toBe(true);
      for (const gapHours of [0, 1, 2, 5]) expect(runOnce(new Date(first.getTime() + gapHours * HOUR), last).researched).toBe(false);
    }
  });

  it("on a Sunday, the 6 AM ET chain and the 1:17 PM ET cron cost nothing extra for a 1 PM game and at most one pass each for the night game", () => {
    const chain = new Date("2026-09-27T10:15:00.000Z");
    const cron = new Date("2026-09-27T17:17:00.000Z");
    const earlyKickoff = "2026-09-27T17:00:00.000Z";
    const nightKickoff = "2026-09-28T00:20:00.000Z";
    const earlyChain = runOnce(chain, new Date("2026-09-26T09:00:00.000Z"), earlyKickoff);
    expect(earlyChain.researched).toBe(true); // the gameday pass
    expect(runOnce(cron, earlyChain.last, earlyKickoff).researched).toBe(false); // already kicked off: locked
    const nightChain = runOnce(chain, new Date("2026-09-26T09:00:00.000Z"), nightKickoff);
    expect(nightChain.researched).toBe(true); // 24h+ cadence
    expect(runOnce(cron, nightChain.last, nightKickoff).researched).toBe(true); // the one gameday pass, 7h later, inside the 12h window
    const again = runOnce(new Date(cron.getTime() + HOUR), cron, nightKickoff);
    expect(again.researched).toBe(false);
  });
});

describe("identical inputs resolve to none", () => {
  it("after a cold-start pass writes its state, replanning the same inputs is none for both providers", () => {
    const now = before(50);
    const cold = (provider: EvidenceModel): V2ProviderFacts => providerFacts(provider, { evidence: noEvidence, record: null });
    const first = planGameV2(gameFacts({ now }), [cold("grok"), cold("chatgpt")]);
    expect(Object.values(first.providers).map((p) => p.action)).toEqual(["research_initial", "research_initial"]);

    // What a successful run leaves behind: evidence, a record fingerprinted from these inputs, a current export.
    const after = (provider: EvidenceModel): V2ProviderFacts => providerFacts(provider, { evidence: evidenceAt(now), record: record(provider), presentationStale: false });
    const second = planGameV2(gameFacts({ now: new Date(now.getTime() + HOUR) }), [after("grok"), after("chatgpt")]);
    expect(Object.values(second.providers).map((p) => p.action)).toEqual(["none", "none"]);
    expect(second.presentation).toBe("skip");
    expect(estimateCalls([second])).toEqual({ research: 0, stageA: 0, stageB: 0, conditionalStageA: 0, conditionalStageB: 0, presentations: 0 });
  });
});

describe("rollout job limit", () => {
  const cold = (provider: EvidenceModel): V2ProviderFacts => providerFacts(provider, { evidence: noEvidence, record: null });
  const games = ["2026_03_A", "2026_03_B", "2026_03_C"].map((gameId) => planGameV2(gameFacts({ gameId }), [cold("grok"), cold("chatgpt")]));

  it("keeps the first N paid jobs in plan order and defers the rest", () => {
    const { plans, summary } = applyJobLimit(games, 3);
    expect(summary).toEqual({ totalJobs: 6, executing: 3, deferred: 3, maxJobs: 3 });
    expect(plans[0].providers.grok.action).toBe("research_initial");
    expect(plans[0].providers.chatgpt.action).toBe("research_initial");
    expect(plans[1].providers.grok.action).toBe("research_initial");
    expect(plans[1].providers.chatgpt.deferred?.action).toBe("research_initial");
    expect(plans[2].providers.grok.deferred).toBeDefined();
  });

  it("zeroes a deferred job so it can neither execute nor be counted", () => {
    const { plans } = applyJobLimit(games, 1);
    const deferred = plans[1].providers.grok;
    expect(deferred).toMatchObject({ action: "none", research: "none", handicap: "none", needsBootstrap: false });
    expect(deferred.reasons[0]).toMatch(/deferred by --max-jobs=1/);
    expect(estimateCalls(plans)).toMatchObject({ research: 1, stageA: 1, stageB: 1 });
  });

  it("does not count free work (no-op, blocked, export-only) against the limit", () => {
    const quiet = planGameV2(gameFacts({ gameId: "2026_03_Q" }), [providerFacts("grok"), providerFacts("chatgpt", { presentationStale: true })]);
    const { summary } = applyJobLimit([quiet, ...games], 2);
    expect(summary.totalJobs).toBe(6);
    expect(summary.executing).toBe(2);
  });

  it("supports no limit and a zero limit", () => {
    expect(applyJobLimit(games, null).summary).toMatchObject({ totalJobs: 6, executing: 6, deferred: 0, maxJobs: null });
    const zero = applyJobLimit(games, 0);
    expect(zero.summary).toMatchObject({ executing: 0, deferred: 6 });
    expect(estimateCalls(zero.plans)).toMatchObject({ research: 0, stageA: 0, stageB: 0 });
  });

  it("regenerates a game's presentation only if something in it still runs or lags", () => {
    const { plans } = applyJobLimit(games, 1);
    expect(plans[0].presentation).toBe("regenerate");
    expect(plans[1].presentation).toBe("skip");
  });

  it("parses --max-jobs and rejects anything that could silently mean unlimited", () => {
    expect(parseSlateV2Args(["--max-jobs=2"]).maxJobs).toBe(2);
    expect(parseSlateV2Args([]).maxJobs).toBeNull();
    expect(() => parseSlateV2Args(["--max-jobs=two"])).toThrow(/non-negative integer/);
    expect(() => parseSlateV2Args(["--max-jobs=-1"])).toThrow(/non-negative integer/);
  });

  it("applies before any paid call: a live run under --max-jobs=2 spawns commands for only those two jobs", () => {
    const calls: string[] = [];
    const runCommand: CommandRunner = (command, args) => {
      calls.push(args.join(" "));
      return { command, args, ok: true, exitCode: 0, stderr: "", stdout: "" };
    };
    const entries = games.map((plan, i) => ({ facts: gameFacts({ gameId: plan.gameId, now: before(50) }), providers: [cold("grok"), cold("chatgpt")], plan: { ...plan, gameId: `2026_03_${"ABC"[i]}` } }));
    const run = runSlateV2({
      root: "/nonexistent-root",
      season: 2026,
      live: true,
      maxJobs: 2,
      entries,
      runCommand,
      deps: { rebuildContext: () => ({ stage: "context", action: "rebuild", ran: true, ok: true, detail: "ok" }), regatherProviderFacts: (p) => providerFacts(p, { record: null }), presentationIsStale: () => false },
    });
    expect(run.limit.summary).toMatchObject({ totalJobs: 6, executing: 2, deferred: 4 });
    const games_ = new Set(calls.map((c) => /--game=(\w+)/.exec(c)?.[1]));
    expect(games_).toEqual(new Set(["2026_03_A"]));
    expect(calls.filter((c) => c.includes("-research.ts") && c.includes("--mode=initial"))).toHaveLength(2);
  });

  it("makes the dry-run report state planned, executing and deferred jobs and both call estimates", () => {
    const { plans, summary } = applyJobLimit(games, 2);
    const report = formatDryRunReport(plans, { summary, unlimitedPlans: games });
    expect(report).toMatch(/Paid jobs \(provider x game\): 6 planned +executing under --max-jobs=2: 2 +deferred: 4/);
    expect(report).toMatch(/Expected calls for the selected execution set: 2 research, 2 Stage A, 2 Stage B/);
    expect(report).toMatch(/Expected calls if unlimited: 6 research, 6 Stage A, 6 Stage B/);
    expect(report).toMatch(/DEFERRED \(would be research_initial\)/);
  });
});

describe("sanity of the shared fixture assumptions", () => {
  it("keeps the fixture game on the expected kickoff and market", () => {
    expect(GAME_ID).toBe("2026_03_LAC_BUF");
    expect(market().spread.homeLine).toBe(-7);
  });
});
