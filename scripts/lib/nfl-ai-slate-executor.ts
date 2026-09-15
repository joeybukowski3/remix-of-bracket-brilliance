/**
 * WU6 -- executes a GamePlan (nfl-ai-slate-plan.ts) for one game.
 *
 * Deliberately reuses, never re-implements, the existing production stages:
 *   - context: the shared preflight (nfl-game-context-preflight.ts), called
 *     in-process -- free, no API key.
 *   - research (initial/update) and handicap (initial/update): dispatched as
 *     child-process invocations of the EXACT same validated CLI scripts
 *     (run-nfl-<provider>-research.ts, run-nfl-<provider>-handicap.ts) that
 *     already own Stage A market-blind sanitization/audit, evidence
 *     normalization, pregame locking, and snapshot writing. This orchestrator
 *     decides WHETHER and WHEN to run them; it never re-derives what they do
 *     internally, per WU6's "do NOT redesign any of those systems."
 *   - bootstrap: the seed-snapshot scripts (bootstrap-nfl-<provider>-initial-snapshot.ts)
 *     -- zero-cost, no API key, dispatched the same way.
 *   - presentation: the exported, zero-cost generatePresentationForGame(),
 *     called in-process.
 *
 * The `runCommand` function is the ONE injection point paid stages go
 * through -- tests substitute a fake that never spawns a real process, so
 * this module (and everything above it) is fully testable without any real
 * Grok/OpenAI network call.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { rebuildAndPersistGameContext } from "./nfl-game-context-preflight";
import { generatePresentationForGame } from "../generate-nfl-ai-handicap-presentation";
import { nflAiHandicapArtifactPath } from "../../src/lib/nfl/aiHandicapPresentation";
import type { EvidenceModel } from "./nfl-evidence-types";
import type { GamePlan, ProviderPlan } from "./nfl-ai-slate-plan";

export interface CommandOutcome {
  command: string;
  args: string[];
  ok: boolean;
  exitCode: number | null;
  stderr: string;
}

export type CommandRunner = (command: string, args: string[]) => CommandOutcome;

/** Real, live command runner: spawns `npx tsx <script> <args>` synchronously. */
export function spawnTsxCommandRunner(root: string): CommandRunner {
  return (command, args) => {
    const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
    return {
      command,
      args,
      ok: result.status === 0,
      exitCode: result.status,
      stderr: result.status === 0 ? "" : (result.stderr ?? String(result.error ?? "unknown failure")),
    };
  };
}

export interface StageOutcome {
  stage: "context" | "research" | "handicap" | "presentation";
  provider?: EvidenceModel;
  action: string;
  ran: boolean;
  ok: boolean;
  detail: string;
}

export interface ProviderExecutionResult {
  provider: EvidenceModel;
  research: StageOutcome;
  handicap: StageOutcome;
}

export interface GameExecutionResult {
  gameId: string;
  ok: boolean;
  context: StageOutcome;
  providers: ProviderExecutionResult[];
  presentation: StageOutcome;
  failures: string[];
}

export interface ExecuteSlateOptions {
  root: string;
  live: boolean;
  runCommand?: CommandRunner;
  now?: () => Date;
}

function researchScriptFor(provider: EvidenceModel): string {
  return `scripts/run-nfl-${provider}-research.ts`;
}
function handicapScriptFor(provider: EvidenceModel): string {
  return `scripts/run-nfl-${provider}-handicap.ts`;
}
function bootstrapScriptFor(provider: EvidenceModel): string {
  return `scripts/bootstrap-nfl-${provider}-initial-snapshot.ts`;
}

function runScript(runCommand: CommandRunner, script: string, args: string[]): CommandOutcome {
  return runCommand("npx", ["tsx", script, ...args]);
}

function executeContextStage(root: string, gamePlan: GamePlan, now?: () => Date): StageOutcome {
  if (gamePlan.context === "reuse") {
    return { stage: "context", action: "reuse", ran: false, ok: true, detail: gamePlan.contextReason };
  }
  if (gamePlan.context === "blocked") {
    return { stage: "context", action: "blocked", ran: false, ok: false, detail: gamePlan.contextReason };
  }
  const rebuilt = rebuildAndPersistGameContext({ root, gameId: gamePlan.gameId, season: gamePlan.season, week: gamePlan.week, now });
  if (!rebuilt.ok) {
    return { stage: "context", action: "rebuild", ran: true, ok: false, detail: `${rebuilt.reason}${rebuilt.issues.length ? ` -- ${rebuilt.issues.join("; ")}` : ""}` };
  }
  return { stage: "context", action: "rebuild", ran: true, ok: true, detail: `wrote ${rebuilt.contextArtifactPath}` };
}

function executeResearchStage(runCommand: CommandRunner, live: boolean, gameId: string, provider: EvidenceModel, plan: ProviderPlan): StageOutcome {
  if (plan.research === "none") {
    return { stage: "research", provider, action: "none", ran: false, ok: true, detail: plan.researchReason };
  }
  if (plan.research === "bootstrap") {
    if (!live) return { stage: "research", provider, action: "bootstrap", ran: false, ok: true, detail: `would run (dry-run): ${bootstrapScriptFor(provider)} --game=${gameId}` };
    const result = runScript(runCommand, bootstrapScriptFor(provider), [`--game=${gameId}`]);
    return { stage: "research", provider, action: "bootstrap", ran: true, ok: result.ok, detail: result.ok ? "seeded initial snapshot lineage" : result.stderr };
  }
  // "initial" | "update"
  if (!live) return { stage: "research", provider, action: plan.research, ran: false, ok: true, detail: `would run (dry-run): ${researchScriptFor(provider)} --live --game=${gameId} --mode=${plan.research}` };
  const result = runScript(runCommand, researchScriptFor(provider), ["--live", `--game=${gameId}`, `--mode=${plan.research}`]);
  return { stage: "research", provider, action: plan.research, ran: true, ok: result.ok, detail: result.ok ? "research pass completed" : result.stderr };
}

function executeHandicapStage(runCommand: CommandRunner, live: boolean, gameId: string, provider: EvidenceModel, plan: ProviderPlan, researchOutcome: StageOutcome): StageOutcome {
  if (plan.handicap === "none") {
    return { stage: "handicap", provider, action: "none", ran: false, ok: true, detail: plan.handicapReason };
  }
  // Never let a failed research/bootstrap step for THIS provider cascade into an attempted
  // handicap run against a lineage that may not actually be in the state the plan assumed.
  if (researchOutcome.ran && !researchOutcome.ok) {
    return { stage: "handicap", provider, action: plan.handicap, ran: false, ok: false, detail: `skipped: upstream research/bootstrap step failed (${researchOutcome.detail})` };
  }
  if (!live) return { stage: "handicap", provider, action: plan.handicap, ran: false, ok: true, detail: `would run (dry-run): ${handicapScriptFor(provider)} --live --game=${gameId} --mode=${plan.handicap}` };
  const result = runScript(runCommand, handicapScriptFor(provider), ["--live", `--game=${gameId}`, `--mode=${plan.handicap}`]);
  return { stage: "handicap", provider, action: plan.handicap, ran: true, ok: result.ok, detail: result.ok ? "handicap pass completed" : result.stderr };
}

function writePresentation(root: string, gameId: string, season: number, week: number): string {
  const presentation = generatePresentationForGame(root, gameId, season, week);
  const outputPath = join(root, "public", nflAiHandicapArtifactPath(presentation.season, presentation.gameId));
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(presentation, null, 2)}\n`, "utf8");
  return outputPath;
}

function executePresentationStage(root: string, gamePlan: GamePlan, live: boolean, contextOk: boolean): StageOutcome {
  if (gamePlan.presentation === "skip") {
    return { stage: "presentation", action: "skip", ran: false, ok: true, detail: "no provider analysis exists or changed for this game" };
  }
  if (!contextOk) {
    return { stage: "presentation", action: "skip", ran: false, ok: false, detail: "context stage failed -- cannot resolve game identity/kickoff" };
  }
  if (!live) {
    return { stage: "presentation", action: "regenerate", ran: false, ok: true, detail: "would regenerate (dry-run)" };
  }
  try {
    const outputPath = writePresentation(root, gamePlan.gameId, gamePlan.season, gamePlan.week);
    return { stage: "presentation", action: "regenerate", ran: true, ok: true, detail: `wrote ${outputPath}` };
  } catch (err) {
    return { stage: "presentation", action: "regenerate", ran: true, ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Executes one game's plan. Never throws -- every stage failure is captured
 * as a structured StageOutcome, and one provider's failure never prevents
 * the other provider (or the presentation stage, for the provider that
 * succeeded) from completing. Pregame-safety/lock failures surface as
 * ordinary "blocked"/"none" no-ops (the plan already resolved them), never
 * as retried or weakened calls.
 */
export function executeGamePlan(gamePlan: GamePlan, options: ExecuteSlateOptions): GameExecutionResult {
  const runCommand = options.runCommand ?? spawnTsxCommandRunner(options.root);
  const failures: string[] = [];

  let context: StageOutcome;
  try {
    context = executeContextStage(options.root, gamePlan, options.now);
  } catch (err) {
    context = { stage: "context", action: gamePlan.context, ran: true, ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
  if (!context.ok) failures.push(`context: ${context.detail}`);

  const providers: ProviderExecutionResult[] = [];
  for (const provider of Object.keys(gamePlan.providers) as EvidenceModel[]) {
    const plan = gamePlan.providers[provider];
    let research: StageOutcome;
    let handicap: StageOutcome;
    try {
      if (!context.ok) {
        research = { stage: "research", provider, action: plan.research, ran: false, ok: false, detail: "skipped: context stage failed" };
      } else {
        research = executeResearchStage(runCommand, options.live, gamePlan.gameId, provider, plan);
      }
    } catch (err) {
      research = { stage: "research", provider, action: plan.research, ran: true, ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
    if (!research.ok) failures.push(`${provider} research: ${research.detail}`);

    try {
      if (!context.ok) {
        handicap = { stage: "handicap", provider, action: plan.handicap, ran: false, ok: false, detail: "skipped: context stage failed" };
      } else {
        handicap = executeHandicapStage(runCommand, options.live, gamePlan.gameId, provider, plan, research);
      }
    } catch (err) {
      handicap = { stage: "handicap", provider, action: plan.handicap, ran: true, ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
    if (!handicap.ok) failures.push(`${provider} handicap: ${handicap.detail}`);

    providers.push({ provider, research, handicap });
  }

  const presentation = executePresentationStage(options.root, gamePlan, options.live, context.ok);
  if (!presentation.ok) failures.push(`presentation: ${presentation.detail}`);

  // A game is "ok" overall iff context+presentation succeeded; a single provider's failure is
  // reported in `failures` but never marks the whole game (or the other provider) as failed --
  // that isolation is what lets the slate loop continue past it (see the CLI's per-game try/catch).
  const ok = context.ok && presentation.ok;

  return { gameId: gamePlan.gameId, ok, context, providers, presentation, failures };
}
