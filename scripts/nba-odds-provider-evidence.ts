/** Offline dashboard-metadata intake. Never reads a credential or changes the quota registry. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseIncompleteProviderEvidence, parsePendingProviderEvidence } from "../src/lib/nba/props/pipeline/providerEvidence";
import { verifiedEvidenceSnapshot } from "../src/lib/nba/props/pipeline/providerEvidence";
import { PROVIDER_ACCOUNTS } from "../src/lib/api-quota/accounts";
import { QuotaManager } from "../src/lib/api-quota/manager";
import { FileUsageStore } from "../src/lib/api-quota/store";
import { appendPendingDashboardEvidence } from "./lib/nba-provider-evidence-intake";

async function main(): Promise<void> {
  const file = process.argv.find((arg) => arg.startsWith("--file="))?.slice("--file=".length);
  const record = process.argv.includes("--record-verified");
  if (!file || process.argv.length !== (record ? 4 : 3)) throw new Error("usage: nba-odds-provider-evidence --file=<dashboard-metadata.json> [--record-verified]");
  const input: unknown = JSON.parse(readFileSync(path.resolve(file), "utf8"));
  const dateOnly = typeof input === "object" && input !== null && "observedDate" in input;
  const evidence = dateOnly ? parseIncompleteProviderEvidence(input, new Date()) : parsePendingProviderEvidence(input, new Date());
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const dir = path.join(root, "data", "nba", "quota-probe");
  let snapshot: ReturnType<typeof verifiedEvidenceSnapshot> | null = null;
  if (record) {
    if (dateOnly) throw new Error("a date-only dashboard reading cannot be recorded as verified usage");
    const account = PROVIDER_ACCOUNTS.find((item) => item.accountId === "the-odds-api:unverified-pool");
    if (!account) throw new Error("Odds API quota account unavailable");
    snapshot = verifiedEvidenceSnapshot(account, evidence as ReturnType<typeof parsePendingProviderEvidence>);
  }
  appendPendingDashboardEvidence(path.join(dir, "pending-dashboard-evidence.jsonl"), input, new Date());
  if (snapshot) {
    const manager = new QuotaManager({ accounts: PROVIDER_ACCOUNTS, store: new FileUsageStore(dir) });
    await manager.recordProviderUsage("the-odds-api:unverified-pool", [snapshot]);
  }
  console.log(snapshot ? "Verified dashboard usage recorded in the quota ledger; license and live approval remain unchanged." : "Dashboard metadata stored as pending evidence; account identity, quota ledger, license and live approval remain unchanged.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  console.error(/^(usage:|incomplete provider evidence|provider observation|provider evidence|a date-only dashboard|provider account identity)/.test(message) ? message : "Dashboard metadata rejected; no credential or input content was logged.");
  process.exitCode = 1;
});
