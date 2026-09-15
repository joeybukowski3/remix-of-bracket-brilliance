/**
 * WU6 -- provider-neutral production orchestrator for an entire NFL slate.
 *
 * Determines, per (game, provider), the cheapest correct next action for
 * context / research / handicap, then runs only what is necessary. Reuses
 * the existing validated production pieces end to end -- see
 * scripts/lib/nfl-ai-slate-plan.ts (zero-cost planning) and
 * scripts/lib/nfl-ai-slate-executor.ts (stage execution) for the contracts
 * this script coordinates. Does NOT redesign context/research/handicap
 * internals.
 *
 * Usage:
 *   npx tsx scripts/run-nfl-ai-handicap-slate.ts --season=2026 --week=1 --dry-run
 *   npx tsx scripts/run-nfl-ai-handicap-slate.ts --season=2026 --week=1 --live
 *   npx tsx scripts/run-nfl-ai-handicap-slate.ts --game=2026_01_DEN_KC --provider=grok --live
 *   npx tsx scripts/run-nfl-ai-handicap-slate.ts --season=2026 --week=1 --force-research --force-handicap --live
 *
 * --dry-run (default when neither --dry-run nor --live is given): makes ZERO
 * provider/API calls and zero persistent mutations. Prints the exact
 * execution plan and an estimated paid-call count.
 * --live: executes the plan for real, spending money on every research/
 * handicap action the plan calls for.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { planSlate, AI_SLATE_PROVIDERS, type GamePlan } from "./lib/nfl-ai-slate-plan";
import { executeGamePlan, type GameExecutionResult } from "./lib/nfl-ai-slate-executor";
import type { EvidenceModel } from "./lib/nfl-evidence-types";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface CliArgs {
  season: number;
  week: number | null;
  gameId: string | null;
  providers: EvidenceModel[];
  live: boolean;
  forceResearch: boolean;
  forceHandicap: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const flags = new Map<string, string[]>();
  let live = false;
  let dryRun = false;
  let forceResearch = false;
  let forceHandicap = false;
  for (const arg of argv) {
    if (arg === "--live") { live = true; continue; }
    if (arg === "--dry-run") { dryRun = true; continue; }
    if (arg === "--force-research") { forceResearch = true; continue; }
    if (arg === "--force-handicap") { forceHandicap = true; continue; }
    const match = /^--([a-z-]+)=(.+)$/.exec(arg);
    if (match) {
      const key = match[1];
      const existing = flags.get(key) ?? [];
      existing.push(match[2]);
      flags.set(key, existing);
    }
  }

  const providerValues = flags.get("provider");
  const providers = providerValues && providerValues.length > 0 ? (providerValues as EvidenceModel[]) : [...AI_SLATE_PROVIDERS];

  return {
    season: Number(flags.get("season")?.[0] ?? "2026"),
    week: flags.has("week") ? Number(flags.get("week")![0]) : null,
    gameId: flags.get("game")?.[0] ?? null,
    providers,
    // dry-run is the safe default: only --live actually spends money.
    live: live && !dryRun,
    forceResearch,
    forceHandicap,
  };
}

function countPaidCalls(plans: readonly GamePlan[]): { research: number; handicap: number; repricing: number } {
  let research = 0;
  let handicap = 0;
  let repricing = 0;
  for (const plan of plans) {
    for (const provider of Object.values(plan.providers)) {
      if (provider.research === "initial" || provider.research === "update") research += 1;
      if (provider.handicap === "initial" || provider.handicap === "update") handicap += 1; // Stage A + Stage B, billed as one pass (counted x2 below)
      if (provider.handicap === "repricing") repricing += 1; // Stage B ONLY -- one call, never x2
    }
  }
  return { research, handicap, repricing };
}

function printDryRunSummary(plans: readonly GamePlan[]): void {
  const locked = plans.filter((p) => p.locked).length;
  const blocked = plans.filter((p) => p.context === "blocked").length;
  const eligible = plans.length - locked - blocked;

  const byAction: Record<string, number> = {};
  const bump = (key: string) => { byAction[key] = (byAction[key] ?? 0) + 1; };

  for (const plan of plans) {
    for (const [provider, action] of Object.entries(plan.providers)) {
      if (action.research !== "none") bump(`${provider} research ${action.research}`);
      if (action.handicap !== "none") bump(`${provider} handicap ${action.handicap}`);
      if (action.research === "none" && action.handicap === "none") bump("no-op provider states");
    }
  }

  const { research, handicap, repricing } = countPaidCalls(plans);

  console.log(`\n=== DRY RUN PLAN ===`);
  console.log(`Games scanned: ${plans.length}`);
  console.log(`Eligible: ${eligible}`);
  console.log(`Locked: ${locked}`);
  console.log(`Blocked (context cannot be built): ${blocked}\n`);

  console.log("Planned:");
  for (const [key, count] of Object.entries(byAction).sort()) {
    console.log(`  ${key}: ${count}`);
  }

  console.log(
    `\nEstimated paid calls: ${research + handicap * 2 + repricing} (${research} research call(s) + ${handicap} handicap pass(es) x2 Stage A/B + ${repricing} repricing pass(es) x1 Stage B only)\n`
  );

  for (const plan of plans) {
    console.log(`${plan.gameId}${plan.locked ? " [LOCKED]" : ""}${plan.context === "blocked" ? " [BLOCKED]" : ""}`);
    for (const action of Object.values(plan.providers)) {
      console.log(`  ${action.provider}: context=${plan.context} research=${action.research} (${action.researchReason}) handicap=${action.handicap} (${action.handicapReason})`);
    }
    console.log(`  presentation=${plan.presentation}`);
  }
}

function printLiveSummary(results: readonly GameExecutionResult[]): void {
  let contextRebuilds = 0;
  // WU6.4 -- "ran" only means a paid call was ATTEMPTED (a child process was actually spawned,
  // which is what costs money); it says nothing about whether that call ultimately succeeded.
  // Tracked separately from "ok" (successfully completed) so a summary reader can never mistake
  // an attempted-but-failed call (e.g. a research pass that paid for a response and then crashed
  // during local normalization) for a completed one.
  const researchAttemptsByProvider: Record<string, number> = {};
  const researchSuccessesByProvider: Record<string, number> = {};
  const researchFailuresByProvider: Record<string, number> = {};
  const handicapAttemptsByProvider: Record<string, number> = {};
  const handicapSuccessesByProvider: Record<string, number> = {};
  const handicapFailuresByProvider: Record<string, number> = {};
  let noOps = 0;
  let locked = 0;
  let presentationWrites = 0;
  const structuredFailures: string[] = [];
  let gamesOk = 0;

  for (const result of results) {
    if (result.ok) gamesOk += 1;
    if (result.context.action === "rebuild" && result.context.ran) contextRebuilds += 1;
    if (result.context.action === "blocked") locked += 1;
    if (result.presentation.ran && result.presentation.ok) presentationWrites += 1;
    for (const provider of result.providers) {
      if (provider.research.ran) {
        researchAttemptsByProvider[provider.provider] = (researchAttemptsByProvider[provider.provider] ?? 0) + 1;
        const target = provider.research.ok ? researchSuccessesByProvider : researchFailuresByProvider;
        target[provider.provider] = (target[provider.provider] ?? 0) + 1;
      }
      if (provider.handicap.ran) {
        handicapAttemptsByProvider[provider.provider] = (handicapAttemptsByProvider[provider.provider] ?? 0) + 1;
        const target = provider.handicap.ok ? handicapSuccessesByProvider : handicapFailuresByProvider;
        target[provider.provider] = (target[provider.provider] ?? 0) + 1;
      }
      if (!provider.research.ran && !provider.handicap.ran) noOps += 1;
    }
    for (const failure of result.failures) structuredFailures.push(`${result.gameId}: ${failure}`);
  }

  console.log(`\n=== LIVE RUN SUMMARY ===`);
  console.log(`Games scanned: ${results.length}`);
  console.log(`Games successfully processed: ${gamesOk}`);
  console.log(`Locked/blocked: ${locked}`);
  console.log(`Context rebuilds: ${contextRebuilds}`);
  console.log(`Research paid-call attempts by provider: ${JSON.stringify(researchAttemptsByProvider)}`);
  console.log(`Research successes by provider: ${JSON.stringify(researchSuccessesByProvider)}`);
  console.log(`Research failures by provider: ${JSON.stringify(researchFailuresByProvider)}`);
  console.log(`Handicap (Stage A+B) paid-call attempts by provider: ${JSON.stringify(handicapAttemptsByProvider)}`);
  console.log(`Handicap (Stage A+B) successes by provider: ${JSON.stringify(handicapSuccessesByProvider)}`);
  console.log(`Handicap (Stage A+B) failures by provider: ${JSON.stringify(handicapFailuresByProvider)}`);
  console.log(`No-op provider states: ${noOps}`);
  console.log(`Presentation artifacts written: ${presentationWrites}`);
  console.log(`\nStructured failures (${structuredFailures.length}):`);
  for (const failure of structuredFailures) console.log(`  - ${failure}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const plans = planSlate({
    root: ROOT,
    season: args.season,
    week: args.week ?? undefined,
    gameId: args.gameId ?? undefined,
    providers: args.providers,
    forceResearch: args.forceResearch,
    forceHandicap: args.forceHandicap,
  });

  if (plans.length === 0) {
    console.log("No eligible games found for the requested season/week/game.");
    return;
  }

  if (!args.live) {
    printDryRunSummary(plans);
    return;
  }

  const results: GameExecutionResult[] = [];
  for (const plan of plans) {
    // Failure isolation: one game throwing/failing must never stop the slate.
    try {
      results.push(executeGamePlan(plan, { root: ROOT, live: true }));
    } catch (err) {
      results.push({
        gameId: plan.gameId,
        ok: false,
        context: { stage: "context", action: "error", ran: true, ok: false, detail: err instanceof Error ? err.message : String(err) },
        providers: [],
        presentation: { stage: "presentation", action: "skip", ran: false, ok: false, detail: "game crashed before presentation" },
        failures: [`unhandled: ${err instanceof Error ? err.message : String(err)}`],
      });
    }
  }

  printLiveSummary(results);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
