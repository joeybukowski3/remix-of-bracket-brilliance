/**
 * Admin-only quota report (local file ledger). Never makes provider requests
 * and never reads credential values.
 *
 *   npx tsx scripts/api-quota-report.ts [--dir=artifacts/api-quota] [--json] [--reconcile-orphans]
 *
 * --reconcile-orphans settles reservations older than each account's TTL as
 * "orphaned", charged at their estimate (never refunded), before reporting.
 */
import path from "node:path";
import { PROVIDER_ACCOUNTS } from "../src/lib/api-quota/accounts";
import { QuotaManager } from "../src/lib/api-quota/manager";
import { buildAccountReport, formatReport } from "../src/lib/api-quota/report";
import { FileUsageStore } from "../src/lib/api-quota/store";

const DEFAULT_DIR = "artifacts/api-quota";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dirArg = args.find((a) => a.startsWith("--dir="))?.slice("--dir=".length);
  const store = new FileUsageStore(path.resolve(dirArg ?? DEFAULT_DIR));
  const manager = new QuotaManager({ accounts: PROVIDER_ACCOUNTS, store });
  if (args.includes("--reconcile-orphans")) {
    for (const account of PROVIDER_ACCOUNTS) {
      const { orphaned, unitsCharged } = await manager.reconcileOrphans(account.accountId);
      if (orphaned > 0) process.stderr.write(`${account.accountId}: ${orphaned} orphaned reservation(s) settled at ${unitsCharged} unit(s)\n`);
    }
  }
  const nowMs = Date.now();
  const reports = await Promise.all(PROVIDER_ACCOUNTS.map(async (account) => buildAccountReport(account, await store.read(account.accountId), nowMs)));
  process.stdout.write(args.includes("--json") ? `${JSON.stringify(reports, null, 2)}\n` : `${formatReport(reports)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`api-quota-report failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
