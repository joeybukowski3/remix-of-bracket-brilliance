/**
 * AI Picks v2 -- scheduled/operator slate orchestrator. One command replaces
 * running research, then the v2 handicap, then the presentation exporter game by
 * game: it plans every game of the week for each provider WITHOUT any model call
 * (scripts/lib/nfl-ai-v2-slate-plan.ts), then runs only what is necessary.
 *
 *   npx tsx scripts/run-nfl-ai-handicap-v2-slate.ts --season=2026 --week=3            # dry run (default)
 *   npx tsx scripts/run-nfl-ai-handicap-v2-slate.ts --season=2026 --week=3 --live     # spends money
 *   npx tsx scripts/run-nfl-ai-handicap-v2-slate.ts --game=2026_03_LAC_BUF --provider=grok --live
 *
 * Flags: --season (default: current year) --week (default: the week of the next
 * game to kick off) --game --provider=grok|chatgpt (repeatable)
 *        --research-mode=site-only|live   (default site-only: JKB site data -> Stage A -> Stage B, ZERO research calls;
 *                      live: the original lifecycle with paid provider research passes, opt-in only)
 *        --force-research --force-handicap --retry-failed
 *        --max-jobs=N  execute at most N paid provider/game jobs (soonest kickoff first); the rest are
 *                      deferred and re-planned next run. Applied to the plan BEFORE any paid call.
 *
 * Dry run is the default: zero provider calls, zero writes. Only --live spends.
 * Exit code 1 in live mode when anything failed (successful games are still
 * exported); the failures are listed in the summary.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { aggregateUsageByProvider, formatUsageLine, type TelemetryMarkerRecord } from "./lib/nfl-ai-telemetry";
import { DEFAULT_RESEARCH_MODE, parseResearchMode, type ResearchMode } from "./lib/nfl-ai-v2-research-mode";
import { executeGamePlanV2, type V2ExecuteOptions, type V2GameResult } from "./lib/nfl-ai-v2-slate-executor";
import type { CommandRunner } from "./lib/nfl-ai-slate-executor";
import { AI_SLATE_PROVIDERS, applyJobLimit, planSlateEntriesV2, type JobLimitSummary, type SlateEntryV2, type V2GamePlan, type V2PlanOptions } from "./lib/nfl-ai-v2-slate-plan";
import type { EvidenceModel } from "./lib/nfl-evidence-types";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export interface SlateV2CliArgs {
  season: number;
  week: number | null;
  gameId: string | null;
  providers: EvidenceModel[];
  live: boolean;
  forceResearch: boolean;
  forceHandicap: boolean;
  retryFailed: boolean;
  /** null = no limit. */
  maxJobs: number | null;
  researchMode: ResearchMode;
}

/** A non-negative integer, or null when absent. Throws on anything else so a typo can never silently mean "unlimited". */
function parseMaxJobs(raw: string | undefined): number | null {
  if (raw == null || raw === "") return null;
  if (!/^\d+$/.test(raw)) throw new Error(`--max-jobs must be a non-negative integer, got "${raw}"`);
  return Number(raw);
}

export function parseSlateV2Args(argv: string[], defaultSeason: number = new Date().getUTCFullYear()): SlateV2CliArgs {
  const flags = new Map<string, string[]>();
  const bool = new Set<string>();
  for (const arg of argv) {
    const match = /^--([a-z-]+)=(.+)$/.exec(arg);
    if (match) flags.set(match[1], [...(flags.get(match[1]) ?? []), match[2]]);
    else if (arg.startsWith("--")) bool.add(arg.slice(2));
  }
  const providers = (flags.get("provider") ?? [...AI_SLATE_PROVIDERS]).filter((p): p is EvidenceModel => p === "grok" || p === "chatgpt");
  return {
    season: Number(flags.get("season")?.[0] ?? defaultSeason),
    week: flags.has("week") ? Number(flags.get("week")![0]) : null,
    gameId: flags.get("game")?.[0] ?? null,
    providers: providers.length > 0 ? providers : [...AI_SLATE_PROVIDERS],
    // Dry run is the safe default: only --live spends, and --dry-run always wins.
    live: bool.has("live") && !bool.has("dry-run"),
    forceResearch: bool.has("force-research"),
    forceHandicap: bool.has("force-handicap"),
    retryFailed: bool.has("retry-failed"),
    maxJobs: parseMaxJobs(flags.get("max-jobs")?.[0]),
    // Strict: a typo must never silently select the paid "live" mode.
    researchMode: parseResearchMode(flags.get("research-mode")?.[0]),
  };
}

/* -------------------------------------------------------------------------- */
/* Dry-run report                                                             */
/* -------------------------------------------------------------------------- */

export interface CallEstimate {
  research: number;
  stageA: number;
  stageB: number;
  /** Extra calls that happen only if a research pass turns up new Stage A-visible evidence (upper bound). */
  conditionalStageA: number;
  conditionalStageB: number;
  presentations: number;
}

/** Expected paid calls implied by a set of plans. Pure. */
export function estimateCalls(plans: readonly V2GamePlan[]): CallEstimate {
  const total: CallEstimate = { research: 0, stageA: 0, stageB: 0, conditionalStageA: 0, conditionalStageB: 0, presentations: 0 };
  for (const plan of plans) {
    if (plan.presentation === "regenerate") total.presentations += 1;
    for (const p of Object.values(plan.providers)) {
      if (p.research !== "none") total.research += 1;
      const stageA = p.handicap === "initial" || p.handicap === "update";
      const stageB = stageA || p.handicap === "repricing";
      if (p.handicapConditional) {
        total.conditionalStageA += stageA ? 1 : 0;
        total.conditionalStageB += stageB ? 1 : 0;
      } else {
        total.stageA += stageA ? 1 : 0;
        total.stageB += stageB ? 1 : 0;
      }
    }
  }
  return total;
}

export function formatDryRunReport(plans: readonly V2GamePlan[], limit?: { summary: JobLimitSummary; unlimitedPlans: readonly V2GamePlan[] }, researchMode: ResearchMode = DEFAULT_RESEARCH_MODE): string {
  const lines: string[] = [];
  const byAction: Record<string, number> = {};
  for (const plan of plans) for (const p of Object.values(plan.providers)) { const key = p.deferred ? "deferred" : p.action; byAction[key] = (byAction[key] ?? 0) + 1; }
  const locked = plans.filter((p) => p.locked);
  const blocked = plans.flatMap((plan) => Object.values(plan.providers).filter((p) => p.action === "blocked" && p.blockedKind !== "locked").map((p) => ({ plan, p })));
  const est = estimateCalls(plans);

  lines.push("=== V2 SLATE DRY RUN (no provider calls, nothing written) ===");
  lines.push(researchMode === "site-only" ? "Research mode: site-only -- JKB site data only; no provider research pass and no web search (research calls = 0 by construction)" : "Research mode: live -- paid provider research passes may run (opt-in)");
  lines.push(`Games considered: ${plans.length}   post-kickoff locks: ${locked.length}   provider states blocked (not locked): ${blocked.length}`);
  lines.push(`Actions: ${Object.entries(byAction).sort().map(([k, v]) => `${k}=${v}`).join("  ") || "(none)"}`);
  if (limit) {
    const { summary } = limit;
    lines.push(`Paid jobs (provider x game): ${summary.totalJobs} planned   executing${summary.maxJobs != null ? ` under --max-jobs=${summary.maxJobs}` : " (no limit)"}: ${summary.executing}   deferred: ${summary.deferred}`);
  }
  lines.push(
    `Expected calls${limit && limit.summary.deferred > 0 ? " for the selected execution set" : ""}: ${est.research} research, ${est.stageA} Stage A, ${est.stageB} Stage B` +
      (est.conditionalStageA + est.conditionalStageB > 0 ? `  (+ up to ${est.conditionalStageA} Stage A / ${est.conditionalStageB} Stage B only if a research pass adds new evidence)` : "") +
      `   presentations to regenerate: ${est.presentations}`
  );
  if (limit && limit.summary.deferred > 0) {
    const all = estimateCalls(limit.unlimitedPlans);
    lines.push(`Expected calls if unlimited: ${all.research} research, ${all.stageA} Stage A, ${all.stageB} Stage B` + (all.conditionalStageA + all.conditionalStageB > 0 ? `  (+ up to ${all.conditionalStageA} Stage A / ${all.conditionalStageB} Stage B only if a research pass adds new evidence)` : ""));
  }
  lines.push("Cost: no dollar estimate is made without a model call; the live summary reports actual tokens/cost from telemetry.");
  lines.push("");
  for (const plan of plans) {
    lines.push(`${plan.gameId}  ${plan.awayTeam} @ ${plan.homeTeam}  kickoff ${plan.kickoffUtc ?? "?"}  phase=${plan.phase}${plan.locked ? " [LOCKED]" : ""}  presentation=${plan.presentation}`);
    for (const p of Object.values(plan.providers)) {
      const steps = [p.research !== "none" ? `research=${p.research}${p.needsBootstrap ? "(+bootstrap)" : ""}` : null, p.handicap !== "none" ? `handicap=${p.handicap}${p.handicapConditional ? "(conditional)" : ""}` : null].filter(Boolean).join(" ");
      lines.push(`  ${p.provider.padEnd(7)} ${p.deferred ? `DEFERRED (would be ${p.deferred.action})` : p.action}${p.blockedKind ? `[${p.blockedKind}]` : ""}${steps ? `  ${steps}` : ""}`);
      for (const reason of p.reasons) lines.push(`           - ${reason}`);
    }
  }
  return lines.join("\n");
}

/* -------------------------------------------------------------------------- */
/* Live run                                                                   */
/* -------------------------------------------------------------------------- */

export interface SlateV2RunOptions extends V2PlanOptions {
  /** Inherited: `researchMode` (default site-only). */
  root: string;
  season: number;
  week?: number;
  gameId?: string;
  providers?: readonly EvidenceModel[];
  live: boolean;
  runCommand?: CommandRunner;
  now?: () => Date;
  /** Execute at most this many paid provider/game jobs; null/omitted = unlimited. Applied before any paid call. */
  maxJobs?: number | null;
  /** Test seam: execute these pre-planned entries instead of planning from disk. */
  entries?: SlateEntryV2[];
  deps?: V2ExecuteOptions["deps"];
}

export interface SlateV2Run {
  /** Entries whose plans already have the job limit applied; these are what execute. */
  entries: SlateEntryV2[];
  limit: { summary: JobLimitSummary; unlimitedPlans: V2GamePlan[] };
  /** Empty in a dry run. */
  results: V2GameResult[];
}

/** Plans the slate and, only when `live`, executes it. Never throws for a game-level failure. */
export function runSlateV2(options: SlateV2RunOptions): SlateV2Run {
  const planned = options.entries ?? planSlateEntriesV2(options);
  // The limit is applied to the PLANS, before the executor exists to make a paid call.
  const { plans: limitedPlans, summary } = applyJobLimit(planned.map((e) => e.plan), options.maxJobs ?? null);
  const entries = planned.map((e, i) => ({ ...e, plan: limitedPlans[i] }));
  const limit = { summary, unlimitedPlans: planned.map((e) => e.plan) };
  if (!options.live) return { entries, limit, results: [] };
  const results: V2GameResult[] = [];
  for (const entry of entries) {
    try {
      results.push(executeGamePlanV2(entry.facts, entry.providers, entry.plan, { ...options, live: true, deps: options.deps }));
    } catch (err) {
      // Failure isolation: one game crashing must never stop the slate.
      const message = err instanceof Error ? err.message : String(err);
      const failed = { stage: "presentation" as const, action: "skip", ran: false, ok: false, detail: "game crashed" };
      results.push({ gameId: entry.plan.gameId, ok: false, context: null, providers: [], presentation: failed, failures: [`unhandled: ${message}`] });
    }
  }
  return { entries, limit, results };
}

export function formatLiveSummary(results: readonly V2GameResult[], researchMode: ResearchMode = DEFAULT_RESEARCH_MODE): string {
  const lines: string[] = ["=== V2 SLATE LIVE SUMMARY ==="];
  lines.push(`Research mode: ${researchMode}`);
  const tally = (pick: (r: V2GameResult["providers"][number]) => { ran: boolean; ok: boolean }) => {
    let attempted = 0;
    let succeeded = 0;
    for (const r of results) for (const p of r.providers) {
      const outcome = pick(p);
      if (outcome.ran) { attempted += 1; if (outcome.ok) succeeded += 1; }
    }
    return `${succeeded}/${attempted} succeeded`;
  };
  const research: TelemetryMarkerRecord[] = results.flatMap((r) => r.providers.flatMap((p) => p.research.telemetry ?? []));
  const handicap: TelemetryMarkerRecord[] = results.flatMap((r) => r.providers.flatMap((p) => p.handicap.telemetry ?? []));
  lines.push(`Games processed: ${results.length}   fully ok: ${results.filter((r) => r.ok).length}`);
  lines.push(`Research: ${tally((p) => p.research)}   Handicap: ${tally((p) => p.handicap)}   Presentations written: ${results.filter((r) => r.presentation.ran && r.presentation.ok).length}`);
  // Research and handicap spend are reported separately, so a site-only run visibly shows research = 0 calls.
  if (research.length === 0) lines.push(`Usage (research): 0 call(s)`);
  for (const t of aggregateUsageByProvider(research)) lines.push(formatUsageLine("research", t));
  for (const t of aggregateUsageByProvider(handicap)) lines.push(formatUsageLine("Stage A/B handicap", t));
  const failures = results.flatMap((r) => r.failures.map((f) => `${r.gameId}: ${f}`));
  lines.push(`Failures (${failures.length}):`);
  for (const f of failures) lines.push(`  - ${f}`);
  return lines.join("\n");
}

function main(): void {
  const args = parseSlateV2Args(process.argv.slice(2));
  const run = runSlateV2({
    root: ROOT,
    season: args.season,
    week: args.week ?? undefined,
    gameId: args.gameId ?? undefined,
    providers: args.providers,
    live: args.live,
    forceResearch: args.forceResearch,
    forceHandicap: args.forceHandicap,
    retryFailed: args.retryFailed,
    maxJobs: args.maxJobs,
    researchMode: args.researchMode,
  });
  if (run.entries.length === 0) {
    console.log("No games found for the requested season/week/game (offseason, or the schedule is not loaded).");
    return;
  }
  const plans = run.entries.map((e) => e.plan);
  console.log(formatDryRunReport(plans, run.limit, args.researchMode).replace("=== V2 SLATE DRY RUN (no provider calls, nothing written) ===", args.live ? "=== V2 SLATE PLAN (executing live) ===" : "=== V2 SLATE DRY RUN (no provider calls, nothing written) ==="));
  if (!args.live) return;
  console.log(`\n${formatLiveSummary(run.results, args.researchMode)}`);
  if (run.results.some((r) => !r.ok)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
