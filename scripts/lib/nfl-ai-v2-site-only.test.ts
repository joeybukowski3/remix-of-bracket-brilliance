/**
 * AI Picks v2 -- SITE-ONLY research mode (the default): JKB/local deterministic data -> Stage A -> Stage B,
 * with no provider research pass, no web search and no evidence file. Live-research behavior is preserved
 * behind an explicit opt-in (it is pinned by the existing planner/executor suites, which now ask for it).
 *
 * No provider call is made: the executor takes a fake command runner, the prompts and validators are
 * called directly, and ledger/record writes go to throwaway temp roots.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { estimateCalls, formatDryRunReport, formatLiveSummary, parseSlateV2Args, runSlateV2 } from "../run-nfl-ai-handicap-v2-slate";
import { auditStageAPromptForMarketPricing, filterEvidenceRecordsForBlindStageA, sanitizeGameContextPacketForBlindStageA } from "./nfl-ai-context-sanitizer";
import type { CommandOutcome, CommandRunner } from "./nfl-ai-slate-executor";
import { readAttemptLedger } from "./nfl-ai-v2-attempt-ledger";
import { DEFAULT_RESEARCH_MODE, parseResearchMode } from "./nfl-ai-v2-research-mode";
import { executeGamePlanV2 } from "./nfl-ai-v2-slate-executor";
import { applyJobLimit, handicapInputKey, planGameV2, planProviderV2 } from "./nfl-ai-v2-slate-plan";
import { GAME_ID, gameFacts, market, providerFacts } from "./nfl-ai-v2-slate.fixtures";
import { aggregateUsageByProvider, formatUsageLine, recordTokenUsage, TELEMETRY_SCHEMA_VERSION, type TelemetryMarkerRecord } from "./nfl-ai-telemetry";
import type { EvidenceModel } from "./nfl-evidence-types";
import { buildEvidenceAliasMap, resolveStageAEvidenceAliases, resolveStageBEvidenceAliases } from "./nfl-handicap-v2-evidence-aliases";
import { buildStageAV2Prompt, buildStageBV2Prompt } from "./nfl-handicap-v2-prompts";
import { buildHandicapV2PublicCard, isPublishableHandicapV2Record, readLatestPublishableHandicapV2Record } from "./nfl-handicap-v2-presentation";
import { buildHandicapV2Record, writeHandicapV2Record } from "./nfl-handicap-v2-record";
import { SITE_INJURY_MAX_AGE_HOURS, SITE_INJURY_RULE, assessSiteAvailability, buildSitePromptContext, selectHandicapEvidence } from "./nfl-handicap-v2-site-context";
import { validateStageAV2, validateStageBV2, type StageAV2ValidationContext, type StageBV2ValidationContext } from "./nfl-handicap-v2-validator";
import type { NflGameContextPacket } from "./nfl-full-game-context";
import { V2_CONTEXT_HASH, V2_EVIDENCE, V2_FACT_REFS, V2_GAME, V2_GAME_ID, V2_MARKET_MINUS_7, V2_PACKET, V2_STAGE_A_TIME, V2_STAGE_B_TIME, stageARaw, stageBRaw, trustedStageA } from "./__fixtures__/nfl-handicap-v2-fixtures";

const PROVIDERS: EvidenceModel[] = ["grok", "chatgpt"];
const GAMEDAY = new Date("2026-09-27T09:00:00.000Z");
const noEvidence = { exists: false, generatedAt: null, stageAEvidenceHash: null, count: 0 };

/* -------------------------------------------------------------------------- */
/* helpers                                                                    */
/* -------------------------------------------------------------------------- */

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

const isHandicap = (call: Call) => call.script.endsWith("run-nfl-handicap-v2.ts");
const modeOf = (call: Call) => call.args.find((a) => a.startsWith("--mode="))?.slice(7);
const researchModeArg = (call: Call) => call.args.find((a) => a.startsWith("--research-mode="))?.slice(16);
const providerOf = (call: Call) => call.args.find((a) => a.startsWith("--provider="))?.slice(11) as EvidenceModel;

/** A packet whose availability feed and its provenance timestamp are set as given. */
function packetWithInjuryFeed(feed: { provenanceStatus: "available" | "stale" | "unavailable"; feedStale: boolean; generatedAt: string | null; injuries?: NflGameContextPacket["availability"]["injuries"] }): NflGameContextPacket {
  const sources = [...V2_PACKET.provenance.sources.filter((s) => s.logicalName !== "matchup-injuries"), { logicalName: "matchup-injuries", path: "public/data/nfl/matchup-injuries.json", contentHash: "h", generatedAt: feed.generatedAt }];
  return {
    ...V2_PACKET,
    provenance: { ...V2_PACKET.provenance, sources },
    availability: { ...V2_PACKET.availability, injuries: feed.injuries ?? [], feedStale: feed.feedStale, provenance_status: feed.provenanceStatus },
  };
}

const NOW = new Date("2026-10-02T12:00:00.000Z");
const hoursAgo = (h: number): string => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const injury = (name: string, team: string, position: string, status: "out" | "doubtful" | "questionable" | "probable" | "active") => ({ playerId: `p-${name}`, name, team, position, status, asOf: "2026-week-4" });

const FRESH_FEED = packetWithInjuryFeed({
  provenanceStatus: "available",
  feedStale: false,
  generatedAt: hoursAgo(3),
  injuries: [injury("Zed Starter", "buf", "TE", "questionable"), injury("Al Back", "lac", "RB", "out"), injury("Bo Wideout", "lac", "WR", "doubtful"), injury("Healthy Guy", "buf", "QB", "active")],
});
const STALE_FEED = packetWithInjuryFeed({ provenanceStatus: "stale", feedStale: true, generatedAt: hoursAgo(1), injuries: [injury("Old Name", "buf", "QB", "out")] });

const aliases = (model: EvidenceModel) => buildEvidenceAliasMap([], model);
function stageA(model: EvidenceModel, packet: NflGameContextPacket = V2_PACKET, now = NOW): string {
  return buildStageAV2Prompt({ provider: model, game: V2_GAME, packet, evidenceLines: [], evidenceAliases: aliases(model), site: buildSitePromptContext(packet, now) });
}
function stageB(model: EvidenceModel, packet: NflGameContextPacket = V2_PACKET, now = NOW): string {
  return buildStageBV2Prompt({ provider: model, game: V2_GAME, packet, lockedStageA: trustedStageA(model), market: V2_MARKET_MINUS_7, evidenceLines: [], evidenceAliases: aliases(model), site: buildSitePromptContext(packet, now) });
}

/* -------------------------------------------------------------------------- */
/* mode definition                                                            */
/* -------------------------------------------------------------------------- */

describe("research mode definition", () => {
  it("defaults to site-only and parses strictly: a typo can never silently select paid live research", () => {
    expect(DEFAULT_RESEARCH_MODE).toBe("site-only");
    expect(parseResearchMode(undefined)).toBe("site-only");
    expect(parseResearchMode("")).toBe("site-only");
    expect(parseResearchMode("live")).toBe("live");
    expect(() => parseResearchMode("Live")).toThrow(/--research-mode must be one of/);
    expect(() => parseResearchMode("site_only")).toThrow(/--research-mode must be one of/);
  });

  it("the slate CLI defaults to site-only, accepts live explicitly, and rejects anything else", () => {
    expect(parseSlateV2Args(["--game=2026_04_IND_WAS"]).researchMode).toBe("site-only");
    expect(parseSlateV2Args(["--research-mode=live"]).researchMode).toBe("live");
    expect(parseSlateV2Args(["--research-mode=site-only"]).researchMode).toBe("site-only");
    expect(() => parseSlateV2Args(["--research-mode=lvie"])).toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* planner                                                                    */
/* -------------------------------------------------------------------------- */

describe("planner (site-only is the default)", () => {
  const fresh = (p: EvidenceModel) => providerFacts(p, { evidence: noEvidence, record: null, hasSnapshotLineage: false });

  it("1-3. a new game plans ZERO research and Stage A + Stage B, with no evidence file at all", () => {
    const plan = planGameV2(gameFacts(), [fresh("grok"), fresh("chatgpt")]);
    for (const provider of PROVIDERS) {
      expect(plan.providers[provider]).toMatchObject({ action: "handicap_initial", research: "none", needsBootstrap: false, handicap: "initial", handicapConditional: false, blockedKind: null });
      expect(plan.providers[provider].reasons.join(" ")).toMatch(/site-only mode: no provider research pass/);
    }
    expect(plan.presentation).toBe("regenerate");
    expect(estimateCalls([plan])).toEqual({ research: 0, stageA: 2, stageB: 2, conditionalStageA: 0, conditionalStageB: 0, presentations: 1 });
  });

  it("a football-context change plans Stage A + Stage B and still no research", () => {
    const plan = planProviderV2(gameFacts({ footballContextHash: "ctx2" }), providerFacts("grok"));
    expect(plan).toMatchObject({ action: "football_update", research: "none", handicap: "update" });
  });

  it("9. a market-only change plans Stage B alone against the locked Stage A", () => {
    const plan = planGameV2(gameFacts({ market: market(-6.5) }), [providerFacts("grok")]);
    expect(plan.providers.grok).toMatchObject({ action: "market_reprice", research: "none", handicap: "repricing" });
    expect(estimateCalls([plan])).toMatchObject({ research: 0, stageA: 0, stageB: 1 });
  });

  it("10. nothing changed costs zero calls, even gameday with old research evidence (which live mode would refresh)", () => {
    const stale = { exists: true, generatedAt: "2026-09-25T10:00:00.000Z", stageAEvidenceHash: "ev1", count: 5 };
    const plan = planGameV2(gameFacts({ now: GAMEDAY }), [providerFacts("grok", { evidence: stale }), providerFacts("chatgpt")]);
    for (const provider of PROVIDERS) expect(plan.providers[provider]).toMatchObject({ action: "none", research: "none", handicap: "none" });
    expect(estimateCalls([plan])).toMatchObject({ research: 0, stageA: 0, stageB: 0 });
  });

  it("ignores provider evidence entirely: a changed or missing evidence hash is not a reason to rerun Stage A", () => {
    const changed = providerFacts("grok", { evidence: { exists: true, generatedAt: "2026-09-25T10:00:00.000Z", stageAEvidenceHash: "different", count: 6 } });
    expect(planProviderV2(gameFacts(), changed).action).toBe("none");
    expect(planProviderV2(gameFacts(), providerFacts("grok", { evidence: noEvidence })).action).toBe("none");
  });

  it("a stale published presentation is still exported for free", () => {
    expect(planProviderV2(gameFacts(), providerFacts("grok", { presentationStale: true }))).toMatchObject({ action: "presentation_only", handicap: "none", research: "none" });
  });

  it("post-kickoff, no-market and no-context blocking behave exactly as before", () => {
    expect(planProviderV2(gameFacts({ market: null }), fresh("grok"))).toMatchObject({ action: "blocked", blockedKind: "market" });
    expect(planProviderV2(gameFacts({ contextBlockedReason: "no teams" }), fresh("grok"))).toMatchObject({ action: "blocked", blockedKind: "context" });
    expect(planProviderV2(gameFacts({ now: new Date("2026-09-27T18:00:00.000Z") }), fresh("grok"))).toMatchObject({ action: "blocked", blockedKind: "locked" });
  });

  it("11. live mode preserves the research lifecycle (explicit opt-in)", () => {
    const live = { researchMode: "live" as const };
    expect(planProviderV2(gameFacts(), fresh("grok"), live)).toMatchObject({ action: "research_initial", research: "initial", handicap: "initial" });
    const stale = { exists: true, generatedAt: "2026-09-25T10:00:00.000Z", stageAEvidenceHash: "ev1", count: 5 };
    expect(planProviderV2(gameFacts({ now: GAMEDAY }), providerFacts("grok", { evidence: stale }), live)).toMatchObject({ action: "research_update", research: "update", handicapConditional: true });
    expect(estimateCalls([planGameV2(gameFacts(), [fresh("grok")], live)])).toMatchObject({ research: 1, stageA: 1, stageB: 1 });
  });

  it("--max-jobs counts a site-only job as one provider/game with no research", () => {
    const plans = [planGameV2(gameFacts({ gameId: "2026_04_A" }), [fresh("grok"), fresh("chatgpt")]), planGameV2(gameFacts({ gameId: "2026_04_B" }), [fresh("grok")])];
    const { summary } = applyJobLimit(plans, 1);
    expect(summary).toMatchObject({ totalJobs: 3, executing: 1, deferred: 2 });
  });

  describe("failed-attempt ledger in site-only mode", () => {
    const failedFor = (action: string, over = {}) => ({ handicap: { failedAt: "2026-09-25T11:00:00.000Z", action, inputKey: handicapInputKey(action, gameFacts(), providerFacts("grok", { record: null }), "site-only"), error: "x", ...over } });

    it("the input key ignores provider evidence in site-only mode but not in live mode", () => {
      const a = providerFacts("grok", { evidence: { exists: true, generatedAt: null, stageAEvidenceHash: "ev1", count: 1 } });
      const b = providerFacts("grok", { evidence: { exists: true, generatedAt: null, stageAEvidenceHash: "ev2", count: 2 } });
      expect(handicapInputKey("handicap_initial", gameFacts(), a, "site-only")).toBe(handicapInputKey("handicap_initial", gameFacts(), b, "site-only"));
      expect(handicapInputKey("handicap_initial", gameFacts(), a, "live")).not.toBe(handicapInputKey("handicap_initial", gameFacts(), b, "live"));
    });

    it("blocks an identical paid retry, and allows one only on a real input change or --retry-failed", () => {
      const facts = providerFacts("grok", { record: null, ledger: failedFor("handicap_initial") });
      expect(planProviderV2(gameFacts(), facts)).toMatchObject({ action: "blocked", blockedKind: "failed_attempt" });
      expect(planProviderV2(gameFacts({ market: market(-6.5) }), facts).action).toBe("handicap_initial");
      expect(planProviderV2(gameFacts(), facts, { retryFailed: true }).action).toBe("handicap_initial");
    });
  });
});

/* -------------------------------------------------------------------------- */
/* executor                                                                   */
/* -------------------------------------------------------------------------- */

describe("executor (site-only)", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "nfl-ai-v2-site-only-"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function run(game: ReturnType<typeof gameFacts>, providers: ReturnType<typeof providerFacts>[], runCommand: CommandRunner, researchMode?: "live" | "site-only") {
    const spies = { contextRebuilds: 0, presentations: 0 };
    const opts = researchMode ? { researchMode } : {};
    const result = executeGamePlanV2(game, providers, planGameV2(game, providers, opts), {
      root,
      live: true,
      runCommand,
      ...opts,
      deps: {
        rebuildContext: () => (spies.contextRebuilds++, { stage: "context", action: "rebuild", ran: true, ok: true, detail: "ok" }),
        regatherProviderFacts: (p) => providerFacts(p, { record: null }),
        presentationIsStale: () => true,
        writeGamePresentation: () => (spies.presentations++, "/tmp/artifact.json"),
      },
    });
    return { result, spies };
  }
  const fresh = (p: EvidenceModel) => providerFacts(p, { evidence: noEvidence, record: null, hasSnapshotLineage: false });

  it("1-2, 6, 12. a new game makes NO research, bootstrap or context-rebuild call, then Stage A + B (one child run each) for BOTH providers, told site-only", () => {
    const { runCommand, calls } = fakeRunner();
    const { result, spies } = run(gameFacts(), [fresh("grok"), fresh("chatgpt")], runCommand);
    expect(calls.every(isHandicap)).toBe(true);
    expect(calls.map((c) => `${providerOf(c)}:${modeOf(c)}:${researchModeArg(c)}`)).toEqual(["grok:full:site-only", "chatgpt:full:site-only"]);
    expect(calls.some((c) => c.script.includes("-research.ts") || c.script.includes("bootstrap-"))).toBe(false);
    expect(spies.contextRebuilds).toBe(0);
    expect(spies.presentations).toBe(1);
    expect(result.ok).toBe(true);
  });

  it("9. a market-only change runs one repricing child (Stage B only) and no research", () => {
    const { runCommand, calls } = fakeRunner();
    run(gameFacts({ market: market(-6.5) }), [providerFacts("grok")], runCommand);
    expect(calls).toHaveLength(1);
    expect(modeOf(calls[0])).toBe("repricing");
    expect(researchModeArg(calls[0])).toBe("site-only");
  });

  it("10. no change makes zero calls and writes nothing", () => {
    const { runCommand, calls } = fakeRunner();
    const { spies } = run(gameFacts(), [providerFacts("grok"), providerFacts("chatgpt")], runCommand);
    expect(calls).toEqual([]);
    expect(spies.contextRebuilds).toBe(0);
  });

  it("11. live mode keeps the research flow: research, lineage bootstrap, then the handicap told --research-mode=live", () => {
    const { runCommand, calls } = fakeRunner();
    run(gameFacts(), [fresh("grok")], runCommand, "live");
    expect(calls.map((c) => (c.script.includes("-research.ts") ? "research" : c.script.includes("bootstrap-") ? "bootstrap" : `handicap:${researchModeArg(c)}`))).toEqual(["research", "bootstrap", "handicap:live"]);
  });

  it("a failed site-only attempt is recorded under the site-only key and blocks the identical retry next run", () => {
    const { runCommand } = fakeRunner((c) => !isHandicap(c));
    const game = gameFacts();
    const facts = fresh("grok");
    run(game, [facts], runCommand);
    const ledger = readAttemptLedger(root, 2026, 3, GAME_ID, "grok");
    expect(ledger.handicap?.action).toBe("handicap_initial");
    expect(ledger.handicap?.inputKey).toBe(handicapInputKey("handicap_initial", game, providerFacts("grok", { record: null }), "site-only"));
    expect(planProviderV2(game, providerFacts("grok", { record: null, ledger }))).toMatchObject({ action: "blocked", blockedKind: "failed_attempt" });
  });

  it("the slate reports research = 0 and Stage A/B per provider for a one-provider site-only game", () => {
    const game = gameFacts();
    const providers = [fresh("grok")];
    const entries = [{ facts: game, providers, plan: planGameV2(game, providers) }];
    const dry = runSlateV2({ root, season: 2026, live: false, entries });
    const report = formatDryRunReport(dry.entries.map((e) => e.plan), dry.limit, "site-only");
    expect(report).toMatch(/Research mode: site-only -- JKB site data only; no provider research pass and no web search \(research calls = 0 by construction\)/);
    expect(report).toMatch(/Expected calls: 0 research, 1 Stage A, 1 Stage B/);
    expect(report).toMatch(/grok\s+handicap_initial\s+handicap=initial/);
    expect(report).not.toMatch(/research=initial/);
    const live = formatLiveSummary([], "site-only");
    expect(live).toMatch(/Research mode: site-only/);
    expect(live).toMatch(/Usage \(research\): 0 call\(s\)/);
  });
});

/* -------------------------------------------------------------------------- */
/* local availability (injuries) and the site-only prompt                     */
/* -------------------------------------------------------------------------- */

describe("local injury data: current is shown, stale or missing is labelled unavailable", () => {
  it("5. fresh local injury data is included, with its freshness metadata and sorted deterministically", () => {
    const ctx = assessSiteAvailability(FRESH_FEED, NOW);
    expect(ctx).toMatchObject({ status: "current", ageHours: 3 });
    const prompt = stageA("grok", FRESH_FEED);
    expect(prompt).toContain("availability (LOCAL JKB injury feed -- CURRENT: generated");
    expect(prompt).toContain(`${hoursAgo(3)}, 3 hours old`);
    expect(prompt).toContain("  away (LAC): Al Back (RB) OUT; Bo Wideout (WR) DOUBTFUL");
    expect(prompt).toContain("  home (BUF): Zed Starter (TE) QUESTIONABLE");
    expect(prompt).not.toContain("Healthy Guy");
    expect(prompt).toContain("cite it as the factRef availability.injuries");
    expect(prompt).toContain(SITE_INJURY_RULE);
  });

  it("4. a stale injury artifact is labelled UNAVAILABLE, never shown as current, and the model is told not to make injury claims", () => {
    const ctx = assessSiteAvailability(STALE_FEED, NOW);
    expect(ctx.status).toBe("unavailable");
    for (const prompt of [stageA("grok", STALE_FEED), stageB("chatgpt", STALE_FEED)]) {
      expect(prompt).toMatch(/availability: UNAVAILABLE -- the local injury feed is stale/);
      expect(prompt).toContain("If current injury data is unavailable or stale, do not make specific injury claims.");
      expect(prompt).not.toContain("Old Name");
      expect(prompt).not.toContain("CURRENT: generated");
    }
  });

  it.each([
    ["a missing feed", { provenanceStatus: "unavailable" as const, feedStale: false, generatedAt: null }, /feed is missing/],
    ["a feed older than the limit", { provenanceStatus: "available" as const, feedStale: false, generatedAt: hoursAgo(SITE_INJURY_MAX_AGE_HOURS + 5) }, /hours old \(limit 48\)/],
    ["a feed with no readable timestamp", { provenanceStatus: "available" as const, feedStale: false, generatedAt: null }, /no readable generation time/],
    ["a feed timestamped in the future", { provenanceStatus: "available" as const, feedStale: false, generatedAt: hoursAgo(-30) }, /in the future/],
  ])("%s is unavailable", (_name, feed, reason) => {
    const ctx = assessSiteAvailability(packetWithInjuryFeed({ ...feed, injuries: [injury("Someone", "buf", "QB", "out")] }), NOW);
    expect(ctx.status).toBe("unavailable");
    if (ctx.status === "unavailable") expect(ctx.reason).toMatch(reason);
  });

  it("the edge of the freshness window is inclusive of the limit", () => {
    expect(assessSiteAvailability(packetWithInjuryFeed({ provenanceStatus: "available", feedStale: false, generatedAt: hoursAgo(SITE_INJURY_MAX_AGE_HOURS) }), NOW).status).toBe("current");
  });

  it("a current feed with no designations says so rather than implying anything else", () => {
    const prompt = stageA("grok", packetWithInjuryFeed({ provenanceStatus: "available", feedStale: false, generatedAt: hoursAgo(1), injuries: [] }));
    expect(prompt).toContain("  away (LAC): no designations listed");
    expect(prompt).toContain("  home (BUF): no designations listed");
  });
});

describe.each(PROVIDERS)("site-only prompts (%s)", (model) => {
  it("omit weather entirely (no local weather provider) and do not tell the model to research it", () => {
    for (const prompt of [stageA(model), stageB(model)]) {
      expect(prompt).not.toMatch(/^weather:/m);
      expect(prompt).not.toMatch(/AI-researched/);
    }
  });

  it("7. Stage A stays market blind", () => {
    const prompt = stageA(model, FRESH_FEED);
    expect(auditStageAPromptForMarketPricing(prompt, sanitizeGameContextPacketForBlindStageA(FRESH_FEED), filterEvidenceRecordsForBlindStageA([]))).toEqual({ pass: true, findings: [] });
    for (const token of ["draftkings", "sportsbook=", "spread(home)=", "jkbModels", "powerRating", "projectedSpread", "modelMarketEdge"]) expect(prompt).not.toContain(token);
    expect(prompt).not.toMatch(/"market"\s*:/);
  });

  it("8. Stage B receives the locked Stage A and the current market context", () => {
    const prompt = stageB(model);
    expect(prompt).toContain("=== YOUR LOCKED FOOTBALL PROJECTION (immutable) ===");
    expect(prompt).toContain("=== CURRENT MARKET");
    expect(prompt).toContain(V2_MARKET_MINUS_7.sideLabels.home);
    expect(prompt).toContain(V2_MARKET_MINUS_7.sideLabels.away);
  });

  it("13. state that no external evidence exists and that every evidence array must be empty", () => {
    for (const prompt of [stageA(model), stageB(model)]) {
      expect(prompt).toContain("no external evidence is supplied in this run");
      expect(prompt).toContain("every evidenceRefs / evidenceRefsUsed array must be empty, []");
      expect(prompt).not.toContain("Cite evidence ONLY by its short reference");
      expect(prompt).toContain("This run uses JKB site data only");
      // the live-research rule ("every claim must come from a cited evidence record") is replaced, not stacked
      expect(prompt).not.toContain("must come from a cited evidence record");
    }
  });

  it("carry the football data Stage A reasons from: current form, recent window, prior-season baseline, trenches, schedule", () => {
    const prompt = stageA(model);
    for (const needle of ["teamForm (CURRENT-SEASON deterministic facts", "recentWindow", "teamMetrics.epa", "teamMetrics.priorSeasonBaseline", "matchup.trenches", "schedule: kickoff=", "coaching (descriptive facts only)", "situational:"]) expect(prompt).toContain(needle);
    expect(prompt).toContain("record=0-2");
    expect(prompt).toContain("score=14-26");
  });

  it("the live-research prompt (no site context) is unchanged: it keeps the weather line and the evidence rule", () => {
    const live = buildStageAV2Prompt({ provider: model, game: V2_GAME, packet: V2_PACKET, evidenceLines: [], evidenceAliases: aliases(model) });
    expect(live).toMatch(/^weather:/m);
    expect(live).toContain("must come from a cited evidence record");
    expect(live).not.toContain("availability: UNAVAILABLE");
  });
});

describe("12. Grok and ChatGPT get the same site-only prompts", () => {
  const unify = (prompt: string) => prompt.replace(/"model": "(grok|chatgpt)"/, '"model": "<provider>"');
  it("byte-identical apart from the model name, current or unavailable", () => {
    for (const packet of [V2_PACKET, FRESH_FEED, STALE_FEED]) {
      expect(unify(stageA("grok", packet))).toBe(unify(stageA("chatgpt", packet)));
      expect(unify(stageB("grok", packet))).toBe(unify(stageB("chatgpt", packet)));
    }
  });
});

/* -------------------------------------------------------------------------- */
/* no external lookups; no evidence                                           */
/* -------------------------------------------------------------------------- */

describe("6. no external evidence enters a site-only run", () => {
  const artifact = { evidence: V2_EVIDENCE.grok.all, fixture: false };

  it("site-only selects NO evidence whatever exists on disk, and needs no artifact", () => {
    expect(selectHandicapEvidence("site-only", artifact)).toEqual([]);
    expect(selectHandicapEvidence("site-only", null)).toEqual([]);
  });

  it("live selects the real research evidence and ignores a fixture artifact", () => {
    expect(selectHandicapEvidence("live", artifact)).toHaveLength(V2_EVIDENCE.grok.all.length);
    expect(selectHandicapEvidence("live", { ...artifact, fixture: true })).toEqual([]);
    expect(selectHandicapEvidence("live", null)).toEqual([]);
  });

  it("the one-game CLI reads the evidence artifact only in live mode", () => {
    const source = readFileSync(join(__dirname, "..", "run-nfl-handicap-v2.ts"), "utf8");
    expect(source).toMatch(/if \(researchMode === "live"\) \{[\s\S]*readEvidenceArtifact\(/);
    expect(source.match(/readEvidenceArtifact\(/g)).toHaveLength(1);
  });

  it("the provider transports send no `tools` (no web search) in either mode", async () => {
    const { runGrokHandicapV2Stage } = await import("./nfl-grok-analysis-adapter");
    const { runChatGptHandicapV2Stage } = await import("./nfl-chatgpt-analysis-adapter");
    for (const run of [runGrokHandicapV2Stage, runChatGptHandicapV2Stage]) {
      let body: Record<string, unknown> = {};
      const fetchImpl = (async (_url: string, init: { body: string }) => {
        body = JSON.parse(init.body);
        return { ok: false, status: 500, text: async () => "boom" };
      }) as unknown as typeof fetch;
      await run({ stage: "A", prompt: "P", apiKey: "k", fetchImpl });
      expect(body).not.toHaveProperty("tools");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* validation with evidence = []                                              */
/* -------------------------------------------------------------------------- */

describe.each(PROVIDERS)("validators with no external evidence (%s)", (model) => {
  const aCtx = (): StageAV2ValidationContext => ({ model, gameId: V2_GAME_ID, generatedAt: V2_STAGE_A_TIME, contextHash: V2_CONTEXT_HASH, homeTeam: "buf", awayTeam: "lac", contextPacket: V2_PACKET, allEvidenceRecords: [] });
  const bCtx = (current = false): StageBV2ValidationContext => ({ model, gameId: V2_GAME_ID, generatedAt: V2_STAGE_B_TIME, contextHash: V2_CONTEXT_HASH, game: V2_GAME, lockedStageA: trustedStageA(model), market: V2_MARKET_MINUS_7, contextPacket: V2_PACKET, allEvidenceRecords: [], localAvailabilityCurrent: current });
  const empty = buildEvidenceAliasMap([], model);
  const factOnlyA = () => {
    const raw = stageARaw(model) as { keyDrivers: Array<Record<string, unknown>> };
    return { ...raw, keyDrivers: [raw.keyDrivers[0], raw.keyDrivers[1], { summary: raw.keyDrivers[2].summary, factRefs: [V2_FACT_REFS.bufPoints], evidenceRefs: [] }] };
  };
  const factOnlyB = (over = {}) => stageBRaw(model, { injuryParagraph: null, evidenceRefs: [], ...over });

  it("13. Stage A validates with evidenceRefs = [] and factRefs only; the resolver keeps them empty and rejects any reference", () => {
    const resolved = resolveStageAEvidenceAliases(factOnlyA(), empty);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const result = validateStageAV2(resolved.raw, aCtx());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.analysis.keyDrivers.flatMap((d) => d.evidenceRefs)).toEqual([]);
    const raw = factOnlyA() as { keyDrivers: Array<Record<string, unknown>> };
    expect(resolveStageAEvidenceAliases({ ...raw, keyDrivers: [{ ...raw.keyDrivers[0], evidenceRefs: ["E1"] }] }, empty).ok).toBe(false);
  });

  it("Stage B validates with evidenceRefsUsed = [] and no injury language", () => {
    const resolved = resolveStageBEvidenceAliases(factOnlyB(), empty);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const result = validateStageBV2(resolved.raw, bCtx());
    expect(result.ok, result.ok ? "" : result.reasons.join(" | ")).toBe(true);
    if (result.ok) expect(result.analysis.evidenceRefsUsed).toEqual([]);
  });

  it("unavailable or stale injury data: injury claims are rejected (no evidence record can back them)", () => {
    const withInjuryProse = stageBRaw(model, { evidenceRefs: [], factRefs: [V2_FACT_REFS.lacPoints, V2_FACT_REFS.bufPoints] });
    const result = validateStageBV2(withInjuryProse, bCtx(false));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join(" ")).toMatch(/injury\/availability claims but evidenceRefsUsed is empty/);
  });

  it("current local injury data: injury claims are accepted only when the write-up cites an availability factRef", () => {
    const base = { evidenceRefs: [] as string[] };
    const cited = stageBRaw(model, { ...base, factRefs: [V2_FACT_REFS.lacPoints, "availability.injuries"] });
    const ok = validateStageBV2(cited, bCtx(true));
    expect(ok.ok, ok.ok ? "" : ok.reasons.join(" | ")).toBe(true);
    const uncited = stageBRaw(model, { ...base, factRefs: [V2_FACT_REFS.lacPoints, V2_FACT_REFS.bufPoints] });
    expect(validateStageBV2(uncited, bCtx(true)).ok).toBe(false);
    // a current feed does not loosen anything else: the flag alone, without the citation, changes nothing
    expect(validateStageBV2(cited, bCtx(false)).ok).toBe(false);
  });

  it("14. a site-only record (no evidence, no research) is publishable and builds a public card", () => {
    const stageAResult = validateStageAV2(factOnlyA(), aCtx());
    expect(stageAResult.ok).toBe(true);
    const stageBResult = validateStageBV2(factOnlyB(), bCtx());
    expect(stageBResult.ok).toBe(true);
    if (!stageAResult.ok || !stageBResult.ok) return;
    const record = buildHandicapV2Record({ stageA: stageAResult.analysis, stageB: stageBResult.analysis, market: V2_MARKET_MINUS_7, evidenceRecords: [], researchMode: "site-only" });
    expect(record.evidenceRefsUsed).toEqual([]);
    expect(record.keyDrivers.flatMap((d) => d.evidenceRefs)).toEqual([]);
    expect(record.sources.every((s) => s.url === null)).toBe(true);
    expect(isPublishableHandicapV2Record(record, V2_GAME_ID, model)).toBe(true);
    const dir = mkdtempSync(join(tmpdir(), "nfl-ai-v2-site-record-"));
    try {
      writeHandicapV2Record(dir, 2026, 3, record);
      expect(readLatestPublishableHandicapV2Record(dir, 2026, 3, V2_GAME_ID, model)).toEqual(record);
      const card = buildHandicapV2PublicCard(record, model === "grok" ? "Grokowski" : "Chatty Ice");
      expect(card.verdict).toBe(record.verdict);
      expect(card.sources.every((s) => s.url === null)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/* -------------------------------------------------------------------------- */
/* telemetry                                                                  */
/* -------------------------------------------------------------------------- */

describe("usage telemetry: tokens reported separately, no invented OpenAI dollar figure", () => {
  const usage = (input: number, output: number, reasoning: number, cached: number) => ({ inputTokens: input, outputTokens: output, reasoningTokens: reasoning, cachedTokens: cached, totalTokens: input + output });
  const chatgpt = (u: ReturnType<typeof usage>, firstAttempt?: ReturnType<typeof usage>): TelemetryMarkerRecord =>
    ({ schemaVersion: TELEMETRY_SCHEMA_VERSION, kind: "handicap", provider: "chatgpt", gameId: GAME_ID, cliMode: "initial", stage: "A", telemetry: { mode: "stageAInitial", usage: u, costUsd: null, firstAttempt: firstAttempt ? { usage: firstAttempt } : null } }) as unknown as TelemetryMarkerRecord;
  const grok = (u: ReturnType<typeof usage>, costUsd: number): TelemetryMarkerRecord =>
    ({ schemaVersion: TELEMETRY_SCHEMA_VERSION, kind: "handicap", provider: "grok", gameId: GAME_ID, cliMode: "initial", stage: "B", telemetry: { mode: "stageBInitial", usage: u, costUsd } }) as unknown as TelemetryMarkerRecord;

  it("counts the billed first attempt of a ChatGPT truncation retry, which `usage` alone omits", () => {
    const retried = chatgpt(usage(10_000, 3_500, 2_000, 0), usage(10_000, 5_000, 4_800, 0));
    expect(recordTokenUsage(retried)).toEqual({ input: 20_000, cached: 0, output: 8_500, reasoning: 6_800, total: 28_500 });
    expect(recordTokenUsage(chatgpt(usage(10_000, 3_500, 2_000, 0)))).toMatchObject({ total: 13_500 });
  });

  it("reports input / cached / output / reasoning separately per provider; OpenAI cost stays null (not estimated), xAI's own figure is shown", () => {
    const rows = aggregateUsageByProvider([chatgpt(usage(10_000, 3_500, 2_000, 1_000)), chatgpt(usage(12_000, 2_500, 1_500, 0)), grok(usage(9_000, 3_000, 1_000, 0), 0.0412)]);
    const gpt = rows.find((r) => r.provider === "chatgpt")!;
    expect(gpt).toMatchObject({ callsWithTelemetry: 2, totalCostUsd: null, tokens: { input: 22_000, cached: 1_000, output: 6_000, reasoning: 3_500, total: 28_000 } });
    const line = formatUsageLine("Stage A/B handicap", gpt);
    expect(line).toContain("tokens in 22,000 (cached 1,000), out 6,000 (reasoning 3,500), total 28,000");
    expect(line).toContain("cost not reported by the provider API -- tokens only, no dollar figure is estimated");
    expect(line).not.toMatch(/\$/);
    const xai = formatUsageLine("Stage A/B handicap", rows.find((r) => r.provider === "grok")!);
    expect(xai).toContain("$0.0412 (provider-reported)");
  });

  it("reports an unreported field as n/a, never as zero", () => {
    const sparse = chatgpt({ inputTokens: null, outputTokens: null, reasoningTokens: null, cachedTokens: null, totalTokens: null });
    expect(formatUsageLine("research", aggregateUsageByProvider([sparse])[0])).toContain("tokens in n/a (cached n/a), out n/a (reasoning n/a), total n/a");
  });
});
