/**
 * AI Picks v2 automation -- failure ledger. A scheduled workflow re-plans every
 * run, so without a memory of failures a game whose model output fails
 * validation would be retried (and billed) on every single run. The ledger
 * records the LAST failed paid attempt per game/provider so the planner can
 * refuse to repeat it:
 *
 *   handicap: blocked while the inputs are byte-identical to the failed attempt
 *             (same action, football context, Stage A evidence, displayed line).
 *             A real input change -- or --retry-failed -- allows a new attempt.
 *   research: blocked for RESEARCH_RETRY_COOLDOWN_HOURS after a failed pass.
 *
 * Small JSON next to the provider's other analysis state; committed by the
 * workflow with the rest of the state (it contains only error text, no raw
 * provider output).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { EvidenceModel } from "./nfl-evidence-types";

export interface FailedHandicapAttempt {
  failedAt: string;
  action: string;
  /** Identifies the exact inputs of the failed attempt (see nfl-ai-v2-slate-plan.ts handicapInputKey). */
  inputKey: string;
  error: string;
}

export interface FailedResearchAttempt {
  failedAt: string;
  mode: string;
  error: string;
}

export interface V2AttemptLedger {
  handicap?: FailedHandicapAttempt;
  research?: FailedResearchAttempt;
}

const MAX_ERROR_CHARS = 500;

export function attemptLedgerPath(root: string, season: number, week: number, gameId: string, provider: EvidenceModel): string {
  return join(root, "data", "nfl", "analysis", String(season), String(week), gameId, provider, "v2-attempts.json");
}

export function readAttemptLedger(root: string, season: number, week: number, gameId: string, provider: EvidenceModel): V2AttemptLedger {
  const path = attemptLedgerPath(root, season, week, gameId, provider);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as V2AttemptLedger;
  } catch {
    return {};
  }
}

/** Replaces the ledger with `next` (immutably built by the caller). An empty ledger is still written, so a cleared failure is durable. */
export function writeAttemptLedger(root: string, season: number, week: number, gameId: string, provider: EvidenceModel, next: V2AttemptLedger): void {
  const path = attemptLedgerPath(root, season, week, gameId, provider);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

export function truncateError(error: string): string {
  const oneLine = error.replace(/\s+/g, " ").trim();
  return oneLine.length > MAX_ERROR_CHARS ? `${oneLine.slice(0, MAX_ERROR_CHARS)}...` : oneLine;
}
