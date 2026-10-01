/**
 * AI Picks v2 automation -- executes a V2GamePlan (nfl-ai-v2-slate-plan.ts) for
 * one game. Like the v1 executor it reuses, never re-implements, the validated
 * stages, each dispatched through the ONE injectable `runCommand` (tests
 * substitute a fake, so nothing here makes a real provider call in a test):
 *
 *   context       in-process, free (rebuildAndPersistGameContext)
 *   research      scripts/run-nfl-<provider>-research.ts  (initial | update),
 *                 preceded by the zero-cost snapshot bootstrap the update mode needs
 *   handicap      scripts/run-nfl-handicap-v2.ts --mode=full | repricing
 *   presentation  in-process, free (generatePresentationForGame) -- ONLY for a
 *                 game whose newest v2 record the published artifact does not show
 *
 * Failure isolation: nothing here throws. A failing provider, research pass,
 * Stage A/B validation or game is captured as a structured StageOutcome and never
 * stops the other provider or any other game. A failed paid attempt is written
 * to the attempt ledger so the next scheduled run does not simply repeat it.
 */
import { rebuildAndPersistGameContext } from "./nfl-game-context-preflight";
import { executeResearchStage, runScript, spawnTsxCommandRunner, writePresentation, type CommandRunner, type StageOutcome } from "./nfl-ai-slate-executor";
import { parseTelemetryMarkers } from "./nfl-ai-telemetry";
import { readAttemptLedger, truncateError, writeAttemptLedger } from "./nfl-ai-v2-attempt-ledger";
import { parseHandicapFailure } from "./nfl-ai-v2-failure";
import { gatherProviderFacts, handicapInputKey, isPresentationStale, planProviderV2, type V2GameFacts, type V2GamePlan, type V2HandicapStep, type V2PlanOptions, type V2ProviderFacts, type V2ProviderPlan } from "./nfl-ai-v2-slate-plan";
import type { EvidenceModel } from "./nfl-evidence-types";

const HANDICAP_SCRIPT = "scripts/run-nfl-handicap-v2.ts";

export interface V2ExecuteOptions extends V2PlanOptions {
  root: string;
  /** false = report only: no command is run and nothing is written. */
  live: boolean;
  runCommand?: CommandRunner;
  /** Test seams; default to the real free local readers/writers. */
  deps?: {
    rebuildContext?: () => StageOutcome;
    regatherProviderFacts?: (provider: EvidenceModel) => V2ProviderFacts;
    presentationIsStale?: (provider: EvidenceModel) => boolean;
    writeGamePresentation?: () => string;
  };
}

export interface V2ProviderResult {
  provider: EvidenceModel;
  plannedAction: V2ProviderPlan["action"];
  /** What the handicap stage actually resolved to after any research pass ("none" when nothing ran). */
  handicapAction: V2HandicapStep;
  research: StageOutcome;
  handicap: StageOutcome;
}

export interface V2GameResult {
  gameId: string;
  ok: boolean;
  context: StageOutcome | null;
  providers: V2ProviderResult[];
  presentation: StageOutcome;
  failures: string[];
}

const skipped = (stage: StageOutcome["stage"], provider: EvidenceModel, detail: string): StageOutcome => ({ stage, provider, action: "none", ran: false, ok: true, detail });
const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

function needsResearchStage(plan: V2ProviderPlan): boolean {
  return plan.research !== "none";
}

function runResearch(runCommand: CommandRunner, live: boolean, gameId: string, provider: EvidenceModel, plan: V2ProviderPlan): StageOutcome {
  const step = (research: "initial" | "update" | "bootstrap") => executeResearchStage(runCommand, live, gameId, provider, { provider, research, researchReason: "", handicap: "none", handicapReason: "" });
  if (plan.research === "update" && plan.needsBootstrap) {
    const bootstrap = step("bootstrap");
    if (!bootstrap.ok) return { ...bootstrap, detail: `bootstrap failed: ${bootstrap.detail}` };
  }
  const research = step(plan.research as "initial" | "update");
  // A first pass has no snapshot lineage yet; seed it (zero cost) so later research UPDATES are possible.
  // Its failure never fails this run -- it only limits a future update, which will report the same.
  if (plan.research === "initial" && research.ok && research.ran) step("bootstrap");
  return research;
}

function runHandicap(runCommand: CommandRunner, live: boolean, gameId: string, provider: EvidenceModel, step: V2HandicapStep): StageOutcome {
  if (step === "none") return skipped("handicap", provider, "no handicap action needed");
  const mode = step === "repricing" ? "repricing" : "full";
  if (!live) return { stage: "handicap", provider, action: step, ran: false, ok: true, detail: `would run (dry-run): ${HANDICAP_SCRIPT} --provider=${provider} --game=${gameId} --mode=${mode} --live` };
  const result = runScript(runCommand, HANDICAP_SCRIPT, [`--provider=${provider}`, `--game=${gameId}`, `--mode=${mode}`, "--live"]);
  const telemetry = parseTelemetryMarkers(result.stdout);
  if (result.ok) return { stage: "handicap", provider, action: step, ran: true, ok: true, detail: "handicap pass completed", telemetry };
  // The child's stderr ends with the model's raw JSON on a validation failure. Only the classified, bounded diagnostic
  // leaves this function: it is what the attempt ledger (committed) and the run summary (logged) carry.
  const failure = parseHandicapFailure(result.stderr);
  return { stage: "handicap", provider, action: step, ran: true, ok: false, detail: failure.summary, failure: { kind: failure.kind, stage: failure.stage }, telemetry };
}

function recordFailures(options: V2ExecuteOptions, game: V2GameFacts, provider: EvidenceModel, research: StageOutcome, handicap: StageOutcome, attempt: { key: string; action: string } | null): void {
  if (!options.live) return;
  const ledger = readAttemptLedger(options.root, game.season, game.week, game.gameId, provider);
  const now = game.now.toISOString();
  const next = { ...ledger };
  if (research.ran && research.action !== "bootstrap") {
    if (research.ok) delete next.research;
    else next.research = { failedAt: now, mode: research.action, error: truncateError(research.detail) };
  }
  if (handicap.ran) {
    if (handicap.ok) delete next.handicap;
    else if (attempt) next.handicap = { failedAt: now, action: attempt.action, inputKey: attempt.key, kind: handicap.failure?.kind ?? "unknown", stage: handicap.failure?.stage ?? null, error: truncateError(handicap.detail) };
  }
  if (JSON.stringify(next) !== JSON.stringify(ledger)) writeAttemptLedger(options.root, game.season, game.week, game.gameId, provider, next);
}

function executeProvider(game: V2GameFacts, facts: V2ProviderFacts, plan: V2ProviderPlan, runCommand: CommandRunner, options: V2ExecuteOptions): V2ProviderResult {
  const { provider } = plan;
  let research: StageOutcome = skipped("research", provider, plan.reasons[0] ?? "no research needed");
  let handicap: StageOutcome = skipped("handicap", provider, plan.action === "blocked" ? plan.reasons[0] : "no handicap action needed");
  let handicapAction: V2HandicapStep = "none";

  try {
    if (plan.action === "blocked" || plan.action === "presentation_only" || plan.action === "none") return { provider, plannedAction: plan.action, handicapAction, research, handicap };

    let step: V2HandicapStep = plan.handicap;
    let stepFacts = facts;
    if (needsResearchStage(plan)) {
      research = runResearch(runCommand, options.live, game.gameId, provider, plan);
      // v1 rule kept: never run a handicap against a lineage a failed research/bootstrap step may have left inconsistent.
      if (research.ran && !research.ok) {
        handicap = { stage: "handicap", provider, action: plan.handicap, ran: false, ok: false, detail: `skipped: upstream research step failed (${research.detail})` };
        recordFailures(options, game, provider, research, handicap, null);
        return { provider, plannedAction: plan.action, handicapAction, research, handicap };
      }
      if (options.live) {
        // Re-read what the research pass just wrote: the failure-ledger key must describe the evidence a
        // retry would actually see, and a conditional plan only now learns whether Stage A must rerun.
        stepFacts = (options.deps?.regatherProviderFacts ?? ((p) => gatherProviderFacts(options.root, game, p)))(provider);
        if (plan.handicapConditional) step = planProviderV2(game, stepFacts, { ...options, researchAlreadyRan: true, evidenceChangedByResearch: stepFacts.evidence.stageAEvidenceHash !== facts.evidence.stageAEvidenceHash }).handicap;
      }
    }

    handicapAction = step;
    // The planner names the action the same way, so its failure guard recognises this exact attempt next run.
    const attemptAction = step === "repricing" ? "market_reprice" : plan.action === "handicap_initial" || plan.action === "research_initial" ? "handicap_initial" : "football_update";
    const attempt = { action: attemptAction, key: handicapInputKey(attemptAction, game, stepFacts) };
    handicap = runHandicap(runCommand, options.live, game.gameId, provider, step);
    recordFailures(options, game, provider, research, handicap, attempt);
  } catch (err) {
    handicap = { stage: "handicap", provider, action: plan.handicap, ran: true, ok: false, detail: errorText(err) };
  }
  return { provider, plannedAction: plan.action, handicapAction, research, handicap };
}

/** Free, in-process: the research/bootstrap scripts read the persisted context, so refresh it before any of them runs. */
function rebuildContext(game: V2GameFacts, options: V2ExecuteOptions): StageOutcome {
  if (options.deps?.rebuildContext) return options.deps.rebuildContext();
  try {
    const rebuilt = rebuildAndPersistGameContext({ root: options.root, gameId: game.gameId, season: game.season, week: game.week, now: () => game.now });
    return { stage: "context", action: "rebuild", ran: true, ok: rebuilt.ok, detail: rebuilt.ok ? `wrote ${rebuilt.contextArtifactPath}` : `${rebuilt.reason}${rebuilt.issues.length ? ` -- ${rebuilt.issues.join("; ")}` : ""}` };
  } catch (err) {
    return { stage: "context", action: "rebuild", ran: true, ok: false, detail: errorText(err) };
  }
}

export function executeGamePlanV2(game: V2GameFacts, providerFacts: readonly V2ProviderFacts[], plan: V2GamePlan, options: V2ExecuteOptions): V2GameResult {
  const runCommand = options.runCommand ?? spawnTsxCommandRunner(options.root);
  const failures: string[] = [];

  const anyResearch = Object.values(plan.providers).some(needsResearchStage);
  const context = anyResearch && options.live ? rebuildContext(game, options) : null;
  if (context && !context.ok) failures.push(`context: ${context.detail}`);

  const providers: V2ProviderResult[] = [];
  for (const facts of providerFacts) {
    const providerPlan = plan.providers[facts.provider];
    const result =
      context && !context.ok && needsResearchStage(providerPlan)
        ? { provider: facts.provider, plannedAction: providerPlan.action, handicapAction: "none" as const, research: { ...skipped("research", facts.provider, "skipped: context rebuild failed"), ok: false }, handicap: skipped("handicap", facts.provider, "skipped: context rebuild failed") }
        : executeProvider(game, facts, providerPlan, runCommand, options);
    if (!result.research.ok) failures.push(`${facts.provider} research: ${result.research.detail}`);
    if (!result.handicap.ok) failures.push(`${facts.provider} handicap: ${result.handicap.detail}`);
    providers.push(result);
  }

  const stale = (provider: EvidenceModel) => (options.deps?.presentationIsStale ?? ((p) => isPresentationStale(options.root, game.season, game.week, game.gameId, p)))(provider);
  const presentation = executePresentation(game, plan, providers, stale, options);
  if (!presentation.ok) failures.push(`presentation: ${presentation.detail}`);

  const ok = failures.length === 0;
  return { gameId: game.gameId, ok, context, providers, presentation, failures };
}

/** Regenerates this ONE game's artifact iff the newest v2 record for some provider is not what the published artifact shows. */
function executePresentation(game: V2GameFacts, plan: V2GamePlan, providers: readonly V2ProviderResult[], isStale: (provider: EvidenceModel) => boolean, options: V2ExecuteOptions): StageOutcome {
  if (plan.presentation === "skip") return { stage: "presentation", action: "skip", ran: false, ok: true, detail: "no provider record changed and the published artifact is current" };
  if (!options.live) return { stage: "presentation", action: "regenerate", ran: false, ok: true, detail: "would regenerate (dry-run) if a record is written or the published artifact lags" };
  const providerNames = providers.map((p) => p.provider);
  if (!providerNames.some(isStale)) return { stage: "presentation", action: "skip", ran: false, ok: true, detail: "no new v2 record was written and the published artifact is current" };
  try {
    const path = options.deps?.writeGamePresentation ? options.deps.writeGamePresentation() : writePresentation(options.root, game.gameId, game.season, game.week);
    return { stage: "presentation", action: "regenerate", ran: true, ok: true, detail: `wrote ${path}` };
  } catch (err) {
    return { stage: "presentation", action: "regenerate", ran: true, ok: false, detail: errorText(err) };
  }
}
