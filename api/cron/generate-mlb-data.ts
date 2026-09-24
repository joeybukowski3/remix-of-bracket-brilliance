/**
 * Vercel cron backup for the MLB morning refresh (registered in vercel.json).
 *
 * GitHub scheduled workflows are delivered hours late or dropped, so this
 * independent scheduler checks — idempotently — whether today's ET-slate MLB
 * artifacts and power rankings are current and dispatches the generator
 * workflows on `main` only when they are stale AND not already queued/running.
 * See api/_lib/mlb-refresh-backup.ts for the decision logic.
 *
 * Vercel Hobby allows only daily crons, so this runs ONCE at 08:17 UTC
 * (4:17 AM EDT). It is an early-morning safety net, NOT an intraday refresh:
 * GitHub Actions schedules still own later odds, lineup, and pregame updates.
 * Guarantee: today's MLB slate and Power Rankings get an independent early
 * recovery trigger even if GitHub's overnight schedules are delayed or dropped.
 *
 * Required env vars (Vercel dashboard):
 *   CRON_SECRET          — Vercel sends it as `Authorization: Bearer <secret>`
 *   GH_DISPATCH_TOKEN    — GitHub token with actions:write + contents:read
 * Optional: GH_REPO_OWNER, GH_REPO_NAME, GH_WORKFLOW_ID, GH_POWER_RANKINGS_WORKFLOW_ID
 *
 * Responses: 200 report (including no-ops), 401 bad auth, 500 missing/invalid
 * config, 502 GitHub/API failure. Never returns or logs secrets.
 */

import {
  fetchSlateFromMlbApi,
  gateRequest,
  runRefreshBackup,
  type BackupDeps,
} from "../_lib/mlb-refresh-backup";
import {
  GithubApiError,
  countActiveRuns,
  dispatchWorkflow,
  readRepoFile,
  recentSuccessfulRunTimes,
} from "../_lib/github-actions";

export async function GET(request: Request) {
  const gate = gateRequest(process.env, request.headers.get("authorization"));
  if (gate.ok === false) {
    if (gate.status === 500) console.error(`[generate-mlb-data cron] ${gate.error}`);
    return Response.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const gh = { owner: gate.owner, repo: gate.repo, token: gate.token };
  const deps: BackupDeps = {
    now: new Date(),
    fetchSlate: fetchSlateFromMlbApi,
    readArtifact: (path) => readRepoFile(gh, path),
    countActiveRuns: (workflow) => countActiveRuns(gh, workflow),
    recentSuccessfulRunTimes: (workflow) => recentSuccessfulRunTimes(gh, workflow),
    dispatch: (workflow) => dispatchWorkflow(gh, workflow),
  };

  try {
    const report = await runRefreshBackup(deps, gate.config);
    console.log(`[generate-mlb-data cron] ${JSON.stringify(report)}`);
    return Response.json(report);
  } catch (error) {
    const detail = error instanceof GithubApiError ? error.message : "Unexpected error";
    console.error(`[generate-mlb-data cron] failed: ${detail}`);
    return Response.json({ ok: false, error: detail, timestamp: new Date().toISOString() }, { status: 502 });
  }
}
