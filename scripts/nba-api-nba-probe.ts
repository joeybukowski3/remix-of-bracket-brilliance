/**
 * Local-only API-NBA coverage probe (Phase 3C). See src/lib/nba/props/sources/apiNbaProbe.ts.
 *
 *   npx tsx scripts/nba-api-nba-probe.ts             # readiness check only: no network
 *   npx tsx scripts/nba-api-nba-probe.ts --execute   # live: at most 10 requests per approval
 *
 * Authorization comes only from the local approval file
 * data/nba/approvals/api-nba-probe-approval.json (create it with
 * scripts/nba-api-nba-probe-approval.ts); a missing, malformed, expired or
 * out-of-scope file blocks the run. Each approval id funds one run at most.
 *
 * Reads API_SPORTS_KEY from the process environment only (never from a file)
 * and never prints it. Raw bodies + provenance go to the gitignored
 * data/nba/sources/api-nba/probe/<UTC stamp>/; the quota ledger is the shared
 * local FileUsageStore at artifacts/api-quota/ (read by scripts/api-quota-report.ts).
 * Never run this in CI: the repository and its Actions logs are public.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PROVIDER_ACCOUNTS } from "../src/lib/api-quota/accounts";
import { QuotaManager } from "../src/lib/api-quota/manager";
import { FileUsageStore } from "../src/lib/api-quota/store";
import {
  API_NBA_PROBE_ACCOUNT_ID,
  API_NBA_PROBE_MAX_REQUESTS,
  API_NBA_PROBE_STEPS,
  approvalProblem,
  keyProblem,
  runApiNbaProbe,
} from "../src/lib/nba/props/sources/apiNbaProbe";
import { accountsWithProbeApproval, API_NBA_PROBE_APPROVAL_PATH, API_NBA_PROBE_CLAIMS_DIR, parseProbeApproval } from "../src/lib/nba/props/sources/apiNbaProbeApproval";

const LEDGER_DIR = "artifacts/api-quota";
const PROBE_ROOT = "data/nba/sources/api-nba/probe";

const out = (line: string) => process.stderr.write(`${line}\n`);

function isGitIgnored(target: string): boolean {
  try {
    execFileSync("git", ["check-ignore", "-q", target], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function readApprovalText(): Promise<string | null> {
  try {
    return await readFile(API_NBA_PROBE_APPROVAL_PATH, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Exclusive create: a second claim of the same approval id fails with EEXIST. */
async function claimApproval(approvalId: string, runId: string): Promise<void> {
  await mkdir(API_NBA_PROBE_CLAIMS_DIR, { recursive: true });
  const claim = { approvalId, runId, claimedAt: new Date().toISOString() };
  await writeFile(path.join(API_NBA_PROBE_CLAIMS_DIR, `${approvalId}.json`), `${JSON.stringify(claim, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
}

async function main(): Promise<void> {
  const execute = process.argv.includes("--execute");
  const apiKey = process.env.API_SPORTS_KEY;
  const approvalResult = parseProbeApproval(await readApprovalText(), Date.now());
  const accounts = "approval" in approvalResult ? accountsWithProbeApproval(PROVIDER_ACCOUNTS, approvalResult.approval) : PROVIDER_ACCOUNTS;
  const manager = new QuotaManager({ accounts, store: new FileUsageStore(path.resolve(LEDGER_DIR)) });
  const account = manager.account(API_NBA_PROBE_ACCOUNT_ID);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(PROBE_ROOT, stamp);

  const runId = `api-nba-probe-${stamp}-${randomUUID().slice(0, 8)}`;
  const claimPath = "approval" in approvalResult ? path.join(API_NBA_PROBE_CLAIMS_DIR, `${approvalResult.approval.id}.json`) : null;
  const problems = [
    keyProblem(apiKey),
    "error" in approvalResult ? approvalResult.error : null,
    claimPath && (await readFile(claimPath).then(() => true, () => false)) ? `approval ${path.basename(claimPath, ".json")} was already used by an earlier run` : null,
    "approval" in approvalResult ? approvalProblem(account.liveApproval, Date.now(), API_NBA_PROBE_STEPS.length) : null,
    isGitIgnored(path.join(runDir, "probe.body.json")) ? null : `${PROBE_ROOT} is not gitignored`,
    isGitIgnored(path.join(LEDGER_DIR, "ledger.json")) ? null : `${LEDGER_DIR} is not gitignored`,
    isGitIgnored(API_NBA_PROBE_APPROVAL_PATH) && isGitIgnored(path.join(API_NBA_PROBE_CLAIMS_DIR, "claim.json")) ? null : "approval paths are not gitignored",
  ].filter((p): p is string => p !== null);

  out(`API-NBA coverage probe (${execute ? "EXECUTE" : "readiness check, no network"})`);
  out(`  account: ${account.accountId} (plan ${account.planStatus}); request cap ${API_NBA_PROBE_MAX_REQUESTS}`);
  out(`  API_SPORTS_KEY: ${keyProblem(apiKey) ? "MISSING/INVALID" : "present (value not shown)"}`);
  out(`  approval file: ${API_NBA_PROBE_APPROVAL_PATH} (${"approval" in approvalResult ? "valid" : "BLOCKED"})`);
  out(`  liveApproval: ${account.liveApproval ? `${account.liveApproval.id}, maxUnits ${account.liveApproval.maxUnits}, expires ${account.liveApproval.expiresAt}` : "none"}`);
  out(`  output: ${runDir}/   ledger: ${LEDGER_DIR}/`);
  API_NBA_PROBE_STEPS.forEach((step, i) => out(`  ${String(i + 1).padStart(2)}. ${step.id.padEnd(26)} GET ${step.path}`));
  for (const problem of problems) out(`  BLOCKED: ${problem}`);

  if (!execute) {
    out(problems.length === 0 ? "READY: rerun with --execute to spend up to 10 requests." : "NOT READY: no request was made.");
    process.exitCode = problems.length === 0 ? 0 : 2;
    return;
  }
  if (problems.length > 0) {
    out("Refusing to execute; no request was made.");
    process.exitCode = 2;
    return;
  }

  await mkdir(runDir, { recursive: true });
  const result = await runApiNbaProbe({
    manager,
    apiKey: apiKey!,
    fetchImpl: (url, init) => fetch(url, init),
    writer: (name, text) => writeFile(path.join(runDir, path.basename(name)), text, { encoding: "utf8", flag: "wx" }),
    log: out,
    claimApproval: (approvalId) => claimApproval(approvalId, runId),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => new Date(),
    runId,
  });
  out(`Result: ${result.status}; ${result.requestsAttempted} request(s) attempted; artifacts in ${runDir}/`);
  if (result.analysis) out(`Quota: ${result.analysis.quota.interpretation}`);
  out("Next: npx tsx scripts/api-quota-report.ts --reconcile-orphans");
  process.exitCode = result.status === "completed" ? 0 : 1;
}

main().catch((error: unknown) => {
  // Error names only: messages from fetch internals could echo request details.
  out(`nba-api-nba-probe failed: ${error instanceof Error ? error.name : "error"}`);
  process.exitCode = 1;
});
