/** Separate, explicitly approved, one-attempt zero-market NBA /events discovery. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROVIDER_ACCOUNTS } from "../src/lib/api-quota/accounts";
import { QuotaManager } from "../src/lib/api-quota/manager";
import { FileUsageStore } from "../src/lib/api-quota/store";
import { nbaAllowance } from "../src/lib/nba/props/pipeline/allowance";
import { quotaRequestGate } from "../src/lib/nba/props/pipeline/budget";
import { ODDS_SOURCE_LICENSES } from "../src/lib/nba/props/pipeline/oddsSources";
import { fileProbeClaim } from "../src/lib/nba/props/pipeline/probeClaim";
import { discoverNbaEventsOnce } from "../src/lib/nba/props/pipeline/theOddsApiNbaEvents";
import { accountWithOddsApproval, activationDir, DISCOVERY_SCOPE, ODDS_ACCOUNT_ID, readOddsApproval, recordCurrentOddsUsage } from "../src/lib/nba/props/pipeline/oddsActivation";

async function main(): Promise<void> {
  if (process.argv.length !== 3 || process.argv[2] !== "--discover-once") throw new Error("NBA discovery is inert without --discover-once");
  if (!ODDS_SOURCE_LICENSES["the-odds-api"].permittedUses.includes("private-research")) throw new Error("NBA Odds API license gate remains closed");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const dir = activationDir(root);
  const now = new Date();
  const approval = readOddsApproval(path.join(dir, "events-discovery-approval.json"), DISCOVERY_SCOPE, now);
  const accounts = accountWithOddsApproval(PROVIDER_ACCOUNTS, approval);
  const account = accounts.find((item) => item.accountId === ODDS_ACCOUNT_ID)!;
  const manager = new QuotaManager({ accounts, store: new FileUsageStore(dir) });
  await recordCurrentOddsUsage(manager, account, path.join(dir, "current-usage.json"), now);
  const result = await discoverNbaEventsOnce({ apiKey: process.env.THE_ODDS_API_KEY, approvalId: approval.id, gate: quotaRequestGate(manager, account.accountId, "events-discovery", nbaAllowance(now)), claim: fileProbeClaim(path.join(dir, "claims")) });
  console.log(JSON.stringify(result));
}

main().catch(() => { console.error("NBA discovery blocked or failed; no event odds were requested."); process.exitCode = 1; });
