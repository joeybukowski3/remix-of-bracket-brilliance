/**
 * Decision logic for the Vercel-cron backup of the MLB morning refresh.
 *
 * GitHub scheduled workflows for this repo are routinely delivered hours late
 * or dropped (Sep 23 2026: "Generate MLB Data" 3:23 AM ET never fired, 7:47 AM
 * fired at 8:47; "Generate MLB Power Rankings" 4:15 AM fired ~9:36). Vercel cron
 * is an independent scheduler, so this module lets it *backstop* those
 * workflows without ever duplicating them:
 *
 *   slate has games? -> artifact stale for today's ET slate? -> generator
 *   already queued/in progress? -> only then dispatch, exactly once.
 *
 * Freshness deliberately reuses scripts/lib/mlb-data-freshness.mjs (the same
 * definition mlb-data-watchdog.yml and mlb-x-canonical.yml use) and the slate
 * helpers in scripts/lib/mlb-slate-gate.mjs. All I/O is injected so the logic is
 * unit-testable without network access.
 *
 * Scheduling (Vercel Hobby): one daily run at 08:17 UTC (4:17 AM EDT). It does
 * not replace GitHub's intraday odds/lineup/pregame refreshes.
 */

import {
  DEFAULT_ARTIFACTS,
  aggregateFreshness,
  evaluateArtifact,
} from "../../scripts/lib/mlb-data-freshness.mjs";
import { inspectMlbSlate, resolveEasternSlateDate } from "../../scripts/lib/mlb-slate-gate.mjs";

export const POWER_RANKINGS_ARTIFACT = "public/data/mlb/power-rankings.json";
/** The 4:15 AM ET schedule is the intent; don't dispatch before its data can exist. */
export const POWER_RANKINGS_EARLIEST_ET_HOUR = 4;

export type SlateAnswer = "true" | "false" | "unknown";

export type BackupAction =
  | "noop-no-games"
  | "noop-current"
  | "noop-generator-active"
  | "noop-too-early"
  | "dispatched";

export interface TargetReport {
  workflow: string;
  action: BackupAction;
  freshness: string;
  artifactDate: string | null;
  generatorActive: boolean;
  generatorDispatched: boolean;
}

export interface BackupReport {
  ok: true;
  timestamp: string;
  slateDate: string;
  hasGames: SlateAnswer;
  targets: { mlbData: TargetReport; powerRankings: TargetReport };
}

export interface BackupDeps {
  now: Date;
  fetchSlate: (now: Date) => Promise<{ hasGames: SlateAnswer; slateDate: string }>;
  /** Text of a repo file on `main`, or null when it does not exist. */
  readArtifact: (repoPath: string) => Promise<string | null>;
  /** Number of queued + in_progress runs of a workflow on main. */
  countActiveRuns: (workflow: string) => Promise<number>;
  /** created_at timestamps of recent successful runs of a workflow on main. */
  recentSuccessfulRunTimes: (workflow: string) => Promise<string[]>;
  dispatch: (workflow: string) => Promise<void>;
}

export interface BackupConfig {
  mlbDataWorkflow: string;
  powerRankingsWorkflow: string;
}

const noopReport = (workflow: string, action: BackupAction, freshness: string, artifactDate: string | null): TargetReport => ({
  workflow,
  action,
  freshness,
  artifactDate,
  generatorActive: action === "noop-generator-active",
  generatorDispatched: false,
});

/** Queue-guarded dispatch shared by both targets. */
async function dispatchIfIdle(
  deps: BackupDeps,
  workflow: string,
  freshness: string,
  artifactDate: string | null,
): Promise<TargetReport> {
  if ((await deps.countActiveRuns(workflow)) > 0) {
    return noopReport(workflow, "noop-generator-active", freshness, artifactDate);
  }
  await deps.dispatch(workflow);
  return { ...noopReport(workflow, "dispatched", freshness, artifactDate), generatorDispatched: true };
}

async function backupMlbData(
  deps: BackupDeps,
  workflow: string,
  slateDate: string,
  hasGames: SlateAnswer,
): Promise<TargetReport> {
  // "unknown" (schedule API down) still proceeds: the generator re-checks the
  // slate itself and no-ops on an off day, so a spurious dispatch is harmless
  // while a skipped one could leave the page stale.
  if (hasGames === "false") return noopReport(workflow, "noop-no-games", "not-checked", null);

  const evaluations = await Promise.all(
    DEFAULT_ARTIFACTS.map(async (artifact) => {
      const text = await deps.readArtifact(artifact.file);
      return evaluateArtifact({
        label: artifact.label,
        required: artifact.required,
        present: text != null,
        text,
        expectedDate: slateDate,
      });
    }),
  );
  const verdict = aggregateFreshness(slateDate, evaluations);
  const artifacts = verdict.artifacts as Record<string, { artifactDate: string | null } | undefined>;
  const artifactDate = artifacts.hrProps?.artifactDate ?? null;

  if (verdict.status === "current") return noopReport(workflow, "noop-current", verdict.status, artifactDate);
  return dispatchIfIdle(deps, workflow, verdict.status, artifactDate);
}

function easternHour(now: Date): number {
  const hour = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(now)
    .find((part) => part.type === "hour")?.value;
  return Number(hour);
}

async function backupPowerRankings(deps: BackupDeps, workflow: string, slateDate: string): Promise<TargetReport> {
  if (easternHour(deps.now) < POWER_RANKINGS_EARLIEST_ET_HOUR) {
    return noopReport(workflow, "noop-too-early", "not-checked", null);
  }

  const text = await deps.readArtifact(POWER_RANKINGS_ARTIFACT);
  const generatedAt = readGeneratedAt(text);
  const artifactDate = generatedAt ? resolveEasternSlateDate(generatedAt) : null;
  if (artifactDate === slateDate) return noopReport(workflow, "noop-current", "current", artifactDate);

  // The generator leaves the file (and its generatedAt) untouched when nothing
  // changed, so a *successful run today* also counts as current. Without this a
  // no-change day would re-dispatch on every tick.
  const runTimes = await deps.recentSuccessfulRunTimes(workflow);
  const ranToday = runTimes.some((createdAt) => {
    const created = new Date(createdAt);
    return !Number.isNaN(created.getTime()) && resolveEasternSlateDate(created) === slateDate;
  });
  if (ranToday) return noopReport(workflow, "noop-current", "current-no-change", artifactDate);

  return dispatchIfIdle(deps, workflow, artifactDate ? "stale" : "missing", artifactDate);
}

function readGeneratedAt(text: string | null): Date | null {
  if (text == null) return null;
  try {
    const parsed = JSON.parse(text) as { generatedAt?: unknown };
    if (typeof parsed?.generatedAt !== "string") return null;
    const date = new Date(parsed.generatedAt);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

export async function runRefreshBackup(deps: BackupDeps, config: BackupConfig): Promise<BackupReport> {
  const { hasGames, slateDate } = await deps.fetchSlate(deps.now);

  // Sequential on purpose: keeps GitHub API usage and dispatch ordering predictable.
  const mlbData = await backupMlbData(deps, config.mlbDataWorkflow, slateDate, hasGames);
  const powerRankings = await backupPowerRankings(deps, config.powerRankingsWorkflow, slateDate);

  return { ok: true, timestamp: deps.now.toISOString(), slateDate, hasGames, targets: { mlbData, powerRankings } };
}

/** Real slate lookup; never throws — an unreachable schedule reports "unknown". */
export async function fetchSlateFromMlbApi(now: Date): Promise<{ hasGames: SlateAnswer; slateDate: string }> {
  const result = await inspectMlbSlate({ now });
  return { hasGames: result.hasGames as SlateAnswer, slateDate: resolveEasternSlateDate(now) };
}

// ── Request gate (auth + configuration), pure so it can be tested ────────────

/** Structural subset of process.env; every key is optional. */
export type BackupEnv = Readonly<Record<string, string | undefined>>;

export type GateResult =
  | { ok: true; owner: string; repo: string; token: string; config: BackupConfig }
  | { ok: false; status: 401 | 500; error: string };

const SAFE_IDENTIFIER = /^[A-Za-z0-9._-]+$/;

function constantTimeEqual(a: string, b: string): boolean {
  // Length is not secret (Vercel sends `Bearer <CRON_SECRET>`); compare bytes without early exit.
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Fails closed in every environment: a missing CRON_SECRET is a 500
 * misconfiguration, never an open endpoint. Vercel automatically sends
 * `Authorization: Bearer $CRON_SECRET` to cron invocations when that env var is set.
 */
export function gateRequest(env: BackupEnv, authorizationHeader: string | null): GateResult {
  if (!env.CRON_SECRET) return { ok: false, status: 500, error: "CRON_SECRET not configured" };
  if (!authorizationHeader || !constantTimeEqual(authorizationHeader, `Bearer ${env.CRON_SECRET}`)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  if (!env.GH_DISPATCH_TOKEN) return { ok: false, status: 500, error: "GH_DISPATCH_TOKEN not configured" };

  const owner = env.GH_REPO_OWNER || "joeybukowski3";
  const repo = env.GH_REPO_NAME || "remix-of-bracket-brilliance";
  const config: BackupConfig = {
    mlbDataWorkflow: env.GH_WORKFLOW_ID || "generate-mlb-hr-props.yml",
    powerRankingsWorkflow: env.GH_POWER_RANKINGS_WORKFLOW_ID || "generate-mlb-power-rankings.yml",
  };
  const unsafe = [owner, repo, config.mlbDataWorkflow, config.powerRankingsWorkflow].some((v) => !SAFE_IDENTIFIER.test(v));
  if (unsafe) return { ok: false, status: 500, error: "Invalid repository/workflow configuration" };

  return { ok: true, owner, repo, token: env.GH_DISPATCH_TOKEN, config };
}
